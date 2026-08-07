"""The bulk availability snapshot the slot grid is built from.

The load-bearing property here is the query count. The grid asks about roughly a
hundred candidate starts across seven days, and the whole design depends on that
costing the same as asking about one. `partner_available_during` cannot be used
for this — it issues two queries per call, keyed on a date and a weekday that
change with every slot — so the snapshot prefetches once and evaluates the same
window rule in memory.
"""

import uuid
from datetime import time, timedelta
from http import HTTPStatus
from zoneinfo import ZoneInfo

import pytest
from django.core.management import call_command
from django.utils import timezone
from psycopg.types.range import Range

from apps.assignments.models import Reservation
from apps.carts.availability import load_snapshot
from apps.carts.models import CheckoutSession
from apps.catalog.models import ServiceVariant
from apps.identity.models import User
from apps.locations.models import ServiceArea
from apps.partners.models import (
    PartnerApplication,
    PartnerAvailabilityException,
    PartnerAvailabilityRule,
    PartnerProfile,
    PartnerService,
    PartnerServiceArea,
)
from tests.carts.test_checkout import _customer_quote

pytestmark = pytest.mark.django_db

#: candidates (+select_related latest_location) | availability_rules
#: | availability_exceptions | reservations
SNAPSHOT_QUERY_COUNT = 4

SLOT_PROBES = 100
TWO_FREE_PARTNERS = 2


def _area() -> ServiceArea:
    return ServiceArea.objects.get(slug="hyderabad-500032")


def _partner(*, suffix: str, variant_slugs: tuple[str, ...]) -> PartnerProfile:
    """An approved Partner working every weekday, 08:00-20:00, in the seeded area."""

    area = _area()
    user = User.objects.create_user(phone_number=f"+91987654{int(suffix):04d}")
    partner = PartnerProfile.objects.create(user=user, display_name=f"Partner {suffix}")
    PartnerApplication.objects.create(partner=partner, status=PartnerApplication.Status.APPROVED)
    for variant in ServiceVariant.objects.filter(service__slug__in=variant_slugs):
        PartnerService.objects.create(partner=partner, variant=variant)
    PartnerServiceArea.objects.create(partner=partner, service_area=area)
    for weekday in range(7):
        PartnerAvailabilityRule.objects.create(
            partner=partner,
            service_area=area,
            weekday=weekday,
            starts_at=time(8),
            ends_at=time(20),
        )
    return partner


def _variant_id(slug: str) -> uuid.UUID:
    return ServiceVariant.objects.get(service__slug=slug).id


def _next_local_time(*, hour: int, days_ahead: int = 1):
    """An aware instant at `hour` local time, `days_ahead` days from now."""

    zone = ZoneInfo(_area().timezone)
    local = timezone.now().astimezone(zone) + timedelta(days=days_ahead)
    return local.replace(hour=hour, minute=0, second=0, microsecond=0)


def _reservation_scope() -> CheckoutSession:
    """A real `CheckoutSession`, purely to satisfy `Reservation`'s exactly-one-scope
    constraint. What the snapshot reads is the reservation's own `occupied_range`,
    set explicitly by the caller below — this session's own quote and timing are
    irrelevant to the assertions.
    """

    customer = User.objects.create_user(phone_number="+919876545555")
    client, quote_id = _customer_quote(customer=customer)
    response = client.post(
        "/api/v1/checkouts/",
        {"quote_id": quote_id},
        format="json",
        HTTP_IDEMPOTENCY_KEY=f"availability-snapshot-{quote_id}",
    )
    assert response.status_code == HTTPStatus.CREATED, response.json()
    return CheckoutSession.objects.get(id=response.json()["id"])


def _reserve(partner: PartnerProfile, *, starts_at, duration_minutes: int) -> Reservation:
    return Reservation.objects.create(
        checkout=_reservation_scope(),
        partner=partner,
        occupied_range=Range(starts_at, starts_at + timedelta(minutes=duration_minutes), "[)"),
        status=Reservation.Status.CONFIRMED,
        expires_at=starts_at + timedelta(minutes=duration_minutes),
    )


