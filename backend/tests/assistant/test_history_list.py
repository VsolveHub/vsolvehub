"""The history list: a signed-in Customer's own conversations, readable from any device."""

from datetime import timedelta
from http import HTTPStatus

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from pytest_django.fixtures import SettingsWrapper
from rest_framework.test import APIClient

from apps.assistant.models import AssistantMessage, AssistantSession
from apps.assistant.services import append_message, create_session
from apps.identity.models import User

pytestmark = pytest.mark.django_db

URL = "/api/v1/assistant/history/"
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


def _conversation(user: User, *, said: str | None, minutes_ago: int = 0) -> AssistantSession:
    """A conversation as the greeting leaves it, plus the Customer's first words if any."""

    session, _token = create_session(user=user)
    if said is not None:
        append_message(session, role=Role.USER, text=said)
        append_message(session, role=Role.ASSISTANT, text="Which day suits you?")
    session.last_activity_at = timezone.now() - timedelta(minutes=minutes_ago)
    session.save(update_fields=["last_activity_at"])
    return session


def test_it_lists_my_conversations_newest_first_named_after_my_first_words() -> None:
    me = _customer("+919811111111")
    older = _conversation(me, said="AC not cooling", minutes_ago=30)
    newer = _conversation(me, said="Fan installation", minutes_ago=5)

    response = _client(me).get(URL)

    assert response.status_code == HTTPStatus.OK
    rows = response.json()
    assert [row["id"] for row in rows] == [str(newer.id), str(older.id)]
    assert [row["title"] for row in rows] == ["Fan installation", "AC not cooling"]
    assert set(rows[0]) == {"id", "title", "last_activity_at"}


def test_the_same_history_shows_on_every_device_a_customer_logs_in_on() -> None:
    me = _customer("+919811111111")
    _conversation(me, said="AC not cooling")

    first_phone = _client(me).get(URL).json()
    second_phone = _client(me).get(URL).json()

    assert first_phone == second_phone
    assert len(first_phone) == 1


def test_it_needs_a_signed_in_customer() -> None:
    response = _client().get(URL)

    assert response.status_code in (HTTPStatus.UNAUTHORIZED, HTTPStatus.FORBIDDEN)


def test_it_never_lists_someone_elses_conversations() -> None:
    me = _customer("+919811111111")
    stranger = _customer("+919822222222")
    _conversation(stranger, said="Their private request")

    assert _client(me).get(URL).json() == []


def test_a_conversation_nobody_has_written_in_is_not_history() -> None:
    me = _customer("+919811111111")
    _conversation(me, said=None)
    kept = _conversation(me, said="AC not cooling")

    rows = _client(me).get(URL).json()

    assert [row["id"] for row in rows] == [str(kept.id)]


def test_a_long_first_message_gives_a_short_title() -> None:
    me = _customer("+919811111111")
    _conversation(me, said="x" * 400)

    (row,) = _client(me).get(URL).json()

    assert len(row["title"]) == 60


def test_it_returns_only_the_most_recent_conversations(settings: SettingsWrapper) -> None:
    settings.ASSISTANT_CONVERSATION_LIST_LIMIT = 2
    me = _customer("+919811111111")
    for minutes_ago, said in ((30, "oldest"), (20, "middle"), (10, "newest")):
        _conversation(me, said=said, minutes_ago=minutes_ago)

    rows = _client(me).get(URL).json()

    assert [row["title"] for row in rows] == ["newest", "middle"]


def test_it_reads_every_title_in_one_query() -> None:
    me = _customer("+919811111111")
    for index in range(5):
        _conversation(me, said=f"request {index}")
    client = _client(me)
    client.get(URL)  # warm any one-time lookups before counting

    with CaptureQueriesContext(connection) as queries:
        assert len(client.get(URL).json()) == 5

    # Five conversations cost the same as one: no query per row.
    assert len(queries) <= 3


def test_a_switched_off_assistant_refuses_the_history_too(settings: SettingsWrapper) -> None:
    settings.ASSISTANT_ENABLED = False
    me = _customer("+919811111111")

    response = _client(me).get(URL)

    assert response.status_code == HTTPStatus.SERVICE_UNAVAILABLE
    assert response.json()["error"]["code"] == "assistant_unavailable"
