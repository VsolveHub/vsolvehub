"""Finish sign-out after session middleware has written its own Set-Cookie."""

from collections.abc import Callable

from django.http import HttpRequest, HttpResponse

from apps.identity.auth_cookies import auth_cookies_should_clear, expire_auth_cookies


class ClearAuthCookiesMiddleware:
    """Replace the session cookie deletion with one the browser will honor.

    Listed ahead of ``SessionMiddleware`` so this ``process_response`` runs
    after it. Session middleware deletes ``vsolve_session`` without ``Secure``
    when the session is flushed; this writes the deletion again with the flags
    the cookie was stored under, and expires the CSRF cookie as well.
    """

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        response = self.get_response(request)
        if auth_cookies_should_clear(request):
            expire_auth_cookies(response)
        return response
