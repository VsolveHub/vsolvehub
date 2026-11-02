"""Deciding to notify someone, and finding out whether it worked.

Three refusals happen before a provider is ever called, and all three are recorded rather than
silent — an intent that was never sent is a fact somebody will need later:

1. a kill switch is engaged;
2. the recipient opted out of this purpose;
3. the retry budget for this intent is spent.

Nothing here retries in-process. A failed delivery is recorded and the intent is left for the
sweep, because a retry loop inside a request holds a transaction open across a provider's bad day.
"""

import hashlib
import logging
from datetime import datetime, timedelta
from typing import Any, Final
from uuid import UUID

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.identity.models import CommunicationPreference, User
from apps.notifications.models import (
    CustomerPushSubscription,
    KillSwitch,
    NotificationDelivery,
    NotificationIntent,
)

logger = logging.getLogger(__name__)
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
    NotificationIntent.Channel.PUSH: KillSwitch.Scope.PUSH,
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
        "booking.downgraded_to_scheduled",
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
        # First-accept-wins with a wall-clock timeout: a Partner who muted this would go on
        # losing races they never knew had started.
        "m2.fixed_visit_offer.received",
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
        # A7 Rentals. A booking confirmation has the handover PIN. A claim decision moves
        # deposit money. An overdue return starts a countdown to auto-refund. All three have
        # the same test: a reader who muted this would lose money or be left guessing.
        "rental.booking.confirmed",
        "rental.claim.raised",
        "rental.claim.decided",
        "rental.overdue",
        "rental.enquiry.quoted",
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


#: The column every composed key has to fit. Read from the field rather than written down, so
#: widening the column later cannot leave a stale number here disagreeing with it.
#: The field API types `max_length` as `int | None`, None meaning unbounded -- which this column
#: is not. The fallback keeps the annotation honest without pretending that case is reachable.
IDEMPOTENCY_KEY_MAX_LENGTH: Final[int] = (
    NotificationIntent._meta.get_field("idempotency_key").max_length or 128
)

#: Hex characters of SHA-256 kept when a key has to be shortened. Sixty-four bits, against a space
#: of keys that are already scoped to one recipient and one event.
_DIGEST_LENGTH: Final[int] = 16


def fit_idempotency_key(key: str) -> str:
    """Make a composed idempotency key fit the column, without losing what it distinguishes.

    Every caller builds one of these by concatenation -- `notify_for_outbox_event` wraps the
    outbox event's own key in `in-app:{key}:{recipient_id}`, the escalation ladder appends a
    channel -- and `OutboxEvent.idempotency_key` is exactly as wide as this one. A key read from
    that column and grown by forty-four characters therefore cannot be written back, which is a
    `DataError` inside the outbox handler: the event retries to `FAILED` and the notification is
    never delivered, silently.

    Enforced here rather than at each call site because this module owns the column. A rule
    applied at two of three callers is a rule the third does not know about.

    **Plain truncation would be worse than the crash.** These keys carry what distinguishes them
    at the *end* -- a timestamp, a recipient id -- so `key[:128]` would collapse two different
    events into one and drop the second notification entirely. So the head is kept for reading and
    a digest of the **whole** key is appended: same input always yields the same output, and two
    inputs sharing a prefix do not collide.

    A key that already fits is returned untouched. These are grepped for during support, and
    hashing every one of them to accommodate the rare long one would trade a daily cost for a
    rare one.
    """
    if len(key) <= IDEMPOTENCY_KEY_MAX_LENGTH:
        return key
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()[:_DIGEST_LENGTH]
    head = key[: IDEMPOTENCY_KEY_MAX_LENGTH - _DIGEST_LENGTH - 1]
    return f"{head}:{digest}"


