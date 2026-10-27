"""Partner withdrawals (Phase 2) and the three-step send they share with payout runs.

The rules, each pinned against the real services:

* **Full balance, one path.** A withdrawal reserves every payable entry — the same set a run would
  take — and is sent by the same `submit_payout_item`.
* **Limits.** Off until `PAYOUT_WITHDRAW_ENABLED`; ₹100 minimum; two a day; one in flight; one free
  a week and extras refused until a fee is set.
* **A person for the exceptions.** The first payout to a bank account and a balance above the
  maximum wait for Operations; everything else is approved by policy.
* **Failed means restored.** A failed, declined or reversed withdrawal puts every line back,
  fee included, and does not count against a limit.
* **The provider call holds no lock.** Claimed and committed first, answered after; a webhook
  that arrives in between wins; a send that died mid-call is looked up, never re-sent.
"""

import uuid
from datetime import datetime, timedelta
from http import HTTPStatus
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from django.db import connection
from django.test import override_settings
from django.utils import timezone
from freezegun import freeze_time

from apps.foundation.models import OutboxEvent
from apps.partners.models import PartnerProfile
from apps.payouts.exceptions import (
    PayoutBatchInvalidApiError,
    SelfApprovalDeniedApiError,
    WithdrawalRefusedApiError,
)
from apps.payouts.models import (
    PartnerEarningHold,
    PartnerLedgerEntry,
    PartnerPayoutAccount,
    PayoutBatch,
    PayoutBatchItem,
)
from apps.payouts.providers import FakePayoutProvider, ProviderPayout
from apps.payouts.selectors import partner_balance, payable_entries
from apps.payouts.services import (
    REVIEW_FIRST_PAYOUT_TO_ACCOUNT,
    REVIEW_OVER_MAXIMUM,
    _withdrawal_windows,
    apply_payout_result,
    approve_payout_batch,
    approve_withdrawal,
    cancel_payout_batch,
    decline_withdrawal,
    hold_ledger_entries,
    quote_withdrawal,
    record_adjustment,
    release_hold_for_source,
    request_withdrawal,
    submit_payout_item,
    unsent_payout_item_ids,
)
from apps.payouts.tasks import reconcile_payouts
from tests.payouts.test_ledger_and_payout import _operator
from tests.payouts.test_payout_accounts import _operations, _partner

pytestmark = pytest.mark.django_db(transaction=True)

WITHDRAWALS_ON = override_settings(
    PAYOUT_WITHDRAW_ENABLED=True,
    PAYOUT_PROVIDER="fake",
    PAYOUTS_ALLOW_FAKE_PROVIDER=True,
    PAYOUT_ACCOUNT_COOLING_HOURS=24,
)
WITH_FEE = override_settings(PAYOUT_EXTRA_WITHDRAWAL_FEE_PAISE=1_000)
#: Wednesday 11:30 India time: well inside one day and one week, so the limits are not split by
#: a midnight the test happened to run across. `tick` keeps `created_at` ordering real.
MIDWEEK = freeze_time("2026-10-28T06:00:00Z", tick=True)
WITHDRAWALS_URL = "/api/v1/partner/withdrawals/"


def _credit(partner: PartnerProfile, paise: int) -> PartnerLedgerEntry:
    """Cleared money owed to the Partner — an adjustment, payable at once, never on hold."""

    return record_adjustment(
        partner_id=partner.id,
        corrects_id=None,
        net_paise=paise,
        reason="test credit",
        actor=None,
        idempotency_key=f"credit:{uuid.uuid4()}",
    )


