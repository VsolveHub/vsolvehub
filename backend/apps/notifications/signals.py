"""Schedule the WhatsApp or SMS copy of a notice once the notice itself is committed."""

import logging
from typing import Any

from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from .channel_router import any_channel_enabled, is_copy_source
from .models import NotificationIntent

logger = logging.getLogger(__name__)


def _is_ready(instance: NotificationIntent, *, created: bool, update_fields: Any) -> bool:
    """The save that makes a notice ready to copy, and no later save.

    An in-app notice is ready when it is delivered to the feed: `record_delivery_attempt` saves
    its status. Marking it read later saves it again, without the status, and must not send a
    second message. A push-only notice is ready when it is written.
    """

    if instance.channel == NotificationIntent.Channel.IN_APP:
        status_saved = created or (update_fields is not None and "status" in update_fields)
        return status_saved and instance.status == NotificationIntent.Status.SENT
    return created and instance.status == NotificationIntent.Status.PENDING


@receiver(post_save, sender=NotificationIntent)
def route_notice_to_message_channels(
    sender: type[NotificationIntent],
    instance: NotificationIntent,
    created: bool,
    **kwargs: Any,
) -> None:
    del sender
    if not any_channel_enabled() or not is_copy_source(instance):
        return
    if not _is_ready(instance, created=created, update_fields=kwargs.get("update_fields")):
        return
    source_intent_id = str(instance.id)

    def _schedule() -> None:
        from .tasks import send_channel_copy  # noqa: PLC0415 - tasks imports the router

        try:
            send_channel_copy.delay(source_intent_id)
        except Exception:
            # A broker outage must not fail the command that wrote the notice; the notice is
            # already in the feed. The log line is the trace of the copy that did not go.
            logger.exception("channel_copy_schedule_failed", extra={"intent_id": source_intent_id})

    transaction.on_commit(_schedule)
