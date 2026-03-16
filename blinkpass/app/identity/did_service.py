import base64
import json
import logging
import uuid
from datetime import datetime, timezone

from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from sqlalchemy.orm import Session

from app.storage.database import load_private_key
from app.storage.models import User

logger = logging.getLogger(__name__)


def _public_key_b64() -> str:
    private_key = load_private_key()
    pub = private_key.public_key()
    raw = pub.public_bytes(Encoding.Raw, PublicFormat.Raw)
    return base64.b64encode(raw).decode()


def generate_did(user_id: str) -> str:
    return f"did:blinkpass:{user_id}"


def build_did_document(user_id: str) -> dict:
    did = generate_did(user_id)
    pub_b64 = _public_key_b64()
    return {
        "@context": [
            "https://www.w3.org/ns/did/v1",
            "https://w3id.org/security/suites/ed25519-2020/v1",
        ],
        "id": did,
        "verificationMethod": [
            {
                "id": f"{did}#key-1",
                "type": "Ed25519VerificationKey2020",
                "controller": did,
                "publicKeyMultibase": "z" + base64.b58encode(base64.b64decode(pub_b64)).decode(),
            }
        ],
        "authentication": [f"{did}#key-1"],
        "assertionMethod": [f"{did}#key-1"],
    }


def get_or_create_did(user: User, db: Session) -> str:
    if user.did:
        return user.did
    did = generate_did(user.id)
    user.did = did
    db.add(user)
    db.commit()
    db.refresh(user)
    logger.info("Created DID for user %s → %s", user.id, did)
    return did
