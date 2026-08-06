"""The Operations case and payout surfaces published in 1.17.0.

The domain rules are covered elsewhere. This file proves what only exists once there is a door:
authorization, the required headers, and the one projection field a console cannot be allowed to
compute for itself.
"""

import uuid
from datetime import timedelta
from http import HTTPStatus

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.cases.models import ALLOWED_RESOLUTIONS, OperationsCase
from apps.cases.services import open_case
from apps.identity.models import Role, User, UserRole
from apps.payouts.models import PayoutBatch
from tests.fulfilment.conftest import create_booked_group
from tests.helpers import force_role_client

pytestmark = pytest.mark.django_db(transaction=True)


def _user() -> User:
    return User.objects.create_user(phone_number=f"+919{uuid.uuid4().int % 10**9:09d}")


def _operations_client() -> tuple[APIClient, User]:
    user = _user()
    role, _ = Role.objects.get_or_create(code="operations", defaults={"name": "Operations"})
    UserRole.objects.get_or_create(user=user, role=role, revoked_at=None)
    return force_role_client(user=user, role_code="operations"), user


def _key(label: str) -> str:
    return f"{label}-{uuid.uuid4()}"


def _post(client: APIClient, url: str, payload: dict[str, object], key: str) -> object:
    return client.post(url, payload, format="json", HTTP_IDEMPOTENCY_KEY=key)


# --------------------------------------------------------------------------------------------
# Authorization
# --------------------------------------------------------------------------------------------


def test_a_customer_cannot_read_the_case_queue() -> None:
    """A case can quote a Customer's complaint verbatim and name a Partner in a safety report.
    There is no non-Operations audience for it at all."""

    booked = create_booked_group(key_prefix="cases-authz")

    response = booked.client.get("/api/v1/operations/cases/")

    assert response.status_code == HTTPStatus.FORBIDDEN


def test_a_customer_cannot_read_a_payout_batch() -> None:
    booked = create_booked_group(key_prefix="payout-authz")

    response = booked.client.get("/api/v1/operations/payout-batches/")

    assert response.status_code == HTTPStatus.FORBIDDEN


def test_an_anonymous_caller_reaches_nothing() -> None:
    anonymous = APIClient()

    for path in (
        "/api/v1/operations/cases/",
        "/api/v1/operations/payout-batches/",
        "/api/v1/operations/kill-switches/",
        "/api/v1/partner/earnings/",
    ):
        assert anonymous.get(path).status_code in (
            HTTPStatus.UNAUTHORIZED,
            HTTPStatus.FORBIDDEN,
        ), path


# --------------------------------------------------------------------------------------------
# Cases
# --------------------------------------------------------------------------------------------


def test_opening_a_case_requires_an_idempotency_key() -> None:
    client, _actor = _operations_client()
    booked = create_booked_group(key_prefix="cases-nokey")

    response = client.post(
        "/api/v1/operations/cases/",
        {
            "kind": OperationsCase.Kind.QUALITY,
            "summary": "Customer reported poor work.",
            "booking_id": str(booked.booking.id),
        },
        format="json",
    )

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert not OperationsCase.objects.exists()


def test_a_case_publishes_the_resolutions_its_kind_allows() -> None:
    """The console renders this list rather than carrying its own copy.

    The set differs per kind, and a client-side map would offer a reviewer a resolution the
    server refuses the first time the two drift apart.
    """

    client, _actor = _operations_client()
    booked = create_booked_group(key_prefix="cases-resolutions")

    response = _post(
        client,
        "/api/v1/operations/cases/",
        {
            "kind": OperationsCase.Kind.PAYMENT,
            "summary": "Provider and domain state disagree.",
            "booking_id": str(booked.booking.id),
        },
        _key("open"),
    )

    assert response.status_code == HTTPStatus.CREATED, response.json()
    body = response.json()
    assert body["allowed_resolutions"] == sorted(ALLOWED_RESOLUTIONS[OperationsCase.Kind.PAYMENT])
    assert body["owner_team"] == OperationsCase.Team.FINANCE
    assert body["due_at"] and body["server_now"]


