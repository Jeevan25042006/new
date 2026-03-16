import secrets
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "BlinkPass"
    SECRET_KEY: str = secrets.token_hex(32)
    VAULT_KEY: str = secrets.token_hex(16)  # 32 hex chars = 16 bytes, HKDF expands to 32

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
