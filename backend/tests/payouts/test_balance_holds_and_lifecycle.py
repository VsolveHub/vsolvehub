"""Phase 1 money correctness: what a payout carries, what freezes it, and how it settles.

The rules, each pinned here against the real services rather than a fake path around them:

* **One transfer per Partner, refunds subtracted.** A run sends the sum of every cleared entry,
  so a refund comes off the money that is going out instead of waiting for an earning that may
  never come.
* **The clearing window.** A visit's earning cannot be paid until the Customer's 72-hour dispute
  window has closed.
* **Explicit holds.** A dispute or case freezes a booking's earning even when it was already
  available, and only the last cause to be decided lifts it.
* **The last-moment check.** Approval can be hours before payment; a transfer is re-checked
  right before it is sent.
* **Forward-only settlement.** Uncertain payouts are looked up, never re-sent; webhook
  redeliveries change nothing; `payout.updated` only tracks.
"""

import hashlib
import hmac
import json
import uuid
from datetime import timedelta
from http import HTTPStatus
from typing import Any

import pytest
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.cases.models import OperationsCase
from apps.cases.services import open_case, resolve_case
from apps.commerce.models import Booking
from apps.fulfilment.completion import (
    OutcomeInput,
    auto_finalize_completion,
    submit_completion,
)
from apps.fulfilment.models import CompletionSubmission, WorkTask
from apps.fulfilment.otp import operations_assisted_start
from apps.fulfilment.quality_dispute import open_quality_dispute
from apps.fulfilment.services import mark_arrived, mark_en_route
from apps.notifications.models import KillSwitch
from apps.notifications.services import engage_kill_switch
from apps.partners.models import PartnerApplication
from apps.payouts.exceptions import LedgerEntryNotPayableApiError
from apps.payouts.models import (
    PartnerEarningHold,
    PartnerLedgerEntry,
    PartnerPayoutAccount,
    PayoutBatch,
    PayoutBatchItem,
    PayoutWebhookEvent,
)
from apps.payouts.providers import FakePayoutProvider, ProviderPayout
from apps.payouts.services import (
    partner_balance_paise,
    place_earning_hold,
    propose_payout_batch,
    record_adjustment,
    release_payout_hold,
    reserve_entry_for_batch,
    reverse_booking_earning_for_refund,
    settle_booking_earning,
    submit_payout_item,
)
from apps.payouts.tasks import reconcile_payouts
from tests.fulfilment.conftest import BookedGroup, create_booked_group
from tests.payouts.test_ledger_and_payout import _operator
from tests.payouts.test_payout_accounts import WEBHOOK_SECRET
from tests.payouts.test_payout_api import _earning, _partner_client, _verified_account
from tests.payouts.test_payout_submission import _entry, _reserved_item

pytestmark = [
    pytest.mark.django_db(transaction=True),
    # Reaches en route and arrival through shared helpers for a visit booked for tomorrow; the
    # clock gates on those steps are tested in tests/fulfilment/test_partner_time_gates.py.
    pytest.mark.usefixtures("partner_gates_open"),
]

FAKE_PROVIDER = override_settings(PAYOUT_PROVIDER="fake", PAYOUTS_ALLOW_FAKE_PROVIDER=True)
WEBHOOK_URL = "/api/v1/payout-webhooks/razorpayx/"


def _run(reference: str) -> PayoutBatch:
    """Propose a batch covering the last week, the way Operations does."""

    return propose_payout_batch(
        reference=f"{reference}-{uuid.uuid4().hex[:8]}",
        period_start=timezone.now() - timedelta(days=7),
        period_end=timezone.now() + timedelta(days=1),
        actor=_operator(),
    )


def _items_for(booked: BookedGroup, batch: PayoutBatch) -> list[PayoutBatchItem]:
    return list(batch.items.filter(partner=booked.partner))


def _submitted_visit(booked: BookedGroup, *, key: str, safety_damage: bool = False) -> None:
    """Walk a visit to a submitted completion the Customer has not answered."""

    booking = mark_en_route(
        booking_id=booked.booking.id,
        partner_id=booked.partner.id,
        expected_version=booked.booking.version,
    )
    booking = mark_arrived(
        booking_id=booking.id, partner_id=booked.partner.id, expected_version=booking.version
    )
    operations_assisted_start(
        booking_id=booking.id,
        operator=_operator(),
        outage_reason="Test bootstrap: skip OTP.",
        expected_version=booking.version,
    )
    booked.booking.refresh_from_db()
    submit_completion(
        booking_id=booked.booking.id,
        partner_id=booked.partner.id,
        notes="Done.",
        safety_damage_declared=safety_damage,
        outcomes=[
            OutcomeInput(work_task_id=task.id, outcome="COMPLETED", quantity=task.quantity)
            for task in WorkTask.objects.filter(booking=booked.booking)
        ],
        expected_version=booked.booking.version,
        idempotency_key=f"{key}-submit",
    )
    # The Customer stayed silent past the response window.
    CompletionSubmission.objects.filter(booking=booked.booking).update(
        submitted_at=timezone.now() - timedelta(hours=25)
    )


