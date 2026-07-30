"""Django REST Framework exception envelope."""

import logging
from collections.abc import Mapping, Sequence
from http import HTTPStatus
from typing import cast

from rest_framework import status
from rest_framework.exceptions import ErrorDetail, ValidationError
from rest_framework.response import Response
from rest_framework.views import exception_handler

from common.observability.context import get_request_id

logger = logging.getLogger(__name__)

ErrorValue = ErrorDetail | str | int | float | bool | None
ErrorData = ErrorValue | Mapping[str, "ErrorData"] | Sequence["ErrorData"]
RETRYABLE_HTTP_STATUSES = {
    status.HTTP_408_REQUEST_TIMEOUT,
    status.HTTP_425_TOO_EARLY,
    status.HTTP_429_TOO_MANY_REQUESTS,
    status.HTTP_502_BAD_GATEWAY,
    status.HTTP_503_SERVICE_UNAVAILABLE,
    status.HTTP_504_GATEWAY_TIMEOUT,
}


def _serialise_details(value: object) -> object:
    if isinstance(value, ErrorDetail):
        return {"message": str(value), "code": value.code}
    if isinstance(value, Mapping):
        return {str(key): _serialise_details(item) for key, item in value.items()}
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return [_serialise_details(item) for item in value]
    return value


def _is_retryable(exc: Exception, response_status: int) -> bool:
    explicit = getattr(exc, "retryable", None)
    if isinstance(explicit, bool):
        return explicit
    return response_status in RETRYABLE_HTTP_STATUSES


def api_exception_handler(exc: Exception, context: dict[str, object]) -> Response:
    """Return one stable envelope for expected and unexpected API errors."""

    response = exception_handler(exc, context)
    request_id = get_request_id()

    if response is None:
        logger.exception(
            "Unhandled API exception",
            exc_info=(type(exc), exc, exc.__traceback__),
            extra={"request_id": request_id},
        )
        return Response(
            {
                "error": {
                    "code": "internal_error",
                    "message": "An unexpected error occurred.",
                    "details": None,
                    "retryable": False,
                    "request_id": request_id,
                },
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    response_status = response.status_code
    if isinstance(exc, ValidationError):
        code = "validation_error"
        message = "Request validation failed."
    else:
        codes = getattr(exc, "get_codes", lambda: "request_error")()
        code = codes if isinstance(codes, str) else "request_error"
        try:
            message = HTTPStatus(response_status).phrase
        except ValueError:
            message = "Request failed."

    details = _serialise_details(cast(object, response.data))
    if isinstance(details, dict) and set(details) == {"detail"}:
        details = details["detail"]

    response.data = {
        "error": {
            "code": code,
            "message": message,
            "details": details,
            "retryable": _is_retryable(exc, response_status),
            "request_id": request_id,
        },
    }
    return response
