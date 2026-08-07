"""Partner capacity for a whole slot grid, loaded once.

The window grid asks about roughly a hundred candidate starts across seven days.
Answering each one with its own queries is what made the old grid ignore capacity
altogether, so this module loads everything the answer depends on up front and
then computes in memory.

`partners.selectors.partner_available_during` deliberately is *not* used here. It
issues two queries per call — an exception lookup keyed on `date=` and a rules
lookup keyed on `weekday=`, both of which change with every slot — so a grid built
on it costs hundreds of queries. What it and this module share is
`availability_window_contains`, the pure window rule, so the two can never
disagree about whether a Partner's published schedule covers an occupied range.

The three questions a slot's capacity depends on, and where each is answered:

* *Can this Partner do this work here?* — the eligibility filters, identical to
  `planning._eligible_partner_ids`, resolved once into `partner_ids`.
* *Does their published schedule cover it?* — prefetched rules and exceptions,
  evaluated through the shared window rule.
* *Is something already booked over it?* — prefetched reservations, compared as
  half-open intervals exactly like the database's exclusion constraint.
"""

from __future__ import annotations

import math
from collections import defaultdict
from collections.abc import Collection
from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal
from uuid import UUID
from zoneinfo import ZoneInfo

from django.conf import settings
from django.utils import timezone
from psycopg.types.range import Range

from apps.assignments.models import Reservation
from apps.locations.models import Address, ServiceArea
from apps.partners.models import (
    PartnerApplication,
    PartnerAvailabilityException,
    PartnerAvailabilityRule,
    PartnerLocation,
    PartnerProfile,
)
from apps.partners.selectors import availability_window_contains

#: Reservations occupy the visit plus a turnaround gap, so a Partner is never
#: offered two jobs with no travel time between them. One global constant rather
#: than a per-Partner setting: see the design's D7.
TURNAROUND_MINUTES_SETTING = "M1_TURNAROUND_MINUTES"

#: Conservative city-traffic average used for `earliest_reachable`. A fixed
#: constant, not a routing dependency — see the design's §7 and §15.3, which
#: treats per-area calibration as a follow-up once `PartnerLocation` history
#: accumulates.
_URBAN_AVERAGE_SPEED_KMPH = 24
_EARTH_RADIUS_KM = 6371


def _turnaround_minutes() -> int:
    return int(getattr(settings, TURNAROUND_MINUTES_SETTING, 0))


def arrival_window_for_duration(duration_minutes: int) -> int:
    """The arrival window a visit of this duration should be offered in.

    The single implementation of the tiering rule, for the same reason
    `schedule_covers` is the single implementation of the schedule rule: the grid
    (`carts.services.create_booking_windows`) and the value locked onto the
    booking (`carts.services.create_quote`, `carts.planning.create_plan_set`)
    must never disagree about how wide a window is. A Customer who picked a
    30-minute window must not end up with `arrival_window_minutes=60` on their
    Fulfilment Unit.

    Pure and query-free — it reads settings and nothing else, so it is safe to
    call inside the grid's slot loop.
    """

    if duration_minutes <= settings.M1_ARRIVAL_WINDOW_SHORT_THRESHOLD_MINUTES:
        return int(settings.M1_ARRIVAL_WINDOW_SHORT_MINUTES)
    if duration_minutes <= settings.M1_ARRIVAL_WINDOW_LONG_THRESHOLD_MINUTES:
        return int(settings.M1_ARRIVAL_WINDOW_STANDARD_MINUTES)
    return int(settings.M1_ARRIVAL_WINDOW_LONG_MINUTES)


