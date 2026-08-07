"""The Partner ledger and the payout batch lifecycle.

The acceptance list names one property here explicitly — "two payout batches cannot
reserve/pay one ledger entry twice" — and it is proved twice below: once through the ordinary
command path, and once with real threads against real PostgreSQL, because a guarantee that only
holds when nobody is racing is not a guarantee about money.
"""

import itertools
import threading
import uuid
from datetime import timedelta

import pytest
from django.db import IntegrityError, connection, transaction
from django.utils import timezone

from apps.commerce.models import Booking
from apps.fulfilment.completion import OutcomeInput, confirm_completion, submit_completion
from apps.fulfilment.models import WorkOutcome, WorkTask
from apps.fulfilment.otp import operations_assisted_start
from apps.fulfilment.services import mark_arrived, mark_en_route
from apps.identity.models import User
from apps.payouts.exceptions import (
    LedgerEntryNotPayableApiError,
    PayoutBatchInvalidApiError,
    SelfApprovalDeniedApiError,
)
from apps.payouts.models import (
    PartnerLedgerEntry,
    PartnerPayoutAccount,
    PayoutBatch,
    PayoutBatchItem,
)
from apps.payouts.services import (
    approve_payout_batch,
    cancel_payout_batch,
    partner_balance_paise,
    payable_account,
    propose_payout_batch,
    register_payout_account,
    reserve_entry_for_batch,
    settle_booking_earning,
    unpayable_partner_ids,
)
from tests.fulfilment.conftest import BookedGroup, create_booked_group

pytestmark = pytest.mark.django_db(transaction=True)

_operator_sequence = itertools.count(1)
TWO = 2


def _operator() -> User:
    """A unique staff user.

    Derived from a uuid rather than a module counter: three test files create operators, each
    counter starts at 1, and running them together made two files mint the same phone number.
    """

    # Indian mobile numbers start 6-9, so the leading digit is fixed rather than random.
    return User.objects.create_user(phone_number=f"+919{uuid.uuid4().int % 10**9:09d}")


def _deliver(booked: BookedGroup, *, key: str, outcome: str = "COMPLETED") -> Booking:
    """Walk one visit to a confirmed completion so it has something to settle."""

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
    tasks = list(WorkTask.objects.filter(booking=booked.booking))
    submit_completion(
        booking_id=booked.booking.id,
        partner_id=booked.partner.id,
        notes="Done.",
        safety_damage_declared=False,
        outcomes=[
            OutcomeInput(work_task_id=task.id, outcome=outcome, quantity=task.quantity)
            for task in tasks
        ],
        expected_version=booked.booking.version,
        idempotency_key=f"{key}-submit",
    )
    booked.booking.refresh_from_db()
    confirm_completion(
        booking_id=booked.booking.id,
        customer_id=booked.customer.id,
        expected_version=booked.booking.version,
        idempotency_key=f"{key}-confirm",
    )
    booked.booking.refresh_from_db()
    return booked.booking


def _verified_account(booked: BookedGroup) -> PartnerPayoutAccount:
    account = register_payout_account(
        partner_id=booked.partner.id,
        account_last4="4321",
        ifsc="HDFC0001234",
        holder_name="Test Partner",
    )
    account.status = PartnerPayoutAccount.Status.VERIFIED
    account.verified_at = timezone.now()
    # Cooling already elapsed, so this test is about payouts rather than about waiting.
    account.effective_from = timezone.now() - timedelta(hours=1)
    account.save(update_fields=("status", "verified_at", "effective_from"))
    return account


# --------------------------------------------------------------------------------------------
# Settlement
# --------------------------------------------------------------------------------------------


def test_a_delivered_visit_earns_one_immutable_ledger_entry() -> None:
    booked = create_booked_group(key_prefix="ledger-earn")
    _deliver(booked, key="ledger-earn")

    entry = settle_booking_earning(booking_id=booked.booking.id)

    assert entry is not None
    assert entry.kind == PartnerLedgerEntry.Kind.EARNING
    assert entry.net_paise == entry.gross_paise - entry.commission_paise
    assert entry.net_paise > 0
    assert entry.calculation_snapshot["commission_basis_points"] >= 0


