"""Schedule push work after the intent row has committed."""

from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.mobile.models import PushTicket
from apps.mobile.tasks import deliver_push_intent, mirror_in_app_notice
from apps.notifications.models import NotificationIntent


@receiver(post_save, sender=NotificationIntent)
def schedule_push_for_intent(
    sender: type[NotificationIntent],
    instance: NotificationIntent,
    created: bool,
    **kwargs: object,
) -> None:
    del sender, kwargs
    if (
        created
        and instance.channel == NotificationIntent.Channel.PUSH
        and instance.status == NotificationIntent.Status.PENDING
    ):
        intent_id = str(instance.id)

        def _deliver() -> None:
            deliver_push_intent.delay(intent_id)

        transaction.on_commit(_deliver)
        return

    if (
        instance.channel == NotificationIntent.Channel.IN_APP
        and instance.status == NotificationIntent.Status.SENT
        and not PushTicket.objects.filter(intent_id=instance.id).exists()
    ):
        intent_id = str(instance.id)

        def _mirror() -> None:
            mirror_in_app_notice.delay(intent_id)

        transaction.on_commit(_mirror)
