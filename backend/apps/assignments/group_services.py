"""Autonomous, unit-scoped dispatch for multi-unit Booking Groups."""

from datetime import timedelta
from uuid import UUID

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone
from psycopg.types.range import Range

from apps.assignments.exceptions import OfferReservationConflictApiError
from apps.assignments.models import AssignmentAttempt, PartnerOffer, Reservation
from apps.carts.exceptions import BookingGroupConflictApiError
from apps.carts.models import BookingGroup, CheckoutSession, FulfilmentUnit
from apps.partners.models import PartnerApplication, PartnerProfile
from apps.partners.selectors import partner_available_during

GROUP_TERMINAL_STATUSES = (
    BookingGroup.Status.BOOKED,
    BookingGroup.Status.REPLAN_REQUIRED,
    BookingGroup.Status.CANCELLED,
    BookingGroup.Status.EXPIRED,
    BookingGroup.Status.FAILED,
)


def _unit_variant_ids(unit: FulfilmentUnit) -> tuple[UUID, ...]:
    return tuple(
        unit.lines.filter(cart_item__isnull=False)
        .order_by("position")
        .values_list("cart_item__variant_id", flat=True)
        .distinct()
    )


def _partner_available(*, partner: PartnerProfile, unit: FulfilmentUnit) -> bool:
    return partner_available_during(
        partner=partner,
        service_area=unit.service_area,
        starts_at=unit.requested_start,
        duration_minutes=unit.estimated_duration_minutes,
    )


def _eligible_candidates(unit: FulfilmentUnit) -> list[PartnerProfile]:
    attempted = AssignmentAttempt.objects.filter(fulfilment_unit=unit).values_list(
        "candidate_id", flat=True
    )
    candidates = PartnerProfile.objects.filter(
        application__status=PartnerApplication.Status.APPROVED,
        service_area_links__service_area=unit.service_area,
        service_area_links__is_active=True,
    )
    variant_ids = _unit_variant_ids(unit)
    if not variant_ids:
        return []
    for variant_id in variant_ids:
        candidates = candidates.filter(
            service_links__variant_id=variant_id,
            service_links__is_active=True,
        )
    return [
        candidate
        for candidate in candidates.exclude(id__in=attempted).distinct().order_by("id")
        if _partner_available(partner=candidate, unit=unit)
    ]


def _set_unit_status(unit: FulfilmentUnit, status: str) -> None:
    if unit.status == status:
        return
    unit.status = status
    unit.version += 1
    unit.save(update_fields=("status", "version", "updated_at"))


def _set_group_status(group: BookingGroup, status: str) -> None:
    if group.status == status:
        return
    group.status = status
    group.version += 1
    group.save(update_fields=("status", "version", "updated_at"))


def _compensate_group(group: BookingGroup, *, terminal_status: str) -> None:
    now = timezone.now()
    Reservation.objects.select_for_update().filter(
        fulfilment_unit__booking_group=group,
        status__in=(Reservation.Status.TENTATIVE, Reservation.Status.CONFIRMED),
    ).update(status=Reservation.Status.RELEASED, released_at=now)
    PartnerOffer.objects.select_for_update().filter(
        fulfilment_unit__booking_group=group,
        status__in=(PartnerOffer.Status.OFFERED, PartnerOffer.Status.ACCEPTED_PENDING_UNDO),
    ).update(status=PartnerOffer.Status.REVOKED, responded_at=now)
    for unit in group.units.select_for_update().exclude(
        status__in=(FulfilmentUnit.Status.CANCELLED, FulfilmentUnit.Status.COMPLETED)
    ):
        _set_unit_status(
            unit,
            FulfilmentUnit.Status.CANCELLED
            if terminal_status == BookingGroup.Status.CANCELLED
            else FulfilmentUnit.Status.FAILED,
        )
    _set_group_status(group, terminal_status)
    if terminal_status == BookingGroup.Status.CANCELLED:
        checkout_status = CheckoutSession.Status.CANCELLED
    elif terminal_status == BookingGroup.Status.REPLAN_REQUIRED:
        checkout_status = CheckoutSession.Status.REPLAN_REQUIRED
    else:
        checkout_status = CheckoutSession.Status.EXPIRED
    CheckoutSession.objects.filter(booking_group=group).update(status=checkout_status)


