"""When a Partner may act on a booked visit, and see where it is — by the server clock.

The physical-work state machine (`services.ALLOWED_TRANSITIONS`) says which step may follow which.
It says nothing about *when*: before this module a Partner could mark a visit a week away "on the
way" and then "arrived", which told the Customer something untrue, opened the start code, put the
Customer in the after-arrival cancellation band and switched off the lateness watchdog that would
otherwise have waived their fee. The gates are measured from `Booking.scheduled_start` — the
operational start a reschedule or a replacement rewrites — and every one is enforced in the
command, so a client that skips its own disabled button still gets a 409.

## The windows

* **Address and contact** unlock `M1_ADDRESS_UNLOCK_MINUTES` before the start and stay visible
  only while the visit is live for the assigned Partner (`discloses_site_details`).
* **On the way** opens `M1_EN_ROUTE_OPENS_MINUTES` before the start.
* **Arrived** opens `M1_ARRIVAL_OPENS_MINUTES` before the start.
* Both close together at the scheduled end plus `M1_ARRIVAL_CLOSE_GRACE_MINUTES`. The scheduled end
  is the later of the job's estimated duration and the arrival window promised to the Customer, so
  a Partner who arrives at the very end of a promised window can always still be let in.

## The one override

`services.operations_assisted_outage_start` records an en-route or arrived statement on the
Partner's behalf and deliberately does not go through `assert_gate_open`. It is the audited escape
hatch: it requires a named operator and a non-empty reason, and it writes whether the gate was
open at the time into the status-history context.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta

from django.conf import settings

from apps.carts.models import FulfilmentUnit
from apps.commerce.models import Booking
from apps.fulfilment.exceptions import (
    BookingActionNotYetAllowedApiError,
    BookingActionWindowClosedApiError,
)


class GatedAction:
    """The Partner commands with a clock, named as the `BookingCommand` they gate."""

    MARK_EN_ROUTE = "MARK_EN_ROUTE"
    MARK_ARRIVED = "MARK_ARRIVED"


#: Booking statuses in which the assigned Partner is actually on this job, so the door and the
#: Customer's number are theirs to hold once the unlock time passes. Everything else withdraws
#: them: before payment there is no Booking, `RECOVERY_REQUIRED` means this Partner let the job
#: go, and a submitted, settled or cancelled visit leaves nothing to travel to.
SITE_DISCLOSURE_STATUSES = frozenset(
    {
        Booking.Status.CONFIRMED,
        Booking.Status.EN_ROUTE,
        Booking.Status.ARRIVED,
        Booking.Status.IN_PROGRESS,
    }
)


@dataclass(frozen=True, slots=True)
class BookingGates:
    """One visit's windows, computed once against one server instant."""

    now: datetime
    address_unlocks_at: datetime
    en_route_opens_at: datetime
    arrival_opens_at: datetime
    arrival_closes_at: datetime

    @property
    def en_route_closes_at(self) -> datetime:
        return self.arrival_closes_at

    def window(self, action: str) -> tuple[datetime, datetime]:
        if action == GatedAction.MARK_EN_ROUTE:
            return self.en_route_opens_at, self.en_route_closes_at
        if action == GatedAction.MARK_ARRIVED:
            return self.arrival_opens_at, self.arrival_closes_at
        raise ValueError(f"{action} has no time gate.")

    def is_open(self, action: str) -> bool:
        opens_at, closes_at = self.window(action)
        return opens_at <= self.now <= closes_at

    @property
    def address_unlocked(self) -> bool:
        return self.now >= self.address_unlocks_at


def booking_gates(booking: Booking, unit: FulfilmentUnit | None, now: datetime) -> BookingGates:
    """The visit's gate instants, read from the Booking's own operational start.

    `unit` contributes only the arrival window promised to the Customer, which can outlast a short
    job; without it the scheduled end is the estimated duration alone.
    """

    start = booking.scheduled_start
    promised_minutes = unit.arrival_window_minutes if unit is not None else 0
    scheduled_end = start + timedelta(
        minutes=max(booking.estimated_duration_minutes, promised_minutes)
    )
    return BookingGates(
        now=now,
        address_unlocks_at=start - timedelta(minutes=settings.M1_ADDRESS_UNLOCK_MINUTES),
        en_route_opens_at=start - timedelta(minutes=settings.M1_EN_ROUTE_OPENS_MINUTES),
        arrival_opens_at=start - timedelta(minutes=settings.M1_ARRIVAL_OPENS_MINUTES),
        arrival_closes_at=scheduled_end
        + timedelta(minutes=settings.M1_ARRIVAL_CLOSE_GRACE_MINUTES),
    )


def assert_gate_open(*, gates: BookingGates, action: str) -> None:
    """Refuse `action` outside its window with a 409 that carries the whole window."""

    opens_at, closes_at = gates.window(action)
    if gates.now < opens_at:
        raise BookingActionNotYetAllowedApiError(
            action=action, opens_at=opens_at, closes_at=closes_at, server_now=gates.now
        )
    if gates.now > closes_at:
        raise BookingActionWindowClosedApiError(
            action=action, opens_at=opens_at, closes_at=closes_at, server_now=gates.now
        )


def discloses_site_details(booking: Booking, gates: BookingGates) -> bool:
    """Whether the assigned Partner may see the address, the pin and the Customer's contact now.

    The caller has already established *who* is asking — the Partner projection is only ever
    served to the Booking's own Partner. This answers *when*: from the unlock instant, and only
    while the visit is live.
    """

    return booking.status in SITE_DISCLOSURE_STATUSES and gates.address_unlocked


def arrival_was_time_checked(booking: Booking, gates: BookingGates) -> bool:
    """Whether the recorded arrival falls inside the arrival window for the visit as it stands.

    `mark_arrived` can no longer write one outside it, but an Operations-assisted arrival can, and
    a reschedule after arrival is refused rather than impossible to have happened historically. The
    after-arrival cancellation band asks this rather than trusting `arrived_at` alone.
    """

    if booking.arrived_at is None:
        return False
    return gates.arrival_opens_at <= booking.arrived_at <= gates.arrival_closes_at
