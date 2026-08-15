"""A3's front door: the quote unlock, from checkout to refund (`M2-BE-401`..`405`).

One purchase, one lifecycle. `create_unlock_checkout` starts the charge only when a usable quote is
already live, `complete_unlock` grants it only from a verified provider callback, and
`refund_unlock` / `consume_unlock` are the two ways the fee stops being refundable — one gives it
back, the other marks it earned. `unlock_availability` is the read-only mirror of the first guard.

The boundary is the archetype: nothing here touches a `VisitPlan`. The A5 twin of every command in
this module lives in `visit_plans`, and the one thing that spans both — carrying an unlock's money
onto a plan when a requirement is reclassified — is in `reclassification`.
"""

import uuid

from django.db import transaction
from django.utils import timezone

from apps.commerce.models import PaymentAttempt
from apps.commerce.services import (
    allocate_document_number,
    initiate_standalone_payment_attempt,
    request_standalone_refund,
)
from apps.foundation.services import enqueue_outbox_event
from apps.identity.models import User
from apps.requirements import pricing, purchase_gates
from apps.requirements.exceptions import (
    LifecycleNotSupportedError,
    RequirementTransitionError,
    UnlockNotAvailableError,
)
from apps.requirements.models import CustomerRequirement, QuoteUnlock
from apps.requirements.services import record_transition

from .base import A3, ACCESS_RECEIPT_KIND, active_unlock, usable_proposals

# ---------------------------------------------------------------------------
# A3 — quote unlock (`M2-BE-401`..`405`)
# ---------------------------------------------------------------------------


def unlock_availability(requirement: CustomerRequirement) -> bool:
    """Mirrors the command's own guard, for the teaser screen's disabled state.

    A read, never a decision: `create_unlock_checkout` re-checks independently, because a stale
    `true` on a client is exactly the state a duplicate purchase lives in.

    Consults the Wave C7 purchase pause (`M2-BE-810`) too, and that is why the mirror has to be
    kept honest rather than merely close: without it a paused product publishes
    `is_available: true`, the Customer taps, and the refusal arrives after they have committed to
    paying. A disabled button with an explanation is the same rule delivered before the tap.
    """
    return (
        requirement.archetype == A3
        and requirement.status == CustomerRequirement.Status.QUOTES_READY
        and active_unlock(requirement) is None
        and bool(usable_proposals(requirement))
        and purchase_gates.new_purchases_allowed(variant_id=requirement.variant_id)
    )


@transaction.atomic
def create_unlock_checkout(
    *, requirement_id: uuid.UUID, actor: User, idempotency_key: str
) -> tuple[QuoteUnlock, PaymentAttempt]:
    """Start the INR-149-class charge that unlocks delivered quotes. A3 only.

    Refuses unless at least one **usable** quote is live at this instant. That is what makes
    "paid but nothing happened" unreachable rather than merely unlikely: there is no window in
    which a Customer can pay for an empty list, because the guard runs under the requirement's own
    row lock in the same transaction that creates the attempt.
    """
    requirement = (
        CustomerRequirement.objects.select_for_update(of=("self",))
        .select_related("configuration")
        .get(pk=requirement_id)
    )
    if requirement.archetype != A3:
        raise LifecycleNotSupportedError(
            "Project requests do not use a quote unlock; they use a visit plan.",
        )
    if requirement.status in CustomerRequirement.CLOSED_STATUSES:
        raise RequirementTransitionError("This request is closed.")

    existing = (
        QuoteUnlock.objects.select_for_update()
        .filter(
            requirement=requirement,
            status__in=(
                QuoteUnlock.Status.PENDING,
                QuoteUnlock.Status.ACTIVE,
                QuoteUnlock.Status.CONSUMED,
            ),
        )
        .first()
    )
    if existing is not None:
        if existing.status == QuoteUnlock.Status.PENDING and existing.payment_attempt is not None:
            # Resume rather than start a second charge. A Customer who closed the tab mid-payment
            # comes back to the attempt they already have, which is the same shape
            # `fulfilment.amendments.approve_scope_amendment` uses for the same situation.
            return existing, existing.payment_attempt
        raise UnlockNotAvailableError("You have already unlocked the quotes for this request.")

    if not usable_proposals(requirement):
        raise UnlockNotAvailableError()

    # `M2-BE-810`, and deliberately **after** the resume branch above. A Customer returning to a
    # `PENDING` attempt they already started is continuing a purchase, not making a new one, and
    # refusing them there would leave them holding a charge nobody would honour. Only the path
    # that is about to create a *new* `PaymentAttempt` consults the gate.
    purchase_gates.assert_new_purchase_allowed(requirement, door="a3_unlock_checkout")

    price = pricing.unlock_price()
    attempt = initiate_standalone_payment_attempt(
        purpose=PaymentAttempt.Purpose.M2_QUOTE_UNLOCK,
        amount_paise=price.amount_paise,
        idempotency_key=idempotency_key,
    )
    unlock = QuoteUnlock.objects.create(
        requirement=requirement,
        price=price.row,
        price_paise=price.amount_paise,
        payment_attempt=attempt,
        status=QuoteUnlock.Status.PENDING,
    )
    # Who started this charge, and when. The requirement does not move state here — it moves on the
    # verified callback — but a payment dispute asks "who authorised this", and the answer has to
    # exist before the money does rather than being reconstructed from a provider log afterwards.
    record_transition(
        requirement=requirement,
        from_status=requirement.status,
        to_status=requirement.status,
        actor=actor,
        reason_code="unlock_checkout_started",
        reason=f"quote_unlock:{unlock.id} for {price.amount_paise} paise",
    )
    return unlock, attempt


