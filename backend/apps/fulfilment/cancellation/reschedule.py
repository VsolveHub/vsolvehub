"""Amending a booked visit rather than ending it: a new time, or a new address.

The boundary: every command that keeps the Booking alive. The notice rule, the refusal copy the
Customer is shown, the arrival-window grid a new time is picked from, the unit-scoped and
group-wide reschedules, and the group's address change — which lives here because it is the
other amendment of a live booked group, not because it moves a clock.

Rescheduling is free at every point it is allowed at all, so there is deliberately no fee ladder
in this module. Ending a visit and the money that follows from it are `cancel`'s; nothing here
reaches for them.
"""

from dataclasses import dataclass
from datetime import timedelta
from typing import Any
from uuid import UUID

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone
from psycopg.types.range import Range

from apps.assignments.models import Reservation
from apps.carts.availability import load_snapshot
from apps.carts.exceptions import BookingGroupConflictApiError
from apps.carts.models import BookingGroup, FulfilmentUnit
from apps.carts.services import build_arrival_window_grid
from apps.commerce.models import Booking
from apps.fulfilment.exceptions import (
    BookingCommandInvalidApiError,
    OutsideServiceableAreaApiError,
    PartnerUnavailableApiError,
)
from apps.fulfilment.models import BookingOtp
from apps.fulfilment.services import (
    TERMINAL_BOOKING_STATUSES,
    BookingCommand,
    guard_booking_version,
    is_partner_late,
    locked_booking_context,
    record_transition,
)
from apps.locations.models import Address, ServiceArea
from apps.locations.services import check_serviceability
from apps.partners.models import PartnerProfile
from apps.partners.selectors import partner_available_during

from .base import _guard_group_idempotency_key, _locked_group_bookings

#: The only Booking statuses a visit can still be moved from. A visit that has arrived or started
#: is settled through its completion report, not by moving it.
RESCHEDULABLE_BOOKING_STATUSES = (Booking.Status.CONFIRMED, Booking.Status.EN_ROUTE)


def _reschedule_notice_ok(*, unit: FulfilmentUnit, booking: Booking) -> bool:
    """Whether there is still enough notice to move this visit rather than cancel it.

    Its own boundary — `M1_RESCHEDULE_FREE_NOTICE_HOURS` — and no longer the fee ladder's.
    Reading the free cancellation band meant reschedule closed 24 hours out, which sent a
    Customer who only wanted a different time into cancelling and paying a fee to rebook the
    same work. Cancelling releases the Partner and loses the job; rescheduling keeps both and
    re-times them, so it can stay open much closer to the visit.

    Rescheduling is free at any point it is allowed at all. There is no fee ladder here and
    deliberately no second one: a Customer either has enough notice to move the visit or they
    do not, and charging them for the privilege of keeping the booking would be charging for
    the outcome the platform prefers.

    The Partner-late waiver stays and comes first. A Partner who has not turned up has already
    broken the notice this rule is protecting.
    """

    if is_partner_late(booking=booking, unit=unit):
        return True
    hours_until_start = (unit.requested_start - timezone.now()).total_seconds() / 3600
    return hours_until_start > settings.M1_RESCHEDULE_FREE_NOTICE_HOURS


#: Why a reschedule is refused, and the sentence the Customer is shown for it.
#:
#: The strings live here, next to the guards that raise them, so the refusal at submit and the
#: warning before the Customer ever picks a slot are literally the same sentence. They used to
#: be two: the command refused with this text while the screen offered a full grid of times,
#: every one of which was going to be rejected.
RESCHEDULE_BLOCKED_SETTLED = "This visit is already finished and cannot be rescheduled."
RESCHEDULE_BLOCKED_RECOVERY = (
    "We are assigning a new professional to this visit. Once someone is assigned you can move "
    "it — or cancel now for a full refund."
)
RESCHEDULE_BLOCKED_STARTED = (
    "Only a visit that has not started can be rescheduled. This one is already under way, and "
    "is settled through its completion report."
)
#: Interpolated with the notice window so the sentence cannot drift from the setting that
#: decides it — the previous copy said "this close to the visit" and named no number at all,
#: which left a Customer no way to know whether waiting or acting was the mistake.
RESCHEDULE_BLOCKED_TOO_CLOSE_TEMPLATE = (
    "Visits can be moved free of charge up to {hours} hours before they start, and this one is "
    "closer than that. You can still cancel — the cancellation fee shows what applies — and "
    "book a new time."
)


