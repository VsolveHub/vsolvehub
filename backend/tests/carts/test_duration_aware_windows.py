"""BE-1: the arrival window a visit is offered in follows its duration.

A flat 60-minute grid promised a 10-minute switch repair and a 3-hour job the same
vagueness. These tests pin the three tiers, and — more importantly — pin that the
width the grid *displayed* is the width that ends up on the booking, which is the
invariant the whole feature exists to hold.
"""

from http import HTTPStatus
from itertools import pairwise

import pytest
from django.core.management import call_command
from django.utils.dateparse import parse_datetime
from rest_framework.test import APIClient

from apps.carts.availability import arrival_window_for_duration
from apps.carts.models import Quote
from apps.catalog.models import ServiceVariant
from apps.identity.models import User
from apps.pricing.models import TaskRate
from tests.carts.test_checkout import _address_payload, seed_available_partner
from tests.carts.test_fulfilment_planning import (
    _add_item,
    _customer_context,
    _partner,
    _plan,
)

pytestmark = pytest.mark.django_db

SHORT_WINDOW_MINUTES = 30
STANDARD_WINDOW_MINUTES = 60
LONG_WINDOW_MINUTES = 120


def _set_duration(*, slug: str, minutes: int) -> None:
    """Force one service's quoted duration, without touching its price.

    The seeded catalog is deliberately all short jobs, so a duration-tier test has
    to state the duration it is testing rather than hunt for a seeded service that
    happens to land in the tier.
    """

    variant = ServiceVariant.objects.get(service__slug=slug)
    # duration = base + marginal * quantity, and these carts hold quantity 1.
    # `marginal_duration_minutes` carries a positive check constraint, so the
    # marginal minute is the one that cannot be folded into the base.
    TaskRate.objects.filter(variant=variant, is_active=True).update(
        base_duration_minutes=minutes - 1,
        marginal_duration_minutes=1,
    )


def _grid(*, slug: str, duration_minutes: int) -> tuple[APIClient, str, dict[str, object]]:
    call_command("seed_technician_catalog")
    seed_available_partner(slug=slug)
    _set_duration(slug=slug, minutes=duration_minutes)
    customer = User.objects.create_user(phone_number="+919876500001")
    client = APIClient()
    client.force_authenticate(customer)
    variant = ServiceVariant.objects.get(service__slug=slug)
    cart = client.put(
        "/api/v1/cart/",
        {"variant_id": str(variant.id), "quantity": 1, "scope": {"quantity": 1}},
        format="json",
    )
    assert cart.status_code == HTTPStatus.OK
    address = client.post("/api/v1/addresses/", _address_payload(), format="json")
    assert address.status_code == HTTPStatus.CREATED
    address_id = str(address.json()["id"])
    windows = client.post(
        "/api/v1/booking/windows/",
        {"address_id": address_id},
        format="json",
    )
    assert windows.status_code == HTTPStatus.OK, windows.json()
    return client, address_id, windows.json()


