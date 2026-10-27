"""Start-up guards for payouts: the cooling period, and which RazorpayX keys may be used where.

Tested through the guard functions rather than by importing a settings module, for the reason
`config.settings.guards` gives: importing `production.py` runs every other guard in it too.
"""

import pytest
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

from config.settings.guards import (
    PRODUCTION_MINIMUM_PAYOUT_COOLING_HOURS,
    RAZORPAYX_MINIMUM_PAYOUT_PAISE,
    guard_payout_account_cooling,
    guard_payout_clearing,
    guard_payout_minimum,
    guard_razorpayx_test_keys,
)


@pytest.mark.parametrize("hours", [0, 1, 23])
def test_production_refuses_a_cooling_period_shorter_than_a_day(hours: int) -> None:
    with pytest.raises(ImproperlyConfigured, match="PAYOUT_ACCOUNT_COOLING_HOURS"):
        guard_payout_account_cooling(hours, minimum_hours=PRODUCTION_MINIMUM_PAYOUT_COOLING_HOURS)


def test_production_accepts_a_day_or_longer() -> None:
    assert PRODUCTION_MINIMUM_PAYOUT_COOLING_HOURS == 24
    guard_payout_account_cooling(24, minimum_hours=PRODUCTION_MINIMUM_PAYOUT_COOLING_HOURS)
    guard_payout_account_cooling(72, minimum_hours=PRODUCTION_MINIMUM_PAYOUT_COOLING_HOURS)


def test_elsewhere_zero_is_allowed_but_a_negative_period_is_not() -> None:
    guard_payout_account_cooling(0, minimum_hours=0)
    with pytest.raises(ImproperlyConfigured):
        guard_payout_account_cooling(-1, minimum_hours=0)


@pytest.mark.parametrize("hours", [0, 24, 71])
def test_production_refuses_a_clearing_window_shorter_than_the_dispute_window(hours: int) -> None:
    """Shorter than the Customer's 72-hour dispute window, a Partner could be paid before the
    Customer has finished being allowed to complain."""

    with pytest.raises(ImproperlyConfigured, match="PAYOUT_CLEARING_HOURS"):
        guard_payout_clearing(hours, minimum_hours=settings.M1_QUALITY_DISPUTE_WINDOW_HOURS)


def test_production_accepts_the_dispute_window_or_longer() -> None:
    guard_payout_clearing(72, minimum_hours=settings.M1_QUALITY_DISPUTE_WINDOW_HOURS)
    guard_payout_clearing(96, minimum_hours=settings.M1_QUALITY_DISPUTE_WINDOW_HOURS)


def test_the_default_clearing_window_is_the_dispute_window() -> None:
    assert settings.M1_QUALITY_DISPUTE_WINDOW_HOURS == 72
    guard_payout_clearing(0, minimum_hours=0)
    with pytest.raises(ImproperlyConfigured):
        guard_payout_clearing(-1, minimum_hours=0)


@pytest.mark.parametrize("paise", [0, 1, 99])
def test_a_minimum_below_razorpayx_s_one_rupee_is_refused(paise: int) -> None:
    with pytest.raises(ImproperlyConfigured, match="PAYOUT_MINIMUM_PAISE"):
        guard_payout_minimum(paise)


def test_a_minimum_of_one_rupee_or_more_is_accepted() -> None:
    assert RAZORPAYX_MINIMUM_PAYOUT_PAISE == 100
    guard_payout_minimum(100)
    guard_payout_minimum(10_000)


def test_a_live_razorpayx_key_is_refused_outside_production() -> None:
    with pytest.raises(ImproperlyConfigured, match="live key"):
        guard_razorpayx_test_keys("rzp_live_AbCdEf123456")


@pytest.mark.parametrize("key_id", ["rzp_test_AbCdEf123456", ""])
def test_a_test_key_or_no_key_is_accepted(key_id: str) -> None:
    guard_razorpayx_test_keys(key_id)
