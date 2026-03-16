"""Magic link authentication routes."""
import asyncio
import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import magic_link_limiter
from app.core.vault import decrypt_field, encrypt_field
from app.services.email_service import send_magic_link
from app.services.session_service import create_session, log_audit_event
from app.storage.database import get_db
from app.storage.models import MagicLinkToken, User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth/magic-link", tags=["magic-link"])

# poll_token -> asyncio.Event (set when magic link is clicked)
_poll_events: dict[str, asyncio.Event] = {}
# poll_token -> (access_token, refresh_token, session_id) after verification
_poll_results: dict[str, tuple[str, str, str]] = {}


class MagicLinkRequest(BaseModel):
    email: str


@router.post("/request")
async def request_magic_link(
    body: MagicLinkRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Send a magic link to the provided email."""
    ip = request.client.host if request.client else "unknown"
    magic_link_limiter.check(ip)

    email = body.email.lower().strip()

    # Find or create user
    users = db.query(User).all()
    user = next((u for u in users if decrypt_field(u.email_encrypted) == email), None)
    if user is None:
        user = User(email_encrypted=encrypt_field(email))
        db.add(user)
        db.commit()
        db.refresh(user)

    token = secrets.token_urlsafe(32)
    poll_token = secrets.token_urlsafe(24)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.MAGIC_LINK_EXPIRE_MINUTES)

    ml = MagicLinkToken(
        user_id=user.id,
        token=token,
        poll_token=poll_token,
        expires_at=expires_at,
    )
    db.add(ml)
    db.commit()

    # Prepare poll event
    _poll_events[poll_token] = asyncio.Event()

    # Determine base URL
    forwarded_host = request.headers.get("x-forwarded-host")
    forwarded_proto = request.headers.get("x-forwarded-proto", "http")
    if forwarded_host:
        base_url = f"{forwarded_proto}://{forwarded_host}"
    else:
        base_url = str(request.base_url).rstrip("/")

    background_tasks.add_task(send_magic_link, email, token, base_url)
    log_audit_event("magic_link_request", "success", user.id, ip, request.headers.get("user-agent"), "magic_link", db)

    return {"message": "Magic link sent. Check your email.", "poll_token": poll_token}


@router.get("/verify/{token}")
def verify_magic_link(token: str, request: Request, db: Session = Depends(get_db)):
    """Verify a magic link token and issue session tokens."""
    ml = db.query(MagicLinkToken).filter(MagicLinkToken.token == token).first()
    if not ml:
        raise HTTPException(status_code=400, detail="Invalid magic link token")

    now = datetime.now(timezone.utc)
    expires = ml.expires_at if ml.expires_at.tzinfo else ml.expires_at.replace(tzinfo=timezone.utc)

    if ml.used:
        raise HTTPException(status_code=400, detail="Magic link already used")
    if now > expires:
        raise HTTPException(status_code=400, detail="Magic link has expired")

    ml.used = True
    db.add(ml)
    db.commit()

    user = db.query(User).filter(User.id == ml.user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=404, detail="User not found")

    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    access_token, refresh_token, session_id = create_session(user.id, ip, ua, "magic_link", db)
    log_audit_event("magic_link_verify", "success", user.id, ip, ua, "magic_link", db)

    # Signal any waiting poll
    if ml.poll_token and ml.poll_token in _poll_events:
        _poll_results[ml.poll_token] = (access_token, refresh_token, session_id)
        _poll_events[ml.poll_token].set()

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "session_id": session_id,
    }


@router.get("/poll/{poll_token}")
async def poll_magic_link(poll_token: str):
    """Long-poll: returns tokens once the magic link has been clicked (30s timeout)."""
    event = _poll_events.get(poll_token)
    if event is None:
        raise HTTPException(status_code=404, detail="Unknown poll token")

    try:
        await asyncio.wait_for(asyncio.shield(event.wait()), timeout=30.0)
    except asyncio.TimeoutError:
        return {"status": "pending"}

    result = _poll_results.pop(poll_token, None)
    _poll_events.pop(poll_token, None)

    if result:
        access_token, refresh_token, session_id = result
        return {
            "status": "authenticated",
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "session_id": session_id,
        }
    return {"status": "pending"}