def _create_offer(
    *,
    group: BookingGroup,
    unit: FulfilmentUnit,
    selected_candidate: PartnerProfile | None = None,
) -> PartnerOffer | None:
    if group.status in GROUP_TERMINAL_STATUSES:
        return None
    attempt_count = AssignmentAttempt.objects.filter(fulfilment_unit=unit).count()
    if attempt_count >= settings.M1_PARTNER_SEARCH_CANDIDATE_LIMIT:
        _compensate_group(group, terminal_status=BookingGroup.Status.REPLAN_REQUIRED)
        return None
    candidates = _eligible_candidates(unit)
    if not candidates:
        _compensate_group(group, terminal_status=BookingGroup.Status.REPLAN_REQUIRED)
        return None
    candidate = selected_candidate or candidates[0]
    if candidate not in candidates:
        raise ValueError("The selected Partner is not eligible for this Fulfilment Unit.")
    attempt = AssignmentAttempt.objects.create(
        fulfilment_unit=unit,
        candidate=candidate,
        rank=attempt_count + 1,
        eligibility_snapshot={
            "service_area_id": str(unit.service_area_id),
            "variant_ids": [str(value) for value in _unit_variant_ids(unit)],
            "requested_start": unit.requested_start.isoformat(),
            "estimated_duration_minutes": unit.estimated_duration_minutes,
        },
    )
    deadline = min(
        group.expires_at,
        timezone.now() + timedelta(seconds=settings.M1_PARTNER_OFFER_TIMEOUT_SECONDS),
    )
    pricing = unit.quote_unit.quote.pricing_policy_snapshot
    gross_paise = (
        unit.quote_unit.task_subtotal_paise + unit.quote_unit.minimum_visit_adjustment_paise
    )
    calculated_commission = gross_paise * int(pricing["commission_basis_points"]) // 10_000
    commission_paise = min(
        int(pricing["commission_cap_paise"]),
        max(int(pricing["commission_floor_paise"]), calculated_commission),
        gross_paise,
    )
    service_lines: list[dict[str, object]] = []
    requirements: set[str] = set()
    for line in unit.lines.filter(kind="SERVICE").order_by("position"):
        service_lines.append(
            {
                "line_id": str(line.id),
                "service_label": line.label,
                "quantity": line.quantity,
                "scope": line.snapshot.get("scope", {}),
            }
        )
        configuration = line.snapshot.get("configuration", {})
        if isinstance(configuration, dict):
            equipment = configuration.get("required_equipment", [])
            if isinstance(equipment, list):
                requirements.update(str(value) for value in equipment)
    return PartnerOffer.objects.create(
        fulfilment_unit=unit,
        partner=candidate,
        attempt=attempt,
        expires_at=deadline,
        partner_projection_snapshot={
            "approximate_area": unit.service_area.name,
            "service_lines": service_lines,
            "requirements": sorted(requirements),
            "estimated_gross": {
                "amount_paise": gross_paise,
                "currency": unit.currency,
            },
            "commission": {
                "amount_paise": commission_paise,
                "currency": unit.currency,
            },
            "estimated_net": {
                "amount_paise": gross_paise - commission_paise,
                "currency": unit.currency,
            },
        },
    )


@transaction.atomic
def create_manual_unit_offer(*, unit_id: UUID, partner_id: UUID) -> PartnerOffer:
    group_id = FulfilmentUnit.objects.values_list("booking_group_id", flat=True).get(id=unit_id)
    group = BookingGroup.objects.select_for_update().get(id=group_id)
    unit = (
        FulfilmentUnit.objects.select_for_update()
        .select_related("service_area", "quote_unit__quote")
        .get(id=unit_id)
    )
    if group.status in GROUP_TERMINAL_STATUSES or unit.status != FulfilmentUnit.Status.MATCHING:
        raise ValueError("This Fulfilment Unit is not searching for a Partner.")
    if PartnerOffer.objects.filter(
        fulfilment_unit=unit,
        status__in=(PartnerOffer.Status.OFFERED, PartnerOffer.Status.ACCEPTED_PENDING_UNDO),
    ).exists():
        raise ValueError("Resolve the current Fulfilment Unit offer before creating another.")
    partner = PartnerProfile.objects.get(id=partner_id)
    offer = _create_offer(group=group, unit=unit, selected_candidate=partner)
    if offer is None:
        raise ValueError("No offer could be created for this Fulfilment Unit.")
    return offer


