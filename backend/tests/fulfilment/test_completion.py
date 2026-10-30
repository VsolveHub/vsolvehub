"""Abort, line-level outcomes, completion submission, Customer confirm/dispute and the
evidence-gated auto-finalize watchdog."""

from datetime import timedelta

import pytest
from django.db.models import Sum
from django.utils import timezone

from apps.commerce.models import Booking, Refund
from apps.fulfilment.completion import (
    OutcomeInput,
    abort_work,
    auto_finalize_completion,
    confirm_completion,
    dispute_completion,
    submit_completion,
)
from apps.fulfilment.exceptions import BookingCommandInvalidApiError
from apps.fulfilment.models import CompletionResponse, CompletionSubmission, WorkEvidence, WorkTask
from apps.fulfilment.otp import operations_assisted_start
from apps.fulfilment.services import mark_arrived, mark_en_route
from apps.identity.models import User
from tests.fulfilment.conftest import create_booked_group

pytestmark = [
    pytest.mark.django_db(transaction=True),
    # Walks visits booked for tomorrow through en route and arrival; the clock gates on those
    # steps are tested in tests/fulfilment/test_partner_time_gates.py.
    pytest.mark.usefixtures("partner_gates_open"),
]

_operator_counter = iter(range(1, 10_000))


def _operator() -> User:
    return User.objects.create_user(phone_number=f"+91983{next(_operator_counter):07d}")


def _in_progress_booking(key_prefix: str) -> object:
    booked = create_booked_group(key_prefix=key_prefix)
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
        outage_reason="Test bootstrap: skip OTP for completion tests.",
        expected_version=booking.version,
    )
    booked.booking.refresh_from_db()
    return booked


def _all_outcomes(
    booking: Booking, outcome: str, *, quantity: int | None = None
) -> list[OutcomeInput]:
    tasks = list(WorkTask.objects.filter(booking=booking))
    return [
        OutcomeInput(
            work_task_id=task.id,
            outcome=outcome,
            quantity=task.quantity if quantity is None else quantity,
        )
        for task in tasks
    ]


# --- abort_work -------------------------------------------------------------------------------


def test_abort_work_moves_in_progress_to_aborted() -> None:
    booked = _in_progress_booking("abort-happy")
    aborted = abort_work(
        booking_id=booked.booking.id,
        partner_id=booked.partner.id,
        reason="Customer requested we stop; will resume later.",
        expected_version=booked.booking.version,
    )
    assert aborted.status == Booking.Status.ABORTED


def test_abort_work_by_another_partner_is_refused() -> None:
    booked = _in_progress_booking("abort-wrong-partner")
    other = create_booked_group(slugs=("tap-repair",), key_prefix="abort-wrong-partner-other")
    with pytest.raises(PermissionError):
        abort_work(
            booking_id=booked.booking.id,
            partner_id=other.partner.id,
            reason="Not my job.",
            expected_version=booked.booking.version,
        )


def test_abort_work_requires_a_reason() -> None:
    booked = _in_progress_booking("abort-blank-reason")
    with pytest.raises(BookingCommandInvalidApiError):
        abort_work(
            booking_id=booked.booking.id,
            partner_id=booked.partner.id,
            reason="   ",
            expected_version=booked.booking.version,
        )


def test_abort_work_replay_is_idempotent() -> None:
    booked = _in_progress_booking("abort-replay")
    first = abort_work(
        booking_id=booked.booking.id,
        partner_id=booked.partner.id,
        reason="Site unsafe.",
        expected_version=booked.booking.version,
    )
    second = abort_work(
        booking_id=booked.booking.id,
        partner_id=booked.partner.id,
        reason="Site unsafe.",
        expected_version=first.version,
    )
    assert second.status == Booking.Status.ABORTED
    assert second.version == first.version


def test_abort_work_from_a_non_in_progress_booking_is_refused() -> None:
    booked = create_booked_group(key_prefix="abort-not-started")
    with pytest.raises(BookingCommandInvalidApiError):
        abort_work(
            booking_id=booked.booking.id,
            partner_id=booked.partner.id,
            reason="Too early to abort.",
            expected_version=booked.booking.version,
        )


# --- submit_completion -------------------------------------------------------------------------


