"""Operations cases: routing, SLA, the resolution vocabulary and the payout hold.

The rule the plan states and this file enforces: "cases may escalate, but they may not close
merely because a notification was sent". A case closes by naming one of the terminal results its
type requires, and closing it is what releases the money it was holding.
"""

import itertools
import uuid

import pytest
from django.utils import timezone

from apps.cases.models import (
    ALLOWED_RESOLUTIONS,
    DEFAULT_TEAM,
    OperationsCase,
    OperationsCaseEvent,
)
from apps.cases.services import (
    add_case_note,
    claim_case,
    escalate_case,
    open_case,
    resolve_case,
)
from apps.identity.models import User
from apps.payouts.exceptions import CaseConflictApiError, CaseInvalidApiError
from apps.payouts.models import PartnerLedgerEntry
from apps.payouts.services import settle_booking_earning
from tests.fulfilment.conftest import create_booked_group
from tests.payouts.test_ledger_and_payout import _deliver

pytestmark = pytest.mark.django_db(transaction=True)

_sequence = itertools.count(1)


def _operator() -> User:
    """A unique staff user.

    Derived from a uuid rather than a module counter: three test files create operators, each
    counter starts at 1, and running them together made two files mint the same phone number.
    """

    # Indian mobile numbers start 6-9, so the leading digit is fixed rather than random.
    return User.objects.create_user(phone_number=f"+919{uuid.uuid4().int % 10**9:09d}")


def _case(kind: str = OperationsCase.Kind.QUALITY, **kwargs: object) -> OperationsCase:
    booked = create_booked_group(key_prefix=f"case-{next(_sequence)}")
    return open_case(
        kind=kind,
        summary="Something needs looking at.",
        booking_id=booked.booking.id,
        opened_by=_operator(),
        **kwargs,  # type: ignore[arg-type]
    )


# --------------------------------------------------------------------------------------------
# Routing and SLA
# --------------------------------------------------------------------------------------------


def test_every_case_kind_routes_to_the_team_the_ownership_table_names() -> None:
    """The opener does not choose. A caller that could route its own case would eventually send
    a safety incident to booking support."""

    for kind in OperationsCase.Kind.values:
        assert kind in DEFAULT_TEAM, f"{kind} has no owning team"
        assert kind in ALLOWED_RESOLUTIONS, f"{kind} has no required terminal result"

    assert DEFAULT_TEAM[OperationsCase.Kind.SAFETY] == OperationsCase.Team.SAFETY
    assert DEFAULT_TEAM[OperationsCase.Kind.PAYOUT] == OperationsCase.Team.FINANCE
    assert DEFAULT_TEAM[OperationsCase.Kind.ASSIGNMENT] == OperationsCase.Team.DISPATCH


def test_a_case_opens_with_a_deadline_it_is_measured_on() -> None:
    case = _case()

    assert case.due_at > timezone.now()
    assert case.status == OperationsCase.Status.OPEN
    assert case.events.filter(kind=OperationsCaseEvent.Kind.OPENED).count() == 1


def test_escalating_shortens_the_deadline() -> None:
    case = _case(severity=OperationsCase.Severity.LOW)
    original = case.due_at

    escalated = escalate_case(
        case_id=case.id,
        expected_version=case.version,
        severity=OperationsCase.Severity.URGENT,
        actor=_operator(),
    )

    assert escalated.due_at < original
    assert escalated.events.filter(kind=OperationsCaseEvent.Kind.SEVERITY_CHANGED).exists()


def test_an_overdue_case_says_so() -> None:
    case = _case()
    case.due_at = timezone.now() - timezone.timedelta(hours=1)  # type: ignore[attr-defined]
    case.save(update_fields=("due_at",))

    assert case.is_overdue is True


def test_a_resolved_case_is_never_overdue() -> None:
    case = _case()
    case.status = OperationsCase.Status.RESOLVED
    case.resolution = "SETTLED"
    case.save(update_fields=("status", "resolution"))
    case.due_at = timezone.now() - timezone.timedelta(hours=1)  # type: ignore[attr-defined]

    assert case.is_overdue is False


# --------------------------------------------------------------------------------------------
# Closing
# --------------------------------------------------------------------------------------------


def test_a_case_cannot_close_on_a_resolution_its_type_does_not_allow() -> None:
    """This is the constraint behind "may not close merely because a notification was sent".

    Free text would let "customer was emailed" stand in for "the money was reconciled".
    """

    case = _case(kind=OperationsCase.Kind.PAYMENT)

    with pytest.raises(CaseInvalidApiError):
        resolve_case(
            case_id=case.id,
            expected_version=case.version,
            resolution="CUSTOMER_EMAILED",
            note="Sent them a message.",
            actor=_operator(),
        )

    case.refresh_from_db()
    assert case.status != OperationsCase.Status.RESOLVED


def test_a_case_cannot_close_without_a_documented_outcome() -> None:
    case = _case(kind=OperationsCase.Kind.PAYMENT)

    with pytest.raises(CaseInvalidApiError):
        resolve_case(
            case_id=case.id,
            expected_version=case.version,
            resolution="RECONCILED",
            note="   ",
            actor=_operator(),
        )


def test_a_case_closes_on_one_of_its_required_terminal_results() -> None:
    case = _case(kind=OperationsCase.Kind.PAYMENT)

    resolved = resolve_case(
        case_id=case.id,
        expected_version=case.version,
        resolution="RECONCILED",
        note="Provider and domain state now agree; capture confirmed.",
        actor=_operator(),
    )

    assert resolved.status == OperationsCase.Status.RESOLVED
    assert resolved.resolved_at is not None
    assert resolved.events.filter(kind=OperationsCaseEvent.Kind.RESOLVED).count() == 1


