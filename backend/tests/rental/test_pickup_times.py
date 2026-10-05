"""Renting by date and time inside the owner's pickup hours."""

from datetime import datetime, time, timedelta

import pytest
from django.utils import timezone
from rest_framework import status

from apps.rental.models import RentalBooking, RentalPickupHours
from apps.rental.pickup_hours import (
    HoursInput,
    PickupWindowError,
    check_booking_window,
    hours_summary,
    rental_days,
    save_hours,
    validate_hours,
)
from apps.rental.services import (
    RentalStateError,
    create_asset,
    create_booking,
    moderate_asset,
    submit_asset,
)
from tests.rental.conftest import role_client

RATE = 10_000


def _at(days_ahead: int, clock: str) -> datetime:
    day = timezone.localdate() + timedelta(days=days_ahead)
    hh, mm = (int(x) for x in clock.split(":"))
    return timezone.make_aware(datetime.combine(day, time(hh, mm)))


def _live_asset(world, quantity=1):
    asset = create_asset(
        partner=world["partner"],
        variant_id=world["variant"].id,
        title="Drill",
        daily_rate_paise=RATE,
        deposit_paise=0,
        quantity_available=quantity,
        location_text="Plot 4, Madhapur, Hyderabad",
    )
    submit_asset(asset=asset, partner=world["partner"])
    moderate_asset(asset=asset, actor=world["owner"], action="APPROVE", reason="ok for test")
    return asset


def _open_every_day(partner, *, notice=0, advance=60, opens="09:00", closes="20:00"):
    return save_hours(
        partner=partner,
        data=HoursInput(
            open_days=[0, 1, 2, 3, 4, 5, 6],
            opens_at=time.fromisoformat(opens),
            closes_at=time.fromisoformat(closes),
            min_notice_minutes=notice,
            max_advance_days=advance,
        ),
    )


def _book(world, asset, pickup, ret, quantity=1):
    return create_booking(
        customer=world["customer"],
        asset_id=asset.id,
        pickup_at=pickup,
        return_at=ret,
        quantity=quantity,
        hold_deposit_for_demo=True,
    )


# --- pricing --------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("hours", "days"),
    [(2, 1), (24, 1), (25, 1), (25.5, 2), (28, 2), (48, 2), (49, 2), (50, 3)],
)
def test_charged_per_started_24_hours_after_one_hour_grace(hours, days):
    start = datetime(2026, 1, 5, 10, 0)
    assert rental_days(start, start + timedelta(hours=hours)) == days


@pytest.mark.django_db
def test_booking_stores_times_and_bills_by_24_hour_blocks(rental_world):
    asset = _live_asset(rental_world)
    _open_every_day(rental_world["partner"])

    booking = _book(rental_world, asset, _at(2, "10:00"), _at(3, "14:00"))

    assert booking.pickup_at == _at(2, "10:00")
    assert booking.return_at == _at(3, "14:00")
    assert booking.start_date == _at(2, "10:00").date()
    assert booking.end_date == _at(3, "14:00").date()
    assert booking.price_paise == 2 * RATE
    assert booking.reservation.pickup_at == booking.pickup_at


# --- the owner's hours ------------------------------------------------------------------------


@pytest.mark.django_db
def test_pickup_outside_opening_hours_is_refused(rental_world):
    asset = _live_asset(rental_world)
    _open_every_day(rental_world["partner"], opens="09:00", closes="18:00")

    with pytest.raises(RentalStateError) as exc:
        _book(rental_world, asset, _at(2, "08:30"), _at(3, "10:00"))
    assert exc.value.code == "pickup_time_closed"

    with pytest.raises(RentalStateError) as exc:
        _book(rental_world, asset, _at(2, "10:00"), _at(3, "19:00"))
    assert exc.value.code == "pickup_time_closed"


@pytest.mark.django_db
def test_closed_day_is_refused(rental_world):
    asset = _live_asset(rental_world)
    pickup = _at(2, "10:00")
    open_days = [d for d in range(7) if d != pickup.weekday()]
    save_hours(
        partner=rental_world["partner"],
        data=HoursInput(open_days, time(9), time(20), 0, 60),
    )

    with pytest.raises(RentalStateError) as exc:
        _book(rental_world, asset, pickup, _at(3, "10:00"))
    assert exc.value.code == "pickup_day_closed"


@pytest.mark.django_db
def test_notice_period_and_furthest_day_are_enforced(rental_world):
    asset = _live_asset(rental_world)
    hours = _open_every_day(rental_world["partner"], notice=1440, advance=7)
    now = _at(1, "09:00")

    with pytest.raises(PickupWindowError) as exc:
        check_booking_window(hours, _at(1, "12:00"), _at(2, "12:00"), now=now)
    assert exc.value.code == "pickup_notice_too_short"

    with pytest.raises(PickupWindowError) as exc:
        check_booking_window(hours, _at(10, "12:00"), _at(11, "12:00"), now=now)
    assert exc.value.code == "pickup_too_far"

    check_booking_window(hours, _at(2, "10:00"), _at(3, "10:00"), now=now)
    assert asset.id  # the asset stays bookable inside the window


@pytest.mark.django_db
def test_partner_without_saved_hours_gets_the_defaults(rental_world):
    hours = RentalPickupHours.for_partner(rental_world["partner"])
    assert hours.pk is None
    assert hours_summary(hours) == "Every day, 9:00 AM - 8:00 PM"
    assert hours.min_notice_minutes == RentalPickupHours.DEFAULT_NOTICE_MINUTES