def test_submit_completion_all_done_waits_for_customer_confirmation() -> None:
    booked = _in_progress_booking("submit-all-done")
    booking = booked.booking
    submission = submit_completion(
        booking_id=booking.id,
        partner_id=booked.partner.id,
        notes="All done.",
        safety_damage_declared=False,
        outcomes=_all_outcomes(booking, "COMPLETED"),
        expected_version=booking.version,
    )
    booking.refresh_from_db()
    assert booking.status == Booking.Status.COMPLETION_SUBMITTED
    assert submission.booking_id == booking.id


def test_submit_completion_by_another_partner_is_refused() -> None:
    booked = _in_progress_booking("submit-wrong-partner")
    other = create_booked_group(slugs=("tap-repair",), key_prefix="submit-wrong-partner-other")
    with pytest.raises(PermissionError):
        submit_completion(
            booking_id=booked.booking.id,
            partner_id=other.partner.id,
            notes="",
            safety_damage_declared=False,
            outcomes=_all_outcomes(booked.booking, "COMPLETED"),
            expected_version=booked.booking.version,
        )


def test_submit_completion_missing_a_task_outcome_is_refused() -> None:
    booked = _in_progress_booking("submit-missing-task")
    with pytest.raises(BookingCommandInvalidApiError):
        submit_completion(
            booking_id=booked.booking.id,
            partner_id=booked.partner.id,
            notes="",
            safety_damage_declared=False,
            outcomes=[],
            expected_version=booked.booking.version,
        )


def test_submit_completion_quantity_over_task_quantity_is_refused() -> None:
    booked = _in_progress_booking("submit-overquantity")
    outcomes = _all_outcomes(booked.booking, "PARTIAL")
    outcomes[0] = OutcomeInput(
        work_task_id=outcomes[0].work_task_id, outcome="PARTIAL", quantity=999
    )
    with pytest.raises(BookingCommandInvalidApiError):
        submit_completion(
            booking_id=booked.booking.id,
            partner_id=booked.partner.id,
            notes="",
            safety_damage_declared=False,
            outcomes=outcomes,
            expected_version=booked.booking.version,
        )


def test_submit_completion_replay_returns_the_same_submission() -> None:
    booked = _in_progress_booking("submit-replay")
    booking = booked.booking
    first = submit_completion(
        booking_id=booking.id,
        partner_id=booked.partner.id,
        notes="Done.",
        safety_damage_declared=False,
        outcomes=_all_outcomes(booking, "COMPLETED"),
        expected_version=booking.version,
    )
    second = submit_completion(
        booking_id=booking.id,
        partner_id=booked.partner.id,
        notes="Done.",
        safety_damage_declared=False,
        outcomes=_all_outcomes(booking, "COMPLETED"),
        expected_version=booking.version,
    )
    assert second.id == first.id


def test_submit_completion_after_abort_settles_directly_to_partially_completed() -> None:
    booked = _in_progress_booking("submit-after-abort")
    booking = abort_work(
        booking_id=booked.booking.id,
        partner_id=booked.partner.id,
        reason="Ran out of parts.",
        expected_version=booked.booking.version,
    )
    submit_completion(
        booking_id=booking.id,
        partner_id=booked.partner.id,
        notes="Stopped early.",
        safety_damage_declared=False,
        outcomes=_all_outcomes(booking, "NOT_STARTED", quantity=0),
        expected_version=booking.version,
    )
    booking.refresh_from_db()
    assert booking.status == Booking.Status.PARTIALLY_COMPLETED
    refund = Refund.objects.filter(order=booked.order).first()
    assert refund is not None
    assert refund.amount_paise > 0


def test_submit_completion_after_abort_with_safety_damage_is_disputed_and_holds_payout() -> None:
    booked = _in_progress_booking("submit-after-abort-damage")
    booking = abort_work(
        booking_id=booked.booking.id,
        partner_id=booked.partner.id,
        reason="Unsafe wiring discovered.",
        expected_version=booked.booking.version,
    )
    submit_completion(
        booking_id=booking.id,
        partner_id=booked.partner.id,
        notes="Stopped for safety.",
        safety_damage_declared=True,
        outcomes=_all_outcomes(booking, "BLOCKED", quantity=0),
        expected_version=booking.version,
    )
    booking.refresh_from_db()
    assert booking.status == Booking.Status.DISPUTED
    assert booking.payout_hold is True


