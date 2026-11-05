"""Celery tasks for OneSignal push notification delivery status reconciliation."""

import logging
from datetime import timedelta
from http import HTTPStatus

from celery import shared_task
from django.conf import settings
from django.db.models import Count
from django.utils import timezone

from apps.notifications.models import (
    CustomerPushSubscription,
    NotificationDelivery,
    NotificationIntent,
    PushNotificationPreference,
)
from apps.notifications.onesignal import get_notification_view_metrics
from apps.notifications.templates_registry import render_notification
from apps.notifications.transport import MessageTransportError, OneSignalMessageTransport
from apps.partners.models import PartnerPushSubscription

logger = logging.getLogger(__name__)


@shared_task
def send_partner_push_for_notice(intent_id: str, deep_link: str) -> None:
    """Send a Partner's in-app notice to their browser by OneSignal web push.

    The push carries the notice's own rendered title and body, so the feed and the banner can
    never say two different things. It is filed under Account (`ACCOUNT_SECURITY`), which a
    Partner cannot switch off. `OneSignalMessageTransport` records the attempt, and its
    idempotency key stops a retried task from sending twice.
    """
    intent = NotificationIntent.objects.select_related("recipient").filter(id=intent_id).first()
    if intent is None or intent.status != NotificationIntent.Status.SENT:
        return
    rendered = render_notification(template_code=intent.template_code, context=intent.context)
    try:
        OneSignalMessageTransport().send(
            recipient=intent.recipient,
            recipient_role="PARTNER",
            template_code=intent.template_code,
            title=rendered.title,
            body=rendered.body,
            context={
                "category": PushNotificationPreference.Category.ACCOUNT_SECURITY,
                "notification_id": str(intent.id),
                "purpose": intent.purpose,
            },
            deep_link=deep_link,
            purpose=intent.purpose,
            idempotency_key=f"push:{intent.idempotency_key or intent.id}",
        )
    except MessageTransportError:
        logger.warning("partner_notice_push_not_sent", extra={"intent_id": intent_id})


@shared_task
def reconcile_onesignal_push_delivery_status_task(max_deliveries: int = 100) -> dict[str, int]:
    """Periodic task to reconcile push delivery status and metrics from OneSignal View Message API.

    Queries recent deliveries created within the last 7 days that have a OneSignal notification ID
    and are in ACCEPTED or DELIVERED status.
    """
    now = timezone.now()
    lookback_cutoff = now - timedelta(days=7)

    deliveries = list(
        NotificationDelivery.objects.filter(
            provider="onesignal",
            status__in=[
                NotificationDelivery.Status.ACCEPTED,
                NotificationDelivery.Status.DELIVERED,
            ],
            created_at__gte=lookback_cutoff,
        )
        .exclude(provider_message_id="")
        .order_by("-created_at")[:max_deliveries]
    )

    reconciled_count = 0
    errored_count = 0
    rate_limited_count = 0

    partner_app_id = getattr(settings, "ONESIGNAL_PARTNER_APP_ID", "")
    customer_app_id = getattr(settings, "ONESIGNAL_CUSTOMER_APP_ID", "")
    partner_rest_key = getattr(settings, "ONESIGNAL_PARTNER_REST_API_KEY", "")
    customer_rest_key = getattr(settings, "ONESIGNAL_CUSTOMER_REST_API_KEY", "")

    for delivery in deliveries:
        app_id = delivery.app_id or partner_app_id or customer_app_id
        rest_key = customer_rest_key if app_id == customer_app_id else partner_rest_key

        if not app_id or not rest_key:
            continue

        try:
            res = get_notification_view_metrics(
                notification_id=delivery.provider_message_id,
                app_id=app_id,
                rest_api_key=rest_key,
            )
        except Exception as exc:
            logger.warning(
                "reconcile_push_delivery_exception",
                extra={"delivery_id": str(delivery.id), "error": str(exc)},
            )
            errored_count += 1
            continue

        http_status = res.get("http_status", 200)
        if http_status == HTTPStatus.TOO_MANY_REQUESTS:
            logger.warning(
                "reconcile_push_delivery_rate_limited",
                extra={"delivery_id": str(delivery.id), "app_id": app_id},
            )
            rate_limited_count += 1
            break

        if http_status >= HTTPStatus.INTERNAL_SERVER_ERROR:
            errored_count += 1
            continue

        if res.get("success"):
            metrics = {
                "successful": res.get("successful", 0),
                "failed": res.get("failed", 0),
                "errored": res.get("errored", 0),
                "converted": res.get("converted", 0),
                "received": res.get("received", 0),
                "remaining": res.get("remaining", 0),
                "reconciled_at": now.isoformat(),
            }
            new_status = (
                NotificationDelivery.Status.DELIVERED
                if (metrics["received"] > 0 or metrics["successful"] > 0)
                else delivery.status
            )
            NotificationDelivery.objects.filter(id=delivery.id).update(
                metrics=metrics,
                status=new_status,
                completed_at=now,
            )
            reconciled_count += 1
            logger.info(
                "push_notification_delivery_reconciled",
                extra={
                    "delivery_id": str(delivery.id),
                    "onesignal_notification_id": delivery.provider_message_id,
                    "metrics": metrics,
                    "status": new_status,
                },
            )

    return {
        "reconciled": reconciled_count,
        "errored": errored_count,
        "rate_limited": rate_limited_count,
    }