def test_settlement_replays_without_paying_twice() -> None:
    """Idempotent by constraint, not by a lookup that could race."""

    booked = create_booked_group(key_prefix="ledger-replay")
    _deliver(booked, key="ledger-replay")

    first = settle_booking_earning(booking_id=booked.booking.id)
    second = settle_booking_earning(booking_id=booked.booking.id)

    assert first is not None
    assert second is not None
    assert first.id == second.id
    assert PartnerLedgerEntry.objects.filter(booking=booked.booking).count() == 1


def test_a_second_earning_for_one_booking_is_refused_by_the_database() -> None:
    booked = create_booked_group(key_prefix="ledger-dupe")
    _deliver(booked, key="ledger-dupe")
    entry = settle_booking_earning(booking_id=booked.booking.id)
    assert entry is not None

    with pytest.raises(IntegrityError), transaction.atomic():
        PartnerLedgerEntry.objects.create(
            partner=booked.partner,
            booking=booked.booking,
            kind=PartnerLedgerEntry.Kind.EARNING,
            gross_paise=100,
            commission_paise=10,
            net_paise=90,
        )


def test_a_ledger_entry_cannot_be_edited() -> None:
    """A correction is a new entry. An edited ledger cannot be reconciled against the payments
    that produced it, which is the whole reason the settlement document forbids it."""

    booked = create_booked_group(key_prefix="ledger-immutable")
    _deliver(booked, key="ledger-immutable")
    entry = settle_booking_earning(booking_id=booked.booking.id)
    assert entry is not None

    entry.net_paise = 1
    with pytest.raises(ValueError, match="immutable"):
        entry.save(update_fields=("net_paise",))


def test_nothing_delivered_earns_nothing_rather_than_a_zero_line() -> None:
    booked = create_booked_group(key_prefix="ledger-nothing")
    _deliver(booked, key="ledger-nothing", outcome=WorkOutcome.Outcome.NOT_STARTED)

    entry = settle_booking_earning(booking_id=booked.booking.id)

    assert entry is None


def test_a_held_booking_earns_but_is_not_yet_payable() -> None:
    booked = create_booked_group(key_prefix="ledger-held")
    # The hold is applied before the visit settles, which is when a payout-holding case is
    # actually opened. Completing a visit now settles the earning itself, so a hold added
    # afterwards would be asserting a different scenario — money released, then held — and
    # `settle_booking_earning` would correctly return the entry it already wrote.
    Booking.objects.filter(id=booked.booking.id).update(payout_hold=True)
    _deliver(booked, key="ledger-held")
    booking = booked.booking
    booking.refresh_from_db()

    entry = settle_booking_earning(booking_id=booking.id)

    assert entry is not None
    assert entry.status == PartnerLedgerEntry.Status.PENDING


# --------------------------------------------------------------------------------------------
# Payout accounts and cooling
# --------------------------------------------------------------------------------------------


def test_a_new_account_is_not_payable_until_the_cooling_period_elapses() -> None:
    """Account takeover is the highest-value attack on a payouts system, and time is the
    cheapest defence: a delay between "the account changed" and "money left" is what gives a
    Partner room to notice."""

    booked = create_booked_group(key_prefix="cooling")
    account = register_payout_account(
        partner_id=booked.partner.id,
        account_last4="9999",
        ifsc="HDFC0001234",
        holder_name="Test Partner",
    )
    account.status = PartnerPayoutAccount.Status.VERIFIED
    account.save(update_fields=("status",))

    assert payable_account(booked.partner) is None
    assert account.effective_from > timezone.now()


def test_changing_an_account_replaces_rather_than_deletes_the_old_one() -> None:
    booked = create_booked_group(key_prefix="account-replace")
    first = register_payout_account(
        partner_id=booked.partner.id,
        account_last4="1111",
        ifsc="HDFC0001234",
        holder_name="Test Partner",
    )

    register_payout_account(
        partner_id=booked.partner.id,
        account_last4="2222",
        ifsc="HDFC0001234",
        holder_name="Test Partner",
    )

    first.refresh_from_db()
    assert first.status == PartnerPayoutAccount.Status.REPLACED
    assert PartnerPayoutAccount.objects.filter(partner=booked.partner).count() == TWO


# --------------------------------------------------------------------------------------------
# The double-pay guarantee
# --------------------------------------------------------------------------------------------


