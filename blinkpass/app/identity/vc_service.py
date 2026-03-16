import base64
import json
import logging
import uuid
from datetime import datetime, timedelta, timezone

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from sqlalchemy.orm import Session

from app.identity.did_service import generate_did, get_or_create_did
from app.storage.database import load_private_key
from app.storage.models import User, VerifiableCredential

logger = logging.getLogger(__name__)


def _sign(payload: bytes) -> str:
    private_key = load_private_key()
    sig = private_key.sign(payload)
    return base64.b64encode(sig).decode()


def _verify_sig(payload: bytes, sig_b64: str) -> bool:
    try:
        private_key = load_private_key()
        pub = private_key.public_key()
        sig = base64.b64decode(sig_b64)
        pub.verify(sig, payload)
        return True
    except (InvalidSignature, Exception):
        return False


def _public_key_b64() -> str:
    private_key = load_private_key()
    pub = private_key.public_key()
    raw = pub.public_bytes(Encoding.Raw, PublicFormat.Raw)
    return base64.b64encode(raw).decode()


def issue_credential(user: User, auth_method: str, db: Session) -> dict:
    """Issue a W3C Verifiable Credential for the given user."""
    did = get_or_create_did(user, db)
    credential_id = f"urn:uuid:{uuid.uuid4()}"
    now = datetime.now(timezone.utc)
    expiry = now + timedelta(days=365)

    credential = {
        "@context": [
            "https://www.w3.org/2018/credentials/v1",
            "https://w3id.org/security/suites/ed25519-2020/v1",
        ],
        "id": credential_id,
        "type": ["VerifiableCredential", "BlinkPassIdentityCredential"],
        "issuer": f"did:blinkpass:platform",
        "issuanceDate": now.isoformat(),
        "expirationDate": expiry.isoformat(),
        "credentialSubject": {
            "id": did,
            "authMethod": auth_method,
            "displayName": user.display_name or "",
        },
    }

    # Produce a detached payload signature over canonical JSON
    payload_bytes = json.dumps(credential, sort_keys=True).encode()
    signature = _sign(payload_bytes)

    credential["proof"] = {
        "type": "Ed25519Signature2020",
        "created": now.isoformat(),
        "verificationMethod": "did:blinkpass:platform#key-1",
        "proofPurpose": "assertionMethod",
        "proofValue": signature,
    }

    # Persist in database
    vc_record = VerifiableCredential(
        user_id=user.id,
        credential_id=credential_id,
        credential_json=json.dumps(credential),
    )
    db.add(vc_record)
    db.commit()
    db.refresh(vc_record)

    return credential


def verify_credential(credential: dict) -> dict:
    """Verify an Ed25519-signed W3C Verifiable Credential. Returns status dict."""
    proof = credential.get("proof")
    if not proof:
        return {"valid": False, "error": "No proof found"}

    proof_value = proof.get("proofValue")
    if not proof_value:
        return {"valid": False, "error": "No proofValue in proof"}

    # Check expiry
    expiry_str = credential.get("expirationDate")
    if expiry_str:
        try:
            exp = datetime.fromisoformat(expiry_str)
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) > exp:
                return {"valid": False, "error": "Credential has expired"}
        except ValueError:
            pass

    # Reconstruct payload without proof for signature verification
    payload_cred = {k: v for k, v in credential.items() if k != "proof"}
    payload_bytes = json.dumps(payload_cred, sort_keys=True).encode()

    if not _verify_sig(payload_bytes, proof_value):
        return {"valid": False, "error": "Invalid signature"}

    return {
        "valid": True,
        "issuer": credential.get("issuer"),
        "subject": credential.get("credentialSubject", {}).get("id"),
        "issuanceDate": credential.get("issuanceDate"),
        "expirationDate": credential.get("expirationDate"),
    }
