"""One-person payouts, the review before acting, and the append-only audit log.

- A proposer may approve their own run, recorded as `SELF`; nobody approves or sends money to
  their own Partner account.
- `preview_payout_batch` reports exactly what Pay would send and skip, and changes nothing.
- Every state change writes one `PayoutAuditEvent` in the same transaction; a refused action
  writes none; PostgreSQL refuses UPDATE and DELETE on the log.
"""

from datetime import timedelta

import pytest
from django.db import DatabaseError, connection, transaction
from django.test import override_settings
from django.utils import timezone

from apps.identity.models import User
from apps.payouts.exceptions import (
    PayoutBatchConflictApiError,
    SelfApprovalDeniedApiError,
    SelfPaymentDeniedApiError,
)
from apps.payouts.models import (
    PartnerLedgerEntry,
    PartnerPayoutAccount,
    PayoutAuditEvent,
    PayoutBatch,
    PayoutBatchItem,
)
from apps.payouts.services import (
    approve_payout_batch,
    approve_withdrawal,
    cancel_payout_batch,
    decline_withdrawal,
    preview_payout_batch,
    propose_payout_batch,
    request_withdrawal,
    settle_booking_earning,
    start_paying_batch,
    submit_payout_item,
)
from tests.fulfilment.conftest import create_booked_group
from tests.payouts.test_ledger_and_payout import _deliver, _operator, _verified_account
from tests.payouts.test_payout_submission import _reserved_item
from tests.payouts.test_withdrawals import WITHDRAWALS_ON, _ready_partner

pytestmark = [
    pytest.mark.django_db(transaction=True),
    pytest.mark.usefixtures("partner_gates_open"),
]

FAKE = override_settings(PAYOUT_PROVIDER="fake", PAYOUTS_ALLOW_FAKE_PROVIDER=True)


def _proposed_run(key: str) -> tuple[PayoutBatch, User]:
    booked = create_booked_group(key_prefix=key)
    _deliver(booked, key=key)
    _verified_account(booked)
    settle_booking_earning(booking_id=booked.booking.id)
    proposer = _operator()
    batch = propose_payout_batch(
        reference=f"{key}-run",
        period_start=timezone.now() - timedelta(days=7),
        period_end=timezone.now() + timedelta(days=1),
        actor=proposer,
    )
    return batch, proposer


def _events(batch: PayoutBatch) -> list[str]:
    return list(
        PayoutAuditEvent.objects.filter(batch=batch)
        .order_by("occurred_at", "id")
        .values_list("event_type", flat=True)
    )


def _make_unpayable(item: PayoutBatchItem) -> None:
    PartnerPayoutAccount.objects.filter(id=item.payout_account_id).update(
        status=PartnerPayoutAccount.Status.REJECTED
    )


# --------------------------------------------------------------------------------------------
# One person can run it, and the whole run is logged
# --------------------------------------------------------------------------------------------


@FAKE
def test_one_person_can_propose_approve_and_pay_and_every_step_is_logged() -> None:
    batch, proposer = _proposed_run("solo")

    approved = approve_payout_batch(
        batch_id=batch.id, expected_version=batch.version, actor=proposer
    )
    paying = start_paying_batch(
        batch_id=approved.id, expected_version=approved.version, actor=proposer
    )

    assert paying.status == PayoutBatch.Status.PAYING
    assert _events(batch) == ["RUN_PROPOSED", "RUN_APPROVED", "RUN_PAY_STARTED"]
    approval = PayoutAuditEvent.objects.get(batch=batch, event_type="RUN_APPROVED")
    assert approval.actor_id == proposer.id
    assert approval.approval_basis == PayoutBatch.ApprovalBasis.SELF
    paid = PayoutAuditEvent.objects.get(batch=batch, event_type="RUN_PAY_STARTED")
    assert paid.actor_id == proposer.id
    assert paid.details["item_count"] == 1
    assert paid.details["total_paise"] == batch.total_paise
    proposed = PayoutAuditEvent.objects.get(batch=batch, event_type="RUN_PROPOSED")
    assert proposed.details["total_paise"] == batch.total_paise
    assert proposed.occurred_at is not None


def test_a_second_person_approving_is_recorded_as_operations() -> None:
    batch, _ = _proposed_run("second-person")
    checker = _operator()

    approve_payout_batch(batch_id=batch.id, expected_version=batch.version, actor=checker)

    approval = PayoutAuditEvent.objects.get(batch=batch, event_type="RUN_APPROVED")
    assert approval.approval_basis == PayoutBatch.ApprovalBasis.OPERATIONS
    assert approval.actor_id == checker.id


