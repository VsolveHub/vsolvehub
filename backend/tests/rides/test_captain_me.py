"""GET /partner/rides/me/: where the signed-in partner stands as a ride captain."""

import pytest
from rest_framework.test import APIClient

from apps.partners.models import PartnerApplication
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

URL = "/api/v1/partner/rides/me/"
VEHICLE_URL = "/api/v1/partner/rides/vehicle/"


def test_a_partner_who_has_not_applied_as_a_captain() -> None:
    user = make_user()
    start_application(user, track=PartnerApplication.Track.SERVICES)

    body = partner_client(user).get(URL).json()

    assert body == {
        "approval": "NOT_STARTED",
        "is_approved": False,
        "vehicle": None,
        "active_pass": None,
        "on_duty": False,
        "duty_started_at": None,
        "blocked_reasons": ["not_approved", "vehicle_missing", "pass_required"],
    }


def test_a_draft_captain_without_a_vehicle_is_blocked_on_both_counts() -> None:
    user = make_user()
    start_application(user)

    body = partner_client(user).get(URL).json()

    assert body["approval"] == "DRAFT"
    assert body["is_approved"] is False
    assert body["blocked_reasons"] == ["not_approved", "vehicle_missing", "pass_required"]


def test_the_saved_vehicle_is_read_back() -> None:
    user = make_user()
    start_application(user)
    client = partner_client(user)
    client.put(VEHICLE_URL, VEHICLE_BODY, format="json")

    body = client.get(URL).json()

    assert body["vehicle"] == {
        "vehicle_type": "BIKE",
        "registration_number": "TS09AB1234",
        "make_model": "Honda Shine",
        "colour": "Black",
    }
    assert body["blocked_reasons"] == ["not_approved", "pass_required"]


def test_an_approved_captain_with_a_vehicle_only_needs_a_pass() -> None:
    user = make_user()
    application = start_application(user)
    client = partner_client(user)
    client.put(VEHICLE_URL, VEHICLE_BODY, format="json")
    set_status(application, PartnerApplication.Status.APPROVED)

    body = client.get(URL).json()

    assert body["approval"] == "APPROVED"
    assert body["is_approved"] is True
    assert body["blocked_reasons"] == ["pass_required"]


def test_an_approved_captain_who_has_no_vehicle_yet_is_still_blocked() -> None:
    user = make_user()
    application = start_application(user)
    set_status(application, PartnerApplication.Status.APPROVED)

    body = partner_client(user).get(URL).json()

    assert body["is_approved"] is True
    assert body["blocked_reasons"] == ["vehicle_missing", "pass_required"]


def test_a_captain_never_sees_another_captains_vehicle() -> None:
    other = make_user()
    start_application(other)
    other_partner = other.partner_profile
    CaptainVehicle.objects.create(
        partner=other_partner,
        vehicle_type="CAB",
        registration_number="KA01AA0001",
        make_model="Swift",
        colour="White",
    )
    mine = make_user()
    start_application(mine)

    body = partner_client(mine).get(URL).json()

    assert body["vehicle"] is None


@pytest.mark.parametrize(
    "status", [PartnerApplication.Status.SUBMITTED, PartnerApplication.Status.DECLINED]
)
def test_the_application_status_is_reported_as_it_is(status: str) -> None:
    user = make_user()
    set_status(start_application(user), status)

    assert partner_client(user).get(URL).json()["approval"] == status


def test_anonymous_and_customer_callers_are_refused() -> None:
    assert APIClient().get(URL).status_code in (401, 403)
    assert customer_client(make_user("A Customer")).get(URL).status_code == 403