def _too_close_reason() -> str:
    return RESCHEDULE_BLOCKED_TOO_CLOSE_TEMPLATE.format(
        hours=settings.M1_RESCHEDULE_FREE_NOTICE_HOURS
    )


def _reschedule_blocked_reason(*, unit: FulfilmentUnit, booking: Booking) -> str:
    """Empty when the visit may be moved; otherwise the reason, in the Customer's words.

    Both checks are about the visit's *current* start, not the new one the Customer is about to
    pick — which is the distinction that made this worth publishing. The notice rule asks how
    close the existing visit is; the minimum-notice floor on the grid asks how soon the new
    time is. A visit fourteen hours away fails the first while every slot in the grid passes
    the second, so a screen that only knew about the second offered a page of times that were
    all going to be refused.
    """

    if booking.status in TERMINAL_BOOKING_STATUSES:
        return RESCHEDULE_BLOCKED_SETTLED
    if booking.status == Booking.Status.RECOVERY_REQUIRED:
        # Not "already under way" — the opposite. There is nobody to move yet, which is a wait
        # rather than a refusal, and the copy has to say which of the two it is.
        return RESCHEDULE_BLOCKED_RECOVERY
    if booking.status not in RESCHEDULABLE_BOOKING_STATUSES:
        return RESCHEDULE_BLOCKED_STARTED
    if not _reschedule_notice_ok(unit=unit, booking=booking):
        return _too_close_reason()
    return ""


@dataclass(frozen=True, slots=True)
class ReschedulePreview:
    """Whether this visit can be moved at all, decided by the server before anything is picked.

    `earliest_start` is published even when `is_available` is false: it is the floor the picker
    would use, and sending it unconditionally keeps the field's meaning constant rather than
    making the client handle a hole.
    """

    is_available: bool
    #: Empty when available. Otherwise the same sentence the command would refuse with.
    unavailable_reason: str
    earliest_start: Any


def preview_reschedule(*, unit: FulfilmentUnit, booking: Booking) -> ReschedulePreview:
    reason = _reschedule_blocked_reason(unit=unit, booking=booking)
    return ReschedulePreview(
        is_available=not reason,
        unavailable_reason=reason,
        earliest_start=_earliest_reschedule_start(),
    )


def _earliest_reschedule_start() -> Any:
    return timezone.now() + timedelta(minutes=settings.M1_RESCHEDULE_MIN_NOTICE_MINUTES)


def _partner_has_other_reservation(
    *,
    partner: PartnerProfile,
    starts_at: Any,
    duration_minutes: int,
    exclude_reservation_id: UUID | None,
) -> bool:
    occupied_end = starts_at + timedelta(minutes=duration_minutes + settings.M1_TURNAROUND_MINUTES)
    conflicts = Reservation.objects.filter(
        partner=partner,
        status__in=(Reservation.Status.TENTATIVE, Reservation.Status.CONFIRMED),
        occupied_range__overlap=Range(starts_at, occupied_end, "[)"),
    )
    if exclude_reservation_id is not None:
        conflicts = conflicts.exclude(id=exclude_reservation_id)
    return conflicts.exists()


