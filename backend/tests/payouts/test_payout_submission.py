"""Submitting a payout, and what happens when the provider is not clear about it.

The three outcomes are deliberately asymmetric, and the asymmetry is the point. A rejection
releases the money back to the pool; an *ambiguous* result does not, because the payout may have
gone out and releasing it is precisely how a Partner gets paid twice.
"""

import itertools
import uuid
from datetime import timedelta

import pytest
from django.test import override_settings
from django.utils import timezone

from apps.foundation.models import OutboxEvent
from apps.identity.models import User
from apps.payouts.models import (
    PartnerLedgerEntry,
    PartnerPayoutAccount,
    PayoutBatch,
    PayoutBatchItem,
)
from apps.payouts.providers import PayoutProviderError, get_payout_provider
from apps.payouts.services import (
    apply_payout_result,
    reserve_entry_for_batch,
    settle_booking_earning,
    start_paying_batch,
    submit_payout_item,
)
from tests.fulfilment.conftest import create_booked_group
from tests.payouts.test_ledger_and_payout import _deliver

pytestmark = [
    pytest.mark.django_db(transaction=True),
    # Reaches en route and arrival through shared helpers for a visit booked for tomorrow; the
    # clock gates on those steps are tested in tests/fulfilment/test_partner_time_gates.py.
    pytest.mark.usefixtures("partner_gates_open"),
]

_sequence = itertools.count(1)


def _operator() -> User:
    """A unique staff user.

    Derived from a uuid rather than a module counter: three test files create operators, each
    counter starts at 1, and running them together made two files mint the same phone number.
    """

    # Indian mobile numbers start 6-9, so the leading digit is fixed rather than random.
    return User.objects.create_user(phone_number=f"+919{uuid.uuid4().int % 10**9:09d}")


def _reserved_item(key: str, *, reference: str | None = None) -> PayoutBatchItem:
    """Reserve one item, optionally naming the batch so the fake provider's outcome can be
    selected. `submit_payout_item` hands the provider the batch reference alongside the payout,
    so a batch called `ambiguous-…` drives the ambiguous branch through the real service rather
    than around it."""

    booked = create_booked_group(key_prefix=key)
    _deliver(booked, key=key)
    account = PartnerPayoutAccount.objects.create(
        partner=booked.partner,
        status=PartnerPayoutAccount.Status.VERIFIED,
        provider_fund_account_id="fa_test",
        account_last4="4321",
        holder_name="Test Partner",
        verified_at=timezone.now(),
        effective_from=timezone.now() - timedelta(hours=1),
    )
    assert account.pk
    entry = settle_booking_earning(booking_id=booked.booking.id)
    assert entry is not None
    batch = PayoutBatch.objects.create(
        reference=reference or f"submit-{key}",
        status=PayoutBatch.Status.APPROVED,
        period_start=timezone.now() - timedelta(days=7),
        period_end=timezone.now() + timedelta(days=1),
        proposed_by=_operator(),
        approved_by=_operator(),
        approved_at=timezone.now(),
    )
    return reserve_entry_for_batch(batch=batch, entry=entry)


def _entry(item: PayoutBatchItem) -> PartnerLedgerEntry:
    """The one ledger entry `_reserved_item` puts in its transfer."""

    return PartnerLedgerEntry.objects.get(payout_lines__item=item)


# --------------------------------------------------------------------------------------------
# Provider selection fails closed
# --------------------------------------------------------------------------------------------


@override_settings(DEBUG=False, PAYOUTS_ALLOW_FAKE_PROVIDER=False, PAYOUT_PROVIDER="fake")
def test_the_fake_provider_is_refused_outside_development() -> None:
    with pytest.raises(PayoutProviderError):
        get_payout_provider()


@override_settings(
    PAYOUT_PROVIDER="razorpayx",
    RAZORPAYX_KEY_ID="key",
    RAZORPAYX_KEY_SECRET="secret",  # noqa: S106 - a literal for a settings override, not a credential
    PAYOUTS_LIVE_ENABLED=False,
)
def test_credentials_alone_do_not_enable_live_payouts() -> None:
    """A deployment that merely has keys has not decided to start paying people.

    Stricter than the collections check on purpose: a wrong capture can be refunded, a wrong
    payout has left.
    """

    with pytest.raises(PayoutProviderError, match="not enabled"):
        get_payout_provider()