@dataclass(frozen=True, slots=True)
class AvailabilitySnapshot:
    """Everything a slot grid needs, resolved for one area and one skill set.

    Held as plain dicts keyed by Partner id rather than querysets: every accessor
    below runs once per slot, and a queryset would re-hit the database each time.
    """

    area: ServiceArea
    partner_ids: tuple[UUID, ...]
    destination: tuple[Decimal, Decimal] | None
    _partners: dict[UUID, PartnerProfile]
    _rules: dict[UUID, tuple[PartnerAvailabilityRule, ...]]
    _exceptions: dict[UUID, tuple[PartnerAvailabilityException, ...]]
    _reserved: dict[UUID, tuple[tuple[datetime, datetime], ...]]

    def free_partner_ids(self, *, starts_at: datetime, duration_minutes: int) -> tuple[UUID, ...]:
        """Partners who could take a visit of `duration_minutes` starting at `starts_at`."""

        return tuple(
            partner_id
            for partner_id in self.partner_ids
            if self._schedule_allows(
                partner_id, starts_at=starts_at, duration_minutes=duration_minutes
            )
            and not self._is_reserved(
                partner_id, starts_at=starts_at, duration_minutes=duration_minutes
            )
        )

    def capacity(self, *, starts_at: datetime, duration_minutes: int) -> int:
        return len(self.free_partner_ids(starts_at=starts_at, duration_minutes=duration_minutes))

    def location_fix(self, partner_id: UUID) -> PartnerLocation | None:
        """The Partner's latest known position, or None when there isn't a usable one.

        Free of charge — `latest_location` is a one-to-one primary-key relation
        pulled in by `select_related` when the snapshot loaded. A fix past
        `PARTNER_LOCATION_STALE_SECONDS` is worthless for reachability — the
        Partner has typically gone offline since it was captured, and `go_offline`
        leaves the row in place rather than deleting it.
        """

        partner = self._partners.get(partner_id)
        if partner is None:
            return None
        location: PartnerLocation | None = getattr(partner, "latest_location", None)
        if location is None:
            return None
        age = timezone.now() - location.captured_at
        if age < timedelta(0) or age > timedelta(seconds=settings.PARTNER_LOCATION_STALE_SECONDS):
            return None
        return location

    def _is_reserved(self, partner_id: UUID, *, starts_at: datetime, duration_minutes: int) -> bool:
        occupied_end = starts_at + timedelta(minutes=duration_minutes + _turnaround_minutes())
        return any(
            # Half-open on both sides, matching the `[)` bounds the exclusion
            # constraint uses: a visit ending exactly when another starts is not
            # an overlap.
            reserved_start < occupied_end and starts_at < reserved_end
            for reserved_start, reserved_end in self._reserved.get(partner_id, ())
        )

    def _schedule_allows(
        self, partner_id: UUID, *, starts_at: datetime, duration_minutes: int
    ) -> bool:
        return schedule_covers(
            area=self.area,
            rules=self._rules.get(partner_id, ()),
            exceptions=self._exceptions.get(partner_id, ()),
            starts_at=starts_at,
            duration_minutes=duration_minutes,
        )


def schedule_covers(
    *,
    area: ServiceArea,
    rules: Collection[PartnerAvailabilityRule],
    exceptions: Collection[PartnerAvailabilityException],
    starts_at: datetime,
    duration_minutes: int,
) -> bool:
    """Whether an already-loaded schedule covers one occupied range.

    The single in-memory implementation of the published-schedule rule. Both the
    slot grid and dispatch ranking go through here, so neither can drift from the
    other about what a Partner's calendar says.
    """

    zone = ZoneInfo(area.timezone)
    local_start = starts_at.astimezone(zone)
    local_end = local_start + timedelta(minutes=duration_minutes)

    # A dated exception replaces the weekly rules for that day outright — it is
    # how a Partner takes leave, so falling back to the rules would book them
    # on a day they said they were away.
    exception = next(
        (candidate for candidate in exceptions if candidate.date == local_start.date()),
        None,
    )
    if exception is not None:
        if not exception.is_available or exception.starts_at is None or exception.ends_at is None:
            return False
        return availability_window_contains(
            local_start,
            local_end,
            starts_at=exception.starts_at,
            ends_at=exception.ends_at,
            ends_next_day=exception.ends_next_day,
        )

    return any(
        availability_window_contains(
            local_start,
            local_end,
            starts_at=rule.starts_at,
            ends_at=rule.ends_at,
            ends_next_day=rule.ends_next_day,
        )
        for rule in rules
        if rule.weekday == local_start.weekday()
    )


def schedule_available_partner_ids(
    *,
    partner_ids: Collection[UUID],
    area: ServiceArea,
    starts_at: datetime,
    duration_minutes: int,
) -> frozenset[UUID]:
    """Which of `partner_ids` have published schedules covering one occupied range.

    Two queries for the whole pool, where `partners.selectors.partner_available_during`
    costs two *per Partner*. Dispatch ranking scans an entire service area, so the
    per-Partner form turns one dispatch into hundreds of round trips.
    """

    if not partner_ids:
        return frozenset()
    rules = _rules_by_partner(partner_ids, area=area)
    exceptions = _exceptions_by_partner(partner_ids, area=area)
    return frozenset(
        partner_id
        for partner_id in partner_ids
        if schedule_covers(
            area=area,
            rules=rules.get(partner_id, ()),
            exceptions=exceptions.get(partner_id, ()),
            starts_at=starts_at,
            duration_minutes=duration_minutes,
        )
    )


def load_snapshot(
    *,
    variant_ids: Collection[UUID],
    area: ServiceArea,
    horizon_start: datetime,
    horizon_end: datetime,
    destination: Address | None = None,
) -> AvailabilitySnapshot:
    """Resolve capacity inputs for one area and skill set over a date range.

    Four queries regardless of how many slots are later probed: the Partner set,
    their rules, their exceptions, and their reservations. `destination` is the
    Customer's address — carried through for `earliest_reachable` (§7) rather
    than queried again; it costs nothing extra because the caller already holds
    the `Address` row.
    """

    partners = _eligible_partners(variant_ids=variant_ids, area=area)
    return AvailabilitySnapshot(
        area=area,
        partner_ids=tuple(partners),
        destination=(destination.latitude, destination.longitude)
        if destination is not None
        else None,
        _partners=partners,
        _rules=_rules_by_partner(partners, area=area),
        _exceptions=_exceptions_by_partner(partners, area=area),
        _reserved=_reserved_by_partner(
            partners, horizon_start=horizon_start, horizon_end=horizon_end
        ),
    )


