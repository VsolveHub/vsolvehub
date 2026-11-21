"""The client's address as the rate limits should see it."""

from django.conf import settings
from django.http import HttpRequest
from rest_framework.request import Request


def client_ip(request: HttpRequest | Request) -> str:
    """The address the request came from, looking through `TRUSTED_PROXY_COUNT` proxies.

    Behind Caddy, `REMOTE_ADDR` is Caddy itself for every visitor, so a per-IP limit would be one
    limit for the whole site. Caddy replaces any `X-Forwarded-For` a client sends with the address
    it saw, so the entry `TRUSTED_PROXY_COUNT` from the right is the visitor. With no proxy
    trusted (0, the default outside production), the header is ignored: anyone could forge it.
    """

    meta = request.META
    remote = str(meta.get("REMOTE_ADDR") or "")
    hops = int(settings.TRUSTED_PROXY_COUNT)
    forwarded = str(meta.get("HTTP_X_FORWARDED_FOR") or "")
    if hops > 0 and forwarded:
        addresses = [part.strip() for part in forwarded.split(",") if part.strip()]
        if addresses:
            return str(addresses[-min(hops, len(addresses))])
    return remote or "unknown"
