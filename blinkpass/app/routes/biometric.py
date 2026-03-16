"""WebAuthn biometric authentication routes."""
import base64
import logging
import secrets
import time
import uuid
from typing import Any

import webauthn
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from app.core.config import settings
from app.core.security import get_current_user
from app.core.vault import decrypt_field, encrypt_field
from app.services.session_service import create_session, log_audit_event
from app.storage.database import get_db
from app.storage.models import User, WebAuthnCredential

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth/biometric", tags=["biometric"])

# In-memory challenge store: {challenge_b64: (user_id_or_None, expires_at)}
_challenges: dict[str, tuple[str | None, float]] = {}
_CHALLENGE_TTL = 300  # 5 minutes


def _store_challenge(challenge: bytes, user_id: str | None) -> str:
    """Store a challenge and return its base64 key."""
    _purge_expired()
    key = base64.b64encode(challenge).decode()
    _challenges[key] = (user_id, time.time() + _CHALLENGE_TTL)
    return key


_CHALLENGE_NOT_FOUND = object()  # sentinel for missing/expired challenge


def _consume_challenge(challenge_b64: str):
    """Return the user_id (str) associated with a challenge and remove it (single-use).

    Returns the sentinel _CHALLENGE_NOT_FOUND if the challenge is missing or expired.
    The user_id itself may be None for new-user registration flows.
    """
    _purge_expired()
    entry = _challenges.pop(challenge_b64, None)
    if entry is None:
        return _CHALLENGE_NOT_FOUND
    user_id, expires_at = entry
    if time.time() > expires_at:
        return _CHALLENGE_NOT_FOUND
    return user_id  # str | None for new-user flows


def _purge_expired() -> None:
    now = time.time()
    expired = [k for k, (_, exp) in _challenges.items() if now > exp]
    for k in expired:
        del _challenges[k]


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class RegisterOptionsRequest(BaseModel):
    email: str
    device_name: str = "Security Key"


class RegisterVerifyRequest(BaseModel):
    email: str
    device_name: str = "Security Key"
    credential: dict


class AuthOptionsRequest(BaseModel):
    email: str


class AuthVerifyRequest(BaseModel):
    credential: dict


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/register/options")
def registration_options(body: RegisterOptionsRequest, db: Session = Depends(get_db)):
    """Generate WebAuthn registration challenge."""
    # Find or pre-create a user stub so we have a user_id for the challenge
    from app.core.vault import encrypt_field
    users = db.query(User).all()
    user = next(
        (u for u in users if decrypt_field(u.email_encrypted) == body.email.lower()), None
    )
    if user is None:
        user = User(email_encrypted=encrypt_field(body.email.lower()))
        db.add(user)
        db.commit()
        db.refresh(user)

    existing_creds = [
        PublicKeyCredentialDescriptor(id=c.credential_id)
        for c in user.webauthn_credentials
    ]

    options = generate_registration_options(
        rp_id=settings.RP_ID,
        rp_name=settings.RP_NAME,
        user_id=user.id.encode(),
        user_name=body.email.lower(),
        user_display_name=user.display_name or body.email.split("@")[0],
        exclude_credentials=existing_creds,
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.PREFERRED,
            user_verification=UserVerificationRequirement.PREFERRED,
        ),
    )

    _store_challenge(options.challenge, user.id)

    import webauthn.helpers.cbor2 as _  # ensure cbor2 available
    from webauthn.helpers import options_to_json
    return options_to_json(options)


