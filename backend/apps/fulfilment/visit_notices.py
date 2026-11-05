"""What each side is told as a booked visit moves, so nobody has to keep the app open to find out.

Every notice here is an in-app notice: it lands in the feed, and `apps.mobile` copies it to the
person's phone and browser. Each carries an idempotency key, so a replayed command or a second
sweep never says the same thing twice.

- The Partner hears when a booking is paid for and therefore real, and, for a visit booked well
  ahead, when it is time to leave.
- The Customer hears when their professional sets off, arrives, and reports the work done — the
  last one is the prompt to confirm it, which until now nothing sent.
"""

import logging
from datetime import datetime, timedelta
from uuid import UUID

from django.conf import settings
from django.utils import timezone

from apps.commerce.models import Booking
from apps.notifications.services import request_notification

__all__ = [
    "notify_customer_of_visit_step",
    "notify_partner_booking_confirmed",
    "send_time_to_leave_reminders",
]

logger = logging.getLogger(__name__)

#: A visit booked at least this far ahead gets a "time to leave" reminder. One booked for the
#: next hour was accepted moments ago; reminding that Partner would only repeat the offer.
_REMINDER_MIN_LEAD = timedelta(hours=2)

_CUSTOMER_STEP_TEMPLATES: dict[str, str] = {
    str(Booking.Status.EN_ROUTE): "customer_visit_en_route",
    str(Booking.Status.ARRIVED): "customer_visit_arrived",
    str(Booking.Status.COMPLETION_SUBMITTED): "customer_visit_work_submitted",
}


_NOON = 12


def _clock(at: datetime) -> str:
    local = timezone.localtime(at)
    hour = local.hour % _NOON or _NOON
    return f"{hour}:{local.minute:02d} {'am' if local.hour < _NOON else 'pm'}"


def _when(at: datetime) -> str:
    local = timezone.localtime(at)
    return f"{local:%a} {local.day} {local:%b}, {_clock(at)}"


def _service_label(booking: Booking) -> str:
    unit = booking.fulfilment_unit
    if unit is None:
        return "your visit"
    first = unit.lines.filter(kind="SERVICE").order_by("position").first()
    return first.label if first is not None and first.label else "your visit"


def _partner_name(booking: Booking) -> str:
    name = (booking.partner.display_name or "").strip()
    return name.split()[0] if name else "Your professional"


def _notify(
    *,
    recipient_id: UUID,
    purpose: str,
    audience: str,
    template_code: str,
    context: dict[str, str],
    idempotency_key: str,
) -> None:
    """Notices never block the command that triggered them."""

    try:
        request_notification(
            recipient_id=recipient_id,
            purpose=purpose,
            channel="IN_APP",
            audience=audience,
            template_code=template_code,
            context=context,
            idempotency_key=idempotency_key,
        )
    except Exception:
        logger.exception(
            "visit_notice_failed",
            extra={"template_code": template_code, "idempotency_key": idempotency_key},
        )


def notify_customer_of_visit_step(*, booking: Booking) -> None:
    """Tell the Customer their visit moved: on the way, arrived, or work reported done."""

    template_code = _CUSTOMER_STEP_TEMPLATES.get(str(booking.status))
    unit = booking.fulfilment_unit
    if template_code is None or unit is None:
        return
    _notify(
        recipient_id=booking.customer_id,
        purpose="booking.visit_progress",
        audience="CUSTOMER",
        template_code=template_code,
        context={
            "partner_name": _partner_name(booking),
            "service": _service_label(booking),
            "target_kind": "BOOKING_GROUP",
            "target_id": str(unit.booking_group_id),
        },
        idempotency_key=f"visit-step:{booking.id}:{booking.status}",
    )


def notify_partner_booking_confirmed(*, booking: Booking) -> None:
    """The Customer paid: the job is real. Sent once per Booking."""

    if booking.partner.user_id is None:
        return
    _notify(
        recipient_id=booking.partner.user_id,
        purpose="partner.booking_confirmed",
        audience="PARTNER",
        template_code="partner_booking_confirmed",
        context={
            "service": _service_label(booking),
            "when": _when(booking.scheduled_start),
            "target_kind": "BOOKING",
            "target_id": str(booking.id),
        },
        idempotency_key=f"booking-confirmed:{booking.id}",
    )


def send_time_to_leave_reminders(*, now: datetime | None = None) -> int:
    """Remind Partners of advance visits once the "On my way" step opens.

    Run by beat every few minutes. A Booking is reminded once: the idempotency key makes a
    second sweep over the same window a no-op.
    """

    now = now or timezone.now()
    opens = timedelta(minutes=settings.M1_EN_ROUTE_OPENS_MINUTES)
    due = (
        Booking.objects.filter(
            status=Booking.Status.CONFIRMED,
            partner__isnull=False,
            scheduled_start__gt=now,
            scheduled_start__lte=now + opens,
        )
        .select_related("partner", "fulfilment_unit")
        .order_by("scheduled_start")
    )
    sent = 0
    for booking in due.iterator(chunk_size=100):
        if booking.scheduled_start - booking.created_at < _REMINDER_MIN_LEAD:
            continue
        if booking.partner.user_id is None:
            continue
        _notify(
            recipient_id=booking.partner.user_id,
            purpose="partner.visit_time_to_leave",
            audience="PARTNER",
            template_code="partner_visit_time_to_leave",
            context={
                "service": _service_label(booking),
                "time": _clock(booking.scheduled_start),
                "target_kind": "BOOKING",
                "target_id": str(booking.id),
            },
            idempotency_key=f"visit-time-to-leave:{booking.id}",
        )
        sent += 1
    return sent