def test_a_partner_left_out_at_proposal_is_logged_with_the_reason() -> None:
    booked = create_booked_group(key_prefix="no-account")
    _deliver(booked, key="no-account")
    settle_booking_earning(booking_id=booked.booking.id)  # no bank account added

    batch = propose_payout_batch(
        reference="no-account-run",
        period_start=timezone.now() - timedelta(days=7),
        period_end=timezone.now() + timedelta(days=1),
        actor=_operator(),
    )

    skipped = PayoutAuditEvent.objects.get(batch=batch, event_type="PARTNER_SKIPPED")
    assert skipped.partner_id == booked.partner.id
    assert skipped.reason == "no_payable_account"
    assert skipped.amount_paise and skipped.amount_paise > 0


def test_proposing_the_same_reference_again_logs_nothing_new() -> None:
    batch, proposer = _proposed_run("same-ref")

    again = propose_payout_batch(
        reference=batch.reference,
        period_start=batch.period_start,
        period_end=batch.period_end,
        actor=proposer,
    )

    assert again.id == batch.id
    assert _events(batch) == ["RUN_PROPOSED"]


def test_cancelling_logs_what_went_back_to_balances() -> None:
    batch, proposer = _proposed_run("cancel-log")

    cancel_payout_batch(batch_id=batch.id, expected_version=batch.version, actor=proposer)

    cancelled = PayoutAuditEvent.objects.get(batch=batch, event_type="RUN_CANCELLED")
    assert cancelled.actor_id == proposer.id
    assert cancelled.details == {"released_count": 1, "released_paise": batch.total_paise}


@FAKE
def test_a_partner_skipped_at_send_time_is_logged_as_the_system() -> None:
    item = _reserved_item("send-skip")
    batch = PayoutBatch.objects.get(id=item.batch_id)
    start_paying_batch(batch_id=batch.id, expected_version=batch.version, actor=_operator())
    _make_unpayable(item)

    submitted = submit_payout_item(item_id=item.id)

    assert submitted.status == PayoutBatchItem.Status.RELEASED
    skipped = PayoutAuditEvent.objects.get(batch=batch, event_type="PARTNER_SKIPPED")
    assert skipped.actor_role == PayoutAuditEvent.ActorRole.SYSTEM
    assert skipped.actor_id is None
    assert skipped.partner_id == item.partner_id
    assert skipped.amount_paise == item.amount_paise
    assert skipped.reason == "account_not_payable"


# --------------------------------------------------------------------------------------------
# Nobody pays themselves, and refused actions leave no trace of success
# --------------------------------------------------------------------------------------------


def test_nobody_approves_a_run_that_pays_their_own_partner_account() -> None:
    batch, _ = _proposed_run("self-pay-approve")
    partner_user = batch.items.get().partner.user

    with pytest.raises(SelfPaymentDeniedApiError):
        approve_payout_batch(batch_id=batch.id, expected_version=batch.version, actor=partner_user)

    batch.refresh_from_db()
    assert batch.status == PayoutBatch.Status.PENDING_APPROVAL
    assert _events(batch) == ["RUN_PROPOSED"]


@FAKE
def test_nobody_starts_paying_a_run_that_pays_their_own_partner_account() -> None:
    item = _reserved_item("self-pay-send")
    batch = PayoutBatch.objects.get(id=item.batch_id)

    with pytest.raises(SelfPaymentDeniedApiError):
        start_paying_batch(
            batch_id=batch.id, expected_version=batch.version, actor=item.partner.user
        )

    batch.refresh_from_db()
    assert batch.status == PayoutBatch.Status.APPROVED
    assert not PayoutAuditEvent.objects.filter(batch=batch, event_type="RUN_PAY_STARTED").exists()


def test_a_stale_confirm_is_refused_and_logs_nothing() -> None:
    batch, proposer = _proposed_run("stale")

    with pytest.raises(PayoutBatchConflictApiError):
        approve_payout_batch(batch_id=batch.id, expected_version=batch.version + 1, actor=proposer)

    assert _events(batch) == ["RUN_PROPOSED"]


# --------------------------------------------------------------------------------------------
# The review
# --------------------------------------------------------------------------------------------


@FAKE
def test_the_preview_shows_what_pay_would_send_and_skip_and_changes_nothing() -> None:
    item = _reserved_item("preview")
    batch = PayoutBatch.objects.get(id=item.batch_id)
    viewer = _operator()

    sending = preview_payout_batch(batch_id=batch.id, actor=viewer)
    _make_unpayable(item)
    skipping = preview_payout_batch(batch_id=batch.id, actor=viewer)

    assert (sending.send_count, sending.send_total_paise, sending.skip_count) == (
        1,
        item.amount_paise,
        0,
    )
    assert sending.version == batch.version
    assert sending.includes_actor is False
    [row] = skipping.items
    assert row.skip_reason == "account_not_payable"
    assert (skipping.send_count, skipping.skip_total_paise) == (0, item.amount_paise)
    # Looking changed nothing: same version, item still reserved, no events.
    batch.refresh_from_db()
    item.refresh_from_db()
    assert batch.version == sending.version
    assert item.status == PayoutBatchItem.Status.RESERVED
    assert not PayoutAuditEvent.objects.filter(batch=batch).exists()