@shared_task
def reconcile_stale_push_subscriptions(max_subscriptions: int = 500) -> dict[str, int]:
    """Periodic task to reconcile stale, duplicate, or invalid push subscriptions.

    1. Stale Subscriptions:
       - Subscriptions older than PUSH_SUBSCRIPTION_FRESHNESS_DAYS (default 30 days)
         that are currently is_active=True are marked is_active=False.
    2. Multiple Active Web Subscriptions:
       - For users/partners with multiple active WEB subscriptions, keeps the most
         recently verified subscription active and deactivates the older ones.
    3. Delivery Failure Cleanup:
       - Subscriptions associated with recent delivery failures (e.g. invalid/unsubscribed)
         are deactivated (is_active=False, opted_in=False).
    """
    now = timezone.now()
    freshness_days = getattr(settings, "PUSH_SUBSCRIPTION_FRESHNESS_DAYS", 30)
    freshness_cutoff = now - timedelta(days=freshness_days)

    stale_customer_count = 0
    stale_partner_count = 0
    duplicate_customer_count = 0
    duplicate_partner_count = 0
    invalid_delivery_count = 0

    # 1. Stale Customer Subscriptions
    stale_cust_subs = CustomerPushSubscription.objects.filter(
        is_active=True,
        last_verified_at__lt=freshness_cutoff,
    )[:max_subscriptions]
    for sub in stale_cust_subs:
        sub.is_active = False
        sub.save(update_fields=["is_active", "updated_at"])
        stale_customer_count += 1

    # 1b. Stale Partner Subscriptions
    stale_part_subs = PartnerPushSubscription.objects.filter(
        is_active=True,
        last_verified_at__lt=freshness_cutoff,
    )[:max_subscriptions]
    for partner_sub in stale_part_subs:
        partner_sub.is_active = False
        partner_sub.save(update_fields=["is_active", "updated_at"])
        stale_partner_count += 1

    # 2. Duplicate Active WEB Subscriptions (Customer)
    cust_dupes = (
        CustomerPushSubscription.objects.filter(
            is_active=True,
            platform__iexact="web",
        )
        .values("user_id")
        .annotate(cnt=Count("id"))
        .filter(cnt__gt=1)
    )
    for entry in cust_dupes:
        user_id = entry["user_id"]
        user_subs = list(
            CustomerPushSubscription.objects.filter(
                user_id=user_id,
                is_active=True,
                platform__iexact="web",
            ).order_by("-last_verified_at", "-created_at")
        )
        for older in user_subs[1:]:
            older.is_active = False
            older.save(update_fields=["is_active", "updated_at"])
            duplicate_customer_count += 1

    # 2b. Duplicate Active WEB Subscriptions (Partner)
    part_dupes = (
        PartnerPushSubscription.objects.filter(
            is_active=True,
            platform__iexact="web",
        )
        .values("partner_id")
        .annotate(cnt=Count("id"))
        .filter(cnt__gt=1)
    )
    for entry in part_dupes:
        partner_id = entry["partner_id"]
        partner_subs = list(
            PartnerPushSubscription.objects.filter(
                partner_id=partner_id,
                is_active=True,
                platform__iexact="web",
            ).order_by("-last_verified_at", "-created_at")
        )
        for older_partner_sub in partner_subs[1:]:
            older_partner_sub.is_active = False
            older_partner_sub.save(update_fields=["is_active", "updated_at"])
            duplicate_partner_count += 1

    # 3. Invalidate Subscriptions from recent delivery errors (unsubscribed / invalid device)
    recent_bad_deliveries = NotificationDelivery.objects.filter(
        provider="onesignal",
        status=NotificationDelivery.Status.FAILED,
        created_at__gte=now - timedelta(hours=24),
    ).select_related("intent")[:100]

    for deliv in recent_bad_deliveries:
        raw = deliv.response_body or {}
        code = deliv.failure_code
        is_unsub = (
            code in ["INVALID_SUBSCRIPTION", "UNSUBSCRIBED", "DEVICE_NOT_FOUND"]
            or any(
                "unsubscribed" in str(err).lower() or "invalid" in str(err).lower()
                for err in raw.get("errors", [])
            )
            or raw.get("http_status") in [404, 410]
        )
        if is_unsub and deliv.intent and deliv.intent.recipient_id:
            user = deliv.intent.recipient
            c_cnt = CustomerPushSubscription.objects.filter(user=user, is_active=True).update(
                is_active=False, opted_in=False, updated_at=now
            )
            p_cnt = PartnerPushSubscription.objects.filter(user=user, is_active=True).update(
                is_active=False, opted_in=False, updated_at=now
            )
            invalid_delivery_count += c_cnt + p_cnt

    logger.info(
        "reconcile_stale_push_subscriptions_completed",
        extra={
            "stale_customer_deactivated": stale_customer_count,
            "stale_partner_deactivated": stale_partner_count,
            "duplicate_customer_deactivated": duplicate_customer_count,
            "duplicate_partner_deactivated": duplicate_partner_count,
            "invalid_delivery_deactivated": invalid_delivery_count,
        },
    )

    return {
        "stale_customer_deactivated": stale_customer_count,
        "stale_partner_deactivated": stale_partner_count,
        "duplicate_customer_deactivated": duplicate_customer_count,
        "duplicate_partner_deactivated": duplicate_partner_count,
        "invalid_delivery_deactivated": invalid_delivery_count,
    }
