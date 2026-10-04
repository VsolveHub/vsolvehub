"""Schedule a visit: the host's weekly visiting hours, and guests asking to see a property.

The host sets visiting slots per property (Saturday 5-6 PM, ...). Slots of one property never
overlap on the same weekday. A guest picks a day and one of that day's slots; several guests may
pick the same slot. The host accepts or declines each request, optionally with a reason, and the
guest is told either way. Nothing is paid and no room is held by a visit.
"""

from __future__ import annotations

import logging
from datetime import date, time, timedelta
from itertools import pairwise
from typing import Any
from uuid import UUID

from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.notifications.models import NotificationIntent
from apps.notifications.services import request_notification
from apps.stay.models import Property, StayVisit, Unit, VisitBlockedDate, VisitSlot
from apps.stay.services import StayStateError, _require_stay_capability

logger = logging.getLogger(__name__)

#: How far ahead a guest may ask for a visit.
VISIT_HORIZON_DAYS = 30
#: Slots a property may offer in a week; plenty for a few windows a day.
MAX_SLOTS_PER_PROPERTY = 42
MAX_BLOCKED_DATES = 60
WEEKDAY_NAMES = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")

_OPEN_STATUSES = (StayVisit.Status.REQUESTED, StayVisit.Status.ACCEPTED)


def _as_uuid(value: UUID | str) -> UUID:
    return value if isinstance(value, UUID) else UUID(str(value))


def format_time(value: time) -> str:
    """'5 PM', '10:30 AM' — how a guest reads a visiting time."""
    hour = value.hour % 12 or 12
    suffix = "AM" if value.hour < 12 else "PM"  # noqa: PLR2004
    return f"{hour} {suffix}" if value.minute == 0 else f"{hour}:{value.minute:02d} {suffix}"


def format_window(start: time, end: time) -> str:
    return f"{format_time(start)} - {format_time(end)}"


def _format_day(value: date) -> str:
    return value.strftime("%a %d %b")


# --- the host's visiting hours --------------------------------------------------------------


def _validate_slots(slots: list[dict[str, Any]]) -> list[tuple[int, time, time]]:
    """Each slot ends after it starts, and slots on the same weekday never overlap."""
    if len(slots) > MAX_SLOTS_PER_PROPERTY:
        raise StayStateError(
            f"Offer at most {MAX_SLOTS_PER_PROPERTY} visiting slots a week.", code="too_many_slots"
        )
    rows: list[tuple[int, time, time]] = []
    for slot in slots:
        weekday = int(slot["weekday"])
        start, end = slot["start_time"], slot["end_time"]
        if not 0 <= weekday <= 6:  # noqa: PLR2004
            raise StayStateError("Choose a day of the week.", code="slot_invalid")
        if end <= start:
            raise StayStateError(
                f"{WEEKDAY_NAMES[weekday]} {format_time(start)}: a slot must end after it starts.",
                code="slot_invalid",
            )
        rows.append((weekday, start, end))
    rows.sort()
    for previous, current in pairwise(rows):
        if previous[0] == current[0] and current[1] < previous[2]:
            raise StayStateError(
                f"{WEEKDAY_NAMES[current[0]]}: {format_window(previous[1], previous[2])} "
                f"overlaps {format_window(current[1], current[2])}.",
                code="slots_overlap",
            )
    return rows


@transaction.atomic
def set_visiting_hours(
    *,
    prop: Property,
    host: Any,
    visits_enabled: bool,
    slots: list[dict[str, Any]],
    blocked_dates: list[date] | None = None,
) -> Property:
    """Replace a property's weekly visiting slots and blocked days in one go.

    Slots that did not change keep their identity, so a guest who already picked one is not
    disturbed. Visits already asked for keep their own copy of the day and time.
    """
    _require_stay_capability(host)
    if prop.host_id != host.id:
        raise PermissionError("Not your property.")
    prop = Property.objects.select_for_update().get(id=prop.id)
    wanted = _validate_slots(slots)

    existing = {(s.weekday, s.start_time, s.end_time): s for s in prop.visit_slots.all()}
    keep = set(wanted)
    VisitSlot.objects.filter(
        id__in=[slot.id for key, slot in existing.items() if key not in keep]
    ).delete()
    VisitSlot.objects.bulk_create(
        [
            VisitSlot(property=prop, weekday=weekday, start_time=start, end_time=end)
            for weekday, start, end in wanted
            if (weekday, start, end) not in existing
        ]
    )

    today = timezone.localdate()
    days = sorted({day for day in (blocked_dates or []) if day >= today})
    if len(days) > MAX_BLOCKED_DATES:
        raise StayStateError(
            f"Block at most {MAX_BLOCKED_DATES} days at a time.", code="too_many_blocked_dates"
        )
    # Past blocked days are history; only upcoming ones are the host's to edit.
    prop.visit_blocked_dates.filter(date__gte=today).exclude(date__in=days).delete()
    already = set(prop.visit_blocked_dates.values_list("date", flat=True))
    VisitBlockedDate.objects.bulk_create(
        [VisitBlockedDate(property=prop, date=day) for day in days if day not in already]
    )

    if prop.visits_enabled != visits_enabled:
        prop.visits_enabled = visits_enabled
        prop.save(update_fields=("visits_enabled", "updated_at"))
    return prop


