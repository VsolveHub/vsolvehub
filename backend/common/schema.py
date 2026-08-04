"""Reusable OpenAPI declarations for cross-cutting HTTP conventions."""

from typing import Any, Final, cast

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiExample, OpenApiParameter

OFFER_ACTIONS: Final[tuple[str, ...]] = ("accept", "decline", "undo", "commit")

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

OFFER_ACTION_PATH_PARAMETER = OpenApiParameter(
    name="action",
    type=OpenApiTypes.STR,
    location=OpenApiParameter.PATH,
    required=True,
    enum=list(OFFER_ACTIONS),
    description=(
        "The Partner offer command to run. The set is closed, so an unknown action is a client "
        "bug caught by the generated type rather than a runtime refusal shown to a Partner."
    ),
)

# Path and query enums that must reach generated clients as a named type rather than an
# inline union. drf-spectacular only hoists enums found in component *properties*, so a
# closed path parameter would otherwise be published as an anonymous enum. Keys are
# (parameter name, sorted values) because the generator emits enum members sorted.
PARAMETER_ENUM_COMPONENTS: Final[dict[tuple[str, tuple[str, ...]], str]] = {
    ("action", tuple(sorted(OFFER_ACTIONS))): "OfferActionEnum",
}


def _hoist_parameter_enum(parameter: dict[str, Any], schemas: dict[str, Any]) -> None:
    values = parameter.get("schema", {}).get("enum")
    if not isinstance(values, list):
        return
    name = PARAMETER_ENUM_COMPONENTS.get(
        (str(parameter.get("name", "")), tuple(sorted(str(value) for value in values)))
    )
    if name is None:
        return
    schemas.setdefault(name, {"enum": list(values), "type": "string"})
    parameter["schema"] = {"$ref": f"#/components/schemas/{name}"}


def publish_parameter_enum_components(result: dict[str, Any], **_kwargs: Any) -> dict[str, Any]:
    """Publish declared parameter enums as named schema components."""

    components = cast(dict[str, Any], result.setdefault("components", {}))
    schemas = cast(dict[str, Any], components.setdefault("schemas", {}))
    for path_item in cast(dict[str, Any], result.get("paths", {})).values():
        for operation in cast(dict[str, Any], path_item).values():
            if not isinstance(operation, dict):
                continue
            for parameter in operation.get("parameters", []):
                _hoist_parameter_enum(parameter, schemas)
    components["schemas"] = dict(sorted(schemas.items()))
    return result


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
