import logging

from disposable_email_domains import blocklist

logger = logging.getLogger(__name__)


def is_disposable_email(email: str) -> bool:
    """Return True if the email domain is in the disposable email blocklist."""
    try:
        domain = email.split("@")[1].lower()
    except (IndexError, AttributeError):
        return False
    if domain in blocklist:
        logger.warning("Blocked disposable email domain: %s", domain)
        return True
    return False
