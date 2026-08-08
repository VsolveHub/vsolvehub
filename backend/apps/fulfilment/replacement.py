"""Automatic post-payment Partner replacement, and the settlement when there is nobody left.

`recovery_services` can rewrite a Booking onto a replacement Partner, but only once somebody
has already found one. This module is the part that goes looking, and the part that decides
when to stop looking.

## One engine, not two

Nothing here ranks, filters or offers anything itself. `attempt_booking_replacement` calls
`assignments.group_services.dispatch_unit` — the same function the pre-payment path calls — so
a replacement is found by the same eligibility rules, the same ranking, the same candidate
limit and the same offer shape as the original assignment. The two arms of that function are
the two commitment mechanisms and they land differently here: a same-day unit gets a
`PartnerOffer`, which is a *question* and has to be waited on, while an advance unit gets a
`Reservation` from `directly_assign`, which is already an *answer* and is adopted immediately.

## Why a search has to be able to fail

A visit that has been paid for and cannot be staffed is not allowed to sit in
`RECOVERY_REQUIRED` until its start time passes. `settle_unstaffable_booking` cancels it and
returns the money in full, with no cancellation fee — the Customer did not change their mind,
the platform failed to staff what it sold — and touches only that one visit. The rest of the
order is other work by other Partners and has nothing to do with this failure.
"""

from datetime import datetime, timedelta
from uuid import UUID

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.assignments.group_services import dispatch_unit
from apps.assignments.models import PartnerOffer, Reservation
from apps.carts.models import FulfilmentUnit
from apps.commerce.models import Booking, Refund
from apps.fulfilment.recovery_services import adopt_replacement_reservation
from apps.fulfilment.refunds import create_partial_refunds, refundable_unit_allocations
from apps.fulfilment.services import (
    BookingCommand,
    apply_transition,
    locked_booking_context,
)
from apps.notifications.services import request_notification

#: The refund reason code for a visit nobody could be found for. Distinct from
#: `cancellation.REFUND_REASON_CUSTOMER_CANCELLATION` on purpose: Finance reads these codes to
#: tell "the Customer changed their mind" from "we could not deliver", and the two have
#: different fee treatment, different reporting and different follow-up.
REPLACEMENT_UNAVAILABLE = "replacement_unavailable"

#: Offer statuses that still bind a candidate to the unit. A settlement has to clear these, or
#: a Partner can accept a visit that has already been cancelled and refunded.
_LIVE_OFFER_STATUSES = (
    PartnerOffer.Status.OFFERED,
    PartnerOffer.Status.ACCEPTED_PENDING_UNDO,
)


def _replacement_deadline(unit: FulfilmentUnit) -> datetime:
    """The moment the search gives up, so a refund still arrives in time to be useful."""

    return unit.requested_start - timedelta(minutes=settings.M1_REPLACEMENT_DEADLINE_MINUTES)


def _replacement_offer_ttl_seconds(unit: FulfilmentUnit) -> int | None:
    """A shorter offer clock near the visit; `None` outside that window means "use the default".

    Only the clock moves. Eligibility is never widened — a Partner who does not offer the
    variant, is not approved, or is not free still cannot do the job at any distance from the
    visit. What changes is how long a *silent* candidate is allowed to hold the search up: at
    the standard 45 seconds, three silent candidates consume most of the time left before the
    deadline, and the Customer is refunded because of dead air rather than because nobody was
    available.
    """

    urgent_from = unit.requested_start - timedelta(minutes=settings.M1_REPLACEMENT_URGENT_MINUTES)
    if timezone.now() < urgent_from:
        return None
    return int(settings.M1_REPLACEMENT_URGENT_OFFER_TTL_SECONDS)


def _revoke_live_offers(unit: FulfilmentUnit) -> None:
    now = timezone.now()
    offers = list(
        PartnerOffer.objects.select_for_update().filter(
            fulfilment_unit=unit, status__in=_LIVE_OFFER_STATUSES
        )
    )
    for offer in offers:
        offer.status = PartnerOffer.Status.REVOKED
        offer.responded_at = now
        offer.save(update_fields=("status", "responded_at"))
        if offer.reservation_id is not None:
            reservation = Reservation.objects.select_for_update().get(id=offer.reservation_id)
            if reservation.status != Reservation.Status.RELEASED:
                reservation.release()


def _release_booking_reservation(booking: Booking) -> None:
    if booking.reservation_id is None:
        return
    reservation = Reservation.objects.select_for_update().get(id=booking.reservation_id)
    if reservation.status != Reservation.Status.RELEASED:
        reservation.release()