def _account(
    partner: PartnerProfile, *, paid_before: bool = True, cooling: bool = False
) -> PartnerPayoutAccount:
    now = timezone.now()
    account = PartnerPayoutAccount.objects.create(
        partner=partner,
        status=PartnerPayoutAccount.Status.VERIFIED,
        provider_fund_account_id="fa_test",
        account_last4="9012",
        holder_name="Ravi Kumar",
        verified_at=now,
        effective_from=now + timedelta(hours=1) if cooling else now - timedelta(hours=1),
    )
    if paid_before:
        # A payout this account has already received, so the next one is not its first.
        batch = PayoutBatch.objects.create(
            reference=f"earlier-{uuid.uuid4().hex[:8]}",
            status=PayoutBatch.Status.PAID,
            period_start=now - timedelta(days=14),
            period_end=now - timedelta(days=7),
            proposed_by=_operator(),
        )
        PayoutBatchItem.objects.create(
            batch=batch,
            partner=partner,
            payout_account=account,
            status=PayoutBatchItem.Status.PAID,
            amount_paise=10_000,
            idempotency_key=str(uuid.uuid4()),
        )
    return account


def _ready_partner(
    paise: int = 450_000, *, paid_before: bool = True
) -> tuple[Any, PartnerProfile, PartnerLedgerEntry]:
    client, partner = _partner()
    _account(partner, paid_before=paid_before)
    return client, partner, _credit(partner, paise)


def _refusal(partner: PartnerProfile) -> str:
    with pytest.raises(WithdrawalRefusedApiError) as caught:
        request_withdrawal(partner=partner, actor=partner.user)
    return str(caught.value.api_details["reason"])


def _paid(item: PayoutBatchItem) -> PayoutBatchItem:
    return apply_payout_result(item_id=item.id, status="processed")


# --------------------------------------------------------------------------------------------
# Switched off, and the basic path
# --------------------------------------------------------------------------------------------


@override_settings(PAYOUT_WITHDRAW_ENABLED=False)
def test_withdrawals_are_refused_while_switched_off() -> None:
    _, partner, _ = _ready_partner()

    assert _refusal(partner) == "withdrawals_disabled"
    assert not PayoutBatchItem.objects.filter(partner=partner, is_withdrawal=True).exists()


@WITHDRAWALS_ON
def test_a_withdrawal_takes_the_whole_balance_and_is_sent_by_policy() -> None:
    _, partner, first = _ready_partner(300_000)
    second = _credit(partner, 150_000)

    item = request_withdrawal(partner=partner, actor=partner.user)

    item.refresh_from_db()
    batch = item.batch
    assert batch.kind == PayoutBatch.Kind.WITHDRAWAL
    assert batch.approval_basis == PayoutBatch.ApprovalBasis.POLICY
    assert batch.approved_by_id is None
    assert batch.review_reasons == []
    assert item.is_withdrawal
    assert item.amount_paise == 450_000
    # Queued through the outbox and sent once the request committed.
    assert item.status == PayoutBatchItem.Status.SUBMITTED
    for entry in (first, second):
        entry.refresh_from_db()
        assert entry.status == PartnerLedgerEntry.Status.RESERVED
    balance = partner_balance(partner_id=partner.id, now=timezone.now())
    assert balance.available_paise == 0
    assert balance.reserved_paise == 450_000


@WITHDRAWALS_ON
def test_paid_settles_every_line_of_the_withdrawal() -> None:
    _, partner, entry = _ready_partner()
    item = request_withdrawal(partner=partner, actor=partner.user)

    _paid(item)

    entry.refresh_from_db()
    assert entry.status == PartnerLedgerEntry.Status.PAID
    assert PayoutBatch.objects.get(id=item.batch_id).status == PayoutBatch.Status.PAID


# --------------------------------------------------------------------------------------------
# Refusals
# --------------------------------------------------------------------------------------------


@WITHDRAWALS_ON
def test_a_balance_under_the_minimum_is_refused() -> None:
    _, partner, _ = _ready_partner(9_999)

    assert _refusal(partner) == "below_minimum"


@WITHDRAWALS_ON
def test_no_bank_account_is_refused_with_the_next_step() -> None:
    _, partner = _partner()
    _credit(partner, 450_000)

    assert _refusal(partner) == "no_payout_account"


@WITHDRAWALS_ON
def test_a_new_bank_account_waits_out_its_cooling_period() -> None:
    _, partner = _partner()
    _account(partner, paid_before=False, cooling=True)
    _credit(partner, 450_000)

    assert _refusal(partner) == "account_cooling"


