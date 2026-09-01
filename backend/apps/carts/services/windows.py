"""The arrival-window token and the availability grid the Customer picks a slot from.

The boundary is "everything that happens before a quote exists": the signed window id
and the grid it is issued from, plus the scheduling-group resolution that decides which
visit a grid is even for. Nothing here writes to the database.

`build_arrival_window_grid` is deliberately shared beyond this package — the reschedule
flow in `apps.fulfilment.cancellation` and the A5 visit grid in
`apps.requirements.visit_slots` both call it — so its parameters are the only two things
those callers differ on, and the loop itself has exactly one home.
"""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

from django.conf import settings
from django.core import signing
from django.utils import timezone

from apps.carts.availability import (
    AvailabilitySnapshot,
    arrival_window_for_duration,
    load_snapshot,
    reachability_by_partner,
)
from apps.carts.exceptions import (
    BookingWindowGroupRequiredApiError,
    SchedulingGroupsChangedApiError,
    WindowNoLongerAvailableApiError,
)
from apps.carts.models import Cart, CartItem
from apps.carts.planning import (
    SchedulingGroup,
    resolve_cart_service_area,
    scheduling_groups,
)
from apps.identity.models import User
from apps.locations.models import Address, ServiceArea
from apps.locations.services import operating_ranges_for_date

WINDOW_SIGNING_SALT = "carts.booking-window.v1"
#: Bumped when the signed window payload's `scope_key` moved from meaning
#: "a single cart item" to "a scheduling group" (spec §9) — a mismatched
#: version refuses cleanly instead of misreading an old field.
#: Bumped to 3 when the signed payload gained `window_minutes` (duration-aware
#: arrival windows). Window ids issued before a deploy are refused rather than
#: read with a missing field — they are 15-minute tokens, so the blast radius is
#: one grid refresh, and guessing a width for them is exactly the silent
#: substitution the field exists to prevent.
WINDOW_SIGNING_VERSION = 3


@dataclass(frozen=True, slots=True)
class BookingWindow:
    id: str
    starts_at: datetime
    ends_at: datetime
    is_available: bool
    unavailable_reason: str | None
    capacity: int


@dataclass(frozen=True, slots=True)
class BookingWindowDay:
    date: date
    is_today: bool
    windows: tuple[BookingWindow, ...]


@dataclass(frozen=True, slots=True)
class BookingWindows:
    server_now: datetime
    estimated_duration_minutes: int
    availability_is_preliminary: bool
    timezone: str
    days: tuple[BookingWindowDay, ...]


def _signed_window_id(
    *,
    scope_key: str,
    address: Address,
    starts_at: datetime,
    window_minutes: int,
) -> str:
    """Sign a window's identity against the scope it was generated for.

    `scope_key` is a single cart item's id for the legacy single-item quote flow,
    or a scheduling group's key for the group-aware grid (spec §9) — either way it
    is what `_window_start_from_id` checks the caller's own scope against, so a
    window generated for one visit cannot be redeemed against another.

    `window_minutes` is signed alongside the start because the width is now
    derived from the visit's duration (`arrival_window_for_duration`) rather than
    being one global constant. A scheduling group's key is a function of its cart
    item ids alone, so editing an item's scope keeps the key and its already-issued
    window ids valid while changing the duration underneath them. Carrying the
    promised width in the token lets `create_quote` refuse a window the grid would
    no longer draw, instead of silently booking a wider one than was shown.
    """

    return signing.dumps(
        {
            "v": WINDOW_SIGNING_VERSION,
            "scope_key": scope_key,
            "address_id": str(address.id),
            "starts_at": starts_at.isoformat(),
            "window_minutes": int(window_minutes),
        },
        salt=WINDOW_SIGNING_SALT,
        compress=True,
    )


