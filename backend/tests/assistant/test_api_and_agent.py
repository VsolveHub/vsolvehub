"""The HTTP surface and the tool loop, with a scripted model standing in for the vendor."""

from collections.abc import Sequence
from datetime import timedelta
from http import HTTPStatus
from typing import Any

import pytest
from django.core.management import call_command
from django.utils import timezone
from pytest_django.fixtures import SettingsWrapper
from rest_framework.test import APIClient

from apps.assistant import views
from apps.assistant.agent import UNAVAILABLE_REPLY
from apps.assistant.llm import (
    ChatModelUnavailableError,
    ModelReply,
    ToolCall,
    ToolSpec,
    Turn,
)
from apps.assistant.models import AssistantMessage, AssistantSession
from apps.assistant.services import GREETING
from apps.identity.models import User

pytestmark = pytest.mark.django_db(transaction=True)

TOKEN = "HTTP_X_ASSISTANT_TOKEN"  # noqa: S105 - a WSGI header key, not a secret


class ScriptedModel:
    code = "scripted"
    model = "scripted-1"

    def __init__(self, outcomes: Sequence[ModelReply | Exception]) -> None:
        self._outcomes = list(outcomes)
        self.seen: list[list[Turn]] = []

    def complete(
        self, *, system: str, turns: Sequence[Turn], tools: Sequence[ToolSpec]
    ) -> ModelReply:
        assert "VSolveHub" in system
        assert {tool.name for tool in tools} >= {"search_services", "confirm_booking"}
        self.seen.append(list(turns))
        outcome = self._outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


def _reply(text: str = "", *calls: ToolCall) -> ModelReply:
    return ModelReply(
        text=text,
        tool_calls=tuple(calls),
        provider="scripted",
        model="scripted-1",
        input_tokens=100,
        output_tokens=10,
        finish_reason="stop",
    )


@pytest.fixture
def enabled(settings: SettingsWrapper) -> None:
    settings.ASSISTANT_ENABLED = True


def _use(monkeypatch: pytest.MonkeyPatch, model: ScriptedModel) -> ScriptedModel:
    monkeypatch.setattr(views, "chat_model_from_settings", lambda: model)
    return model


def _start(client: APIClient) -> str:
    response = client.post("/api/v1/assistant/conversations/")
    assert response.status_code == HTTPStatus.CREATED, response.json()
    return str(response.json()["conversation_token"])


def _send(client: APIClient, token: str, text: str, message_id: str) -> Any:
    return client.post(
        "/api/v1/assistant/conversation/messages/",
        {"text": text, "client_message_id": message_id},
        format="json",
        **{TOKEN: token},
    )


def test_a_disabled_assistant_refuses_to_start(settings: SettingsWrapper) -> None:
    settings.ASSISTANT_ENABLED = False

    response = APIClient().post("/api/v1/assistant/conversations/")

    assert response.status_code == HTTPStatus.SERVICE_UNAVAILABLE
    assert response.json()["error"]["code"] == "assistant_unavailable"


def test_a_disabled_assistant_refuses_reads_too(settings: SettingsWrapper) -> None:
    settings.ASSISTANT_ENABLED = False

    response = APIClient().get("/api/v1/assistant/conversation/", **{TOKEN: "any-token"})

    assert response.status_code == HTTPStatus.SERVICE_UNAVAILABLE
    assert response.json()["error"]["code"] == "assistant_unavailable"


@pytest.mark.usefixtures("enabled")
def test_a_conversation_opens_with_a_greeting_and_needs_its_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _use(monkeypatch, ScriptedModel([]))
    client = APIClient()
    token = _start(client)

    body = client.get("/api/v1/assistant/conversation/", **{TOKEN: token}).json()

    assert body["messages"][0] == {
        "sequence": 1,
        "sender": "assistant",
        "text": GREETING,
        "actions": [],
        "created_at": body["messages"][0]["created_at"],
    }
    assert body["signed_in"] is False
    assert client.get("/api/v1/assistant/conversation/").status_code == HTTPStatus.NOT_FOUND
    wrong = client.get("/api/v1/assistant/conversation/", **{TOKEN: "not-a-token"})
    assert wrong.status_code == HTTPStatus.NOT_FOUND
    assert not AssistantSession.objects.filter(token_hash=token).exists(), "only the hash is kept"


