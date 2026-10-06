"""Device registration and push delivery. Views stay thin; this module decides."""

import logging
from datetime import timedelta
from uuid import UUID

from django.db import transaction
from django.utils import timezone
from rest_framework.request import Request

from apps.identity.hashing import keyed_hash
from apps.identity.models import User, UserSession
from apps.mobile.models import PushDevice, PushTicket
from apps.mobile.push_provider import PushProviderError, PushSendResult, get_push_provider
from apps.mobile.push_templates import render_push_template
from apps.notifications.models import NotificationDelivery, NotificationIntent
from apps.notifications.serializers import NotificationSerializer
from apps.notifications.services import MAX_DELIVERY_ATTEMPTS, record_delivery_attempt

logger = logging.getLogger(__name__)

OFFER_CREATED_PURPOSE = "partner.offer_created"
_RECEIPT_DELAY_MINUTES = 15


class MobileSessionError(Exception):
    """The caller is signed in to Django but has no active Vsolve session row."""


def session_for_request(request: Request) -> UserSession:
    session_key = request.session.session_key
    if not session_key or not isinstance(request.user, User):
        raise MobileSessionError
    now = timezone.now()
    session = UserSession.objects.filter(
        user=request.user,
        session_key_hash=keyed_hash(session_key),
        revoked_at__isnull=True,
        expires_at__gt=now,
    ).first()
    if session is None:
        raise MobileSessionError
    return session


@transaction.atomic
def register_device(
    *,
    user: User,
    session: UserSession,
    expo_push_token: str,
    app: str,
    platform: str,
    app_version: str,
) -> PushDevice:
    """Upsert by token. A re-register re-binds the installation and clears a disable."""

    device, _created = PushDevice.objects.update_or_create(
        expo_push_token=expo_push_token,
        defaults={
            "user": user,
            "session": session,
            "app": app,
            "platform": platform,
            "app_version": app_version,
            "disabled_at": None,
            "disabled_reason": "",
            "last_registered_at": timezone.now(),
        },
    )
    return device


@transaction.atomic
def unregister_device(*, user: User, expo_push_token: str) -> None:
    """Disable the caller's token. An unknown token is a no-op, on purpose."""

    PushDevice.objects.filter(
        user=user,
        expo_push_token=expo_push_token,
        disabled_at__isnull=True,
    ).update(disabled_at=timezone.now(), disabled_reason="unregistered")


def active_devices_for(user: User) -> list[PushDevice]:
    now = timezone.now()
    return list(
        PushDevice.objects.filter(
            user=user,
            disabled_at__isnull=True,
            session__revoked_at__isnull=True,
            session__expires_at__gt=now,
        )
    )


def _message(
    *, token: str, title: str, body: str, data: dict[str, object], purpose: str
) -> dict[str, object]:
    return {
        "to": token,
        "title": title,
        "body": body,
        "data": data,
        "sound": "default",
        "priority": "high",
        "channelId": "offers" if purpose == OFFER_CREATED_PURPOSE else "default",
    }


def _store_tickets(
    *,
    intent: NotificationIntent,
    devices: list[PushDevice],
    results: list[PushSendResult],
) -> PushTicket | None:
    first_ok: PushTicket | None = None
    for device, result in zip(devices, results, strict=True):
        ticket, _created = PushTicket.objects.get_or_create(
            device=device,
            intent=intent,
            defaults={
                "expo_ticket_id": result.ticket_id,
                "ticket_status": result.status,
                "ticket_error": result.error,
            },
        )
        if result.status == "ok" and first_ok is None and ticket.ticket_status == "ok":
            first_ok = ticket
    return first_ok


def _fail_intent(*, intent: NotificationIntent, failure_code: str) -> None:
    if intent.status != NotificationIntent.Status.PENDING:
        return
    if intent.attempts >= MAX_DELIVERY_ATTEMPTS:
        return
    record_delivery_attempt(
        intent_id=intent.id,
        provider="expo",
        status=NotificationDelivery.Status.FAILED,
        failure_code=failure_code,
    )


