from unittest.mock import patch, MagicMock, AsyncMock

from app.utils.email import send_email, send_password_reset_email, _send_sync


class TestSendEmail:
    async def test_skips_when_smtp_not_configured_no_host(self):
        with patch("app.utils.email.settings") as mock_settings:
            mock_settings.smtp_host = ""
            mock_settings.smtp_user = "user"
            with patch("app.utils.email.logger") as mock_logger:
                await send_email("test@example.com", "Subject", "<p>Body</p>")
                mock_logger.warning.assert_called_once()

    async def test_skips_when_smtp_not_configured_no_user(self):
        with patch("app.utils.email.settings") as mock_settings:
            mock_settings.smtp_host = "smtp.example.com"
            mock_settings.smtp_user = ""
            with patch("app.utils.email.logger") as mock_logger:
                await send_email("test@example.com", "Subject", "<p>Body</p>")
                mock_logger.warning.assert_called_once()

    async def test_calls_send_sync_via_to_thread(self):
        with patch("app.utils.email.settings") as mock_settings:
            mock_settings.smtp_host = "smtp.example.com"
            mock_settings.smtp_user = "user"
            with patch(
                "app.utils.email.asyncio.to_thread", new_callable=AsyncMock
            ) as mock_thread:
                await send_email("to@test.com", "Subj", "<p>Hi</p>")
                mock_thread.assert_awaited_once_with(
                    _send_sync, "to@test.com", "Subj", "<p>Hi</p>"
                )


class TestSendSync:
    async def test_constructs_mime_and_sends(self):
        with patch("app.utils.email.settings") as mock_settings:
            mock_settings.smtp_from = "noreply@example.com"
            mock_settings.smtp_host = "smtp.example.com"
            mock_settings.smtp_port = 587
            mock_settings.smtp_user = "user"
            mock_settings.smtp_password = "pass"

            mock_smtp_instance = MagicMock()
            mock_smtp_instance.__enter__ = MagicMock(return_value=mock_smtp_instance)
            mock_smtp_instance.__exit__ = MagicMock(return_value=False)

            with patch(
                "app.utils.email.smtplib.SMTP", return_value=mock_smtp_instance
            ) as mock_smtp:
                _send_sync("to@test.com", "Test Subject", "<p>Hello</p>")

                mock_smtp.assert_called_once_with("smtp.example.com", 587, timeout=10)
                mock_smtp_instance.starttls.assert_called_once()
                mock_smtp_instance.login.assert_called_once_with("user", "pass")
                mock_smtp_instance.sendmail.assert_called_once()
                args = mock_smtp_instance.sendmail.call_args[0]
                assert args[0] == "noreply@example.com"
                assert args[1] == "to@test.com"
                assert "Test Subject" in args[2]
                assert "Hello" in args[2] or "SGVsbG8" in args[2]


class TestSendPasswordResetEmail:
    async def test_builds_correct_html_and_calls_send_email(self):
        with patch("app.utils.email.settings") as mock_settings:
            mock_settings.app_url = "http://localhost:5173"
            mock_settings.smtp_host = "smtp.example.com"
            mock_settings.smtp_user = "user"

            with patch(
                "app.utils.email.asyncio.to_thread", new_callable=AsyncMock
            ) as mock_thread:
                await send_password_reset_email("user@test.com", "abc123token")

                mock_thread.assert_awaited_once()
                call_args = mock_thread.call_args[0]
                assert call_args[0] is _send_sync
                assert call_args[1] == "user@test.com"
                html_body = call_args[3]
                assert (
                    "http://localhost:5173/password-reset?token=abc123token"
                    in html_body
                )
