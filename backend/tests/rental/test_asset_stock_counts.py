from datetime import timedelta

import pytest
from django.utils import timezone

from apps.rental.models import AssetReservation, RentalBooking
from apps.rental.serializers import PartnerRentalAssetSerializer
from apps.rental.services import (
    asset_stock_counts,
    create_asset,
    create_booking,
    moderate_asset,
    submit_asset,
)


def _live_asset(world, quantity):
    asset = create_asset(
        partner=world["partner"],
        variant_id=world["variant"].id,
        title="Folding chairs",
        daily_rate_paise=1000,
        deposit_paise=0,
        quantity_available=quantity,
    )
    submit_asset(asset=asset, partner=world["partner"])
    moderate_asset(asset=asset, actor=world["owner"], action="APPROVE", reason="ok for test")
    return asset


def _book(world, asset, start, *, days, quantity, status=RentalBooking.Status.CONFIRMED):
    """Book, then pin the times so "now" is inside (start == today) or before the rental."""
    booking = create_booking(
        customer=world["customer"],
        asset_id=asset.id,
        start_date=start,
        end_date=start + timedelta(days=days),
        quantity=quantity,
        hold_deposit_for_demo=True,
    )
    pickup = timezone.now() + (start - timezone.localdate()) - timedelta(hours=1)
    ret = pickup + timedelta(days=days)
    RentalBooking.objects.filter(id=booking.id).update(
        status=status, pickup_at=pickup, return_at=ret
    )
    AssetReservation.objects.filter(id=booking.reservation_id).update(
        pickup_at=pickup, return_at=ret
    )
    return booking


@pytest.mark.django_db
def test_owner_sees_booked_available_and_upcoming(rental_world):
    asset = _live_asset(rental_world, quantity=5)
    today = timezone.localdate()
    _book(rental_world, asset, today, days=2, quantity=2)  # out today
    _book(rental_world, asset, today + timedelta(days=3), days=1, quantity=1)  # later

    counts = asset_stock_counts([asset.id])[asset.id]
    assert counts == {"booked_now": 2, "upcoming": 1}

    asset.refresh_from_db()
    data = PartnerRentalAssetSerializer(asset, context={"stock": {asset.id: counts}}).data
    assert (data["booked_now"], data["available_now"], data["upcoming_bookings"]) == (2, 3, 1)


@pytest.mark.django_db
def test_cancelled_and_returned_bookings_free_the_pieces(rental_world):
    asset = _live_asset(rental_world, quantity=3)
    today = timezone.localdate()
    _book(rental_world, asset, today, days=2, quantity=1, status=RentalBooking.Status.CANCELLED)
    _book(rental_world, asset, today, days=2, quantity=1, status=RentalBooking.Status.RETURNED)

    assert asset_stock_counts([asset.id])[asset.id] == {"booked_now": 0, "upcoming": 0}


@pytest.mark.django_db
def test_handed_over_piece_counts_as_booked_even_when_overdue(rental_world):
    asset = _live_asset(rental_world, quantity=2)
    today = timezone.localdate()
    booking = _book(
        rental_world, asset, today, days=1, quantity=1, status=RentalBooking.Status.HANDOVER
    )
    # The return date has passed but the piece is still with the customer.
    RentalBooking.objects.filter(id=booking.id).update(
        pickup_at=timezone.now() - timedelta(days=3), return_at=timezone.now() - timedelta(days=1)
    )

    assert asset_stock_counts([asset.id])[asset.id]["booked_now"] == 1