def _window_start_from_id(
    *,
    window_id: str,
    scope_key: str,
    address: Address,
) -> tuple[datetime, int]:
    """The start and the promised arrival-window width this id was signed for."""

    try:
        payload = signing.loads(
            window_id,
            salt=WINDOW_SIGNING_SALT,
            max_age=settings.M1_WINDOW_TOKEN_TTL_SECONDS,
        )
        if not isinstance(payload, dict):
            raise ValueError
        if payload.get("v") != WINDOW_SIGNING_VERSION:
            raise ValueError
        if payload.get("scope_key") != scope_key:
            raise ValueError
        if payload.get("address_id") != str(address.id):
            raise ValueError
        starts_at_value = payload.get("starts_at")
        if not isinstance(starts_at_value, str):
            raise ValueError
        window_minutes = payload.get("window_minutes")
        if not isinstance(window_minutes, int) or isinstance(window_minutes, bool):
            raise ValueError
        starts_at = datetime.fromisoformat(starts_at_value)
        if timezone.is_naive(starts_at):
            raise ValueError
        return starts_at, window_minutes
    except (signing.BadSignature, signing.SignatureExpired, TypeError, ValueError) as exc:
        raise WindowNoLongerAvailableApiError from exc


def _resolve_scheduling_group(
    *,
    cart: Cart,
    area: ServiceArea,
    group_key: str | None,
    at: datetime,
) -> SchedulingGroup:
    """The one visit this grid is for.

    A cart with several visits (spec §9) cannot answer "what's the duration and
    skill set for this grid" without knowing which one — reusing the first
    visit's numbers for every visit is the exact bug this replaces. `group_key`
    absent is only unambiguous when there is exactly one visit to mean.
    """

    groups = scheduling_groups(cart=cart, area=area, at=at)
    if group_key is None:
        if len(groups) == 1:
            return groups[0]
        raise BookingWindowGroupRequiredApiError(group_keys=[group.key for group in groups])
    for group in groups:
        if group.key == group_key:
            return group
    raise SchedulingGroupsChangedApiError


def create_booking_windows(
    *,
    customer: User,
    cart: Cart,
    address: Address,
    group_key: str | None = None,
) -> BookingWindows:
    now = timezone.now()
    if address.customer_id != customer.id or address.archived_at is not None:
        raise PermissionError("Use one of the Customer's active addresses.")
    area = resolve_cart_service_area(cart=cart, address=address)
    group = _resolve_scheduling_group(cart=cart, area=area, group_key=group_key, at=now)
    # `_resolve_scheduling_group` already ran every item through `current_item_inputs`
    # to build the group — that is where `estimated_duration_minutes` comes from, and
    # it is also where a missing configuration or rate raises. Recomputing it here
    # would re-validate the same items at two queries apiece for no new answer.
    duration = group.estimated_duration_minutes
    variant_ids: set[UUID] = set(
        CartItem.objects.filter(cart=cart, id__in=group.cart_item_ids).values_list(
            "variant_id", flat=True
        )
    )
    if not variant_ids:
        raise ValueError("Add a service to your booking before choosing an arrival window.")
    area = ServiceArea.objects.prefetch_related(
        "operating_windows",
        "operating_exceptions",
    ).get(id=area.id)
    horizon_end = now + timedelta(days=settings.M1_SCHEDULED_MAX_DAYS + 1)
    snapshot = load_snapshot(
        variant_ids=variant_ids,
        area=area,
        horizon_start=now,
        horizon_end=horizon_end,
        destination=address,
    )
    return build_arrival_window_grid(
        area=area,
        snapshot=snapshot,
        duration=duration,
        now=now,
        window_id=lambda starts_at, window_minutes: _signed_window_id(
            scope_key=group.key,
            address=address,
            starts_at=starts_at,
            window_minutes=window_minutes,
        ),
    )


