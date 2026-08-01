"""Reusable OpenAPI declarations for cross-cutting HTTP conventions."""

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiExample, OpenApiParameter

IDEMPOTENCY_KEY_HEADER = OpenApiParameter(
    name="Idempotency-Key",
    type=OpenApiTypes.STR,
    location=OpenApiParameter.HEADER,
    required=True,
    description=(
        "Stable opaque key for this logical command. Reuse it only when retrying the identical "
        "request; using it with a different payload returns 409."
    ),
)

OTP_RATE_LIMIT_EXAMPLE = OpenApiExample(
    "OTP rate limited",
    value={
        "error": {
            "code": "throttled",
            "message": "Too many code requests. Try again when the countdown ends.",
            "details": {"retry_after_seconds": 47},
            "retryable": True,
            "request_id": "req_example",
        }
    },
    response_only=True,
    status_codes=["429"],
)

SESSION_EXPIRED_EXAMPLE = OpenApiExample(
    "Session expired",
    value={
        "error": {
            "code": "session_expired",
            "message": "Session is no longer active.",
            "details": {
                "message": "Session is no longer active.",
                "code": "session_expired",
            },
            "retryable": False,
            "request_id": "req_example",
        }
    },
    response_only=True,
    status_codes=["403"],
)

PARTNER_VERSION_CONFLICT_EXAMPLE = OpenApiExample(
    "Partner application version conflict",
    value={
        "error": {
            "code": "partner_application_version_conflict",
            "message": "This application changed in another session. Refresh and try again.",
            "details": {
                "message": "This application changed in another session. Refresh and try again.",
                "code": "partner_application_version_conflict",
            },
            "retryable": True,
            "request_id": "req_example",
        }
    },
    response_only=True,
    status_codes=["409"],
)
