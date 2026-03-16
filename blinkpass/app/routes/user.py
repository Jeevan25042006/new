"""User profile, session management and recovery endpoints."""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.security import (
    generate_recovery_codes,
    get_current_user,
    hash_recovery_code,
    verify_recovery_code,
)
from app.core.vault import decrypt_field, encrypt_field
from app.services.session_service import create_session, log_audit_event
from app.storage.database import get_db
from app.storage.models import (
    AuditLog,
    AuthorizationCode,
    OAuthClient,
    RecoveryCode,
    Session as SessionModel,
    User,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/user", tags=["user"])


class UpdateProfile(BaseModel):
    display_name: str | None = None


class RecoveryVerifyRequest(BaseModel):
    code: str
    identifier: str  # email or phone to find user


# ---------------------------------------------------------------------------
# Profile
# ---------------------------------------------------------------------------

@router.get("/me")
def get_me(current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == current_user["user_id"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "id": user.id,
        "email": decrypt_field(user.email_encrypted) if user.email_encrypted else None,
        "phone": decrypt_field(user.phone_encrypted) if user.phone_encrypted else None,
        "display_name": user.display_name,
        "avatar_url": user.avatar_url,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "did": user.did,
    }


@router.put("/me")
def update_me(
    body: UpdateProfile,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == current_user["user_id"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if body.display_name is not None:
        user.display_name = body.display_name
    db.add(user)
    db.commit()
    return {"message": "Profile updated"}


# ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------

@router.get("/sessions")
def list_sessions(current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    sessions = (
        db.query(SessionModel)
        .filter(
            SessionModel.user_id == current_user["user_id"],
            SessionModel.is_active == True,
        )
        .all()
    )
    return [
        {
            "id": s.id,
            "auth_method": s.auth_method,
            "ip_address": s.ip_address,
            "user_agent": s.user_agent,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "last_used": s.last_used.isoformat() if s.last_used else None,
        }
        for s in sessions
    ]


@router.delete("/sessions/{session_id}")
def revoke_session(
    session_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = (
        db.query(SessionModel)
        .filter(
            SessionModel.id == session_id,
            SessionModel.user_id == current_user["user_id"],
        )
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session.is_active = False
    db.add(session)
    db.commit()
    return {"message": "Session revoked"}


# ---------------------------------------------------------------------------
# Authorized OAuth apps
# ---------------------------------------------------------------------------

@router.get("/authorized-apps")
def list_authorized_apps(
    current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)
):
    """List OAuth clients that this user has authorized (has active sessions for)."""
    client_ids = (
        db.query(SessionModel.auth_method)
        .filter(
            SessionModel.user_id == current_user["user_id"],
            SessionModel.auth_method == "oauth2",
            SessionModel.is_active == True,
        )
        .distinct()
        .all()
    )
    return {"authorized_apps": [c[0] for c in client_ids]}


@router.delete("/authorized-apps/{client_id}")
def revoke_app_access(
    client_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Revoke all OAuth sessions for a given client."""
    db.query(SessionModel).filter(
        SessionModel.user_id == current_user["user_id"],
        SessionModel.auth_method == "oauth2",
    ).update({"is_active": False})
    db.commit()
    return {"message": f"Access revoked for {client_id}"}


# ---------------------------------------------------------------------------
# Recovery codes
# ---------------------------------------------------------------------------

@router.post("/recovery/verify")
def verify_recovery(
    body: RecoveryVerifyRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Verify a recovery code and issue a new session."""
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")

    # Find user by email or phone
    all_users = db.query(User).all()
    user = next(
        (
            u
            for u in all_users
            if (u.email_encrypted and decrypt_field(u.email_encrypted) == body.identifier)
            or (u.phone_encrypted and decrypt_field(u.phone_encrypted) == body.identifier)
        ),
        None,
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Find a valid unused recovery code
    recovery_codes = (
        db.query(RecoveryCode)
        .filter(RecoveryCode.user_id == user.id, RecoveryCode.used == False)
        .all()
    )
    matched = next(
        (rc for rc in recovery_codes if verify_recovery_code(body.code, rc.code_hash)), None
    )
    if not matched:
        log_audit_event("recovery_verify", "failure", user.id, ip, ua, "recovery", db)
        raise HTTPException(status_code=400, detail="Invalid or already-used recovery code")

    matched.used = True
    db.add(matched)
    db.commit()

    access_token, refresh_token, session_id = create_session(user.id, ip, ua, "recovery", db)
    log_audit_event("recovery_verify", "success", user.id, ip, ua, "recovery", db)

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "session_id": session_id,
    }


@router.post("/recovery/generate")
async def generate_recovery(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generate (or regenerate) recovery codes for the authenticated user."""
    user = db.query(User).filter(User.id == current_user["user_id"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Invalidate old codes
    db.query(RecoveryCode).filter(RecoveryCode.user_id == user.id).update({"used": True})
    db.commit()

    codes = generate_recovery_codes(8)
    for code in codes:
        rc = RecoveryCode(user_id=user.id, code_hash=hash_recovery_code(code))
        db.add(rc)
    db.commit()

    # Email codes if user has an email on file
    if user.email_encrypted:
        email = decrypt_field(user.email_encrypted)
        if email:
            from app.services.email_service import send_recovery_codes
            try:
                await send_recovery_codes(email, codes)
            except Exception:
                pass  # Non-fatal — codes are still returned in the response

    return {"recovery_codes": codes, "message": "Store these safely — they will not be shown again."}


# ---------------------------------------------------------------------------
# Audit log
# ---------------------------------------------------------------------------

@router.get("/audit-log")
def get_audit_log(
    current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)
):
    logs = (
        db.query(AuditLog)
        .filter(AuditLog.user_id == current_user["user_id"])
        .order_by(AuditLog.created_at.desc())
        .limit(100)
        .all()
    )
    return [
        {
            "id": entry.id,
            "event_type": entry.event_type,
            "auth_method": entry.auth_method,
            "ip_address": entry.ip_address,
            "outcome": entry.outcome,
            "details": entry.details,
            "created_at": entry.created_at.isoformat() if entry.created_at else None,
        }
        for entry in logs
    ]
