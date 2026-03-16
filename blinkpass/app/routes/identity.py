"""DID / identity endpoints."""
import base64
import logging

from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.identity.did_service import build_did_document, get_or_create_did
from app.storage.database import get_db, load_private_key
from app.storage.models import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/identity", tags=["identity"])


@router.get("/did")
def get_my_did(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the authenticated user's DID document."""
    user = db.query(User).filter(User.id == current_user["user_id"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    get_or_create_did(user, db)
    return build_did_document(user.id)


@router.get("/resolve/{did}")
def resolve_did(did: str, db: Session = Depends(get_db)):
    """Resolve any BlinkPass DID (public endpoint)."""
    prefix = "did:blinkpass:"
    if not did.startswith(prefix):
        raise HTTPException(status_code=400, detail="Only did:blinkpass: DIDs are supported")
    user_id = did[len(prefix):]
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="DID not found")
    return build_did_document(user_id)


@router.get("/public-key")
def get_platform_public_key():
    """Return the platform Ed25519 public key as base64."""
    private_key = load_private_key()
    pub = private_key.public_key()
    raw = pub.public_bytes(Encoding.Raw, PublicFormat.Raw)
    return {"public_key": base64.b64encode(raw).decode(), "algorithm": "Ed25519"}