def _resolve_reschedule_partner(
    *, unit: FulfilmentUnit, booking: Booking, new_requested_start: Any
) -> PartnerProfile:
    """Prefer the original Partner; re-match when they are busy; refuse only when nobody can.

    Spec §17: a reschedule is a re-booking, not an edit of one person's calendar.
    The Booking's own reservation is ignored when judging the original Partner — moving
    that row is exactly what the write half does.
    """

    duration = unit.estimated_duration_minutes
    if partner_available_during(
        partner=booking.partner,
        service_area=unit.service_area,
        starts_at=new_requested_start,
        duration_minutes=duration,
    ) and not _partner_has_other_reservation(
        partner=booking.partner,
        starts_at=new_requested_start,
        duration_minutes=duration,
        exclude_reservation_id=booking.reservation_id,
    ):
        return booking.partner

    variant_ids = tuple(
        unit.lines.filter(cart_item__isnull=False)
        .order_by("position")
        .values_list("cart_item__variant_id", flat=True)
        .distinct()
    )
    snapshot = load_snapshot(
        variant_ids=variant_ids,
        area=unit.service_area,
        horizon_start=new_requested_start,
        horizon_end=new_requested_start
        + timedelta(minutes=duration + settings.M1_TURNAROUND_MINUTES),
        destination=unit.booking_group.address,
    )
    free_ids = snapshot.free_partner_ids(starts_at=new_requested_start, duration_minutes=duration)
    # The original Partner's own reservation still occupies the slot in the snapshot —
    # exclude them so we do not "re-match" onto themselves after the availability check failed.
    alternatives = [partner_id for partner_id in free_ids if partner_id != booking.partner_id]
    if not alternatives:
        raise PartnerUnavailableApiError
    return PartnerProfile.objects.get(id=alternatives[0])


def _guard_unit_reschedulable(
    *, unit: FulfilmentUnit, booking: Booking, new_requested_start: Any
) -> PartnerProfile:
    """Everything that must be true before any part of a reschedule is written.

    Split out from the write half so the group-wide command can check every unit first and
    refuse as a whole, rather than moving three visits and discovering the fourth cannot move.
    Returns the Partner who will serve the new time (original preferred, then re-match).
    """

    if booking.status not in RESCHEDULABLE_BOOKING_STATUSES:
        raise BookingCommandInvalidApiError(reason=RESCHEDULE_BLOCKED_STARTED)
    if new_requested_start < _earliest_reschedule_start():
        # A minimum *notice* guard, not merely a future-time one. Both directions are exploits
        # and they are the same exploit.
        #
        # Backwards: `partner_available_during` only asks about weekday and time of day, so a
        # start one whole week in the past passes it. A backdated `requested_start` makes
        # `is_partner_late` true, the lateness sweep writes a `late_declared_at` that never
        # clears, and a late Partner waives every cancellation fee — a permanent full-refund
        # switch, plus a held slot parked in the past.
        #
        # Forwards: a Customer 24h out sits in the free band, so the notice check below passes.
        # Moving the visit to twenty minutes from now clears `> timezone.now()` but no Partner
        # can be there, so lateness is declared and the same fee waiver falls out. Requiring
        # real notice on the *new* start closes both without a special case for either.
        raise BookingCommandInvalidApiError(
            reason=(
                f"A new visit time must be at least "
                f"{settings.M1_RESCHEDULE_MIN_NOTICE_MINUTES} minutes from now."
            )
        )
    if not _reschedule_notice_ok(unit=unit, booking=booking):
        raise BookingCommandInvalidApiError(reason=_too_close_reason())
    return _resolve_reschedule_partner(
        unit=unit, booking=booking, new_requested_start=new_requested_start
    )