@pytest.mark.usefixtures("enabled")
def test_a_message_runs_a_tool_and_the_customer_never_sees_tool_data(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    call_command("seed_technician_catalog")
    model = _use(
        monkeypatch,
        ScriptedModel(
            [
                _reply("", ToolCall("call_1", "search_services", {"query": "switch socket"})),
                _reply("I found switch and socket repair. Which one do you need?"),
            ]
        ),
    )
    client = APIClient()
    token = _start(client)

    response = _send(client, token, "socket not working", "msg-00000001")

    assert response.status_code == HTTPStatus.OK, response.json()
    messages = response.json()["messages"]
    assert [m["sender"] for m in messages] == ["customer", "assistant"]
    assert messages[1]["text"].startswith("I found")
    assert messages[1]["actions"], "the search results come back as reply chips"
    assert all(a["action_type"] == "QUICK_REPLY" for a in messages[1]["actions"])
    session = AssistantSession.objects.get()
    tool_row = AssistantMessage.objects.get(session=session, role=AssistantMessage.Role.TOOL)
    assert tool_row.tool_results[0]["content"]["ok"] is True
    second_request = model.seen[1]
    assert [turn.role for turn in second_request] == ["user", "assistant", "tool"]
    assert session.input_tokens == 200


@pytest.mark.usefixtures("enabled")
def test_resending_a_message_replays_the_stored_answer(monkeypatch: pytest.MonkeyPatch) -> None:
    model = _use(monkeypatch, ScriptedModel([_reply("Hello! What do you need?")]))
    client = APIClient()
    token = _start(client)

    first = _send(client, token, "hi", "msg-00000002").json()
    second = _send(client, token, "hi", "msg-00000002").json()

    assert first == second
    assert len(model.seen) == 1


@pytest.mark.usefixtures("enabled")
def test_a_vendor_outage_becomes_an_apology_not_an_error(monkeypatch: pytest.MonkeyPatch) -> None:
    _use(monkeypatch, ScriptedModel([ChatModelUnavailableError("503")]))
    client = APIClient()
    token = _start(client)

    response = _send(client, token, "hi", "msg-00000003")

    assert response.status_code == HTTPStatus.OK
    assert response.json()["messages"][-1]["text"] == UNAVAILABLE_REPLY


@pytest.mark.usefixtures("enabled")
def test_a_signed_out_conversation_is_claimed_and_then_private(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _use(monkeypatch, ScriptedModel([]))
    token = _start(APIClient())
    owner = User.objects.create_user(phone_number="+919811111111")
    stranger = User.objects.create_user(phone_number="+919822222222")
    owner_client, stranger_client = APIClient(), APIClient()
    owner_client.force_authenticate(owner)
    stranger_client.force_authenticate(stranger)

    claimed = owner_client.get("/api/v1/assistant/conversation/", **{TOKEN: token})

    assert claimed.status_code == HTTPStatus.OK
    assert claimed.json()["signed_in"] is True
    assert AssistantSession.objects.get().customer_id == owner.id
    for other in (stranger_client, APIClient()):
        response = other.get("/api/v1/assistant/conversation/", **{TOKEN: token})
        assert response.status_code == HTTPStatus.NOT_FOUND


@pytest.mark.usefixtures("enabled")
def test_a_second_message_while_answering_is_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    _use(monkeypatch, ScriptedModel([]))
    client = APIClient()
    token = _start(client)
    AssistantSession.objects.update(busy_until=timezone.now() + timedelta(seconds=60))

    response = _send(client, token, "hello?", "msg-00000004")

    assert response.status_code == HTTPStatus.CONFLICT
    assert response.json()["error"]["code"] == "assistant_busy"


@pytest.mark.usefixtures("enabled")
def test_a_conversation_has_a_message_ceiling(
    monkeypatch: pytest.MonkeyPatch, settings: SettingsWrapper
) -> None:
    settings.ASSISTANT_MAX_USER_MESSAGES_PER_SESSION = 1
    _use(monkeypatch, ScriptedModel([_reply("Hi!")]))
    client = APIClient()
    token = _start(client)

    assert _send(client, token, "one", "msg-00000005").status_code == HTTPStatus.OK
    second = _send(client, token, "two", "msg-00000006")

    assert second.status_code == HTTPStatus.TOO_MANY_REQUESTS
    assert second.json()["error"]["code"] == "assistant_limit_reached"
