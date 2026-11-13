"""Notification SMS, sent through the configured message transport (MSG91 in production).

Like `whatsapp`, this is only the sending end: `channel_plan` says which notices go by SMS and
what each says, `channel_router` records the copy and holds the gates.

Each SMS is a DLT-registered template. MSG91 knows it by its own template id, which arrives only
after registration, so ids are configuration (`settings.MSG91_TEMPLATE_IDS`, keyed by our
template code) rather than code. A notice with no id is recorded as skipped: sending some other
template's text is not a fallback anyone wants.
"""

import logging
from typing import Any, Final, cast
from uuid import UUID

from django.conf import settings

from .channel_plan import route_for
from .models import NotificationDelivery, NotificationIntent
from .outcomes import RETRY, SENT, SKIPPED, clean_value
from .services import record_delivery_attempt
from .transport import MessageTransportError, get_message_transport

__all__ = ["DLT_VARIABLE_MAX_LENGTH", "deliver_sms_intent", "is_configured", "sms_values"]

logger = logging.getLogger(__name__)

#: A DLT template variable holds at most 30 characters.
DLT_VARIABLE_MAX_LENGTH: Final[int] = 30


class SmsPayloadError(ValueError):
    """A value the registered template needs is missing."""


def is_configured() -> bool:
    return bool(settings.SMS_NOTIFICATIONS_ENABLED)


def sms_values(intent: NotificationIntent) -> dict[str, object]:
    """The template's variables by name, each one line of at most 30 characters."""

    route = route_for(intent.template_code)
    if route is None or route.channel != NotificationIntent.Channel.SMS:
        raise SmsPayloadError(f"No SMS route for {intent.template_code}.")
    context = cast(dict[str, Any], intent.context or {})
    values: dict[str, object] = {}
    for key in route.variables:
        value = clean_value(context.get(key), max_length=DLT_VARIABLE_MAX_LENGTH)
        if not value:
            raise SmsPayloadError(f"{intent.template_code} needs {key}.")
        values[key] = value
    return values


def _record(intent: NotificationIntent, *, provider: str, status: str, **fields: Any) -> None:
    record_delivery_attempt(
        intent_id=intent.id,
        provider=provider,
        status=status,
        request_payload={"template": intent.template_code},
        **fields,
    )


def deliver_sms_intent(*, intent_id: UUID) -> str:  # noqa: PLR0911 - one return per outcome
    """Send one recorded SMS intent. Returns an outcome from `outcomes`."""

    intent = (
        NotificationIntent.objects.select_related("recipient")
        .filter(id=intent_id, channel=NotificationIntent.Channel.SMS)
        .first()
    )
    if intent is None or intent.status != NotificationIntent.Status.PENDING:
        return SKIPPED
    skipped = NotificationDelivery.Status.SKIPPED
    if not is_configured():
        _record(intent, provider="sms", status=skipped, failure_code="not_configured")
        return SKIPPED
    try:
        transport = get_message_transport()
    except MessageTransportError:
        _record(intent, provider="sms", status=skipped, failure_code="not_configured")
        return SKIPPED
    template_id = str(settings.MSG91_TEMPLATE_IDS.get(intent.template_code, "") or "")
    if not template_id:
        _record(
            intent, provider=transport.code, status=skipped, failure_code="no_provider_template"
        )
        return SKIPPED
    try:
        values = sms_values(intent)
    except SmsPayloadError as exc:
        logger.warning(
            "sms_payload_incomplete", extra={"intent_id": str(intent.id), "detail": str(exc)}
        )
        _record(intent, provider=transport.code, status=skipped, failure_code="missing_value")
        return SKIPPED
    try:
        result = transport.send(
            channel=NotificationIntent.Channel.SMS,
            destination=intent.recipient.phone_number,
            template_code=template_id,
            context=values,
        )
    except MessageTransportError:
        # The transport says nothing more specific: a refusal and an unreachable provider look
        # the same from here, so both use the retry budget and then settle the intent.
        _record(
            intent,
            provider=transport.code,
            status=NotificationDelivery.Status.RETRYABLE,
            failure_code="provider_refused",
        )
        return RETRY
    if not result.accepted:
        _record(
            intent,
            provider=result.provider,
            status=NotificationDelivery.Status.RETRYABLE,
            failure_code="provider_refused",
        )
        return RETRY
    _record(
        intent,
        provider=result.provider,
        status=NotificationDelivery.Status.ACCEPTED,
        provider_message_id=result.provider_message_id[:140],
    )
    return SENT
