"""Celery tasks for assignment dispatch, OneSignal push delivery, and periodic reconciliation."""

import contextlib
import logging
from datetime import timedelta
from functools import partial
from http import HTTPStatus
from typing import Any
from uuid import UUID

from celery import shared_task
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.assignments.group_services import GROUP_TERMINAL_STATUSES, reconcile_group_dispatch
from apps.assignments.models import DispatchOffer
from apps.assignments.ranking import evaluate_unit_candidates
from apps.carts.models import BookingGroup
from apps.commerce.models import Booking
from apps.locations.pauses import is_area_paused
from apps.notifications.models import NotificationDelivery, NotificationIntent
from apps.notifications.services import request_notification
from apps.notifications.transport import OneSignalMessageTransport
from apps.partners.models import PartnerPushSubscription

logger = logging.getLogger(__name__)

#: Attempts a dispatch push gets before the offer stops retrying.
DISPATCH_PUSH_MAX_RETRIES = 5


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

    with transaction.atomic():
        booking = (
            Booking.objects.select_for_update(of=("self",))
            .select_related("fulfilment_unit", "fulfilment_unit__service_area", "customer")
            .filter(id=UUID(booking_id))
            .first()
        )
        if not booking:
            return {"skipped": True, "reason": "Booking not found"}

        if booking.status in (
            Booking.Status.COMPLETED,
            Booking.Status.CANCELLED,
            Booking.Status.ABORTED,
        ):
            return {"skipped": True, "reason": f"Terminal booking status {booking.status}"}

        # Verify no PENDING DispatchOffer already exists
        existing_pending = DispatchOffer.objects.filter(
            booking=booking,
            status=DispatchOffer.Status.PENDING,
        ).first()
        if existing_pending:
            return {
                "skipped": True,
                "reason": f"Pending offer {existing_pending.id} already exists",
            }

        unit = getattr(booking, "fulfilment_unit", None)
        if not unit:
            return {"skipped": True, "reason": "No fulfilment unit on booking"}
        if is_area_paused(unit.service_area):
            # Paused area (SERVICE_AREA kill switch): send nobody in. Not downgraded or cancelled:
            # Operations decides about bookings already paid for.
            return {"skipped": True, "reason": "service_area_paused"}

        ranking = evaluate_unit_candidates(unit)
        candidates = ranking.ordered
        if not candidates:
            transaction.on_commit(lambda: reassign_or_downgrade_booking_task.delay(str(booking.id)))
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

        transaction.on_commit(lambda: send_dispatch_offer_push_task.delay(str(offer.id)))
        transaction.on_commit(
            lambda: expire_dispatch_offer_task.apply_async(
                args=[str(offer.id)], countdown=expiry_seconds
            )
        )

        return {"offer_id": str(offer.id), "partner_id": str(candidate.id), "attempt_number": 1}


def _handle_dispatch_send_retry(
    self: Any,
    offer: Any,
    failure_reason: str,
    is_rate_limit: bool,
    response_data: dict[str, Any],
) -> dict[str, Any]:

    max_retries = DISPATCH_PUSH_MAX_RETRIES
    with transaction.atomic():
        offer.refresh_from_db()
        offer.retry_count += 1
        offer.failure_reason = failure_reason
        offer.onesignal_response = response_data

        if offer.retry_count >= max_retries:
            offer.status = DispatchOffer.Status.FAILED
            offer.save(
                update_fields=[
                    "status",
                    "retry_count",
                    "failure_reason",
                    "onesignal_response",
                    "updated_at",
                ]
            )
            logger.error(
                "dispatch_offer_send_failed",
                extra={
                    "offer_id": str(offer.id),
                    "partner_id": str(offer.partner_id),
                    "retry_count": offer.retry_count,
                    "failure_reason": f"max_retries_exceeded: {failure_reason}",
                },
            )
            return {"success": False, "reason": f"Max retries exceeded: {failure_reason}"}

        # Return offer to PENDING so next worker or retry can process it
        offer.status = DispatchOffer.Status.PENDING
        offer.save(
            update_fields=[
                "status",
                "retry_count",
                "failure_reason",
                "onesignal_response",
                "updated_at",
            ]
        )

    countdown = max(5 if is_rate_limit else 2, 2**offer.retry_count)
    logger.warning(
        "dispatch_offer_retry_scheduled",
        extra={
            "offer_id": str(offer.id),
            "partner_id": str(offer.partner_id),
            "retry_count": offer.retry_count,
            "countdown": countdown,
            "reason": failure_reason,
        },
    )
    if hasattr(self, "retry"):
        with contextlib.suppress(Exception):
            self.retry(countdown=countdown, max_retries=max_retries)
    return {
        "success": False,
        "retry_scheduled": True,
        "countdown": countdown,
        "reason": failure_reason,
    }


