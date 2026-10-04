"""Expire the browser session and CSRF cookies on sign-out.

Django's ``delete_cookie`` omits ``Secure`` unless the name is ``__Host-`` /
``__Secure-`` or ``SameSite`` is ``None``. A cookie that was stored with
``Secure`` is then left in place, and the next sign-in reuses it. Sign-out
sets both cookies itself, with the same path, domain, ``Secure``, ``HttpOnly``
and ``SameSite`` they were created with.
"""

from typing import Literal

from django.conf import settings
from django.http import HttpRequest, HttpResponse

SameSite = Literal["Lax", "Strict", "None"]
_SAMESITE: dict[str, SameSite] = {"Lax": "Lax", "Strict": "Strict", "None": "None"}

CLEAR_AUTH_COOKIES_ATTR = "_vsolve_clear_auth_cookies"


def mark_auth_cookies_for_clearing(request: HttpRequest) -> None:
    setattr(request, CLEAR_AUTH_COOKIES_ATTR, True)


def auth_cookies_should_clear(request: HttpRequest) -> bool:
    return bool(getattr(request, CLEAR_AUTH_COOKIES_ATTR, False))


def expire_auth_cookies(response: HttpResponse) -> None:
    _expire(
        response,
        settings.SESSION_COOKIE_NAME,
        path=settings.SESSION_COOKIE_PATH,
        domain=settings.SESSION_COOKIE_DOMAIN,
        secure=settings.SESSION_COOKIE_SECURE,
        httponly=settings.SESSION_COOKIE_HTTPONLY,
        samesite=_samesite(settings.SESSION_COOKIE_SAMESITE),
    )
    _expire(
        response,
        settings.CSRF_COOKIE_NAME,
        path=settings.CSRF_COOKIE_PATH,
        domain=settings.CSRF_COOKIE_DOMAIN,
        secure=settings.CSRF_COOKIE_SECURE,
        httponly=settings.CSRF_COOKIE_HTTPONLY,
        samesite=_samesite(settings.CSRF_COOKIE_SAMESITE),
    )


def _expire(
    response: HttpResponse,
    key: str,
    *,
    path: str,
    domain: str | None,
    secure: bool,
    httponly: bool,
    samesite: SameSite | None,
) -> None:
    response.set_cookie(
        key,
        value="",
        max_age=0,
        expires="Thu, 01 Jan 1970 00:00:00 GMT",
        path=path,
        domain=domain,
        secure=secure,
        httponly=httponly,
        samesite=samesite,
    )


def _samesite(value: object) -> SameSite | None:
    if not isinstance(value, str):
        return None
    return _SAMESITE.get(value)