def test_hours_must_make_sense():
    with pytest.raises(PickupWindowError):
        validate_hours(HoursInput([], time(9), time(18), 0, 30))
    with pytest.raises(PickupWindowError):
        validate_hours(HoursInput([0], time(18), time(9), 0, 30))


# --- stock by time ----------------------------------------------------------------------------


@pytest.mark.django_db
def test_item_returned_in_the_morning_can_go_out_again_that_afternoon(rental_world):
    asset = _live_asset(rental_world, quantity=1)
    _open_every_day(rental_world["partner"])
    _book(rental_world, asset, _at(2, "10:00"), _at(3, "10:00"))

    later = _book(rental_world, asset, _at(3, "14:00"), _at(4, "14:00"))
    assert later.status == RentalBooking.Status.CONFIRMED

    with pytest.raises(RentalStateError) as exc:
        _book(rental_world, asset, _at(3, "09:00"), _at(3, "12:00"))
    assert exc.value.code in {"out_of_stock", "insufficient_quantity"}


@pytest.mark.django_db
def test_whole_day_bookings_still_work(rental_world):
    asset = _live_asset(rental_world)
    start = timezone.localdate() + timedelta(days=2)

    booking = create_booking(
        customer=rental_world["customer"],
        asset_id=asset.id,
        start_date=start,
        end_date=start + timedelta(days=2),
        hold_deposit_for_demo=True,
    )

    assert timezone.localtime(booking.pickup_at).time() == time(10, 0)
    assert booking.price_paise == 2 * RATE


# --- API --------------------------------------------------------------------------------------


@pytest.mark.django_db
def test_customer_books_with_times_and_sees_where_to_collect(rental_world):
    asset = _live_asset(rental_world)
    _open_every_day(rental_world["partner"])
    client = role_client(rental_world["customer"], "customer")

    detail = client.get(f"/api/v1/rentals/{asset.slug}")
    assert detail.status_code == status.HTTP_200_OK
    assert detail.data["pickup_hours"]["opens_at"] == "09:00"

    response = client.post(
        "/api/v1/rentals/book",
        {
            "asset_id": str(asset.id),
            "pickup_at": _at(2, "10:00").isoformat(),
            "return_at": _at(4, "10:00").isoformat(),
        },
        format="json",
    )
    assert response.status_code == status.HTTP_201_CREATED, response.data
    assert response.data["rental_days"] == 2  # noqa: PLR2004
    # Unpaid: the owner's number is not shared yet.
    assert response.data["pickup_contact"] is None

    RentalBooking.objects.filter(id=response.data["id"]).update(
        status=RentalBooking.Status.CONFIRMED
    )
    mine = client.get("/api/v1/me/rentals").data
    contact = next(r for r in mine if r["id"] == response.data["id"])["pickup_contact"]
    assert contact["address"] == "Plot 4, Madhapur, Hyderabad"
    assert contact["owner_phone"] == "+919911120001"


@pytest.mark.django_db
def test_owner_contact_is_hidden_from_everyone_but_the_renter(rental_world):
    asset = _live_asset(rental_world)
    _open_every_day(rental_world["partner"])
    booking = _book(rental_world, asset, _at(2, "10:00"), _at(3, "10:00"))

    partner_client = role_client(rental_world["owner"], "partner")
    rows = partner_client.get("/api/v1/partner/rentals/bookings").data
    row = next(r for r in rows if r["id"] == str(booking.id))
    assert row["pickup_contact"] is None


@pytest.mark.django_db
def test_booking_outside_hours_is_refused_by_the_api(rental_world):
    asset = _live_asset(rental_world)
    _open_every_day(rental_world["partner"], opens="09:00", closes="18:00")
    client = role_client(rental_world["customer"], "customer")

    response = client.post(
        "/api/v1/rentals/book",
        {
            "asset_id": str(asset.id),
            "pickup_at": _at(2, "21:00").isoformat(),
            "return_at": _at(3, "10:00").isoformat(),
        },
        format="json",
    )
    assert response.status_code >= status.HTTP_400_BAD_REQUEST
    assert not RentalBooking.objects.filter(asset=asset).exists()


@pytest.mark.django_db
def test_partner_saves_pickup_hours(rental_world):
    client = role_client(rental_world["owner"], "partner")

    saved = client.put(
        "/api/v1/partner/rentals/pickup-hours",
        {
            "open_days": [0, 1, 2, 3, 4, 5],
            "opens_at": "10:00",
            "closes_at": "19:30",
            "min_notice_minutes": 240,
            "max_advance_days": 30,
        },
        format="json",
    )
    assert saved.status_code == status.HTTP_200_OK, saved.data
    assert saved.data["summary"] == "Mon-Sat, 10:00 AM - 7:30 PM"

    read = client.get("/api/v1/partner/rentals/pickup-hours")
    assert read.data["min_notice_minutes"] == 240  # noqa: PLR2004

    bad = client.put(
        "/api/v1/partner/rentals/pickup-hours",
        {
            "open_days": [0],
            "opens_at": "19:00",
            "closes_at": "10:00",
            "min_notice_minutes": 240,
            "max_advance_days": 30,
        },
        format="json",
    )
    assert bad.status_code >= status.HTTP_400_BAD_REQUEST
