"""PUT /partner/rides/vehicle/: a captain saves their vehicle while the application is editable."""

import pytest
from rest_framework.test import APIClient

from apps.partners.models import PartnerApplication, PartnerProfile
from apps.rides.models import CaptainVehicle
from tests.rides.helpers import (
    VEHICLE_BODY,
    customer_client,
    make_user,
    partner_client,
    set_status,
    start_application,
)

pytestmark = pytest.mark.django_db

URL = "/api/v1/partner/rides/vehicle/"


def _captain(*, status: str = PartnerApplication.Status.DRAFT) -> tuple[APIClient, PartnerProfile]:
    user = make_user()
    application = start_application(user)
    if status != PartnerApplication.Status.DRAFT:
        set_status(application, status)
    return partner_client(user), application.partner


def _error_code(response) -> str:  # type: ignore[no-untyped-def]
    return str(response.json()["error"]["code"])


class TestSaving:
    def test_a_draft_captain_saves_a_normalised_vehicle(self) -> None:
        client, partner = _captain()

        response = client.put(URL, VEHICLE_BODY, format="json")

        assert response.status_code == 200
        assert response.json() == {
            "vehicle_type": "BIKE",
            "registration_number": "TS09AB1234",
            "make_model": "Honda Shine",
            "colour": "Black",
        }
        assert CaptainVehicle.objects.get(partner=partner).registration_number == "TS09AB1234"

    def test_repeating_the_same_save_changes_nothing(self) -> None:
        client, partner = _captain()

        first = client.put(URL, VEHICLE_BODY, format="json")
        second = client.put(URL, VEHICLE_BODY, format="json")

        assert first.status_code == second.status_code == 200
        assert first.json() == second.json()
        assert CaptainVehicle.objects.filter(partner=partner).count() == 1

    def test_a_later_save_replaces_the_vehicle(self) -> None:
        client, partner = _captain()
        client.put(URL, VEHICLE_BODY, format="json")

        response = client.put(
            URL,
            {**VEHICLE_BODY, "vehicle_type": "AUTO", "colour": "Yellow", "make_model": "Bajaj"},
            format="json",
        )

        assert response.status_code == 200
        vehicle = CaptainVehicle.objects.get(partner=partner)
        assert (vehicle.vehicle_type, vehicle.colour, vehicle.make_model) == (
            "AUTO",
            "Yellow",
            "Bajaj",
        )
        assert CaptainVehicle.objects.filter(partner=partner).count() == 1

    def test_a_captain_asked_to_fix_their_application_can_still_edit(self) -> None:
        client, _ = _captain(status=PartnerApplication.Status.CHANGES_REQUIRED)

        assert client.put(URL, VEHICLE_BODY, format="json").status_code == 200


class TestLockedAfterSubmit:
    @pytest.mark.parametrize(
        "status",
        [
            PartnerApplication.Status.SUBMITTED,
            PartnerApplication.Status.UNDER_REVIEW,
            PartnerApplication.Status.APPROVED,
            PartnerApplication.Status.DECLINED,
            PartnerApplication.Status.SUSPENDED,
            PartnerApplication.Status.OFFBOARDED,
        ],
    )
    def test_the_vehicle_cannot_change_once_the_application_is_past_editing(
        self, status: str
    ) -> None:
        client, partner = _captain(status=status)

        response = client.put(URL, VEHICLE_BODY, format="json")

        assert response.status_code == 403
        assert _error_code(response) == "captain_not_approved"
        assert not CaptainVehicle.objects.filter(partner=partner).exists()

    def test_a_partner_with_no_captain_application_is_refused(self) -> None:
        user = make_user()
        start_application(user, track=PartnerApplication.Track.SERVICES)

        response = partner_client(user).put(URL, VEHICLE_BODY, format="json")

        assert response.status_code == 403
        assert _error_code(response) == "captain_not_approved"


class TestRegistrationUniqueness:
    def test_two_captains_cannot_share_a_plate_however_it_is_typed(self) -> None:
        first_client, _ = _captain()
        second_client, second_partner = _captain()
        assert first_client.put(URL, VEHICLE_BODY, format="json").status_code == 200

        response = second_client.put(
            URL, {**VEHICLE_BODY, "registration_number": "TS09AB1234"}, format="json"
        )

        assert response.status_code == 409
        assert _error_code(response) == "registration_already_used"
        assert not CaptainVehicle.objects.filter(partner=second_partner).exists()

    def test_a_captain_can_resave_their_own_plate(self) -> None:
        client, _ = _captain()
        client.put(URL, VEHICLE_BODY, format="json")

        response = client.put(
            URL, {**VEHICLE_BODY, "registration_number": "TS09AB1234"}, format="json"
        )

        assert response.status_code == 200


class TestValidation:
    @pytest.mark.parametrize(
        "change",
        [
            {"vehicle_type": "TRUCK"},
            {"registration_number": "   "},
            {"registration_number": ""},
            {"make_model": ""},
            {"colour": ""},
            {"registration_number": "X" * 17},
        ],
    )
    def test_bad_input_is_refused(self, change: dict[str, str]) -> None:
        client, partner = _captain()

        response = client.put(URL, {**VEHICLE_BODY, **change}, format="json")

        assert response.status_code == 400
        assert not CaptainVehicle.objects.filter(partner=partner).exists()

    def test_a_missing_field_is_refused(self) -> None:
        client, _ = _captain()
        body = {key: value for key, value in VEHICLE_BODY.items() if key != "colour"}

        assert client.put(URL, body, format="json").status_code == 400


class TestWhoMayCall:
    def test_an_anonymous_caller_is_refused(self) -> None:
        assert APIClient().put(URL, VEHICLE_BODY, format="json").status_code in (401, 403)

    def test_a_customer_is_refused(self) -> None:
        client = customer_client(make_user("A Customer"))

        assert client.put(URL, VEHICLE_BODY, format="json").status_code == 403
