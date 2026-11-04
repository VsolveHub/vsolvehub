"""Outbound message transport boundary, selected fail-closed.

Follows ADR-0004: an unconfigured environment raises rather than guessing a provider. A
transport that quietly no-ops is worse than one that refuses, because a silent no-op reports
success to the escalation ladder and the deadline still passes unheard.

MSG91 is the SMS, WhatsApp and voice provider. It sends only when `MSG91_AUTH_KEY` is set.
Until that value arrives, selecting `msg91` still refuses rather than pretending a message left.
The deterministic fake remains selectable only outside production.
"""

import json
import logging
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Protocol
from urllib.error import URLError
from urllib.request import Request, urlopen

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db.models import QuerySet
from django.utils import timezone

import apps.notifications.onesignal as onesignal_module
from apps.notifications.models import (
    CustomerPushSubscription,
    KillSwitch,
    NotificationDelivery,
    NotificationIntent,
    PushNotificationPreference,
)

#: Test seam: tests patch this name to stand in for the OneSignal call.
send_push_to_external_ids: Callable[..., dict[str, Any]] | None = None


def _get_send_push_fn() -> Callable[..., dict[str, Any]]:
    if send_push_to_external_ids is not None:
        return send_push_to_external_ids
    return onesignal_module.send_push_to_external_ids


logger = logging.getLogger(__name__)


class MessageTransportError(RuntimeError):
    """Raised when no transport can safely carry a message."""


@dataclass(frozen=True, slots=True)
class TransportResult:
    provider: str
    provider_message_id: str
    accepted: bool
    failure_code: str = ""
    status: str = ""
    intent_id: str = ""
    delivery_id: str = ""
    http_status: int | None = None
    response_body: dict[str, Any] | None = None


class MessageTransport(Protocol):
    code: str

    def supported_channels(self) -> tuple[str, ...]: ...

    def send(
        self,
        *,
        channel: str,
        destination: str,
        template_code: str,
        context: dict[str, object],
    ) -> TransportResult: ...


class FakeMessageTransport:
    """Deterministic transport for development and tests. Never selectable in production."""

    code = "fake"

    def supported_channels(self) -> tuple[str, ...]:
        return (
            NotificationIntent.Channel.SMS,
            NotificationIntent.Channel.EMAIL,
            NotificationIntent.Channel.PUSH,
            NotificationIntent.Channel.WHATSAPP,
            NotificationIntent.Channel.VOICE,
        )

    def send(
        self,
        *,
        channel: str,
        destination: str,
        template_code: str,
        context: dict[str, object],
    ) -> TransportResult:
        del destination, context
        if channel not in self.supported_channels():
            raise MessageTransportError(f"The fake transport cannot carry {channel}.")
        return TransportResult(
            provider=self.code,
            provider_message_id=f"fake-{channel.lower()}-{template_code}",
            accepted=True,
        )


class Msg91MessageTransport:
    """MSG91 send. Refuses when the auth key is absent so an empty env cannot report success."""

    code = "msg91"

    def supported_channels(self) -> tuple[str, ...]:
        return (
            NotificationIntent.Channel.SMS,
            NotificationIntent.Channel.WHATSAPP,
        )

    def send(
        self,
        *,
        channel: str,
        destination: str,
        template_code: str,
        context: dict[str, object],
    ) -> TransportResult:
        auth_key = getattr(settings, "MSG91_AUTH_KEY", "")
        if not auth_key:
            raise MessageTransportError("MSG91 auth key is not configured.")
        if channel not in self.supported_channels():
            raise MessageTransportError(f"MSG91 cannot carry {channel}.")
        payload = json.dumps(
            {
                "template_id": template_code,
                "recipients": [{"mobiles": destination, **{k: str(v) for k, v in context.items()}}],
            }
        ).encode()
        request = Request(  # noqa: S310
            f"{settings.MSG91_API_BASE_URL}/flow/",
            data=payload,
            headers={
                "authkey": auth_key,
                "Content-Type": "application/json",
                "accept": "application/json",
            },
            method="POST",
        )
        try:
            with urlopen(request, timeout=10) as response:  # noqa: S310
                body = response.read().decode()
        except URLError as exc:
            raise MessageTransportError("MSG91 did not accept the message.") from exc
        return TransportResult(
            provider=self.code,
            provider_message_id=body[:120],
            accepted=True,
        )


