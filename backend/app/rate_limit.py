import ipaddress

from starlette.requests import Request
from slowapi import Limiter

TRUSTED_PROXIES: set[str] = {"127.0.0.1", "::1"}


def _is_trusted_proxy(addr: str) -> bool:
    try:
        ip = ipaddress.ip_address(addr)
        if str(ip) in TRUSTED_PROXIES:
            return True
        return ip.is_loopback
    except ValueError:
        return False


def _get_real_client_ip(request: Request) -> str:
    peer_ip = request.client.host if request.client else "127.0.0.1"

    if not _is_trusted_proxy(peer_ip):
        return peer_ip

    cf_ip = request.headers.get("cf-connecting-ip")
    if cf_ip:
        return cf_ip.strip()
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return peer_ip


limiter = Limiter(key_func=_get_real_client_ip)
