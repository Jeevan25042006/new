import logging
import secrets
import string

logger = logging.getLogger(__name__)


def generate_otp() -> str:
    """Generate a cryptographically secure 6-digit OTP."""
    return "".join(secrets.choice(string.digits) for _ in range(6))


def send_sms_otp(phone: str, otp: str) -> None:
    """Send OTP via SMS. Stub implementation — logs for demo purposes."""
    logger.info("SMS OTP to %s: %s (demo — not sent)", phone[-4:].rjust(len(phone), "*"), otp)