def test_a_case_cannot_close_on_a_resolution_outside_its_kind() -> None:
    client, _actor = _operations_client()
    booked = create_booked_group(key_prefix="cases-badresolution")
    case = open_case(
        kind=OperationsCase.Kind.PAYMENT,
        summary="Ambiguous capture.",
        booking_id=booked.booking.id,
        opened_by=_user(),
    )

    response = _post(
        client,
        f"/api/v1/operations/cases/{case.id}/resolve/",
        {
            "expected_version": case.version,
            "resolution": "CUSTOMER_EMAILED",
            "note": "Sent them a message.",
        },
        _key("resolve"),
    )

    assert response.status_code == HTTPStatus.BAD_REQUEST
    case.refresh_from_db()
    assert case.status != OperationsCase.Status.RESOLVED


def test_a_stale_case_version_is_a_typed_conflict() -> None:
    client, _actor = _operations_client()
    booked = create_booked_group(key_prefix="cases-version")
    case = open_case(
        kind=OperationsCase.Kind.QUALITY,
        summary="Quality complaint.",
        booking_id=booked.booking.id,
        opened_by=_user(),
    )

    response = _post(
        client,
        f"/api/v1/operations/cases/{case.id}/claim/",
        {"expected_version": case.version + 99},
        _key("claim"),
    )

    assert response.status_code == HTTPStatus.CONFLICT
    assert response.json()["error"]["code"] == "operations_case_version_conflict"


def test_adding_a_note_records_it_and_moves_nothing() -> None:
    """Sending a message is not progress. The plan is explicit that a case may not close
    because somebody was contacted."""

    client, _actor = _operations_client()
    booked = create_booked_group(key_prefix="cases-note")
    case = open_case(
        kind=OperationsCase.Kind.QUALITY,
        summary="Quality complaint.",
        booking_id=booked.booking.id,
        opened_by=_user(),
    )
    before = case.status

    response = client.post(
        f"/api/v1/operations/cases/{case.id}/notes/",
        {"body": "Called the customer, left a voicemail.", "is_communication": True},
        format="json",
    )

    assert response.status_code == HTTPStatus.CREATED, response.json()
    case.refresh_from_db()
    assert case.status == before


def test_the_queue_is_paginated_with_an_envelope_not_a_bare_array() -> None:
    """The published schema and the response have to agree. A contract that says "array" while
    the server returns `{next, previous, results}` gives every generated client `page.next` on
    an array — undefined, silently."""

    client, _actor = _operations_client()

    body = client.get("/api/v1/operations/cases/").json()

    assert set(body) >= {"next", "previous", "results"}
    assert isinstance(body["results"], list)


# --------------------------------------------------------------------------------------------
# Payouts
# --------------------------------------------------------------------------------------------


def test_approving_a_payout_batch_without_a_step_up_is_refused() -> None:
    """The largest money-moving action in the platform. Maker-checker means two people are
    involved; the step-up means neither of them is a stolen session on an unlocked laptop."""

    client, actor = _operations_client()
    batch = PayoutBatch.objects.create(
        reference="stepup-1",
        status=PayoutBatch.Status.PENDING_APPROVAL,
        period_start=timezone.now() - timedelta(days=7),
        period_end=timezone.now() + timedelta(days=1),
        proposed_by=_user(),
    )
    assert actor.id != batch.proposed_by_id

    response = _post(
        client,
        f"/api/v1/operations/payout-batches/{batch.id}/approve/",
        {"expected_version": batch.version},
        _key("approve"),
    )

    assert response.status_code in (HTTPStatus.UNAUTHORIZED, HTTPStatus.FORBIDDEN)
    batch.refresh_from_db()
    assert batch.status == PayoutBatch.Status.PENDING_APPROVAL
    assert batch.approved_by is None