def _sync_group_state(group: BookingGroup) -> None:
    units = list(group.units.all())
    if not units or group.status in GROUP_TERMINAL_STATUSES:
        return
    committed_units = set(
        PartnerOffer.objects.filter(
            fulfilment_unit__booking_group=group,
            status=PartnerOffer.Status.COMMITTED,
        ).values_list("fulfilment_unit_id", flat=True)
    )
    if len(committed_units) == len(units):
        for unit in units:
            _set_unit_status(unit, FulfilmentUnit.Status.PAYMENT_PENDING)
        _set_group_status(group, BookingGroup.Status.PAYMENT_PENDING)
        checkout = CheckoutSession.objects.select_for_update().get(booking_group=group)
        reservation_expiries = Reservation.objects.filter(
            fulfilment_unit__booking_group=group,
            status=Reservation.Status.TENTATIVE,
        ).values_list("expires_at", flat=True)
        checkout.status = CheckoutSession.Status.PARTNER_COMMITTED
        checkout.expires_at = min(reservation_expiries)
        checkout.version += 1
        checkout.save(update_fields=("status", "expires_at", "version"))
        return
    held = sum(unit.status == FulfilmentUnit.Status.HELD for unit in units)
    if held == len(units):
        _set_group_status(group, BookingGroup.Status.ALL_UNITS_HELD)
    elif held:
        _set_group_status(group, BookingGroup.Status.PARTIALLY_HELD)
    else:
        _set_group_status(group, BookingGroup.Status.MATCHING)


@transaction.atomic
def start_group_dispatch(*, group_id: UUID) -> BookingGroup:
    group = BookingGroup.objects.select_for_update().get(id=group_id)
    if group.status != BookingGroup.Status.CONFIRMED:
        return group
    if group.expires_at <= timezone.now():
        _compensate_group(group, terminal_status=BookingGroup.Status.EXPIRED)
        return group
    _set_group_status(group, BookingGroup.Status.MATCHING)
    CheckoutSession.objects.filter(booking_group=group).update(
        status=CheckoutSession.Status.FINDING_PARTNER
    )
    units = list(
        group.units.select_for_update().select_related("service_area", "quote_unit__quote")
    )
    for unit in units:
        _set_unit_status(unit, FulfilmentUnit.Status.MATCHING)
        if _create_offer(group=group, unit=unit) is None:
            break
    group.refresh_from_db()
    return group


def _locked_offer_context(offer_id: UUID) -> tuple[BookingGroup, FulfilmentUnit, PartnerOffer]:
    group_id = PartnerOffer.objects.values_list("fulfilment_unit__booking_group_id", flat=True).get(
        id=offer_id
    )
    if group_id is None:
        raise ValueError("This is not a Fulfilment Unit offer.")
    group = BookingGroup.objects.select_for_update().get(id=group_id)
    unit = (
        FulfilmentUnit.objects.select_for_update()
        .select_related("service_area", "quote_unit__quote")
        .get(offers__id=offer_id)
    )
    offer = PartnerOffer.objects.select_for_update().get(id=offer_id)
    return group, unit, offer


@transaction.atomic
def accept_unit_offer(*, offer_id: UUID, partner: PartnerProfile) -> PartnerOffer:
    group, unit, offer = _locked_offer_context(offer_id)
    if offer.partner_id != partner.id:
        raise PermissionError("This offer belongs to another Partner.")
    now = timezone.now()
    if (
        group.status in GROUP_TERMINAL_STATUSES
        or offer.status != PartnerOffer.Status.OFFERED
        or offer.expires_at <= now
    ):
        raise ValueError("This offer is no longer available to accept.")
    if not _partner_available(partner=partner, unit=unit):
        raise ValueError("You are no longer available for this Fulfilment Unit.")
    occupied = Range(
        unit.requested_start,
        unit.requested_start + timedelta(minutes=unit.estimated_duration_minutes),
        "[)",
    )
    try:
        reservation = Reservation.objects.create(
            fulfilment_unit=unit,
            partner=partner,
            occupied_range=occupied,
            expires_at=now + timedelta(seconds=settings.M1_PARTNER_UNDO_TIMEOUT_SECONDS),
        )
    except IntegrityError as exc:
        # A distinct refusal: the capacity was taken, the offer did not expire.
        raise OfferReservationConflictApiError from exc
    offer.status = PartnerOffer.Status.ACCEPTED_PENDING_UNDO
    offer.reservation = reservation
    offer.undo_deadline = reservation.expires_at
    offer.responded_at = now
    offer.save(update_fields=("status", "reservation", "undo_deadline", "responded_at"))
    _set_unit_status(unit, FulfilmentUnit.Status.HELD)
    _sync_group_state(group)
    return offer


def _commit_locked_unit_offer(
    group: BookingGroup,
    unit: FulfilmentUnit,
    offer: PartnerOffer,
) -> PartnerOffer:
    if offer.status != PartnerOffer.Status.ACCEPTED_PENDING_UNDO or offer.reservation_id is None:
        raise ValueError("This Fulfilment Unit offer cannot be committed.")
    offer.status = PartnerOffer.Status.COMMITTED
    offer.save(update_fields=("status",))
    reservation = Reservation.objects.select_for_update().get(id=offer.reservation_id)
    reservation.expires_at = timezone.now() + timedelta(seconds=settings.M1_PAYMENT_WINDOW_SECONDS)
    reservation.save(update_fields=("expires_at",))
    _set_unit_status(unit, FulfilmentUnit.Status.HELD)
    _sync_group_state(group)
    return offer