def _post(body: bytes, *, event_id: str | None = None) -> Any:
    signature = hmac.new(WEBHOOK_SECRET.encode(), body, hashlib.sha256).hexdigest()
    headers: dict[str, Any] = {"HTTP_X_RAZORPAY_SIGNATURE": signature}
    if event_id is not None:
        headers["HTTP_X_RAZORPAY_EVENT_ID"] = event_id
    return APIClient().post(WEBHOOK_URL, data=body, content_type="application/json", **headers)


def _event(name: str, entity: dict[str, object]) -> bytes:
    return json.dumps({"event": name, "payload": {"payout": {"entity": entity}}}).encode()


# --------------------------------------------------------------------------------------------
# One transfer per Partner, refunds subtracted
# --------------------------------------------------------------------------------------------


def test_one_transfer_carries_every_cleared_entry_and_subtracts_refunds() -> None:
    booked, earning = _earning("p1-net")
    _verified_account(booked)
    record_adjustment(
        partner_id=booked.partner.id,
        corrects_id=None,
        net_paise=50_000,
        reason="Bonus for a rush job",
        actor=None,
        idempotency_key=f"p1-net-bonus-{uuid.uuid4().hex}",
    )
    refund = reverse_booking_earning_for_refund(
        booking_id=booked.booking.id, refund_id=uuid.uuid4(), actor=None
    )
    assert refund is not None

    batch = _run("p1-net")

    [item] = _items_for(booked, batch)
    assert item.amount_paise == 50_000, "the refund did not come off the transfer"
    assert len(item.entries.all()) == 3
    assert sum(line.amount_paise for line in item.entries.all()) == item.amount_paise
    statuses = set(
        PartnerLedgerEntry.objects.filter(partner=booked.partner).values_list("status", flat=True)
    )
    assert statuses == {PartnerLedgerEntry.Status.RESERVED}
    assert earning.net_paise > 0


def test_refunds_larger_than_earnings_send_nothing_and_show_as_owed() -> None:
    booked, _earning_entry = _earning("p1-owed")
    _verified_account(booked)
    reverse_booking_earning_for_refund(
        booking_id=booked.booking.id, refund_id=uuid.uuid4(), actor=None
    )
    record_adjustment(
        partner_id=booked.partner.id,
        corrects_id=None,
        net_paise=-10_000,
        reason="Damaged fitting recovered",
        actor=None,
        idempotency_key=f"p1-owed-recovery-{uuid.uuid4().hex}",
    )

    batch = _run("p1-owed")

    assert _items_for(booked, batch) == []
    balance = partner_balance_paise(booked.partner)
    assert balance["available_paise"] == -10_000
    assert balance["withdrawable_paise"] == 0
    assert not PartnerLedgerEntry.objects.filter(
        partner=booked.partner, status=PartnerLedgerEntry.Status.RESERVED
    ).exists()


def test_a_partner_owed_less_than_the_minimum_carries_it_to_a_later_run() -> None:
    booked, earning = _earning("p1-minimum")
    _verified_account(booked)

    with override_settings(PAYOUT_MINIMUM_PAISE=earning.net_paise + 1):
        batch = _run("p1-minimum")

    assert _items_for(booked, batch) == []
    earning.refresh_from_db()
    assert earning.status == PartnerLedgerEntry.Status.AVAILABLE


# --------------------------------------------------------------------------------------------
# The clearing window
# --------------------------------------------------------------------------------------------


