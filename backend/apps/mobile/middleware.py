"""Bearer sessions for the native apps.

A phone cannot rely on the browser cookie jar. When a request presents
``Authorization: Bearer <session key>``, that key is the Django session, CSRF
is not required, and the response does not set session or CSRF cookies.
"""

from django.conf import settings
from django.contrib.sessions.middleware import SessionMiddleware
from django.http import HttpRequest, HttpResponse, JsonResponse

from common.observability.context import get_request_id


class BearerAwareSessionMiddleware(SessionMiddleware):
    def process_request(self, request: HttpRequest) -> HttpResponse | None:
        header = request.headers.get("Authorization", "")
        prefix = "Bearer "
        if header.startswith(prefix):
            key = header[len(prefix) :].strip()
            if key:
                store = self.SessionStore(key)
                request.vsolve_bearer = True  # type: ignore[attr-defined]
                request._dont_enforce_csrf_checks = True  # type: ignore[attr-defined]
                # An unknown key must not look like "signed out". The session
                # read is public for a browser with no cookie; a phone that
                # presented a token has asked to be authenticated.
                if not store.exists(key):
                    return JsonResponse(
                        {
                            "error": {
                                "code": "not_authenticated",
                                "message": "Authentication credentials were not provided.",
                                "details": None,
                                "retryable": False,
                                "request_id": get_request_id(),
                            },
                        },
                        status=403,
                    )
                request.session = store
                return None
        super().process_request(request)
        return None

    def process_response(self, request: HttpRequest, response: HttpResponse) -> HttpResponse:
        response = super().process_response(request, response)
        if getattr(request, "vsolve_bearer", False):
            response.cookies.pop(settings.SESSION_COOKIE_NAME, None)
            response.cookies.pop(settings.CSRF_COOKIE_NAME, None)
        return response