def _snapshot(*, slug: str = "switch-socket-repair", horizon_start=None):
    start = horizon_start or timezone.now()
    return load_snapshot(
        variant_ids=[_variant_id(slug)],
        area=_area(),
        horizon_start=start,
        horizon_end=start + timedelta(days=7),
    )


def test_only_skill_matched_partners_enter_the_pool() -> None:
    call_command("seed_technician_catalog")
    electrician = _partner(suffix="1", variant_slugs=("switch-socket-repair",))
    plumber = _partner(suffix="2", variant_slugs=("tap-repair",))

    snapshot = _snapshot()

    assert electrician.id in snapshot.partner_ids
    assert plumber.id not in snapshot.partner_ids


def test_a_reserved_partner_is_not_free_for_the_overlapping_slot() -> None:
    call_command("seed_technician_catalog")
    electrician = _partner(suffix="1", variant_slugs=("switch-socket-repair",))
    taken = _next_local_time(hour=9)
    _reserve(electrician, starts_at=taken, duration_minutes=40)

    snapshot = _snapshot()

    assert snapshot.capacity(starts_at=taken, duration_minutes=40) == 0
    assert snapshot.capacity(starts_at=taken + timedelta(hours=3), duration_minutes=40) == 1


def test_capacity_counts_every_free_partner() -> None:
    call_command("seed_technician_catalog")
    _partner(suffix="1", variant_slugs=("switch-socket-repair",))
    _partner(suffix="2", variant_slugs=("switch-socket-repair",))

    snapshot = _snapshot()

    assert (
        snapshot.capacity(starts_at=_next_local_time(hour=10), duration_minutes=40)
        == TWO_FREE_PARTNERS
    )


def test_a_slot_outside_the_partners_working_hours_has_no_capacity() -> None:
    call_command("seed_technician_catalog")
    _partner(suffix="1", variant_slugs=("switch-socket-repair",))

    snapshot = _snapshot()

    # The Partner works 08:00-20:00, so a 19:40 start does not fit a 40-minute visit.
    assert snapshot.capacity(starts_at=_next_local_time(hour=10), duration_minutes=40) == 1
    assert snapshot.capacity(starts_at=_next_local_time(hour=21), duration_minutes=40) == 0


def test_a_dated_exception_beats_the_weekly_rule() -> None:
    call_command("seed_technician_catalog")
    electrician = _partner(suffix="1", variant_slugs=("switch-socket-repair",))
    away = _next_local_time(hour=10)
    PartnerAvailabilityException.objects.create(
        partner=electrician,
        service_area=_area(),
        date=away.date(),
        is_available=False,
    )

    snapshot = _snapshot()

    assert snapshot.capacity(starts_at=away, duration_minutes=40) == 0
    assert snapshot.capacity(starts_at=away + timedelta(days=1), duration_minutes=40) == 1


def test_query_count_does_not_grow_with_the_number_of_slots(django_assert_num_queries) -> None:
    """The guarantee the whole grid design rests on.

    If this reports more than SNAPSHOT_QUERY_COUNT, a lazy relation is leaking —
    fix the prefetch rather than raising the number. The usual cause is a
    surviving `partner_available_during()` call.
    """

    call_command("seed_technician_catalog")
    _partner(suffix="1", variant_slugs=("switch-socket-repair",))
    _partner(suffix="2", variant_slugs=("switch-socket-repair",))
    start = _next_local_time(hour=8)
    # Resolved before the assertion block: these are test-fixture lookups, not part
    # of what `load_snapshot` itself queries.
    area = _area()
    variant_id = _variant_id("switch-socket-repair")

    with django_assert_num_queries(SNAPSHOT_QUERY_COUNT):
        snapshot = load_snapshot(
            variant_ids=[variant_id],
            area=area,
            horizon_start=start,
            horizon_end=start + timedelta(days=7),
        )
        for hour in range(SLOT_PROBES):
            snapshot.capacity(starts_at=start + timedelta(hours=hour), duration_minutes=40)