def test_two_batches_cannot_reserve_one_ledger_entry() -> None:
    booked = create_booked_group(key_prefix="reserve-twice")
    _deliver(booked, key="reserve-twice")
    _verified_account(booked)
    entry = settle_booking_earning(booking_id=booked.booking.id)
    assert entry is not None
    operator = _operator()
    first = PayoutBatch.objects.create(
        reference="batch-a",
        period_start=timezone.now() - timedelta(days=7),
        period_end=timezone.now() + timedelta(days=1),
        proposed_by=operator,
    )
    second = PayoutBatch.objects.create(
        reference="batch-b",
        period_start=timezone.now() - timedelta(days=7),
        period_end=timezone.now() + timedelta(days=1),
        proposed_by=operator,
    )

    reserve_entry_for_batch(batch=first, entry=entry)
    with pytest.raises(LedgerEntryNotPayableApiError):
        reserve_entry_for_batch(batch=second, entry=entry)

    assert PayoutBatchItem.objects.filter(ledger_entry=entry).count() == 1


def test_two_concurrent_reservations_race_and_exactly_one_wins() -> None:
    """Real threads, real connections, real PostgreSQL.

    The typed refusal above is the polite path. This is the one that matters: if the partial
    unique index were missing, both callers would read `AVAILABLE`, both would write an item,
    and a Partner would be paid twice for one visit. The index makes the loser an
    `IntegrityError` instead of a silent duplicate.
    """

    booked = create_booked_group(key_prefix="reserve-race")
    _deliver(booked, key="reserve-race")
    _verified_account(booked)
    entry = settle_booking_earning(booking_id=booked.booking.id)
    assert entry is not None
    operator = _operator()
    batches = [
        PayoutBatch.objects.create(
            reference=f"race-{index}",
            period_start=timezone.now() - timedelta(days=7),
            period_end=timezone.now() + timedelta(days=1),
            proposed_by=operator,
        )
        for index in range(2)
    ]

    start = threading.Barrier(2)
    outcomes: list[str] = []
    lock = threading.Lock()

    def attempt(batch: PayoutBatch) -> None:
        start.wait(timeout=10)
        try:
            reserve_entry_for_batch(batch=batch, entry=entry)
            result = "reserved"
        except (IntegrityError, LedgerEntryNotPayableApiError):
            result = "refused"
        finally:
            connection.close()
        with lock:
            outcomes.append(result)

    threads = [threading.Thread(target=attempt, args=(batch,)) for batch in batches]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)

    assert sorted(outcomes) == ["refused", "reserved"], outcomes
    assert PayoutBatchItem.objects.filter(ledger_entry=entry).count() == 1


def test_cancelling_a_batch_frees_its_entries_for_a_later_one() -> None:
    booked = create_booked_group(key_prefix="reserve-release")
    _deliver(booked, key="reserve-release")
    _verified_account(booked)
    entry = settle_booking_earning(booking_id=booked.booking.id)
    assert entry is not None
    proposer = _operator()
    first = PayoutBatch.objects.create(
        reference="release-a",
        status=PayoutBatch.Status.PENDING_APPROVAL,
        period_start=timezone.now() - timedelta(days=7),
        period_end=timezone.now() + timedelta(days=1),
        proposed_by=proposer,
    )
    reserve_entry_for_batch(batch=first, entry=entry)

    cancel_payout_batch(batch_id=first.id, expected_version=first.version, actor=proposer)

    entry.refresh_from_db()
    assert entry.status == PartnerLedgerEntry.Status.RELEASED
    second = PayoutBatch.objects.create(
        reference="release-b",
        period_start=timezone.now() - timedelta(days=7),
        period_end=timezone.now() + timedelta(days=1),
        proposed_by=proposer,
    )
    reserve_entry_for_batch(batch=second, entry=entry)
    assert (
        PayoutBatchItem.objects.filter(
            ledger_entry=entry, status=PayoutBatchItem.Status.RESERVED
        ).count()
        == 1
    )


# --------------------------------------------------------------------------------------------
# Maker-checker
# --------------------------------------------------------------------------------------------


