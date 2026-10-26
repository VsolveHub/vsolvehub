"""The owner's pickup hours: open days with their own hours, no time slots.

Replaces ``test_pickup_times.py``, which tested the slot-based hours removed in migration 0016.
"""

from datetime import date, time, timedelta

import pytest
from django.utils import timezone
from rest_framework import status

from apps.rental.models import RentalPickupDay
from apps.rental.pickup_hours import (
    DayHours,
    PickupHoursError,
    check_open_days,
    pickup_hours_payload,
    save_pickup_hours,
    summary,
)
from apps.rental.services import (
    RentalStateError,
    auto_publish_asset,
    create_asset,
    create_booking,
    moderate_asset,
    submit_asset,
)
from tests.rental.conftest import role_client

PICKUP = {
    "pickup_address_line": "Plot 4, Road 2",
    "pickup_area": "Madhapur",
    "pickup_city": "Hyderabad",
    "pickup_pincode": "500081",
}
NINE = time(9)
NINE_PM = time(21)
SIX_PM = time(18)


def _mon_to_sat_and_short_sunday(partner):
    days = [DayHours(weekday=d, opens_at=NINE, closes_at=NINE_PM) for d in range(6)]
    days.append(DayHours(weekday=6, opens_at=NINE, closes_at=SIX_PM))
    return save_pickup_hours(partner=partner, days=days)


def _next(weekday: int) -> date:
    """The next date (at least two days out) falling on ``weekday``."""
    day = timezone.localdate() + timedelta(days=2)
    while day.weekday() != weekday:
        day += timedelta(days=1)
    return day


def _live_asset(world):
    asset = create_asset(
        partner=world["partner"],
        variant_id=world["variant"].id,
        title="Drill",
        daily_rate_paise=10_000,
        deposit_paise=0,
        **PICKUP,
    )
    submit_asset(asset=asset, partner=world["partner"])
    moderate_asset(asset=asset, actor=world["owner"], action="APPROVE", reason="ok for test")
    return asset


# --- saving ---------------------------------------------------------------------------------


def test_save_replaces_the_whole_schedule(rental_world):
    partner = rental_world["partner"]
    _mon_to_sat_and_short_sunday(partner)
    save_pickup_hours(partner=partner, days=[DayHours(weekday=5, opens_at=NINE, closes_at=SIX_PM)])

    rows = list(RentalPickupDay.objects.filter(partner=partner))
    assert [(r.weekday, r.closes_at) for r in rows] == [(5, SIX_PM)]


@pytest.mark.parametrize(
    ("days", "code"),
    [
        ([], "pickup_hours_no_days"),
        ([DayHours(weekday=7, opens_at=NINE, closes_at=NINE_PM)], "pickup_hours_day"),
        (
            [
                DayHours(weekday=1, opens_at=NINE, closes_at=NINE_PM),
                DayHours(weekday=1, opens_at=NINE, closes_at=SIX_PM),
            ],
            "pickup_hours_duplicate",
        ),
        ([DayHours(weekday=1, opens_at=SIX_PM, closes_at=NINE)], "pickup_hours_order"),
        ([DayHours(weekday=1, opens_at=NINE, closes_at=NINE)], "pickup_hours_order"),
        ([DayHours(weekday=1, opens_at=time(9, 15), closes_at=NINE_PM)], "pickup_hours_step"),
    ],
)
def test_invalid_schedules_are_refused_and_nothing_is_saved(rental_world, days, code):
    partner = rental_world["partner"]
    _mon_to_sat_and_short_sunday(partner)
    with pytest.raises(PickupHoursError) as refused:
        save_pickup_hours(partner=partner, days=days)
    assert refused.value.code == code
    # The old schedule survives a refused save.
    assert RentalPickupDay.objects.filter(partner=partner).count() == 7


def test_payload_lists_seven_days_monday_first(rental_world):
    partner = rental_world["partner"]
    save_pickup_hours(
        partner=partner,
        days=[
            DayHours(weekday=5, opens_at=NINE, closes_at=NINE_PM),
            DayHours(weekday=6, opens_at=NINE, closes_at=SIX_PM),
        ],
    )
    payload = pickup_hours_payload(partner.id)
    assert payload["is_set"] is True
    assert [d["weekday"] for d in payload["days"]] == list(range(7))
    assert payload["days"][0] == {
        "weekday": 0,
        "day_name": "Monday",
        "is_open": False,
        "opens_at": None,
        "closes_at": None,
    }
    assert payload["days"][6]["opens_at"] == "09:00"
    assert payload["days"][6]["closes_at"] == "18:00"


def test_payload_before_hours_are_set(rental_world):
    payload = pickup_hours_payload(rental_world["partner"].id)
    assert payload["is_set"] is False
    assert all(d["is_open"] is False for d in payload["days"])
    assert payload["summary"] == ""


def test_summary_groups_consecutive_equal_days(rental_world):
    partner = rental_world["partner"]
    rows = _mon_to_sat_and_short_sunday(partner)
    assert summary(rows) == "Mon-Sat 9 AM-9 PM · Sun 9 AM-6 PM"