@override_settings(PAYOUT_PROVIDER="razorpayx", RAZORPAYX_KEY_ID="", PAYOUTS_LIVE_ENABLED=True)
def test_live_payouts_without_credentials_are_refused() -> None:
    with pytest.raises(PayoutProviderError, match="credentials"):
        get_payout_provider()


@override_settings(PAYOUT_PROVIDER="unconfigured")
def test_an_unconfigured_environment_pays_nobody() -> None:
    with pytest.raises(PayoutProviderError):
        get_payout_provider()


# --------------------------------------------------------------------------------------------
# Submission outcomes
# --------------------------------------------------------------------------------------------


@override_settings(PAYOUT_PROVIDER="fake", PAYOUTS_ALLOW_FAKE_PROVIDER=True)
def test_an_accepted_payout_is_submitted_and_keeps_its_reservation() -> None:
    item = _reserved_item("submit-ok")

    submitted = submit_payout_item(item_id=item.id)

    assert submitted.status == PayoutBatchItem.Status.SUBMITTED
    assert submitted.provider_payout_id
    entry = _entry(item)
    assert entry.status == PartnerLedgerEntry.Status.RESERVED


@override_settings(PAYOUT_PROVIDER="fake", PAYOUTS_ALLOW_FAKE_PROVIDER=True)
def test_a_rejected_payout_releases_the_money_back_to_the_pool() -> None:
    """An explicit rejection is the one outcome that tells us no money moved, so the entry is
    safe to hand to a later batch."""

    item = _reserved_item("reject-path", reference="reject-batch-1")

    failed = submit_payout_item(item_id=item.id)

    assert failed.status == PayoutBatchItem.Status.FAILED
    assert failed.failure_code == "provider_rejected"
    entry = _entry(item)
    assert entry.status == PartnerLedgerEntry.Status.RELEASED


@override_settings(PAYOUT_PROVIDER="fake", PAYOUTS_ALLOW_FAKE_PROVIDER=True)
def test_an_ambiguous_payout_parks_under_review_and_keeps_the_reservation() -> None:
    """The most important test in this file.

    If an ambiguous result released the entry, the first attempt could land late while the entry
    already sat in a second batch, and the Partner would be paid twice for one visit. Parking it
    for Finance is slower and correct.
    """

    item = _reserved_item("ambiguous-path", reference="ambiguous-batch-1")

    parked = submit_payout_item(item_id=item.id)

    assert parked.status == PayoutBatchItem.Status.UNDER_REVIEW
    assert parked.failure_code == "provider_ambiguous"
    entry = _entry(item)
    assert entry.status == PartnerLedgerEntry.Status.RESERVED, (
        "an ambiguous payout released money it may already have sent"
    )


@override_settings(PAYOUT_PROVIDER="fake", PAYOUTS_ALLOW_FAKE_PROVIDER=True)
def test_submitting_twice_sends_one_payout() -> None:
    item = _reserved_item("submit-once")

    first = submit_payout_item(item_id=item.id)
    second = submit_payout_item(item_id=item.id)

    assert first.provider_payout_id == second.provider_payout_id
    assert second.status == PayoutBatchItem.Status.SUBMITTED


# --------------------------------------------------------------------------------------------
# Settlement
# --------------------------------------------------------------------------------------------


@override_settings(PAYOUT_PROVIDER="fake", PAYOUTS_ALLOW_FAKE_PROVIDER=True)
def test_a_processed_result_pays_the_entry_and_settles_the_batch() -> None:
    item = _reserved_item("settle-paid")
    submit_payout_item(item_id=item.id)

    settled = apply_payout_result(item_id=item.id, status="processed")

    assert settled.status == PayoutBatchItem.Status.PAID
    entry = _entry(item)
    assert entry.status == PartnerLedgerEntry.Status.PAID
    batch = PayoutBatch.objects.get(id=item.batch_id)
    assert batch.status == PayoutBatch.Status.PAID


@override_settings(PAYOUT_PROVIDER="fake", PAYOUTS_ALLOW_FAKE_PROVIDER=True)
def test_a_reversed_result_releases_the_entry_for_a_later_batch() -> None:
    item = _reserved_item("settle-reversed")
    submit_payout_item(item_id=item.id)

    settled = apply_payout_result(item_id=item.id, status="reversed", failure_reason="bad_account")

    assert settled.status == PayoutBatchItem.Status.REVERSED
    assert settled.failure_code == "bad_account"
    entry = _entry(item)
    assert entry.status == PartnerLedgerEntry.Status.RELEASED