@WITHDRAWALS_ON
def test_only_one_withdrawal_is_in_flight_at_a_time() -> None:
    _, partner, _ = _ready_partner()
    request_withdrawal(partner=partner, actor=partner.user)
    _credit(partner, 200_000)

    assert _refusal(partner) == "withdrawal_in_progress"


@WITHDRAWALS_ON
@MIDWEEK
def test_an_extra_withdrawal_is_refused_until_someone_sets_its_fee() -> None:
    """One free a week; the price of the next is an owner decision, not a default made up here."""

    _, partner, _ = _ready_partner()
    _paid(request_withdrawal(partner=partner, actor=partner.user))
    _credit(partner, 200_000)

    assert _refusal(partner) == "extra_withdrawals_unavailable"


@WITHDRAWALS_ON
@WITH_FEE
@MIDWEEK
def test_an_extra_withdrawal_carries_its_fee_as_a_line_of_the_transfer() -> None:
    _, partner, _ = _ready_partner()
    _paid(request_withdrawal(partner=partner, actor=partner.user))
    _credit(partner, 200_000)

    item = request_withdrawal(partner=partner, actor=partner.user)

    assert item.amount_paise == 199_000
    fee = PartnerLedgerEntry.objects.get(partner=partner, kind=PartnerLedgerEntry.Kind.FEE)
    assert fee.net_paise == -1_000
    assert fee.status == PartnerLedgerEntry.Status.RESERVED
    assert sum(line.amount_paise for line in item.entries.all()) == item.amount_paise


@WITHDRAWALS_ON
@WITH_FEE
@MIDWEEK
def test_two_withdrawals_a_day_and_no_more() -> None:
    _, partner, _ = _ready_partner()
    _paid(request_withdrawal(partner=partner, actor=partner.user))
    _credit(partner, 200_000)
    _paid(request_withdrawal(partner=partner, actor=partner.user))
    _credit(partner, 200_000)

    assert _refusal(partner) == "daily_limit_reached"


def test_the_limits_count_in_india_time_from_monday() -> None:
    # Sunday 23:30 India time is still the week that began the Monday before.
    sunday_night = datetime(2026, 11, 1, 18, 0, tzinfo=ZoneInfo("UTC"))

    day, week = _withdrawal_windows(sunday_night)

    india = ZoneInfo("Asia/Kolkata")
    assert day == datetime(2026, 11, 1, tzinfo=india)
    assert week == datetime(2026, 10, 26, tzinfo=india)


# --------------------------------------------------------------------------------------------
# Failure restores the balance
# --------------------------------------------------------------------------------------------


@WITHDRAWALS_ON
@WITH_FEE
@MIDWEEK
def test_a_failed_withdrawal_restores_the_balance_and_gives_the_fee_back() -> None:
    _, partner, _ = _ready_partner()
    _paid(request_withdrawal(partner=partner, actor=partner.user))
    _credit(partner, 200_000)
    item = request_withdrawal(partner=partner, actor=partner.user)

    apply_payout_result(item_id=item.id, status="failed", failure_reason="Beneficiary bank offline")

    item.refresh_from_db()
    assert item.status == PayoutBatchItem.Status.FAILED
    fee = PartnerLedgerEntry.objects.get(partner=partner, kind=PartnerLedgerEntry.Kind.FEE)
    refund = PartnerLedgerEntry.objects.get(corrects=fee)
    assert refund.net_paise == 1_000
    # The whole ₹2,000 is back: the credit, the fee and its refund cancel out to it.
    assert partner_balance(partner_id=partner.id, now=timezone.now()).available_paise == 200_000
    # And the failure did not use up today's second withdrawal.
    assert quote_withdrawal(partner=partner).withdrawals_left_today == 1


