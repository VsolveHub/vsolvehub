from datetime import date
from http import HTTPStatus

import pytest

from apps.locations.models import ServiceArea
from apps.partners.models import PartnerAvailabilityException, PartnerAvailabilityRule
from tests.partners.conftest import PartnerSetup, application_payload

pytestmark = pytest.mark.django_db

WEEKLY_RULE_COUNT = 2


def _create_application(setup: PartnerSetup) -> None:
    response = setup.client.patch(
        "/api/v1/partner/application/",
        application_payload(setup),
        format="json",
    )
    assert response.status_code == HTTPStatus.CREATED


def test_partner_replaces_and_reads_weekly_schedule(partner_setup: PartnerSetup) -> None:
    _create_application(partner_setup)
    payload = {
        "rules": [
            {
                "service_area_id": str(partner_setup.service_area.id),
                "weekday": 0,
                "starts_at": "09:00",
                "ends_at": "13:00",
                "ends_next_day": False,
            },
            {
                "service_area_id": str(partner_setup.service_area.id),
                "weekday": 0,
                "starts_at": "14:00",
                "ends_at": "18:00",
                "ends_next_day": False,
            },
        ],
        "exceptions": [
            {
                "service_area_id": str(partner_setup.service_area.id),
                "date": "2026-08-15",
                "is_available": False,
                "reason": "Public holiday",
            },
        ],
    }
    updated = partner_setup.client.put(
        "/api/v1/partner/availability/",
        payload,
        format="json",
    )
    fetched = partner_setup.client.get("/api/v1/partner/availability/")

    assert updated.status_code == HTTPStatus.OK
    assert fetched.status_code == HTTPStatus.OK
    assert len(fetched.json()["rules"]) == WEEKLY_RULE_COUNT
    assert fetched.json()["exceptions"][0]["date"] == str(date(2026, 8, 15))
    assert PartnerAvailabilityRule.objects.count() == WEEKLY_RULE_COUNT
    assert PartnerAvailabilityException.objects.count() == 1


def test_overlapping_and_unapproved_area_schedules_are_rejected(
    partner_setup: PartnerSetup,
) -> None:
    _create_application(partner_setup)
    overlapping = partner_setup.client.put(
        "/api/v1/partner/availability/",
        {
            "rules": [
                {
                    "service_area_id": str(partner_setup.service_area.id),
                    "weekday": 0,
                    "starts_at": "09:00",
                    "ends_at": "13:00",
                },
                {
                    "service_area_id": str(partner_setup.service_area.id),
                    "weekday": 0,
                    "starts_at": "12:00",
                    "ends_at": "18:00",
                },
            ],
            "exceptions": [],
        },
        format="json",
    )
    other_area = ServiceArea.objects.create(slug="east-hyderabad", name="East Hyderabad")
    wrong_area = partner_setup.client.put(
        "/api/v1/partner/availability/",
        {
            "rules": [
                {
                    "service_area_id": str(other_area.id),
                    "weekday": 1,
                    "starts_at": "09:00",
                    "ends_at": "18:00",
                },
            ],
            "exceptions": [],
        },
        format="json",
    )

    assert overlapping.status_code == HTTPStatus.BAD_REQUEST
    assert overlapping.json()["error"]["code"] == "partner_schedule_invalid"
    assert wrong_area.status_code == HTTPStatus.BAD_REQUEST
    assert PartnerAvailabilityRule.objects.count() == 0


def test_overnight_window_must_be_explicit(partner_setup: PartnerSetup) -> None:
    _create_application(partner_setup)
    response = partner_setup.client.put(
        "/api/v1/partner/availability/",
        {
            "rules": [
                {
                    "service_area_id": str(partner_setup.service_area.id),
                    "weekday": 5,
                    "starts_at": "22:00",
                    "ends_at": "02:00",
                    "ends_next_day": False,
                },
            ],
            "exceptions": [],
        },
        format="json",
    )

    assert response.status_code == HTTPStatus.BAD_REQUEST
