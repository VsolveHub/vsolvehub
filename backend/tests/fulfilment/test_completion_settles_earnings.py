"""Delivered work must actually pay the Partner.

`settle_booking_earning` existed and was wired to nothing but the demo-data seed, so every job
completed through the app wrote no ledger entry at all: a Partner's earnings screen showed a
balance that simply stopped moving while they kept working. These tests pin the funnel closed.
"""

import pytest

from apps.commerce.models import Booking
from apps.fulfilment.completion import (
    OutcomeInput,
    confirm_completion,
    dispute_completion,
    submit_completion,
)
from apps.fulfilment.models import WorkTask
from apps.payouts.models import PartnerLedgerEntry
from apps.payouts.services import partner_balance_paise
from tests.fulfilment.test_completion import _in_progress_booking

pytestmark = [
    pytest.mark.django_db(transaction=True),
    # Reaches en route and arrival through shared helpers for a visit booked for tomorrow; the
    # clock gates on those steps are tested in tests/fulfilment/test_partner_time_gates.py.
    pytest.mark.usefixtures("partner_gates_open"),
]


def _all_outcomes(booking: Booking, outcome: str) -> list[OutcomeInput]:
    return [
        OutcomeInput(work_task_id=task.id, outcome=outcome, quantity=task.quantity)
        for task in WorkTask.objects.filter(booking=booking)
    ]


def _entries(booking: Booking) -> list[PartnerLedgerEntry]:
    return list(
        PartnerLedgerEntry.objects.filter(booking=booking, kind=PartnerLedgerEntry.Kind.EARNING)
    )


def _complete(key_prefix: str) -> Booking:
    booked = _in_progress_booking(key_prefix)
    booking = booked.booking
    submit_completion(
        booking_id=booking.id,
        partner_id=booked.partner.id,
        notes="All done.",
        safety_damage_declared=False,
        outcomes=_all_outcomes(booking, "COMPLETED"),
        expected_version=booking.version,
    )
    booking.refresh_from_db()
    confirm_completion(
        booking_id=booking.id,
        customer_id=booking.customer_id,
        expected_version=booking.version,
    )
    booking.refresh_from_db()
    return booking


def test_a_confirmed_completion_pays_the_partner() -> None:
    """The bug, stated directly: this wrote no ledger entry at all."""

    booking = _complete("settle-confirmed")

    entries = _entries(booking)
    assert booking.status == Booking.Status.COMPLETED
    assert len(entries) == 1
    entry = entries[0]
    assert entry.partner_id == booking.partner_id
    assert entry.status == PartnerLedgerEntry.Status.AVAILABLE
    assert entry.net_paise > 0
    assert entry.net_paise == entry.gross_paise - entry.commission_paise


def test_a_completed_job_moves_the_partners_balance() -> None:
    """The symptom the Partner actually saw: jobs finished, the earnings screen did not move.

    Asserted through `partner_balance_paise` — the same aggregate `/partner/earnings/` serves —
    rather than through the ledger row alone, because the row existing is only half the fix; the
    screen reading it is the part the Partner sees.
    """

    booking = _complete("settle-balance")
    entry = _entries(booking)[0]

    balance = partner_balance_paise(booking.partner)

    assert balance["available_paise"] == entry.net_paise
    assert balance["available_paise"] > 0
    assert balance["pending_paise"] == 0
    assert balance["paid_paise"] == 0


def test_a_disputed_completion_earns_but_is_held() -> None:
    """The Partner earned it; it simply is not payable while somebody is deciding."""

    booked = _in_progress_booking("settle-disputed")
    booking = booked.booking
    submit_completion(
        booking_id=booking.id,
        partner_id=booked.partner.id,
        notes="All done.",
        safety_damage_declared=False,
        outcomes=_all_outcomes(booking, "COMPLETED"),
        expected_version=booking.version,
    )
    booking.refresh_from_db()
    dispute_completion(
        booking_id=booking.id,
        customer_id=booking.customer_id,
        dispute_reason="The switch still trips.",
        expected_version=booking.version,
    )
    booking.refresh_from_db()

    entries = _entries(booking)
    assert booking.status == Booking.Status.DISPUTED
    assert len(entries) == 1
    assert entries[0].status == PartnerLedgerEntry.Status.PENDING


def test_settlement_is_idempotent_across_a_replayed_confirm() -> None:
    """Guarded by `payouts_one_earning_per_booking`, so a retry cannot pay twice."""

    booking = _complete("settle-replay")
    before = _entries(booking)[0].id

    confirm_completion(
        booking_id=booking.id,
        customer_id=booking.customer_id,
        expected_version=booking.version,
    )

    entries = _entries(booking)
    assert len(entries) == 1
    assert entries[0].id == before