def _send_dispatch_offer_mobile_push(*, offer: Any, devices: list[Any]) -> dict[str, Any]:
    """Push the offer to the partner's signed-in mobile app devices.

    Returns `{mobile_intent_id, mobile_devices}` when handed over, `{}` when not.
    """
    if not devices or offer.partner.user_id is None:
        return {}

    from apps.mobile.services import deliver_push_intent
    from apps.notifications.models import NotificationIntent
    from apps.notifications.services import request_notification

    log_extra = {
        "offer_id": str(offer.id),
        "booking_id": str(offer.booking_id),
        "partner_id": str(offer.partner_id),
    }
    try:
        intent = request_notification(
            recipient_id=offer.partner.user_id,
            purpose="partner.offer_created",
            channel="PUSH",
            audience="PARTNER",
            template_code="partner_dispatch_offer",
            context={
                "offer_id": str(offer.id),
                "booking_id": str(offer.booking_id),
                "attempt_number": str(offer.attempt_number),
            },
            idempotency_key=f"dispatch-offer-push:{offer.id}",
        )
        if intent.status != NotificationIntent.Status.PENDING:
            # Suppressed (kill switch, preference) or already handled by an earlier attempt.
            return {}
        deliver_push_intent(intent_id=intent.id)
    except Exception as exc:
        logger.exception("dispatch_mobile_push_error", extra={**log_extra, "error": str(exc)})
        return {}

    logger.info(
        "dispatch_mobile_push_sent",
        extra={**log_extra, "intent_id": str(intent.id), "devices_count": len(devices)},
    )
    return {"mobile_intent_id": str(intent.id), "mobile_devices": len(devices)}


def _finish_mobile_only_dispatch(*, offer: Any, mobile: dict[str, Any]) -> dict[str, Any]:
    """Settle an offer whose only delivery was the mobile app push."""
    from django.db import transaction
    from django.utils import timezone

    from apps.assignments.models import DispatchOffer

    if not mobile:
        with transaction.atomic():
            offer.status = DispatchOffer.Status.FAILED
            offer.failure_reason = "mobile_push_failed"
            offer.save(update_fields=["status", "failure_reason", "updated_at"])
        expire_dispatch_offer_task.delay(str(offer.id))
        return {"success": False, "reason": "mobile_push_failed"}

    with transaction.atomic():
        offer.status = DispatchOffer.Status.SENT
        offer.sent_at = timezone.now()
        offer.save(update_fields=["status", "sent_at", "updated_at"])
    logger.info(
        "dispatch_offer_send_succeeded",
        extra={
            "offer_id": str(offer.id),
            "booking_id": str(offer.booking_id),
            "partner_id": str(offer.partner_id),
            "channel": "mobile",
            "dispatch_status": "SENT",
        },
    )
    return {"success": True, "channel": "mobile", **mobile}