def earliest_reachable(
    *, snapshot: AvailabilitySnapshot, partner_id: UUID, now: datetime
) -> datetime:
    """The soonest instant this Partner could plausibly start a visit from `now`.

    Replaces the flat `M1_TODAY_LEAD_TIME_MINUTES` (spec §7) with a per-Partner
    estimate: a fixed commit window (covering search + accept-and-prepare grace)
    plus travel time from their last fresh location fix. Falls back to a
    conservative per-area default when there is no usable fix or no destination
    to travel to — an empty or fully-offline area then behaves exactly as it
    does today.
    """

    commit = timedelta(minutes=settings.M1_COMMIT_WINDOW_MINUTES)
    fix = snapshot.location_fix(partner_id)
    if fix is None or snapshot.destination is None:
        return now + commit + timedelta(minutes=settings.M1_DEFAULT_TRAVEL_MINUTES)
    return now + commit + timedelta(minutes=_travel_minutes(fix, snapshot.destination))


def reachability_by_partner(
    *, snapshot: AvailabilitySnapshot, now: datetime
) -> dict[UUID, datetime]:
    """`earliest_reachable` for every Partner in the snapshot, resolved once.

    Reachability is a function of the Partner and `now` — never of the slot being
    considered. Calling `earliest_reachable` from inside a slot loop therefore
    repeats the same haversine for every candidate start: on a seven-day grid that
    is around a hundred identical computations per Partner, per request. Callers
    that scan a grid should build this map once and index it.
    """

    return {
        partner_id: earliest_reachable(snapshot=snapshot, partner_id=partner_id, now=now)
        for partner_id in snapshot.partner_ids
    }


def _travel_minutes(fix: PartnerLocation, destination: tuple[Decimal, Decimal]) -> int:
    """Straight-line distance at a fixed urban average speed — no routing dependency."""

    distance_km = _haversine_km(
        float(fix.latitude),
        float(fix.longitude),
        float(destination[0]),
        float(destination[1]),
    )
    return math.ceil(distance_km / _URBAN_AVERAGE_SPEED_KMPH * 60)


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return 2 * _EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def _eligible_partners(
    *, variant_ids: Collection[UUID], area: ServiceArea
) -> dict[UUID, PartnerProfile]:
    """Approved Partners serving this area who hold every skill the visit needs.

    The filters mirror `planning._eligible_partner_ids` exactly. Chaining one
    `filter` per variant is deliberate: a single `variant__in` would match a
    Partner holding *any* of the skills, and a visit needs all of them.
    """

    candidates = PartnerProfile.objects.filter(
        application__status=PartnerApplication.Status.APPROVED,
        service_area_links__service_area=area,
        service_area_links__is_active=True,
    )
    for variant_id in variant_ids:
        candidates = candidates.filter(
            service_links__variant_id=variant_id,
            service_links__is_active=True,
        )
    return {
        partner.id: partner
        for partner in candidates.select_related("latest_location").distinct().order_by("id")
    }


def _rules_by_partner(
    partner_ids: Collection[UUID], *, area: ServiceArea
) -> dict[UUID, tuple[PartnerAvailabilityRule, ...]]:
    grouped: dict[UUID, list[PartnerAvailabilityRule]] = defaultdict(list)
    rules = PartnerAvailabilityRule.objects.filter(
        partner_id__in=list(partner_ids),
        service_area=area,
        is_active=True,
    )
    for rule in rules:
        grouped[rule.partner_id].append(rule)
    return {partner_id: tuple(items) for partner_id, items in grouped.items()}


def _exceptions_by_partner(
    partner_ids: Collection[UUID], *, area: ServiceArea
) -> dict[UUID, tuple[PartnerAvailabilityException, ...]]:
    grouped: dict[UUID, list[PartnerAvailabilityException]] = defaultdict(list)
    exceptions = PartnerAvailabilityException.objects.filter(
        partner_id__in=list(partner_ids),
        service_area=area,
    )
    for exception in exceptions:
        grouped[exception.partner_id].append(exception)
    return {partner_id: tuple(items) for partner_id, items in grouped.items()}


def _reserved_by_partner(
    partners: Collection[UUID],
    *,
    horizon_start: datetime,
    horizon_end: datetime,
) -> dict[UUID, tuple[tuple[datetime, datetime], ...]]:
    """Active reservations per Partner, as plain interval tuples.

    Only `TENTATIVE` and `CONFIRMED` count, matching the statuses the database's
    exclusion constraint treats as live. A `RELEASED` row is history.
    """

    grouped: dict[UUID, list[tuple[datetime, datetime]]] = defaultdict(list)
    rows = Reservation.objects.filter(
        partner_id__in=list(partners),
        status__in=(Reservation.Status.TENTATIVE, Reservation.Status.CONFIRMED),
        occupied_range__overlap=Range(horizon_start, horizon_end, "[)"),
    ).values_list("partner_id", "occupied_range")
    for partner_id, occupied in rows:
        grouped[partner_id].append((occupied.lower, occupied.upper))
    return {partner_id: tuple(spans) for partner_id, spans in grouped.items()}