def visits_offered(prop: Property) -> bool:
    """Whether guests see "Schedule a visit" for this property."""
    return bool(prop.visits_enabled) and prop.visit_slots.exists()


def visit_availability(
    *, prop: Property, days: int = 14, start: date | None = None
) -> list[dict[str, Any]]:
    """The days a guest can visit, each with its slots. Past and blocked times are left out."""
    if not prop.visits_enabled:
        return []
    now = timezone.localtime()
    today = now.date()
    first = max(start or today, today)
    last = min(first + timedelta(days=max(days, 1) - 1), today + timedelta(VISIT_HORIZON_DAYS))
    by_weekday: dict[int, list[VisitSlot]] = {}
    for slot in prop.visit_slots.all():
        by_weekday.setdefault(slot.weekday, []).append(slot)
    if not by_weekday:
        return []
    blocked = set(
        prop.visit_blocked_dates.filter(date__gte=first, date__lte=last).values_list(
            "date", flat=True
        )
    )
    result: list[dict[str, Any]] = []
    day = first
    while day <= last:
        if day not in blocked:
            open_slots = [
                {"id": slot.id, "start_time": slot.start_time, "end_time": slot.end_time}
                for slot in sorted(by_weekday.get(day.weekday(), []), key=lambda s: s.start_time)
                if day > today or slot.start_time > now.time()
            ]
            if open_slots:
                result.append({"date": day, "slots": open_slots})
        day += timedelta(days=1)
    return result


# --- a guest asks for a visit ---------------------------------------------------------------


def _notify(
    visit: StayVisit,
    *,
    to_host: bool,
    template_code: str,
    purpose: str,
    context: dict[str, Any] | None = None,
) -> None:
    """One in-app notice about a visit. Never blocks the action it reports on."""
    prop = visit.property
    try:
        request_notification(
            recipient_id=prop.host.user_id if to_host else visit.customer_id,
            purpose=purpose,
            channel=NotificationIntent.Channel.IN_APP,
            template_code=template_code,
            context={
                "property_title": prop.title,
                "host_name": str(getattr(prop.host, "display_name", "") or "The owner"),
                "guest_name": str(getattr(visit.customer, "full_name", "") or "A guest"),
                "visit_date": _format_day(visit.visit_date),
                "visit_time": format_window(visit.start_time, visit.end_time),
                **(context or {}),
            },
            idempotency_key=f"{purpose}:{visit.id}",
        )
    except Exception:
        logger.exception("Failed to dispatch stay visit notification %s", template_code)


def _slot_started(visit_date: date, start: time) -> bool:
    now = timezone.localtime()
    return visit_date < now.date() or (visit_date == now.date() and start <= now.time())


def _slot_over(visit_date: date, end: time) -> bool:
    now = timezone.localtime()
    return visit_date < now.date() or (visit_date == now.date() and end <= now.time())


@transaction.atomic
def request_visit(
    *,
    customer: Any,
    property_id: UUID | str,
    slot_id: UUID | str,
    visit_date: date,
    unit_id: UUID | str | None = None,
    message: str = "",
) -> StayVisit:
    prop = Property.objects.select_related("host").get(id=_as_uuid(property_id))
    if prop.public_state != "PUBLISHED":
        raise StayStateError("This property is not open right now.", code="property_not_open")
    if prop.host.user_id == getattr(customer, "id", None):
        raise StayStateError("This is your own property.", code="own_property")
    if not prop.visits_enabled:
        raise StayStateError("The owner isn't taking visits right now.", code="visits_off")
    slot = VisitSlot.objects.filter(id=_as_uuid(slot_id), property=prop).first()
    if slot is None or slot.weekday != visit_date.weekday():
        raise StayStateError(
            "This visiting time is no longer offered. Pick another.", code="slot_unavailable"
        )
    today = timezone.localdate()
    if visit_date > today + timedelta(days=VISIT_HORIZON_DAYS):
        raise StayStateError(
            f"Pick a day in the next {VISIT_HORIZON_DAYS} days.", code="visit_date_invalid"
        )
    if _slot_started(visit_date, slot.start_time):
        raise StayStateError("That time has already passed. Pick another.", code="slot_passed")
    if prop.visit_blocked_dates.filter(date=visit_date).exists():
        raise StayStateError("The owner isn't taking visits that day.", code="visit_date_blocked")
    unit = None
    if unit_id is not None:
        unit = Unit.objects.filter(id=_as_uuid(unit_id), property=prop, is_active=True).first()
        if unit is None:
            raise StayStateError("This room is not available.", code="room_unavailable")
    duplicate = StayVisit.objects.filter(
        customer=customer, property=prop, visit_date=visit_date, status__in=_OPEN_STATUSES
    ).exists()
    if duplicate:
        raise StayStateError(
            "You already have a visit to this property that day.", code="duplicate_visit"
        )
    try:
        with transaction.atomic():
            visit = StayVisit.objects.create(
                property=prop,
                unit=unit,
                customer=customer,
                slot=slot,
                visit_date=visit_date,
                start_time=slot.start_time,
                end_time=slot.end_time,
                message=(message or "").strip()[:1000],
            )
    except IntegrityError as exc:
        raise StayStateError(
            "You already have a visit to this property that day.", code="duplicate_visit"
        ) from exc
    _notify(
        visit, to_host=True, template_code="stay_visit_requested", purpose="stay.visit.requested"
    )
    return visit


