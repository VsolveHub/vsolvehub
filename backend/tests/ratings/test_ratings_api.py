"""Both participants can rate completed catalog work and M2 engagements once."""

from http import HTTPStatus

import pytest
from django.utils import timezone

from apps.commerce.models import Booking
from apps.requirements.models import Engagement, Proposal
from tests.fulfilment.conftest import create_booked_group
from tests.requirements.conftest import M2World, submitted_requirement

pytestmark = pytest.mark.django_db(transaction=True)

EXCELLENT_SCORE = 5
EXPECTED_TWO_SIDED_RATINGS = 2


def test_catalog_booking_collects_one_rating_from_each_side_and_lists_them() -> None:
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
    assert first.json()["my_rating"]["score"] == EXCELLENT_SCORE

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
    assert [(item["rater_role"], item["score"]) for item in listed.json()["ratings"]] == [
        ("CUSTOMER", 5),
        ("PARTNER", 4),
    ]


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
    world: M2World,
) -> None:
    engagement = _completed_engagement(world)
    endpoint = f"/api/v1/engagements/{engagement.id}/ratings/"

    customer = world.customer_client.post(
        endpoint, {"score": 4, "comment": "Done well"}, format="json"
    )
    vendor = world.vendor_client.post(endpoint, {"score": 5, "comment": "Helpful"}, format="json")
    outsider = world.outsider_client.get(endpoint)

    assert customer.status_code == HTTPStatus.CREATED
    assert vendor.status_code == HTTPStatus.CREATED
    assert outsider.status_code == HTTPStatus.NOT_FOUND
    assert len(world.customer_client.get(endpoint).json()["ratings"]) == EXPECTED_TWO_SIDED_RATINGS
