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

from collections import defaultdict
from collections.abc import Collection, Iterable
from dataclasses import dataclass
from datetime import datetime, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

from django.conf import settings
from psycopg.types.range import Range

from apps.assignments.models import Reservation
from apps.locations.models import ServiceArea
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


def _turnaround_minutes() -> int:
    return int(getattr(settings, TURNAROUND_MINUTES_SETTING, 0))


@dataclass(frozen=True, slots=True)
class AvailabilitySnapshot:
    """Everything a slot grid needs, resolved for one area and one skill set.

    Held as plain dicts keyed by Partner id rather than querysets: every accessor
    below runs once per slot, and a queryset would re-hit the database each time.
    """

    area: ServiceArea
    partner_ids: tuple[UUID, ...]
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
        """The Partner's latest known position, or None when they have never reported one.

        Free of charge — `latest_location` is a one-to-one primary-key relation
        pulled in by `select_related` when the snapshot loaded.
        """

        partner = self._partners.get(partner_id)
        if partner is None:
            return None
        return getattr(partner, "latest_location", None)

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
        zone = ZoneInfo(self.area.timezone)
        local_start = starts_at.astimezone(zone)
        local_end = local_start + timedelta(minutes=duration_minutes)

        # A dated exception replaces the weekly rules for that day outright — it is
        # how a Partner takes leave, so falling back to the rules would book them
        # on a day they said they were away.
        exception = next(
            (
                candidate
                for candidate in self._exceptions.get(partner_id, ())
                if candidate.date == local_start.date()
            ),
            None,
        )
        if exception is not None:
            if (
                not exception.is_available
                or exception.starts_at is None
                or exception.ends_at is None
            ):
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
            for rule in self._rules.get(partner_id, ())
            if rule.weekday == local_start.weekday()
        )


def load_snapshot(
    *,
    variant_ids: Collection[UUID],
    area: ServiceArea,
    horizon_start: datetime,
    horizon_end: datetime,
) -> AvailabilitySnapshot:
    """Resolve capacity inputs for one area and skill set over a date range.

    Four queries regardless of how many slots are later probed: the Partner set,
    their rules, their exceptions, and their reservations.
    """

    partners = _eligible_partners(variant_ids=variant_ids, area=area)
    return AvailabilitySnapshot(
        area=area,
        partner_ids=tuple(partners),
        _partners=partners,
        _rules=_rules_by_partner(partners.values(), area=area),
        _exceptions=_exceptions_by_partner(partners.values(), area=area),
        _reserved=_reserved_by_partner(
            partners, horizon_start=horizon_start, horizon_end=horizon_end
        ),
    )


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
    partners: Iterable[PartnerProfile], *, area: ServiceArea
) -> dict[UUID, tuple[PartnerAvailabilityRule, ...]]:
    grouped: dict[UUID, list[PartnerAvailabilityRule]] = defaultdict(list)
    rules = PartnerAvailabilityRule.objects.filter(
        partner__in=list(partners),
        service_area=area,
        is_active=True,
    )
    for rule in rules:
        grouped[rule.partner_id].append(rule)
    return {partner_id: tuple(items) for partner_id, items in grouped.items()}


def _exceptions_by_partner(
    partners: Iterable[PartnerProfile], *, area: ServiceArea
) -> dict[UUID, tuple[PartnerAvailabilityException, ...]]:
    grouped: dict[UUID, list[PartnerAvailabilityException]] = defaultdict(list)
    exceptions = PartnerAvailabilityException.objects.filter(
        partner__in=list(partners),
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
