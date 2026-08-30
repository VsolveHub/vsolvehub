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
from apps.notifications.templates_registry import assert_template_registered

#: The provider name recorded against an in-app delivery. Not a provider at all — the row is
#: written by this process — but `NotificationDelivery` asks who carried the message, and "we did"
#: is a truthful answer that keeps in-app inside the same audit trail as MSG91 will be.
IN_APP_PROVIDER = "in_app"

#: How many attempts an intent gets before it is `FAILED` and visible.
#:
#: Bounded on purpose: an unbounded retry against a provider that is rejecting a malformed
#: template is a queue that never drains, and the failure it hides is one somebody has to fix by
#: hand anyway.
MAX_DELIVERY_ATTEMPTS = 3

#: Which blunt off-switch silences which channel. A channel absent here is governed only by the
#: global NOTIFICATIONS switch; adding one is a dict entry, not a branch in `request_notification`.
_CHANNEL_KILL_SWITCH: dict[str, str] = {
    NotificationIntent.Channel.SMS: KillSwitch.Scope.SMS,
    NotificationIntent.Channel.WHATSAPP: KillSwitch.Scope.WHATSAPP,
    NotificationIntent.Channel.VOICE: KillSwitch.Scope.VOICE,
}

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
        # M2. Each of these is a hold, a clock or a settled amount, and muting any of them makes
        # the platform's own deadlines unfair: a booking-fee hold that expires unseen, a stage
        # review that auto-approves and releases money because nobody was told it had started, a
        # cancellation that goes ahead because the counterparty's window closed in silence. A
        # preference screen that could switch these off would be a preference screen that breaks
        # the product's promises — the same sentence this frozenset already existed to enforce.
        "m2.invitation.received",
        "m2.crew_offer.accepted",
        "m2.booking_fee.charged",
        "m2.crew.vendor_no_show",
        "m2.rate_card.fell_back",
        "m2.visit_plan.charged",
        "m2.visit.booked",
        # No longer written: a selection opens the engagement directly and there is no
        # reconfirmation to summon anybody to. Kept because intents carrying this purpose
        # are still in the database, and the rule that they could never be muted has to keep
        # answering for them.
        "m2.selection.reconfirm_required",
        "m2.proposal.rejected",
        "m2.engagement.opened",
        "m2.stage.review_required",
        "m2.stage.disputed",
        "m2.amendment.authorized",
        "m2.cancellation.evaluated",
        "m2.requirement.closed",
        # The customer spine added with the notification audit. Same test as everything above it:
        # can a person who muted this be worse off than a person who never had it? Each of these
        # is money moving, a decision being asked for, or a window that closes on its own.
        #
        # Deliberately *absent*, and therefore mutable: `m2.requirement.submitted`,
        # `m2.invitation.accepted`, `m2.shift.crew_assigned` and `m2.shift.arrival_confirmed`.
        # All four are reassurance — a confirmation of something the reader just did, or progress
        # they can see on the job page anyway — and a Customer running ten crews who wants a
        # quieter feed should be allowed to have one. Nothing lapses because they were not read.
        "m2.proposal.submitted",
        "m2.unlock.activated",
        "m2.requirement.reclassified",
        "m2.booking_fee.waived",
        "m2.proposal.revalidation_requested",
        "m2.shift.shortfall",
        "m2.shift.day_settled",
        "m2.project.handover_submitted",
        "m2.project.delay_claimed",
        "m2.project.transfer_proposed",
        "m2.project.transferred",
        "m2.project.terminated",
        "m2.cancellation.executed",
        "m2.cancellation.disputed",
        "m2.engagement.completing",
        "m2.engagement.redispatched",
        "m2.engagement.capability_suspended",
        "m2.safety.incident_reported",
        # The lead's side of the A3 day. An offer lapses in minutes, and the rest is money.
        "m2.crew_offer.invited",
        "m2.booking_fee.forfeited",
        "m2.shift.attendance_confirmed",
        "m2.shift.attendance_disputed",
        "m2.vendor.cash_demand_reported",
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

    **In-app is the exception to "sending is a later step."** Writing the row *is* the delivery —
    there is no provider to accept it and no sweep that would ever pick it up — so an in-app
    intent left `PENDING` would be a notice sitting in a queue that does not exist. It is
    therefore delivered inline, through the same `record_delivery_attempt` every other channel
    uses, so one intent still means one auditable attempt. Its template is checked here for the
    reason `templates_registry` documents: a code that cannot render must fail at the call site
    that wrote it, never in front of the person reading their feed.
    """

    if channel == NotificationIntent.Channel.IN_APP:
        assert_template_registered(template_code)

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
    channel_switch = _CHANNEL_KILL_SWITCH.get(channel)
    if is_engaged(KillSwitch.Scope.NOTIFICATIONS) or (
        channel_switch is not None and is_engaged(channel_switch)
    ):
        intent.status = NotificationIntent.Status.SUPPRESSED
        intent.suppressed_reason = "kill_switch_engaged"
    elif _opted_out(recipient, purpose, channel):
        intent.status = NotificationIntent.Status.SUPPRESSED
        intent.suppressed_reason = "recipient_opted_out"
    intent.save()
    if (
        channel == NotificationIntent.Channel.IN_APP
        and intent.status == NotificationIntent.Status.PENDING
    ):
        return record_delivery_attempt(
            intent_id=intent.id,
            provider=IN_APP_PROVIDER,
            status=NotificationDelivery.Status.DELIVERED,
        )
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