def test_cancelling_a_batch_needs_no_step_up() -> None:
    """Cancelling only returns money to the pool. Making the safe direction as heavy as the
    dangerous one trains people to leave bad batches sitting approved."""

    client, actor = _operations_client()
    batch = PayoutBatch.objects.create(
        reference="cancel-1",
        status=PayoutBatch.Status.PENDING_APPROVAL,
        period_start=timezone.now() - timedelta(days=7),
        period_end=timezone.now() + timedelta(days=1),
        proposed_by=actor,
    )

    response = _post(
        client,
        f"/api/v1/operations/payout-batches/{batch.id}/cancel/",
        {"expected_version": batch.version},
        _key("cancel"),
    )

    assert response.status_code == HTTPStatus.OK, response.json()
    batch.refresh_from_db()
    assert batch.status == PayoutBatch.Status.CANCELLED
    assert batch.cancelled_by_id == actor.id


def test_a_batch_publishes_both_signatures_so_a_console_can_grey_out_self_approval() -> None:
    client, _actor = _operations_client()
    proposer = _user()
    batch = PayoutBatch.objects.create(
        reference="signatures-1",
        status=PayoutBatch.Status.PENDING_APPROVAL,
        period_start=timezone.now() - timedelta(days=7),
        period_end=timezone.now() + timedelta(days=1),
        proposed_by=proposer,
    )

    body = client.get(f"/api/v1/operations/payout-batches/{batch.id}/").json()

    assert body["proposed_by_id"] == str(proposer.id)
    assert body["approved_by_id"] is None


# --------------------------------------------------------------------------------------------
# Kill switches
# --------------------------------------------------------------------------------------------


def test_engaging_a_kill_switch_requires_a_reason() -> None:
    client, _actor = _operations_client()

    response = client.post(
        "/api/v1/operations/kill-switches/",
        {"scope": "PAYOUTS", "target": "", "reason": ""},
        format="json",
    )

    assert response.status_code == HTTPStatus.BAD_REQUEST


def test_a_switch_records_who_engaged_it_and_why() -> None:
    """ "Why did notifications stop at 3am" should have an answer on the screen."""

    client, actor = _operations_client()

    engaged = client.post(
        "/api/v1/operations/kill-switches/",
        {"scope": "NOTIFICATIONS", "target": "", "reason": "Provider incident"},
        format="json",
    )

    assert engaged.status_code == HTTPStatus.OK, engaged.json()
    body = engaged.json()
    assert body["is_engaged"] is True
    assert body["reason"] == "Provider incident"
    assert body["engaged_by_id"] == str(actor.id)


# --------------------------------------------------------------------------------------------
# Partner earnings
# --------------------------------------------------------------------------------------------


def test_a_partner_reads_their_own_earnings_with_no_identifier_to_get_wrong() -> None:
    booked = create_booked_group(key_prefix="earnings-scope")
    role, _ = Role.objects.get_or_create(code="partner", defaults={"name": "Partner"})
    UserRole.objects.get_or_create(user=booked.partner.user, role=role, revoked_at=None)
    client = force_role_client(user=booked.partner.user, role_code="partner")

    response = client.get("/api/v1/partner/earnings/")

    assert response.status_code == HTTPStatus.OK, response.json()
    body = response.json()
    assert set(body) >= {
        "pending_paise",
        "available_paise",
        "reserved_paise",
        "paid_paise",
        "server_now",
    }


def test_the_balance_is_split_by_state_rather_than_reported_as_one_number() -> None:
    """ "You have X" is not true in any useful sense when part of it is held behind an open
    quality case."""

    booked = create_booked_group(key_prefix="earnings-split")
    role, _ = Role.objects.get_or_create(code="partner", defaults={"name": "Partner"})
    UserRole.objects.get_or_create(user=booked.partner.user, role=role, revoked_at=None)
    client = force_role_client(user=booked.partner.user, role_code="partner")

    body = client.get("/api/v1/partner/earnings/").json()

    assert "total_paise" not in body
    assert body["pending_paise"] == 0
    assert body["available_paise"] == 0


def test_a_customer_cannot_read_partner_earnings() -> None:
    booked = create_booked_group(key_prefix="earnings-authz")

    response = booked.client.get("/api/v1/partner/earnings/")

    assert response.status_code == HTTPStatus.FORBIDDEN
