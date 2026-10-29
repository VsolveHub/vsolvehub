"""Reports an admin uses without knowing internal codes.

Filters are dropdowns the server describes; rows carry names and plain labels; a date range
covers whole days; the preview pages, sorts and searches; an export refuses instead of
truncating.
"""

from datetime import datetime, timedelta
from typing import Any
from unittest.mock import patch

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.commerce.models import PaymentAttempt
from apps.ops_reports import views as report_views
from apps.ops_reports.reports import REPORTS_CATALOG
from apps.rental.models import RentalBooking
from tests.rental.test_cancel_booking import _booked, rental_world  # noqa: F401
from tests.test_list_pagination import _ops_client

pytestmark = pytest.mark.django_db


def _payment(
    amount: int, *, at: datetime, purpose: str = "A7_RENTAL_BOOKING", ref: str = ""
) -> PaymentAttempt:
    attempt = PaymentAttempt.objects.create(
        purpose=purpose, amount_paise=amount, provider="fake", provider_payment_id=ref
    )
    PaymentAttempt.objects.filter(id=attempt.id).update(created_at=at)
    return attempt


def _local(day: str, hour: int) -> datetime:
    return timezone.make_aware(datetime.fromisoformat(f"{day}T{hour:02d}:00"))


def _preview(report: str, **query: Any) -> Any:
    return _ops_client().get(f"/api/v1/ops/reports/{report}/", query)


# --- the catalog describes dropdowns, not codes -----------------------------------------------


def test_every_filter_is_a_date_a_dropdown_or_a_partner_search() -> None:
    body = _ops_client().get("/api/v1/ops/reports/").json()

    for report in body:
        assert report["group"] in {"Money", "Services", "Marketplace"}
        assert report["description"]
        for spec in report["filters"]:
            assert spec["kind"] in {"date", "choice", "partner"}
            assert spec["label"]
            if spec["kind"] == "choice" and spec["key"] != "service":
                assert spec["options"], spec


def test_bookings_has_no_archetype_and_offers_services_by_name() -> None:
    bookings = next(
        r for r in _ops_client().get("/api/v1/ops/reports/").json() if r["id"] == "bookings"
    )

    keys = [spec["key"] for spec in bookings["filters"]]
    assert "archetype" not in keys
    assert "archetype" not in [column["key"] for column in bookings["columns"]]
    status = next(spec for spec in bookings["filters"] if spec["key"] == "status")
    assert {"value": "IN_PROGRESS", "label": "In progress", "group": ""} in status["options"]


def test_payment_types_are_named_for_people() -> None:
    payments = REPORTS_CATALOG["payments"]
    purpose = next(f for f in payments.filters if f.key == "purpose")
    labels = {o.value: o.label for o in purpose.choices()}

    assert labels["A7_RENTAL_BOOKING"] == "Rental booking"
    assert labels["A9_STAY_SUBSCRIPTION"] == "Stay plan"
    assert not any(label.startswith(("A7", "A9", "A10", "M2")) for label in labels.values())


def test_stays_have_their_own_reports() -> None:
    assert {"stays", "stay_enquiries", "stay_subscriptions", "subscriptions"} <= set(
        REPORTS_CATALOG
    )


# --- dates cover whole days -------------------------------------------------------------------


def test_a_one_day_range_includes_the_whole_day() -> None:
    _payment(1000, at=_local("2026-10-28", 23))
    _payment(2000, at=_local("2026-10-29", 21))  # evening of the chosen day
    _payment(3000, at=_local("2026-10-30", 1))

    body = _preview("payments", date_start="2026-10-29", date_end="2026-10-29").json()

    assert body["total_rows_count"] == 1
    assert body["rows"][0]["amount_paise"] == 2000


@pytest.mark.parametrize(
    "query",
    [
        {"date_start": "29/10/2026"},
        {"date_start": "2026-10-29", "date_end": "2026-10-01"},
        {"status": "NOT_A_STATUS"},
        {"purpose": "A7"},
    ],
)
def test_bad_filters_are_refused_not_ignored(query: dict[str, str]) -> None:
    assert _preview("payments", **query).status_code == 400


# --- paging, sorting, searching ---------------------------------------------------------------


