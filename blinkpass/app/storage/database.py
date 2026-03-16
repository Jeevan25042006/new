import logging
import os

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    NoEncryption,
    PrivateFormat,
    PublicFormat,
)
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.storage.models import Base

logger = logging.getLogger(__name__)

_KEY_FILE = "blinkpass_ed25519.key"

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {},
)

# Enable WAL mode for SQLite to improve concurrent read performance
if "sqlite" in settings.DATABASE_URL:
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _ensure_keypair() -> None:
    """Create an Ed25519 keypair and persist it to disk if it doesn't exist yet."""
    if os.path.exists(_KEY_FILE):
        return
    private_key = Ed25519PrivateKey.generate()
    pem = private_key.private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption())
    with open(_KEY_FILE, "wb") as f:
        f.write(pem)
    logger.info("Generated new Ed25519 keypair → %s", _KEY_FILE)


def load_private_key() -> Ed25519PrivateKey:
    """Load the platform Ed25519 private key from disk."""
    with open(_KEY_FILE, "rb") as f:
        from cryptography.hazmat.primitives.serialization import load_pem_private_key
        return load_pem_private_key(f.read(), password=None)


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    _ensure_keypair()
    logger.info("Database initialised.")
