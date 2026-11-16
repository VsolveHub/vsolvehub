"""WhatsApp messages, sent directly through Meta's WhatsApp Cloud API.

This module is the Meta adapter and nothing more. Which notices go to WhatsApp, and what each one
says, is `channel_plan`; when a copy is recorded and every gate that decides whether it may go is
`channel_router`. Here: whether a person opted in, how a recorded intent becomes Meta's request,
and what Meta's answer means.

**Opt-in.** WhatsApp's policy requires the person to have asked, so the default is *no*: a message
goes only to someone with an enabled `CommunicationPreference` for (`WHATSAPP`, `OPT_IN_PURPOSE`).
One switch per person covers every WhatsApp message, Customer and Partner alike.

Nothing personal is stored in the delivery record: not the phone number, not the values.
"""

import logging
from typing import Any, Final, cast
from uuid import UUID

import requests
from django.conf import settings

from apps.identity.models import CommunicationPreference, User

from .channel_plan import route_for
from .models import NotificationDelivery, NotificationIntent
from .outcomes import FAILED, RETRY, SENT, SKIPPED, clean_value
from .services import record_delivery_attempt

__all__ = [
    "OPT_IN_PURPOSE",
    "PROVIDER",
    "WhatsAppPayloadError",
    "build_payload",
    "deliver_whatsapp_intent",
    "has_opted_in",
    "is_configured",
]

logger = logging.getLogger(__name__)

PROVIDER: Final[str] = "meta_whatsapp"
#: The preference purpose a person opts in to. The customer and partner sites know this slug.
OPT_IN_PURPOSE: Final[str] = "whatsapp-updates"
#: Meta allows far more; a value this long is a bug upstream, not a message anyone wants.
MAX_VALUE_LENGTH: Final[int] = 500

HTTP_TOO_MANY_REQUESTS: Final[int] = 429
HTTP_SERVER_ERROR: Final[int] = 500
HTTP_OK_MAX: Final[int] = 299


class WhatsAppPayloadError(ValueError):
    """A value the approved template needs is missing. Sending blanks is worse than nothing."""


def is_configured() -> bool:
    return bool(
        settings.WHATSAPP_ENABLED
        and settings.WHATSAPP_ACCESS_TOKEN.strip()
        and settings.WHATSAPP_PHONE_NUMBER_ID.strip()
    )


def has_opted_in(user: User) -> bool:
    return CommunicationPreference.objects.filter(
        user=user,
        channel=CommunicationPreference.Channel.WHATSAPP,
        purpose=OPT_IN_PURPOSE,
        is_enabled=True,
    ).exists()


def build_payload(intent: NotificationIntent) -> dict[str, Any]:
    """Meta's request body for one recorded intent. The template name is the template code."""

    route = route_for(intent.template_code)
    if route is None or route.channel != NotificationIntent.Channel.WHATSAPP:
        raise WhatsAppPayloadError(f"No WhatsApp route for {intent.template_code}.")
    context = cast(dict[str, Any], intent.context or {})
    values: list[str] = []
    for key in route.variables:
        value = clean_value(context.get(key), max_length=MAX_VALUE_LENGTH)
        if not value:
            raise WhatsAppPayloadError(f"{intent.template_code} needs {key}.")
        values.append(value)
    template: dict[str, Any] = {
        "name": intent.template_code,
        "language": {"code": settings.WHATSAPP_TEMPLATE_LANGUAGE},
    }
    if values:
        template["components"] = [
            {"type": "body", "parameters": [{"type": "text", "text": value} for value in values]}
        ]
    return {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": intent.recipient.phone_number.removeprefix("+"),
        "type": "template",
        "template": template,
    }


def _meta_error(response: requests.Response) -> dict[str, Any]:
    try:
        body = response.json()
    except ValueError:
        return {}
    error = body.get("error") if isinstance(body, dict) else None
    if not isinstance(error, dict):
        return {}
    # The error object only: Meta's codes and message, never the request that caused them.
    return {key: error[key] for key in ("code", "error_subcode", "message", "type") if key in error}