@transaction.atomic
def request_notification(
    *,
    recipient_id: UUID,
    purpose: str,
    channel: str,
    template_code: str,
    context: dict[str, Any] | None = None,
    idempotency_key: str = "",
    deep_link: str = "",
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

    # Fitted before the lookup as well as the write, so a key that had to be shortened still
    # deduplicates against itself. Doing it only on the way in would make every retry of a long
    # key miss its own row and send again.
    idempotency_key = fit_idempotency_key(idempotency_key)
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
    app_id: str = "",
    request_payload: dict[str, Any] | None = None,
    response_status: int | None = None,
    response_body: dict[str, Any] | None = None,
    metrics: dict[str, Any] | None = None,
    completed_at: datetime | None = None,
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
        app_id=app_id,
        request_payload=request_payload or {},
        response_status=response_status,
        response_body=response_body or {},
        metrics=metrics or {},
        completed_at=completed_at,
    )
    intent.attempts += 1
    if status in (NotificationDelivery.Status.ACCEPTED, NotificationDelivery.Status.DELIVERED):
        intent.status = NotificationIntent.Status.SENT
    elif intent.attempts >= MAX_DELIVERY_ATTEMPTS or status in (
        NotificationDelivery.Status.SKIPPED,
        NotificationDelivery.Status.BLOCKED,
    ):
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

class CustomerPushReachabilityReason:
    ACTIVE_SUBSCRIPTION = "ACTIVE_SUBSCRIPTION"
    NO_ACTIVE_SUBSCRIPTION = "NO_ACTIVE_SUBSCRIPTION"
    OPTED_OUT = "OPTED_OUT"
    STALE_SUBSCRIPTION = "STALE_SUBSCRIPTION"
    PERMISSION_DENIED = "PERMISSION_DENIED"


def get_customer_push_reachability(user: User | None) -> dict[str, object]:
    """Answers whether a customer can receive OneSignal web push right now.

    Returns:
        dict:
            reachable: bool
            reason: str (ACTIVE_SUBSCRIPTION, NO_ACTIVE_SUBSCRIPTION, OPTED_OUT, STALE_SUBSCRIPTION, PERMISSION_DENIED)
            subscription_id: str | None
    """
    if user is None or not getattr(user, "is_authenticated", False):
        res = {
            "reachable": False,
            "reason": CustomerPushReachabilityReason.NO_ACTIVE_SUBSCRIPTION,
            "subscription_id": None,
        }
        return res

    user_id_str = str(user.id)
    latest_sub = CustomerPushSubscription.objects.filter(user=user).order_by("-updated_at").first()

    if latest_sub is None:
        reachable = False
        reason = CustomerPushReachabilityReason.NO_ACTIVE_SUBSCRIPTION
        sub_id = None
    else:
        active_sub = CustomerPushSubscription.objects.filter(
            user=user,
            is_active=True,
        ).order_by("-last_verified_at").first()

        if active_sub is None:
            sub_id = latest_sub.onesignal_subscription_id
            if latest_sub.permission_state.lower() == "denied":
                reason = CustomerPushReachabilityReason.PERMISSION_DENIED
            elif not latest_sub.opted_in:
                reason = CustomerPushReachabilityReason.OPTED_OUT
            else:
                reason = CustomerPushReachabilityReason.NO_ACTIVE_SUBSCRIPTION
            reachable = False
        else:
            sub_id = active_sub.onesignal_subscription_id
            if active_sub.permission_state.lower() == "denied":
                reason = CustomerPushReachabilityReason.PERMISSION_DENIED
                reachable = False
            elif not active_sub.opted_in:
                reason = CustomerPushReachabilityReason.OPTED_OUT
                reachable = False
            else:
                freshness_days = getattr(settings, "PUSH_SUBSCRIPTION_FRESHNESS_DAYS", 30)
                is_stale = (timezone.now() - active_sub.last_verified_at) > timedelta(days=freshness_days)
                if is_stale:
                    reason = CustomerPushReachabilityReason.STALE_SUBSCRIPTION
                    reachable = False
                else:
                    reason = CustomerPushReachabilityReason.ACTIVE_SUBSCRIPTION
                    reachable = True

    logger.info(
        "customer_push_reachability_checked",
        extra={
            "user_id": user_id_str,
            "role": "CUSTOMER",
            "reachable": reachable,
            "reason": reason,
            "subscription_id": sub_id,
        },
    )

    return {
        "reachable": reachable,
        "reason": reason,
        "subscription_id": sub_id,
    }