@override_settings(PAYOUT_PROVIDER="fake", PAYOUTS_ALLOW_FAKE_PROVIDER=True)
def test_duplicates_and_stale_statuses_never_un_pay_anybody() -> None:
    """Providers resend, and they resend out of order. A second `processed`, or a `queued`
    delivered after `processed`, must not move a paid transfer anywhere."""

    item = _reserved_item("settle-monotonic")
    submit_payout_item(item_id=item.id)
    apply_payout_result(item_id=item.id, status="processed")

    apply_payout_result(item_id=item.id, status="processed")
    apply_payout_result(item_id=item.id, status="queued")
    apply_payout_result(item_id=item.id, status="processing")

    item.refresh_from_db()
    assert item.status == PayoutBatchItem.Status.PAID
    assert item.provider_status == "processed", "tracking moved backwards"
    assert _entry(item).status == PartnerLedgerEntry.Status.PAID


@override_settings(PAYOUT_PROVIDER="fake", PAYOUTS_ALLOW_FAKE_PROVIDER=True)
def test_a_payout_reversed_after_it_was_paid_returns_the_money_exactly_once() -> None:
    """RazorpayX lets a bank return a processed payout up to T+3 working days later. The money is
    back in the Partner's balance, once, however often the reversal is reported, and a
    `processed` arriving after it is a late copy of an earlier state that changes nothing."""

    item = _reserved_item("settle-reversal")
    submit_payout_item(item_id=item.id)
    apply_payout_result(item_id=item.id, status="processed")

    apply_payout_result(item_id=item.id, status="reversed", failure_reason="account_closed")
    apply_payout_result(item_id=item.id, status="reversed")
    apply_payout_result(item_id=item.id, status="processed")

    item.refresh_from_db()
    assert item.status == PayoutBatchItem.Status.REVERSED
    assert item.failure_code == "account_closed"
    entry = _entry(item)
    assert entry.status == PartnerLedgerEntry.Status.RELEASED
    assert not item.entries.filter(is_live=True).exists()
    # Back in the pool exactly once: a later batch can reserve it again, for the same amount.
    later = PayoutBatch.objects.create(
        reference="settle-reversal-later",
        status=PayoutBatch.Status.APPROVED,
        period_start=timezone.now() - timedelta(days=7),
        period_end=timezone.now() + timedelta(days=1),
        proposed_by=_operator(),
        approved_by=_operator(),
        approved_at=timezone.now(),
    )
    again = reserve_entry_for_batch(batch=later, entry=entry)
    assert again.amount_paise == entry.net_paise


@override_settings(PAYOUT_PROVIDER="fake", PAYOUTS_ALLOW_FAKE_PROVIDER=True)
def test_a_failed_payout_stays_failed_whatever_arrives_later() -> None:
    item = _reserved_item("settle-failed-final")
    submit_payout_item(item_id=item.id)
    apply_payout_result(item_id=item.id, status="failed", failure_reason="invalid_ifsc")

    apply_payout_result(item_id=item.id, status="processed")

    item.refresh_from_db()
    assert item.status == PayoutBatchItem.Status.FAILED
    assert _entry(item).status == PartnerLedgerEntry.Status.RELEASED


@override_settings(PAYOUT_PROVIDER="fake", PAYOUTS_ALLOW_FAKE_PROVIDER=True)
def test_an_in_flight_status_settles_nothing() -> None:
    item = _reserved_item("settle-inflight")
    submit_payout_item(item_id=item.id)

    unchanged = apply_payout_result(item_id=item.id, status="queued")

    assert unchanged.status == PayoutBatchItem.Status.SUBMITTED
    entry = _entry(item)
    assert entry.status == PartnerLedgerEntry.Status.RESERVED


@override_settings(PAYOUT_PROVIDER="fake", PAYOUTS_ALLOW_FAKE_PROVIDER=True)
def test_starting_payment_requires_an_approved_batch_and_emits_one_event_per_item() -> None:
    item = _reserved_item("start-paying")
    batch = PayoutBatch.objects.get(id=item.batch_id)

    started = start_paying_batch(batch_id=batch.id, expected_version=batch.version)

    assert started.status == PayoutBatch.Status.PAYING
    assert (
        OutboxEvent.objects.filter(
            event_type="payout.submission_requested", aggregate_id=item.id
        ).count()
        == 1
    )
