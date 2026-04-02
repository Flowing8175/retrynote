from starlette.requests import Request
from slowapi import Limiter


def _get_real_client_ip(request: Request) -> str:
    """Extract real client IP behind Cloudflare/nginx reverse proxy."""
    # Cloudflare sets this header with the actual client IP
    cf_ip = request.headers.get("cf-connecting-ip")
    if cf_ip:
        return cf_ip
    # nginx sets X-Real-IP
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip
    # Fallback to X-Forwarded-For first entry
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"


limiter = Limiter(key_func=_get_real_client_ip)
