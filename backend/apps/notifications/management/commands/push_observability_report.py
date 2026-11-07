"""Management command to report on OneSignal push notification system health and alerts."""

import json
import sys
from datetime import timedelta
from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand, CommandParser
from django.utils import timezone

from apps.assignments.models import DispatchOffer
from apps.notifications.models import (
    CustomerPushSubscription,
    KillSwitch,
    NotificationDelivery,
)
from apps.notifications.services import is_engaged
from apps.partners.models import PartnerPushSubscription

#: Failure-rate percentages above which the report raises an alert.
SYNC_FAILURE_ALERT_PERCENT = 10.0
DISPATCH_FAILURE_ALERT_PERCENT = 10.0
RATE_LIMITED_ALERT_PERCENT = 5.0


class Command(BaseCommand):
    help = "Generates a health and observability report for OneSignal push notifications."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--hours",
            type=int,
            default=24,
            help="Lookback window in hours for deliveries and dispatches (default: 24).",
        )
        parser.add_argument(
            "--json",
            action="store_true",
            help="Output report as JSON.",
        )
        parser.add_argument(
            "--fail-on-alert",
            action="store_true",
            help="Exit with non-zero exit code if any critical alerts are triggered.",
        )

    def handle(self, *_args: Any, **options: Any) -> None:  # noqa: PLR0912, PLR0915
        hours = options["hours"]
        as_json = options["json"]
        fail_on_alert = options["fail_on_alert"]

        now = timezone.now()
        window_start = now - timedelta(hours=hours)
        freshness_days = getattr(settings, "PUSH_SUBSCRIPTION_FRESHNESS_DAYS", 30)
        freshness_cutoff = now - timedelta(days=freshness_days)

        # 1. Configuration & Kill Switches
        push_kill_switch = is_engaged(KillSwitch.Scope.PUSH)
        notif_kill_switch = is_engaged(KillSwitch.Scope.NOTIFICATIONS)
        customer_app_id = getattr(settings, "ONESIGNAL_CUSTOMER_APP_ID", "")
        partner_app_id = getattr(settings, "ONESIGNAL_PARTNER_APP_ID", "")
        customer_key_set = bool(getattr(settings, "ONESIGNAL_CUSTOMER_REST_API_KEY", ""))
        partner_key_set = bool(getattr(settings, "ONESIGNAL_PARTNER_REST_API_KEY", ""))
        push_gated_instant = getattr(settings, "FEATURE_PUSH_GATED_INSTANT", False)

        # 2. Subscription Health
        cust_total = CustomerPushSubscription.objects.count()
        cust_active = CustomerPushSubscription.objects.filter(is_active=True).count()
        cust_fresh = CustomerPushSubscription.objects.filter(
            is_active=True, last_verified_at__gte=freshness_cutoff
        ).count()
        cust_stale = cust_active - cust_fresh
        cust_denied = CustomerPushSubscription.objects.filter(
            permission_state__iexact="denied"
        ).count()
        cust_freshness_rate = (
            round((cust_fresh / cust_active) * 100, 1) if cust_active > 0 else 100.0
        )

        cust_sync_attempts = CustomerPushSubscription.objects.filter(
            last_sync_attempt_at__gte=window_start
        ).count()
        cust_sync_failures = CustomerPushSubscription.objects.filter(
            last_sync_attempt_at__gte=window_start, last_sync_status="FAILED"
        ).count()
        cust_sync_failure_rate = (
            round((cust_sync_failures / cust_sync_attempts) * 100, 1)
            if cust_sync_attempts > 0
            else 0.0
        )

        part_total = PartnerPushSubscription.objects.count()
        part_active = PartnerPushSubscription.objects.filter(is_active=True).count()
        part_fresh = PartnerPushSubscription.objects.filter(
            is_active=True, last_verified_at__gte=freshness_cutoff
        ).count()
        part_stale = part_active - part_fresh
        part_denied = PartnerPushSubscription.objects.filter(
            permission_state__iexact="denied"
        ).count()
        part_freshness_rate = (
            round((part_fresh / part_active) * 100, 1) if part_active > 0 else 100.0
        )

        part_sync_attempts = PartnerPushSubscription.objects.filter(
            last_sync_attempt_at__gte=window_start
        ).count()
        part_sync_failures = PartnerPushSubscription.objects.filter(
            last_sync_attempt_at__gte=window_start, last_sync_status="FAILED"
        ).count()
        part_sync_failure_rate = (
            round((part_sync_failures / part_sync_attempts) * 100, 1)
            if part_sync_attempts > 0
            else 0.0
        )

        # 3. Dispatch Health (Instant Booking Offers)
        offers_window = DispatchOffer.objects.filter(created_at__gte=window_start)
        total_offers = offers_window.count()
        sent_offers = (
            offers_window.filter(status__in=["OFFERED", "ACCEPTED", "EXPIRED", "DECLINED"])
            .exclude(onesignal_notification_id="")
            .count()
        )
        failed_offers = offers_window.filter(status="FAILED").count()
        stuck_offers = DispatchOffer.objects.filter(
            status__in=["PENDING", "SENDING"],
            created_at__lt=now - timedelta(minutes=5),
        ).count()
        dispatch_failure_rate = (
            round((failed_offers / total_offers) * 100, 1) if total_offers > 0 else 0.0
        )

        # 4. Delivery Health (NotificationDelivery)
        deliveries_window = NotificationDelivery.objects.filter(
            provider="onesignal",
            created_at__gte=window_start,
        )
        total_deliveries = deliveries_window.count()
        delivered_count = deliveries_window.filter(
            status__in=[NotificationDelivery.Status.ACCEPTED, NotificationDelivery.Status.DELIVERED]
        ).count()
        failed_deliveries = deliveries_window.filter(
            status=NotificationDelivery.Status.FAILED
        ).count()
        blocked_deliveries = deliveries_window.filter(
            status=NotificationDelivery.Status.BLOCKED
        ).count()
        skipped_deliveries = deliveries_window.filter(
            status=NotificationDelivery.Status.SKIPPED
        ).count()

        rate_limited_429 = deliveries_window.filter(failure_code="RATE_LIMITED").count()
        server_error_5xx = deliveries_window.filter(failure_code="ONESIGNAL_SERVER_ERROR").count()

        preference_skipped = deliveries_window.filter(
            failure_code="USER_PREFERENCE_DISABLED"
        ).count()
        stale_skipped = deliveries_window.filter(failure_code="STALE_SUBSCRIPTION").count()
        no_sub_skipped = deliveries_window.filter(failure_code="NO_ACTIVE_SUBSCRIPTION").count()

        rate_429 = (
            round((rate_limited_429 / total_deliveries) * 100, 1) if total_deliveries > 0 else 0.0
        )
        rate_5xx = (
            round((server_error_5xx / total_deliveries) * 100, 1) if total_deliveries > 0 else 0.0
        )

        # 5. Alert Checks
        alerts: list[dict[str, Any]] = []

        if cust_sync_failure_rate > SYNC_FAILURE_ALERT_PERCENT:
            alerts.append(
                {
                    "severity": "CRITICAL",
                    "code": "CUSTOMER_SYNC_FAILURE_HIGH",
                    "message": f"Customer sync failure rate is {cust_sync_failure_rate}% (> 10%)",
                }
            )
        if part_sync_failure_rate > SYNC_FAILURE_ALERT_PERCENT:
            alerts.append(
                {
                    "severity": "CRITICAL",
                    "code": "PARTNER_SYNC_FAILURE_HIGH",
                    "message": f"Partner sync failure rate is {part_sync_failure_rate}% (> 10%)",
                }
            )
        if dispatch_failure_rate > DISPATCH_FAILURE_ALERT_PERCENT:
            alerts.append(
                {
                    "severity": "CRITICAL",
                    "code": "DISPATCH_FAILURE_HIGH",
                    "message": f"Instant dispatch failure rate is {dispatch_failure_rate}% (> 10%)",
                }
            )
        if rate_429 > RATE_LIMITED_ALERT_PERCENT:
            alerts.append(
                {
                    "severity": "CRITICAL",
                    "code": "ONESIGNAL_429_HIGH",
                    "message": f"OneSignal 429 rate limit rate is {rate_429}% (> 5%)",
                }
            )
        if rate_5xx > 1.0:
            alerts.append(
                {
                    "severity": "CRITICAL",
                    "code": "ONESIGNAL_5XX_HIGH",
                    "message": f"OneSignal 5xx server error rate is {rate_5xx}% (> 1%)",
                }
            )
        if stuck_offers > 0:
            alerts.append(
                {
                    "severity": "CRITICAL",
                    "code": "STUCK_DISPATCH_OFFERS",
                    "message": f"{stuck_offers} dispatch offers stuck in SENDING > 5 minutes",
                }
            )
        if push_kill_switch:
            alerts.append(
                {
                    "severity": "WARNING",
                    "code": "PUSH_KILL_SWITCH_ACTIVE",
                    "message": "Push notification kill switch is actively ENGAGED",
                }
            )
        if not customer_app_id or not customer_key_set:
            alerts.append(
                {
                    "severity": "WARNING",
                    "code": "CUSTOMER_ONESIGNAL_UNCONFIGURED",
                    "message": "Customer OneSignal App ID or REST API Key is missing",
                }
            )
        if not partner_app_id or not partner_key_set:
            alerts.append(
                {
                    "severity": "WARNING",
                    "code": "PARTNER_ONESIGNAL_UNCONFIGURED",
                    "message": "Partner OneSignal App ID or REST API Key is missing",
                }
            )

        report_data = {
            "timestamp": now.isoformat(),
            "window_hours": hours,
            "config": {
                "push_kill_switch_engaged": push_kill_switch,
                "notif_kill_switch_engaged": notif_kill_switch,
                "feature_push_gated_instant": push_gated_instant,
                "customer_app_id_configured": bool(customer_app_id),
                "customer_api_key_configured": customer_key_set,
                "partner_app_id_configured": bool(partner_app_id),
                "partner_api_key_configured": partner_key_set,
            },
            "subscriptions": {
                "customer": {
                    "total": cust_total,
                    "active": cust_active,
                    "fresh": cust_fresh,
                    "stale": cust_stale,
                    "denied": cust_denied,
                    "freshness_rate_pct": cust_freshness_rate,
                    "window_sync_attempts": cust_sync_attempts,
                    "window_sync_failures": cust_sync_failures,
                    "sync_failure_rate_pct": cust_sync_failure_rate,
                },
                "partner": {
                    "total": part_total,
                    "active": part_active,
                    "fresh": part_fresh,
                    "stale": part_stale,
                    "denied": part_denied,
                    "freshness_rate_pct": part_freshness_rate,
                    "window_sync_attempts": part_sync_attempts,
                    "window_sync_failures": part_sync_failures,
                    "sync_failure_rate_pct": part_sync_failure_rate,
                },
            },
            "dispatch_health": {
                "window_total_offers": total_offers,
                "window_sent_offers": sent_offers,
                "window_failed_offers": failed_offers,
                "stuck_offers_gt_5min": stuck_offers,
                "dispatch_failure_rate_pct": dispatch_failure_rate,
            },
            "delivery_health": {
                "window_total_deliveries": total_deliveries,
                "delivered_or_accepted": delivered_count,
                "failed": failed_deliveries,
                "blocked_kill_switch": blocked_deliveries,
                "skipped": skipped_deliveries,
                "skipped_by_preference": preference_skipped,
                "skipped_stale": stale_skipped,
                "skipped_no_subscription": no_sub_skipped,
                "rate_limited_429": rate_limited_429,
                "server_error_5xx": server_error_5xx,
                "rate_429_pct": rate_429,
                "rate_5xx_pct": rate_5xx,
            },
            "alerts": alerts,
        }

        if as_json:
            self.stdout.write(json.dumps(report_data, indent=2))
        else:
            self.stdout.write("=" * 60)
            self.stdout.write(f" ONESIGNAL PUSH OBSERVABILITY REPORT (Last {hours}h)")
            self.stdout.write("=" * 60)
            self.stdout.write(f"Kill Switch PUSH: {'ENGAGED' if push_kill_switch else 'RELEASED'}")
            self.stdout.write(f"Push-Gated Instant: {push_gated_instant}")
            self.stdout.write(f"Customer App ID: {'CONFIGURED' if customer_app_id else 'MISSING'}")
            self.stdout.write(f"Partner App ID:  {'CONFIGURED' if partner_app_id else 'MISSING'}")
            self.stdout.write("-" * 60)
            self.stdout.write("SUBSCRIPTION HEALTH:")
            self.stdout.write(
                f"  Customer: {cust_active} active ({cust_fresh} fresh, {cust_stale} stale, "
                f"{cust_freshness_rate}% freshness), {cust_denied} denied"
            )
            self.stdout.write(
                f"  Partner:  {part_active} active ({part_fresh} fresh, {part_stale} stale, "
                f"{part_freshness_rate}% freshness), {part_denied} denied"
            )
            self.stdout.write(
                f"  Sync Failure Rates: Customer={cust_sync_failure_rate}%, "
                f"Partner={part_sync_failure_rate}%"
            )
            self.stdout.write("-" * 60)
            self.stdout.write("DISPATCH HEALTH:")
            self.stdout.write(
                f"  Offers: {total_offers} total, {sent_offers} sent, {failed_offers} failed "
                f"({dispatch_failure_rate}% failure rate)"
            )
            self.stdout.write(f"  Stuck Offers (>5m in SENDING): {stuck_offers}")
            self.stdout.write("-" * 60)
            self.stdout.write("DELIVERY HEALTH:")
            self.stdout.write(
                f"  Deliveries: {total_deliveries} total, {delivered_count} delivered, "
                f"{failed_deliveries} failed, {blocked_deliveries} blocked"
            )
            self.stdout.write(
                f"  Skipped: {skipped_deliveries} (Preferences: {preference_skipped}, Stale: "
                f"{stale_skipped}, No Sub: {no_sub_skipped})"
            )
            self.stdout.write(
                f"  Errors: 429 Rate-limits={rate_limited_429} ({rate_429}%), 5xx "
                f"Server={server_error_5xx} ({rate_5xx}%)"
            )
            self.stdout.write("-" * 60)
            self.stdout.write(f"ALERTS ({len(alerts)}):")
            if not alerts:
                self.stdout.write("  [OK] All push systems operational. No active alerts.")
            else:
                for a in alerts:
                    self.stdout.write(f"  [{a['severity']}] {a['code']}: {a['message']}")
            self.stdout.write("=" * 60)

        has_critical = any(a["severity"] == "CRITICAL" for a in alerts)
        if fail_on_alert and has_critical:
            sys.exit(1)
