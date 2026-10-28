"""Celery tasks for assignment dispatch, OneSignal push delivery, and periodic reconciliation."""

import logging
from typing import Any
from uuid import UUID

from celery import shared_task

from apps.assignments.group_services import GROUP_TERMINAL_STATUSES, reconcile_group_dispatch
from apps.carts.models import BookingGroup

logger = logging.getLogger(__name__)


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


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 3},
)
def dispatch_instant_booking_task(_self: object, booking_id: str) -> dict[str, Any]:
    """Start sequential Instant dispatch for a booking."""
    from datetime import timedelta
    from django.conf import settings
    from django.db import transaction
    from django.utils import timezone
    from apps.assignments.models import DispatchOffer
    from apps.assignments.ranking import evaluate_unit_candidates
    from apps.commerce.models import Booking

    with transaction.atomic():
        booking = (
            Booking.objects.select_for_update()
            .select_related("fulfilment_unit", "fulfilment_unit__service_area", "customer")
            .filter(id=UUID(booking_id))
            .first()
        )
        if not booking:
            return {"skipped": True, "reason": "Booking not found"}

        if booking.status in (Booking.Status.COMPLETED, Booking.Status.CANCELLED, Booking.Status.ABORTED):
            return {"skipped": True, "reason": f"Terminal booking status {booking.status}"}

        # Verify no PENDING DispatchOffer already exists
        existing_pending = DispatchOffer.objects.filter(
            booking=booking,
            status=DispatchOffer.Status.PENDING,
        ).first()
        if existing_pending:
            return {"skipped": True, "reason": f"Pending offer {existing_pending.id} already exists"}

        unit = getattr(booking, "fulfilment_unit", None)
        if not unit:
            return {"skipped": True, "reason": "No fulfilment unit on booking"}

        ranking = evaluate_unit_candidates(unit)
        candidates = ranking.ordered
        if not candidates:
            transaction.on_commit(
                lambda: reassign_or_downgrade_booking_task.delay(str(booking.id))
            )
            return {"skipped": True, "reason": "No eligible candidates found"}

        candidate = candidates[0]
        now = timezone.now()
        expiry_seconds = getattr(settings, "DISPATCH_OFFER_EXPIRY_SECONDS", 60)
        expires_at = now + timedelta(seconds=expiry_seconds)

        offer = DispatchOffer.objects.create(
            booking=booking,
            partner=candidate,
            status=DispatchOffer.Status.PENDING,
            attempt_number=1,
            offered_at=now,
            expires_at=expires_at,
        )

        logger.info(
            "dispatch_offer_created",
            extra={
                "offer_id": str(offer.id),
                "booking_id": str(booking.id),
                "partner_id": str(candidate.id),
                "attempt_number": 1,
            },
        )

        transaction.on_commit(
            lambda: send_dispatch_offer_push_task.delay(str(offer.id))
        )
        transaction.on_commit(
            lambda: expire_dispatch_offer_task.apply_async(args=[str(offer.id)], countdown=expiry_seconds)
        )

        return {"offer_id": str(offer.id), "partner_id": str(candidate.id), "attempt_number": 1}


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 3},
)
def send_dispatch_offer_push_task(_self: object, offer_id: str) -> dict[str, Any]:
    """Send OneSignal push notification to the targeted partner for an instant dispatch offer."""
    from apps.assignments.models import DispatchOffer
    from apps.partners.models import PartnerPushSubscription
    from apps.notifications.onesignal import send_push_to_external_ids
    from django.conf import settings
    from django.utils import timezone

    offer = (
        DispatchOffer.objects.select_related("partner", "partner__user", "booking")
        .filter(id=UUID(offer_id))
        .first()
    )
    if not offer or offer.status != DispatchOffer.Status.PENDING:
        return {"skipped": True, "reason": "Offer missing or no longer pending"}

    if offer.expires_at <= timezone.now():
        return {"skipped": True, "reason": "Offer already expired"}

    partner = offer.partner
    has_active_sub = PartnerPushSubscription.objects.filter(
        partner=partner,
        is_active=True,
    ).exists()

    if not has_active_sub:
        logger.warning(
            "dispatch_push_failed",
            extra={
                "offer_id": str(offer.id),
                "partner_id": str(partner.id),
                "reason": "No active push subscription",
            },
        )
        expire_dispatch_offer_task.delay(str(offer.id))
        return {"success": False, "reason": "No active push subscription"}

    external_ids = [str(partner.id), str(partner.user_id)]
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
            "attempt_number": offer.attempt_number,
        },
        url=dispatch_url,
    )

    if result.get("success") and result.get("notification_id"):
        offer.onesignal_notification_id = str(result["notification_id"])
        offer.save(update_fields=["onesignal_notification_id"])
        logger.info(
            "dispatch_push_sent",
            extra={
                "offer_id": str(offer.id),
                "booking_id": str(offer.booking_id),
                "partner_id": str(partner.id),
                "notification_id": str(result["notification_id"]),
            },
        )
    else:
        logger.warning(
            "dispatch_push_failed",
            extra={
                "offer_id": str(offer.id),
                "booking_id": str(offer.booking_id),
                "partner_id": str(partner.id),
                "errors": result.get("errors"),
            },
        )
        errors = result.get("errors") or []
        error_text = " ".join(str(e) for e in errors).lower()
        if "invalid" in error_text or "unsubscribed" in error_text:
            PartnerPushSubscription.objects.filter(partner=partner).update(is_active=False)
            expire_dispatch_offer_task.delay(str(offer.id))

    return result


