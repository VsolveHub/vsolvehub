"""Bearer sessions for the native apps.

A phone cannot rely on the browser cookie jar. When a request presents
``Authorization: Bearer <session key>``, that key is the Django session, CSRF
is not required, and the response does not set session or CSRF cookies.
"""

from django.conf import settings
from django.contrib.sessions.middleware import SessionMiddleware
from django.http import HttpRequest, HttpResponse, JsonResponse

from common.observability.context import get_request_id

# Endpoints that start a session from nothing. A phone holding a dead token from an
# earlier session (expired, revoked, or from a database that was reset) must still be
# able to sign in here, so an unknown bearer key is ignored on these paths instead of
# refusing the request before the sign-in view runs. Step-up is deliberately absent:
# it acts on an existing session.
SIGN_IN_PATHS = frozenset(
    {
        "/api/v1/auth/otp/request/",
        "/api/v1/auth/otp/verify/",
        "/api/v1/auth/firebase/precheck/",
        "/api/v1/auth/firebase/verify/",
        "/api/v1/auth/mobile/otp/verify/",
        "/api/v1/auth/mobile/firebase/verify/",
    },
)


class BearerAwareSessionMiddleware(SessionMiddleware):
    def process_request(self, request: HttpRequest) -> HttpResponse | None:
        header = request.headers.get("Authorization", "")
        prefix = "Bearer "
        if header.startswith(prefix):
            key = header[len(prefix) :].strip()
            if key and request.path in SIGN_IN_PATHS and not self.SessionStore().exists(key):
                # Treat a dead token on a sign-in call as if none was sent.
                key = ""
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