def test_submit_completion_all_completed_after_abort_is_a_typed_conflict() -> None:
    """An abort that reports everything finished is not a valid `ABORTED` outcome — the state
    machine has no `ABORTED -> COMPLETED` edge, and the Partner should have used the normal
    completion path instead."""

    booked = _in_progress_booking("submit-after-abort-all-done")
    booking = abort_work(
        booking_id=booked.booking.id,
        partner_id=booked.partner.id,
        reason="Stopped, but finished first.",
        expected_version=booked.booking.version,
    )
    with pytest.raises(BookingCommandInvalidApiError):
        submit_completion(
            booking_id=booking.id,
            partner_id=booked.partner.id,
            notes="",
            safety_damage_declared=False,
            outcomes=_all_outcomes(booking, "COMPLETED"),
            expected_version=booking.version,
        )


# --- confirm_completion / dispute_completion ----------------------------------------------------


def _submitted(key_prefix: str, outcome: str, *, quantity: int | None = None) -> object:
    booked = _in_progress_booking(key_prefix)
    booking = booked.booking
    submit_completion(
        booking_id=booking.id,
        partner_id=booked.partner.id,
        notes="Reported.",
        safety_damage_declared=False,
        outcomes=_all_outcomes(booking, outcome, quantity=quantity),
        expected_version=booking.version,
    )
    booking.refresh_from_db()
    return booked


def test_confirm_completion_with_all_done_outcomes_completes_the_booking() -> None:
    booked = _submitted("confirm-all-done", "COMPLETED")
    booking = confirm_completion(
        booking_id=booked.booking.id,
        customer_id=booked.customer.id,
        expected_version=booked.booking.version,
    )
    assert booking.status == Booking.Status.COMPLETED


def test_confirm_completion_with_a_not_started_line_is_partial_and_refunds_it() -> None:
    booked = _submitted("confirm-partial", "NOT_STARTED", quantity=0)
    total_amount = WorkTask.objects.filter(booking=booked.booking).aggregate(
        total=Sum("amount_paise")
    )["total"]
    booking = confirm_completion(
        booking_id=booked.booking.id,
        customer_id=booked.customer.id,
        expected_version=booked.booking.version,
    )
    assert booking.status == Booking.Status.PARTIALLY_COMPLETED
    refund = Refund.objects.get(order=booked.order)
    assert refund.amount_paise == total_amount


def test_confirm_completion_by_another_customer_is_refused() -> None:
    booked = _submitted("confirm-wrong-customer", "COMPLETED")
    other_customer = User.objects.create_user(phone_number="+919840000001")
    with pytest.raises(PermissionError):
        confirm_completion(
            booking_id=booked.booking.id,
            customer_id=other_customer.id,
            expected_version=booked.booking.version,
        )


def test_confirm_completion_without_a_submission_is_refused() -> None:
    booked = _in_progress_booking("confirm-no-submission")
    with pytest.raises(BookingCommandInvalidApiError):
        confirm_completion(
            booking_id=booked.booking.id,
            customer_id=booked.customer.id,
            expected_version=booked.booking.version,
        )


def test_confirm_completion_replay_after_confirming_is_idempotent() -> None:
    booked = _submitted("confirm-replay", "COMPLETED")
    first = confirm_completion(
        booking_id=booked.booking.id,
        customer_id=booked.customer.id,
        expected_version=booked.booking.version,
    )
    second = confirm_completion(
        booking_id=booked.booking.id,
        customer_id=booked.customer.id,
        expected_version=first.version,
    )
    assert second.status == Booking.Status.COMPLETED
    assert second.version == first.version


def test_dispute_completion_moves_to_disputed_and_holds_payout_even_if_all_done() -> None:
    booked = _submitted("dispute-all-done", "COMPLETED")
    booking = dispute_completion(
        booking_id=booked.booking.id,
        customer_id=booked.customer.id,
        dispute_reason="The socket still sparks.",
        expected_version=booked.booking.version,
    )
    assert booking.status == Booking.Status.DISPUTED
    assert booking.payout_hold is True


def test_dispute_completion_requires_a_reason() -> None:
    booked = _submitted("dispute-blank-reason", "COMPLETED")
    with pytest.raises(BookingCommandInvalidApiError):
        dispute_completion(
            booking_id=booked.booking.id,
            customer_id=booked.customer.id,
            dispute_reason="   ",
            expected_version=booked.booking.version,
        )


