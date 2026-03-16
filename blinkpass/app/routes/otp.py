"""OTP (one-time password) authentication routes."""
import hashlib
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from passlib.hash import argon2
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import otp_limiter
from app.core.vault import decrypt_field, encrypt_field
from app.services.otp_service import generate_otp, send_sms_otp
from app.services.session_service import create_session, log_audit_event
from app.storage.database import get_db
from app.storage.models import OTPCode, User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth/otp", tags=["otp"])

_MAX_OTP_ATTEMPTS = 5


def _hash_phone(phone: str) -> str:
    """SHA-256 hash of phone number for indexed lookup (not PII-sensitive)."""
    return hashlib.sha256(phone.encode()).hexdigest()


class OTPRequest(BaseModel):
    phone: str


class OTPVerify(BaseModel):
    phone: str
    code: str


@router.post("/request")
def request_otp(body: OTPRequest, request: Request, db: Session = Depends(get_db)):
    """Generate and send a 6-digit OTP to the given phone number."""
    ip = request.client.host if request.client else "unknown"
    otp_limiter.check(ip)

    phone = body.phone.strip()
    phone_hash = _hash_phone(phone)

    # Find or create user by phone hash
    all_users = db.query(User).filter(User.phone_encrypted.isnot(None)).all()
    matched_user = next(
        (u for u in all_users if decrypt_field(u.phone_encrypted) == phone), None
    )
    if matched_user is None:
        matched_user = User(phone_encrypted=encrypt_field(phone))
        db.add(matched_user)
        db.commit()
        db.refresh(matched_user)

    # Invalidate previous unused codes for this phone
    db.query(OTPCode).filter(
        OTPCode.phone_hash == phone_hash,
        OTPCode.used == False,
    ).update({"used": True})
    db.commit()

    otp = generate_otp()
    code_hash = argon2.hash(otp)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.OTP_EXPIRE_MINUTES)

    otp_record = OTPCode(
        user_id=matched_user.id,
        phone_hash=phone_hash,
        code_hash=code_hash,
        expires_at=expires_at,
    )
    db.add(otp_record)
    db.commit()

    send_sms_otp(phone, otp)
    log_audit_event("otp_request", "success", matched_user.id, ip, request.headers.get("user-agent"), "otp", db)

    # In dev mode expose the OTP for easier testing
    response: dict = {"message": "OTP sent"}
    if settings.SMTP_HOST in ("localhost", "127.0.0.1", ""):
        response["otp"] = otp  # dev convenience

    return response


@router.post("/verify")
def verify_otp(body: OTPVerify, request: Request, db: Session = Depends(get_db)):
    """Verify an OTP code and return session tokens."""
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")

    phone = body.phone.strip()
    phone_hash = _hash_phone(phone)

    # Find the latest unused, non-expired code for this phone
    now = datetime.now(timezone.utc)
    otp_record = (
        db.query(OTPCode)
        .filter(
            OTPCode.phone_hash == phone_hash,
            OTPCode.used == False,
        )
        .order_by(OTPCode.created_at.desc())
        .first()
    )

    if not otp_record:
        raise HTTPException(status_code=400, detail="No active OTP found. Please request a new one.")

    expires = otp_record.expires_at if otp_record.expires_at.tzinfo else otp_record.expires_at.replace(tzinfo=timezone.utc)
    if now > expires:
        raise HTTPException(status_code=400, detail="OTP has expired. Please request a new one.")

    if otp_record.attempts >= _MAX_OTP_ATTEMPTS:
        raise HTTPException(status_code=400, detail="Too many failed attempts. Please request a new OTP.")

    try:
        valid = argon2.verify(body.code, otp_record.code_hash)
    except Exception:
        valid = False

    if not valid:
        otp_record.attempts += 1
        db.add(otp_record)
        db.commit()
        log_audit_event("otp_verify", "failure", otp_record.user_id, ip, ua, "otp", db)
        raise HTTPException(status_code=400, detail="Invalid OTP code.")

    otp_record.used = True
    db.add(otp_record)
    db.commit()

    user = db.query(User).filter(User.id == otp_record.user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=404, detail="User not found")

    access_token, refresh_token, session_id = create_session(user.id, ip, ua, "otp", db)
    log_audit_event("otp_verify", "success", user.id, ip, ua, "otp", db)

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "session_id": session_id,
    }
