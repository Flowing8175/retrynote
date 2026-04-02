import asyncio
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import settings

logger = logging.getLogger(__name__)


def _send_sync(to: str, subject: str, html_body: str) -> None:
    msg = MIMEMultipart("alternative")
    msg["From"] = settings.smtp_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
        server.starttls()
        server.login(settings.smtp_user, settings.smtp_password)
        server.sendmail(settings.smtp_from, to, msg.as_string())


async def send_email(to: str, subject: str, html_body: str) -> None:
    if not settings.smtp_host or not settings.smtp_user:
        logger.warning("SMTP not configured, skipping email to %s", to)
        return
    await asyncio.to_thread(_send_sync, to, subject, html_body)


async def send_password_reset_email(to: str, token: str) -> None:
    reset_url = f"{settings.app_url}/password-reset?token={token}"
    html = f"""\
<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
  <h2>비밀번호 재설정</h2>
  <p>아래 버튼을 클릭하여 비밀번호를 재설정하세요. 이 링크는 1시간 동안 유효합니다.</p>
  <a href="{reset_url}"
     style="display: inline-block; padding: 12px 24px; background: #2563eb;
            color: #fff; text-decoration: none; border-radius: 6px;">
    비밀번호 재설정
  </a>
  <p style="margin-top: 24px; font-size: 13px; color: #6b7280;">
    본인이 요청하지 않았다면 이 메일을 무시하세요.
  </p>
</div>"""
    await send_email(to, "비밀번호 재설정 안내", html)