def _minutes_between(earlier: str, later: str) -> int:
    return int((parse_datetime(later) - parse_datetime(earlier)).total_seconds() // 60)


def _widths(grid: dict[str, object]) -> set[int]:
    return {
        _minutes_between(window["starts_at"], window["ends_at"])
        for day in grid["days"]
        for window in day["windows"]
    }


def _steps(grid: dict[str, object]) -> set[int]:
    """Gaps between consecutive starts, so a drifting step cannot hide behind a width."""

    gaps: set[int] = set()
    for day in grid["days"]:
        starts = [window["starts_at"] for window in day["windows"]]
        gaps.update(_minutes_between(earlier, later) for earlier, later in pairwise(starts))
    return gaps


def test_short_visit_is_offered_in_a_tighter_window() -> None:
    _client, _address_id, grid = _grid(slug="switch-socket-repair", duration_minutes=40)

    assert _widths(grid) == {SHORT_WINDOW_MINUTES}
    assert _steps(grid) == {SHORT_WINDOW_MINUTES}


def test_long_visit_is_offered_in_a_wider_window() -> None:
    _client, _address_id, grid = _grid(slug="switch-socket-repair", duration_minutes=180)

    assert _widths(grid) == {LONG_WINDOW_MINUTES}
    assert _steps(grid) == {LONG_WINDOW_MINUTES}


def test_standard_tier_grid_is_unchanged() -> None:
    """Regression: the ordinary catalog must still see today's 60-minute grid."""

    _client, _address_id, grid = _grid(slug="switch-socket-repair", duration_minutes=70)

    assert _widths(grid) == {STANDARD_WINDOW_MINUTES}
    assert _steps(grid) == {STANDARD_WINDOW_MINUTES}


def test_booked_window_matches_the_width_the_grid_displayed() -> None:
    client, address_id, grid = _grid(slug="switch-socket-repair", duration_minutes=40)
    chosen = next(
        window for day in grid["days"] for window in day["windows"] if window["is_available"]
    )
    displayed = int(
        (parse_datetime(chosen["ends_at"]) - parse_datetime(chosen["starts_at"])).total_seconds()
        // 60
    )

    response = client.post(
        "/api/v1/quotes/",
        {"address_id": address_id, "window_id": chosen["id"]},
        format="json",
    )

    assert response.status_code == HTTPStatus.CREATED, response.json()
    quote = Quote.objects.get(id=response.json()["id"])
    assert displayed == SHORT_WINDOW_MINUTES
    assert quote.arrival_window_minutes == displayed


def test_window_is_refused_when_the_duration_tier_moved_underneath_it() -> None:
    """A scheduling group's key is its cart item ids, so editing scope keeps the key.

    Without the width in the signed token, a window drawn on the 30-minute grid
    would be silently booked as a 60-minute one after the visit got longer.
    """

    client, address_id, grid = _grid(slug="switch-socket-repair", duration_minutes=40)
    chosen = next(
        window for day in grid["days"] for window in day["windows"] if window["is_available"]
    )
    _set_duration(slug="switch-socket-repair", minutes=70)

    response = client.post(
        "/api/v1/quotes/",
        {"address_id": address_id, "window_id": chosen["id"]},
        format="json",
    )

    assert response.status_code == HTTPStatus.CONFLICT, response.json()
    assert not Quote.objects.exists()


@pytest.mark.parametrize(
    ("duration_minutes", "expected"),
    [
        (1, SHORT_WINDOW_MINUTES),
        (45, SHORT_WINDOW_MINUTES),
        (46, STANDARD_WINDOW_MINUTES),
        (120, STANDARD_WINDOW_MINUTES),
        (121, LONG_WINDOW_MINUTES),
        (600, LONG_WINDOW_MINUTES),
    ],
)
def test_tier_boundaries_are_inclusive_at_the_top(duration_minutes: int, expected: int) -> None:
    assert arrival_window_for_duration(duration_minutes) == expected


def test_every_plan_unit_takes_its_width_from_its_own_duration() -> None:
    """The multi-visit path derives per unit, never once for the plan.

    Asserted as the invariant rather than as "unit A gets 30 and unit B gets 120",
    because whether these two services become one sequential visit or two is the
    planner's decision (`M1_SEQUENTIAL_UNIT_MAX_MINUTES`, compatibility rules) and
    is not what this test is about. Whichever units come back, each one's window
    must follow that unit's own duration — the summed-duration bug would show up
    here whichever grouping the planner chose.
    """

    # After `_customer_context`, which re-seeds the catalog and would reset rates.
    client, _customer, address_id, version = _customer_context()
    _set_duration(slug="switch-socket-repair", minutes=40)
    _set_duration(slug="fan-installation", minutes=180)
    first = _add_item(client, slug="switch-socket-repair", cart_version=version)
    second = _add_item(client, slug="fan-installation", cart_version=int(first["version"]))
    _partner(suffix="77", variant_slugs=("switch-socket-repair", "fan-installation"))
    plans = _plan(client, address_id=address_id, cart_version=int(second["version"]))["plans"]

    units = [unit for plan in plans for unit in plan["units"]]

    assert units
    for unit in units:
        assert unit["arrival_window_minutes"] == arrival_window_for_duration(
            unit["estimated_duration_minutes"]
        ), unit
    # And the tiering genuinely bit: nothing here is the old flat 60.
    assert {unit["arrival_window_minutes"] for unit in units} != {STANDARD_WINDOW_MINUTES}
