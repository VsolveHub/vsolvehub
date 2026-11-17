"""Opening and continuing a conversation by its id, as the signed-in Customer who owns it.

This is how a second device carries on a chat it holds no token for: the history list gives it
the id, and ownership is the whole check.
"""

from http import HTTPStatus
from typing import Any
from uuid import uuid4

import pytest
from pytest_django.fixtures import SettingsWrapper
from rest_framework.test import APIClient

from apps.assistant.models import AssistantMessage, AssistantSession
from apps.assistant.services import GREETING, append_message, create_session
from apps.identity.models import User
from tests.assistant.test_api_and_agent import ScriptedModel, _reply, _use

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


def _send(client: APIClient, conversation_id: object, text: str, message_id: str) -> Any:
    return client.post(
        f"{_url(conversation_id)}messages/",
        {"text": text, "client_message_id": message_id},
        format="json",
    )


def test_the_owner_opens_their_conversation_by_id_without_its_token() -> None:
    me = _customer("+919811111111")
    session = _chat(me)

    response = _client(me).get(_url(session.id))

    assert response.status_code == HTTPStatus.OK
    body = response.json()
    assert [m["text"] for m in body["messages"]] == [
        GREETING,
        "AC not cooling",
        "Which day suits you?",
    ]
    assert body["signed_in"] is True
    assert body["is_answering"] is False


def test_a_conversation_started_signed_in_opens_by_the_id_it_was_given(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Starting a chat checks a model is configured; tests stand one in.
    _use(monkeypatch, ScriptedModel([]))
    me = _customer("+919811111111")
    client = _client(me)

    started = client.post("/api/v1/assistant/conversations/")

    assert started.status_code == HTTPStatus.CREATED, started.json()
    conversation_id = started.json()["conversation_id"]
    opened = client.get(_url(conversation_id))
    assert opened.status_code == HTTPStatus.OK
    assert opened.json() == started.json()["conversation"]


def test_a_second_device_sees_exactly_what_the_first_one_does() -> None:
    me = _customer("+919811111111")
    session = _chat(me)

    first = _client(me).get(_url(session.id)).json()
    second = _client(me).get(_url(session.id)).json()

    assert first == second


def test_someone_elses_conversation_looks_the_same_as_one_that_does_not_exist() -> None:
    me = _customer("+919811111111")
    stranger = _customer("+919822222222")
    theirs = _chat(stranger)

    other = _client(me).get(_url(theirs.id))
    missing = _client(me).get(_url(uuid4()))

    assert other.status_code == missing.status_code == HTTPStatus.NOT_FOUND
    assert other.json()["error"]["code"] == missing.json()["error"]["code"]


def test_a_conversation_nobody_has_claimed_cannot_be_opened_by_id() -> None:
    me = _customer("+919811111111")
    session, _token = create_session(user=None)

    assert _client(me).get(_url(session.id)).status_code == HTTPStatus.NOT_FOUND


def test_opening_by_id_needs_a_signed_in_customer() -> None:
    session = _chat(_customer("+919811111111"))

    response = _client().get(_url(session.id))

    assert response.status_code in (HTTPStatus.UNAUTHORIZED, HTTPStatus.FORBIDDEN)


def test_an_id_that_is_not_a_uuid_is_not_found() -> None:
    me = _customer("+919811111111")

    assert _client(me).get(_url("not-a-uuid")).status_code == HTTPStatus.NOT_FOUND


def test_a_switched_off_assistant_refuses_opening_by_id(settings: SettingsWrapper) -> None:
    settings.ASSISTANT_ENABLED = False
    me = _customer("+919811111111")
    session = _chat(me)

    response = _client(me).get(_url(session.id))

    assert response.status_code == HTTPStatus.SERVICE_UNAVAILABLE
    assert response.json()["error"]["code"] == "assistant_unavailable"


def test_the_owner_continues_the_conversation_from_another_device(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    model = _use(monkeypatch, ScriptedModel([_reply("Tomorrow evening works.")]))
    me = _customer("+919811111111")
    session = _chat(me)

    response = _send(_client(me), session.id, "tomorrow evening", "msg-00000001")

    assert response.status_code == HTTPStatus.OK
    answer = response.json()["messages"]
    assert [m["sender"] for m in answer] == ["customer", "assistant"]
    assert answer[1]["text"] == "Tomorrow evening works."
    # The assistant carried on with the whole earlier chat, not a blank one.
    seen_text = [turn.text for turn in model.seen[0]]
    assert "AC not cooling" in seen_text
    assert AssistantMessage.objects.filter(session=session, role=Role.USER).count() == 2


def test_resending_the_same_message_id_replays_the_stored_answer(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _use(monkeypatch, ScriptedModel([_reply("Tomorrow evening works.")]))
    me = _customer("+919811111111")
    session = _chat(me)
    client = _client(me)

    first = _send(client, session.id, "tomorrow evening", "msg-00000001")
    again = _send(client, session.id, "tomorrow evening", "msg-00000001")

    assert again.status_code == HTTPStatus.OK
    assert again.json() == first.json()
    assert AssistantMessage.objects.filter(session=session, role=Role.USER).count() == 2


def test_nobody_can_send_into_someone_elses_conversation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _use(monkeypatch, ScriptedModel([]))
    me = _customer("+919811111111")
    theirs = _chat(_customer("+919822222222"))

    response = _send(_client(me), theirs.id, "hello", "msg-00000001")

    assert response.status_code == HTTPStatus.NOT_FOUND
    assert AssistantMessage.objects.filter(session=theirs, role=Role.USER).count() == 1


def test_sending_by_id_needs_a_signed_in_customer(monkeypatch: pytest.MonkeyPatch) -> None:
    _use(monkeypatch, ScriptedModel([]))
    session = _chat(_customer("+919811111111"))

    response = _send(_client(), session.id, "hello", "msg-00000001")

    assert response.status_code in (HTTPStatus.UNAUTHORIZED, HTTPStatus.FORBIDDEN)


def test_sending_by_id_rejects_bad_input(monkeypatch: pytest.MonkeyPatch) -> None:
    _use(monkeypatch, ScriptedModel([]))
    me = _customer("+919811111111")
    session = _chat(me)

    empty = _send(_client(me), session.id, "", "msg-00000001")
    bad_id = _send(_client(me), session.id, "hello", "x")

    assert empty.status_code == HTTPStatus.BAD_REQUEST
    assert bad_id.status_code == HTTPStatus.BAD_REQUEST
