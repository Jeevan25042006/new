"""Developer OAuth client management endpoints."""
import logging
import secrets

from fastapi import APIRouter, Depends, HTTPException
from passlib.hash import argon2
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.storage.database import get_db
from app.storage.models import OAuthClient

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/developer", tags=["developer"])


class RegisterClientRequest(BaseModel):
    name: str
    redirect_uris: list[str]


@router.post("/register")
def register_client(
    body: RegisterClientRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Register a new OAuth2 client application."""
    client_id = secrets.token_urlsafe(16)
    client_secret = secrets.token_urlsafe(32)
    secret_hash = argon2.hash(client_secret)

    client = OAuthClient(
        client_id=client_id,
        client_secret_hash=secret_hash,
        name=body.name,
        redirect_uris=body.redirect_uris,
        owner_user_id=current_user["user_id"],
    )
    db.add(client)
    db.commit()
    db.refresh(client)

    return {
        "client_id": client_id,
        "client_secret": client_secret,  # Only shown once
        "name": body.name,
        "redirect_uris": body.redirect_uris,
        "message": "Store client_secret safely — it will not be shown again.",
    }


@router.get("/keys")
def list_clients(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all OAuth clients owned by the authenticated user."""
    clients = (
        db.query(OAuthClient)
        .filter(OAuthClient.owner_user_id == current_user["user_id"])
        .all()
    )
    return [
        {
            "client_id": c.client_id,
            "name": c.name,
            "redirect_uris": c.redirect_uris,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in clients
    ]


@router.delete("/keys/{client_id}")
def delete_client(
    client_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete an OAuth client owned by the authenticated user."""
    client = (
        db.query(OAuthClient)
        .filter(
            OAuthClient.client_id == client_id,
            OAuthClient.owner_user_id == current_user["user_id"],
        )
        .first()
    )
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    db.delete(client)
    db.commit()
    return {"message": f"Client '{client_id}' deleted"}
