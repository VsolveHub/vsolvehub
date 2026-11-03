"""Cases name who they are about and can be searched.

Before this a case showed only ids, so an operator had to open the booking to learn who to call,
and the queue could not be searched for a customer's phone or a booking id.
"""

import uuid
from http import HTTPStatus

import pytest
from rest_framework.test import APIClient

from apps.cases.models import OperationsCase
from apps.cases.services import open_case
from apps.identity.models import Role, User, UserRole
from tests.fulfilment.conftest import create_booked_group
from tests.helpers import force_role_client

pytestmark = pytest.mark.django_db(transaction=True)


def _operations_client() -> tuple[APIClient, User]:
    user = User.objects.create_user(
        phone_number=f"+919{uuid.uuid4().int % 10**9:09d}", full_name="Asha Ops"
    )
    role, _ = Role.objects.get_or_create(code="operations", defaults={"name": "Operations"})
    UserRole.objects.get_or_create(user=user, role=role, revoked_at=None)
    return force_role_client(user=user, role_code="operations"), user


def test_a_booking_case_names_the_customer_and_partner_with_phones() -> None:
    booked = create_booked_group(key_prefix="case-people")
    client, operator = _operations_client()
    case = open_case(
        kind=OperationsCase.Kind.QUALITY,
        summary="Leak came back.",
        booking_id=booked.booking.id,
        opened_by=operator,
    )

    detail = client.get(f"/api/v1/operations/cases/{case.id}/").json()
    row = next(
        r
        for r in client.get("/api/v1/operations/cases/").json()["results"]
        if r["id"] == str(case.id)
    )

    roles = {person["role"]: person for person in detail["people"]}
    assert roles["Customer"]["phone"] == booked.customer.phone_number
    assert roles["Partner"]["name"] == booked.booking.partner.display_name
    assert row["people"] == detail["people"]
    assert detail["owner_name"] is None


def test_claimed_by_is_a_name_not_an_id() -> None:
    booked = create_booked_group(key_prefix="case-owner")
    client, operator = _operations_client()
    case = open_case(
        kind=OperationsCase.Kind.QUALITY,
        summary="Claimed case.",
        booking_id=booked.booking.id,
        opened_by=operator,
    )
    OperationsCase.objects.filter(id=case.id).update(owner=operator)

    detail = client.get(f"/api/v1/operations/cases/{case.id}/").json()

    assert detail["owner_name"] == "Asha Ops"


def test_search_finds_a_case_by_customer_phone_booking_id_or_summary() -> None:
    booked = create_booked_group(key_prefix="case-search")
    other = create_booked_group(key_prefix="case-search-other")
    client, operator = _operations_client()
    case = open_case(
        kind=OperationsCase.Kind.QUALITY,
        summary="Ceiling fan wobbles",
        booking_id=booked.booking.id,
        opened_by=operator,
    )
    open_case(
        kind=OperationsCase.Kind.QUALITY,
        summary="Unrelated",
        booking_id=other.booking.id,
        opened_by=operator,
    )

    def ids(query: str) -> set[str]:
        response = client.get("/api/v1/operations/cases/", {"q": query})
        assert response.status_code == HTTPStatus.OK
        return {row["id"] for row in response.json()["results"]}

    assert ids(booked.customer.phone_number[-7:]) == {str(case.id)}
    assert ids(str(booked.booking.id)) == {str(case.id)}
    assert ids("fan wobbles") == {str(case.id)}


def test_status_takes_a_comma_list_so_still_open_is_one_request() -> None:
    booked = create_booked_group(key_prefix="case-status-list")
    client, operator = _operations_client()
    case = open_case(
        kind=OperationsCase.Kind.QUALITY,
        summary="Open one",
        booking_id=booked.booking.id,
        opened_by=operator,
    )
    OperationsCase.objects.filter(id=case.id).update(status=OperationsCase.Status.WAITING)

    rows = client.get("/api/v1/operations/cases/", {"status": "OPEN,IN_PROGRESS,WAITING"}).json()[
        "results"
    ]

    assert str(case.id) in {row["id"] for row in rows}
