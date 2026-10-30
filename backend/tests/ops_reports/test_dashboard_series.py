"""Dashboard trend series and the inclusive end date."""

from datetime import datetime, timedelta

import pytest
from django.utils import timezone
from freezegun import freeze_time
from rest_framework.exceptions import ValidationError

from apps.identity.models import User
from apps.ops_reports.dashboards import (
    get_customer_dashboard,
    get_date_filters,
    series_window,
)

pytestmark = pytest.mark.django_db


def _joined(phone_suffix: str, when: datetime) -> User:
    user = User.objects.create_user(phone_number=f"+9196600{phone_suffix.zfill(5)}")
    User.objects.filter(id=user.id).update(date_joined=when)
    return user


def _ist(year: int, month: int, day: int, hour: int = 12) -> datetime:
    return timezone.make_aware(datetime(year, month, day, hour))


def test_a_bare_end_date_includes_that_whole_day() -> None:
    start, end = get_date_filters({"date_start": "2026-10-01", "date_end": "2026-10-07"})
    assert start == _ist(2026, 10, 1, 0)
    assert end == _ist(2026, 10, 8, 0)


def test_a_malformed_date_is_a_validation_error_not_a_crash() -> None:
    with pytest.raises(ValidationError):
        get_date_filters({"date_start": "07/10/2026"})


def test_signups_on_the_last_day_are_counted() -> None:
    _joined("1", _ist(2026, 10, 7, 23))
    data = get_customer_dashboard({"date_start": "2026-10-01", "date_end": "2026-10-07"})
    assert data["new_signups"] == 1


def test_series_has_one_zero_filled_point_per_day() -> None:
    _joined("1", _ist(2026, 10, 2))
    _joined("2", _ist(2026, 10, 2, 18))
    _joined("3", _ist(2026, 10, 5))
    data = get_customer_dashboard({"date_start": "2026-10-01", "date_end": "2026-10-07"})

    assert data["series_granularity"] == "day"
    assert [point["date"] for point in data["series"]] == [f"2026-10-0{day}" for day in range(1, 8)]
    assert [point["new_signups"] for point in data["series"]] == [0, 2, 0, 0, 1, 0, 0]


def test_a_signup_late_at_night_ist_lands_on_its_ist_day() -> None:
    # 00:30 IST on the 4th is 19:00 UTC on the 3rd; the bucket follows IST.
    _joined("1", _ist(2026, 10, 4, 0) + timedelta(minutes=30))
    data = get_customer_dashboard({"date_start": "2026-10-01", "date_end": "2026-10-07"})
    by_day = {point["date"]: point["new_signups"] for point in data["series"]}
    assert by_day["2026-10-04"] == 1
    assert by_day["2026-10-03"] == 0


def test_a_long_range_is_bucketed_by_week_starting_monday() -> None:
    _joined("1", _ist(2026, 3, 4))  # a Wednesday
    _joined("2", _ist(2026, 3, 6))  # the Friday of the same week
    data = get_customer_dashboard({"date_start": "2026-01-01", "date_end": "2026-06-30"})

    assert data["series_granularity"] == "week"
    dates = [point["date"] for point in data["series"]]
    assert all(datetime.fromisoformat(value).weekday() == 0 for value in dates)
    by_week = {point["date"]: point["new_signups"] for point in data["series"]}
    assert by_week["2026-03-02"] == 2


@freeze_time("2026-10-19T10:00:00+05:30")
def test_no_range_means_the_last_thirty_days_through_today() -> None:
    begin, stop, granularity = series_window(None, None)
    assert granularity == "day"
    assert stop == _ist(2026, 10, 20, 0)
    assert stop - begin == timedelta(days=30)


def test_a_range_past_a_year_is_capped() -> None:
    start, end = get_date_filters({"date_start": "2020-01-01", "date_end": "2026-10-19"})
    begin, stop, granularity = series_window(start, end)
    assert granularity == "week"
    assert stop - begin == timedelta(days=366)
