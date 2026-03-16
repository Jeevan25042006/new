import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.security import create_access_token, create_refresh_token
from app.storage.models import AuditLog, Session as SessionModel

logger = logging.getLogger(__name__)


def create_session(
    user_id: str,
    ip: str | None,
    user_agent: str | None,
    auth_method: str,
    db: Session,
) -> tuple[str, str, str]:
    """Create a new authenticated session. Returns (access_token, refresh_token, session_id)."""
    session_id = str(uuid.uuid4())
    token_data = {"sub": user_id, "sid": session_id}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    session = SessionModel(
        id=session_id,
        user_id=user_id,
        access_token=access_token,
        refresh_token=refresh_token,
        ip_address=ip,
        user_agent=user_agent,
        auth_method=auth_method,
    )
    db.add(session)
    db.commit()
    return access_token, refresh_token, session_id


def log_audit_event(
    event_type: str,
    outcome: str,
    user_id: str | None,
    ip: str | None,
    user_agent: str | None,
    auth_method: str | None,
    db: Session,
    details: str = "",
) -> None:
    """Persist an audit log entry."""
    entry = AuditLog(
        user_id=user_id,
        event_type=event_type,
        auth_method=auth_method,
        ip_address=ip,
        user_agent=user_agent,
        outcome=outcome,
        details=details,
    )
    db.add(entry)
    try:
        db.commit()
    except Exception as exc:
        logger.warning("Failed to write audit log: %s", exc)
        db.rollback()