def _own_visit(visit: StayVisit, host: Any) -> StayVisit:
    _require_stay_capability(host)
    if visit.property.host_id != host.id:
        raise PermissionError("Not your property.")
    return (
        StayVisit.objects.select_for_update(of=("self",))
        .select_related("property__host", "customer")
        .get(id=visit.id)
    )


@transaction.atomic
def accept_visit(*, visit: StayVisit, host: Any) -> StayVisit:
    visit = _own_visit(visit, host)
    if visit.status != StayVisit.Status.REQUESTED:
        raise StayStateError("This visit is not waiting for you.", code="visit_not_pending")
    if _slot_over(visit.visit_date, visit.end_time):
        raise StayStateError("This visit time has passed.", code="visit_passed")
    visit.status = StayVisit.Status.ACCEPTED
    visit.responded_at = timezone.now()
    visit.save(update_fields=("status", "responded_at", "updated_at"))
    _notify(
        visit, to_host=False, template_code="stay_visit_accepted", purpose="stay.visit.accepted"
    )
    return visit


@transaction.atomic
def decline_visit(*, visit: StayVisit, host: Any, reason: str = "", note: str = "") -> StayVisit:
    """The host turns a visit down. A reason is optional and only shown when chosen."""
    visit = _own_visit(visit, host)
    if visit.status not in _OPEN_STATUSES:
        raise StayStateError("This visit is already closed.", code="visit_closed")
    reason = (reason or "").strip()
    if reason and reason not in StayVisit.DeclineReason.values:
        raise StayStateError("Choose one of the listed reasons.", code="reason_invalid")
    visit.status = StayVisit.Status.DECLINED
    visit.decline_reason = reason
    visit.decline_note = (
        (note or "").strip()[:240] if reason == StayVisit.DeclineReason.OTHER else ""
    )
    visit.responded_at = timezone.now()
    visit.save(
        update_fields=("status", "decline_reason", "decline_note", "responded_at", "updated_at")
    )
    _notify(
        visit,
        to_host=False,
        template_code="stay_visit_declined",
        purpose="stay.visit.declined",
        context={"reason_text": f" Reason: {guest_reason_text(visit)}." if reason else ""},
    )
    return visit


def guest_reason_text(visit: StayVisit) -> str:
    """What the guest is told about a declined visit: the chosen reason, or nothing."""
    if not visit.decline_reason:
        return ""
    if visit.decline_reason == StayVisit.DeclineReason.OTHER:
        return visit.decline_note or StayVisit.DeclineReason.OTHER.label
    return str(StayVisit.DeclineReason(visit.decline_reason).label)


@transaction.atomic
def cancel_visit(*, visit: StayVisit, customer: Any) -> StayVisit:
    if visit.customer_id != getattr(customer, "id", None):
        raise PermissionError("Not your visit.")
    visit = (
        StayVisit.objects.select_for_update(of=("self",))
        .select_related("property__host", "customer")
        .get(id=visit.id)
    )
    if visit.status not in _OPEN_STATUSES:
        raise StayStateError("This visit is already closed.", code="visit_closed")
    visit.status = StayVisit.Status.CANCELLED
    visit.cancelled_at = timezone.now()
    visit.save(update_fields=("status", "cancelled_at", "updated_at"))
    _notify(
        visit, to_host=True, template_code="stay_visit_cancelled", purpose="stay.visit.cancelled"
    )
    return visit


@transaction.atomic
def expire_stale_visits() -> int:
    """Requests the host never answered, once their time is over."""
    now = timezone.localtime()
    stale = StayVisit.objects.select_for_update().filter(status=StayVisit.Status.REQUESTED)
    expired = 0
    for visit in stale.filter(visit_date__lte=now.date()):
        if _slot_over(visit.visit_date, visit.end_time):
            visit.status = StayVisit.Status.EXPIRED
            visit.save(update_fields=("status", "updated_at"))
            expired += 1
    return expired