@shared_task(
    bind=True,
    autoretry_for=(),
    retry_kwargs={"max_retries": 5},
)
def send_dispatch_offer_push_task(self: Any, offer_id: str) -> dict[str, Any]:  # noqa: PLR0911, PLR0912, PLR0915
    """Send OneSignal push notification to the targeted partner for an instant dispatch offer.

    Guarantees:
    - Atomically claims offer: PENDING -> SENDING via select_for_update(of=("self",))
    - Concurrency safety: only one worker can transition to SENDING
    - Handles OneSignal success (2xx + id), 2xx without ID, 429 rate limit, 5xx/network errors,
      400 client errors
    - Deduplication: never re-sends if onesignal_notification_id exists or status in (SENT,
      EXPIRED, SKIPPED)
    """
    from apps.mobile.models import PushDevice  # noqa: PLC0415 - mobile imports this module
    from apps.mobile.services import active_devices_for  # noqa: PLC0415

    offer_uuid = UUID(offer_id)
    now = timezone.now()

    # Step 1: Atomically claim the offer (PENDING -> SENDING)
    with transaction.atomic():
        offer = (
            DispatchOffer.objects.select_for_update(of=("self",))
            .select_related("partner", "partner__user", "booking")
            .filter(id=offer_uuid)
            .first()
        )
        if not offer:
            logger.info(
                "dispatch_offer_claim_skipped",
                extra={"offer_id": offer_id, "skip_reason": "dispatch_offer_not_found"},
            )
            return {"skipped": True, "reason": "Offer missing"}

        # If already sent, exit
        if offer.status == DispatchOffer.Status.SENT or offer.onesignal_notification_id:
            logger.info(
                "dispatch_offer_claim_skipped",
                extra={
                    "offer_id": str(offer.id),
                    "booking_id": str(offer.booking_id),
                    "partner_id": str(offer.partner_id),
                    "skip_reason": "dispatch_already_sent",
                    "onesignal_notification_id": offer.onesignal_notification_id,
                },
            )
            return {
                "skipped": True,
                "reason": "Push already sent",
                "notification_id": offer.onesignal_notification_id,
            }

        # If expired
        if offer.status == DispatchOffer.Status.EXPIRED or offer.expires_at <= now:
            logger.info(
                "dispatch_offer_claim_skipped",
                extra={
                    "offer_id": str(offer.id),
                    "booking_id": str(offer.booking_id),
                    "partner_id": str(offer.partner_id),
                    "skip_reason": "dispatch_expired",
                },
            )
            if offer.status != DispatchOffer.Status.EXPIRED:
                offer.status = DispatchOffer.Status.EXPIRED
                offer.save(update_fields=["status", "updated_at"])
            return {"skipped": True, "reason": "Offer already expired"}

        # If already in SENDING, another worker claimed it
        if offer.status == DispatchOffer.Status.SENDING:
            logger.info(
                "dispatch_offer_claim_skipped",
                extra={
                    "offer_id": str(offer.id),
                    "booking_id": str(offer.booking_id),
                    "partner_id": str(offer.partner_id),
                    "skip_reason": "dispatch_already_claimed",
                },
            )
            return {"skipped": True, "reason": "Offer already claimed by another worker"}

        # If in any other non-PENDING state (DECLINED, CANCELLED, FAILED, SKIPPED)
        if offer.status != DispatchOffer.Status.PENDING:
            logger.info(
                "dispatch_offer_claim_skipped",
                extra={
                    "offer_id": str(offer.id),
                    "booking_id": str(offer.booking_id),
                    "partner_id": str(offer.partner_id),
                    "skip_reason": "dispatch_invalid_state",
                    "dispatch_status": offer.status,
                },
            )
            return {"skipped": True, "reason": f"Offer in invalid state: {offer.status}"}

        # Successfully claim: PENDING -> SENDING
        offer.status = DispatchOffer.Status.SENDING
        offer.save(update_fields=["status", "updated_at"])

    logger.info(
        "dispatch_offer_claimed",
        extra={
            "offer_id": str(offer.id),
            "booking_id": str(offer.booking_id),
            "partner_id": str(offer.partner_id),
            "dispatch_status": "SENDING",
        },
    )

    # Step 2: Push subscription eligibility check. A partner signed in on the mobile app is
    # reachable through their phone even with no web push subscription.
    partner = offer.partner
    freshness_days = getattr(settings, "PUSH_SUBSCRIPTION_FRESHNESS_DAYS", 30)
    freshness_cutoff = now - timedelta(days=freshness_days)
    # With OneSignal the partner app is a OneSignal subscriber, so the one send below reaches
    # the phone too; the Expo path stays off so an offer never arrives twice.
    expo_path_on = getattr(settings, "MOBILE_PUSH_PROVIDER", "") != "onesignal"
    active_mobile_devices = (
        active_devices_for(partner.user, app=PushDevice.App.PARTNER)
        if partner.user and expo_path_on
        else []
    )
    send_web_push = True

    if getattr(settings, "FEATURE_PUSH_GATED_INSTANT", False):
        active_sub = (
            PartnerPushSubscription.objects.filter(
                partner=partner,
                is_active=True,
                opted_in=True,
                last_verified_at__gte=freshness_cutoff,
            )
            .exclude(permission_state__iexact="denied")
            .first()
        )

        if not active_sub and active_mobile_devices:
            send_web_push = False
        elif not active_sub:
            latest_sub = (
                PartnerPushSubscription.objects.filter(partner=partner)
                .order_by("-updated_at")
                .first()
            )
            if not latest_sub:
                exclusion_reason = "NO_ACTIVE_PUSH_SUBSCRIPTION"
            elif latest_sub.permission_state.lower() == "denied":
                exclusion_reason = "PUSH_PERMISSION_DENIED"
            elif not latest_sub.opted_in or not latest_sub.is_active:
                exclusion_reason = "PUSH_OPTED_OUT"
            elif latest_sub.last_verified_at < freshness_cutoff:
                exclusion_reason = "PUSH_SUBSCRIPTION_STALE"
            else:
                exclusion_reason = "NO_ACTIVE_PUSH_SUBSCRIPTION"

            logger.warning(
                f"dispatch_candidate_excluded_{exclusion_reason.lower()}",
                extra={
                    "offer_id": str(offer.id),
                    "partner_id": str(partner.id),
                    "exclusion_reason": exclusion_reason,
                    "dispatch_status": "FAILED",
                },
            )
            with transaction.atomic():
                offer.status = DispatchOffer.Status.FAILED
                offer.failure_reason = exclusion_reason
                offer.save(update_fields=["status", "failure_reason", "updated_at"])

            expire_dispatch_offer_task.delay(str(offer.id))
            return {"success": False, "reason": exclusion_reason}

    # Step 3: Prepare push parameters and dispatch via OneSignalMessageTransport
    base_url = getattr(settings, "PARTNER_PORTAL_BASE_URL", "http://localhost:3001").rstrip("/")
    dispatch_url = f"{base_url}/dispatch/{offer.id}"
    remaining_ttl = max(1, int((offer.expires_at - now).total_seconds()))

    logger.info(
        "dispatch_offer_send_started",
        extra={
            "offer_id": str(offer.id),
            "booking_id": str(offer.booking_id),
            "partner_id": str(partner.id),
            "ttl_seconds": remaining_ttl,
        },
    )

    # Mobile app push goes first and is idempotent per offer, so a web push retry never
    # sends the phone a second copy.
    mobile = _send_dispatch_offer_mobile_push(offer=offer, devices=active_mobile_devices)

    if not send_web_push:
        return _finish_mobile_only_dispatch(offer=offer, mobile=mobile)

    transport = OneSignalMessageTransport()
    try:
        transport_result = transport.send(
            channel=NotificationIntent.Channel.PUSH,
            recipient=partner.user,
            recipient_role="PARTNER",
            template_code="partner.instant_dispatch_offer",
            title="New Instant job nearby",
            body="Tap to review and accept this ASAP booking.",
            context={
                "type": "DISPATCH_OFFER",
                "offer_id": str(offer.id),
                "booking_id": str(offer.booking_id),
                "attempt_number": offer.attempt_number,
                "url": dispatch_url,
            },
            deep_link=dispatch_url,
            purpose="partner.offer",
            idempotency_key=f"dispatch_offer:{offer.id}:{offer.retry_count}",
            collapse_id=f"dispatch_offer_{offer.id}",
            web_push_topic=f"dispatch_{offer.id}",
            ttl=remaining_ttl,
            priority=10,
            expires_at=offer.expires_at,
            android_channel_id=getattr(settings, "ONESIGNAL_PARTNER_OFFER_CHANNEL_ID", "") or None,
        )
    except Exception as exc:
        if mobile:
            return _finish_mobile_only_dispatch(offer=offer, mobile=mobile)
        return _handle_dispatch_send_retry(
            self=self,
            offer=offer,
            failure_reason=f"network_exception: {exc!s}",
            is_rate_limit=False,
            response_data={"exception": str(exc)},
        )

    # Step 4: Handle Transport outcome
    notification_id = transport_result.provider_message_id
    status = transport_result.status
    failure_code = transport_result.failure_code
    http_status = transport_result.http_status or (200 if transport_result.accepted else 400)
    raw_response = transport_result.response_body or {}

    # The phone already has the offer, so a web push that did not go through is not a failure.
    if mobile and not (transport_result.accepted and notification_id):
        return _finish_mobile_only_dispatch(offer=offer, mobile=mobile)

    # Kill switch blocked
    if failure_code == "PUSH_KILL_SWITCH_ENABLED":
        with transaction.atomic():
            offer.status = DispatchOffer.Status.FAILED
            offer.failure_reason = "push_kill_switch_enabled"
            offer.save(update_fields=["status", "failure_reason", "updated_at"])
        expire_dispatch_offer_task.delay(str(offer.id))
        return {"success": False, "reason": "Push kill switch is enabled"}

    # Success: HTTP 2xx AND valid notification ID
    if transport_result.accepted and notification_id:
        with transaction.atomic():
            offer.status = DispatchOffer.Status.SENT
            offer.onesignal_notification_id = str(notification_id)
            offer.sent_at = timezone.now()
            offer.onesignal_response = raw_response
            offer.save(
                update_fields=[
                    "status",
                    "onesignal_notification_id",
                    "sent_at",
                    "onesignal_response",
                    "updated_at",
                ]
            )

        logger.info(
            "dispatch_offer_send_succeeded",
            extra={
                "offer_id": str(offer.id),
                "booking_id": str(offer.booking_id),
                "partner_id": str(partner.id),
                "onesignal_notification_id": str(notification_id),
                "dispatch_status": "SENT",
            },
        )
        return {
            "success": True,
            "notification_id": str(notification_id),
            "raw_response": raw_response,
            "http_status": http_status,
            **mobile,
        }

    # 429 Rate Limit
    if (
        status == NotificationDelivery.Status.RATE_LIMITED
        or http_status == HTTPStatus.TOO_MANY_REQUESTS
    ):
        return _handle_dispatch_send_retry(
            self=self,
            offer=offer,
            failure_reason="rate_limited_429",
            is_rate_limit=True,
            response_data=raw_response,
        )

    # 5xx Server Error or timeout
    if (
        status == NotificationDelivery.Status.RETRYABLE
        or http_status >= HTTPStatus.INTERNAL_SERVER_ERROR
    ):
        return _handle_dispatch_send_retry(
            self=self,
            offer=offer,
            failure_reason=f"server_error_{http_status}"
            if http_status >= HTTPStatus.INTERNAL_SERVER_ERROR
            else "network_timeout",
            is_rate_limit=False,
            response_data=raw_response,
        )

    # 400 / 401 / 403 / 404 Client errors: mark FAILED, do not retry
    if (
        HTTPStatus.BAD_REQUEST <= http_status < HTTPStatus.INTERNAL_SERVER_ERROR
        and status != NotificationDelivery.Status.SKIPPED
        and failure_code != "NO_VALID_RECIPIENTS"
    ):
        logger.error(
            "dispatch_offer_send_failed",
            extra={
                "offer_id": str(offer.id),
                "booking_id": str(offer.booking_id),
                "partner_id": str(partner.id),
                "http_status": http_status,
                "failure_code": failure_code,
            },
        )
        with transaction.atomic():
            offer.status = DispatchOffer.Status.FAILED
            offer.failure_reason = f"client_error_{http_status}"
            offer.onesignal_response = raw_response
            offer.save(
                update_fields=["status", "failure_reason", "onesignal_response", "updated_at"]
            )

        expire_dispatch_offer_task.delay(str(offer.id))
        return {
            "success": False,
            "notification_id": None,
            "errors": [failure_code],
            "raw_response": raw_response,
            "http_status": http_status,
        }

    # No valid recipients or skipped
    logger.warning(
        "dispatch_offer_no_valid_recipients",
        extra={
            "offer_id": str(offer.id),
            "booking_id": str(offer.booking_id),
            "partner_id": str(partner.id),
            "failure_code": failure_code,
        },
    )
    with transaction.atomic():
        offer.status = DispatchOffer.Status.FAILED
        offer.failure_reason = "no_valid_recipients"
        offer.onesignal_response = raw_response
        offer.save(update_fields=["status", "failure_reason", "onesignal_response", "updated_at"])

    expire_dispatch_offer_task.delay(str(offer.id))
    return {"success": False, "reason": "No valid recipients", "errors": [failure_code]}


