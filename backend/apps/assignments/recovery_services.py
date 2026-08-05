"""Operations overrides on autonomous dispatch: revoke, release and manual recovery.

Every command here follows one shape, and it is the shape `group_services` already uses:
take the group and unit locks in the same order, guard on the unit's optimistic version,
apply the transition, re-sync the group, then write one immutable audit row inside the
same transaction. Nothing is written outside a lock and nothing is audited that did not
commit.
"""

from typing import Any
from uuid import UUID

from django.db import transaction
from django.utils import timezone

from apps.assignments.exceptions import (
    DispatchCommandInvalidApiError,
    DispatchVersionConflictApiError,
)
from apps.assignments.group_services import (
    GROUP_TERMINAL_STATUSES,
    _compensate_group,
    _create_offer,
    _locked_offer_context,
    _set_unit_status,
    _sync_group_state,
    reconcile_group_dispatch,
)
from apps.assignments.models import DispatchCommandAudit, PartnerOffer, Reservation
from apps.carts.models import BookingGroup, FulfilmentUnit
from apps.identity.models import User

# `PAYMENT_PENDING` onwards the Customer has been asked to pay for every unit at once.
# Freeing one unit's capacity there cannot leave the rest held.
GROUP_PAYMENT_STATUSES = (BookingGroup.Status.PAYMENT_PENDING,)


def _unit_state(unit: FulfilmentUnit) -> dict[str, Any]:
    """The Fulfilment Unit's dispatch state, as of right now.

    `offer`/`reservation` are the *most recently created* rows for the unit regardless of
    status, not "whichever is currently live" — an audit's `after_state` is evidence of
    what this specific command did to the offer or reservation it addressed, and must
    still name it even after the command hands the unit to a successor.
    """
    offer = PartnerOffer.objects.filter(fulfilment_unit=unit).order_by("-created_at").first()
    reservation = Reservation.objects.filter(fulfilment_unit=unit).order_by("-created_at").first()
    return {
        "unit_status": unit.status,
        "unit_version": unit.version,
        "group_status": unit.booking_group.status,
        "offer_id": str(offer.id) if offer is not None else None,
        "offer_status": offer.status if offer is not None else None,
        "reservation_status": reservation.status if reservation is not None else None,
    }


def _guard_version(unit: FulfilmentUnit, expected: int) -> None:
    if unit.version != expected:
        raise DispatchVersionConflictApiError(current_version=unit.version)


def _audit(
    *,
    actor: User,
    command: str,
    reason: str,
    note: str,
    unit: FulfilmentUnit,
    offer: PartnerOffer | None,
    reservation: Reservation | None,
    idempotency_key: str,
    unit_version_before: int,
    before_state: dict[str, Any],
) -> None:
    unit.refresh_from_db()
    DispatchCommandAudit.objects.create(
        actor=actor,
        command=command,
        reason=reason,
        note=note,
        fulfilment_unit=unit,
        offer=offer,
        reservation=reservation,
        idempotency_key=idempotency_key,
        unit_version_before=unit_version_before,
        before_state=before_state,
        after_state=_unit_state(unit),
    )


@transaction.atomic
def revoke_unit_offer(
    *,
    actor: User,
    offer_id: UUID,
    expected_unit_version: int,
    reason: str,
    note: str,
    idempotency_key: str,
) -> PartnerOffer:
    """Withdraw a live offer from a Partner and hand the unit to the next candidate."""

    group, unit, offer = _locked_offer_context(offer_id)
    _guard_version(unit, expected_unit_version)
    if group.status in GROUP_TERMINAL_STATUSES:
        raise DispatchCommandInvalidApiError(
            reason="This Booking Group has already reached a terminal state."
        )
    if offer.status not in (
        PartnerOffer.Status.OFFERED,
        PartnerOffer.Status.ACCEPTED_PENDING_UNDO,
    ):
        raise DispatchCommandInvalidApiError(reason="This offer is no longer live to revoke.")
    before = _unit_state(unit)
    version_before = unit.version
    reservation_id = offer.reservation_id
    offer.status = PartnerOffer.Status.REVOKED
    offer.responded_at = timezone.now()
    offer.save(update_fields=("status", "responded_at"))
    reservation = None
    if reservation_id is not None:
        reservation = Reservation.objects.select_for_update().get(id=reservation_id)
        if reservation.status != Reservation.Status.RELEASED:
            reservation.release()
    _set_unit_status(unit, FulfilmentUnit.Status.MATCHING)
    _sync_group_state(group)
    # Audit the revoke before dispatch hands the unit to a successor: `after_state` is
    # evidence of what this command did to *this* offer, not a preview of the next one.
    _audit(
        actor=actor,
        command=DispatchCommandAudit.Command.REVOKE_OFFER,
        reason=reason,
        note=note,
        unit=unit,
        offer=offer,
        reservation=reservation,
        idempotency_key=idempotency_key,
        unit_version_before=version_before,
        before_state=before,
    )
    _create_offer(group=group, unit=unit)
    offer.refresh_from_db()
    return offer