@WITHDRAWALS_ON
@WITH_FEE
@MIDWEEK
def test_a_repeated_failure_report_gives_the_fee_back_once() -> None:
    _, partner, _ = _ready_partner()
    _paid(request_withdrawal(partner=partner, actor=partner.user))
    _credit(partner, 200_000)
    item = request_withdrawal(partner=partner, actor=partner.user)

    apply_payout_result(item_id=item.id, status="failed")
    apply_payout_result(item_id=item.id, status="failed")

    fee = PartnerLedgerEntry.objects.get(partner=partner, kind=PartnerLedgerEntry.Kind.FEE)
    assert PartnerLedgerEntry.objects.filter(corrects=fee).count() == 1


# --------------------------------------------------------------------------------------------
# The Operations queue
# --------------------------------------------------------------------------------------------


@WITHDRAWALS_ON
def test_the_first_payout_to_a_bank_account_waits_for_operations() -> None:
    _, partner, entry = _ready_partner(paid_before=False)

    item = request_withdrawal(partner=partner, actor=partner.user)

    batch = PayoutBatch.objects.get(id=item.batch_id)
    assert batch.status == PayoutBatch.Status.PENDING_APPROVAL
    assert batch.review_reasons == [REVIEW_FIRST_PAYOUT_TO_ACCOUNT]
    item.refresh_from_db()
    assert item.status == PayoutBatchItem.Status.RESERVED
    assert not OutboxEvent.objects.filter(aggregate_id=item.id).exists()
    entry.refresh_from_db()
    # Set aside, so nothing else can take it while it waits.
    assert entry.status == PartnerLedgerEntry.Status.RESERVED

    approved = approve_withdrawal(
        batch_id=batch.id, expected_version=batch.version, actor=_operator()
    )

    assert approved.approval_basis == PayoutBatch.ApprovalBasis.OPERATIONS
    item.refresh_from_db()
    assert item.status == PayoutBatchItem.Status.SUBMITTED


@WITHDRAWALS_ON
@override_settings(PAYOUT_WITHDRAWAL_MAX_PAISE=200_000)
def test_a_balance_over_the_maximum_goes_to_a_person_rather_than_being_split() -> None:
    _, partner, _ = _ready_partner(450_000)

    item = request_withdrawal(partner=partner, actor=partner.user)

    assert item.amount_paise == 450_000
    assert PayoutBatch.objects.get(id=item.batch_id).review_reasons == [REVIEW_OVER_MAXIMUM]


@WITHDRAWALS_ON
def test_a_partner_cannot_approve_their_own_withdrawal() -> None:
    _, partner, _ = _ready_partner(paid_before=False)
    batch = request_withdrawal(partner=partner, actor=partner.user).batch

    with pytest.raises(SelfApprovalDeniedApiError):
        approve_withdrawal(batch_id=batch.id, expected_version=batch.version, actor=partner.user)


@WITHDRAWALS_ON
def test_declining_returns_the_money_and_tells_the_partner_why() -> None:
    _, partner, entry = _ready_partner(paid_before=False)
    item = request_withdrawal(partner=partner, actor=partner.user)
    batch = item.batch

    with pytest.raises(PayoutBatchInvalidApiError):
        decline_withdrawal(
            batch_id=batch.id, expected_version=batch.version, actor=_operator(), reason="no"
        )
    declined = decline_withdrawal(
        batch_id=batch.id,
        expected_version=batch.version,
        actor=_operator(),
        reason="Please call support to confirm this bank account.",
    )

    assert declined.status == PayoutBatch.Status.CANCELLED
    assert declined.review_note == "Please call support to confirm this bank account."
    item.refresh_from_db()
    assert item.status == PayoutBatchItem.Status.RELEASED
    assert item.failure_code == "declined_by_operations"
    entry.refresh_from_db()
    assert entry.status == PartnerLedgerEntry.Status.RELEASED
    # The money is withdrawable again, and the decline did not use up a withdrawal.
    assert quote_withdrawal(partner=partner).refusal == ""


@WITHDRAWALS_ON
def test_the_run_console_cannot_approve_or_cancel_a_withdrawal() -> None:
    _, partner, _ = _ready_partner(paid_before=False)
    batch = request_withdrawal(partner=partner, actor=partner.user).batch

    with pytest.raises(PayoutBatchInvalidApiError):
        approve_payout_batch(batch_id=batch.id, expected_version=batch.version, actor=_operator())
    with pytest.raises(PayoutBatchInvalidApiError):
        cancel_payout_batch(batch_id=batch.id, expected_version=batch.version, actor=_operator())