def _reschedule_locked_unit(
    *,
    unit: FulfilmentUnit,
    booking: Booking,
    new_requested_start: Any,
    partner: PartnerProfile,
    idempotency_key: str,
) -> Booking:
    """Move one already-locked, already-guarded unit and its Booking to a new start."""

    old_requested_start = unit.requested_start
    old_partner_id = booking.partner_id
    partner_changed = partner.id != booking.partner_id
    new_range = Range(
        new_requested_start,
        new_requested_start
        + timedelta(minutes=unit.estimated_duration_minutes + settings.M1_TURNAROUND_MINUTES),
        "[)",
    )
    if partner_changed:
        if booking.reservation_id is not None:
            old_reservation = Reservation.objects.select_for_update().get(id=booking.reservation_id)
            if old_reservation.status != Reservation.Status.RELEASED:
                old_reservation.release()
        try:
            reservation = Reservation.objects.create(
                fulfilment_unit=unit,
                partner=partner,
                occupied_range=new_range,
                status=Reservation.Status.CONFIRMED,
                expires_at=new_requested_start
                + timedelta(
                    minutes=unit.estimated_duration_minutes + settings.M1_TURNAROUND_MINUTES
                ),
            )
        except IntegrityError as exc:
            raise PartnerUnavailableApiError from exc
        booking.partner = partner
        booking.reservation = reservation
        # The original Partner must not keep a usable start code for this visit.
        BookingOtp.objects.filter(booking=booking, consumed_at__isnull=True).update(
            expires_at=timezone.now()
        )
    elif booking.reservation_id is not None:
        reservation = Reservation.objects.select_for_update().get(id=booking.reservation_id)
        reservation.occupied_range = new_range
        try:
            reservation.save(update_fields=("occupied_range",))
        except IntegrityError as exc:
            # The GiST exclusion constraint refused the new range: the Partner is already held
            # for something else then. Same answer as failing the availability check.
            raise PartnerUnavailableApiError from exc
    unit.requested_start = new_requested_start
    unit.version += 1
    unit.save(update_fields=("requested_start", "version", "updated_at"))
    booking.scheduled_start = new_requested_start
    booking.version += 1
    update_fields = ["scheduled_start", "version", "updated_at"]
    if partner_changed:
        update_fields.extend(["partner", "reservation"])
    booking.save(update_fields=update_fields)
    context: dict[str, Any] = {
        "old_requested_start": old_requested_start.isoformat(),
        "new_requested_start": new_requested_start.isoformat(),
    }
    if partner_changed:
        context["old_partner_id"] = str(old_partner_id)
        context["new_partner_id"] = str(partner.id)
    record_transition(
        booking=booking,
        actor=booking.customer,
        command=BookingCommand.RESCHEDULE,
        from_status=booking.status,
        to_status=booking.status,
        idempotency_key=idempotency_key,
        context=context,
    )
    return booking


def reschedule_windows(*, booking_id: UUID, customer_id: UUID) -> Any:
    """The arrival-window grid a Customer picks a new time from, for a visit already booked.

    The same grid as before booking, built by the same `build_arrival_window_grid` — not a
    second, similar one. What differs is only what a *booked* visit knows that a cart does not,
    and each difference is a correction rather than a relaxation:

    * **Scope is the unit, not the cart.** Variants, duration, service area and address come off
      the `FulfilmentUnit` that was actually booked. The customer's cart has since moved on and
      says nothing about this visit.
    * **This visit's own hold is excluded.** Its reservation is about to be moved or released,
      so counting it would have the visit block itself out of its own slot — and in a
      one-Partner area, out of every slot near it.
    * **Minimum notice is applied.** `reschedule_booking` refuses a new start inside
      `M1_RESCHEDULE_MIN_NOTICE_MINUTES`, so those slots are marked `TOO_SOON` here rather than
      offered and then rejected.

    Window ids are the ISO start instant, unsigned, and that is deliberate. The signed token in
    the checkout grid binds a slot to a price and a cart; a reschedule reprices nothing, and
    `reschedule_booking` takes a time and re-runs every guard itself. Signing an id that no
    command verifies would be security theatre.
    """

    # Read, so no `locked_booking_context`: locking a Booking and its whole ancestry because
    # somebody opened a slot picker would hold rows for as long as they browsed, and the answer
    # is preliminary either way — `reschedule_booking` re-checks availability under its own
    # locks and the exclusion constraint has the final say.
    booking = Booking.objects.select_related("fulfilment_unit__booking_group__address").get(
        id=booking_id
    )
    unit = booking.fulfilment_unit
    if booking.customer_id != customer_id:
        raise PermissionError("This Booking belongs to another Customer.")
    if unit is None:
        raise BookingCommandInvalidApiError(
            reason="This Booking has no Fulfilment Unit and cannot be rescheduled."
        )
    # Refused here too, not only at submit. A grid served for a visit that cannot be moved is a
    # page of times every one of which would be rejected, and the endpoint would be the thing
    # that made that page possible.
    blocked = _reschedule_blocked_reason(unit=unit, booking=booking)
    if blocked:
        raise BookingCommandInvalidApiError(reason=blocked)
    variant_ids = set(
        unit.lines.filter(cart_item__isnull=False)
        .values_list("cart_item__variant_id", flat=True)
        .distinct()
    )
    if not variant_ids:
        raise BookingCommandInvalidApiError(
            reason="This visit has no service lines and cannot be rescheduled."
        )
    now = timezone.now()
    area = ServiceArea.objects.prefetch_related("operating_windows", "operating_exceptions").get(
        id=unit.service_area_id
    )
    duration = unit.estimated_duration_minutes
    snapshot = load_snapshot(
        variant_ids=variant_ids,
        area=area,
        horizon_start=now,
        horizon_end=now + timedelta(days=settings.M1_SCHEDULED_MAX_DAYS + 1),
        destination=unit.booking_group.address,
        exclude_reservation_id=booking.reservation_id,
    )
    return build_arrival_window_grid(
        area=area,
        snapshot=snapshot,
        duration=duration,
        now=now,
        window_id=lambda starts_at, _window_minutes: starts_at.isoformat(),
        not_before=_earliest_reschedule_start(),
    )


