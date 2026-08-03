"""Django REST Framework exception envelope."""

import logging
import math
from collections.abc import Mapping, Sequence
from http import HTTPStatus
from typing import cast

from rest_framework import status
from rest_framework.exceptions import ErrorDetail, PermissionDenied, Throttled, ValidationError
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


def _safe_message(exc: Exception, response_status: int) -> str:
    explicit = getattr(exc, "safe_message", None)
    if isinstance(explicit, str):
        return explicit
    detail = getattr(exc, "detail", None)
    if isinstance(detail, (ErrorDetail, str)):
        message = str(detail)
        if message.startswith("CSRF Failed:"):
            return "Your security token expired. Refresh and try again."
        return message
    try:
        return HTTPStatus(response_status).phrase
    except ValueError:
        return "Request failed."


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
        explicit_code = getattr(exc, "error_code", None)
        codes = getattr(exc, "get_codes", lambda: "request_error")()
        code = (
            explicit_code
            if isinstance(explicit_code, str)
            else codes
            if isinstance(codes, str)
            else "request_error"
        )
        message = _safe_message(exc, response_status)
        if isinstance(exc, PermissionDenied) and str(getattr(exc, "detail", "")).startswith(
            "CSRF Failed:"
        ):
            code = "csrf_failed"

    explicit_details = getattr(exc, "api_details", None)
    details = (
        explicit_details
        if isinstance(explicit_details, Mapping)
        else _serialise_details(cast(object, response.data))
    )
    if isinstance(details, dict) and set(details) == {"detail"}:
        details = details["detail"]
    if isinstance(exc, Throttled):
        wait = getattr(exc, "wait", 0)
        wait_seconds = wait if isinstance(wait, (int, float)) else 0
        details = {
            "retry_after_seconds": max(1, math.ceil(wait_seconds)),
        }

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