def _record(
    intent: NotificationIntent,
    *,
    status: str,
    failure_code: str = "",
    response_status: int | None = None,
    response_body: dict[str, Any] | None = None,
    provider_message_id: str = "",
) -> None:
    record_delivery_attempt(
        intent_id=intent.id,
        provider=PROVIDER,
        status=status,
        provider_message_id=provider_message_id,
        failure_code=failure_code,
        request_payload={"template": intent.template_code},
        response_status=response_status,
        response_body=response_body,
    )


def _message_id(response: requests.Response) -> str:
    try:
        body: Any = response.json()
    except ValueError:
        return ""
    messages = body.get("messages") if isinstance(body, dict) else None
    if isinstance(messages, list) and messages and isinstance(messages[0], dict):
        return str(messages[0].get("id", ""))[:140]
    return ""


def deliver_whatsapp_intent(*, intent_id: UUID) -> str:  # noqa: PLR0911 - one return per outcome
    """Send one recorded WhatsApp intent. Returns an outcome from `outcomes`."""

    intent = (
        NotificationIntent.objects.select_related("recipient")
        .filter(id=intent_id, channel=NotificationIntent.Channel.WHATSAPP)
        .first()
    )
    if intent is None or intent.status != NotificationIntent.Status.PENDING:
        return SKIPPED
    if not is_configured():
        _record(intent, status=NotificationDelivery.Status.SKIPPED, failure_code="not_configured")
        return SKIPPED
    try:
        payload = build_payload(intent)
    except WhatsAppPayloadError as exc:
        logger.warning(
            "whatsapp_payload_incomplete",
            extra={"intent_id": str(intent.id), "detail": str(exc)},
        )
        _record(intent, status=NotificationDelivery.Status.SKIPPED, failure_code="missing_value")
        return SKIPPED
    url = (
        f"{settings.WHATSAPP_GRAPH_API_BASE_URL.rstrip('/')}/"
        f"{settings.WHATSAPP_GRAPH_API_VERSION}/{settings.WHATSAPP_PHONE_NUMBER_ID}/messages"
    )
    try:
        response = requests.post(
            url,
            json=payload,
            headers={"Authorization": f"Bearer {settings.WHATSAPP_ACCESS_TOKEN}"},
            timeout=(
                settings.WHATSAPP_CONNECT_TIMEOUT_SECONDS,
                settings.WHATSAPP_READ_TIMEOUT_SECONDS,
            ),
        )
    except (requests.Timeout, requests.ConnectionError):
        _record(intent, status=NotificationDelivery.Status.RETRYABLE, failure_code="unreachable")
        return RETRY
    status = response.status_code
    if status <= HTTP_OK_MAX:
        _record(
            intent,
            status=NotificationDelivery.Status.ACCEPTED,
            provider_message_id=_message_id(response),
            response_status=status,
        )
        return SENT
    error = _meta_error(response)
    if status == HTTP_TOO_MANY_REQUESTS or status >= HTTP_SERVER_ERROR:
        _record(
            intent,
            status=NotificationDelivery.Status.RETRYABLE,
            failure_code="provider_temporary_error",
            response_status=status,
            response_body=error,
        )
        return RETRY
    # A 4xx will not succeed on retry: a wrong template, a number not on WhatsApp, a bad token.
    _record(
        intent,
        status=NotificationDelivery.Status.FAILED,
        failure_code=f"meta_{error.get('code', status)}"[:80],
        response_status=status,
        response_body=error,
    )
    NotificationIntent.objects.filter(id=intent.id).update(status=NotificationIntent.Status.FAILED)
    logger.warning(
        "whatsapp_rejected",
        extra={"intent_id": str(intent.id), "status": status, "meta_error": error},
    )
    return FAILED