@override_settings(PAYOUT_CLEARING_HOURS=72)
def test_an_earning_waits_out_the_dispute_window_before_it_can_be_paid() -> None:
    booked, earning = _earning("p1-clearing")
    _verified_account(booked)
    assert earning.clears_at is not None
    assert earning.clears_at > timezone.now() + timedelta(hours=71)

    balance = partner_balance_paise(booked.partner)
    assert balance["clearing_paise"] == earning.net_paise
    assert balance["pending_paise"] == earning.net_paise
    assert balance["available_paise"] == 0
    assert _items_for(booked, _run("p1-clearing")) == []
    with pytest.raises(LedgerEntryNotPayableApiError):
        reserve_entry_for_batch(batch=_run("p1-clearing-direct"), entry=earning)

    # Three days later the window has closed.
    PartnerLedgerEntry.objects.filter(id=earning.id).update(
        clears_at=timezone.now() - timedelta(minutes=1)
    )
    [item] = _items_for(booked, _run("p1-cleared"))
    assert item.amount_paise == earning.net_paise


# --------------------------------------------------------------------------------------------
# Explicit holds
# --------------------------------------------------------------------------------------------


def test_a_quality_dispute_after_finalisation_freezes_an_earning_already_available(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The gap this phase closes: auto-finalisation writes the earning `AVAILABLE`, and the
    Booking's `payout_hold` flag alone froze nothing that already existed."""

    monkeypatch.setattr("apps.fulfilment.completion._has_completion_evidence", lambda _b: True)
    booked = create_booked_group(key_prefix="p1-quality")
    _verified_account(booked)
    _submitted_visit(booked, key="p1-quality")
    auto_finalize_completion(booking_id=booked.booking.id)
    earning = PartnerLedgerEntry.objects.get(booking=booked.booking)
    assert earning.status == PartnerLedgerEntry.Status.AVAILABLE
    booked.booking.refresh_from_db()

    open_quality_dispute(
        booking_id=booked.booking.id,
        customer_id=booked.customer.id,
        reason="The tap still leaks.",
        expected_version=booked.booking.version,
    )

    hold = PartnerEarningHold.objects.get(booking=booked.booking)
    assert hold.reason == PartnerEarningHold.Reason.QUALITY_DISPUTE
    assert hold.status == PartnerEarningHold.Status.ACTIVE
    assert _items_for(booked, _run("p1-quality")) == []
    body = _partner_client(booked).get("/api/v1/partner/earnings/").json()
    assert body["held_paise"] == earning.net_paise
    assert body["withdrawable_paise"] == 0
    [line] = _partner_client(booked).get("/api/v1/partner/ledger/").json()["results"]
    assert line["is_on_hold"] is True

    release_payout_hold(booking_id=booked.booking.id, note="Callback fixed it.")

    hold.refresh_from_db()
    assert hold.status == PartnerEarningHold.Status.RELEASED
    [item] = _items_for(booked, _run("p1-quality-released"))
    assert item.amount_paise == earning.net_paise


def test_a_declared_safety_concern_freezes_the_earning_with_a_completion_hold() -> None:
    booked = create_booked_group(key_prefix="p1-safety")
    _submitted_visit(booked, key="p1-safety", safety_damage=True)

    auto_finalize_completion(booking_id=booked.booking.id)

    booked.booking.refresh_from_db()
    assert booked.booking.status == Booking.Status.DISPUTED
    hold = PartnerEarningHold.objects.get(booking=booked.booking)
    assert hold.reason == PartnerEarningHold.Reason.COMPLETION_DISPUTE
    earning = PartnerLedgerEntry.objects.get(booking=booked.booking)
    assert partner_balance_paise(booked.partner)["held_paise"] == earning.net_paise


def test_a_booking_stays_frozen_until_the_last_case_on_it_closes() -> None:
    booked, earning = _earning("p1-cases")
    _verified_account(booked)
    opener = _operator()
    quality = open_case(
        kind=OperationsCase.Kind.QUALITY,
        summary="Customer says the job was rushed.",
        booking_id=booked.booking.id,
        opened_by=opener,
    )
    safety = open_case(
        kind=OperationsCase.Kind.SAFETY,
        summary="Ladder left in the hallway.",
        booking_id=booked.booking.id,
        opened_by=opener,
    )
    assert (
        PartnerEarningHold.objects.filter(
            booking=booked.booking, status=PartnerEarningHold.Status.ACTIVE
        ).count()
        == 2
    )

    resolve_case(
        case_id=quality.id,
        expected_version=quality.version,
        resolution="SETTLED",
        note="Partner revisited.",
        actor=opener,
    )

    assert _items_for(booked, _run("p1-cases-one-open")) == [], "one case still holds it"

    safety.refresh_from_db()
    resolve_case(
        case_id=safety.id,
        expected_version=safety.version,
        resolution="DOCUMENTED_NO_ACTION",
        note="Nobody was hurt.",
        actor=opener,
    )

    assert not PartnerEarningHold.objects.filter(
        booking=booked.booking, status=PartnerEarningHold.Status.ACTIVE
    ).exists()
    [item] = _items_for(booked, _run("p1-cases-closed"))
    assert item.amount_paise == earning.net_paise


def test_a_hold_is_placed_once_per_cause() -> None:
    booked, _entry_unused = _earning("p1-hold-once")

    first = place_earning_hold(
        reason=PartnerEarningHold.Reason.OPERATIONS_CASE,
        source_id="case-1",
        booking_id=booked.booking.id,
    )
    again = place_earning_hold(
        reason=PartnerEarningHold.Reason.OPERATIONS_CASE,
        source_id="case-1",
        booking_id=booked.booking.id,
    )

    assert first is not None
    assert again == first
    assert PartnerEarningHold.objects.filter(booking=booked.booking).count() == 1


# --------------------------------------------------------------------------------------------
# The last-moment check
# --------------------------------------------------------------------------------------------


@FAKE_PROVIDER
def test_a_hold_placed_after_approval_stops_the_transfer_before_it_is_sent() -> None:
    item = _reserved_item("p1-late-hold")
    place_earning_hold(
        reason=PartnerEarningHold.Reason.OPERATIONS_CASE,
        source_id=f"case-{uuid.uuid4().hex}",
        booking_id=_entry(item).booking_id,
    )

    released = submit_payout_item(item_id=item.id)

    assert released.status == PayoutBatchItem.Status.RELEASED
    assert released.failure_code == "earning_on_hold"
    assert released.provider_payout_id == "", "the transfer was sent anyway"
    assert _entry(item).status == PartnerLedgerEntry.Status.RELEASED
    assert not released.entries.filter(is_live=True).exists()


@FAKE_PROVIDER
def test_switching_payouts_off_releases_the_transfer_unsent() -> None:
    item = _reserved_item("p1-killswitch")
    engage_kill_switch(
        scope=KillSwitch.Scope.PAYOUTS, reason="Bank outage, hold everything.", actor=_operator()
    )

    released = submit_payout_item(item_id=item.id)

    assert released.status == PayoutBatchItem.Status.RELEASED
    assert released.failure_code == "payouts_paused"
    assert _entry(item).status == PartnerLedgerEntry.Status.RELEASED


@FAKE_PROVIDER
def test_a_replaced_bank_account_is_never_paid() -> None:
    item = _reserved_item("p1-replaced")
    PartnerPayoutAccount.objects.filter(id=item.payout_account_id).update(
        status=PartnerPayoutAccount.Status.REPLACED
    )

    released = submit_payout_item(item_id=item.id)

    assert released.status == PayoutBatchItem.Status.RELEASED
    assert released.failure_code == "account_not_payable"


@FAKE_PROVIDER
def test_a_suspended_partner_is_not_paid() -> None:
    item = _reserved_item("p1-suspended")
    PartnerApplication.objects.update_or_create(
        partner_id=item.partner_id, defaults={"status": PartnerApplication.Status.SUSPENDED}
    )

    released = submit_payout_item(item_id=item.id)

    assert released.status == PayoutBatchItem.Status.RELEASED
    assert released.failure_code == "partner_suspended"


# --------------------------------------------------------------------------------------------
# Reconciliation: look it up, never send it twice
# --------------------------------------------------------------------------------------------


def _unconfirmed(key: str) -> PayoutBatchItem:
    item = submit_payout_item(item_id=_reserved_item(key, reference=f"ambiguous-{key}").id)
    assert item.status == PayoutBatchItem.Status.UNDER_REVIEW
    assert item.provider_payout_id == ""
    return item


@FAKE_PROVIDER
def test_an_unconfirmed_payout_found_by_its_reference_is_settled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    item = _unconfirmed("p1-found")
    asked: list[str] = []

    def found(_self: FakePayoutProvider, *, reference: str) -> ProviderPayout:
        asked.append(reference)
        return ProviderPayout(
            provider_payout_id="pout_found",
            amount_paise=item.amount_paise,
            currency="INR",
            status="processed",
            utr="HDFCN00000000042",
        )

    monkeypatch.setattr(FakePayoutProvider, "find_payout_by_reference", found)
    sent: list[object] = []
    monkeypatch.setattr(FakePayoutProvider, "create_payout", lambda *_a, **k: sent.append(k))

    reconcile_payouts()

    item.refresh_from_db()
    assert asked == [item.id.hex]
    assert sent == [], "reconciliation sent the payout a second time"
    assert item.status == PayoutBatchItem.Status.PAID
    assert item.provider_payout_id == "pout_found"
    assert item.utr == "HDFCN00000000042"
    assert _entry(item).status == PartnerLedgerEntry.Status.PAID


@FAKE_PROVIDER
def test_an_unconfirmed_payout_still_unknown_a_day_later_returns_the_money() -> None:
    item = _unconfirmed("p1-never")
    PayoutBatchItem.objects.filter(id=item.id).update(
        submitted_at=timezone.now() - timedelta(hours=25)
    )

    reconcile_payouts()

    item.refresh_from_db()
    assert item.status == PayoutBatchItem.Status.FAILED
    assert item.failure_code == "provider_never_received"
    assert _entry(item).status == PartnerLedgerEntry.Status.RELEASED


@FAKE_PROVIDER
def test_an_unconfirmed_payout_unknown_but_recent_is_left_alone() -> None:
    item = _unconfirmed("p1-recent")

    reconcile_payouts()

    item.refresh_from_db()
    assert item.status == PayoutBatchItem.Status.UNDER_REVIEW
    assert _entry(item).status == PartnerLedgerEntry.Status.RESERVED


# --------------------------------------------------------------------------------------------
# Webhooks: once per delivery, tracking separate from decisions
# --------------------------------------------------------------------------------------------


@FAKE_PROVIDER
@override_settings(RAZORPAYX_WEBHOOK_SECRET=WEBHOOK_SECRET)
def test_a_redelivered_event_is_recorded_once_and_changes_nothing() -> None:
    item = submit_payout_item(item_id=_reserved_item("p1-redeliver").id)
    body = _event(
        "payout.processed",
        {"id": item.provider_payout_id, "amount": item.amount_paise, "status": "processed"},
    )

    first = _post(body, event_id="evt_p1_redeliver")
    second = _post(body, event_id="evt_p1_redeliver")

    assert first.status_code == second.status_code == HTTPStatus.OK
    assert first.json()["applied"] is True
    assert second.json()["applied"] is False
    record = PayoutWebhookEvent.objects.get(provider_event_id="evt_p1_redeliver")
    assert record.changed_status is True
    assert record.payout_item_id == item.id


@FAKE_PROVIDER
@override_settings(RAZORPAYX_WEBHOOK_SECRET=WEBHOOK_SECRET)
def test_payout_updated_records_tracking_without_deciding_anything() -> None:
    item = submit_payout_item(item_id=_reserved_item("p1-updated").id)
    body = _event(
        "payout.updated",
        {
            "id": item.provider_payout_id,
            "amount": item.amount_paise,
            "status": "processing",
            "utr": "HDFCN00000000077",
            "mode": "IMPS",
            "fees": 590,
            "tax": 90,
            "status_details": {"description": "Payout is being processed by the bank"},
        },
    )

    _post(body, event_id="evt_p1_updated")

    item.refresh_from_db()
    assert item.status == PayoutBatchItem.Status.SUBMITTED
    assert item.provider_status == "processing"
    assert (item.utr, item.mode, item.fees_paise, item.tax_paise) == (
        "HDFCN00000000077",
        "IMPS",
        590,
        90,
    )
    assert item.status_reason == "Payout is being processed by the bank"
    assert _entry(item).status == PartnerLedgerEntry.Status.RESERVED


@FAKE_PROVIDER
@override_settings(RAZORPAYX_WEBHOOK_SECRET=WEBHOOK_SECRET)
def test_the_webhook_log_keeps_no_bank_details() -> None:
    item = submit_payout_item(item_id=_reserved_item("p1-no-bank").id)
    account_number = "765432123456789"
    body = _event(
        "payout.processed",
        {
            "id": item.provider_payout_id,
            "amount": item.amount_paise,
            "status": "processed",
            "fund_account": {"bank_account": {"account_number": account_number}},
        },
    )

    _post(body, event_id="evt_p1_no_bank")

    record = PayoutWebhookEvent.objects.get(provider_event_id="evt_p1_no_bank")
    assert account_number not in json.dumps(record.summary)
    assert len(record.payload_sha256) == 64


def test_settling_a_visit_writes_its_clearing_time() -> None:
    booked, _entry_unused = _earning("p1-clears-at")

    earning = settle_booking_earning(booking_id=booked.booking.id)

    assert earning is not None
    assert earning.clears_at is not None
