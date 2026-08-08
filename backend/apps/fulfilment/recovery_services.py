"""Post-booking Partner release and recovery.

A released Partner does not get a second, parallel assignment mechanism: Operations reoffers
the unit through `apps.assignments.group_services.create_manual_unit_offer` — the same
manual-offer / accept / commit path BE-07 already built and tested — and once a replacement
Partner's offer commits, `recover_booking_partner` rewrites the *same* `Booking` row's
partner/reservation/schedule fields in place (the one deliberate mutability exception documented
on `commerce.Booking`), rather than creating a second `Booking` for the same `FulfilmentUnit`.
"""

from uuid import UUID

from django.db import transaction

from apps.assignments.group_services import create_manual_unit_offer
from apps.assignments.models import PartnerOffer, Reservation
from apps.commerce.models import Booking
from apps.foundation.services import enqueue_outbox_event
from apps.fulfilment.exceptions import BookingCommandInvalidApiError
from apps.fulfilment.services import (
    BookingCommand,
    apply_transition,
    guard_booking_version,
    locked_booking_context,
)
from apps.identity.models import User

# Every status `ALLOWED_TRANSITIONS` lets move to `RECOVERY_REQUIRED` — a Partner can release
# before starting, en route, on site, or mid-job; there is one recovery path for all of them.
RELEASABLE_BOOKING_STATUSES = (
    Booking.Status.CONFIRMED,
    Booking.Status.EN_ROUTE,
    Booking.Status.ARRIVED,
    Booking.Status.IN_PROGRESS,
)


@transaction.atomic
def release_booking_partner(
    *,
    booking_id: UUID,
    partner_id: UUID,
    reason: str,
    expected_version: int,
    idempotency_key: str = "",
) -> Booking:
    """The assigned Partner can no longer fulfil this Booking. Frees the held reservation
    immediately so the Fulfilment Unit's time slot is not left stuck against them."""

    group, unit, booking = locked_booking_context(booking_id)
    if booking.partner_id != partner_id:
        raise PermissionError("This Booking belongs to another Partner.")
    if booking.status == Booking.Status.RECOVERY_REQUIRED:
        return booking
    guard_booking_version(booking, expected_version)
    if booking.status not in RELEASABLE_BOOKING_STATUSES:
        raise BookingCommandInvalidApiError(
            reason=f"A Booking in {booking.status} cannot be released by the Partner."
        )
    if not reason.strip():
        raise BookingCommandInvalidApiError(reason="A reason is required to release a Booking.")
    booking = apply_transition(
        group=group,
        unit=unit,
        booking=booking,
        to_status=Booking.Status.RECOVERY_REQUIRED,
        command=BookingCommand.PARTNER_RELEASE,
        actor=booking.partner.user,
        reason=reason,
        idempotency_key=idempotency_key,
    )
    reservation = Reservation.objects.select_for_update().get(id=booking.reservation_id)
    if reservation.status != Reservation.Status.RELEASED:
        reservation.release()
    request_booking_replacement(booking)
    return booking


def request_booking_replacement(booking: Booking) -> None:
    """Ask for a replacement search, after this transaction commits.

    Through the outbox rather than by calling `attempt_booking_replacement` inline, for the
    reason the outbox exists: the release itself must not be able to fail because the search
    did. A Partner pressing "I cannot make it" is entitled to have that recorded even if every
    candidate query times out, and an event the worker retries is what separates the two.

    The key carries `booking.version`, so a Booking that is released, recovered and released
    again raises a genuinely new event instead of being de-duplicated against the first one and
    silently never searched for.
    """

    enqueue_outbox_event(
        aggregate_type="booking",
        aggregate_id=booking.id,
        event_type="booking.replacement_requested",
        idempotency_key=f"replacement:{booking.id}:{booking.version}",
        payload={"booking_id": str(booking.id)},
    )


def start_partner_recovery_offer(*, unit_id: UUID, partner_id: UUID) -> PartnerOffer:
    """Operations manually names a replacement Partner — never an auto-ranked pick — through the
    same manual-offer path BE-07 already built for pre-payment recovery."""

    return create_manual_unit_offer(unit_id=unit_id, partner_id=partner_id)