def test_summary_does_not_group_across_a_closed_day(rental_world):
    partner = rental_world["partner"]
    rows = save_pickup_hours(
        partner=partner,
        days=[
            DayHours(weekday=0, opens_at=NINE, closes_at=NINE_PM),
            DayHours(weekday=2, opens_at=NINE, closes_at=NINE_PM),
            DayHours(weekday=3, opens_at=time(10, 30), closes_at=NINE_PM),
        ],
    )
    assert summary(rows) == "Mon 9 AM-9 PM · Wed 9 AM-9 PM · Thu 10:30 AM-9 PM"


# --- booking ---------------------------------------------------------------------------------


def test_open_day_check_passes_when_hours_are_not_set(rental_world):
    """R-11: ads published before hours existed stay bookable."""
    check_open_days(
        partner_id=rental_world["partner"].id, start_date=_next(6), end_date=_next(6) + timedelta(1)
    )


def test_booking_on_a_closed_pickup_day_is_refused(rental_world):
    partner = rental_world["partner"]
    save_pickup_hours(
        partner=partner,
        days=[DayHours(weekday=d, opens_at=NINE, closes_at=NINE_PM) for d in range(6)],
    )
    asset = _live_asset(rental_world)
    sunday = _next(6)
    with pytest.raises(RentalStateError) as refused:
        create_booking(
            customer=rental_world["customer"],
            asset_id=asset.id,
            start_date=sunday,
            end_date=sunday + timedelta(days=1),
            hold_deposit_for_demo=True,
        )
    assert refused.value.code == "pickup_day_closed"
    assert "Sunday" in str(refused.value)


def test_booking_with_a_closed_return_day_is_refused(rental_world):
    partner = rental_world["partner"]
    save_pickup_hours(
        partner=partner,
        days=[DayHours(weekday=d, opens_at=NINE, closes_at=NINE_PM) for d in range(6)],
    )
    asset = _live_asset(rental_world)
    saturday = _next(5)
    with pytest.raises(RentalStateError) as refused:
        create_booking(
            customer=rental_world["customer"],
            asset_id=asset.id,
            start_date=saturday,
            end_date=saturday + timedelta(days=1),
            hold_deposit_for_demo=True,
        )
    assert refused.value.code == "return_day_closed"


def test_booking_on_open_days_goes_through(rental_world):
    _mon_to_sat_and_short_sunday(rental_world["partner"])
    asset = _live_asset(rental_world)
    saturday = _next(5)
    booking = create_booking(
        customer=rental_world["customer"],
        asset_id=asset.id,
        start_date=saturday,
        end_date=saturday + timedelta(days=1),
        hold_deposit_for_demo=True,
    )
    assert booking.end_date.weekday() == 6


# --- publishing ------------------------------------------------------------------------------


def test_publish_waits_for_pickup_hours(rental_world):
    asset = auto_publish_asset(
        partner=rental_world["partner"],
        variant_id=rental_world["variant"].id,
        title="Ladder",
        daily_rate_paise=5_000,
        image_urls=["https://storage.vsolve.in/ladder.jpg"],
        **PICKUP,
    )
    assert asset.public_state == "DRAFT"
    assert "Set your pickup hours." in asset.moderation_reason


def test_publish_goes_live_once_hours_and_address_are_set(rental_world):
    _mon_to_sat_and_short_sunday(rental_world["partner"])
    asset = auto_publish_asset(
        partner=rental_world["partner"],
        variant_id=rental_world["variant"].id,
        title="Ladder",
        daily_rate_paise=5_000,
        image_urls=["https://storage.vsolve.in/ladder.jpg"],
        **PICKUP,
    )
    assert asset.public_state == "PUBLISHED"


def test_ads_published_before_hours_existed_stay_live(rental_world):
    asset = _live_asset(rental_world)
    assert asset.public_state == "PUBLISHED"


# --- API -------------------------------------------------------------------------------------


def test_partner_reads_and_replaces_hours(rental_world):
    client = role_client(rental_world["owner"], "partner")
    empty = client.get("/api/v1/partner/rentals/pickup-hours")
    assert empty.status_code == status.HTTP_200_OK
    assert empty.json()["is_set"] is False

    saved = client.put(
        "/api/v1/partner/rentals/pickup-hours",
        {
            "days": [
                {"weekday": 5, "opens_at": "09:00", "closes_at": "21:00"},
                {"weekday": 6, "opens_at": "09:00", "closes_at": "18:00"},
            ]
        },
        format="json",
    )
    assert saved.status_code == status.HTTP_200_OK
    assert saved.json()["summary"] == "Sat 9 AM-9 PM · Sun 9 AM-6 PM"


def test_partner_hours_api_refuses_bad_order(rental_world):
    client = role_client(rental_world["owner"], "partner")
    refused = client.put(
        "/api/v1/partner/rentals/pickup-hours",
        {"days": [{"weekday": 0, "opens_at": "21:00", "closes_at": "09:00"}]},
        format="json",
    )
    assert refused.status_code == status.HTTP_400_BAD_REQUEST
    assert refused.json()["error"]["code"] == "pickup_hours_order"