@WITHDRAWALS_ON
def test_a_hold_placed_while_a_withdrawal_waits_stops_it_at_the_moment_of_sending() -> None:
    """An M2 case freezes entries one by one. A reserved entry cannot be moved to `PENDING`, so it
    is the explicit hold the last-moment check reads that keeps the money in."""

    _, partner, entry = _ready_partner(paid_before=False)
    item = request_withdrawal(partner=partner, actor=partner.user)
    held = hold_ledger_entries(
        reason=PartnerEarningHold.Reason.OPERATIONS_CASE, source_id="case-1", entry_ids=[entry.id]
    )
    assert held == [entry.id]
    batch = PayoutBatch.objects.get(id=item.batch_id)

    approve_withdrawal(batch_id=batch.id, expected_version=batch.version, actor=_operator())

    item.refresh_from_db()
    assert item.status == PayoutBatchItem.Status.RELEASED
    assert item.failure_code == "earning_on_hold"
    assert not payable_entries(partner_id=partner.id, now=timezone.now()).exists()
    assert partner_balance(partner_id=partner.id, now=timezone.now()).held_paise == 450_000

    release_hold_for_source(reason=PartnerEarningHold.Reason.OPERATIONS_CASE, source_id="case-1")

    assert payable_entries(partner_id=partner.id, now=timezone.now()).filter(id=entry.id).exists()


def test_holding_entries_twice_under_one_cause_places_one_hold() -> None:
    _, partner = _partner()
    entry = _credit(partner, 10_000)

    hold_ledger_entries(reason="OPERATIONS_CASE", source_id="case-2", entry_ids=[entry.id])
    again = hold_ledger_entries(reason="OPERATIONS_CASE", source_id="case-2", entry_ids=[entry.id])

    assert again == []
    assert PartnerEarningHold.objects.filter(ledger_entry=entry).count() == 1


# --------------------------------------------------------------------------------------------
# The three-step send
# --------------------------------------------------------------------------------------------


def _queued_item(partner: PartnerProfile) -> PayoutBatchItem:
    """A withdrawal waiting for Operations, moved to paying without being sent."""

    item = request_withdrawal(partner=partner, actor=partner.user)
    PayoutBatch.objects.filter(id=item.batch_id).update(status=PayoutBatch.Status.PAYING)
    return item