@transaction.atomic
def reschedule_booking(
    *,
    booking_id: UUID,
    customer_id: UUID,
    expected_version: int,
    new_requested_start: Any,
    idempotency_key: str = "",
) -> Booking:
    """Move a not-yet-started Booking to a new start.

    Prefers the original Partner; re-matches when they are busy (spec §17). Fee policy is
    unchanged — a reschedule inside the fee-bearing window is still refused (or waived when
    the Partner is late).
    """

    _group, unit, booking = locked_booking_context(booking_id)
    if booking.customer_id != customer_id:
        raise PermissionError("This Booking belongs to another Customer.")
    guard_booking_version(booking, expected_version)
    partner = _guard_unit_reschedulable(
        unit=unit, booking=booking, new_requested_start=new_requested_start
    )
    return _reschedule_locked_unit(
        unit=unit,
        booking=booking,
        new_requested_start=new_requested_start,
        partner=partner,
        idempotency_key=idempotency_key,
    )


@transaction.atomic
def change_booking_group_address(
    *,
    group_id: UUID,
    customer_id: UUID,
    expected_version: int,
    new_address_id: UUID,
    idempotency_key: str = "",
) -> BookingGroup:
    group = (
        BookingGroup.objects.select_for_update()
        .select_related("address")
        .get(id=group_id, customer_id=customer_id)
    )
    if group.version != expected_version:
        raise BookingGroupConflictApiError(reason="version_changed", current_version=group.version)
    if group.status != BookingGroup.Status.BOOKED:
        raise BookingCommandInvalidApiError(
            reason="Only a booked Booking Group's address can be changed."
        )
    new_address = Address.objects.get(id=new_address_id, customer_id=customer_id)
    decision = check_serviceability(postal_code=new_address.postal_code)
    units = list(group.units.select_for_update().select_related("service_area"))
    target_area_id = decision.service_area.id if decision.service_area is not None else None
    if not decision.is_serviceable or any(target_area_id != unit.service_area_id for unit in units):
        raise OutsideServiceableAreaApiError
    # A separate, inner-join-safe lock: `FulfilmentUnit.booking` is a nullable reverse
    # OneToOne, and PostgreSQL refuses `FOR UPDATE` on the nullable side of an outer join.
    bookings_by_unit_id = {
        booking.fulfilment_unit_id: booking
        for booking in Booking.objects.select_for_update().filter(fulfilment_unit__in=units)
    }

    group.address = new_address
    group.version += 1
    group.save(update_fields=("address", "version", "updated_at"))
    for unit in units:
        booking = bookings_by_unit_id.get(unit.id)
        if booking is None:
            continue
        record_transition(
            booking=booking,
            actor=group.customer,
            command=BookingCommand.ADDRESS_CHANGE,
            from_status=booking.status,
            to_status=booking.status,
            idempotency_key=idempotency_key,
            context={"new_address_id": str(new_address.id)},
        )
    return group


@dataclass(frozen=True, slots=True)
class UnitRescheduleOutcome:
    fulfilment_unit_id: UUID
    booking_id: UUID
    old_requested_start: Any
    new_requested_start: Any