@transaction.atomic
def adopt_replacement_reservation(
    *,
    booking_id: UUID,
    reservation_id: UUID,
    actor: User | None = None,
    idempotency_key: str = "",
    context: dict[str, object] | None = None,
) -> Booking:
    """Point a Booking awaiting recovery at the replacement Partner's reservation.

    Shared by both routes into a recovery, because they arrive holding different things. A
    same-day replacement comes through offer / accept / commit and hands over the reservation
    its offer created; an advance one is locked in by `directly_assign`, which returns a bare
    `Reservation` with no offer round-trip to hang anything off. The Booking rewrite is the
    same either way, so it lives here once.

    The reservation is `CONFIRMED` rather than left `TENTATIVE`. A tentative hold exists to
    survive a payment window, and this Booking's payment was captured at the original checkout
    — there is no second payment coming, so a hold that expires would strand the visit again.
    """

    group, unit, booking = locked_booking_context(booking_id)
    reservation = Reservation.objects.select_for_update().get(id=reservation_id)
    if reservation.fulfilment_unit_id != unit.id:
        raise BookingCommandInvalidApiError(
            reason="This reservation is not for this Booking's Fulfilment Unit."
        )
    if booking.status == Booking.Status.CONFIRMED and booking.reservation_id == reservation.id:
        return booking
    if booking.status != Booking.Status.RECOVERY_REQUIRED:
        raise BookingCommandInvalidApiError(
            reason=f"A Booking in {booking.status} is not awaiting Partner recovery."
        )
    if reservation.status != Reservation.Status.CONFIRMED:
        reservation.status = Reservation.Status.CONFIRMED
        reservation.released_at = None
        reservation.save(update_fields=("status", "released_at"))
    return apply_transition(
        group=group,
        unit=unit,
        booking=booking,
        to_status=Booking.Status.CONFIRMED,
        command=BookingCommand.RECOVER_PARTNER,
        actor=actor,
        idempotency_key=idempotency_key,
        context={"new_partner_id": str(reservation.partner_id), **(context or {})},
        extra_booking_fields={
            "partner": reservation.partner,
            "reservation": reservation,
            "scheduled_start": unit.requested_start,
            "estimated_duration_minutes": unit.estimated_duration_minutes,
        },
    )


@transaction.atomic
def recover_booking_partner(
    *,
    booking_id: UUID,
    offer_id: UUID,
    operator: User,
    expected_version: int,
    idempotency_key: str = "",
) -> Booking:
    """Rewrite the Booking's partner/reservation/schedule once the replacement's offer commits."""

    _group, unit, booking = locked_booking_context(booking_id)
    # `reservation` is nullable on `PartnerOffer` (it is only set once the replacement accepts),
    # so it cannot be `select_related` under `select_for_update` — Postgres refuses `FOR UPDATE`
    # on the nullable side of an outer join. Lock the offer row alone; the reservation is locked
    # separately below, only once we know it exists.
    offer = PartnerOffer.objects.select_for_update().select_related("partner").get(id=offer_id)
    if (
        booking.status == Booking.Status.CONFIRMED
        and booking.partner_id == offer.partner_id
        and booking.reservation_id == offer.reservation_id
    ):
        return booking
    if booking.status != Booking.Status.RECOVERY_REQUIRED:
        raise BookingCommandInvalidApiError(
            reason=f"A Booking in {booking.status} is not awaiting Partner recovery."
        )
    guard_booking_version(booking, expected_version)
    if offer.fulfilment_unit_id != unit.id:
        raise BookingCommandInvalidApiError(
            reason="This offer is not for this Booking's Fulfilment Unit."
        )
    if offer.status != PartnerOffer.Status.COMMITTED or offer.reservation_id is None:
        raise BookingCommandInvalidApiError(reason="This replacement offer has not committed yet.")
    # The offer is validated; the rewrite itself is the shared one.
    return adopt_replacement_reservation(
        booking_id=booking.id,
        reservation_id=offer.reservation_id,
        actor=operator,
        idempotency_key=idempotency_key,
        context={"offer_id": str(offer.id)},
    )
