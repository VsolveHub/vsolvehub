"""Transactional B6 matching, offer and reservation commands."""

from datetime import timedelta
from uuid import UUID

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone
from psycopg.types.range import Range

from apps.assignments.models import AssignmentAttempt, PartnerOffer, Reservation
from apps.carts.models import CartItem, CheckoutSession
from apps.partners.models import (
    PartnerApplication,
    PartnerProfile,
)
from apps.partners.selectors import partner_available_during


def _legacy_checkout_item(checkout: CheckoutSession) -> CartItem:
    item = checkout.quote.cart_item
    if item is None:
        raise ValueError("Group assignment must run through the Fulfilment Unit coordinator.")
    return item


def _partner_available(*, partner: PartnerProfile, checkout: CheckoutSession) -> bool:
    quote = checkout.quote
    return partner_available_during(
        partner=partner,
        service_area=quote.service_area,
        starts_at=quote.requested_start,
        duration_minutes=quote.estimated_duration_minutes,
    )


def _eligible_candidates(checkout: CheckoutSession) -> list[PartnerProfile]:
    quote = checkout.quote
    item = _legacy_checkout_item(checkout)
    attempted = AssignmentAttempt.objects.filter(checkout=checkout).values_list(
        "candidate_id", flat=True
    )
    candidates = (
        PartnerProfile.objects.filter(
            application__status=PartnerApplication.Status.APPROVED,
            service_links__variant=item.variant,
            service_links__is_active=True,
            service_area_links__service_area=quote.service_area,
            service_area_links__is_active=True,
        )
        .exclude(id__in=attempted)
        .distinct()
        .order_by("id")
    )
    return [
        candidate
        for candidate in candidates
        if _partner_available(partner=candidate, checkout=checkout)
    ]


def _create_next_offer(*, checkout: CheckoutSession) -> PartnerOffer | None:
    if (
        AssignmentAttempt.objects.filter(checkout=checkout).count()
        >= settings.M1_PARTNER_SEARCH_CANDIDATE_LIMIT
    ):
        checkout.status = CheckoutSession.Status.EXPIRED
        checkout.save(update_fields=("status",))
        return None
    candidates = _eligible_candidates(checkout)
    if not candidates:
        checkout.status = CheckoutSession.Status.EXPIRED
        checkout.save(update_fields=("status",))
        return None
    candidate = candidates[0]
    return _create_offer(checkout=checkout, candidate=candidate)


def _create_offer(*, checkout: CheckoutSession, candidate: PartnerProfile) -> PartnerOffer:
    item = _legacy_checkout_item(checkout)
    attempt = AssignmentAttempt.objects.create(
        checkout=checkout,
        candidate=candidate,
        rank=AssignmentAttempt.objects.filter(checkout=checkout).count() + 1,
        eligibility_snapshot={
            "service_area_id": str(checkout.quote.service_area_id),
            "variant_id": str(item.variant_id),
            "requested_start": checkout.quote.requested_start.isoformat(),
            "estimated_duration_minutes": checkout.quote.estimated_duration_minutes,
        },
    )
    deadline = min(
        checkout.expires_at,
        timezone.now() + timedelta(seconds=settings.M1_PARTNER_OFFER_TIMEOUT_SECONDS),
    )
    return PartnerOffer.objects.create(
        checkout=checkout, partner=candidate, attempt=attempt, expires_at=deadline
    )


@transaction.atomic
def create_manual_offer(*, checkout_id: UUID, partner_id: UUID) -> PartnerOffer:
    checkout = (
        CheckoutSession.objects.select_for_update(of=("self",))
        .select_related("quote__cart_item__variant", "quote__service_area")
        .get(id=checkout_id)
    )
    if checkout.status != CheckoutSession.Status.FINDING_PARTNER or checkout.is_expired:
        raise ValueError("This checkout is not searching for a Partner.")
    if PartnerOffer.objects.filter(checkout=checkout, status=PartnerOffer.Status.OFFERED).exists():
        raise ValueError(
            "Expire or revoke the current offer before manually offering another Partner."
        )
    partner = next((item for item in _eligible_candidates(checkout) if item.id == partner_id), None)
    if partner is None:
        raise ValueError("The selected Partner is not eligible and available for this checkout.")
    return _create_offer(checkout=checkout, candidate=partner)


@transaction.atomic
def start_partner_search(*, checkout: CheckoutSession) -> PartnerOffer | None:
    locked = (
        CheckoutSession.objects.select_for_update(of=("self",))
        .select_related("quote__cart_item__variant", "quote__service_area")
        .get(id=checkout.id)
    )
    if locked.status != CheckoutSession.Status.CREATED or locked.is_expired:
        raise ValueError("This checkout cannot start a Partner search.")
    locked.status = CheckoutSession.Status.FINDING_PARTNER
    locked.save(update_fields=("status",))
    return _create_next_offer(checkout=locked)


