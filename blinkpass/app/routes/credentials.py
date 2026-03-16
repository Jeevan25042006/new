"""Verifiable Credential endpoints."""
import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.identity.vc_service import issue_credential, verify_credential
from app.storage.database import get_db
from app.storage.models import User, VerifiableCredential

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/credentials", tags=["credentials"])


class IssueRequest(BaseModel):
    auth_method: str = "blinkpass"


class VerifyRequest(BaseModel):
    credential: dict


@router.post("/issue")
def issue(
    body: IssueRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == current_user["user_id"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    vc = issue_credential(user, body.auth_method, db)
    return vc


@router.post("/verify")
def verify(body: VerifyRequest):
    """Verify a presented credential (public endpoint)."""
    return verify_credential(body.credential)


@router.get("/list")
def list_credentials(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    records = (
        db.query(VerifiableCredential)
        .filter(VerifiableCredential.user_id == current_user["user_id"])
        .all()
    )
    return [
        {
            "id": r.id,
            "credential_id": r.credential_id,
            "revoked": r.revoked,
            "issued_at": r.issued_at.isoformat() if r.issued_at else None,
        }
        for r in records
    ]


@router.get("/{credential_id}")
def get_credential(
    credential_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    record = (
        db.query(VerifiableCredential)
        .filter(
            VerifiableCredential.id == credential_id,
            VerifiableCredential.user_id == current_user["user_id"],
        )
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="Credential not found")
    return json.loads(record.credential_json)


@router.post("/{credential_id}/revoke")
def revoke_credential(
    credential_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    record = (
        db.query(VerifiableCredential)
        .filter(
            VerifiableCredential.id == credential_id,
            VerifiableCredential.user_id == current_user["user_id"],
        )
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="Credential not found")
    record.revoked = True
    db.add(record)
    db.commit()
    return {"message": "Credential revoked"}