send_dispatch_offer_task = send_dispatch_offer_push_task


@shared_task
def expire_dispatch_offer_task(offer_id: str) -> bool:
    """Check if the dispatch offer has expired, transition status, and trigger reassignment."""
    from apps.assignments.models import DispatchOffer
    from django.db import transaction
    from django.utils import timezone

    now = timezone.now()
    with transaction.atomic():
        offer = (
            DispatchOffer.objects.select_for_update()
            .filter(id=UUID(offer_id))
            .first()
        )
        if not offer or offer.status != DispatchOffer.Status.PENDING:
            return False

        if offer.expires_at > now:
            remaining = int((offer.expires_at - now).total_seconds())
            if remaining > 0:
                expire_dispatch_offer_task.apply_async(args=[offer_id], countdown=remaining)
            return False

        offer.status = DispatchOffer.Status.EXPIRED
        offer.responded_at = now
        offer.save(update_fields=["status", "responded_at", "updated_at"])

        logger.info(
            "dispatch_offer_expired",
            extra={
                "offer_id": str(offer.id),
                "booking_id": str(offer.booking_id),
                "partner_id": str(offer.partner_id),
                "attempt_number": offer.attempt_number,
            },
        )

        transaction.on_commit(
            lambda: reassign_or_downgrade_booking_task.delay(str(offer.booking_id))
        )
        return True


