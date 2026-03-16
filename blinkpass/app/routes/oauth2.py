"""Full OIDC / OAuth2 implementation with PKCE."""
import base64
import hashlib
import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, Form, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse, RedirectResponse
from passlib.hash import argon2
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import (
    ALGORITHM,
    create_access_token,
    get_current_user,
    verify_token,
)
from app.core.vault import decrypt_field
from app.storage.database import get_db
from app.storage.models import AuthorizationCode, OAuthClient, User
from app.services.session_service import log_audit_event

logger = logging.getLogger(__name__)
router = APIRouter(tags=["oauth2"])


# ---------------------------------------------------------------------------
# Discovery & JWKS
# ---------------------------------------------------------------------------

@router.get("/.well-known/openid-configuration")
def openid_configuration(request: Request):
    base = str(request.base_url).rstrip("/")
    return {
        "issuer": base,
        "authorization_endpoint": f"{base}/oauth2/authorize",
        "token_endpoint": f"{base}/oauth2/token",
        "userinfo_endpoint": f"{base}/oauth2/userinfo",
        "jwks_uri": f"{base}/.well-known/jwks.json",
        "response_types_supported": ["code"],
        "subject_types_supported": ["public"],
        "id_token_signing_alg_values_supported": ["HS256"],
        "scopes_supported": ["openid", "profile", "email"],
        "token_endpoint_auth_methods_supported": ["client_secret_post", "client_secret_basic"],
        "code_challenge_methods_supported": ["S256", "plain"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
    }


@router.get("/.well-known/jwks.json")
def jwks():
    """Return JWKS. We use HS256 (symmetric) so no asymmetric key is published here."""
    return {"keys": []}


# ---------------------------------------------------------------------------
# Authorization endpoint
# ---------------------------------------------------------------------------

@router.get("/oauth2/authorize")
def authorize(
    response_type: str = Query(...),
    client_id: str = Query(...),
    redirect_uri: str = Query(...),
    scope: str = Query("openid profile email"),
    state: str = Query(default=""),
    code_challenge: str = Query(default=""),
    code_challenge_method: str = Query(default="S256"),
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """PKCE authorization endpoint. Requires authenticated user (Bearer token)."""
    if response_type != "code":
        raise HTTPException(status_code=400, detail="Only 'code' response_type is supported")

    client = db.query(OAuthClient).filter(OAuthClient.client_id == client_id).first()
    if not client:
        raise HTTPException(status_code=400, detail="Unknown client_id")
    if redirect_uri not in client.redirect_uris:
        raise HTTPException(status_code=400, detail="Invalid redirect_uri")
    if not code_challenge:
        raise HTTPException(status_code=400, detail="PKCE code_challenge is required")

    code = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)

    auth_code = AuthorizationCode(
        code=code,
        client_id=client_id,
        user_id=current_user["user_id"],
        scope=scope,
        redirect_uri=redirect_uri,
        code_challenge=code_challenge,
        code_challenge_method=code_challenge_method,
        expires_at=expires_at,
    )
    db.add(auth_code)
    db.commit()

    params = {"code": code}
    if state:
        params["state"] = state
    return RedirectResponse(f"{redirect_uri}?{urlencode(params)}", status_code=302)


# ---------------------------------------------------------------------------
# Token endpoint
# ---------------------------------------------------------------------------

@router.post("/oauth2/token")
async def token(
    request: Request,
    grant_type: str = Form(...),
    code: str = Form(default=""),
    redirect_uri: str = Form(default=""),
    client_id: str = Form(default=""),
    client_secret: str = Form(default=""),
    code_verifier: str = Form(default=""),
    refresh_token: str = Form(default=""),
    db: Session = Depends(get_db),
):
    # Support HTTP Basic auth for client credentials
    auth_header = request.headers.get("authorization", "")
    if auth_header.lower().startswith("basic "):
        decoded = base64.b64decode(auth_header[6:]).decode()
        client_id_h, _, client_secret_h = decoded.partition(":")
        if not client_id:
            client_id = client_id_h
        if not client_secret:
            client_secret = client_secret_h

    if grant_type == "authorization_code":
        return _handle_auth_code(code, redirect_uri, client_id, client_secret, code_verifier, db, request)
    elif grant_type == "refresh_token":
        return _handle_refresh(refresh_token, client_id, client_secret, db, request)
    else:
        raise HTTPException(status_code=400, detail="Unsupported grant_type")


def _handle_auth_code(code, redirect_uri, client_id, client_secret, code_verifier, db, request):
    auth_code = db.query(AuthorizationCode).filter(AuthorizationCode.code == code).first()
    if not auth_code:
        raise HTTPException(status_code=400, detail="Invalid authorization code")

    now = datetime.now(timezone.utc)
    expires = auth_code.expires_at if auth_code.expires_at.tzinfo else auth_code.expires_at.replace(tzinfo=timezone.utc)
    if auth_code.used or now > expires:
        raise HTTPException(status_code=400, detail="Authorization code expired or already used")
    if auth_code.redirect_uri != redirect_uri:
        raise HTTPException(status_code=400, detail="redirect_uri mismatch")

    client = db.query(OAuthClient).filter(OAuthClient.client_id == client_id).first()
    if not client:
        raise HTTPException(status_code=401, detail="Invalid client")
    try:
        if not argon2.verify(client_secret, client.client_secret_hash):
            raise HTTPException(status_code=401, detail="Invalid client credentials")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid client credentials")

    # PKCE verification
    if auth_code.code_challenge:
        if not code_verifier:
            raise HTTPException(status_code=400, detail="code_verifier required")
        if auth_code.code_challenge_method == "S256":
            digest = base64.urlsafe_b64encode(
                hashlib.sha256(code_verifier.encode()).digest()
            ).rstrip(b"=").decode()
            if digest != auth_code.code_challenge:
                raise HTTPException(status_code=400, detail="PKCE verification failed")
        elif auth_code.code_challenge_method == "plain":
            if code_verifier != auth_code.code_challenge:
                raise HTTPException(status_code=400, detail="PKCE verification failed")

    auth_code.used = True
    db.add(auth_code)
    db.commit()

    user = db.query(User).filter(User.id == auth_code.user_id).first()
    token_data = {"sub": auth_code.user_id, "client_id": client_id, "scope": auth_code.scope}
    access_token = create_access_token(token_data)
    from app.core.security import create_refresh_token
    refresh_token_val = create_refresh_token(token_data)

    # Persist session
    from app.services.session_service import create_session
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    _at, _rt, _sid = create_session(auth_code.user_id, ip, ua, "oauth2", db)

    id_token_data = {**token_data, "iss": str(request.base_url).rstrip("/")}
    id_token = create_access_token(id_token_data, timedelta(hours=1))

    return {
        "access_token": _at,
        "refresh_token": _rt,
        "id_token": id_token,
        "token_type": "bearer",
        "expires_in": settings.TOKEN_EXPIRE_MINUTES * 60,
        "scope": auth_code.scope,
    }


def _handle_refresh(refresh_token_str, client_id, client_secret, db, request):
    from app.storage.models import Session as SessionModel
    from app.core.security import create_refresh_token
    from jose import JWTError

    try:
        payload = verify_token(refresh_token_str)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Not a refresh token")

    session = db.query(SessionModel).filter(
        SessionModel.refresh_token == refresh_token_str,
        SessionModel.is_active == True,
    ).first()
    if not session:
        # Possible reuse — invalidate all sessions for this user
        user_id = payload.get("sub")
        if user_id:
            db.query(SessionModel).filter(SessionModel.user_id == user_id).update({"is_active": False})
            db.commit()
        raise HTTPException(status_code=401, detail="Refresh token reuse detected. All sessions revoked.")

    user_id = payload.get("sub")
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")

    new_token_data = {"sub": user_id}
    new_access = create_access_token(new_token_data)
    new_refresh = create_refresh_token(new_token_data)

    # Rotate refresh token
    session.access_token = new_access
    session.refresh_token = new_refresh
    session.last_used = datetime.now(timezone.utc)
    db.add(session)
    db.commit()

    return {
        "access_token": new_access,
        "refresh_token": new_refresh,
        "token_type": "bearer",
        "expires_in": settings.TOKEN_EXPIRE_MINUTES * 60,
    }


# ---------------------------------------------------------------------------
# Userinfo endpoint
# ---------------------------------------------------------------------------

@router.get("/oauth2/userinfo")
def userinfo(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == current_user["user_id"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    claims: dict = {"sub": user.id}
    scope = current_user["payload"].get("scope", "openid profile email")
    if "email" in scope and user.email_encrypted:
        from app.core.vault import decrypt_field
        claims["email"] = decrypt_field(user.email_encrypted)
    if "profile" in scope:
        claims["name"] = user.display_name
        claims["picture"] = user.avatar_url
    return claims