@transaction.atomic
def complete_unlock(*, payment_attempt_id: uuid.UUID) -> QuoteUnlock | None:
    """Grant the unlock. Called only from a verified provider callback.

    Idempotent three ways, because duplicate webhooks, provider retries and a reconciliation sweep
    all arrive here: the row lock serialises them, an already-`ACTIVE` unlock returns untouched,
    and `requirements_one_live_unlock_per_requirement` makes a second row impossible even if this
    function were somehow entered twice for one requirement.
    """
    unlock = (
        QuoteUnlock.objects.select_for_update(of=("self",))
        .select_related("requirement", "payment_attempt")
        .filter(payment_attempt_id=payment_attempt_id)
        .first()
    )
    if unlock is None:
        return None
    if unlock.status in (QuoteUnlock.Status.ACTIVE, QuoteUnlock.Status.CONSUMED):
        return unlock
    attempt = unlock.payment_attempt
    if attempt is None or attempt.status != PaymentAttempt.Status.CAPTURED:
        return unlock
    if attempt.amount_paise != unlock.price_paise:
        # Amount tampering, or a price that moved between checkout and capture. Neither is an
        # unlock: the purchase snapshot is the authority and a mismatch is a financial exception,
        # not a discount.
        unlock.status = QuoteUnlock.Status.FAILED
        unlock.failure_code = "amount_mismatch"
        unlock.save(update_fields=("status", "failure_code", "updated_at"))
        return unlock

    requirement = CustomerRequirement.objects.select_for_update().get(pk=unlock.requirement_id)
    series, sequence = allocate_document_number(kind=ACCESS_RECEIPT_KIND)
    unlock.status = QuoteUnlock.Status.ACTIVE
    unlock.activated_at = timezone.now()
    unlock.unlocked_proposal_ids = [str(item.id) for item in usable_proposals(requirement)]
    unlock.receipt_series = series
    unlock.receipt_sequence = sequence
    unlock.save(
        update_fields=(
            "status",
            "activated_at",
            "unlocked_proposal_ids",
            "receipt_series",
            "receipt_sequence",
            "updated_at",
        )
    )
    if requirement.status == CustomerRequirement.Status.QUOTES_READY:
        requirement.status = CustomerRequirement.Status.UNLOCKED
        requirement.save(update_fields=("status", "updated_at"))
        # `actor=None` and it has to be: the party that moved this is the provider callback, not a
        # person. Attributing it to the Customer would put a signature on a state change they did
        # not make, in the trail that exists to prove who made which one.
        record_transition(
            requirement=requirement,
            from_status=CustomerRequirement.Status.QUOTES_READY,
            to_status=CustomerRequirement.Status.UNLOCKED,
            actor=None,
            reason_code="unlock_payment_verified",
            reason=f"quote_unlock:{unlock.id}",
        )
    enqueue_outbox_event(
        aggregate_type="requirement",
        aggregate_id=requirement.id,
        event_type="m2.unlock.activated",
        idempotency_key=f"unlock-activated:{unlock.id}",
        payload={"requirement_id": str(requirement.id), "quote_unlock_id": str(unlock.id)},
    )
    return unlock


@transaction.atomic
def refund_unlock(*, unlock_id: uuid.UUID, reason_code: str) -> QuoteUnlock:
    """Give the unlock fee back. Idempotent by state.

    Used by `service_by` expiry and by "every unlocked vendor fell through". A `CONSUMED` unlock is
    **not** refunded — an engagement exists, so the fee was earned.
    """
    unlock = QuoteUnlock.objects.select_for_update().get(pk=unlock_id)
    if unlock.status != QuoteUnlock.Status.ACTIVE:
        return unlock
    if unlock.payment_attempt_id is not None:
        unlock.refund = request_standalone_refund(
            payment_attempt_id=unlock.payment_attempt_id,
            amount_paise=unlock.price_paise,
            reason_code=reason_code,
            idempotency_key=f"m2-unlock-refund:{unlock.id}",
        )
    unlock.status = QuoteUnlock.Status.REFUNDED
    unlock.refunded_at = timezone.now()
    unlock.save(update_fields=("status", "refund", "refunded_at", "updated_at"))
    return unlock


@transaction.atomic
def consume_unlock(*, requirement: CustomerRequirement) -> QuoteUnlock | None:
    """Mark the fee earned. Called when an engagement opens on an A3 requirement."""
    unlock = (
        QuoteUnlock.objects.select_for_update()
        .filter(requirement=requirement, status=QuoteUnlock.Status.ACTIVE)
        .first()
    )
    if unlock is None:
        return None
    unlock.status = QuoteUnlock.Status.CONSUMED
    unlock.consumed_at = timezone.now()
    unlock.save(update_fields=("status", "consumed_at", "updated_at"))
    return unlock