@transaction.atomic
def deliver_push_intent(*, intent_id: UUID) -> None:
    """Send one pending PUSH intent to every active device, once per device."""

    intent = (
        NotificationIntent.objects.select_for_update(skip_locked=True).filter(pk=intent_id).first()
    )
    if intent is None or intent.status != NotificationIntent.Status.PENDING:
        return
    if intent.channel != NotificationIntent.Channel.PUSH:
        return
    if intent.attempts >= MAX_DELIVERY_ATTEMPTS:
        return

    copy = render_push_template(template_code=intent.template_code, context=intent.context)
    devices = [
        device
        for device in active_devices_for(intent.recipient)
        if not PushTicket.objects.filter(intent=intent, device=device).exists()
    ]
    if not devices:
        if not PushTicket.objects.filter(intent=intent).exists():
            _fail_intent(intent=intent, failure_code="no_registered_device")
        return

    try:
        provider = get_push_provider()
        results = provider.send(
            [
                _message(
                    token=device.expo_push_token,
                    title=copy.title,
                    body=copy.body,
                    data={
                        "template_code": intent.template_code,
                        "purpose": intent.purpose,
                        "target": copy.target,
                    },
                    purpose=intent.purpose,
                )
                for device in devices
            ]
        )
    except PushProviderError as exc:
        logger.warning("Push delivery failed for %s: %s", intent_id, exc.failure_code)
        _fail_intent(intent=intent, failure_code=exc.failure_code)
        return

    first_ok = _store_tickets(intent=intent, devices=devices, results=results)
    if first_ok is None:
        _fail_intent(intent=intent, failure_code="provider_error")
        return
    record_delivery_attempt(
        intent_id=intent.id,
        provider="expo",
        status=NotificationDelivery.Status.ACCEPTED,
        provider_message_id=first_ok.expo_ticket_id,
    )


def mirror_in_app_notice(*, intent_id: UUID) -> None:
    """Copy an already-delivered in-app notice onto the recipient's phones.

    This does not record another delivery attempt. The in-app row is already SENT.
    """

    intent = NotificationIntent.objects.filter(pk=intent_id).first()
    if intent is None:
        return
    if intent.channel != NotificationIntent.Channel.IN_APP:
        return
    if intent.status != NotificationIntent.Status.SENT:
        return
    if PushTicket.objects.filter(intent=intent).exists():
        return
    devices = active_devices_for(intent.recipient)
    if not devices:
        return
    try:
        provider = get_push_provider()
    except PushProviderError:
        logger.warning("In-app push mirror skipped; no push provider is configured.")
        return

    rendered = NotificationSerializer(intent).data
    target = rendered.get("target")
    data: dict[str, object] = {
        "notification_id": str(intent.id),
        "target": target,
        "purpose": intent.purpose,
    }
    results = provider.send(
        [
            _message(
                token=device.expo_push_token,
                title=str(rendered.get("title") or ""),
                body=str(rendered.get("body") or ""),
                data=data,
                purpose=intent.purpose,
            )
            for device in devices
        ]
    )
    _store_tickets(intent=intent, devices=devices, results=results)


def sweep_pending_push_intents() -> int:
    pending = NotificationIntent.objects.filter(
        channel=NotificationIntent.Channel.PUSH,
        status=NotificationIntent.Status.PENDING,
        attempts__lt=MAX_DELIVERY_ATTEMPTS,
    ).order_by("created_at")[:100]
    count = 0
    for intent in pending:
        deliver_push_intent(intent_id=intent.id)
        count += 1
    return count


def check_receipts() -> int:
    """Ask Expo about tickets old enough to have a receipt, and retire dead devices."""

    cutoff = timezone.now() - timedelta(minutes=_RECEIPT_DELAY_MINUTES)
    tickets = list(
        PushTicket.objects.filter(
            receipt_checked_at__isnull=True,
            created_at__lte=cutoff,
        )
        .exclude(expo_ticket_id="")
        .select_related("device")[:300]
    )
    if not tickets:
        return 0
    try:
        provider = get_push_provider()
    except PushProviderError:
        logger.warning("Push receipt check skipped; no push provider is configured.")
        return 0
    receipts = provider.get_receipts([ticket.expo_ticket_id for ticket in tickets])
    now = timezone.now()
    for ticket in tickets:
        receipt = receipts.get(ticket.expo_ticket_id)
        if receipt is None:
            continue
        ticket.receipt_status = receipt.status
        ticket.receipt_error = receipt.error
        ticket.receipt_checked_at = now
        ticket.save(update_fields=("receipt_status", "receipt_error", "receipt_checked_at"))
        if receipt.error == "DeviceNotRegistered" and ticket.device.disabled_at is None:
            ticket.device.disabled_at = now
            ticket.device.disabled_reason = "device_not_registered"
            ticket.device.save(update_fields=("disabled_at", "disabled_reason"))
    return len(tickets)


class InvalidAppVersionError(ValueError):
    """A version string that is not numeric dotted segments."""


def parse_app_version(value: str) -> tuple[int, ...]:
    parts = value.split(".")
    if not parts or any(part == "" or not part.isdigit() for part in parts):
        raise InvalidAppVersionError(value)
    return tuple(int(part) for part in parts)


def version_is_below(version: str, minimum: str) -> bool:
    current = parse_app_version(version)
    floor = parse_app_version(minimum)
    width = max(len(current), len(floor))
    padded_current = current + (0,) * (width - len(current))
    padded_floor = floor + (0,) * (width - len(floor))
    return padded_current < padded_floor
