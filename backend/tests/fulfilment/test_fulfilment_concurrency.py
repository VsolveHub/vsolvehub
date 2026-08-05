"""B8 — the races that decide a Booking Group's truth, run against real PostgreSQL.

Nothing here is mocked. Each test runs real commands on real connections and lets the database
arbitrate, because every one of these outcomes is decided by a row lock taken in
`locked_booking_context` / `cancel_booked_group` — and a mock would only prove that the test
author's mental model is self-consistent.

The shared invariant across all three: whichever command wins, the Booking Group's derived
status must still agree with the units underneath it, no unit may be settled twice, and no
Customer may be refunded twice for one unit.

The single-unit races (two Partners moving one Booking) are already proven in
`test_core_state_machine.py::test_concurrent_en_route_commands_serialize_to_one_winner` and are
not duplicated here. This file is only about commands that span *different* units of one group.
"""

from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier
from typing import Any

import pytest
from django.db import close_old_connections, connections
from django.utils import timezone

from apps.carts.models import BookingGroup, FulfilmentUnit
from apps.commerce.models import Booking, PaymentAllocation, Refund, RefundAllocation
from apps.fulfilment.cancellation import cancel_booked_group, cancel_booking
from apps.fulfilment.completion import (
    OutcomeInput,
    auto_finalize_completion,
    confirm_completion,
    submit_completion,
)
from apps.fulfilment.models import (
    BookingStatusHistory,
    CompletionSubmission,
    WorkEvidence,
    WorkOutcome,
    WorkTask,
)
from apps.fulfilment.otp import operations_assisted_start
from apps.fulfilment.recovery_services import release_booking_partner
from apps.fulfilment.services import mark_arrived, mark_en_route
from apps.identity.models import User
from tests.fulfilment.conftest import BookedGroup, create_booked_group

pytestmark = pytest.mark.django_db(transaction=True)

RACERS = 2
TWO_UNITS = 2
_operator_counter = iter(range(1, 10_000))


def _two_unit_group(key_prefix: str) -> tuple[BookedGroup, FulfilmentUnit, FulfilmentUnit]:
    booked = create_booked_group(
        slugs=("switch-socket-repair", "tap-repair"), key_prefix=key_prefix
    )
    units = list(booked.group.units.order_by("position"))
    assert len(units) == TWO_UNITS
    return booked, units[0], units[1]


def _start_work(unit: FulfilmentUnit) -> Booking:
    booking = mark_en_route(
        booking_id=unit.booking.id,
        partner_id=unit.booking.partner_id,
        expected_version=unit.booking.version,
    )
    booking = mark_arrived(
        booking_id=booking.id, partner_id=booking.partner_id, expected_version=booking.version
    )
    operator = User.objects.create_user(phone_number=f"+91986{next(_operator_counter):07d}")
    return operations_assisted_start(
        booking_id=booking.id,
        operator=operator,
        outage_reason="Test bootstrap: put this unit mid-work.",
        expected_version=booking.version,
    )


def _submit_all_completed(booking: Booking) -> Booking:
    tasks = list(WorkTask.objects.filter(booking=booking))
    submit_completion(
        booking_id=booking.id,
        partner_id=booking.partner_id,
        notes="All done.",
        safety_damage_declared=False,
        outcomes=[
            OutcomeInput(
                work_task_id=task.id,
                outcome=WorkOutcome.Outcome.COMPLETED,
                quantity=task.quantity,
            )
            for task in tasks
        ],
        expected_version=booking.version,
    )
    booking.refresh_from_db()
    return booking


def _race(*commands: Callable[[], str]) -> list[str]:
    """Run every command on its own connection, released simultaneously by a barrier."""

    barrier = Barrier(len(commands))

    def runner(command: Callable[[], str]) -> str:
        close_old_connections()
        try:
            barrier.wait(timeout=30)
            return command()
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=len(commands)) as pool:
        return [future.result() for future in [pool.submit(runner, c) for c in commands]]


def _labelled(label: str, work: Callable[[], Any]) -> Callable[[], str]:
    def call() -> str:
        try:
            work()
        except Exception as exc:
            return f"{label}:refused:{type(exc).__name__}"
        return f"{label}:ok"

    return call


def _cancelled_history(booking_id: Any) -> int:
    return BookingStatusHistory.objects.filter(
        booking_id=booking_id, to_status=Booking.Status.CANCELLED
    ).count()


def test_one_unit_completing_while_the_group_is_cancelled_leaves_a_consistent_group() -> None:
    """The Customer cancels everything at the same moment the other visit is confirmed done.

    Both commands lock the Booking Group row first, so one of them runs to completion before the
    other starts. Neither ordering may produce a unit that is both completed and cancelled, and
    the group must end on whatever its units actually say.
    """

    booked, finishing, other = _two_unit_group("race-complete-vs-groupcancel")
    finishing_booking = _submit_all_completed(_start_work(finishing))
    group_version = BookingGroup.objects.get(id=booked.group.id).version

    outcomes = _race(
        _labelled(
            "confirm",
            lambda: confirm_completion(
                booking_id=finishing_booking.id,
                customer_id=booked.customer.id,
                expected_version=finishing_booking.version,
            ),
        ),
        _labelled(
            "group-cancel",
            lambda: cancel_booked_group(
                group_id=booked.group.id,
                customer_id=booked.customer.id,
                expected_version=group_version,
                reason="cancel everything",
                idempotency_key="race-complete-key",
            ),
        ),
    )

    finishing.refresh_from_db()
    other.refresh_from_db()
    group = BookingGroup.objects.get(id=booked.group.id)
    assert finishing.status == FulfilmentUnit.Status.COMPLETED, (
        f"a settled visit was overwritten by the group cancel: {outcomes}"
    )
    if "group-cancel:ok" in outcomes:
        # The cancel found the completion already settled: it skipped that unit and cancelled
        # the other one. One unit was delivered, so the group completed.
        assert other.status == FulfilmentUnit.Status.CANCELLED
        assert group.status == BookingGroup.Status.COMPLETED
    else:
        # The cancel arrived while the completion was still awaiting a decision, so it refused
        # outright rather than half-landing.
        assert other.status == FulfilmentUnit.Status.BOOKED
        assert _cancelled_history(other.booking.id) == 0
        assert group.status == BookingGroup.Status.BOOKED
    assert (
        BookingStatusHistory.objects.filter(
            booking=finishing.booking, to_status=Booking.Status.COMPLETED
        ).count()
        == 1
    )


