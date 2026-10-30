"""The public Contact form (contract 1.78.0): one message becomes one `CONTACT` case.

The Operations case queue is the monitored inbox. So the properties that matter are that a message
always lands there, owned and timed, with a way to reply; that a script cannot flood it; and that
the one kind allowed to have no subject does not loosen the rule for every other kind.
"""

import uuid
from collections.abc import Iterator
from http import HTTPStatus

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from apps.cases.models import ALLOWED_RESOLUTIONS, CASE_SUBJECT_FIELDS, OperationsCase
from apps.cases.services import open_case
from apps.identity.models import User
from apps.payouts.exceptions import CaseInvalidApiError

pytestmark = pytest.mark.django_db

URL = "/api/v1/support/contact/"
CONTACT_THROTTLE = 5


@pytest.fixture(autouse=True)
def clear_throttle() -> Iterator[None]:
    cache.clear()
    yield
    cache.clear()


def _message(**overrides: object) -> dict[str, object]:
    body: dict[str, object] = {
        "name": "Asha Rao",
        "phone_number": "+919876543210",
        "email": "",
        "topic": "payment",
        "message": "I was charged twice for my fan installation. Please check.",
    }
    body.update(overrides)
    return body


def test_a_message_opens_a_contact_case_owned_by_booking_support() -> None:
    response = APIClient().post(URL, _message(), format="json")

    assert response.status_code == HTTPStatus.CREATED
    reference = response.json()["reference"]
    case = OperationsCase.objects.get()
    assert reference == f"C-{str(case.id)[:8].upper()}"
    assert case.kind == OperationsCase.Kind.CONTACT
    assert case.owner_team == OperationsCase.Team.BOOKING_SUPPORT
    assert case.status == OperationsCase.Status.OPEN
    assert all(getattr(case, f"{field}_id") is None for field in CASE_SUBJECT_FIELDS)
    assert case.opened_by is None
    assert "Asha Rao" in case.summary
    assert "+919876543210" in case.detail
    assert "charged twice" in case.detail


def test_a_signed_in_sender_is_recorded_on_the_case() -> None:
    user = User.objects.create_user(phone_number="+919800012345")
    client = APIClient()
    client.force_authenticate(user=user)

    response = client.post(URL, _message(phone_number="", email="asha@example.com"), format="json")

    assert response.status_code == HTTPStatus.CREATED
    case = OperationsCase.objects.get()
    assert case.opened_by == user
    assert "Signed in as: +919800012345" in case.detail


def test_a_message_nobody_can_reply_to_is_refused() -> None:
    response = APIClient().post(URL, _message(phone_number="", email=""), format="json")

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert not OperationsCase.objects.exists()


def test_a_filled_honeypot_looks_accepted_but_opens_nothing() -> None:
    response = APIClient().post(URL, _message(website="http://spam.example"), format="json")

    assert response.status_code == HTTPStatus.CREATED
    assert not OperationsCase.objects.exists()


def test_a_flood_from_one_client_is_throttled() -> None:
    client = APIClient()
    for _ in range(CONTACT_THROTTLE):
        assert client.post(URL, _message(), format="json").status_code == HTTPStatus.CREATED

    response = client.post(URL, _message(), format="json")

    assert response.status_code == HTTPStatus.TOO_MANY_REQUESTS
    assert OperationsCase.objects.count() == CONTACT_THROTTLE


def test_a_contact_case_names_no_subject_and_other_kinds_still_need_exactly_one() -> None:
    with pytest.raises(CaseInvalidApiError):
        open_case(
            kind=OperationsCase.Kind.CONTACT,
            summary="Contact form · Something else · Ravi",
            partner_id=uuid.uuid4(),
        )
    with pytest.raises(CaseInvalidApiError):
        open_case(kind=OperationsCase.Kind.QUALITY, summary="A quality case about nothing")


def test_a_contact_case_closes_with_an_honest_outcome() -> None:
    assert ALLOWED_RESOLUTIONS[OperationsCase.Kind.CONTACT] == frozenset(
        {"ANSWERED", "DUPLICATE", "SPAM"}
    )
