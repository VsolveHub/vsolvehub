"""Every ledger line says what it was for (`apps.payouts.ledger_sources`).

Regression: the Partner statement listed "₹15,554 for the work" with no booking, date or link, and
a rental line carried no reference at all. Each way money reaches the ledger is pinned here; the
project and workforce sources are in `tests/requirements/test_ledger_origin_m2.py`.
"""

import uuid
from datetime import timedelta
from http import HTTPStatus
from typing import Any

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.commerce.models import Booking
from apps.payouts.ledger_sources import describe_ledger_sources
from apps.payouts.models import PartnerLedgerEntry
from apps.payouts.services import (
    record_adjustment,
    settle_booking_earning,
    settle_rental_earning,
)
from apps.rental.models import RentalBooking
from tests.fulfilment.conftest import create_booked_group
from tests.helpers import force_role_client
from tests.payouts.test_ledger_and_payout import _deliver
from tests.payouts.test_rental_payout import rental_payout_setup  # noqa: F401 - fixture

pytestmark = [
    pytest.mark.django_db(transaction=True),
    pytest.mark.usefixtures("partner_gates_open"),
]


def _visit_earning(key: str) -> PartnerLedgerEntry:
    booked = create_booked_group(key_prefix=key)
    _deliver(booked, key=key)
    entry = settle_booking_earning(booking_id=booked.booking.id)
    assert entry is not None
    return entry


def test_a_home_visit_line_names_the_service_its_day_and_its_booking() -> None:
    entry = _visit_earning("origin-visit")

    origin = describe_ledger_sources([entry])[entry.id]

    assert origin.type == "HOME_VISIT"
    assert origin.title  # the booked service line, as the job screen names it
    assert origin.booking_id == entry.booking_id
    assert entry.booking is not None
    assert origin.starts_on == entry.booking.scheduled_start.date()


def test_a_rental_line_names_the_item_and_both_days(rental_payout_setup: dict[str, Any]) -> None:  # noqa: F811
    booking = rental_payout_setup["booking"]
    booking.status = RentalBooking.Status.RETURNED
    booking.save(update_fields=("status",))
    entry = settle_rental_earning(rental_booking_id=booking.id)
    assert entry is not None

    origin = describe_ledger_sources([entry])[entry.id]

    assert origin.type == "RENTAL"
    assert origin.title == booking.asset.title
    assert (origin.starts_on, origin.ends_on) == (booking.start_date, booking.end_date)
    assert origin.rental_booking_id == booking.id


def test_a_correction_of_a_visit_points_back_at_that_visit() -> None:
    earning = _visit_earning("origin-correction")

    correction = record_adjustment(
        partner_id=earning.partner_id,
        corrects_id=earning.id,
        net_paise=5_000,
        reason="Missed travel allowance",
        actor=None,
        idempotency_key=f"origin-correction-{uuid.uuid4()}",
    )
    origin = describe_ledger_sources([correction])[correction.id]

    assert origin.type == "ADJUSTMENT"
    assert origin.booking_id == earning.booking_id
    assert origin.title == describe_ledger_sources([earning])[earning.id].title


def test_a_standalone_correction_and_withdrawal_fees_say_what_they_are() -> None:
    earning = _visit_earning("origin-fees")
    partner_id = earning.partner_id
    standalone = record_adjustment(
        partner_id=partner_id,
        corrects_id=None,
        net_paise=10_000,
        reason="Goodwill",
        actor=None,
        idempotency_key=f"origin-standalone-{uuid.uuid4()}",
    )
    fee = PartnerLedgerEntry.objects.create(
        partner_id=partner_id,
        kind=PartnerLedgerEntry.Kind.FEE,
        status=PartnerLedgerEntry.Status.AVAILABLE,
        gross_paise=-500,
        commission_paise=0,
        net_paise=-500,
        reason="withdrawal_fee",
    )
    refund = record_adjustment(
        partner_id=partner_id,
        corrects_id=fee.id,
        net_paise=500,
        reason="withdrawal_fee_refund:provider_rejected",
        actor=None,
        idempotency_key=f"origin-fee-refund-{uuid.uuid4()}",
    )

    origins = describe_ledger_sources([standalone, fee, refund])

    assert origins[standalone.id].type == "ADJUSTMENT"
    assert origins[standalone.id].booking_id is None
    assert origins[fee.id].type == "WITHDRAWAL_FEE"
    assert origins[refund.id].type == "WITHDRAWAL_FEE_REFUND"


def test_a_line_pointing_at_something_unknown_is_other_rather_than_missing() -> None:
    earning = _visit_earning("origin-unknown")
    odd = PartnerLedgerEntry.objects.create(
        partner_id=earning.partner_id,
        kind=PartnerLedgerEntry.Kind.EARNING,
        status=PartnerLedgerEntry.Status.AVAILABLE,
        gross_paise=1_000,
        commission_paise=0,
        net_paise=1_000,
        calculation_snapshot={"source": "m2_engagement_stage", "engagement_stage_id": "nope"},
    )

    assert describe_ledger_sources([odd])[odd.id].type == "OTHER"


def test_a_page_of_lines_costs_a_fixed_handful_of_queries() -> None:
    entries = [_visit_earning(f"origin-batch-{index}") for index in range(3)]
    lines = list(
        PartnerLedgerEntry.objects.filter(id__in=[entry.id for entry in entries]).select_related(
            "corrects"
        )
    )

    with CaptureQueriesContext(connection) as one:
        describe_ledger_sources(lines[:1])
    with CaptureQueriesContext(connection) as three:
        describe_ledger_sources(lines)

    assert len(three.captured_queries) == len(one.captured_queries)


def test_the_partner_ledger_api_carries_each_lines_origin() -> None:
    entry = _visit_earning("origin-api")
    client = force_role_client(user=entry.partner.user, role_code="partner")

    response = client.get("/api/v1/partner/ledger/")

    assert response.status_code == HTTPStatus.OK, response.json()
    [line] = [row for row in response.json()["results"] if row["id"] == str(entry.id)]
    assert line["origin"]["type"] == "HOME_VISIT"
    assert line["origin"]["booking_id"] == str(entry.booking_id)
    assert line["origin"]["title"]


def test_the_scheduled_day_is_the_visit_day_not_the_day_it_was_settled() -> None:
    entry = _visit_earning("origin-day")
    assert entry.booking is not None
    later = entry.booking.scheduled_start + timedelta(days=3)
    Booking.objects.filter(id=entry.booking.id).update(scheduled_start=later)
    entry.refresh_from_db()

    origin = describe_ledger_sources([entry])[entry.id]

    assert origin.starts_on == later.date()