@transaction.atomic
def settle_unstaffable_booking(*, booking_id: UUID) -> tuple[Booking, list[Refund]]:
    """Nobody can take this visit. Cancel it and return the Customer's money in full.

    Only this visit. A Booking Group is several visits by several Partners, and one Partner
    dropping out says nothing about the others — cancelling the group would refund work that is
    still going to happen.

    No cancellation fee, and deliberately not routed through the fee ladder in
    `cancellation.py` even though the shape is similar. The ladder prices *the Customer's*
    decision to walk away by how close to the visit they did it. This is not their decision.

    Idempotent twice over: the status guard returns before anything is written on a second
    call, and `refundable_unit_allocations` has already subtracted the first call's in-flight
    refunds, so even a racing caller cannot raise a second one. A replay returns `[]` for the
    refunds — read the `BookingStatusHistory` context for the ids the first call raised.
    """

    group, unit, booking = locked_booking_context(booking_id)
    if booking.status != Booking.Status.RECOVERY_REQUIRED:
        return booking, []
    _revoke_live_offers(unit)
    refund_amount_paise = sum(
        amount for _allocation, amount in refundable_unit_allocations(unit=unit)
    )
    refunds = create_partial_refunds(
        booking=booking,
        unit=unit,
        refund_amount_paise=refund_amount_paise,
        reason_code=REPLACEMENT_UNAVAILABLE,
        requested_by_id=booking.customer_id,
        idempotency_key=f"unstaffable:{booking.id}",
    )
    reason = "No replacement professional was available for this visit."
    booking = apply_transition(
        group=group,
        unit=unit,
        booking=booking,
        to_status=Booking.Status.CANCELLED,
        command=BookingCommand.CANCEL,
        actor=None,
        reason=reason,
        idempotency_key=f"unstaffable:{booking.id}",
        context={
            "trigger": REPLACEMENT_UNAVAILABLE,
            "fee_paise": 0,
            "refund_paise": refund_amount_paise,
            "refund_ids": [str(refund.id) for refund in refunds],
        },
        extra_booking_fields={"cancelled_at": timezone.now(), "cancellation_reason": reason},
    )
    _release_booking_reservation(booking)
    request_notification(
        recipient_id=booking.customer_id,
        purpose="booking.replacement_unavailable",
        channel="PUSH",
        template_code="customer_booking_unstaffable",
        context={
            "booking_id": str(booking.id),
            "fulfilment_unit_id": str(unit.id),
            "requested_start": unit.requested_start.isoformat(),
            "refund_paise": refund_amount_paise,
        },
        idempotency_key=f"unstaffable-notice:{booking.id}",
    )
    return booking, refunds


@transaction.atomic
def attempt_booking_replacement(*, booking_id: UUID) -> Booking:
    """One pass at finding a replacement Partner. Safe to call as often as you like.

    Every early return is a real "nothing to do here", not a swallowed failure:

    * the Booking is no longer awaiting recovery — somebody already recovered or cancelled it;
    * a candidate is already holding a live offer — the answer is pending, not missing;
    * the deadline has passed, or the candidate pool is exhausted — settled and refunded.

    The pool walks itself down. `evaluate_unit_candidates` excludes any Partner who already has
    an `AssignmentAttempt` on this unit, so successive passes reach successively lower-ranked
    candidates without this function tracking a position of its own.
    """

    group, unit, booking = locked_booking_context(booking_id)
    if booking.status != Booking.Status.RECOVERY_REQUIRED:
        return booking
    if PartnerOffer.objects.filter(fulfilment_unit=unit, status__in=_LIVE_OFFER_STATUSES).exists():
        return booking
    if timezone.now() >= _replacement_deadline(unit):
        settled, _refunds = settle_unstaffable_booking(booking_id=booking.id)
        return settled
    outcome = dispatch_unit(
        group=group,
        unit=unit,
        offer_ttl_seconds=_replacement_offer_ttl_seconds(unit),
    )
    if outcome is None:
        # No eligible candidate is left. That is an answer, and the Customer is entitled to it
        # now rather than at the visit's start time.
        settled, _refunds = settle_unstaffable_booking(booking_id=booking.id)
        return settled
    if isinstance(outcome, Reservation):
        # The advance route: `directly_assign` already locked the Partner in and wrote the hold,
        # so there is no offer round-trip to wait for and the Booking adopts it immediately.
        return adopt_replacement_reservation(booking_id=booking.id, reservation_id=outcome.id)
    # The same-day route: an offer is out. Accepting and committing it is what finishes the
    # recovery (`group_services._commit_locked_unit_offer`); declining chains to the next
    # candidate; silence is picked up by `tasks.sweep_bookings_awaiting_replacement`.
    return booking
