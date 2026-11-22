"""Meta's WhatsApp status callbacks: what happened to a message after Meta accepted it.

Meta accepting a message (`ACCEPTED`) is not the person receiving it. Meta reports that later, to
this webhook, as a status per message: `sent`, `delivered`, `read` or `failed`. Without it a
number that is not on WhatsApp looks exactly like a message that arrived.

- `GET` is Meta's one-time verification: it echoes `hub.challenge` when `hub.verify_token` is
  `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
- `POST` carries the statuses. Every one is signed with the Meta app's secret
  (`X-Hub-Signature-256`, HMAC-SHA256 of the raw body); an unsigned or wrongly signed callback is
  refused before anything is read. With no secret configured, every `POST` is refused.

A plain Django view, not DRF: the signature is over the raw bytes, and this route is Meta's, not
part of the client contract.
"""

import hashlib
import hmac
import json
import logging
from typing import Any, Final

from django.conf import settings
from django.db import transaction
from django.http import HttpRequest, HttpResponse, HttpResponseForbidden
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.csrf import csrf_exempt

from .models import NotificationDelivery, NotificationIntent
from .whatsapp import PROVIDER

__all__ = ["WhatsAppWebhookView", "apply_status", "signature_is_valid"]

logger = logging.getLogger(__name__)

_SIGNATURE_PREFIX: Final[str] = "sha256="


def signature_is_valid(*, body: bytes, header: str) -> bool:
    secret = settings.WHATSAPP_APP_SECRET
    if not secret or not header.startswith(_SIGNATURE_PREFIX):
        return False
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header.removeprefix(_SIGNATURE_PREFIX))


def apply_status(status: dict[str, Any]) -> bool:
    """Record one Meta status against the delivery it is about. `False` when none matches.

    Only ever moves forward: `delivered` and `read` mark the delivery `DELIVERED` (a `read` adds
    when, in `metrics`); `failed` marks the delivery and its intent `FAILED`. `sent` changes
    nothing, because `ACCEPTED` already says it.
    """

    message_id = str(status.get("id", ""))[:140]
    state = str(status.get("status", ""))
    if not message_id or state not in ("delivered", "read", "failed"):
        return False
    with transaction.atomic():
        delivery = (
            NotificationDelivery.objects.select_for_update()
            .filter(provider=PROVIDER, provider_message_id=message_id)
            .order_by("-attempted_at")
            .first()
        )
        if delivery is None:
            return False
        if state == "failed":
            errors = status.get("errors")
            first = errors[0] if isinstance(errors, list) and errors else {}
            code = first.get("code", "") if isinstance(first, dict) else ""
            delivery.status = NotificationDelivery.Status.FAILED
            delivery.failure_code = f"meta_{code}"[:80] if code else "meta_failed"
            delivery.response_body = {
                key: first[key] for key in ("code", "title", "message") if key in first
            }
            delivery.completed_at = timezone.now()
            delivery.save(update_fields=("status", "failure_code", "response_body", "completed_at"))
            NotificationIntent.objects.filter(id=delivery.intent_id).update(
                status=NotificationIntent.Status.FAILED
            )
            return True
        if delivery.status == NotificationDelivery.Status.FAILED:
            return True
        delivery.status = NotificationDelivery.Status.DELIVERED
        delivery.completed_at = delivery.completed_at or timezone.now()
        if state == "read":
            delivery.metrics = {**(delivery.metrics or {}), "read_at": timezone.now().isoformat()}
        delivery.save(update_fields=("status", "completed_at", "metrics"))
    return True


def _statuses(payload: Any) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []
    entries = payload.get("entry") if isinstance(payload, dict) else None
    for entry in entries if isinstance(entries, list) else []:
        changes = entry.get("changes") if isinstance(entry, dict) else None
        for change in changes if isinstance(changes, list) else []:
            value = change.get("value") if isinstance(change, dict) else None
            statuses = value.get("statuses") if isinstance(value, dict) else None
            if isinstance(statuses, list):
                found.extend(status for status in statuses if isinstance(status, dict))
    return found


@method_decorator(csrf_exempt, name="dispatch")
class WhatsAppWebhookView(View):
    def get(self, request: HttpRequest) -> HttpResponse:
        token = settings.WHATSAPP_WEBHOOK_VERIFY_TOKEN
        if (
            token
            and request.GET.get("hub.mode") == "subscribe"
            and hmac.compare_digest(request.GET.get("hub.verify_token", ""), token)
        ):
            return HttpResponse(request.GET.get("hub.challenge", ""), content_type="text/plain")
        return HttpResponseForbidden()

    def post(self, request: HttpRequest) -> HttpResponse:
        body = request.body
        if not signature_is_valid(body=body, header=request.headers.get("X-Hub-Signature-256", "")):
            return HttpResponseForbidden()
        try:
            payload = json.loads(body)
        except ValueError:
            return HttpResponse(status=400)
        matched = sum(apply_status(status) for status in _statuses(payload))
        logger.info("whatsapp_statuses_received", extra={"matched": matched})
        # Meta retries anything but a 200 for days; a status about a message we do not know is
        # not worth that.
        return HttpResponse(status=200)