class OneSignalMessageTransport:
    """Outbound OneSignal Web Push transport.

    Enforces:
    - NotificationIntent.Channel.PUSH routing
    - Recipient resolution (CUSTOMER vs PARTNER)
    - App ID and REST API Key environment routing
    - Active, fresh, opted-in subscription gating
    - Audit tracking through NotificationIntent and NotificationDelivery
    - Kill switch enforcement (KillSwitch.Scope.PUSH & NOTIFICATIONS)
    """

    code = "onesignal"

    def supported_channels(self) -> tuple[str, ...]:
        return (NotificationIntent.Channel.PUSH,)

    def send(
        self,
        *,
        channel: str = NotificationIntent.Channel.PUSH,
        destination: str = "",
        template_code: str = "",
        context: dict[str, object] | None = None,
        recipient: Any | None = None,
        recipient_role: str = "",
        title: str = "",
        body: str = "",
        deep_link: str = "",
        idempotency_key: str = "",
        purpose: str = "",
        ttl: int | None = None,
        web_push_topic: str | None = None,
        collapse_id: str | None = None,
        priority: int | None = 10,
        expires_at: datetime | None = None,
        android_channel_id: str | None = None,
        **extra: Any,
    ) -> TransportResult:
        from apps.notifications.services import fit_idempotency_key, is_engaged
        from apps.partners.models import PartnerProfile, PartnerPushSubscription

        ctx = dict(context or {})
        role = (
            str(recipient_role or ctx.get("role") or ctx.get("recipient_role") or "")
            .strip()
            .upper()
        )
        if not role:
            if recipient and (
                hasattr(recipient, "partner_profile")
                or PartnerProfile.objects.filter(user=recipient).exists()
            ):
                role = "PARTNER"
            elif recipient:
                role = "CUSTOMER"
            else:
                raise MessageTransportError(
                    "Unknown or missing recipient role: role must be CUSTOMER or PARTNER"
                )

        if role not in ("CUSTOMER", "PARTNER"):
            raise MessageTransportError(f"Unknown or missing recipient role: {role}")

        # Routing credentials: the recipient's own OneSignal app, never a shared default.
        app_id, rest_key = onesignal_module.app_credentials(
            "CUSTOMER" if role == "CUSTOMER" else "PARTNER"
        )

        if not app_id or not rest_key:
            raise MessageTransportError(
                f"Missing OneSignal credentials for {role}: "
                f"app_id={'set' if app_id else 'missing'}, "
                f"rest_key={'set' if rest_key else 'missing'}"
            )

        User = get_user_model()
        user_recipient = recipient
        if user_recipient is None and destination:
            try:
                user_recipient = User.objects.get(id=destination)
            except Exception:
                user_recipient = None

        if user_recipient is None:
            raise MessageTransportError("No valid recipient user found for push notification.")

        notif_purpose = str(purpose or ctx.get("purpose") or "transactional")
        fitted_idempotency_key = fit_idempotency_key(idempotency_key) if idempotency_key else ""
        notif_deep_link = deep_link or str(ctx.get("url") or ctx.get("deep_link") or "")
        notif_title = title or str(ctx.get("title") or ctx.get("heading") or "Notification")
        notif_body = body or str(ctx.get("body") or ctx.get("contents") or "")

        # 1. Kill switch check
        if is_engaged(KillSwitch.Scope.NOTIFICATIONS) or is_engaged(KillSwitch.Scope.PUSH):
            logger.warning(
                "push_send_blocked_by_kill_switch",
                extra={
                    "recipient_id": str(user_recipient.id),
                    "role": role,
                    "app_id": app_id,
                    "template_code": template_code,
                    "purpose": notif_purpose,
                    "idempotency_key": fitted_idempotency_key,
                    "status": "BLOCKED",
                    "failure_reason": "PUSH_KILL_SWITCH_ENABLED",
                },
            )
            if fitted_idempotency_key:
                intent, _ = NotificationIntent.objects.get_or_create(
                    idempotency_key=fitted_idempotency_key,
                    defaults={
                        "recipient": user_recipient,
                        "purpose": notif_purpose,
                        "channel": NotificationIntent.Channel.PUSH,
                        "template_code": template_code,
                        "context": ctx,
                        "deep_link": notif_deep_link,
                        "status": NotificationIntent.Status.SUPPRESSED,
                        "suppressed_reason": "PUSH_KILL_SWITCH_ENABLED",
                    },
                )
            else:
                intent = NotificationIntent.objects.create(
                    recipient=user_recipient,
                    purpose=notif_purpose,
                    channel=NotificationIntent.Channel.PUSH,
                    template_code=template_code,
                    context=ctx,
                    deep_link=notif_deep_link,
                    idempotency_key="",
                    status=NotificationIntent.Status.SUPPRESSED,
                    suppressed_reason="PUSH_KILL_SWITCH_ENABLED",
                )
            delivery = NotificationDelivery.objects.create(
                intent=intent,
                provider=self.code,
                status=NotificationDelivery.Status.BLOCKED,
                failure_code="PUSH_KILL_SWITCH_ENABLED",
                app_id=app_id,
            )
            return TransportResult(
                provider=self.code,
                provider_message_id="",
                accepted=False,
                failure_code="PUSH_KILL_SWITCH_ENABLED",
                status=NotificationDelivery.Status.BLOCKED,
                intent_id=str(intent.id),
                delivery_id=str(delivery.id),
            )

        # 1.5 Preference Check
        resolved_category = str(ctx.get("category") or "")
        if not resolved_category:
            template_str = (template_code or "").lower()
            if role == "CUSTOMER":
                if any(k in template_str for k in ["security", "auth", "login", "password"]):
                    resolved_category = PushNotificationPreference.Category.ACCOUNT_SECURITY
                elif any(k in template_str for k in ["otp", "arrival", "arrived"]):
                    resolved_category = PushNotificationPreference.Category.ARRIVAL_AND_OTP_ALERTS
                elif any(
                    k in template_str for k in ["dispatch", "assigned", "assignment", "match"]
                ):
                    resolved_category = (
                        PushNotificationPreference.Category.DISPATCH_AND_ASSIGNMENT_UPDATES
                    )
                elif any(k in template_str for k in ["promo", "offer", "discount", "campaign"]):
                    resolved_category = PushNotificationPreference.Category.OFFERS_AND_PROMOTIONS
                else:
                    resolved_category = PushNotificationPreference.Category.BOOKING_UPDATES
            elif any(k in template_str for k in ["security", "auth", "login", "bank", "payout"]):
                resolved_category = PushNotificationPreference.Category.ACCOUNT_SECURITY
            elif any(k in template_str for k in ["shift", "availability", "schedule", "reminder"]):
                resolved_category = (
                    PushNotificationPreference.Category.SHIFT_AND_AVAILABILITY_REMINDERS
                )
            elif any(k in template_str for k in ["product", "feature", "news", "announcement"]):
                resolved_category = PushNotificationPreference.Category.PRODUCT_UPDATES
            else:
                resolved_category = PushNotificationPreference.Category.JOB_AND_DISPATCH_ALERTS

        if not PushNotificationPreference.is_category_enabled(
            user_recipient, role, resolved_category
        ):
            logger.info(
                "push_send_suppressed_by_preference",
                extra={
                    "recipient_id": str(user_recipient.id),
                    "role": role,
                    "category": resolved_category,
                    "app_id": app_id,
                    "template_code": template_code,
                    "purpose": notif_purpose,
                    "idempotency_key": fitted_idempotency_key,
                    "status": "SKIPPED",
                    "failure_reason": "USER_PREFERENCE_DISABLED",
                },
            )
            if fitted_idempotency_key:
                intent, _ = NotificationIntent.objects.get_or_create(
                    idempotency_key=fitted_idempotency_key,
                    defaults={
                        "recipient": user_recipient,
                        "purpose": notif_purpose,
                        "channel": NotificationIntent.Channel.PUSH,
                        "template_code": template_code,
                        "context": ctx,
                        "deep_link": notif_deep_link,
                        "status": NotificationIntent.Status.SUPPRESSED,
                        "suppressed_reason": "USER_PREFERENCE_DISABLED",
                    },
                )
            else:
                intent = NotificationIntent.objects.create(
                    recipient=user_recipient,
                    purpose=notif_purpose,
                    channel=NotificationIntent.Channel.PUSH,
                    template_code=template_code,
                    context=ctx,
                    deep_link=notif_deep_link,
                    idempotency_key="",
                    status=NotificationIntent.Status.SUPPRESSED,
                    suppressed_reason="USER_PREFERENCE_DISABLED",
                )
            delivery = NotificationDelivery.objects.create(
                intent=intent,
                provider=self.code,
                status=NotificationDelivery.Status.SKIPPED,
                failure_code="USER_PREFERENCE_DISABLED",
                app_id=app_id,
            )
            return TransportResult(
                provider=self.code,
                provider_message_id="",
                accepted=False,
                failure_code="USER_PREFERENCE_DISABLED",
                status=NotificationDelivery.Status.SKIPPED,
                intent_id=str(intent.id),
                delivery_id=str(delivery.id),
            )

        # 2. Subscription Freshness and Reachability Resolution
        now = timezone.now()
        freshness_days = getattr(settings, "PUSH_SUBSCRIPTION_FRESHNESS_DAYS", 30)
        freshness_cutoff = now - timedelta(days=freshness_days)

        if role == "CUSTOMER":
            subs: QuerySet[Any] = CustomerPushSubscription.objects.filter(
                user=user_recipient
            ).order_by("-updated_at")
            valid_sub = (
                subs.filter(
                    is_active=True,
                    opted_in=True,
                    last_verified_at__gte=freshness_cutoff,
                )
                .exclude(permission_state__iexact="denied")
                .first()
            )
            external_id = str(user_recipient.id)
        else:
            partner = getattr(user_recipient, "partner_profile", None)
            if not partner:
                partner = PartnerProfile.objects.filter(user=user_recipient).first()
            subs = (
                PartnerPushSubscription.objects.filter(partner=partner)
                if partner
                else PartnerPushSubscription.objects.filter(user=user_recipient)
            ).order_by("-updated_at")
            valid_sub = (
                subs.filter(
                    is_active=True,
                    opted_in=True,
                    last_verified_at__gte=freshness_cutoff,
                )
                .exclude(permission_state__iexact="denied")
                .first()
            )
            external_id = str(user_recipient.id)

        gate_required = (
            True if role == "CUSTOMER" else getattr(settings, "FEATURE_PUSH_GATED_INSTANT", False)
        )
        if not valid_sub and (gate_required or subs.exists()):
            latest = subs.first()
            if latest is None:
                reason = "NO_ACTIVE_SUBSCRIPTION"
            elif latest.permission_state.lower() == "denied":
                reason = "PERMISSION_DENIED"
            elif not latest.opted_in or not latest.is_active:
                reason = "OPTED_OUT"
            elif latest.last_verified_at < freshness_cutoff:
                reason = "STALE_SUBSCRIPTION"
            else:
                reason = "NO_ACTIVE_SUBSCRIPTION"

            logger.info(
                "push_notification_no_valid_recipients",
                extra={
                    "recipient_id": str(user_recipient.id),
                    "role": role,
                    "app_id": app_id,
                    "template_code": template_code,
                    "purpose": notif_purpose,
                    "idempotency_key": fitted_idempotency_key,
                    "failure_reason": reason,
                    "status": "SKIPPED",
                },
            )
            if fitted_idempotency_key:
                intent, _ = NotificationIntent.objects.get_or_create(
                    idempotency_key=fitted_idempotency_key,
                    defaults={
                        "recipient": user_recipient,
                        "purpose": notif_purpose,
                        "channel": NotificationIntent.Channel.PUSH,
                        "template_code": template_code,
                        "context": ctx,
                        "deep_link": notif_deep_link,
                        "status": NotificationIntent.Status.SUPPRESSED,
                        "suppressed_reason": reason,
                    },
                )
            else:
                intent = NotificationIntent.objects.create(
                    recipient=user_recipient,
                    purpose=notif_purpose,
                    channel=NotificationIntent.Channel.PUSH,
                    template_code=template_code,
                    context=ctx,
                    deep_link=notif_deep_link,
                    idempotency_key="",
                    status=NotificationIntent.Status.SUPPRESSED,
                    suppressed_reason=reason,
                )
            delivery = NotificationDelivery.objects.create(
                intent=intent,
                provider=self.code,
                status=NotificationDelivery.Status.SKIPPED,
                failure_code=reason,
                app_id=app_id,
            )
            return TransportResult(
                provider=self.code,
                provider_message_id="",
                accepted=False,
                failure_code=reason,
                status=NotificationDelivery.Status.SKIPPED,
                intent_id=str(intent.id),
                delivery_id=str(delivery.id),
            )

        # 3. Idempotency Check & NotificationIntent Creation
        if fitted_idempotency_key:
            existing_intent = NotificationIntent.objects.filter(
                idempotency_key=fitted_idempotency_key
            ).first()
            if existing_intent and existing_intent.status == NotificationIntent.Status.SENT:
                existing_delivery = existing_intent.deliveries.order_by("-created_at").first()
                return TransportResult(
                    provider=self.code,
                    provider_message_id=existing_delivery.provider_message_id
                    if existing_delivery
                    else "",
                    accepted=True,
                    status=NotificationDelivery.Status.ACCEPTED,
                    intent_id=str(existing_intent.id),
                    delivery_id=str(existing_delivery.id) if existing_delivery else "",
                )

        if fitted_idempotency_key:
            intent, created = NotificationIntent.objects.get_or_create(
                idempotency_key=fitted_idempotency_key,
                defaults={
                    "recipient": user_recipient,
                    "purpose": notif_purpose,
                    "channel": NotificationIntent.Channel.PUSH,
                    "template_code": template_code,
                    "context": ctx,
                    "deep_link": notif_deep_link,
                    "status": NotificationIntent.Status.PENDING,
                },
            )
        else:
            intent = NotificationIntent.objects.create(
                recipient=user_recipient,
                purpose=notif_purpose,
                channel=NotificationIntent.Channel.PUSH,
                template_code=template_code,
                context=ctx,
                deep_link=notif_deep_link,
                idempotency_key="",
                status=NotificationIntent.Status.PENDING,
            )
            created = True
        if created:
            logger.info(
                "push_notification_intent_created",
                extra={
                    "intent_id": str(intent.id),
                    "recipient_id": str(user_recipient.id),
                    "role": role,
                    "app_id": app_id,
                    "template_code": template_code,
                    "purpose": notif_purpose,
                    "idempotency_key": fitted_idempotency_key,
                },
            )

        # 4. Dispatch push to OneSignal
        logger.info(
            "push_notification_send_started",
            extra={
                "intent_id": str(intent.id),
                "recipient_id": str(user_recipient.id),
                "role": role,
                "app_id": app_id,
                "template_code": template_code,
                "purpose": notif_purpose,
                "idempotency_key": fitted_idempotency_key,
            },
        )

        res = _get_send_push_fn()(
            external_ids=[external_id],
            heading=notif_title,
            body=notif_body,
            data=ctx,
            url=notif_deep_link or None,
            app_id=app_id,
            rest_api_key=rest_key,
            collapse_id=collapse_id,
            web_push_topic=web_push_topic,
            ttl=ttl,
            priority=priority or 10,
            android_channel_id=android_channel_id,
        )

        http_status = res.get("http_status", 200)
        notification_id = res.get("notification_id")
        errors = res.get("errors") or []
        error_text = " ".join(str(e).lower() for e in errors)
        raw_response = res.get("raw_response", {})

        # 5. Response Classification & Audit Recording
        # Case A: Success (2xx + valid notification_id)
        if 200 <= http_status < 300 and notification_id and "unsubscribed" not in error_text:
            delivery = NotificationDelivery.objects.create(
                intent=intent,
                provider=self.code,
                status=NotificationDelivery.Status.ACCEPTED,
                provider_message_id=str(notification_id),
                app_id=app_id,
                request_payload={
                    "heading": notif_title,
                    "body": notif_body,
                    "url": notif_deep_link,
                    "data": ctx,
                },
                response_status=http_status,
                response_body=raw_response,
                completed_at=timezone.now(),
            )
            intent.attempts += 1
            intent.status = NotificationIntent.Status.SENT
            intent.save(update_fields=["attempts", "status", "updated_at"])

            logger.info(
                "push_notification_send_succeeded",
                extra={
                    "intent_id": str(intent.id),
                    "delivery_id": str(delivery.id),
                    "recipient_id": str(user_recipient.id),
                    "role": role,
                    "app_id": app_id,
                    "onesignal_notification_id": str(notification_id),
                    "status": "ACCEPTED",
                },
            )
            return TransportResult(
                provider=self.code,
                provider_message_id=str(notification_id),
                accepted=True,
                status=NotificationDelivery.Status.ACCEPTED,
                intent_id=str(intent.id),
                delivery_id=str(delivery.id),
                http_status=http_status,
                response_body=raw_response,
            )

        # Case B: 429 Rate Limit
        if http_status == 429 or "rate limit" in error_text:
            delivery = NotificationDelivery.objects.create(
                intent=intent,
                provider=self.code,
                status=NotificationDelivery.Status.RATE_LIMITED,
                failure_code="RATE_LIMITED_429",
                app_id=app_id,
                request_payload={
                    "heading": notif_title,
                    "body": notif_body,
                    "url": notif_deep_link,
                    "data": ctx,
                },
                response_status=http_status,
                response_body=raw_response,
            )
            intent.attempts += 1
            intent.save(update_fields=["attempts", "updated_at"])

            logger.warning(
                "push_notification_retry_scheduled",
                extra={
                    "intent_id": str(intent.id),
                    "delivery_id": str(delivery.id),
                    "recipient_id": str(user_recipient.id),
                    "role": role,
                    "app_id": app_id,
                    "failure_reason": "rate_limited_429",
                    "status": "RATE_LIMITED",
                },
            )
            return TransportResult(
                provider=self.code,
                provider_message_id="",
                accepted=False,
                failure_code="RATE_LIMITED_429",
                status=NotificationDelivery.Status.RATE_LIMITED,
                intent_id=str(intent.id),
                delivery_id=str(delivery.id),
                http_status=http_status,
                response_body=raw_response,
            )

        # Case C: 5xx Server Error or Network Timeout
        if http_status >= 500 or "timeout" in error_text:
            reason = f"SERVER_ERROR_{http_status}" if http_status >= 500 else "NETWORK_TIMEOUT"
            delivery = NotificationDelivery.objects.create(
                intent=intent,
                provider=self.code,
                status=NotificationDelivery.Status.RETRYABLE,
                failure_code=reason,
                app_id=app_id,
                request_payload={
                    "heading": notif_title,
                    "body": notif_body,
                    "url": notif_deep_link,
                    "data": ctx,
                },
                response_status=http_status,
                response_body=raw_response,
            )
            intent.attempts += 1
            intent.save(update_fields=["attempts", "updated_at"])

            logger.warning(
                "push_notification_retry_scheduled",
                extra={
                    "intent_id": str(intent.id),
                    "delivery_id": str(delivery.id),
                    "recipient_id": str(user_recipient.id),
                    "role": role,
                    "app_id": app_id,
                    "failure_reason": reason,
                    "status": "RETRYABLE",
                },
            )
            return TransportResult(
                provider=self.code,
                provider_message_id="",
                accepted=False,
                failure_code=reason,
                status=NotificationDelivery.Status.RETRYABLE,
                intent_id=str(intent.id),
                delivery_id=str(delivery.id),
                http_status=http_status,
                response_body=raw_response,
            )

        # Case D: 4xx Client Error
        if 400 <= http_status < 500:
            reason = f"CLIENT_ERROR_{http_status}"
            delivery = NotificationDelivery.objects.create(
                intent=intent,
                provider=self.code,
                status=NotificationDelivery.Status.FAILED,
                failure_code=reason,
                app_id=app_id,
                request_payload={
                    "heading": notif_title,
                    "body": notif_body,
                    "url": notif_deep_link,
                    "data": ctx,
                },
                response_status=http_status,
                response_body=raw_response,
                completed_at=timezone.now(),
            )
            intent.attempts += 1
            intent.status = NotificationIntent.Status.FAILED
            intent.save(update_fields=["attempts", "status", "updated_at"])

            if (
                "not subscribed" in error_text
                or "unsubscribed" in error_text
                or "invalid" in error_text
                or "not found" in error_text
            ):
                if role == "CUSTOMER":
                    CustomerPushSubscription.objects.filter(user=user_recipient).update(
                        is_active=False
                    )
                else:
                    PartnerPushSubscription.objects.filter(user=user_recipient).update(
                        is_active=False
                    )

            logger.error(
                "push_notification_send_failed",
                extra={
                    "intent_id": str(intent.id),
                    "delivery_id": str(delivery.id),
                    "recipient_id": str(user_recipient.id),
                    "role": role,
                    "app_id": app_id,
                    "failure_reason": reason,
                    "status": "FAILED",
                    "http_status": http_status,
                },
            )
            return TransportResult(
                provider=self.code,
                provider_message_id="",
                accepted=False,
                failure_code=reason,
                status=NotificationDelivery.Status.FAILED,
                intent_id=str(intent.id),
                delivery_id=str(delivery.id),
                http_status=http_status,
                response_body=raw_response,
            )

        # Case E: 200 without ID or unsubscribed player
        reason = "NO_VALID_RECIPIENTS"
        delivery = NotificationDelivery.objects.create(
            intent=intent,
            provider=self.code,
            status=NotificationDelivery.Status.FAILED,
            failure_code=reason,
            app_id=app_id,
            request_payload={
                "heading": notif_title,
                "body": notif_body,
                "url": notif_deep_link,
                "data": ctx,
            },
            response_status=http_status,
            response_body=raw_response,
            completed_at=timezone.now(),
        )
        intent.attempts += 1
        intent.status = NotificationIntent.Status.FAILED
        intent.suppressed_reason = reason
        intent.save(update_fields=["attempts", "status", "suppressed_reason", "updated_at"])

        if (
            "not subscribed" in error_text
            or "unsubscribed" in error_text
            or "invalid" in error_text
        ):
            if role == "CUSTOMER":
                CustomerPushSubscription.objects.filter(user=user_recipient).update(is_active=False)
            else:
                PartnerPushSubscription.objects.filter(user=user_recipient).update(is_active=False)

        logger.warning(
            "push_notification_no_valid_recipients",
            extra={
                "intent_id": str(intent.id),
                "delivery_id": str(delivery.id),
                "recipient_id": str(user_recipient.id),
                "role": role,
                "app_id": app_id,
                "failure_reason": reason,
                "status": "FAILED",
            },
        )
        return TransportResult(
            provider=self.code,
            provider_message_id="",
            accepted=False,
            failure_code=reason,
            status=NotificationDelivery.Status.FAILED,
            intent_id=str(intent.id),
            delivery_id=str(delivery.id),
            http_status=http_status,
            response_body=raw_response,
        )


def get_message_transport(*, provider_code: str | None = None) -> MessageTransport:
    """Select the transport, refusing rather than defaulting."""
    code = provider_code or getattr(settings, "MESSAGE_TRANSPORT", "unconfigured")
    if code == OneSignalMessageTransport.code:
        return OneSignalMessageTransport()
    if code == Msg91MessageTransport.code:
        if not getattr(settings, "MSG91_AUTH_KEY", ""):
            raise MessageTransportError("MSG91 auth key is not configured.")
        return Msg91MessageTransport()
    if code == FakeMessageTransport.code:
        allow_fake = getattr(settings, "NOTIFICATIONS_ALLOW_FAKE_TRANSPORT", False)
        if not settings.DEBUG and not allow_fake:
            raise MessageTransportError(
                "The fake message transport is not permitted in this environment.",
            )
        return FakeMessageTransport()
    raise MessageTransportError("No message transport is configured for this environment.")


def configured_channels() -> tuple[str, ...]:
    """Channels this deployment can actually send on, or none when nothing is wired."""
    try:
        return get_message_transport().supported_channels()
    except MessageTransportError:
        return ()