def sync_customer_push_subscription(
    *,
    user: User,
    onesignal_subscription_id: str,
    platform: str = CustomerPushSubscription.Platform.WEB,
    user_agent: str = "",
    is_active: bool = True,
    opted_in: bool = True,
    permission_state: str = "",
    action: str = "sync",
) -> tuple[CustomerPushSubscription, bool]:
    """Upsert CustomerPushSubscription.

    Returns:
        tuple[CustomerPushSubscription, bool]: (subscription, is_created)
    """
    clean_sub_id = (onesignal_subscription_id or "").strip()
    if not clean_sub_id:
        raise ValidationError({"onesignal_subscription_id": "Subscription ID cannot be empty."})

    user_id_str = str(user.id)
    logger.info(
        "customer_push_subscription_sync_started",
        extra={
            "user_id": user_id_str,
            "role": "CUSTOMER",
            "platform": platform,
            "permission_state": permission_state,
            "subscription_id": clean_sub_id,
            "sync_status": "STARTED",
            "failure_reason": "",
        },
    )

    # Cross-user validation: Ensure subscription does not belong to another user
    existing = CustomerPushSubscription.objects.filter(
        onesignal_subscription_id=clean_sub_id,
    ).first()
    if existing and existing.user_id != user.id:
        logger.warning(
            "customer_push_subscription_sync_failed",
            extra={
                "user_id": user_id_str,
                "role": "CUSTOMER",
                "existing_user_id": str(existing.user_id),
                "subscription_id": clean_sub_id,
                "sync_status": "FAILED",
                "failure_reason": "cross_user_denied",
            },
        )
        raise PermissionDenied("This push subscription belongs to another user account.")

    now = timezone.now()
    is_deactivate = action == "deactivate"
    effective_opted_in = False if is_deactivate else bool(opted_in)
    effective_is_active = bool(
        not is_deactivate
        and is_active
        and effective_opted_in
        and permission_state.lower() != "denied"
    )

    with transaction.atomic():
        # Deactivate older active WEB subscriptions for this customer if activating a new one
        if effective_is_active and platform == CustomerPushSubscription.Platform.WEB:
            CustomerPushSubscription.objects.filter(
                user=user,
                platform=CustomerPushSubscription.Platform.WEB,
                is_active=True,
            ).exclude(onesignal_subscription_id=clean_sub_id).update(
                is_active=False,
                updated_at=now,
            )

        subscription, is_created = CustomerPushSubscription.objects.update_or_create(
            onesignal_subscription_id=clean_sub_id,
            defaults={
                "user": user,
                "onesignal_external_id": user_id_str,
                "platform": platform,
                "user_agent": user_agent,
                "is_active": effective_is_active,
                "opted_in": effective_opted_in,
                "permission_state": permission_state,
                "last_verified_at": now,
                "last_sync_attempt_at": now,
                "last_sync_status": "SUCCESS",
                "last_sync_error": "",
            },
        )

    event_name = (
        "customer_push_subscription_created"
        if is_created
        else "customer_push_subscription_deactivated"
        if not effective_is_active
        else "customer_push_subscription_updated"
    )
    logger.info(
        event_name,
        extra={
            "user_id": user_id_str,
            "role": "CUSTOMER",
            "platform": platform,
            "permission_state": permission_state,
            "subscription_id": clean_sub_id,
            "sync_status": "SUCCESS",
            "failure_reason": "",
            "is_created": is_created,
        },
    )
    logger.info(
        "customer_push_subscription_sync_succeeded",
        extra={
            "user_id": user_id_str,
            "role": "CUSTOMER",
            "platform": platform,
            "permission_state": permission_state,
            "subscription_id": clean_sub_id,
            "sync_status": "SUCCESS",
            "failure_reason": "",
        },
    )

    return subscription, is_created

