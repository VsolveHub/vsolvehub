"""Deleting a conversation: the owner's chat and its messages go for good; bookings stay."""

from datetime import timedelta
from http import HTTPStatus
from uuid import uuid4

import pytest
from django.utils import timezone
from pytest_django.fixtures import SettingsWrapper
from rest_framework.test import APIClient

from apps.assistant.models import AssistantBooking, AssistantMessage, AssistantSession
from apps.assistant.services import append_message, create_session
from apps.carts.models import BookingGroup, CheckoutSession
from apps.identity.models import User
from tests.assistant.test_progress_and_confirmation import _linked_session
from tests.carts.test_booking_group_payment_entry import _confirmed_group

pytestmark = pytest.mark.django_db(transaction=True)

Role = AssistantMessage.Role


@pytest.fixture(autouse=True)
def enabled(settings: SettingsWrapper) -> None:
    settings.ASSISTANT_ENABLED = True


def _customer(phone_number: str) -> User:
    return User.objects.create_user(phone_number=phone_number)


def _client(user: User | None = None) -> APIClient:
    client = APIClient()
    if user is not None:
        client.force_authenticate(user)
    return client


def _chat(user: User) -> AssistantSession:
    session, _token = create_session(user=user)
    append_message(session, role=Role.USER, text="AC not cooling")
    append_message(session, role=Role.ASSISTANT, text="Which day suits you?")
    return session


def _url(conversation_id: object) -> str:
    return f"/api/v1/assistant/conversations/{conversation_id}/"


def test_the_owner_deletes_a_chat_and_it_is_gone_from_every_device() -> None:
    me = _customer("+919811111111")
    session = _chat(me)

    response = _client(me).delete(_url(session.id))

    assert response.status_code == HTTPStatus.NO_CONTENT
    assert not AssistantSession.objects.filter(id=session.id).exists()
    assert not AssistantMessage.objects.filter(session_id=session.id).exists()
    # Another phone no longer lists it, and cannot open it.
    assert _client(me).get("/api/v1/assistant/history/").json() == []
    assert _client(me).get(_url(session.id)).status_code == HTTPStatus.NOT_FOUND


def test_deleting_again_is_not_found_and_changes_nothing() -> None:
    me = _customer("+919811111111")
    session = _chat(me)
    client = _client(me)
    client.delete(_url(session.id))

    again = client.delete(_url(session.id))

    assert again.status_code == HTTPStatus.NOT_FOUND


def test_nobody_can_delete_someone_elses_chat() -> None:
    me = _customer("+919811111111")
    theirs = _chat(_customer("+919822222222"))

    response = _client(me).delete(_url(theirs.id))

    assert response.status_code == HTTPStatus.NOT_FOUND
    assert AssistantSession.objects.filter(id=theirs.id).exists()


def test_deleting_needs_a_signed_in_customer() -> None:
    session = _chat(_customer("+919811111111"))

    response = _client().delete(_url(session.id))

    assert response.status_code in (HTTPStatus.UNAUTHORIZED, HTTPStatus.FORBIDDEN)
    assert AssistantSession.objects.filter(id=session.id).exists()


def test_an_unknown_id_is_not_found() -> None:
    me = _customer("+919811111111")

    assert _client(me).delete(_url(uuid4())).status_code == HTTPStatus.NOT_FOUND


def test_a_chat_cannot_be_deleted_while_an_answer_is_being_written() -> None:
    me = _customer("+919811111111")
    session = _chat(me)
    AssistantSession.objects.filter(id=session.id).update(
        busy_until=timezone.now() + timedelta(seconds=60)
    )

    response = _client(me).delete(_url(session.id))

    assert response.status_code == HTTPStatus.CONFLICT
    assert AssistantSession.objects.filter(id=session.id).exists()


def test_a_customer_can_delete_their_chat_even_with_the_assistant_switched_off(
    settings: SettingsWrapper,
) -> None:
    settings.ASSISTANT_ENABLED = False
    me = _customer("+919811111111")
    session = _chat(me)

    response = _client(me).delete(_url(session.id))

    assert response.status_code == HTTPStatus.NO_CONTENT
    assert not AssistantSession.objects.filter(id=session.id).exists()


def test_deleting_a_chat_keeps_the_booking_it_made() -> None:
    _client_unused, checkout_body = _confirmed_group(suffix="93", key_prefix="assistant-delete")
    checkout = CheckoutSession.objects.get(id=checkout_body["id"])
    group_id = checkout.booking_group_id
    session = _linked_session(checkout, announced="")
    owner = User.objects.get(id=checkout.customer_id)

    response = _client(owner).delete(_url(session.id))

    assert response.status_code == HTTPStatus.NO_CONTENT
    assert not AssistantBooking.objects.filter(session_id=session.id).exists()
    # The booking itself is the system of record and stays in the Customer's bookings.
    assert CheckoutSession.objects.filter(id=checkout.id).exists()
    assert BookingGroup.objects.filter(id=group_id).exists()