@FAKE
def test_the_preview_flags_a_run_that_includes_the_viewer() -> None:
    item = _reserved_item("preview-self")

    preview = preview_payout_batch(batch_id=item.batch_id, actor=item.partner.user)

    assert preview.includes_actor is True


# --------------------------------------------------------------------------------------------
# Withdrawals
# --------------------------------------------------------------------------------------------


@WITHDRAWALS_ON
def test_a_withdrawal_logs_the_request_and_the_decision() -> None:
    _, partner, _ = _ready_partner(paid_before=False)
    batch = request_withdrawal(partner=partner, actor=partner.user).batch
    reviewer = _operator()

    approve_withdrawal(batch_id=batch.id, expected_version=batch.version, actor=reviewer)

    assert _events(batch) == ["WITHDRAWAL_REQUESTED", "WITHDRAWAL_APPROVED"]
    requested = PayoutAuditEvent.objects.get(batch=batch, event_type="WITHDRAWAL_REQUESTED")
    assert requested.actor_role == PayoutAuditEvent.ActorRole.PARTNER
    assert requested.details["review_reasons"] == ["first_payout_to_account"]
    approved = PayoutAuditEvent.objects.get(batch=batch, event_type="WITHDRAWAL_APPROVED")
    assert approved.actor_id == reviewer.id


@WITHDRAWALS_ON
def test_a_withdrawal_approved_by_policy_says_so() -> None:
    _, partner, _ = _ready_partner()

    batch = request_withdrawal(partner=partner, actor=partner.user).batch

    requested = PayoutAuditEvent.objects.get(batch=batch, event_type="WITHDRAWAL_REQUESTED")
    assert requested.approval_basis == PayoutBatch.ApprovalBasis.POLICY


@WITHDRAWALS_ON
def test_a_declined_withdrawal_is_logged_with_the_note() -> None:
    _, partner, _ = _ready_partner(paid_before=False)
    batch = request_withdrawal(partner=partner, actor=partner.user).batch

    decline_withdrawal(
        batch_id=batch.id,
        expected_version=batch.version,
        actor=_operator(),
        reason="Please call support to confirm this account.",
    )

    declined = PayoutAuditEvent.objects.get(batch=batch, event_type="WITHDRAWAL_DECLINED")
    assert declined.details["note"] == "Please call support to confirm this account."


@WITHDRAWALS_ON
def test_a_partner_still_cannot_approve_their_own_withdrawal() -> None:
    _, partner, _ = _ready_partner(paid_before=False)
    batch = request_withdrawal(partner=partner, actor=partner.user).batch

    with pytest.raises(SelfApprovalDeniedApiError):
        approve_withdrawal(batch_id=batch.id, expected_version=batch.version, actor=partner.user)

    assert _events(batch) == ["WITHDRAWAL_REQUESTED"]


# --------------------------------------------------------------------------------------------
# The log cannot be changed
# --------------------------------------------------------------------------------------------


def _one_event() -> PayoutAuditEvent:
    batch, _ = _proposed_run("immutable")
    return PayoutAuditEvent.objects.get(batch=batch, event_type="RUN_PROPOSED")


def test_the_model_refuses_to_change_or_delete_an_event() -> None:
    event = _one_event()
    event.reason = "edited"

    with pytest.raises(ValueError, match="append-only"):
        event.save()
    with pytest.raises(ValueError, match="append-only"):
        event.delete()


def test_postgresql_refuses_update_and_delete_from_anywhere() -> None:
    event = _one_event()

    with pytest.raises(DatabaseError), transaction.atomic():
        PayoutAuditEvent.objects.filter(id=event.id).update(reason="edited")
    with pytest.raises(DatabaseError), transaction.atomic():
        PayoutAuditEvent.objects.filter(id=event.id).delete()
    with pytest.raises(DatabaseError), transaction.atomic(), connection.cursor() as cursor:
        cursor.execute(
            "UPDATE payouts_payoutauditevent SET reason = 'edited' WHERE id = %s", [event.id]
        )

    event.refresh_from_db()
    assert event.reason == ""


def test_the_log_holds_no_link_to_a_person_that_account_deletion_would_touch() -> None:
    """Actors and Partners are kept by id only, so deleting or erasing an account never needs
    to change a row the trigger protects, and the log holds no name, phone or bank number."""

    fields = {field.name: field for field in PayoutAuditEvent._meta.get_fields()}

    assert not fields["actor_id"].is_relation
    assert not fields["partner_id"].is_relation
    assert {"phone_number", "full_name", "account_number"}.isdisjoint(fields)


def test_ledger_entries_are_untouched_by_the_log() -> None:
    """Sanity: the trigger is on the audit table only; the ledger still moves through states."""

    batch, proposer = _proposed_run("ledger-still-moves")

    cancel_payout_batch(batch_id=batch.id, expected_version=batch.version, actor=proposer)

    assert not PartnerLedgerEntry.objects.filter(
        payout_lines__item__batch=batch, status=PartnerLedgerEntry.Status.RESERVED
    ).exists()
