"""Both participants can rate completed catalog work and M2 engagements once.

Each sees **their own** submission and never the other's. 1.57.0 hid both, which also hid a
person's own words from themselves — so a rated job and an unrated one looked identical on the
customer's own screen. 1.59.0 keeps the counterparty private and gives the author theirs back.
"""

from http import HTTPStatus

import pytest
from django.utils import timezone

from apps.commerce.models import Booking
from apps.requirements import vendor_trust
from apps.requirements.models import Engagement, Proposal
from tests.fulfilment.conftest import create_booked_group
from tests.requirements.conftest import M2World, submitted_requirement
from tests.requirements.conftest import (
    world as requirements_world,  # noqa: F401 - exposes the sibling fixture to this module
)

pytestmark = pytest.mark.django_db(transaction=True)

CUSTOMER_SCORE = 4
VISIT_SCORE = 5
PARTNER_SCORE = 5


def test_catalog_booking_collects_each_rating_without_disclosing_either_one() -> None:
    booked = create_booked_group(key_prefix="two-sided-rating")
    booking = booked.booking
    endpoint = f"/api/v1/bookings/{booking.id}/ratings/"

    too_soon = booked.client.post(endpoint, {"score": 5, "comment": "Good"}, format="json")
    assert too_soon.status_code == HTTPStatus.CONFLICT
    assert too_soon.json()["error"]["code"] == "rating_not_ready"

    Booking.objects.filter(pk=booking.id).update(status=Booking.Status.COMPLETED)
    first = booked.client.post(endpoint, {"score": 5, "comment": "Quick and tidy"}, format="json")
    assert first.status_code == HTTPStatus.CREATED
    assert first.json()["can_rate"] is False
    # Their own words come back; the counterparty's never do.
    assert first.json()["my_rating"]["score"] == VISIT_SCORE
    assert first.json()["ratings"] == []

    replay = booked.client.post(
        endpoint,
        {"score": 5, "comment": "Quick and tidy"},
        format="json",
    )
    assert replay.status_code == HTTPStatus.OK

    edit = booked.client.post(endpoint, {"score": 2, "comment": "Changed"}, format="json")
    assert edit.status_code == HTTPStatus.CONFLICT
    assert edit.json()["error"]["code"] == "rating_already_submitted"

    partner_client = booked.client.__class__()
    partner_client.force_authenticate(booked.partner.user)
    partner = partner_client.post(endpoint, {"score": 4, "comment": "Clear brief"}, format="json")
    assert partner.status_code == HTTPStatus.CREATED

    listed = booked.client.get(endpoint)
    assert listed.status_code == HTTPStatus.OK
    # The partner has now rated too, and the customer still sees only their own row.
    assert listed.json()["my_rating"]["score"] == VISIT_SCORE
    assert listed.json()["my_rating"]["comment"] == "Quick and tidy"
    assert listed.json()["ratings"] == []


def _completed_engagement(world: M2World) -> Engagement:
    requirement = submitted_requirement(
        world=world,
        archetype=world.variant.booking_archetype,
    )
    return Engagement.objects.create(
        requirement=requirement,
        partner=world.vendor,
        customer=world.customer,
        archetype=world.variant.booking_archetype,
        commercial_mode=Engagement.CommercialMode.LEAD_ONLY,
        status=Engagement.Status.COMPLETED,
        total_paise=960_000,
        tax_paise=0,
        tax_basis=Proposal.TaxBasis.INCLUSIVE,
        staged_total_paise=960_000,
        completed_at=timezone.now(),
    )


def test_engagement_rating_is_available_to_both_participants_but_not_an_outsider(
    request: pytest.FixtureRequest,
) -> None:
    world: M2World = request.getfixturevalue("requirements_world")
    engagement = _completed_engagement(world)
    endpoint = f"/api/v1/engagements/{engagement.id}/ratings/"

    customer = world.customer_client.post(
        endpoint, {"score": CUSTOMER_SCORE, "comment": "Done well"}, format="json"
    )
    vendor = world.vendor_client.post(endpoint, {"score": 5, "comment": "Helpful"}, format="json")
    outsider = world.outsider_client.get(endpoint)

    assert customer.status_code == HTTPStatus.CREATED
    assert vendor.status_code == HTTPStatus.CREATED
    assert outsider.status_code == HTTPStatus.NOT_FOUND
    customer_summary = world.customer_client.get(endpoint).json()
    vendor_summary = world.vendor_client.get(endpoint).json()
    assert customer_summary["my_rating"]["score"] == CUSTOMER_SCORE
    assert customer_summary["ratings"] == []
    assert vendor_summary["my_rating"]["score"] == PARTNER_SCORE
    assert vendor_summary["ratings"] == []

    overall = vendor_trust.trust_for(world.vendor)
    assert overall.rating_average == float(CUSTOMER_SCORE)
    assert overall.rating_count == 1