def build_arrival_window_grid(
    *,
    area: ServiceArea,
    snapshot: AvailabilitySnapshot,
    duration: int,
    now: datetime,
    window_id: Callable[[datetime, int], str],
    not_before: datetime | None = None,
    last_day: date | None = None,
) -> BookingWindows:
    """The arrival-window grid, built once and shared by everything that offers slots.

    Two callers, one grid: choosing a window before booking, and choosing a new one when
    rescheduling a visit that is already booked. They differ in exactly two things — what they
    can sign a window id with, and how much notice they demand — so those are parameters and
    everything else is identical by construction. The alternative is two loops that agree until
    the day one of them is edited, which is the bug this codebase already shipped once when two
    paths computed schedule coverage differently.

    `not_before` marks slots inside a minimum-notice window `TOO_SOON` rather than hiding them.
    A customer looking for tomorrow morning should see that this evening exists and is too
    close, not find an unexplained hole in the grid.

    `last_day` ends the grid early, in the area's own calendar. A site visit for an event on the
    5th offered on the 6th is a slot for a job that can no longer be done, and unlike `TOO_SOON`
    there is nothing to explain — days past the deadline simply do not exist for this booking.
    `None` keeps the full `M1_SCHEDULED_MAX_DAYS` horizon, which is what the A1 checkout wants.

    The loop itself touches no database: `free_partner_ids` reads the snapshot in memory, and
    the operating windows were prefetched onto `area` by the caller. Query count is whatever
    `load_snapshot` cost — four — and does not grow with the number of slots probed.
    """

    zone = ZoneInfo(area.timezone)
    today = now.astimezone(zone).date()
    # Reachability depends on the Partner and `now`, not on the slot — resolved once
    # here rather than recomputing the same haversine inside the innermost loop.
    reachable_at = reachability_by_partner(snapshot=snapshot, now=now)
    # One derived width for the whole grid: the loop step, each window's `ends_at`
    # and the signed id all read this, so the step and the window can never drift
    # apart and leave gaps or overlaps between adjacent slots.
    window_minutes = arrival_window_for_duration(duration)
    days: list[BookingWindowDay] = []
    for day_offset in range(settings.M1_SCHEDULED_MAX_DAYS + 1):
        local_date = today + timedelta(days=day_offset)
        if last_day is not None and local_date > last_day:
            break
        windows: list[BookingWindow] = []
        for opens_at, closes_at in operating_ranges_for_date(
            area=area,
            local_date=local_date,
        ):
            starts_at = opens_at
            while starts_at + timedelta(minutes=window_minutes) <= closes_at:
                free = snapshot.free_partner_ids(starts_at=starts_at, duration_minutes=duration)
                unavailable_reason: str | None
                # Precedence fixed by spec §5: the first matching reason wins.
                if starts_at <= now:
                    unavailable_reason = "PAST"
                elif not_before is not None and starts_at < not_before:
                    unavailable_reason = "TOO_SOON"
                elif not free:
                    unavailable_reason = "NO_CAPACITY"
                elif not any(reachable_at[partner_id] <= starts_at for partner_id in free):
                    unavailable_reason = "TOO_SOON"
                elif starts_at + timedelta(minutes=duration) > closes_at:
                    unavailable_reason = "OUTSIDE_OPERATING_WINDOW"
                else:
                    unavailable_reason = None
                windows.append(
                    BookingWindow(
                        id=window_id(starts_at, window_minutes),
                        starts_at=starts_at,
                        ends_at=starts_at + timedelta(minutes=window_minutes),
                        is_available=unavailable_reason is None,
                        unavailable_reason=unavailable_reason,
                        capacity=len(free) if unavailable_reason is None else 0,
                    ),
                )
                starts_at += timedelta(minutes=window_minutes)
        days.append(
            BookingWindowDay(
                date=local_date,
                is_today=local_date == today,
                windows=tuple(windows),
            ),
        )
    return BookingWindows(
        server_now=now,
        estimated_duration_minutes=duration,
        availability_is_preliminary=True,
        timezone=area.timezone,
        days=tuple(days),
    )