def test_resolving_twice_is_idempotent() -> None:
    case = _case(kind=OperationsCase.Kind.PAYMENT)
    resolve_case(
        case_id=case.id,
        expected_version=case.version,
        resolution="RECONCILED",
        note="Reconciled.",
        actor=_operator(),
    )
    case.refresh_from_db()

    again = resolve_case(
        case_id=case.id,
        expected_version=case.version,
        resolution="RECONCILED",
        note="Reconciled.",
        actor=_operator(),
    )

    assert again.events.filter(kind=OperationsCaseEvent.Kind.RESOLVED).count() == 1


def test_a_stale_version_is_a_typed_conflict() -> None:
    case = _case()

    with pytest.raises(CaseConflictApiError):
        claim_case(case_id=case.id, expected_version=case.version + 99, actor=_operator())


# --------------------------------------------------------------------------------------------
# Communication is recorded, and is not progress
# --------------------------------------------------------------------------------------------


def test_sending_a_message_is_recorded_and_moves_nothing() -> None:
    case = _case()
    status_before = case.status

    add_case_note(
        case_id=case.id,
        actor=_operator(),
        body="Called the customer, left a voicemail.",
        is_communication=True,
    )

    case.refresh_from_db()
    assert case.status == status_before
    assert case.events.filter(kind=OperationsCaseEvent.Kind.COMMUNICATION).count() == 1


def test_case_events_are_immutable() -> None:
    case = _case()
    event = case.events.first()
    assert event is not None

    event.body = "rewritten"
    with pytest.raises(ValueError, match="immutable"):
        event.save(update_fields=("body",))


# --------------------------------------------------------------------------------------------
# The payout hold
# --------------------------------------------------------------------------------------------


def test_a_quality_case_holds_the_partners_money_until_it_closes() -> None:
    booked = create_booked_group(key_prefix="case-hold")
    _deliver(booked, key="case-hold")
    booking = booked.booking
    booking.payout_hold = True
    booking.save(update_fields=("payout_hold",))
    settle_booking_earning(booking_id=booking.id)
    case = open_case(
        kind=OperationsCase.Kind.QUALITY,
        summary="Customer disputed the work.",
        booking_id=booking.id,
        opened_by=_operator(),
    )
    assert case.holds_payout is True
    entry = PartnerLedgerEntry.objects.get(booking=booking)
    assert entry.status == PartnerLedgerEntry.Status.PENDING

    resolve_case(
        case_id=case.id,
        expected_version=case.version,
        resolution="SETTLED",
        note="Partner redid the work at no charge; customer satisfied.",
        actor=_operator(),
    )

    entry.refresh_from_db()
    assert entry.status == PartnerLedgerEntry.Status.AVAILABLE


def test_closing_one_case_does_not_release_money_another_is_still_holding() -> None:
    """Two investigations can hold one visit — a quality complaint and a safety report.

    Releasing on the first close would pay a Partner out from under an open safety case.
    """

    booked = create_booked_group(key_prefix="case-two-holds")
    _deliver(booked, key="case-two-holds")
    booking = booked.booking
    booking.payout_hold = True
    booking.save(update_fields=("payout_hold",))
    settle_booking_earning(booking_id=booking.id)
    quality = open_case(
        kind=OperationsCase.Kind.QUALITY,
        summary="Quality complaint.",
        booking_id=booking.id,
        opened_by=_operator(),
    )
    safety = open_case(
        kind=OperationsCase.Kind.SAFETY,
        summary="Reported damage to a wall.",
        booking_id=booking.id,
        opened_by=_operator(),
    )

    resolve_case(
        case_id=quality.id,
        expected_version=quality.version,
        resolution="SETTLED",
        note="Quality resolved.",
        actor=_operator(),
    )

    entry = PartnerLedgerEntry.objects.get(booking=booking)
    assert entry.status == PartnerLedgerEntry.Status.PENDING, (
        "money was released while a safety case was still open"
    )

    resolve_case(
        case_id=safety.id,
        expected_version=safety.version,
        resolution="DOCUMENTED_NO_ACTION",
        note="Damage predated the visit; photographs on file.",
        actor=_operator(),
    )

    entry.refresh_from_db()
    assert entry.status == PartnerLedgerEntry.Status.AVAILABLE


def test_a_case_is_about_exactly_one_subject() -> None:
    booked = create_booked_group(key_prefix="case-subject")

    with pytest.raises(CaseInvalidApiError):
        open_case(
            kind=OperationsCase.Kind.QUALITY,
            summary="About two things at once.",
            booking_id=booked.booking.id,
            partner_id=booked.partner.id,
            opened_by=_operator(),
        )


def test_opening_the_same_case_twice_under_one_key_opens_one() -> None:
    booked = create_booked_group(key_prefix="case-idem")

    first = open_case(
        kind=OperationsCase.Kind.LATE_NO_SHOW,
        summary="Partner did not arrive.",
        booking_id=booked.booking.id,
        opened_by=_operator(),
        idempotency_key=f"late:{booked.booking.id}",
    )
    second = open_case(
        kind=OperationsCase.Kind.LATE_NO_SHOW,
        summary="Partner did not arrive.",
        booking_id=booked.booking.id,
        opened_by=_operator(),
        idempotency_key=f"late:{booked.booking.id}",
    )

    assert first.id == second.id
    assert OperationsCase.objects.filter(booking=booked.booking).count() == 1
