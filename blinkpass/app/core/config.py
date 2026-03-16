import logging
from pydantic import model_validator
from pydantic_settings import BaseSettings

logger = logging.getLogger(__name__)

_DEFAULT_SECRET_KEY = "dev-secret-key-change-in-production-please"
_DEFAULT_VAULT_KEY = "6465762d76617566742d6b65792d3132"  # exactly 32 hex chars


class Settings(BaseSettings):
    APP_NAME: str = "BlinkPass"
    SECRET_KEY: str = _DEFAULT_SECRET_KEY
    VAULT_KEY: str = _DEFAULT_VAULT_KEY

    @model_validator(mode="after")
    def warn_default_keys(self) -> "Settings":
        if self.SECRET_KEY == _DEFAULT_SECRET_KEY:
            logger.warning("SECRET_KEY is using the default dev value. Set SECRET_KEY env var in production.")
        if self.VAULT_KEY == _DEFAULT_VAULT_KEY:
            logger.warning("VAULT_KEY is using the default dev value. Set VAULT_KEY env var in production.")
        return self

    DATABASE_URL: str = "sqlite:///./blinkpass.db"

    TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    MAGIC_LINK_EXPIRE_MINUTES: int = 15
    OTP_EXPIRE_MINUTES: int = 5

    SMTP_HOST: str = "localhost"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "noreply@blinkpass.com"

    FRONTEND_URL: str = "http://localhost:5173"

    RP_ID: str = "localhost"
    RP_NAME: str = "BlinkPass"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