@transaction.atomic
def release_unit_reservation(
    *,
    actor: User,
    reservation_id: UUID,
    expected_unit_version: int,
    reason: str,
    note: str,
    idempotency_key: str,
) -> Reservation:
    """Free a Partner's held slot, and refuse to leave a half-held Booking Group behind.

    Locks are acquired group-first — the same order `reconcile_group_dispatch` and
    `_compensate_group` use — even though the command is addressed to a reservation.
    Locking the reservation before the group (the naive order) deadlocks against the
    reconcile sweep: the sweep always locks the group before touching any reservation,
    so a release holding the reservation while waiting on the group can meet a sweep
    holding the group while waiting on that same reservation.
    """

    try:
        unit_id, group_id = Reservation.objects.values_list(
            "fulfilment_unit_id", "fulfilment_unit__booking_group_id"
        ).get(id=reservation_id)
    except Reservation.DoesNotExist:
        raise DispatchCommandInvalidApiError(reason="This reservation does not exist.") from None
    if unit_id is None:
        raise DispatchCommandInvalidApiError(reason="This is not a Fulfilment Unit reservation.")
    group = BookingGroup.objects.select_for_update().get(id=group_id)
    unit = (
        FulfilmentUnit.objects.select_for_update()
        .select_related("service_area", "booking_group", "quote_unit__quote")
        .get(id=unit_id)
    )
    reservation = Reservation.objects.select_for_update().get(id=reservation_id)
    _guard_version(unit, expected_unit_version)
    if reservation.status == Reservation.Status.RELEASED:
        raise DispatchCommandInvalidApiError(reason="This reservation is already released.")
    if group.status in GROUP_TERMINAL_STATUSES:
        raise DispatchCommandInvalidApiError(
            reason="This Booking Group has already reached a terminal state."
        )
    before = _unit_state(unit)
    version_before = unit.version
    offer = PartnerOffer.objects.select_for_update().filter(reservation_id=reservation.id).first()
    reservation.release()
    if offer is not None and offer.status in (
        PartnerOffer.Status.ACCEPTED_PENDING_UNDO,
        PartnerOffer.Status.COMMITTED,
    ):
        offer.status = PartnerOffer.Status.REVOKED
        offer.responded_at = timezone.now()
        offer.save(update_fields=("status", "responded_at"))
    if group.status in GROUP_PAYMENT_STATUSES:
        _compensate_group(group, terminal_status=BookingGroup.Status.REPLAN_REQUIRED)
        _audit(
            actor=actor,
            command=DispatchCommandAudit.Command.RELEASE_RESERVATION,
            reason=reason,
            note=note,
            unit=unit,
            offer=offer,
            reservation=reservation,
            idempotency_key=idempotency_key,
            unit_version_before=version_before,
            before_state=before,
        )
    else:
        _set_unit_status(unit, FulfilmentUnit.Status.MATCHING)
        _sync_group_state(group)
        # Audit before dispatch hands the unit to a successor, for the same reason
        # `revoke_unit_offer` does: `after_state` names this reservation's own outcome.
        _audit(
            actor=actor,
            command=DispatchCommandAudit.Command.RELEASE_RESERVATION,
            reason=reason,
            note=note,
            unit=unit,
            offer=offer,
            reservation=reservation,
            idempotency_key=idempotency_key,
            unit_version_before=version_before,
            before_state=before,
        )
        _create_offer(group=group, unit=unit)
    reservation.refresh_from_db()
    return reservation


@transaction.atomic
def recover_fulfilment_unit(
    *,
    actor: User,
    unit_id: UUID,
    expected_unit_version: int,
    reason: str,
    note: str,
    idempotency_key: str,
) -> FulfilmentUnit:
    """Run the dispatch reconciliation an operator is waiting on, under audit.

    This is deliberately the same reconciliation Celery beat runs, not a second one: a
    stuck unit is almost always a sweep that has not landed yet, and giving Operations a
    divergent recovery path would create states the sweep can never reach. What the
    command adds is a named actor, a version guard and a durable record that a human
    intervened at this instant.
    """

    unit = (
        FulfilmentUnit.objects.select_for_update()
        .select_related("service_area", "booking_group", "quote_unit__quote")
        .get(id=unit_id)
    )
    _guard_version(unit, expected_unit_version)
    group = BookingGroup.objects.select_for_update().get(id=unit.booking_group_id)
    if group.status in GROUP_TERMINAL_STATUSES:
        raise DispatchCommandInvalidApiError(
            reason="This Booking Group has already reached a terminal state."
        )
    before = _unit_state(unit)
    version_before = unit.version
    reconcile_group_dispatch(group_id=group.id)
    unit.refresh_from_db()
    _audit(
        actor=actor,
        command=DispatchCommandAudit.Command.RECOVER_UNIT,
        reason=reason,
        note=note,
        unit=unit,
        offer=None,
        reservation=None,
        idempotency_key=idempotency_key,
        unit_version_before=version_before,
        before_state=before,
    )
    unit.refresh_from_db()
    return unit
