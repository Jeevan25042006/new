import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.hashes import SHA256
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from app.core.config import settings


def _derive_key() -> bytes:
    raw = bytes.fromhex(settings.VAULT_KEY.ljust(64, "0")[:64])
    hkdf = HKDF(algorithm=SHA256(), length=32, salt=None, info=b"blinkpass-vault-v1")
    return hkdf.derive(raw)


_VAULT_KEY: bytes = _derive_key()


def encrypt_field(value: str | None) -> str | None:
    """Encrypt a plaintext string using AES-256-GCM. Returns base64-encoded ciphertext."""
    if not value:
        return value
    nonce = os.urandom(12)
    aesgcm = AESGCM(_VAULT_KEY)
    ct = aesgcm.encrypt(nonce, value.encode(), None)
    return base64.b64encode(nonce + ct).decode()


def decrypt_field(value: str | None) -> str | None:
    """Decrypt a base64-encoded AES-256-GCM ciphertext. Returns plaintext string or None on error."""
    if not value:
        return value
    try:
        raw = base64.b64decode(value)
        nonce, ct = raw[:12], raw[12:]
        aesgcm = AESGCM(_VAULT_KEY)
        return aesgcm.decrypt(nonce, ct, None).decode()
    except Exception:
        return None
