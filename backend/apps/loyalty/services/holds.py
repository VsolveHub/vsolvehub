"""Waiting-period handling shared by booking coins and referral rewards."""

from uuid import UUID

from django.db import transaction

from apps.loyalty.services.coins import cancel_pending_grants_for_source, release_due_coin_grants
from apps.loyalty.services.referral import release_due_referral_rewards, requalify_after_refund


def release_due_rewards() -> dict[str, int]:
    """Nightly/periodic sweep: pay everything whose waiting period is over."""
    return {
        "coin_grants_released": release_due_coin_grants(),
        "referrals_paid": release_due_referral_rewards(),
    }


@transaction.atomic
def cancel_pending_rewards_for_source(*, source_type: str, source_id: UUID) -> None:
    """A refund inside the waiting period cancels the coins that booking earned and un-qualifies
    the referral it triggered. Already-released rewards are untouched (Operations can reverse).
    """
    reason = "Booking refunded during the waiting period"
    cancel_pending_grants_for_source(source_type=source_type, source_id=source_id, reason=reason)
    requalify_after_refund(source_type=source_type, source_id=source_id)
    # `CustomerCompletion` is deliberately left alone: it is the outbox idempotency record, and
    # deleting it would let a replayed completion event grant the coins again.


def cancel_pending_rewards_for_order(*, order_id: UUID) -> None:
    """Commerce refund hook: run the cancel for every booking on the refunded order."""
    from apps.commerce.models import Booking  # noqa: PLC0415 - commerce imports loyalty

    for booking_id in Booking.objects.filter(order_id=order_id).values_list("id", flat=True):
        cancel_pending_rewards_for_source(source_type="BOOKING", source_id=booking_id)