def test_dispute_completion_names_the_disputed_outcomes() -> None:
    booked = _submitted("dispute-named-outcomes", "COMPLETED")
    submission = CompletionSubmission.objects.get(booking=booked.booking)
    outcome_id = submission.outcomes.first().id
    dispute_completion(
        booking_id=booked.booking.id,
        customer_id=booked.customer.id,
        dispute_reason="This specific line was never done.",
        disputed_outcome_ids=[outcome_id],
        expected_version=booked.booking.version,
    )
    response = CompletionResponse.objects.get(completion_submission=submission)
    assert list(response.disputed_outcomes.values_list("id", flat=True)) == [outcome_id]


def test_confirm_after_dispute_is_refused_as_already_decided() -> None:
    booked = _submitted("confirm-after-dispute", "COMPLETED")
    booking = dispute_completion(
        booking_id=booked.booking.id,
        customer_id=booked.customer.id,
        dispute_reason="Quality issue.",
        expected_version=booked.booking.version,
    )
    with pytest.raises(BookingCommandInvalidApiError):
        confirm_completion(
            booking_id=booking.id,
            customer_id=booked.customer.id,
            expected_version=booking.version,
        )


# --- auto_finalize_completion (evidence-gated watchdog) -----------------------------------------


def test_auto_finalize_before_the_deadline_does_nothing() -> None:
    booked = _submitted("auto-finalize-too-soon", "COMPLETED")
    result = auto_finalize_completion(booking_id=booked.booking.id)
    assert result is None
    booked.booking.refresh_from_db()
    assert booked.booking.status == Booking.Status.COMPLETION_SUBMITTED


def test_auto_finalize_past_deadline_without_evidence_is_gated_and_does_nothing() -> None:
    booked = _submitted("auto-finalize-no-evidence", "COMPLETED")
    submission = CompletionSubmission.objects.get(booking=booked.booking)
    submission.submitted_at = timezone.now() - timedelta(hours=25)
    submission.save(update_fields=("submitted_at",))

    result = auto_finalize_completion(booking_id=booked.booking.id)
    assert result is None
    booked.booking.refresh_from_db()
    assert booked.booking.status == Booking.Status.COMPLETION_SUBMITTED


def test_auto_finalize_past_deadline_with_evidence_finalizes_the_completion() -> None:
    booked = _submitted("auto-finalize-with-evidence", "COMPLETED")
    submission = CompletionSubmission.objects.get(booking=booked.booking)
    submission.submitted_at = timezone.now() - timedelta(hours=25)
    submission.save(update_fields=("submitted_at",))
    WorkEvidence.objects.create(
        booking=booked.booking,
        kind=WorkEvidence.Kind.AFTER,
        uploaded_by=booked.partner.user,
        object_key=f"fulfilment/{booked.booking.id}/after/auto-finalize.jpg",
        content_type="image/jpeg",
        size_bytes=1024,
        sha256="c" * 64,
        processing_status=WorkEvidence.ProcessingStatus.CLEAN,
    )

    booking = auto_finalize_completion(booking_id=booked.booking.id)
    assert booking is not None
    assert booking.status == Booking.Status.COMPLETED
    response = CompletionResponse.objects.get(completion_submission=submission)
    assert response.decision == CompletionResponse.Decision.AUTO_FINALIZED


def test_auto_finalize_past_deadline_with_safety_declared_disputes_without_needing_evidence() -> (
    None
):
    booked = _in_progress_booking("auto-finalize-safety")
    booking = booked.booking
    submit_completion(
        booking_id=booking.id,
        partner_id=booked.partner.id,
        notes="Damage found.",
        safety_damage_declared=True,
        outcomes=_all_outcomes(booking, "COMPLETED"),
        expected_version=booking.version,
    )
    submission = CompletionSubmission.objects.get(booking=booking)
    submission.submitted_at = timezone.now() - timedelta(hours=25)
    submission.save(update_fields=("submitted_at",))

    finalized = auto_finalize_completion(booking_id=booking.id)
    assert finalized is not None
    assert finalized.status == Booking.Status.DISPUTED
    assert finalized.payout_hold is True


def test_auto_finalize_does_not_double_finalize_an_already_answered_completion() -> None:
    booked = _submitted("auto-finalize-already-answered", "COMPLETED")
    confirm_completion(
        booking_id=booked.booking.id,
        customer_id=booked.customer.id,
        expected_version=booked.booking.version,
    )
    submission = CompletionSubmission.objects.get(booking=booked.booking)
    submission.submitted_at = timezone.now() - timedelta(hours=25)
    submission.save(update_fields=("submitted_at",))

    result = auto_finalize_completion(booking_id=booked.booking.id)
    assert result is None