@dataclass(frozen=True, slots=True)
class GroupRescheduleResult:
    group: BookingGroup
    shift: timedelta
    units: tuple[UnitRescheduleOutcome, ...]


@transaction.atomic
def reschedule_booked_group(
    *,
    group_id: UUID,
    customer_id: UUID,
    expected_version: int,
    new_group_start: Any,
    idempotency_key: str = "",
) -> GroupRescheduleResult:
    """Move every visit in a booked Booking Group by one offset, atomically or not at all.

    ## Why an offset rather than a start per unit

    The relationships between units are server-authored and are the whole point of the planner:
    two lines run sequentially with one Partner, two independent units overlap in a coordinated
    parallel window, a dependency forces one visit after another. Letting a client post an
    arbitrary start per unit would let it dissolve that structure — put a dependent visit before
    the one it depends on, or pull two "parallel" units a day apart — without any of the planning
    inputs that made the grouping legal. So the Customer moves the *group*: they name a new start
    for the earliest visit and every other visit shifts by the same delta, which preserves gaps,
    ordering and overlap exactly as planned.

    ## Classify, then write

    The same skeleton as `cancel_booked_group`, for the same reason. Every unit is checked —
    status, notice, Partner availability at its own new time — before a single row moves. One
    unmovable visit refuses the whole command, because a group reschedule that moved three of
    four visits would leave a Customer with a split appointment nobody agreed to and no
    single command to undo it with.

    Reservations are re-ranged inside the same transaction, so the PostgreSQL exclusion
    constraint is what ultimately decides whether the new arrangement is legal.
    """

    group = BookingGroup.objects.select_for_update().get(id=group_id, customer_id=customer_id)
    if group.version != expected_version:
        raise BookingGroupConflictApiError(reason="version_changed", current_version=group.version)
    if group.status != BookingGroup.Status.BOOKED:
        raise BookingCommandInvalidApiError(
            reason="Only a booked Booking Group's visits can be rescheduled."
        )
    _guard_group_idempotency_key(idempotency_key)

    units = list(group.units.select_for_update().order_by("position"))
    bookings_by_unit_id = _locked_group_bookings(units)
    if not units:
        raise BookingCommandInvalidApiError(
            reason="This Booking Group has no visits to reschedule."
        )

    earliest = min(unit.requested_start for unit in units)
    shift = new_group_start - earliest

    planned: list[tuple[FulfilmentUnit, Booking, Any]] = []
    for unit in units:
        booking = bookings_by_unit_id.get(unit.id)
        if booking is None:
            raise BookingCommandInvalidApiError(
                reason=(
                    "This Booking Group has a Fulfilment Unit with no Booking and cannot be "
                    "rescheduled as a group."
                )
            )
        planned.append((unit, booking, unit.requested_start + shift))

    # Every guard for every unit, before any write. A refusal here is a refusal, not a rollback.
    partners: list[PartnerProfile] = []
    for unit, booking, new_start in planned:
        partners.append(
            _guard_unit_reschedulable(unit=unit, booking=booking, new_requested_start=new_start)
        )

    outcomes: list[UnitRescheduleOutcome] = []
    for (unit, booking, new_start), partner in zip(planned, partners, strict=True):
        old_start = unit.requested_start
        # Per-unit keys for the same reason `cancel_booked_group` derives them: one key across
        # the group would make every unit's audit row indistinguishable from its siblings'.
        unit_key = f"{idempotency_key}:{unit.id}" if idempotency_key else ""
        moved = _reschedule_locked_unit(
            unit=unit,
            booking=booking,
            new_requested_start=new_start,
            partner=partner,
            idempotency_key=unit_key,
        )
        outcomes.append(
            UnitRescheduleOutcome(
                fulfilment_unit_id=unit.id,
                booking_id=moved.id,
                old_requested_start=old_start,
                new_requested_start=new_start,
            )
        )

    group.version += 1
    group.save(update_fields=("version", "updated_at"))
    return GroupRescheduleResult(group=group, shift=shift, units=tuple(outcomes))
