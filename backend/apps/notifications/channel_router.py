"""Copy a notice onto WhatsApp or SMS: the one place that decides whether a copy goes.

## How a notice reaches a phone

1. Domain code writes a notice exactly as before (`request_notification`, in-app or push).
2. `signals.route_notice_to_message_channels` sees it once it is delivered to the feed (or, for a
   push-only notice, once it is written) and schedules `tasks.send_channel_copy`.
3. That task calls `send_copy` here, which records the copy as its own `NotificationIntent` and
   hands it to `whatsapp` or `sms`.

The copy's idempotency key is derived from the source notice's id, so one notice can produce at
most one WhatsApp or SMS message however many times the task runs.

## The gates, in order

1. **The table.** Only template codes in `channel_plan.PLAN` are copied.
2. **The channel is on for this deployment** (`WHATSAPP_ENABLED`, `SMS_NOTIFICATIONS_ENABLED`).
   Off records nothing at all: a deployment that does not send a channel should not fill the
   table with a suppressed row for every notice.
3. **The audience has a phone to reach.** Operations notices stay in the console.
4. **The kill switches and mutes** in `request_notification`, recorded as suppressed.
5. **Opt-in, WhatsApp only.** Recorded as suppressed (`whatsapp_not_opted_in`).
6. **Freshness.** A copy that is sent late is worse than none: "your professional is on the way"
   an hour after they arrived. Past `STALE_AFTER` the copy is recorded as skipped.
"""

from datetime import timedelta
from typing import Final
from uuid import UUID

from django.conf import settings
from django.utils import timezone

from .channel_plan import route_for
from .models import NotificationDelivery, NotificationIntent
from .outcomes import SKIPPED
from .services import record_delivery_attempt, request_notification
from .sms import deliver_sms_intent
from .templates_registry import registered_template_codes
from .whatsapp import deliver_whatsapp_intent, has_opted_in

__all__ = [
    "STALE_AFTER",
    "any_channel_enabled",
    "channel_enabled",
    "copy_notice",
    "is_copy_source",
    "send_copy",
]

Channel = NotificationIntent.Channel

#: How late a copy may still go. SMS carries the moment-to-moment updates; WhatsApp the records.
STALE_AFTER: Final[dict[str, timedelta]] = {
    Channel.SMS: timedelta(minutes=30),
    Channel.WHATSAPP: timedelta(hours=24),
}

_AUDIENCES_WITH_A_PHONE: Final[frozenset[str]] = frozenset(
    {NotificationIntent.Audience.CUSTOMER, NotificationIntent.Audience.PARTNER}
)


def channel_enabled(channel: str) -> bool:
    if channel == Channel.WHATSAPP:
        return bool(settings.WHATSAPP_ENABLED)
    if channel == Channel.SMS:
        return bool(settings.SMS_NOTIFICATIONS_ENABLED)
    return False


def any_channel_enabled() -> bool:
    return channel_enabled(Channel.WHATSAPP) or channel_enabled(Channel.SMS)


def is_copy_source(intent: NotificationIntent) -> bool:
    """Whether this notice is the one a copy is made from.

    A notice in the in-app registry is copied from its in-app row; a push-only notice (no feed
    copy exists) from its push row. Never both, so a notice written on two channels cannot send
    two WhatsApp messages.
    """

    if route_for(intent.template_code) is None:
        return False
    if intent.template_code in registered_template_codes():
        return intent.channel == Channel.IN_APP
    return intent.channel == Channel.PUSH


def copy_notice(source: NotificationIntent) -> NotificationIntent | None:
    """Record the WhatsApp or SMS copy of `source`, or `None` when no copy is due at all.

    Returns the existing copy if one was recorded already. A copy that may not go comes back
    `SUPPRESSED`, with the reason.
    """

    route = route_for(source.template_code)
    if route is None or not is_copy_source(source) or not channel_enabled(route.channel):
        return None
    if source.audience not in _AUDIENCES_WITH_A_PHONE:
        return None
    copy = request_notification(
        recipient_id=source.recipient_id,
        purpose=source.purpose,
        channel=route.channel,
        audience=source.audience,
        template_code=source.template_code,
        context=dict(source.context or {}),
        idempotency_key=f"{route.channel.lower()}-copy:{source.id}",
    )
    if copy.status != NotificationIntent.Status.PENDING or copy.attempts:
        return copy
    if route.channel == Channel.WHATSAPP and not has_opted_in(copy.recipient):
        copy.status = NotificationIntent.Status.SUPPRESSED
        copy.suppressed_reason = "whatsapp_not_opted_in"
        copy.save(update_fields=("status", "suppressed_reason", "updated_at"))
    return copy


def send_copy(*, source_intent_id: UUID) -> str:
    """Record and send the copy of one notice. Returns an outcome from `outcomes`."""

    source = (
        NotificationIntent.objects.select_related("recipient").filter(id=source_intent_id).first()
    )
    if source is None:
        return SKIPPED
    copy = copy_notice(source)
    if copy is None or copy.status != NotificationIntent.Status.PENDING:
        return SKIPPED
    if timezone.now() - source.created_at > STALE_AFTER[copy.channel]:
        record_delivery_attempt(
            intent_id=copy.id,
            provider=copy.channel.lower(),
            status=NotificationDelivery.Status.SKIPPED,
            failure_code="stale",
        )
        return SKIPPED
    if copy.channel == Channel.WHATSAPP:
        return deliver_whatsapp_intent(intent_id=copy.id)
    return deliver_sms_intent(intent_id=copy.id)
