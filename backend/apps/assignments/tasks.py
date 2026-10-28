"""Periodic recovery for browser-independent Booking Group dispatch."""

from uuid import UUID

from celery import shared_task

from apps.assignments.group_services import GROUP_TERMINAL_STATUSES, reconcile_group_dispatch
from apps.carts.models import BookingGroup


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 8},
)
def reconcile_one_booking_group_dispatch(_self: object, group_id: str) -> None:
    reconcile_group_dispatch(group_id=UUID(group_id))


@shared_task
def reconcile_booking_group_dispatch() -> int:
    group_ids = BookingGroup.objects.exclude(status__in=GROUP_TERMINAL_STATUSES).values_list(
        "id", flat=True
    )
    reconciled = 0
    for group_id in group_ids.iterator(chunk_size=100):
        reconcile_one_booking_group_dispatch.delay(str(group_id))
        reconciled += 1
    return reconciled


@shared_task
def send_dispatch_offer_task(offer_id: str) -> dict:
    """Send OneSignal push notification to the targeted partner for an instant dispatch offer."""
    from apps.assignments.models import DispatchOffer
    from apps.notifications.onesignal import send_push_to_external_ids
    from django.conf import settings


    offer = (
        DispatchOffer.objects.select_related("partner", "partner__user", "booking")
        .filter(id=UUID(offer_id))
        .first()
    )
    if not offer or offer.status != DispatchOffer.Status.PENDING:
        return {"skipped": True, "reason": "Offer missing or no longer pending"}

    partner = offer.partner
    external_ids = [str(partner.user_id), str(partner.id)]

    base_url = getattr(settings, "PARTNER_PORTAL_BASE_URL", "http://localhost:3001").rstrip("/")
    dispatch_url = f"{base_url}/dispatch/{offer.id}"

    result = send_push_to_external_ids(
        external_ids=external_ids,
        heading="New Instant job nearby",
        body="Tap to review and accept this ASAP booking.",
        data={
            "type": "DISPATCH_OFFER",
            "offer_id": str(offer.id),
            "booking_id": str(offer.booking_id),
        },
        url=dispatch_url,
    )
    return result


@shared_task
def expire_dispatch_offer_task(offer_id: str) -> bool:
    """Check if the dispatch offer has expired, transition status, and trigger reassignment."""
    from apps.assignments.models import DispatchOffer
    from django.utils import timezone

    offer = DispatchOffer.objects.filter(id=UUID(offer_id)).first()
    if not offer:
        return False

    now = timezone.now()
    if offer.status == DispatchOffer.Status.PENDING and now >= offer.expires_at:
        offer.status = DispatchOffer.Status.EXPIRED
        offer.responded_at = now
        offer.save(update_fields=["status", "responded_at", "updated_at"])
        reassignment_or_downgrade_task.delay(str(offer.booking_id))
        return True

    return False


@shared_task
def reassignment_or_downgrade_task(booking_id: str) -> str | None:
    """Reassign an instant booking to the next eligible partner, or downgrade to SCHEDULED."""
    from datetime import timedelta
    import logging
    from django.conf import settings
    from django.utils import timezone
    from apps.assignments.models import DispatchOffer
    from apps.assignments.ranking import evaluate_unit_candidates
    from apps.commerce.models import Booking
    from apps.carts.models import BookingGroup

    logger = logging.getLogger(__name__)

    booking = (
        Booking.objects.select_related(
            "fulfilment_unit",
            "fulfilment_unit__service_area",
            "fulfilment_unit__booking_group",
            "customer",
        )
        .filter(id=UUID(booking_id))
        .first()
    )
    if not booking:
        logger.warning("[Dispatch] Booking %s not found for reassignment", booking_id)
        return None

    # Do not reassign if booking is already completed or cancelled
    if booking.status in (Booking.Status.COMPLETED, Booking.Status.CANCELLED, Booking.Status.ABORTED):
        logger.info("[Dispatch] Booking %s in terminal status %s; skipping", booking.id, booking.status)
        return None

    # Check partners already offered
    attempted_partner_ids = set(
        DispatchOffer.objects.filter(booking=booking).values_list("partner_id", flat=True)
    )

    candidate_pool = []
    unit = getattr(booking, "fulfilment_unit", None)
    if unit:
        ranking = evaluate_unit_candidates(unit)
        candidate_pool = [c for c in ranking.ordered if c.id not in attempted_partner_ids]
    else:
        from apps.partners.models import PartnerProfile, PartnerApplication

        candidate_pool = list(
            PartnerProfile.objects.filter(
                applications__status=PartnerApplication.Status.APPROVED,
                online_sessions__ended_at__isnull=True,
            )
            .exclude(id__in=attempted_partner_ids)
            .distinct()
        )

    now = timezone.now()
    expiry_seconds = getattr(settings, "DISPATCH_OFFER_EXPIRY_SECONDS", 60)

    if candidate_pool:
        next_candidate = candidate_pool[0]
        expires_at = now + timedelta(seconds=expiry_seconds)
        new_offer = DispatchOffer.objects.create(
            booking=booking,
            partner=next_candidate,
            status=DispatchOffer.Status.PENDING,
            offered_at=now,
            expires_at=expires_at,
        )
        send_dispatch_offer_task.delay(str(new_offer.id))
        expire_dispatch_offer_task.apply_async(args=[str(new_offer.id)], countdown=expiry_seconds)
        logger.info(
            "[Dispatch] Created new DispatchOffer %s for booking %s to partner %s",
            new_offer.id,
            booking.id,
            next_candidate.id,
        )
        return str(new_offer.id)

    # No eligible partner left: Downgrade from INSTANT to SCHEDULED
    if unit and unit.booking_group:
        group = unit.booking_group
        group.booking_mode = BookingGroup.BookingMode.SCHEDULED
        group.save(update_fields=["booking_mode"])

    # Notify customer via existing notification mechanism
    try:
        from apps.notifications.services import request_notification

        request_notification(
            recipient=booking.customer,
            template="booking.downgraded_to_scheduled",
            context={"booking_id": str(booking.id)},
        )
    except Exception as exc:
        logger.warning(
            "[Dispatch] Customer downgrade notification for booking %s skipped or template unregistered: %s",
            booking.id,
            exc,
        )

    logger.warning("[Dispatch] No partners available for Instant booking %s. Downgraded to SCHEDULED.", booking.id)
    return None

