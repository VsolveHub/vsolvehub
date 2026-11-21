"""`client_ip`: the visitor's address behind Caddy, and a forged header ignored without it.

Regression: the OTP limits read `REMOTE_ADDR`, which behind Caddy is Caddy for every visitor, so
the per-IP limit of 20 codes in 10 minutes was one limit for the whole site.
"""

from django.http import HttpRequest
from django.test import RequestFactory, override_settings

from common.http import client_ip


def _request(remote: str, forwarded: str | None = None) -> HttpRequest:
    request = RequestFactory().post("/api/v1/auth/otp/request/")
    request.META["REMOTE_ADDR"] = remote
    if forwarded is not None:
        request.META["HTTP_X_FORWARDED_FOR"] = forwarded
    return request


@override_settings(TRUSTED_PROXY_COUNT=1)
def test_behind_caddy_the_visitor_is_the_forwarded_address() -> None:
    assert client_ip(_request("172.18.0.5", "203.0.113.7")) == "203.0.113.7"


@override_settings(TRUSTED_PROXY_COUNT=1)
def test_a_value_the_client_prepended_is_not_believed() -> None:
    # Caddy appends what it saw; anything to the left came from the client.
    request = _request("172.18.0.5", "1.2.3.4, 203.0.113.7")

    assert client_ip(request) == "203.0.113.7"


@override_settings(TRUSTED_PROXY_COUNT=0)
def test_without_a_trusted_proxy_the_header_is_ignored() -> None:
    assert client_ip(_request("198.51.100.9", "203.0.113.7")) == "198.51.100.9"


@override_settings(TRUSTED_PROXY_COUNT=1)
def test_no_header_falls_back_to_the_connection() -> None:
    assert client_ip(_request("198.51.100.9")) == "198.51.100.9"
