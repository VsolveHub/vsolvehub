"""Push through OneSignal, for `MOBILE_PUSH_PROVIDER=onesignal`.

Each side of the platform has one OneSignal app, shared by its website and its phone app, and
every signed-in device logs in to it with the person's user id. One send addressed to that id
therefore reaches the partner's phone *and* their browser. The Expo path in `services` is the
other mode; `services` picks exactly one, so nothing arrives twice.

Two things come through here:

- **Push intents** written by the domain (`request_notification(channel="PUSH")`): job offers,
  assignments, cancellations. Their copy lives in `push_templates`. A PUSH intent whose template
  is not registered there was written by `OneSignalMessageTransport`, which sends its own, so it
  is left alone rather than sent a second time.
- **In-app notices**, copied onto the person's devices once the feed row exists, exactly as the
  Expo path mirrors them. The copy is recorded as its own delivery row and is not counted as a
  delivery attempt: the notice was delivered when it reached the feed.
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from http import HTTPStatus
from typing import Any

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from apps.notifications import onesignal
from apps.notifications.models import (
    KillSwitch,
    NotificationDelivery,
    NotificationIntent,
    PushNotificationPreference,
)
from apps.notifications.services import is_engaged, record_delivery_attempt
from apps.notifications.transport import push_category_for

__all__ = [
    "PROVIDER",
    "deliver_push_intent_by_onesignal",
    "is_onesignal_channel",
    "mirror_in_app_notice_by_onesignal",
]

logger = logging.getLogger(__name__)

PROVIDER = "onesignal"

#: A job offer is on a clock. These get the loud "Job offers" Android channel, a TTL that ends
#: with the offer, and a collapse key so a re-send replaces rather than stacks.
_OFFER_PURPOSES = frozenset({"partner.offer_created"})

#: What OneSignal answers when nobody with that user id has a subscribed device. Retrying it
#: cannot help, so it settles the intent at once instead of spending the retry budget.
_NO_DEVICE_MARKERS = ("not subscribed", "invalid_aliases", "no subscribers")

#: Older than this, a push is not sent: see `_refusal`.
_STALE_AFTER = timedelta(minutes=30)

_PATH_BY_TARGET: dict[str, str] = {
    "PARTNER_OFFERS": "/work/offers",
    "PARTNER_WORK": "/work/all",
}


def is_onesignal_channel() -> bool:
    """Whether the apps receive push through OneSignal rather than Expo."""

    return getattr(settings, "MOBILE_PUSH_PROVIDER", "") == "onesignal"


@dataclass(frozen=True, slots=True)
class _Outcome:
    status: str
    failure_code: str = ""
    provider_message_id: str = ""
    app_id: str = ""
    response_status: int | None = None
    response_body: dict[str, Any] | None = None
    request_payload: dict[str, Any] | None = None


def _site_path(audience: str, target: dict[str, str] | None) -> str:
    kind = (target or {}).get("kind", "")
    target_id = (target or {}).get("id", "")
    if audience == NotificationIntent.Audience.PARTNER:
        if kind in ("BOOKING", "ENGAGEMENT") and target_id:
            return f"/work/jobs/{target_id}"
        return _PATH_BY_TARGET.get(kind, "/home")
    if kind == "BOOKING_GROUP" and target_id:
        return f"/bookings/{target_id}"
    return "/activity"


def _site_url(audience: str, target: dict[str, str] | None) -> str:
    """The page a browser opens on click. The phone apps route from `data` instead."""

    setting = (
        "PARTNER_PORTAL_BASE_URL"
        if audience == NotificationIntent.Audience.PARTNER
        else "CUSTOMER_SITE_URL"
    )
    base = str(getattr(settings, setting, "") or "").rstrip("/")
    return f"{base}{_site_path(audience, target)}" if base else ""


def _offer_options(context: dict[str, Any]) -> dict[str, Any] | None:
    """TTL, channel and collapse key for a job offer; `None` when the offer has already lapsed."""

    raw_expiry = context.get("expires_at")
    expires_at: datetime | None = (
        parse_datetime(raw_expiry) if isinstance(raw_expiry, str) else None
    )
    ttl: int | None = None
    if expires_at is not None:
        ttl = int((expires_at - timezone.now()).total_seconds())
        if ttl <= 0:
            return None
    offer_id = str(context.get("offer_id") or "")
    return {
        "ttl": ttl,
        "priority": 10,
        "android_channel_id": getattr(settings, "ONESIGNAL_PARTNER_OFFER_CHANNEL_ID", "") or None,
        "collapse_id": f"offer-{offer_id}" if offer_id else None,
    }


def _refusal(intent: NotificationIntent) -> _Outcome | None:
    """Why this push must not go out at all, or `None` when it may."""

    audience = intent.audience
    if audience not in (NotificationIntent.Audience.CUSTOMER, NotificationIntent.Audience.PARTNER):
        return _Outcome(NotificationDelivery.Status.SKIPPED, "no_push_app_for_audience")
    if timezone.now() - intent.created_at > _STALE_AFTER:
        # A banner about something that happened long ago (a backlog after an outage, a row
        # left from before this channel existed) is noise, not news.
        return _Outcome(NotificationDelivery.Status.SKIPPED, "stale")
    if is_engaged(KillSwitch.Scope.NOTIFICATIONS) or is_engaged(KillSwitch.Scope.PUSH):
        return _Outcome(NotificationDelivery.Status.BLOCKED, "kill_switch_engaged")
    category = push_category_for(role=audience, template_code=intent.template_code)
    if not PushNotificationPreference.is_category_enabled(intent.recipient, audience, category):
        return _Outcome(NotificationDelivery.Status.SKIPPED, "USER_PREFERENCE_DISABLED")
    return None


def _classify_failure(http_status: int, errors: list[str]) -> tuple[str, str]:
    error_text = " ".join(errors).lower()
    if any(marker in error_text for marker in _NO_DEVICE_MARKERS):
        return NotificationDelivery.Status.SKIPPED, "no_subscribed_device"
    if http_status == HTTPStatus.TOO_MANY_REQUESTS:
        return NotificationDelivery.Status.RATE_LIMITED, "rate_limited"
    if http_status == 0 or http_status >= HTTPStatus.INTERNAL_SERVER_ERROR:
        return NotificationDelivery.Status.RETRYABLE, "provider_unavailable"
    return NotificationDelivery.Status.FAILED, f"provider_error_{http_status}"


def _send(
    *,
    intent: NotificationIntent,
    title: str,
    body: str,
    data: dict[str, Any],
    target: dict[str, str] | None,
) -> _Outcome:
    refusal = _refusal(intent)
    if refusal is not None:
        return refusal
    options: dict[str, Any] | None = {"priority": 10}
    if intent.purpose in _OFFER_PURPOSES:
        options = _offer_options(intent.context or {})
    app_id, rest_key = onesignal.app_credentials(
        "CUSTOMER" if intent.audience == NotificationIntent.Audience.CUSTOMER else "PARTNER"
    )
    if options is None:
        return _Outcome(NotificationDelivery.Status.SKIPPED, "offer_expired")
    if not app_id or not rest_key:
        return _Outcome(NotificationDelivery.Status.FAILED, "onesignal_not_configured")

    site_url = _site_url(intent.audience, target)
    result = onesignal.send_push_to_external_ids(
        external_ids=[str(intent.recipient_id)],
        heading=title,
        body=body,
        data=data,
        url=site_url or None,
        app_id=app_id,
        rest_api_key=rest_key,
        **{name: value for name, value in options.items() if value is not None},
    )
    http_status = int(result.get("http_status") or 0)
    raw = result.get("raw_response") or {}
    payload = {"heading": title, "body": body, "data": data, "url": site_url}
    if result.get("success") and result.get("notification_id"):
        return _Outcome(
            NotificationDelivery.Status.ACCEPTED,
            provider_message_id=str(result["notification_id"]),
            app_id=app_id,
            response_status=http_status,
            response_body=raw,
            request_payload=payload,
        )
    status, code = _classify_failure(
        http_status, [str(error) for error in (result.get("errors") or [])]
    )
    return _Outcome(
        status,
        code,
        app_id=app_id,
        response_status=http_status or None,
        response_body=raw,
        request_payload=payload,
    )


def deliver_push_intent_by_onesignal(
    *, intent: NotificationIntent, title: str, body: str, target: dict[str, str] | None
) -> None:
    """Send one pending domain PUSH intent and record the attempt on it.

    The caller holds the intent's row lock and has checked it is still `PENDING`.
    """

    context = intent.context or {}
    data: dict[str, Any] = {
        "template_code": intent.template_code,
        "purpose": intent.purpose,
        "target": target,
    }
    for key in ("offer_id", "fulfilment_unit_id", "booking_id", "expires_at", "requested_start"):
        value = context.get(key)
        if isinstance(value, str) and value:
            data[key] = value
    outcome = _send(intent=intent, title=title, body=body, data=data, target=target)
    logger.info(
        "onesignal_push_intent_delivered",
        extra={
            "intent_id": str(intent.id),
            "template_code": intent.template_code,
            "status": outcome.status,
            "failure_code": outcome.failure_code,
        },
    )
    record_delivery_attempt(
        intent_id=intent.id,
        provider=PROVIDER,
        status=outcome.status,
        provider_message_id=outcome.provider_message_id,
        failure_code=outcome.failure_code,
        app_id=outcome.app_id,
        request_payload=outcome.request_payload,
        response_status=outcome.response_status,
        response_body=outcome.response_body,
    )


def mirror_in_app_notice_by_onesignal(
    *, intent: NotificationIntent, title: str, body: str, target: dict[str, str] | None
) -> None:
    """Copy a delivered in-app notice onto the person's devices, once.

    Any later save of the notice (marking it read) fires the same signal, so "once" is checked
    under the notice's row lock rather than assumed.
    """

    if intent.audience not in (
        NotificationIntent.Audience.CUSTOMER,
        NotificationIntent.Audience.PARTNER,
    ):
        # Operations has no phone app; there is nothing to copy the notice to.
        return
    with transaction.atomic():
        NotificationIntent.objects.select_for_update().filter(pk=intent.pk).first()
        if NotificationDelivery.objects.filter(intent=intent, provider=PROVIDER).exists():
            return
        _mirror_once(intent=intent, title=title, body=body, target=target)


def _mirror_once(
    *, intent: NotificationIntent, title: str, body: str, target: dict[str, str] | None
) -> None:
    data: dict[str, Any] = {
        "notification_id": str(intent.id),
        "purpose": intent.purpose,
        "template_code": intent.template_code,
        "target": target,
    }
    outcome = _send(intent=intent, title=title, body=body, data=data, target=target)
    NotificationDelivery.objects.create(
        intent=intent,
        provider=PROVIDER,
        status=outcome.status,
        provider_message_id=outcome.provider_message_id,
        failure_code=outcome.failure_code,
        app_id=outcome.app_id,
        request_payload=outcome.request_payload or {},
        response_status=outcome.response_status,
        response_body=outcome.response_body or {},
    )