@router.post("/register/verify")
def registration_verify(
    body: RegisterVerifyRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Verify WebAuthn registration and persist the credential."""
    from webauthn.helpers import base64url_to_bytes

    # Locate user
    users = db.query(User).all()
    user = next(
        (u for u in users if decrypt_field(u.email_encrypted) == body.email.lower()), None
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found; call /register/options first")

    raw_cred = body.credential
    client_data_b64 = raw_cred.get("response", {}).get("clientDataJSON", "")
    import base64 as _b64
    import json as _json
    client_data = _json.loads(_b64.b64decode(client_data_b64 + "==").decode())
    challenge_b64_url = client_data.get("challenge", "")
    # Normalise to standard base64 for our store key
    challenge_std = base64.b64encode(base64url_to_bytes(challenge_b64_url)).decode()

    uid = _consume_challenge(challenge_std)
    if uid is _CHALLENGE_NOT_FOUND:
        raise HTTPException(status_code=400, detail="Invalid or expired challenge")

    try:
        from webauthn.helpers.structs import RegistrationCredential
        from webauthn.helpers import parse_cbor

        verification = verify_registration_response(
            credential=raw_cred,
            expected_rp_id=settings.RP_ID,
            expected_origin=f"http://{settings.RP_ID}" if settings.RP_ID == "localhost" else f"https://{settings.RP_ID}",
            expected_challenge=base64url_to_bytes(challenge_b64_url),
        )
    except Exception as exc:
        log_audit_event("biometric_register", "failure", user.id, request.client.host if request.client else None, request.headers.get("user-agent"), "webauthn", db, str(exc))
        raise HTTPException(status_code=400, detail=f"Registration verification failed: {exc}")

    cred = WebAuthnCredential(
        user_id=user.id,
        credential_id=verification.credential_id,
        public_key=verification.credential_public_key,
        sign_count=verification.sign_count,
        aaguid=str(verification.aaguid) if verification.aaguid else None,
        device_name=body.device_name,
    )
    db.add(cred)
    db.commit()

    log_audit_event("biometric_register", "success", user.id, request.client.host if request.client else None, request.headers.get("user-agent"), "webauthn", db)
    return {"message": "Credential registered successfully"}


@router.post("/options")
def authentication_options(body: AuthOptionsRequest, db: Session = Depends(get_db)):
    """Generate WebAuthn authentication challenge."""
    users = db.query(User).all()
    user = next(
        (u for u in users if decrypt_field(u.email_encrypted) == body.email.lower()), None
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    allowed_creds = [
        PublicKeyCredentialDescriptor(id=c.credential_id)
        for c in user.webauthn_credentials
    ]
    if not allowed_creds:
        raise HTTPException(status_code=400, detail="No credentials registered for this user")

    options = generate_authentication_options(
        rp_id=settings.RP_ID,
        allow_credentials=allowed_creds,
        user_verification=UserVerificationRequirement.PREFERRED,
    )
    _store_challenge(options.challenge, user.id)

    from webauthn.helpers import options_to_json
    return options_to_json(options)


@router.post("/verify")
def authentication_verify(
    body: AuthVerifyRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Verify WebAuthn assertion and return session tokens."""
    from webauthn.helpers import base64url_to_bytes
    import base64 as _b64, json as _json

    raw_cred = body.credential
    client_data_b64 = raw_cred.get("response", {}).get("clientDataJSON", "")
    client_data = _json.loads(_b64.b64decode(client_data_b64 + "==").decode())
    challenge_b64_url = client_data.get("challenge", "")
    challenge_std = base64.b64encode(base64url_to_bytes(challenge_b64_url)).decode()

    user_id = _consume_challenge(challenge_std)
    if user_id is _CHALLENGE_NOT_FOUND:
        raise HTTPException(status_code=400, detail="Invalid or expired challenge")

    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=404, detail="User not found")

    # Find matching credential by credential_id
    cred_id_raw = base64url_to_bytes(raw_cred.get("id", ""))
    db_cred = next(
        (c for c in user.webauthn_credentials if c.credential_id == cred_id_raw), None
    )
    if not db_cred:
        raise HTTPException(status_code=400, detail="Unknown credential")

    # Check account lockout
    _check_lockout(user)

    try:
        verification = verify_authentication_response(
            credential=raw_cred,
            expected_rp_id=settings.RP_ID,
            expected_origin=f"http://{settings.RP_ID}" if settings.RP_ID == "localhost" else f"https://{settings.RP_ID}",
            expected_challenge=base64url_to_bytes(challenge_b64_url),
            credential_public_key=db_cred.public_key,
            credential_current_sign_count=db_cred.sign_count,
        )
    except Exception as exc:
        _record_failed_attempt(user, db)
        log_audit_event("biometric_auth", "failure", user.id, request.client.host if request.client else None, request.headers.get("user-agent"), "webauthn", db, str(exc))
        raise HTTPException(status_code=400, detail=f"Authentication failed: {exc}")

    # Update sign count
    db_cred.sign_count = verification.new_sign_count
    _reset_failed_attempts(user, db)
    db.commit()

    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    access_token, refresh_token, session_id = create_session(user.id, ip, ua, "webauthn", db)
    log_audit_event("biometric_auth", "success", user.id, ip, ua, "webauthn", db)

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "session_id": session_id,
    }


# ---------------------------------------------------------------------------
# Account lockout helpers
# ---------------------------------------------------------------------------

def _check_lockout(user: User) -> None:
    from datetime import datetime, timezone
    if user.locked_until:
        now = datetime.now(timezone.utc)
        locked = user.locked_until if user.locked_until.tzinfo else user.locked_until.replace(tzinfo=timezone.utc)
        if now < locked:
            raise HTTPException(status_code=423, detail="Account temporarily locked. Try again later.")


def _record_failed_attempt(user: User, db: Session) -> None:
    from datetime import datetime, timedelta, timezone
    user.failed_attempts = (user.failed_attempts or 0) + 1
    if user.failed_attempts >= 5:
        user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=15)
    db.add(user)
    db.commit()


def _reset_failed_attempts(user: User, db: Session) -> None:
    user.failed_attempts = 0
    user.locked_until = None
    db.add(user)