@transaction.atomic
def advance_search(*, checkout_id: UUID) -> PartnerOffer | None:
    checkout = (
        CheckoutSession.objects.select_for_update(of=("self",))
        .select_related("quote__cart_item__variant", "quote__service_area")
        .get(id=checkout_id)
    )
    if checkout.status == CheckoutSession.Status.PARTNER_COMMITTED:
        reservation = Reservation.objects.select_for_update().filter(checkout=checkout).first()
        if reservation is not None and reservation.expires_at <= timezone.now():
            reservation.release()
            checkout.status = CheckoutSession.Status.EXPIRED
            checkout.version += 1
            checkout.save(update_fields=("status", "version"))
        return None
    current = (
        PartnerOffer.objects.select_for_update(of=("self",))
        .filter(checkout=checkout, status=PartnerOffer.Status.OFFERED)
        .first()
    )
    if current is not None and current.expires_at <= timezone.now():
        current.status = PartnerOffer.Status.EXPIRED
        current.responded_at = timezone.now()
        current.save(update_fields=("status", "responded_at"))
    pending = (
        PartnerOffer.objects.select_for_update(of=("self",))
        .filter(checkout=checkout, status=PartnerOffer.Status.ACCEPTED_PENDING_UNDO)
        .first()
    )
    if (
        pending is not None
        and pending.undo_deadline is not None
        and pending.undo_deadline <= timezone.now()
    ):
        return commit_offer(offer_id=pending.id)
    if checkout.status == CheckoutSession.Status.FINDING_PARTNER and not checkout.is_expired:
        return _create_next_offer(checkout=checkout)
    if checkout.is_expired and checkout.status == CheckoutSession.Status.FINDING_PARTNER:
        checkout.status = CheckoutSession.Status.EXPIRED
        checkout.save(update_fields=("status",))
    return None


@transaction.atomic
def accept_offer(*, offer_id: UUID, partner: PartnerProfile) -> PartnerOffer:
    offer = (
        PartnerOffer.objects.select_for_update(of=("self",))
        .select_related("checkout__quote__cart_item__variant", "checkout__quote__service_area")
        .get(id=offer_id, partner=partner)
    )
    if offer.status != PartnerOffer.Status.OFFERED or offer.expires_at <= timezone.now():
        raise ValueError("This offer is no longer available to accept.")
    checkout = offer.checkout
    if checkout is None:
        raise ValueError("This is not a legacy Checkout offer.")
    if not _partner_available(partner=partner, checkout=checkout):
        raise ValueError("You are no longer available for this offer.")
    quote = checkout.quote
    occupied = Range(
        quote.requested_start,
        quote.requested_start + timedelta(minutes=quote.estimated_duration_minutes),
        "[)",
    )
    try:
        reservation = Reservation.objects.create(
            checkout=checkout,
            partner=partner,
            occupied_range=occupied,
            expires_at=timezone.now() + timedelta(seconds=settings.M1_PARTNER_UNDO_TIMEOUT_SECONDS),
        )
    except IntegrityError as exc:
        raise ValueError("That appointment was just reserved by another Customer.") from exc
    offer.status = PartnerOffer.Status.ACCEPTED_PENDING_UNDO
    offer.reservation = reservation
    offer.undo_deadline = reservation.expires_at
    offer.responded_at = timezone.now()
    offer.save(update_fields=("status", "reservation", "undo_deadline", "responded_at"))
    return offer


@transaction.atomic
def commit_offer(*, offer_id: UUID) -> PartnerOffer:
    offer = (
        PartnerOffer.objects.select_for_update(of=("self",))
        .select_related("checkout")
        .get(id=offer_id)
    )
    if offer.status != PartnerOffer.Status.ACCEPTED_PENDING_UNDO or offer.reservation is None:
        raise ValueError("This offer cannot be committed.")
    offer.status = PartnerOffer.Status.COMMITTED
    offer.save(update_fields=("status",))
    reservation_id = offer.reservation_id
    if reservation_id is None:
        raise ValueError("This offer has no reservation.")
    reservation = Reservation.objects.select_for_update().get(id=reservation_id)
    reservation.expires_at = timezone.now() + timedelta(seconds=settings.M1_PAYMENT_WINDOW_SECONDS)
    reservation.save(update_fields=("expires_at",))
    checkout = offer.checkout
    if checkout is None:
        raise ValueError("This is not a legacy Checkout offer.")
    checkout.status = CheckoutSession.Status.PARTNER_COMMITTED
    checkout.expires_at = reservation.expires_at
    checkout.version += 1
    checkout.save(update_fields=("status", "expires_at", "version"))
    return offer


@transaction.atomic
def decline_or_undo_offer(
    *, offer_id: UUID, partner: PartnerProfile, undo: bool
) -> PartnerOffer | None:
    offer = (
        PartnerOffer.objects.select_for_update(of=("self",))
        .select_related("checkout")
        .get(id=offer_id, partner=partner)
    )
    allowed = PartnerOffer.Status.ACCEPTED_PENDING_UNDO if undo else PartnerOffer.Status.OFFERED
    if offer.status != allowed:
        raise ValueError("This offer cannot be changed.")
    offer.status = PartnerOffer.Status.UNDONE if undo else PartnerOffer.Status.DECLINED
    offer.responded_at = timezone.now()
    offer.save(update_fields=("status", "responded_at"))
    if offer.reservation_id is not None:
        Reservation.objects.select_for_update().get(id=offer.reservation_id).release()
    checkout = offer.checkout
    if checkout is None:
        raise ValueError("This is not a legacy Checkout offer.")
    return _create_next_offer(checkout=checkout)
