"""HTTP request correlation middleware."""

import re
from collections.abc import Callable
from uuid import uuid4

from django.http import HttpRequest, HttpResponse

from common.observability.context import reset_request_id, set_request_id

_SAFE_REQUEST_ID = re.compile(r"^[A-Za-z0-9._:-]{1,64}$")


class RequestIdMiddleware:
    """Accept a safe upstream request ID or generate a new UUID."""

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        candidate = request.headers.get("X-Request-ID", "")
        request_id = candidate if _SAFE_REQUEST_ID.fullmatch(candidate) else str(uuid4())
        token = set_request_id(request_id)
        try:
            response = self.get_response(request)
            response["X-Request-ID"] = request_id
            return response
        finally:
            reset_request_id(token)