send_dispatch_offer_task = send_dispatch_offer_push_task


@shared_task
def reconcile_stuck_dispatch_offers_task() -> dict[str, int]:
    """Finds offers stuck in SENDING for > 5 minutes and reconciles them."""

    now = timezone.now()
    cutoff = now - timedelta(minutes=5)
    stuck_offers = list(
        DispatchOffer.objects.filter(
            status=DispatchOffer.Status.SENDING,
            updated_at__lte=cutoff,
        )
    )

    reconciled_sent = 0
    reconciled_pending = 0
    reconciled_failed = 0

    for offer in stuck_offers:
        with transaction.atomic():
            offer.refresh_from_db()
            if offer.status != DispatchOffer.Status.SENDING or offer.updated_at > cutoff:
                continue

            if offer.onesignal_notification_id:
                offer.status = DispatchOffer.Status.SENT
                if not offer.sent_at:
                    offer.sent_at = now
                offer.save(update_fields=["status", "sent_at", "updated_at"])
                reconciled_sent += 1
                action = "marked_sent"
            elif offer.retry_count < DISPATCH_PUSH_MAX_RETRIES and offer.expires_at > now:
                offer.status = DispatchOffer.Status.PENDING
                offer.save(update_fields=["status", "updated_at"])
                reconciled_pending += 1
                action = "returned_to_pending"
                send_dispatch_offer_push_task.delay(str(offer.id))
            else:
                offer.status = DispatchOffer.Status.FAILED
                offer.failure_reason = "stuck_in_sending_timed_out"
                offer.save(update_fields=["status", "failure_reason", "updated_at"])
                reconciled_failed += 1
                action = "marked_failed"

            logger.info(
                "dispatch_offer_reconciled",
                extra={
                    "offer_id": str(offer.id),
                    "booking_id": str(offer.booking_id),
                    "action": action,
                    "retry_count": offer.retry_count,
                    "has_notification_id": bool(offer.onesignal_notification_id),
                },
            )

    return {
        "reconciled_sent": reconciled_sent,
        "reconciled_pending": reconciled_pending,
        "reconciled_failed": reconciled_failed,
    }


