"""Deciding to notify someone, and finding out whether it worked.

Three refusals happen before a provider is ever called, and all three are recorded rather than
silent — an intent that was never sent is a fact somebody will need later:

1. a kill switch is engaged;
2. the recipient opted out of this purpose;
3. the retry budget for this intent is spent.

Nothing here retries in-process. A failed delivery is recorded and the intent is left for the
sweep, because a retry loop inside a request holds a transaction open across a provider's bad day.
"""

from typing import Any
from uuid import UUID

from django.db import transaction
from django.utils import timezone

from apps.identity.models import CommunicationPreference, User
from apps.notifications.models import KillSwitch, NotificationDelivery, NotificationIntent

#: How many attempts an intent gets before it is `FAILED` and visible.
#:
#: Bounded on purpose: an unbounded retry against a provider that is rejecting a malformed
#: template is a queue that never drains, and the failure it hides is one somebody has to fix by
#: hand anyway.
MAX_DELIVERY_ATTEMPTS = 3

#: Purposes a recipient cannot mute. Telling somebody their visit was cancelled is not marketing,
#: and a preference screen that could switch it off would be a preference screen that breaks the
#: product's promises.
TRANSACTIONAL_PURPOSES = frozenset(
    {
        "booking.confirmed",
        "booking.cancelled",
        # A visit that was paid for and could not be staffed. Cancelled *by us*, refunded in
        # full — the one message a Customer must never be able to mute, because the visit they
        # are expecting is not happening and nothing else will tell them.
        "booking.replacement_unavailable",
        "booking.partner_en_route",
        "booking.start_otp",
        "booking.completed",
        "payment.receipt",
        "refund.issued",
        "partner.offer",
        # A Partner who is online is telling us they want same-day work. Letting a
        # preference silently mute the only signal that work arrived would leave
        # them online, waiting, and never told — going offline is the control for
        # not being offered work, not a notification toggle.
        "partner.offer_created",
        "partner.job_assigned",
        "partner.job_cancelled",
        "partner.payout_paid",
    }
)


def is_engaged(scope: str, target: str = "") -> bool:
    """Whether this capability is switched off right now.

    A targeted switch is checked alongside the global one, so stopping SMS for a single service
    area does not require stopping it everywhere.
    """

    query = KillSwitch.objects.filter(is_engaged=True).filter(scope=scope)
    if target:
        return query.filter(target__in=("", target)).exists()
    return query.filter(target="").exists()


@transaction.atomic
def engage_kill_switch(*, scope: str, reason: str, actor: User, target: str = "") -> KillSwitch:
    """Stop a capability now, with a reason attached.

    The reason is required by a check constraint as well as here: an outage nobody can explain
    afterwards is worse than the outage.
    """

    if not reason.strip():
        raise ValueError("A kill switch needs a reason.")
    switch, _created = KillSwitch.objects.select_for_update().get_or_create(
        scope=scope, target=target
    )
    switch.is_engaged = True
    switch.reason = reason.strip()
    switch.engaged_by = actor
    switch.engaged_at = timezone.now()
    switch.released_by = None
    switch.released_at = None
    switch.version += 1
    switch.save(
        update_fields=(
            "is_engaged",
            "reason",
            "engaged_by",
            "engaged_at",
            "released_by",
            "released_at",
            "version",
            "updated_at",
        )
    )
    return switch


@transaction.atomic
def release_kill_switch(*, scope: str, actor: User, target: str = "") -> KillSwitch | None:
    switch = KillSwitch.objects.select_for_update().filter(scope=scope, target=target).first()
    if switch is None or not switch.is_engaged:
        return switch
    switch.is_engaged = False
    switch.released_by = actor
    switch.released_at = timezone.now()
    switch.version += 1
    switch.save(update_fields=("is_engaged", "released_by", "released_at", "version", "updated_at"))
    return switch


def _opted_out(recipient: User, purpose: str, channel: str) -> bool:
    """Whether this person asked not to receive this kind of message.

    Transactional purposes are exempt. A Customer who muted promotions still needs to be told
    their professional is at the door.
    """

    if purpose in TRANSACTIONAL_PURPOSES:
        return False
    return CommunicationPreference.objects.filter(
        user=recipient, purpose=purpose, channel=channel, is_enabled=False
    ).exists()


@transaction.atomic
def request_notification(
    *,
    recipient_id: UUID,
    purpose: str,
    channel: str,
    template_code: str,
    context: dict[str, Any] | None = None,
    idempotency_key: str = "",
) -> NotificationIntent:
    """Record the decision to notify somebody. Sending is a separate, later step.

    Suppression is recorded as an intent with a reason rather than as nothing at all. "We chose
    not to send this, because a kill switch was engaged" is a fact an incident review needs; a
    missing row looks identical to a bug.
    """

    if idempotency_key:
        existing = NotificationIntent.objects.filter(idempotency_key=idempotency_key).first()
        if existing is not None:
            return existing

    recipient = User.objects.get(id=recipient_id)
    intent = NotificationIntent(
        recipient=recipient,
        purpose=purpose,
        channel=channel,
        template_code=template_code,
        context=context or {},
        idempotency_key=idempotency_key,
    )
    if is_engaged(KillSwitch.Scope.NOTIFICATIONS) or (
        channel == NotificationIntent.Channel.SMS and is_engaged(KillSwitch.Scope.SMS)
    ):
        intent.status = NotificationIntent.Status.SUPPRESSED
        intent.suppressed_reason = "kill_switch_engaged"
    elif _opted_out(recipient, purpose, channel):
        intent.status = NotificationIntent.Status.SUPPRESSED
        intent.suppressed_reason = "recipient_opted_out"
    intent.save()
    return intent


@transaction.atomic
def record_delivery_attempt(
    *,
    intent_id: UUID,
    provider: str,
    status: str,
    provider_message_id: str = "",
    failure_code: str = "",
) -> NotificationIntent:
    """Append one attempt and move the intent if it is now settled.

    An intent only reaches `FAILED` once its budget is spent, so a first failure reads as "still
    trying" rather than "gave up" — and once it does fail, it says so instead of sitting
    `PENDING` forever, which is the state that lets a team believe a message went out.
    """

    intent = NotificationIntent.objects.select_for_update().get(id=intent_id)
    NotificationDelivery.objects.create(
        intent=intent,
        provider=provider,
        status=status,
        provider_message_id=provider_message_id,
        failure_code=failure_code,
    )
    intent.attempts += 1
    if status in (NotificationDelivery.Status.ACCEPTED, NotificationDelivery.Status.DELIVERED):
        intent.status = NotificationIntent.Status.SENT
    elif intent.attempts >= MAX_DELIVERY_ATTEMPTS:
        intent.status = NotificationIntent.Status.FAILED
    intent.save(update_fields=("attempts", "status", "updated_at"))
    return intent


def retryable_intents(*, limit: int = 100) -> list[NotificationIntent]:
    """Everything still worth another attempt. Read by the sweep, never retried in-process."""

    return list(
        NotificationIntent.objects.filter(
            status=NotificationIntent.Status.PENDING, attempts__lt=MAX_DELIVERY_ATTEMPTS
        ).order_by("created_at")[:limit]
    )
