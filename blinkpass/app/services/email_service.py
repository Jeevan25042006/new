import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import settings

logger = logging.getLogger(__name__)


def _send_email(to: str, subject: str, body_html: str, body_text: str) -> None:
    """Send an email via SMTP. Logs failures instead of raising."""
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.SMTP_FROM
    msg["To"] = to
    msg.attach(MIMEText(body_text, "plain"))
    msg.attach(MIMEText(body_html, "html"))

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as smtp:
            if settings.SMTP_USER and settings.SMTP_PASSWORD:
                smtp.starttls()
                smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            smtp.sendmail(settings.SMTP_FROM, [to], msg.as_string())
        logger.info("Email sent to %s: %s", to, subject)
    except Exception as exc:
        logger.warning("Failed to send email to %s: %s", to, exc)


async def send_magic_link(email: str, token: str, base_url: str) -> None:
    link = f"{base_url}/auth/magic-link/verify/{token}"
    subject = "Your BlinkPass Magic Link"
    body_text = f"Click to sign in:\n{link}\n\nLink expires in {settings.MAGIC_LINK_EXPIRE_MINUTES} minutes."
    body_html = f"""
    <html><body>
      <h2>BlinkPass Magic Link</h2>
      <p>Click the button below to sign in:</p>
      <a href="{link}" style="padding:12px 24px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:6px;display:inline-block">
        Sign In
      </a>
      <p>Or copy this link: <code>{link}</code></p>
      <p>This link expires in {settings.MAGIC_LINK_EXPIRE_MINUTES} minutes.</p>
    </body></html>
    """
    import asyncio
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _send_email, email, subject, body_html, body_text)


async def send_recovery_codes(email: str, codes: list[str]) -> None:
    subject = "Your BlinkPass Recovery Codes"
    codes_text = "\n".join(f"  • {c}" for c in codes)
    codes_html = "".join(f"<li><code>{c}</code></li>" for c in codes)
    body_text = f"Your recovery codes (each can be used once):\n{codes_text}\n\nStore these safely."
    body_html = f"""
    <html><body>
      <h2>BlinkPass Recovery Codes</h2>
      <p>Each code can be used once. Store them securely.</p>
      <ul>{codes_html}</ul>
    </body></html>
    """
    import asyncio
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _send_email, email, subject, body_html, body_text)
