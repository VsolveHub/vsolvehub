"""Tests for PartnerMeView (GET and PATCH /api/v1/partner/me/).

Verifies that the signed-in partner can read their profile (including default_location_text)
and update mutable profile fields (display_name, default_location_text).
"""

from http import HTTPStatus

import pytest
from rest_framework.test import APIClient

from apps.identity.models import Role, User, UserRole
from apps.partners.models import PartnerProfile
from tests.helpers import force_role_client
from tests.partners.conftest import PartnerSetup, application_payload

pytestmark = pytest.mark.django_db

ME_URL = "/api/v1/partner/me/"


def _setup_partner_profile(setup: PartnerSetup) -> tuple[PartnerProfile, APIClient]:
    setup.client.patch(
        "/api/v1/partner/application/",
        application_payload(setup),
        format="json",
    )
    profile = PartnerProfile.objects.get(user=setup.user)
    client = force_role_client(user=setup.user, role_code="partner")
    return profile, client


def test_partner_me_get_exposes_default_location_text(partner_setup: PartnerSetup) -> None:
    profile, client = _setup_partner_profile(partner_setup)
    profile.default_location_text = "Plot 12, Financial District, Hyderabad"
    profile.save(update_fields=["default_location_text"])

    response = client.get(ME_URL)

    assert response.status_code == HTTPStatus.OK
    data = response.json()
    assert data["id"] == str(profile.id)
    assert data["display_name"] == "Ravi K."
    assert data["default_location_text"] == "Plot 12, Financial District, Hyderabad"
    assert data["phone_number"] == partner_setup.user.phone_number
    assert "biography" in data
    assert "experience_years" in data
    assert "approval_status" in data
    assert "skills" in data
    assert "service_areas" in data
    assert "member_since" in data
    assert "has_payout_account" in data


def test_partner_me_get_defaults_to_empty_location_text(partner_setup: PartnerSetup) -> None:
    _profile, client = _setup_partner_profile(partner_setup)

    response = client.get(ME_URL)

    assert response.status_code == HTTPStatus.OK
    assert response.json()["default_location_text"] == ""


def test_partner_me_patch_updates_default_location_text(partner_setup: PartnerSetup) -> None:
    profile, client = _setup_partner_profile(partner_setup)
    assert profile.default_location_text == ""

    response = client.patch(
        ME_URL,
        {"default_location_text": "Shop 42, Hitech City Main Rd"},
        format="json",
    )

    assert response.status_code == HTTPStatus.OK
    assert response.json()["default_location_text"] == "Shop 42, Hitech City Main Rd"

    profile.refresh_from_db()
    assert profile.default_location_text == "Shop 42, Hitech City Main Rd"

    # Confirm subsequent GET returns the persisted default_location_text
    get_response = client.get(ME_URL)
    assert get_response.status_code == HTTPStatus.OK
    assert get_response.json()["default_location_text"] == "Shop 42, Hitech City Main Rd"


def test_partner_me_patch_trims_whitespace_on_default_location_text(
    partner_setup: PartnerSetup,
) -> None:
    profile, client = _setup_partner_profile(partner_setup)

    response = client.patch(
        ME_URL,
        {"default_location_text": "   Kondapur Central Hub   "},
        format="json",
    )

    assert response.status_code == HTTPStatus.OK
    assert response.json()["default_location_text"] == "Kondapur Central Hub"
    profile.refresh_from_db()
    assert profile.default_location_text == "Kondapur Central Hub"


def test_partner_me_patch_allows_clearing_default_location_text(
    partner_setup: PartnerSetup,
) -> None:
    profile, client = _setup_partner_profile(partner_setup)
    profile.default_location_text = "Existing address"
    profile.save(update_fields=["default_location_text"])

    response = client.patch(
        ME_URL,
        {"default_location_text": ""},
        format="json",
    )

    assert response.status_code == HTTPStatus.OK
    assert response.json()["default_location_text"] == ""
    profile.refresh_from_db()
    assert profile.default_location_text == ""


def test_partner_me_patch_updates_both_display_name_and_location(
    partner_setup: PartnerSetup,
) -> None:
    profile, client = _setup_partner_profile(partner_setup)

    response = client.patch(
        ME_URL,
        {
            "display_name": "Ravi Electrical Works",
            "default_location_text": "Gachibowli Stadium Road",
        },
        format="json",
    )

    assert response.status_code == HTTPStatus.OK
    data = response.json()
    assert data["display_name"] == "Ravi Electrical Works"
    assert data["default_location_text"] == "Gachibowli Stadium Road"

    profile.refresh_from_db()
    assert profile.display_name == "Ravi Electrical Works"
    assert profile.default_location_text == "Gachibowli Stadium Road"


def test_partner_me_patch_empty_payload_fails_validation(partner_setup: PartnerSetup) -> None:
    _profile, client = _setup_partner_profile(partner_setup)

    response = client.patch(
        ME_URL,
        {},
        format="json",
    )

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert "Provide display_name and/or default_location_text." in str(response.json())


def test_partner_me_patch_rejects_exceedingly_long_location(partner_setup: PartnerSetup) -> None:
    _profile, client = _setup_partner_profile(partner_setup)

    response = client.patch(
        ME_URL,
        {"default_location_text": "A" * 241},
        format="json",
    )

    assert response.status_code == HTTPStatus.BAD_REQUEST


def test_partner_me_get_returns_404_when_no_profile_exists() -> None:
    user = User.objects.create_user(phone_number="+919111122222", full_name="No Profile Partner")
    role, _ = Role.objects.get_or_create(code="partner", defaults={"name": "Partner"})
    UserRole.objects.create(user=user, role=role)
    client = force_role_client(user=user, role_code="partner")

    response = client.get(ME_URL)

    assert response.status_code == HTTPStatus.NOT_FOUND


def test_partner_me_patch_returns_404_when_no_profile_exists() -> None:
    user = User.objects.create_user(phone_number="+919111122222", full_name="No Profile Partner")
    role, _ = Role.objects.get_or_create(code="partner", defaults={"name": "Partner"})
    UserRole.objects.create(user=user, role=role)
    client = force_role_client(user=user, role_code="partner")

    response = client.patch(
        ME_URL,
        {"default_location_text": "Nowhere"},
        format="json",
    )

    assert response.status_code == HTTPStatus.NOT_FOUND


def test_partner_me_requires_partner_role() -> None:
    customer = User.objects.create_user(phone_number="+919333344444", full_name="Customer Only")
    client = APIClient()
    client.force_authenticate(user=customer)

    assert client.get(ME_URL).status_code == HTTPStatus.FORBIDDEN
    assert (
        client.patch(ME_URL, {"default_location_text": "Addr"}, format="json").status_code
        == HTTPStatus.FORBIDDEN
    )


def test_partner_me_requires_authentication() -> None:
    client = APIClient()
    assert client.get(ME_URL).status_code in {HTTPStatus.FORBIDDEN, HTTPStatus.UNAUTHORIZED}
    assert client.patch(ME_URL, {"default_location_text": "Addr"}, format="json").status_code in {
        HTTPStatus.FORBIDDEN,
        HTTPStatus.UNAUTHORIZED,
    }