def test_the_preview_pages_and_counts_everything() -> None:
    now = timezone.now()
    for index in range(7):
        _payment(1000 + index, at=now - timedelta(minutes=index))

    first = _preview("payments", limit=3).json()
    second = _preview("payments", limit=3, offset=3).json()

    assert first["total_rows_count"] == 7
    assert len(first["rows"]) == 3
    assert {r["id"] for r in first["rows"]}.isdisjoint({r["id"] for r in second["rows"]})


def test_a_column_sorts_both_ways() -> None:
    now = timezone.now()
    for amount in (500, 1500, 1000):
        _payment(amount, at=now)

    up = [r["amount_paise"] for r in _preview("payments", sort="amount_paise").json()["rows"]]
    down = [r["amount_paise"] for r in _preview("payments", sort="-amount_paise").json()["rows"]]

    assert up == [500, 1000, 1500]
    assert down == [1500, 1000, 500]


def test_search_finds_a_provider_reference() -> None:
    now = timezone.now()
    _payment(500, at=now, ref="pay_FINDME")
    _payment(700, at=now, ref="pay_other")

    rows = _preview("payments", q="findme").json()["rows"]

    assert [r["provider_reference"] for r in rows] == ["pay_FINDME"]


def test_totals_count_every_matching_row_not_one_page() -> None:
    now = timezone.now()
    for _ in range(4):
        attempt = _payment(1000, at=now)
        PaymentAttempt.objects.filter(id=attempt.id).update(
            status=PaymentAttempt.Status.CAPTURED, captured_at=now
        )

    body = _preview("payments", limit=1).json()
    totals = {t["key"]: t["value"] for t in body["totals"]}

    assert totals["collected"] == 4000


# --- readable rows ----------------------------------------------------------------------------


def test_rental_rows_show_names_and_labels_not_ids(rental_world):  # noqa: F811
    booking = _booked(rental_world)

    row = _preview("rentals", period="all").json()["rows"][0]

    assert row["reference"] == str(booking.id)[:8].upper()
    assert row["owner"].startswith("Owner Cancel Co")
    assert row["customer"] == "Customer Cancel · ••••0002"
    assert row["status"] == "Pending payment"


def test_partner_filter_searches_by_name_and_phone(rental_world):  # noqa: F811
    by_name = (
        _ops_client().get("/api/v1/ops/reports/partner-options/", {"q": "owner cancel"}).json()
    )
    by_phone = _ops_client().get("/api/v1/ops/reports/partner-options/", {"q": "9922220001"}).json()

    assert [o["value"] for o in by_name] == [str(rental_world["partner"].id)]
    assert by_phone == by_name
    named = (
        _ops_client()
        .get("/api/v1/ops/reports/partner-options/", {"id": str(rental_world["partner"].id)})
        .json()
    )
    assert named[0]["label"].startswith("Owner Cancel Co")


def test_filtering_by_partner(rental_world):  # noqa: F811
    _booked(rental_world)

    mine = _preview("rentals", partner=str(rental_world["partner"].id)).json()
    bad = _preview("rentals", partner="not-a-partner")

    assert mine["total_rows_count"] == 1
    assert bad.status_code == 400


# --- exports ----------------------------------------------------------------------------------


def test_an_export_is_titled_in_words_and_in_rupees(rental_world):  # noqa: F811
    booking = _booked(rental_world)
    RentalBooking.objects.filter(id=booking.id).update(price_paise=22800)
    today = timezone.localdate().isoformat()

    response = _ops_client().get(
        "/api/v1/ops/reports/rentals.csv", {"date_start": today, "date_end": today}
    )
    text = response.content.decode("utf-8-sig")

    assert response.status_code == 200
    assert (
        response["Content-Disposition"] == f'attachment; filename="rentals_{today}_to_{today}.csv"'
    )
    assert text.splitlines()[0].startswith("Reference,Booked on,Item,Owner,Customer,Status")
    assert "Rent (₹)" in text.splitlines()[0]
    assert ",228.00," in text


def test_an_oversize_export_is_refused_not_cut_short() -> None:
    now = timezone.now()
    for _ in range(3):
        _payment(1000, at=now)

    with patch.object(report_views, "EXPORT_ROW_LIMIT", 2):
        response = _ops_client().get("/api/v1/ops/reports/payments.csv", {"period": "all"})

    assert response.status_code == 400
    assert "export_too_large" in response.content.decode()


def test_reports_are_for_operations_only() -> None:
    assert APIClient().get("/api/v1/ops/reports/").status_code in (401, 403)
