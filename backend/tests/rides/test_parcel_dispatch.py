"""Pick up & Drop dispatch and the "Take parcel orders" switch (D17, brief §4.2)."""

from typing import Any

import pytest
from rest_framework.test import APIClient

from apps.identity.models import User
from apps.locations.models import ServiceArea
from apps.partners.models import PartnerProfile
from apps.rides.models import CaptainVehicle
from tests.rides.helpers import customer_client, make_user, partner_client, ready_captain
from tests.rides.parcel_world import new_parcel, parcel_body
from tests.rides.ride_world import captain, dispatch, error_code, make_area, new_ride, offered

pytestmark = pytest.mark.django_db

PREFERENCE = "/api/v1/partner/rides/parcel-preference/"
ME = "/api/v1/partner/rides/me/"
CURRENT = "/api/v1/partner/rides/offers/current/"


@pytest.fixture
def area() -> ServiceArea:
    return make_area()


@pytest.fixture
def rider() -> User:
    return make_user("Priya Rider")


def client_of(partner: PartnerProfile) -> APIClient:
    return partner_client(partner.user)


def stop_taking_parcels(partner: PartnerProfile) -> None:
    CaptainVehicle.objects.filter(partner=partner).update(takes_parcels=False)


# --- who is offered a parcel ------------------------------------------------------------------


@pytest.mark.usefixtures("ride_redis")
class TestDispatch:
    def test_a_bike_parcel_goes_to_a_bike_captain_who_takes_parcels(
        self, rider: User, area: ServiceArea
    ) -> None:
        ravi = captain(area, km=1)

        parcel = dispatch(new_parcel(rider, area))

        assert offered(parcel) == [ravi.id]

    def test_a_captain_with_the_switch_off_gets_no_parcel(
        self, rider: User, area: ServiceArea
    ) -> None:
        ravi = captain(area, km=1)
        stop_taking_parcels(ravi)

        parcel = dispatch(new_parcel(rider, area))

        assert offered(parcel) == []

    def test_the_switch_off_only_skips_that_captain(self, rider: User, area: ServiceArea) -> None:
        off = captain(area, km=1)  # nearest, but not taking parcels
        on = captain(area, km=2)
        stop_taking_parcels(off)

        parcel = dispatch(new_parcel(rider, area))

        assert offered(parcel) == [on.id]

    def test_a_captain_with_the_switch_off_still_gets_rides(
        self, rider: User, area: ServiceArea
    ) -> None:
        ravi = captain(area, km=1)
        stop_taking_parcels(ravi)

        ride = dispatch(new_ride(rider, area))

        assert offered(ride) == [ravi.id]

    def test_an_auto_parcel_goes_only_to_an_auto_captain(
        self, rider: User, area: ServiceArea
    ) -> None:
        captain(area, km=0.5)  # a bike captain, nearer
        auto = captain(area, km=2, vehicle="AUTO")

        parcel = dispatch(new_parcel(rider, area, vehicle="AUTO"))

        assert offered(parcel) == [auto.id]

    def test_the_booker_is_never_offered_their_own_parcel(self, area: ServiceArea) -> None:
        own = captain(area, km=1)
        parcel = new_parcel(own.user, area)

        assert offered(dispatch(parcel)) == []

    def test_the_parcel_offer_says_how_to_meet_and_where_to_collect(
        self, rider: User, area: ServiceArea
    ) -> None:
        ravi = captain(area, km=1)
        dispatch(new_parcel(rider, area, parcel=parcel_body(payer="RECEIVER", mode="RECEIVE")))

        offer = client_of(ravi).get(CURRENT).json()["offer"]

        assert offer["kind"] == "PARCEL"
        assert offer["drop"]["address"] == "Hitec City"
        assert offer["parcel"] == {
            "pickup_meet_at": "CURB",
            "drop_meet_at": "DOOR",
            "payment_point": "DROP",
        }
        # Names and phones are shown only after the captain accepts (D20).
        assert "Asha" not in str(offer) and "9876543210" not in str(offer)

    def test_a_ride_offer_has_no_parcel_block(self, rider: User, area: ServiceArea) -> None:
        ravi = captain(area, km=1)
        dispatch(new_ride(rider, area))

        offer = client_of(ravi).get(CURRENT).json()["offer"]

        assert offer["kind"] == "RIDE"
        assert offer["parcel"] is None


# --- PUT partner/rides/parcel-preference/ -----------------------------------------------------


def bike_captain() -> tuple[PartnerProfile, APIClient]:
    user, client = ready_captain()
    return PartnerProfile.objects.get(user=user), client


def test_a_bike_captain_turns_parcels_off_and_on() -> None:
    partner, client = bike_captain()
    assert client.get(ME).json()["takes_parcels"] is True  # on by default (D17)

    off = client.put(PREFERENCE, {"takes_parcels": False}, format="json")

    assert off.status_code == 200
    assert off.json() == {"takes_parcels": False}
    assert CaptainVehicle.objects.get(partner=partner).takes_parcels is False
    assert client.get(ME).json()["takes_parcels"] is False

    on = client.put(PREFERENCE, {"takes_parcels": True}, format="json")

    assert on.json() == {"takes_parcels": True}
    assert client.get(ME).json()["takes_parcels"] is True


def test_repeating_the_same_value_changes_nothing() -> None:
    partner, client = bike_captain()
    client.put(PREFERENCE, {"takes_parcels": False}, format="json")
    stamp = CaptainVehicle.objects.get(partner=partner).updated_at

    again = client.put(PREFERENCE, {"takes_parcels": False}, format="json")

    assert again.status_code == 200
    assert CaptainVehicle.objects.get(partner=partner).updated_at == stamp


def test_an_auto_captain_may_opt_out_too() -> None:
    partner, client = bike_captain()
    CaptainVehicle.objects.filter(partner=partner).update(vehicle_type="AUTO")

    response = client.put(PREFERENCE, {"takes_parcels": False}, format="json")

    assert response.status_code == 200


def test_a_cab_captain_cannot_opt_in_or_out() -> None:
    partner, client = bike_captain()
    CaptainVehicle.objects.filter(partner=partner).update(vehicle_type="CAB")

    response = client.put(PREFERENCE, {"takes_parcels": True}, format="json")

    assert response.status_code == 409
    assert error_code(response) == "vehicle_not_eligible"
    assert client.get(ME).json()["takes_parcels"] is False  # never shown as on for a cab


def test_a_captain_without_a_vehicle_is_refused_the_same_way() -> None:
    partner, client = bike_captain()
    CaptainVehicle.objects.filter(partner=partner).delete()

    response = client.put(PREFERENCE, {"takes_parcels": False}, format="json")

    assert response.status_code == 409
    assert error_code(response) == "vehicle_not_eligible"


@pytest.mark.parametrize("body", [{}, {"takes_parcels": "maybe"}, {"takes_parcels": None}])
def test_the_switch_needs_a_yes_or_no(body: dict[str, Any]) -> None:
    _partner, client = bike_captain()

    assert client.put(PREFERENCE, body, format="json").status_code == 400


def test_only_a_partner_can_use_the_switch() -> None:
    customer = customer_client(make_user())

    assert customer.put(PREFERENCE, {"takes_parcels": False}, format="json").status_code == 403
    assert APIClient().put(PREFERENCE, {"takes_parcels": False}, format="json").status_code in (
        401,
        403,
    )
