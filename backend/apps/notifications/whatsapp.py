"""Booking updates on WhatsApp, sent directly through Meta's WhatsApp Cloud API.

## The shape of it

A Customer notice is written in-app exactly as before (`fulfilment.visit_notices`). When the notice
has an approved Meta template, a second `NotificationIntent` on the `WHATSAPP` channel is recorded
beside it and a task sends it. One event, one WhatsApp message: the intent's idempotency key is the
in-app notice's key, prefixed.

## Three gates, all checked before anything is sent

1. `WHATSAPP_ENABLED` — off by default; a deployment without Meta credentials sends nothing.
2. The existing `WHATSAPP` kill switch, through `request_notification`.
3. **Opt-in.** WhatsApp's policy requires the person to have asked, so the default is *no*: a
   message goes only to someone with an enabled `CommunicationPreference` for
   (`WHATSAPP`, `booking-updates`). A notice for someone who has not opted in is recorded as
   suppressed, with the reason, rather than silently dropped.

## Templates

`TEMPLATES` maps our template codes to the Meta templates approved for them. The tuple order *is*
the `{{1}}`, `{{2}}` … order of the approved text; editing a template in WhatsApp Manager without
editing this table sends the wrong values into the wrong blanks.

Nothing personal is stored in the delivery record: not the phone number, not the parameters.
"""

import logging
from dataclasses import dataclass
from typing import Any, cast
from uuid import UUID

import requests
from django.conf import settings
from django.db import transaction

from apps.identity.models import CommunicationPreference, User

from .models import NotificationDelivery, NotificationIntent
from .services import record_delivery_attempt, request_notification

logger = logging.getLogger(__name__)

PROVIDER = "meta_whatsapp"
#: The preference purpose a Customer opts in to. The account screens know this slug.
OPT_IN_PURPOSE = "booking-updates"

HTTP_TOO_MANY_REQUESTS = 429
HTTP_SERVER_ERROR = 500
HTTP_OK_MAX = 299

SENT = "sent"
RETRY = "retry"
FAILED = "failed"
SKIPPED = "skipped"


@dataclass(frozen=True, slots=True)
class WhatsAppTemplate:
    """One approved Meta template. `body` lists context keys in `{{1}}`, `{{2}}` … order."""

    name: str
    body: tuple[str, ...]
    #: The context key whose value completes the dynamic "View booking" URL button, if any.
    url_button: str | None = "target_id"


#: Must match the text approved in WhatsApp Manager, variable for variable.
TEMPLATES: dict[str, WhatsAppTemplate] = {
    # "Hi, your {{1}} booking is confirmed. {{2}} will visit on {{3}}. ..."
    "customer_booking_confirmed": WhatsAppTemplate(
        "booking_confirmed", ("service", "partner_name", "when")
    ),
    # "Your professional {{1}} is on the way for your {{2}} visit. ..."
    "customer_visit_en_route": WhatsAppTemplate(
        "professional_on_the_way", ("partner_name", "service")
    ),
    # "Hi {{1}}, {{2}} has marked your {{3}} work as done. ..."
    "customer_visit_work_submitted": WhatsAppTemplate(
        "work_done_please_confirm", ("customer_first_name", "partner_name", "service")
    ),
}


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


def queue_whatsapp_copy(
    *,
    recipient_id: UUID,
    purpose: str,
    template_code: str,
    context: dict[str, str],
    idempotency_key: str,
) -> None:
    """Record and schedule the WhatsApp copy of a Customer notice, if every gate allows it."""

    if not settings.WHATSAPP_ENABLED or template_code not in TEMPLATES:
        return
    intent = request_notification(
        recipient_id=recipient_id,
        purpose=purpose,
        channel=NotificationIntent.Channel.WHATSAPP,
        audience=NotificationIntent.Audience.CUSTOMER,
        template_code=template_code,
        context=context,
        idempotency_key=f"wa:{idempotency_key}" if idempotency_key else "",
    )
    if intent.status != NotificationIntent.Status.PENDING or intent.attempts:
        return
    if not has_opted_in(intent.recipient):
        NotificationIntent.objects.filter(id=intent.id).update(
            status=NotificationIntent.Status.SUPPRESSED,
            suppressed_reason="whatsapp_not_opted_in",
        )
        return
    from .tasks import send_whatsapp_notice  # noqa: PLC0415 - tasks imports this module

    intent_id = str(intent.id)
    transaction.on_commit(lambda: send_whatsapp_notice.delay(intent_id))


def _first_name(user: User) -> str:
    parts = (user.full_name or "").split()
    return parts[0] if parts else ""


def build_payload(intent: NotificationIntent) -> dict[str, Any]:
    template = TEMPLATES.get(intent.template_code)
    if template is None:
        raise WhatsAppPayloadError(f"No WhatsApp template for {intent.template_code}.")
    context = cast(dict[str, Any], intent.context or {})
    values: list[str] = []
    for key in template.body:
        value = _first_name(intent.recipient) if key == "customer_first_name" else context.get(key)
        if not isinstance(value, str) or not value.strip():
            raise WhatsAppPayloadError(f"{template.name} needs {key}.")
        values.append(value.strip())
    components: list[dict[str, Any]] = [
        {"type": "body", "parameters": [{"type": "text", "text": value} for value in values]}
    ]
    if template.url_button is not None:
        suffix = context.get(template.url_button)
        if not isinstance(suffix, str) or not suffix:
            raise WhatsAppPayloadError(f"{template.name} needs {template.url_button}.")
        components.append(
            {
                "type": "button",
                "sub_type": "url",
                "index": "0",
                "parameters": [{"type": "text", "text": suffix}],
            }
        )
    return {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": intent.recipient.phone_number,
        "type": "template",
        "template": {
            "name": template.name,
            "language": {"code": settings.WHATSAPP_TEMPLATE_LANGUAGE},
            "components": components,
        },
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
    template = TEMPLATES.get(intent.template_code)
    record_delivery_attempt(
        intent_id=intent.id,
        provider=PROVIDER,
        status=status,
        provider_message_id=provider_message_id,
        failure_code=failure_code,
        request_payload={"template": template.name if template else intent.template_code},
        response_status=response_status,
        response_body=response_body,
    )


def deliver_whatsapp_intent(*, intent_id: UUID) -> str:  # noqa: PLR0911 - one return per outcome
    """Send one recorded WhatsApp intent. Returns `sent`, `retry`, `failed` or `skipped`."""

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
        try:
            body: Any = response.json()
        except ValueError:
            body = {}
        messages = body.get("messages") if isinstance(body, dict) else None
        message_id = (
            str(messages[0].get("id", ""))
            if isinstance(messages, list) and messages and isinstance(messages[0], dict)
            else ""
        )
        _record(
            intent,
            status=NotificationDelivery.Status.ACCEPTED,
            provider_message_id=message_id[:140],
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
