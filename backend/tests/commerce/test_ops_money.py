"""The Operations Money tab for rentals, stays and jobs.

Only captured payments count, in the period their capture falls in, at the amount paid then;
successful refunds come off (except a rental's, which is usually the returned deposit). Each
service reports only its own money.
"""

from datetime import datetime, timedelta
from typing import Any

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.request import Request
from rest_framework.test import APIClient, APIRequestFactory

from apps.commerce.models import PaymentAttempt, Refund
from apps.commerce.ops_money import Period, period_from
from apps.listings.models import VendorSubscription, VendorSubscriptionPlan
from apps.partners.models import PartnerProfile
from apps.rental.models import RentalBooking
from apps.stay.models import StaySubscription, StaySubscriptionPlan
from tests.rental.test_cancel_booking import _booked, rental_world  # noqa: F401
from tests.test_list_pagination import _ops_client

User = get_user_model()
pytestmark = pytest.mark.django_db

ALL = Period("all", None, None)


def _partner(phone: str, name: str) -> PartnerProfile:
    user = User.objects.create(phone_number=phone, full_name=name)
    return PartnerProfile.objects.create(user=user, display_name=name)


def _attempt(purpose: str, amount: int, *, captured: datetime | None) -> PaymentAttempt:
    return PaymentAttempt.objects.create(
        purpose=purpose,
        amount_paise=amount,
        provider="fake",
        status=PaymentAttempt.Status.CAPTURED if captured else PaymentAttempt.Status.CREATED,
        captured_at=captured,
    )


def _refund(attempt: PaymentAttempt, amount: int, *, succeeded: bool = True) -> None:
    Refund.objects.create(
        payment_attempt=attempt,
        amount_paise=amount,
        reason_code="test",
        status=Refund.Status.SUCCEEDED if succeeded else Refund.Status.FAILED,
    )


def _stay_plan(code: str, price: int) -> StaySubscriptionPlan:
    return StaySubscriptionPlan.objects.create(code=code, name=code.title(), price_paise=price)


def _stay_sub(
    host: PartnerProfile, plan: StaySubscriptionPlan, *, captured: datetime | None, status: str
) -> StaySubscription:
    return StaySubscription.objects.create(
        host=host,
        plan=plan,
        status=status,
        payment_attempt=_attempt("A9_STAY_SUBSCRIPTION", plan.price_paise, captured=captured),
        ends_at=timezone.now() + timedelta(days=20),
    )


def _get(path: str, **query: Any) -> Any:
    return _ops_client().get(path, query)


# --- periods ---------------------------------------------------------------------------------


def _request(query: str = "") -> Request:
    return Request(APIRequestFactory().get(f"/x{query}"))


def test_this_month_is_the_calendar_month_in_local_time() -> None:
    now = timezone.make_aware(datetime(2026, 3, 15, 10, 0))
    period = period_from(_request(), now=now)

    assert period.code == "this_month"
    assert timezone.localtime(period.start).date().isoformat() == "2026-03-01"
    assert timezone.localtime(period.end).date().isoformat() == "2026-04-01"


def test_last_month_crosses_a_year() -> None:
    now = timezone.make_aware(datetime(2026, 1, 10, 10, 0))
    period = period_from(_request("?period=last_month"), now=now)

    assert timezone.localtime(period.start).date().isoformat() == "2025-12-01"
    assert timezone.localtime(period.end).date().isoformat() == "2026-01-01"


def test_an_unknown_period_is_refused() -> None:
    response = _get("/api/v1/ops/stays/money", period="forever")

    assert response.status_code == 400


def test_only_operations_can_read_the_money() -> None:
    assert APIClient().get("/api/v1/ops/stays/money").status_code in (401, 403)


# --- stays -----------------------------------------------------------------------------------


def test_stays_count_only_captured_plans_net_of_refunds() -> None:
    now = timezone.now()
    basic = _stay_plan("basic", 49900)
    host_a = _partner("+919933300001", "Host A")
    host_b = _partner("+919933300002", "Host B")
    paid = _stay_sub(host_a, basic, captured=now, status=StaySubscription.Status.ACTIVE)
    _stay_sub(host_b, basic, captured=None, status=StaySubscription.Status.PENDING_ACTIVATION)
    _refund(paid.payment_attempt, 10000)
    _refund(paid.payment_attempt, 5000, succeeded=False)

    body = _get("/api/v1/ops/stays/money").json()
    totals = {row["key"]: row["value"] for row in body["totals"]}
    plan = body["plans"][0]

    assert totals["revenue"] == 49900 - 10000
    assert totals["purchases"] == 1
    assert totals["active"] == 1
    assert plan["purchases"] == 1
    assert plan["active_now"] == 1
    assert plan["revenue_paise"] == 39900