@transaction.atomic
def commit_unit_offer(*, offer_id: UUID, partner: PartnerProfile | None = None) -> PartnerOffer:
    group, unit, offer = _locked_offer_context(offer_id)
    if partner is not None and offer.partner_id != partner.id:
        raise PermissionError("This offer belongs to another Partner.")
    if offer.undo_deadline is None or offer.undo_deadline > timezone.now():
        raise ValueError("The Partner undo window is still open.")
    return _commit_locked_unit_offer(group, unit, offer)


@transaction.atomic
def decline_or_undo_unit_offer(
    *, offer_id: UUID, partner: PartnerProfile, undo: bool
) -> PartnerOffer | None:
    group, unit, offer = _locked_offer_context(offer_id)
    if offer.partner_id != partner.id:
        raise PermissionError("This offer belongs to another Partner.")
    expected = PartnerOffer.Status.ACCEPTED_PENDING_UNDO if undo else PartnerOffer.Status.OFFERED
    if offer.status != expected:
        raise ValueError("This Fulfilment Unit offer cannot be changed.")
    offer.status = PartnerOffer.Status.UNDONE if undo else PartnerOffer.Status.DECLINED
    offer.responded_at = timezone.now()
    offer.save(update_fields=("status", "responded_at"))
    if offer.reservation_id is not None:
        Reservation.objects.select_for_update().get(id=offer.reservation_id).release()
    _set_unit_status(unit, FulfilmentUnit.Status.MATCHING)
    _sync_group_state(group)
    return _create_offer(group=group, unit=unit)


@transaction.atomic
def reconcile_group_dispatch(*, group_id: UUID) -> BookingGroup:
    group = BookingGroup.objects.select_for_update().get(id=group_id)
    if group.status in GROUP_TERMINAL_STATUSES:
        return group
    now = timezone.now()
    if group.status == BookingGroup.Status.PAYMENT_PENDING:
        if Reservation.objects.filter(
            fulfilment_unit__booking_group=group,
            status=Reservation.Status.TENTATIVE,
            expires_at__lte=now,
        ).exists():
            _compensate_group(group, terminal_status=BookingGroup.Status.EXPIRED)
        return group
    if group.expires_at <= now:
        _compensate_group(group, terminal_status=BookingGroup.Status.EXPIRED)
        return group
    units = list(
        group.units.select_for_update().select_related("service_area", "quote_unit__quote")
    )
    for unit in units:
        offer = (
            PartnerOffer.objects.select_for_update()
            .filter(
                fulfilment_unit=unit,
                status__in=(
                    PartnerOffer.Status.OFFERED,
                    PartnerOffer.Status.ACCEPTED_PENDING_UNDO,
                ),
            )
            .first()
        )
        if offer is None and unit.status == FulfilmentUnit.Status.MATCHING:
            _create_offer(group=group, unit=unit)
        elif offer is not None and (
            offer.status == PartnerOffer.Status.OFFERED and offer.expires_at <= now
        ):
            offer.status = PartnerOffer.Status.EXPIRED
            offer.responded_at = now
            offer.save(update_fields=("status", "responded_at"))
            _create_offer(group=group, unit=unit)
        elif (
            offer is not None
            and offer.status == PartnerOffer.Status.ACCEPTED_PENDING_UNDO
            and offer.undo_deadline is not None
            and offer.undo_deadline <= now
        ):
            _commit_locked_unit_offer(group, unit, offer)
        if group.status in GROUP_TERMINAL_STATUSES:
            break
    group.refresh_from_db()
    return group


@transaction.atomic
def cancel_booking_group(
    *, customer_id: UUID, group_id: UUID, expected_version: int
) -> BookingGroup:
    group = BookingGroup.objects.select_for_update().get(id=group_id, customer_id=customer_id)
    if group.version != expected_version:
        raise BookingGroupConflictApiError(reason="version_changed", current_version=group.version)
    if group.status in (
        BookingGroup.Status.BOOKED,
        BookingGroup.Status.CANCELLED,
        BookingGroup.Status.EXPIRED,
        BookingGroup.Status.FAILED,
    ):
        raise BookingGroupConflictApiError(
            reason="status_not_cancellable", current_version=group.version
        )
    _compensate_group(group, terminal_status=BookingGroup.Status.CANCELLED)
    group.refresh_from_db()
    return group