def test_a_proposer_cannot_approve_their_own_batch() -> None:
    booked = create_booked_group(key_prefix="maker-checker")
    _deliver(booked, key="maker-checker")
    _verified_account(booked)
    settle_booking_earning(booking_id=booked.booking.id)
    proposer = _operator()
    batch = propose_payout_batch(
        reference="mc-1",
        period_start=timezone.now() - timedelta(days=7),
        period_end=timezone.now() + timedelta(days=1),
        actor=proposer,
    )

    with pytest.raises(SelfApprovalDeniedApiError):
        approve_payout_batch(batch_id=batch.id, expected_version=batch.version, actor=proposer)

    batch.refresh_from_db()
    assert batch.status == PayoutBatch.Status.PENDING_APPROVAL
    assert batch.approved_by is None


def test_a_different_operator_can_approve_it() -> None:
    booked = create_booked_group(key_prefix="mc-approve")
    _deliver(booked, key="mc-approve")
    _verified_account(booked)
    settle_booking_earning(booking_id=booked.booking.id)
    batch = propose_payout_batch(
        reference="mc-2",
        period_start=timezone.now() - timedelta(days=7),
        period_end=timezone.now() + timedelta(days=1),
        actor=_operator(),
    )
    checker = _operator()

    approved = approve_payout_batch(
        batch_id=batch.id, expected_version=batch.version, actor=checker
    )

    assert approved.status == PayoutBatch.Status.APPROVED
    assert approved.approved_by_id == checker.id
    assert approved.approved_at is not None


def test_self_approval_is_refused_by_the_database_as_well() -> None:
    """The service check gives a typed refusal. This proves a command that forgot to make it
    would still be stopped."""

    operator = _operator()

    with pytest.raises(IntegrityError), transaction.atomic():
        PayoutBatch.objects.create(
            reference="mc-db",
            period_start=timezone.now() - timedelta(days=7),
            period_end=timezone.now() + timedelta(days=1),
            proposed_by=operator,
            approved_by=operator,
        )


def test_an_empty_batch_cannot_be_approved() -> None:
    batch = propose_payout_batch(
        reference="mc-empty",
        period_start=timezone.now() - timedelta(days=7),
        period_end=timezone.now() + timedelta(days=1),
        actor=_operator(),
    )

    with pytest.raises(PayoutBatchInvalidApiError):
        approve_payout_batch(batch_id=batch.id, expected_version=batch.version, actor=_operator())


# --------------------------------------------------------------------------------------------
# Selection
# --------------------------------------------------------------------------------------------


def test_a_partner_with_no_payable_account_is_reported_not_silently_skipped() -> None:
    """Silently dropping them leaves a Partner wondering where their money is."""

    booked = create_booked_group(key_prefix="no-account")
    _deliver(booked, key="no-account")
    settle_booking_earning(booking_id=booked.booking.id)
    period = (timezone.now() - timedelta(days=7), timezone.now() + timedelta(days=1))

    batch = propose_payout_batch(
        reference="no-account-1",
        period_start=period[0],
        period_end=period[1],
        actor=_operator(),
    )
    unpayable = unpayable_partner_ids(period_start=period[0], period_end=period[1])

    assert batch.items.count() == 0
    assert booked.partner.id in unpayable


def test_a_held_entry_is_not_swept_into_a_batch() -> None:
    booked = create_booked_group(key_prefix="held-not-swept")
    # Held before it settles — see `test_a_held_booking_earns_but_is_not_yet_payable`.
    Booking.objects.filter(id=booked.booking.id).update(payout_hold=True)
    _deliver(booked, key="held-not-swept")
    _verified_account(booked)
    booking = booked.booking
    booking.refresh_from_db()
    settle_booking_earning(booking_id=booking.id)

    batch = propose_payout_batch(
        reference="held-1",
        period_start=timezone.now() - timedelta(days=7),
        period_end=timezone.now() + timedelta(days=1),
        actor=_operator(),
    )

    assert batch.items.count() == 0


def test_a_balance_reports_each_state_separately() -> None:
    booked = create_booked_group(key_prefix="balance")
    _deliver(booked, key="balance")
    _verified_account(booked)
    entry = settle_booking_earning(booking_id=booked.booking.id)
    assert entry is not None

    balance = partner_balance_paise(booked.partner)

    assert balance["available_paise"] == entry.net_paise
    assert balance["reserved_paise"] == 0
    assert balance["paid_paise"] == 0
