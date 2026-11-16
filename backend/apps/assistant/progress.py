"""Telling the Customer, in the chat, what happened to the booking it created.

Status is read from the `BookingGroup` every time. The chat remembers only which *phase* it last
announced, so each change is said once, by the server, in fixed words — never by the model.

## "Confirmed" has exactly one source

The confirmed phase is `BookingGroup.Status.BOOKED`, which only `commerce.services.capture` sets,
and only after the payment provider itself has said the money moved: a signed Razorpay webhook, or
a server-to-server read of the payment with the secret key. Nothing the browser reports and nothing
the Customer types into the chat can reach that code path.
"""

from dataclasses import dataclass, field
from datetime import datetime, timedelta

from apps.carts.models import BookingGroup, FulfilmentUnit
from apps.carts.serializers import BookingGroupSerializer

from .formatting import format_inr, format_when, format_window
from .llm import JsonObject

WAITING = frozenset(
    {
        BookingGroup.Status.CONFIRMED,
        BookingGroup.Status.MATCHING,
        BookingGroup.Status.PARTIALLY_HELD,
        BookingGroup.Status.ALL_UNITS_HELD,
    }
)

PHASE_FINDING = "finding_professional"
PHASE_PAYMENT = "awaiting_payment"
PHASE_CONFIRMED = "confirmed"
PHASE_REPLAN = "slot_unavailable"
PHASE_EXPIRED = "expired"
PHASE_CANCELLED = "cancelled"
PHASE_FAILED = "failed"
PHASE_COMPLETED = "completed"

#: Phases after which the conversation may start a new booking.
CLOSING_PHASES = frozenset(
    {
        PHASE_CONFIRMED,
        PHASE_REPLAN,
        PHASE_EXPIRED,
        PHASE_CANCELLED,
        PHASE_FAILED,
        PHASE_COMPLETED,
    }
)


@dataclass(frozen=True, slots=True)
class BookingProgress:
    phase: str
    text: str
    actions: list[JsonObject] = field(default_factory=list)

    @property
    def closes(self) -> bool:
        return self.phase in CLOSING_PHASES

    def as_tool_content(self) -> JsonObject:
        return {"status": self.phase, "summary": self.text}


def phase_of(status: str) -> str:
    if status in WAITING:
        return PHASE_FINDING
    return {
        BookingGroup.Status.PAYMENT_PENDING: PHASE_PAYMENT,
        BookingGroup.Status.BOOKED: PHASE_CONFIRMED,
        BookingGroup.Status.COMPLETED: PHASE_COMPLETED,
        BookingGroup.Status.REPLAN_REQUIRED: PHASE_REPLAN,
        BookingGroup.Status.EXPIRED: PHASE_EXPIRED,
        BookingGroup.Status.CANCELLED: PHASE_CANCELLED,
        BookingGroup.Status.FAILED: PHASE_FAILED,
    }.get(BookingGroup.Status(status), PHASE_FAILED)


def _first_unit(group: BookingGroup) -> FulfilmentUnit | None:
    return group.units.select_related("service_area").order_by("position").first()


def describe(group: BookingGroup) -> BookingProgress:  # noqa: PLR0911 - one return per phase
    unit = _first_unit(group)
    when = (
        format_window(
            unit.requested_start,
            unit.requested_start + timedelta(minutes=unit.arrival_window_minutes),
            unit.service_area.timezone,
        )
        if unit is not None
        else "your chosen time"
    )
    href = f"/bookings/{group.id}"
    amount = format_inr(group.quote.total_paise)
    phase = phase_of(group.status)
    view = {"type": "VIEW_BOOKING", "label": "View booking", "href": href}
    if phase == PHASE_FINDING:
        return BookingProgress(
            phase,
            f"Booking requested for {when}. We're assigning a professional now — this usually "
            "takes a few minutes. You'll see a Pay button here as soon as one accepts.",
            [view],
        )
    if phase == PHASE_PAYMENT:
        deadline = BookingGroupSerializer.get_next_transition_at(group)
        held_until = ""
        if deadline and unit is not None:
            held_at = format_when(datetime.fromisoformat(deadline), unit.service_area.timezone)
            held_until = f" The slot is held until {held_at}."
        return BookingProgress(
            phase,
            f"A professional has accepted your visit for {when}. Pay {amount} to confirm it."
            f"{held_until}",
            [{"type": "PAY", "label": f"Pay {amount}", "amount": amount, "href": href}],
        )
    if phase == PHASE_CONFIRMED:
        return BookingProgress(
            phase,
            f"Payment received — your booking for {when} is confirmed. "
            "You'll get updates when your professional is on the way.",
            [view],
        )
    if phase == PHASE_REPLAN:
        return BookingProgress(
            phase,
            f"No professional could take {when}. Nothing has been charged. "
            "Would you like to pick another time?",
            [view],
        )
    if phase == PHASE_EXPIRED:
        return BookingProgress(
            phase,
            "This booking expired before payment completed. "
            "If any amount was debited, it is refunded automatically. Want to try another slot?",
            [view],
        )
    if phase == PHASE_CANCELLED:
        return BookingProgress(phase, "This booking was cancelled.", [view])
    if phase == PHASE_COMPLETED:
        return BookingProgress(
            phase, "This visit is complete. Thank you for booking with us.", [view]
        )
    return BookingProgress(
        PHASE_FAILED,
        "We couldn't complete this booking. Any payment taken is refunded automatically. "
        "You can try another time or contact us from the Contact page.",
        [view, {"type": "OPEN_LINK", "label": "Contact us", "href": "/contact"}],
    )
