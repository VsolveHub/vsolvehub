"""Readable page addresses for stays, rentals and job listings; old id links keep working."""

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from apps.foundation.slugs import lookup_by_slug_or_id, slug_base, unique_slug
from apps.rental.services import create_asset, moderate_asset, submit_asset
from apps.stay.models import Property
from apps.stay.services import update_property_ad
from tests.listings.test_a10_flow import a10_variant, poster  # noqa: F401 — pytest fixtures
from tests.listings.test_resume_private_link import _published
from tests.rental.test_a7_flow import rental_world  # noqa: F401 — pytest fixtures
from tests.stay.test_stay_photos_and_amenities import (  # noqa: F401 — pytest fixtures
    _property,
    world,
)

SECOND = 2


def test_slug_is_the_title_and_area():
    assert slug_base("Sunrise PG", "Madhapur, Hyderabad", fallback="stay") == "sunrise-pg-madhapur"
    # Nothing slug-able left (for example a title in another script): a plain fallback.
    assert slug_base("—", "", fallback="stay") == "stay"


def test_old_links_carry_an_id_new_ones_a_slug():
    assert lookup_by_slug_or_id("sunrise-pg-madhapur") == {"slug": "sunrise-pg-madhapur"}
    key = "0b5e7f5e-8f0a-4d7e-9b61-5f0a2d3c4b5a"
    assert set(lookup_by_slug_or_id(key)) == {"id"}


@pytest.mark.django_db
def test_a_slug_never_hides_behind_a_fixed_page():
    # /stays/mine and /listings/my-applications are real pages; a slug may not take their name.
    assert unique_slug(Property, "mine") == f"mine-{SECOND}"
    assert unique_slug(Property, "my-applications") == f"my-applications-{SECOND}"


@pytest.mark.django_db
def test_stay_slugs_are_unique_and_survive_a_rename(world):  # noqa: F811
    first = _property(world)
    second = _property(world)
    assert first.slug == "sunrise-pg-madhapur"
    assert second.slug == f"sunrise-pg-madhapur-{SECOND}"

    update_property_ad(prop=first, host=world["host"], title="Sunrise Ladies PG")
    first.refresh_from_db()
    assert first.slug == "sunrise-pg-madhapur"  # a shared link keeps working


@pytest.mark.django_db
def test_stay_page_opens_by_slug_and_by_old_id(world):  # noqa: F811
    prop = _property(world)
    client = APIClient()
    by_slug = client.get(f"/api/v1/stays/{prop.slug}")
    by_id = client.get(f"/api/v1/stays/{prop.id}")
    assert by_slug.status_code == status.HTTP_200_OK
    assert by_id.status_code == status.HTTP_200_OK
    assert by_slug.data["id"] == by_id.data["id"] == str(prop.id)
    assert by_slug.data["slug"] == prop.slug
    assert client.get("/api/v1/stays/no-such-stay").status_code == status.HTTP_404_NOT_FOUND
    # Fixed addresses are not mistaken for a slug.
    assert client.get("/api/v1/stays/taxonomy").status_code == status.HTTP_200_OK
    assert Property.objects.filter(slug=prop.slug).count() == 1


@pytest.mark.django_db
def test_rental_page_opens_by_slug(rental_world):  # noqa: F811
    asset = create_asset(
        partner=rental_world["partner"],
        variant_id=rental_world["variant"].id,
        title="Demo Drill",
        daily_rate_paise=50000,
        deposit_paise=100000,
    )
    submit_asset(asset=asset, partner=rental_world["partner"])
    moderate_asset(asset=asset, actor=rental_world["owner"], action="APPROVE", reason="ok")
    asset.refresh_from_db()
    assert asset.slug.startswith("demo-drill")

    response = APIClient().get(f"/api/v1/rentals/{asset.slug}")
    assert response.status_code == status.HTTP_200_OK
    assert response.data["id"] == str(asset.id)


@pytest.mark.django_db
def test_listing_page_opens_by_slug(poster, a10_variant):  # noqa: F811
    listing = _published(poster, a10_variant)
    assert listing.slug == "electrician-needed-hyderabad"

    client = APIClient()
    response = client.get(f"/api/v1/listings/{listing.slug}")
    assert response.status_code == status.HTTP_200_OK
    assert response.data["slug"] == listing.slug
    assert client.get("/api/v1/listings/filters").status_code == status.HTTP_200_OK
