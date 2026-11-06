"""`POST /partner/bookings/{id}/route/`: the road route for the Partner app's map (1.96.0).

Served under exactly the address gate — the line ends at the Customer's door — and only to the
Booking's own Partner. The pin is never published as separate coordinates.
"""

from collections.abc import Iterator
from decimal import Decimal
from http import HTTPStatus
from typing import Any
from unittest.mock import patch

import pytest
from pytest_django.fixtures import SettingsWrapper

from apps.locations.routing import RoutingError, VisitRoute
from tests.assignments.test_group_dispatch import _partner_client
from tests.fulfilment.conftest import create_booked_group

pytestmark = pytest.mark.django_db(transaction=True)

COMPUTE = "apps.fulfilment.views.partner.compute_route"
HERE = {"latitude": "17.400000", "longitude": "78.340000"}
ROUTE = VisitRoute(distance_meters=2800, duration_seconds=420, encoded_polyline="_p~iF~ps|U")


@pytest.fixture
def address_unlocked(settings: SettingsWrapper) -> Iterator[None]:
    # The visit is booked for tomorrow; a day-wide unlock puts it inside the window.
    settings.M1_ADDRESS_UNLOCK_MINUTES = 60 * 48
    yield


def _post(booked: Any, body: dict[str, str]) -> Any:
    return _partner_client(booked.partner).post(
        f"/api/v1/partner/bookings/{booked.booking.id}/route/", body, format="json"
    )


@pytest.mark.usefixtures("address_unlocked")
def test_the_partner_gets_the_route_once_the_address_is_theirs() -> None:
    booked = create_booked_group(key_prefix="route-open")
    with patch(COMPUTE, return_value=ROUTE) as compute:
        response = _post(booked, HERE)

    assert response.status_code == HTTPStatus.OK, response.json()
    body = response.json()
    assert body["encoded_polyline"] == ROUTE.encoded_polyline
    assert body["distance_meters"] == 2800
    assert body["duration_seconds"] == 420
    assert "destination" not in body, "The pin travels only as the end of the line."
    assert compute.call_args.kwargs["origin"] == (Decimal("17.400000"), Decimal("78.340000"))


def test_the_route_is_locked_with_the_address() -> None:
    booked = create_booked_group(key_prefix="route-locked")
    with patch(COMPUTE, return_value=ROUTE) as compute:
        response = _post(booked, HERE)

    assert response.status_code == HTTPStatus.CONFLICT
    assert response.json()["error"]["code"] == "site_details_locked"
    compute.assert_not_called()


@pytest.mark.usefixtures("address_unlocked")
def test_no_routing_provider_is_a_retryable_503() -> None:
    booked = create_booked_group(key_prefix="route-down")
    with patch(COMPUTE, side_effect=RoutingError("down")):
        response = _post(booked, HERE)

    assert response.status_code == HTTPStatus.SERVICE_UNAVAILABLE
    assert response.json()["error"]["code"] == "routing_unavailable"


@pytest.mark.usefixtures("address_unlocked")
def test_another_partner_cannot_route_to_someone_elses_customer() -> None:
    booked = create_booked_group(key_prefix="route-other")
    other = create_booked_group(key_prefix="route-other-partner")
    client = _partner_client(other.partner)
    with patch(COMPUTE, return_value=ROUTE):
        response = client.post(
            f"/api/v1/partner/bookings/{booked.booking.id}/route/", HERE, format="json"
        )

    assert response.status_code == HTTPStatus.FORBIDDEN


@pytest.mark.usefixtures("address_unlocked")
def test_an_impossible_position_is_refused() -> None:
    booked = create_booked_group(key_prefix="route-invalid")
    response = _post(booked, {"latitude": "123.000000", "longitude": "78.340000"})

    assert response.status_code == HTTPStatus.BAD_REQUEST