@WITHDRAWALS_ON
def test_the_provider_is_called_after_the_claim_commits_and_with_no_transaction_open(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _, partner, _ = _ready_partner(paid_before=False)
    item = _queued_item(partner)
    seen: dict[str, object] = {}
    original = FakePayoutProvider.create_payout

    def watching(self: FakePayoutProvider, **kwargs: Any) -> ProviderPayout:
        seen["in_transaction"] = connection.in_atomic_block
        seen["status"] = PayoutBatchItem.objects.get(id=item.id).status
        return original(self, **kwargs)

    monkeypatch.setattr(FakePayoutProvider, "create_payout", watching)

    submit_payout_item(item_id=item.id)

    assert seen == {"in_transaction": False, "status": PayoutBatchItem.Status.SUBMITTING}
    item.refresh_from_db()
    assert item.status == PayoutBatchItem.Status.SUBMITTED


@WITHDRAWALS_ON
def test_a_webhook_that_beats_the_create_response_is_not_overwritten(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _, partner, entry = _ready_partner(paid_before=False)
    item = _queued_item(partner)

    def settled_first(self: FakePayoutProvider, **kwargs: Any) -> ProviderPayout:  # noqa: ARG001
        apply_payout_result(item_id=item.id, status="processed")
        return ProviderPayout(
            provider_payout_id="pout_early",
            amount_paise=kwargs["amount_paise"],
            currency="INR",
            status="processing",
        )

    monkeypatch.setattr(FakePayoutProvider, "create_payout", settled_first)

    submit_payout_item(item_id=item.id)

    item.refresh_from_db()
    assert item.status == PayoutBatchItem.Status.PAID
    assert item.provider_payout_id == "pout_early"
    assert item.provider_status == "processed"
    entry.refresh_from_db()
    assert entry.status == PartnerLedgerEntry.Status.PAID


@WITHDRAWALS_ON
def test_a_claimed_item_is_never_sent_twice(monkeypatch: pytest.MonkeyPatch) -> None:
    _, partner, _ = _ready_partner(paid_before=False)
    item = _queued_item(partner)
    calls: list[str] = []
    original = FakePayoutProvider.create_payout

    def counting(self: FakePayoutProvider, **kwargs: Any) -> ProviderPayout:
        calls.append(kwargs["reference"])
        return original(self, **kwargs)

    monkeypatch.setattr(FakePayoutProvider, "create_payout", counting)

    submit_payout_item(item_id=item.id)
    submit_payout_item(item_id=item.id)

    assert calls == [item.id.hex]


@WITHDRAWALS_ON
def test_a_send_that_died_mid_call_is_looked_up_and_never_resent(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _, partner, entry = _ready_partner(paid_before=False)
    item = _queued_item(partner)
    # The claim committed, and then the process died before recording any answer.
    PayoutBatchItem.objects.filter(id=item.id).update(
        status=PayoutBatchItem.Status.SUBMITTING,
        submitted_at=timezone.now() - timedelta(minutes=5),
    )

    def never(self: FakePayoutProvider, **kwargs: Any) -> ProviderPayout:  # noqa: ARG001
        raise AssertionError("A send with an unknown outcome must never be repeated.")

    monkeypatch.setattr(FakePayoutProvider, "create_payout", never)

    # Fresh: possibly still mid-call, so reconciliation leaves it.
    assert reconcile_payouts() == 0
    # Stale, and the provider has no record of it: looked up and, past the release window, freed.
    PayoutBatchItem.objects.filter(id=item.id).update(
        submitted_at=timezone.now() - timedelta(hours=25)
    )
    assert reconcile_payouts() == 1

    item.refresh_from_db()
    assert item.status == PayoutBatchItem.Status.FAILED
    assert item.failure_code == "provider_never_received"
    entry.refresh_from_db()
    assert entry.status == PartnerLedgerEntry.Status.RELEASED


@WITHDRAWALS_ON
def test_only_unclaimed_items_in_a_paying_batch_are_resumed() -> None:
    _, partner, _ = _ready_partner(paid_before=False)
    item = _queued_item(partner)
    PayoutBatchItem.objects.filter(id=item.id).update(
        updated_at=timezone.now() - timedelta(minutes=10)
    )

    assert unsent_payout_item_ids(older_than=timedelta(minutes=2)) == [item.id]

    PayoutBatchItem.objects.filter(id=item.id).update(status=PayoutBatchItem.Status.SUBMITTING)
    assert unsent_payout_item_ids(older_than=timedelta(minutes=2)) == []


# --------------------------------------------------------------------------------------------
# API
# --------------------------------------------------------------------------------------------


@WITHDRAWALS_ON
def test_the_preview_says_what_a_tap_would_do() -> None:
    client, _, _ = _ready_partner(paid_before=False)

    body = client.get(f"{WITHDRAWALS_URL}preview/").json()

    assert body["is_enabled"] is True
    assert body["can_withdraw"] is True
    assert body["amount_paise"] == 450_000
    assert body["fee_paise"] == 0
    assert body["send_paise"] == 450_000
    assert body["needs_review"] is True
    assert body["review_reasons"] == [REVIEW_FIRST_PAYOUT_TO_ACCOUNT]
    assert body["account_last4"] == "9012"


@override_settings(PAYOUT_WITHDRAW_ENABLED=False)
def test_the_preview_says_withdrawals_are_off() -> None:
    client, _, _ = _ready_partner()

    body = client.get(f"{WITHDRAWALS_URL}preview/").json()

    assert body["is_enabled"] is False
    assert body["can_withdraw"] is False
    assert body["refusal_reason"] == "withdrawals_disabled"


@WITHDRAWALS_ON
def test_a_withdraw_tap_needs_an_idempotency_key_and_replays_on_retry() -> None:
    client, partner, _ = _ready_partner(paid_before=False)

    assert client.post(WITHDRAWALS_URL).status_code == HTTPStatus.BAD_REQUEST

    first = client.post(WITHDRAWALS_URL, HTTP_IDEMPOTENCY_KEY="tap-1")
    again = client.post(WITHDRAWALS_URL, HTTP_IDEMPOTENCY_KEY="tap-1")

    assert first.status_code == HTTPStatus.CREATED
    body = first.json()
    assert body["status"] == "REQUESTED"
    assert body["is_awaiting_review"] is True
    assert body["balance_paise"] == 450_000
    assert body["account_last4"] == "9012"
    assert again.json()["id"] == body["id"]
    assert PayoutBatchItem.objects.filter(partner=partner, is_withdrawal=True).count() == 1


@WITHDRAWALS_ON
def test_a_refused_tap_says_why_in_words_for_the_partner() -> None:
    client, _, _ = _ready_partner(5_000)

    response = client.post(WITHDRAWALS_URL, HTTP_IDEMPOTENCY_KEY="tap-low")

    assert response.status_code == HTTPStatus.CONFLICT
    error = response.json()["error"]
    assert error["code"] == "withdrawal_refused"
    assert error["details"] == {"reason": "below_minimum"}
    assert "₹100" in error["message"]


@WITHDRAWALS_ON
def test_a_failed_withdrawal_reads_as_failed_with_the_money_back() -> None:
    client, partner, _ = _ready_partner()
    item = request_withdrawal(partner=partner, actor=partner.user)
    apply_payout_result(item_id=item.id, status="failed")

    row = client.get(WITHDRAWALS_URL).json()["results"][0]

    assert row["status"] == "FAILED"
    assert "back in your balance" in row["failure_message"]


@WITHDRAWALS_ON
def test_the_operations_queue_lists_withdrawals_waiting_and_approval_needs_a_step_up() -> None:
    _, partner, _ = _ready_partner(paid_before=False)
    batch = request_withdrawal(partner=partner, actor=partner.user).batch
    plain, _ = _operations(stepped_up=False)
    stepped, _ = _operations(stepped_up=True)

    queue = plain.get("/api/v1/operations/withdrawals/").json()["results"]
    assert [row["id"] for row in queue] == [str(batch.id)]
    assert queue[0]["transfer"]["account_holder_name"] == "Ravi Kumar"
    assert queue[0]["review_reasons"] == [REVIEW_FIRST_PAYOUT_TO_ACCOUNT]

    url = f"/api/v1/operations/withdrawals/{batch.id}/approve/"
    refused = plain.post(
        url, {"expected_version": batch.version}, format="json", HTTP_IDEMPOTENCY_KEY="ok-1"
    )
    assert refused.status_code in (HTTPStatus.UNAUTHORIZED, HTTPStatus.FORBIDDEN)

    approved = stepped.post(
        url, {"expected_version": batch.version}, format="json", HTTP_IDEMPOTENCY_KEY="ok-2"
    )
    assert approved.status_code == HTTPStatus.OK
    assert approved.json()["approval_basis"] == PayoutBatch.ApprovalBasis.OPERATIONS


@WITHDRAWALS_ON
def test_the_run_list_can_leave_withdrawals_out() -> None:
    # `_ready_partner` leaves one earlier run paid into the account; the withdrawal is the other.
    _, partner, _ = _ready_partner()
    request_withdrawal(partner=partner, actor=partner.user)
    client, _ = _operations(stepped_up=False)

    runs = client.get("/api/v1/operations/payout-batches/", {"kind": "RUN"}).json()["results"]

    assert [row["kind"] for row in runs] == [PayoutBatch.Kind.RUN]
    assert client.get("/api/v1/operations/payout-batches/", {"kind": "NOPE"}).status_code == (
        HTTPStatus.BAD_REQUEST
    )