@shared_task
def reassign_or_downgrade_booking_task(
    booking_id: str,
    exhausted_partner_ids: list[str] | None = None,
) -> str | None:
    """Reassign an instant booking to the next eligible partner, or downgrade to SCHEDULED."""
    from datetime import timedelta
    from django.conf import settings
    from django.db import transaction
    from django.utils import timezone
    from apps.assignments.models import DispatchOffer
    from apps.assignments.ranking import evaluate_unit_candidates
    from apps.commerce.models import Booking
    from apps.carts.models import BookingGroup

    with transaction.atomic():
        booking = (
            Booking.objects.select_for_update()
            .select_related(
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

        # Terminal or active statuses should not receive further dispatches
        if booking.status in (
            Booking.Status.CONFIRMED,
            Booking.Status.EN_ROUTE,
            Booking.Status.ARRIVED,
            Booking.Status.IN_PROGRESS,
            Booking.Status.COMPLETED,
            Booking.Status.CANCELLED,
            Booking.Status.ABORTED,
        ):
            logger.info("[Dispatch] Booking %s in status %s; skipping reassignment", booking.id, booking.status)
            return None

        # Verify no active PENDING offer exists
        pending_offer = DispatchOffer.objects.filter(
            booking=booking,
            status=DispatchOffer.Status.PENDING,
        ).first()
        if pending_offer and pending_offer.expires_at > timezone.now():
            logger.info("[Dispatch] Booking %s already has active pending offer %s", booking.id, pending_offer.id)
            return str(pending_offer.id)

        attempted_partner_ids = set(
            DispatchOffer.objects.filter(booking=booking).values_list("partner_id", flat=True)
        )
        if exhausted_partner_ids:
            attempted_partner_ids.update(UUID(pid) for pid in exhausted_partner_ids)

        max_attempts = getattr(settings, "MAX_DISPATCH_ATTEMPTS", 5)
        attempt_count = len(attempted_partner_ids)

        candidate_pool = []
        unit = getattr(booking, "fulfilment_unit", None)
        if unit and attempt_count < max_attempts:
            ranking = evaluate_unit_candidates(unit)
            candidate_pool = [c for c in ranking.ordered if c.id not in attempted_partner_ids]

        now = timezone.now()
        expiry_seconds = getattr(settings, "DISPATCH_OFFER_EXPIRY_SECONDS", 60)

        if candidate_pool:
            next_candidate = candidate_pool[0]
            expires_at = now + timedelta(seconds=expiry_seconds)
            new_offer = DispatchOffer.objects.create(
                booking=booking,
                partner=next_candidate,
                status=DispatchOffer.Status.PENDING,
                attempt_number=attempt_count + 1,
                offered_at=now,
                expires_at=expires_at,
            )

            logger.info(
                "dispatch_reassigned",
                extra={
                    "booking_id": str(booking.id),
                    "offer_id": str(new_offer.id),
                    "partner_id": str(next_candidate.id),
                    "attempt_number": new_offer.attempt_number,
                },
            )

            transaction.on_commit(
                lambda: send_dispatch_offer_push_task.delay(str(new_offer.id))
            )
            transaction.on_commit(
                lambda: expire_dispatch_offer_task.apply_async(args=[str(new_offer.id)], countdown=expiry_seconds)
            )
            return str(new_offer.id)

        # Downgrade to SCHEDULED
        if unit and unit.booking_group:
            group = unit.booking_group
            group.booking_mode = BookingGroup.BookingMode.SCHEDULED
            group.save(update_fields=["booking_mode"])

        logger.info(
            "booking_downgraded_to_scheduled",
            extra={
                "booking_id": str(booking.id),
                "attempt_count": attempt_count,
            },
        )

        try:
            from apps.notifications.services import request_notification

            request_notification(
                recipient=booking.customer,
                template="booking.downgraded_to_scheduled",
                context={"booking_id": str(booking.id)},
            )
        except Exception as exc:
            logger.warning(
                "[Dispatch] Customer downgrade notification for booking %s skipped: %s",
                booking.id,
                exc,
            )

        return None


reassignment_or_downgrade_task = reassign_or_downgrade_booking_task


@shared_task
def reconcile_expired_dispatch_offers() -> int:
    """Periodic Celery Beat task to expire timed-out dispatch offers and trigger rotation."""
    from apps.assignments.models import DispatchOffer
    from django.db import transaction
    from django.utils import timezone

    now = timezone.now()
    expired_offers = list(
        DispatchOffer.objects.filter(
            status=DispatchOffer.Status.PENDING,
            expires_at__lte=now,
        ).values_list("id", "booking_id", "partner_id", "attempt_number")
    )

    reconciled_count = 0
    for offer_id, booking_id, partner_id, attempt_number in expired_offers:
        with transaction.atomic():
            updated = DispatchOffer.objects.filter(
                id=offer_id,
                status=DispatchOffer.Status.PENDING,
                expires_at__lte=now,
            ).update(
                status=DispatchOffer.Status.EXPIRED,
                responded_at=now,
            )
            if updated:
                reconciled_count += 1
                logger.info(
                    "dispatch_offer_expired",
                    extra={
                        "offer_id": str(offer_id),
                        "booking_id": str(booking_id),
                        "partner_id": str(partner_id),
                        "attempt_number": attempt_number,
                        "reconciled_by_beat": True,
                    },
                )
                transaction.on_commit(
                    lambda b_id=booking_id: reassign_or_downgrade_booking_task.delay(str(b_id))
                )

    return reconciled_count
