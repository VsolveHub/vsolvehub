"""The Operations home screen's numbers.

Counted over the whole queue, not over the page the console happens to be holding. That is the
whole reason this endpoint exists, so it is the thing these tests pin hardest: a queue deeper
than one page must still report its real depth.
"""

import uuid
from datetime import timedelta
from http import HTTPStatus

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.cases.models import OperationsCase
from apps.cases.services import claim_case, open_case
from apps.identity.models import Role, User, UserRole
from tests.fulfilment.conftest import create_booked_group
from tests.helpers import force_role_client

pytestmark = pytest.mark.django_db(transaction=True)

SUMMARY_URL = "/api/v1/operations/cases/summary/"
CASE_PAGE_SIZE = 50
DEEPER_THAN_ONE_PAGE = CASE_PAGE_SIZE + 7
OVERDUE_BY_MINUTES = 75
BOTH_DISPATCH_CASES = 2


def _user() -> User:
    return User.objects.create_user(phone_number=f"+919{uuid.uuid4().int % 10**9:09d}")


def _operations_client() -> tuple[APIClient, User]:
    user = _user()
    role, _ = Role.objects.get_or_create(code="operations", defaults={"name": "Operations"})
    UserRole.objects.get_or_create(user=user, role=role, revoked_at=None)
    return force_role_client(user=user, role_code="operations"), user


def _team(body: dict[str, object], team: str) -> dict[str, object]:
    return next(row for row in body["teams"] if row["owner_team"] == team)


def test_a_customer_cannot_read_the_queue_summary() -> None:
    """Queue depth by team is operational information, not a public statistic."""

    customer = _user()
    client = APIClient()
    client.force_authenticate(customer)

    assert client.get(SUMMARY_URL).status_code == HTTPStatus.FORBIDDEN


def test_the_summary_counts_the_whole_queue_not_one_page() -> None:
    """The bug this endpoint exists to prevent.

    A console counting its own rows would report the first fifty as the total and show a calm
    dashboard over a queue that is drowning.
    """

    client, _actor = _operations_client()
    opener = _user()
    booked = create_booked_group(key_prefix="summary-depth")
    for _index in range(DEEPER_THAN_ONE_PAGE):
        open_case(
            kind=OperationsCase.Kind.ASSIGNMENT,
            summary="Unstaffed visit.",
            booking_id=booked.booking.id,
            opened_by=opener,
        )

    body = client.get(SUMMARY_URL).json()

    assert _team(body, OperationsCase.Team.DISPATCH)["open"] == DEEPER_THAN_ONE_PAGE
    assert _team(body, OperationsCase.Team.DISPATCH)["unclaimed"] == DEEPER_THAN_ONE_PAGE
    assert len(client.get("/api/v1/operations/cases/").json()["results"]) == CASE_PAGE_SIZE


def test_every_team_is_reported_even_with_an_empty_queue() -> None:
    """A team that disappears when its queue empties is indistinguishable from one that failed
    to load. Zero is an answer; a missing row is not."""

    client, _actor = _operations_client()

    body = client.get(SUMMARY_URL).json()

    assert {row["owner_team"] for row in body["teams"]} == {
        team.value for team in OperationsCase.Team
    }
    assert all(row["open"] == 0 and row["unclaimed"] == 0 for row in body["teams"])
    assert body["breaching_sla"] == 0
    assert body["oldest_overdue_minutes"] is None


def test_a_breach_is_counted_and_its_age_reported() -> None:
    client, _actor = _operations_client()
    booked = create_booked_group(key_prefix="summary-breach")
    case = open_case(
        kind=OperationsCase.Kind.ASSIGNMENT,
        summary="Unstaffed visit.",
        booking_id=booked.booking.id,
        opened_by=_user(),
    )
    OperationsCase.objects.filter(id=case.id).update(
        due_at=timezone.now() - timedelta(minutes=OVERDUE_BY_MINUTES)
    )

    body = client.get(SUMMARY_URL).json()

    assert body["breaching_sla"] == 1
    assert body["oldest_overdue_minutes"] == OVERDUE_BY_MINUTES


def test_a_resolved_case_leaves_the_queue_depth() -> None:
    """Queue depth is work outstanding. A resolved case is history."""

    client, _actor = _operations_client()
    booked = create_booked_group(key_prefix="summary-resolved")
    case = open_case(
        kind=OperationsCase.Kind.ASSIGNMENT,
        summary="Unstaffed visit.",
        booking_id=booked.booking.id,
        opened_by=_user(),
    )
    OperationsCase.objects.filter(id=case.id).update(
        status=OperationsCase.Status.CANCELLED,
        due_at=timezone.now() - timedelta(minutes=30),
    )

    body = client.get(SUMMARY_URL).json()

    assert _team(body, OperationsCase.Team.DISPATCH)["open"] == 0
    assert body["breaching_sla"] == 0


def test_mine_counts_only_the_callers_own_claimed_cases() -> None:
    client, actor = _operations_client()
    booked = create_booked_group(key_prefix="summary-mine")
    mine = open_case(
        kind=OperationsCase.Kind.ASSIGNMENT,
        summary="Mine.",
        booking_id=booked.booking.id,
        opened_by=_user(),
    )
    open_case(
        kind=OperationsCase.Kind.ASSIGNMENT,
        summary="Somebody else's.",
        booking_id=booked.booking.id,
        opened_by=_user(),
    )
    claim_case(case_id=mine.id, actor=actor, expected_version=mine.version)

    body = client.get(SUMMARY_URL).json()

    assert body["mine_open"] == 1
    assert _team(body, OperationsCase.Team.DISPATCH)["open"] == BOTH_DISPATCH_CASES
    assert _team(body, OperationsCase.Team.DISPATCH)["unclaimed"] == 1


def test_an_already_overdue_case_is_not_also_counted_as_nearing_its_deadline() -> None:
    """Otherwise the same case is reported twice, on two cards, as two problems."""

    client, actor = _operations_client()
    booked = create_booked_group(key_prefix="summary-duesoon")
    case = open_case(
        kind=OperationsCase.Kind.ASSIGNMENT,
        summary="Late already.",
        booking_id=booked.booking.id,
        opened_by=_user(),
    )
    claim_case(case_id=case.id, actor=actor, expected_version=case.version)
    OperationsCase.objects.filter(id=case.id).update(due_at=timezone.now() - timedelta(minutes=5))

    body = client.get(SUMMARY_URL).json()

    assert body["mine_open"] == 1
    assert body["mine_due_soon"] == 0
    assert body["breaching_sla"] == 1


def test_the_owner_filter_reads_the_session_not_a_supplied_id() -> None:
    """`owner=me` is an authorization boundary. There is deliberately no `owner=<uuid>`."""

    client, actor = _operations_client()
    booked = create_booked_group(key_prefix="summary-ownerfilter")
    mine = open_case(
        kind=OperationsCase.Kind.ASSIGNMENT,
        summary="Mine.",
        booking_id=booked.booking.id,
        opened_by=_user(),
    )
    open_case(
        kind=OperationsCase.Kind.ASSIGNMENT,
        summary="Unclaimed.",
        booking_id=booked.booking.id,
        opened_by=_user(),
    )
    claim_case(case_id=mine.id, actor=actor, expected_version=mine.version)

    owned = client.get("/api/v1/operations/cases/?owner=me").json()["results"]
    assert [row["id"] for row in owned] == [str(mine.id)]
    unclaimed = client.get("/api/v1/operations/cases/?owner=unclaimed").json()["results"]
    assert len(unclaimed) == 1
    assert unclaimed[0]["id"] != str(mine.id)
