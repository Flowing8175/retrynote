from unittest.mock import MagicMock

from app.rate_limit import _get_real_client_ip


def _make_request(headers=None, client_host: str | None = "127.0.0.1"):
    request = MagicMock()
    request.headers = headers or {}
    if client_host:
        request.client = MagicMock()
        request.client.host = client_host
    else:
        request.client = None
    return request


class TestGetRealClientIp:
    async def test_cf_connecting_ip_header(self):
        request = _make_request(headers={"cf-connecting-ip": "1.2.3.4"})
        assert _get_real_client_ip(request) == "1.2.3.4"

    async def test_x_real_ip_header(self):
        request = _make_request(headers={"x-real-ip": "5.6.7.8"})
        assert _get_real_client_ip(request) == "5.6.7.8"

    async def test_x_forwarded_for_single_ip(self):
        request = _make_request(headers={"x-forwarded-for": "10.0.0.1"})
        assert _get_real_client_ip(request) == "10.0.0.1"

    async def test_x_forwarded_for_multiple_ips(self):
        request = _make_request(
            headers={"x-forwarded-for": "10.0.0.1, 10.0.0.2, 10.0.0.3"}
        )
        assert _get_real_client_ip(request) == "10.0.0.1"

    async def test_fallback_to_client_host(self):
        request = _make_request(headers={}, client_host="172.16.0.1")
        assert _get_real_client_ip(request) == "172.16.0.1"

    async def test_fallback_no_client(self):
        request = _make_request(headers={}, client_host=None)
        assert _get_real_client_ip(request) == "127.0.0.1"

    async def test_cf_connecting_ip_takes_priority(self):
        request = _make_request(
            headers={
                "cf-connecting-ip": "1.1.1.1",
                "x-real-ip": "2.2.2.2",
                "x-forwarded-for": "3.3.3.3",
            },
        )
        assert _get_real_client_ip(request) == "1.1.1.1"