def test_item_page_shows_the_hours(rental_world, client):
    _mon_to_sat_and_short_sunday(rental_world["partner"])
    asset = _live_asset(rental_world)
    page = client.get(f"/api/v1/rentals/{asset.slug}")
    assert page.status_code == status.HTTP_200_OK
    assert page.json()["pickup_hours"]["summary"] == "Mon-Sat 9 AM-9 PM · Sun 9 AM-6 PM"


# --- days off --------------------------------------------------------------------------------


def _every_day(partner, *, closed_dates=None):
    return save_pickup_hours(
        partner=partner,
        days=[DayHours(weekday=d, opens_at=NINE, closes_at=NINE_PM) for d in range(7)],
        closed_dates=closed_dates,
    )


def test_a_day_off_refuses_a_pickup_on_an_open_weekday(rental_world):
    holiday = timezone.localdate() + timedelta(days=3)
    _every_day(rental_world["partner"], closed_dates=[holiday])
    asset = _live_asset(rental_world)

    with pytest.raises(RentalStateError) as refused:
        create_booking(
            customer=rental_world["customer"],
            asset_id=asset.id,
            start_date=holiday,
            end_date=holiday + timedelta(days=1),
            hold_deposit_for_demo=True,
        )

    assert refused.value.code == "pickup_date_closed"


def test_a_day_off_refuses_a_return(rental_world):
    holiday = timezone.localdate() + timedelta(days=4)
    _every_day(rental_world["partner"], closed_dates=[holiday])
    asset = _live_asset(rental_world)

    with pytest.raises(RentalStateError) as refused:
        create_booking(
            customer=rental_world["customer"],
            asset_id=asset.id,
            start_date=holiday - timedelta(days=1),
            end_date=holiday,
            hold_deposit_for_demo=True,
        )

    assert refused.value.code == "return_date_closed"


def test_an_item_can_be_out_across_a_day_off(rental_world):
    holiday = timezone.localdate() + timedelta(days=4)
    _every_day(rental_world["partner"], closed_dates=[holiday])
    asset = _live_asset(rental_world)

    booking = create_booking(
        customer=rental_world["customer"],
        asset_id=asset.id,
        start_date=holiday - timedelta(days=1),
        end_date=holiday + timedelta(days=1),
        hold_deposit_for_demo=True,
    )

    assert booking.start_date < holiday < booking.end_date


def test_saving_hours_without_days_off_keeps_them(rental_world):
    partner = rental_world["partner"]
    holiday = timezone.localdate() + timedelta(days=5)
    _every_day(partner, closed_dates=[holiday])

    _every_day(partner)  # an older client that only edits the weekly hours

    assert pickup_hours_payload(partner.id)["closed_dates"] == [holiday.isoformat()]


def test_days_off_are_replaced_sorted_and_past_ones_dropped(rental_world):
    partner = rental_world["partner"]
    today = timezone.localdate()
    later, sooner = today + timedelta(days=9), today + timedelta(days=2)

    _every_day(partner, closed_dates=[later, today - timedelta(days=1), sooner, later])

    assert pickup_hours_payload(partner.id)["closed_dates"] == [
        sooner.isoformat(),
        later.isoformat(),
    ]
    _every_day(partner, closed_dates=[])
    assert pickup_hours_payload(partner.id)["closed_dates"] == []


def test_a_day_off_is_honoured_before_weekly_hours_are_set(rental_world):
    # Mirrors the customer screen: hours "not set" skips the weekday check, never a day off.
    partner = rental_world["partner"]
    holiday = timezone.localdate() + timedelta(days=3)
    _every_day(partner, closed_dates=[holiday])
    RentalPickupDay.objects.filter(partner=partner).delete()

    with pytest.raises(PickupHoursError) as refused:
        check_open_days(partner_id=partner.id, start_date=holiday, end_date=holiday)

    assert refused.value.code == "pickup_date_closed"


def test_partner_api_saves_and_returns_days_off(rental_world):
    client = role_client(rental_world["owner"], "partner")
    holiday = (timezone.localdate() + timedelta(days=6)).isoformat()

    saved = client.put(
        "/api/v1/partner/rentals/pickup-hours",
        {
            "days": [{"weekday": 5, "opens_at": "09:00", "closes_at": "21:00"}],
            "closed_dates": [holiday],
        },
        format="json",
    )

    assert saved.status_code == status.HTTP_200_OK, saved.json()
    assert saved.json()["closed_dates"] == [holiday]
    assert client.get("/api/v1/partner/rentals/pickup-hours").json()["closed_dates"] == [holiday]


def test_item_page_lists_days_off(rental_world, client):
    holiday = timezone.localdate() + timedelta(days=3)
    _every_day(rental_world["partner"], closed_dates=[holiday])
    asset = _live_asset(rental_world)

    page = client.get(f"/api/v1/rentals/{asset.slug}")

    assert page.json()["pickup_hours"]["closed_dates"] == [holiday.isoformat()]