def test_a_unit_cancel_and_a_group_cancel_never_refund_the_same_unit_twice() -> None:
    """The Customer taps "cancel this visit" and "cancel everything" at the same instant."""

    booked, target, other = _two_unit_group("race-unitcancel-vs-groupcancel")
    target_booking = target.booking
    group_version = booked.group.version

    outcomes = _race(
        _labelled(
            "unit-cancel",
            lambda: cancel_booking(
                booking_id=target_booking.id,
                customer_id=booked.customer.id,
                expected_version=target_booking.version,
                reason="just this visit",
                idempotency_key="race-unit-key",
            ),
        ),
        _labelled(
            "group-cancel",
            lambda: cancel_booked_group(
                group_id=booked.group.id,
                customer_id=booked.customer.id,
                expected_version=group_version,
                reason="all of it",
                idempotency_key="race-group-key",
            ),
        ),
    )

    target.refresh_from_db()
    assert target.status == FulfilmentUnit.Status.CANCELLED
    assert _cancelled_history(target.booking.id) == 1, (
        f"the same visit was cancelled twice: {outcomes}"
    )
    # One Refund, split across however many PaymentAllocations the unit's price has — what must
    # never happen is a *second* Refund for the same unit.
    distinct_refunds = (
        RefundAllocation.objects.filter(payment_allocation__fulfilment_unit=target)
        .values("refund_id")
        .distinct()
        .count()
    )
    assert distinct_refunds == 1, f"the same visit was refunded twice: {outcomes}"
    refunded_paise = sum(
        RefundAllocation.objects.filter(payment_allocation__fulfilment_unit=target).values_list(
            "amount_paise", flat=True
        )
    )
    allocated_paise = sum(
        PaymentAllocation.objects.filter(fulfilment_unit=target).values_list(
            "amount_paise", flat=True
        )
    )
    assert refunded_paise <= allocated_paise, "refunded more than the Customer paid for this unit"
    other.refresh_from_db()
    group = BookingGroup.objects.get(id=booked.group.id)
    if "group-cancel:ok" in outcomes:
        assert other.status == FulfilmentUnit.Status.CANCELLED
        assert group.status == BookingGroup.Status.CANCELLED
    else:
        assert other.status == FulfilmentUnit.Status.BOOKED
        assert group.status == BookingGroup.Status.BOOKED


def test_a_partner_release_beside_an_auto_finalize_does_not_complete_the_group() -> None:
    """One visit finalizes on the watchdog exactly as the other visit's Partner walks away.

    The trap this guards: `sync_group_completion` runs inside the finalizing unit's command and
    must read the *released* unit's fresh status, not a cached one — otherwise the group reports
    `COMPLETED` while one of its visits still needs a replacement Partner.
    """

    booked, finalizing, releasing = _two_unit_group("race-release-vs-autofinal")
    finalizing_booking = _submit_all_completed(_start_work(finalizing))
    submission = CompletionSubmission.objects.get(booking=finalizing_booking)
    submission.submitted_at = timezone.now() - timedelta(days=7)
    submission.save(update_fields=("submitted_at",))
    WorkEvidence.objects.create(
        booking=finalizing_booking,
        kind=WorkEvidence.Kind.AFTER,
        object_key=f"evidence/{finalizing_booking.id}/after.jpg",
        content_type="image/jpeg",
        size_bytes=1024,
        sha256="b" * 64,
        processing_status=WorkEvidence.ProcessingStatus.CLEAN,
        uploaded_by=finalizing_booking.partner.user,
    )
    releasing_booking = releasing.booking

    outcomes = _race(
        _labelled(
            "auto-finalize", lambda: auto_finalize_completion(booking_id=finalizing_booking.id)
        ),
        _labelled(
            "release",
            lambda: release_booking_partner(
                booking_id=releasing_booking.id,
                partner_id=releasing_booking.partner_id,
                reason="van broke down",
                expected_version=releasing_booking.version,
            ),
        ),
    )

    assert outcomes == ["auto-finalize:ok", "release:ok"], outcomes
    finalizing.refresh_from_db()
    releasing.refresh_from_db()
    assert finalizing.status == FulfilmentUnit.Status.COMPLETED
    assert releasing.status == FulfilmentUnit.Status.RECOVERY_REQUIRED
    group = BookingGroup.objects.get(id=booked.group.id)
    assert group.status == BookingGroup.Status.BOOKED, (
        "the group completed while one visit still needs a replacement Partner"
    )
    assert Refund.objects.filter(order=finalizing_booking.order).count() == 0