@shared_task
def expire_dispatch_offer_task(offer_id: str) -> bool:
    """Check if the dispatch offer has expired, transition status, and trigger reassignment."""

    now = timezone.now()
    with transaction.atomic():
        offer = DispatchOffer.objects.select_for_update().filter(id=UUID(offer_id)).first()
        if not offer or offer.status not in (
            DispatchOffer.Status.PENDING,
            DispatchOffer.Status.SENDING,
            DispatchOffer.Status.SENT,
        ):
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
def reassign_or_downgrade_booking_task(  # noqa: PLR0911 - one exit per outcome
    booking_id: str,
    exhausted_partner_ids: list[str] | None = None,
) -> str | None:
    """Reassign an instant booking to the next eligible partner, or downgrade to SCHEDULED."""

    with transaction.atomic():
        booking = (
            Booking.objects.select_for_update(of=("self",))
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

        # If an offer is already accepted, booking is actively assigned to a partner
        accepted_offer = DispatchOffer.objects.filter(
            booking=booking,
            status=DispatchOffer.Status.ACCEPTED,
        ).first()
        if accepted_offer:
            logger.info(
                "[Dispatch] Booking %s has accepted offer %s; skipping reassignment",
                booking.id,
                accepted_offer.id,
            )
            return None

        # Terminal or active service execution statuses should not receive dispatches
        if booking.status in (
            Booking.Status.EN_ROUTE,
            Booking.Status.ARRIVED,
            Booking.Status.IN_PROGRESS,
            Booking.Status.COMPLETED,
            Booking.Status.CANCELLED,
            Booking.Status.ABORTED,
        ):
            logger.info(
                "[Dispatch] Booking %s in status %s; skipping reassignment",
                booking.id,
                booking.status,
            )
            return None

        # Verify no active PENDING offer exists
        pending_offer = DispatchOffer.objects.filter(
            booking=booking,
            status=DispatchOffer.Status.PENDING,
        ).first()
        if pending_offer and pending_offer.expires_at > timezone.now():
            logger.info(
                "[Dispatch] Booking %s already has active pending offer %s",
                booking.id,
                pending_offer.id,
            )
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
        if unit is not None and is_area_paused(unit.service_area):
            # Paused area: no next offer, and no downgrade either. See the instant task above.
            return None
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

            transaction.on_commit(lambda: send_dispatch_offer_push_task.delay(str(new_offer.id)))
            transaction.on_commit(
                lambda: expire_dispatch_offer_task.apply_async(
                    args=[str(new_offer.id)], countdown=expiry_seconds
                )
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

        if booking.customer_id:
            try:
                request_notification(
                    recipient_id=booking.customer_id,
                    purpose="booking.downgraded_to_scheduled",
                    channel=NotificationIntent.Channel.IN_APP,
                    audience=NotificationIntent.Audience.CUSTOMER,
                    template_code="booking_downgraded_to_scheduled",
                    context={"booking_id": str(booking.id)},
                    idempotency_key=f"downgrade:{booking.id}",
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

    now = timezone.now()
    expired_offers = list(
        DispatchOffer.objects.filter(
            status__in=[
                DispatchOffer.Status.PENDING,
                DispatchOffer.Status.SENDING,
                DispatchOffer.Status.SENT,
            ],
            expires_at__lte=now,
        ).values_list("id", "booking_id", "partner_id", "attempt_number")
    )

    reconciled_count = 0
    for offer_id, booking_id, partner_id, attempt_number in expired_offers:
        with transaction.atomic():
            updated = DispatchOffer.objects.filter(
                id=offer_id,
                status__in=[
                    DispatchOffer.Status.PENDING,
                    DispatchOffer.Status.SENDING,
                    DispatchOffer.Status.SENT,
                ],
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
                    partial(reassign_or_downgrade_booking_task.delay, str(booking_id))
                )

    return reconciled_count
