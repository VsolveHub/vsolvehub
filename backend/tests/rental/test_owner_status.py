"""A rental owner's account status decides whether their items exist for customers.

Two regressions from the partner onboarding audit:

- An owner approved on the **Rent out items** track could not post an ad: approval granted the
  Rentals workspace, but posting demanded a separate A7 capability nothing ever created.
- Suspending or offboarding an owner left their items public and bookable, because capabilities
  are not revoked by a suspension and browse never looked at the application.
"""

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.partners.models import PartnerApplication, PartnerProfile
from apps.rental.services import (
    RentalStateError,
    create_asset,
    create_booking,
    moderate_asset,
    public_assets,
    submit_asset,
)

User = get_user_model()


def _asset(world, partner=None):
    return create_asset(
        partner=partner or world["partner"],
        variant_id=world["variant"].id,
        title="Ladder",
        daily_rate_paise=30_000,
        deposit_paise=0,
        pickup_address_line="Plot 1",
        pickup_city="Hyderabad",
        pickup_pincode="500072",
    )


def _live_asset(world):
    asset = _asset(world)
    submit_asset(asset=asset, partner=world["partner"])
    moderate_asset(asset=asset, actor=world["owner"], action="APPROVE", reason="ok")
    return asset


def _set_status(partner, status):
    PartnerApplication.objects.filter(partner=partner).update(status=status)


@pytest.mark.django_db
def test_an_approved_rental_owner_posts_without_a_separate_capability(rental_world):
    user = User.objects.create(phone_number="+919911120099", full_name="Short Sign Up")
    owner = PartnerProfile.objects.create(user=user, display_name="Short Sign Up Rentals")
    PartnerApplication.objects.create(
        partner=owner,
        status=PartnerApplication.Status.APPROVED,
        track=PartnerApplication.Track.RENTAL_OWNER,
    )
    assert not owner.capabilities.exists()

    asset = _asset(rental_world, partner=owner)

    assert asset.partner_id == owner.id


@pytest.mark.django_db
def test_a_rental_owner_not_yet_approved_cannot_post(rental_world):
    user = User.objects.create(phone_number="+919911120098", full_name="Still Applying")
    owner = PartnerProfile.objects.create(user=user, display_name="Still Applying Rentals")
    PartnerApplication.objects.create(
        partner=owner,
        status=PartnerApplication.Status.UNDER_REVIEW,
        track=PartnerApplication.Track.RENTAL_OWNER,
    )

    with pytest.raises(PermissionError):
        _asset(rental_world, partner=owner)


@pytest.mark.django_db
@pytest.mark.parametrize(
    "status",
    [PartnerApplication.Status.SUSPENDED, PartnerApplication.Status.OFFBOARDED],
)
def test_a_suspended_owners_items_disappear_and_cannot_be_booked(rental_world, status):
    asset = _live_asset(rental_world)
    assert public_assets().filter(id=asset.id).exists()

    _set_status(rental_world["partner"], status)

    assert not public_assets().filter(id=asset.id).exists()
    start = timezone.localdate() + timedelta(days=1)
    with pytest.raises(RentalStateError):
        create_booking(
            customer=rental_world["customer"],
            asset_id=asset.id,
            start_date=start,
            end_date=start + timedelta(days=1),
            hold_deposit_for_demo=True,
        )


@pytest.mark.django_db
def test_a_suspended_owner_cannot_post_even_with_an_approved_capability(rental_world):
    # The capability survives a suspension; the application status is what stops it.
    _set_status(rental_world["partner"], PartnerApplication.Status.SUSPENDED)

    with pytest.raises(PermissionError):
        _asset(rental_world)


@pytest.mark.django_db
def test_reinstating_brings_the_items_back(rental_world):
    asset = _live_asset(rental_world)
    _set_status(rental_world["partner"], PartnerApplication.Status.SUSPENDED)

    _set_status(rental_world["partner"], PartnerApplication.Status.APPROVED)

    assert public_assets().filter(id=asset.id).exists()