def test_a_purchase_from_an_earlier_month_counts_only_in_all_time() -> None:
    basic = _stay_plan("basic", 49900)
    host = _partner("+919933300003", "Host C")
    _stay_sub(
        host,
        basic,
        captured=timezone.now() - timedelta(days=70),
        status=StaySubscription.Status.EXPIRED,
    )

    this_month = _get("/api/v1/ops/stays/money").json()
    all_time = _get("/api/v1/ops/stays/money", period="all").json()

    assert {r["key"]: r["value"] for r in this_month["totals"]}["revenue"] == 0
    assert {r["key"]: r["value"] for r in all_time["totals"]}["revenue"] == 49900


def test_stay_payments_say_who_paid_newest_first() -> None:
    basic = _stay_plan("basic", 49900)
    older = _partner("+919933300004", "Older Host")
    newer = _partner("+919933300005", "Newer Host")
    now = timezone.now()
    _stay_sub(older, basic, captured=now - timedelta(hours=2), status="ACTIVE")
    _stay_sub(newer, basic, captured=now - timedelta(hours=1), status="ACTIVE")

    rows = _get("/api/v1/ops/stays/money/payments").json()

    assert [row["payer_name"] for row in rows] == ["Newer Host", "Older Host"]
    assert rows[0]["payer_phone"] == "+919933300005"
    assert rows[0]["item"] == "Basic"


# --- jobs ------------------------------------------------------------------------------------


def test_jobs_report_only_job_plans_never_stay_plans() -> None:
    now = timezone.now()
    _stay_sub(
        _partner("+919933300006", "Stay Host"),
        _stay_plan("basic", 49900),
        captured=now,
        status="ACTIVE",
    )
    job_plan = VendorSubscriptionPlan.objects.create(code="jobs", name="Jobs", price_paise=99900)
    VendorSubscription.objects.create(
        poster=_partner("+919933300007", "Employer"),
        plan=job_plan,
        status=VendorSubscription.Status.ACTIVE,
        payment_attempt=_attempt("A10_VENDOR_SUBSCRIPTION", 99900, captured=now),
        ends_at=now + timedelta(days=20),
    )

    body = _get("/api/v1/ops/listings/money").json()
    totals = {row["key"]: row["value"] for row in body["totals"]}

    assert totals["subscription_revenue"] == 99900
    assert totals["revenue"] == 99900
    assert [plan["name"] for plan in body["plans"]] == ["Jobs"]
    rows = _get("/api/v1/ops/listings/money/payments").json()
    assert [row["payer_name"] for row in rows] == ["Employer"]


# --- rentals ---------------------------------------------------------------------------------


def test_rentals_earn_the_platform_fee_not_the_rent_or_deposit(rental_world):  # noqa: F811
    booking = _booked(rental_world)
    cancelled = _booked(rental_world)
    for row, status in ((booking, "CONFIRMED"), (cancelled, "CANCELLED")):
        PaymentAttempt.objects.filter(id=row.deposit.payment_attempt_id).update(
            status=PaymentAttempt.Status.CAPTURED, captured_at=timezone.now()
        )
        RentalBooking.objects.filter(id=row.id).update(status=status, platform_fee_paise=5000)
    # The returned deposit: listed, never taken off the fee.
    _refund(booking.deposit.payment_attempt, 100000)

    body = _get("/api/v1/ops/rentals/money").json()
    totals = {row["key"]: row["value"] for row in body["totals"]}
    rows = _get("/api/v1/ops/rentals/money/payments").json()

    assert totals["revenue"] == 5000
    assert totals["bookings"] == 1
    assert body["plans"] == []
    assert len(rows) == 1
    assert rows[0]["platform_paise"] == 5000
    assert rows[0]["refunded_paise"] == 100000


def test_listing_counts_are_true_totals(rental_world):  # noqa: F811
    for _ in range(3):
        _booked(rental_world)  # an approved, live asset each

    body = _get("/api/v1/ops/rentals/money").json()
    counts = {row["key"]: row["count"] for row in body["listing_counts"]}

    assert counts["total"] == 3
    assert counts["live"] == 3


def test_the_summary_runs_on_an_empty_service() -> None:
    from apps.rental.money import rental_money_summary  # noqa: PLC0415

    assert rental_money_summary(ALL)["totals"][0]["value"] == 0
