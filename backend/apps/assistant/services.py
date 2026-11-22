"""Conversation lifecycle: tokens, ownership, the turn lease, messages, history and notices."""

import hashlib
import secrets
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import timedelta
from typing import Any, cast

from django.conf import settings
from django.db.models import Max, Q, QuerySet
from django.utils import timezone

from apps.carts.models import BookingGroup
from apps.identity.models import User

from .exceptions import (
    AssistantBusyApiError,
    AssistantConversationNotFoundApiError,
    AssistantLimitReachedApiError,
    AssistantUnavailableApiError,
)
from .llm import JsonObject, ToolCall, ToolResult, Turn
from .models import AssistantBooking, AssistantMessage, AssistantSession
from .progress import describe

GREETING = (
    "Hi! Tell me what you need done at home — for example “AC not cooling” or “fan "
    "installation” — and I'll find the right service and a time for you."
)
MAX_TOKEN_LENGTH = 128
VISIBLE_MESSAGE_LIMIT = 100
Role = AssistantMessage.Role


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_session(*, user: User | None) -> tuple[AssistantSession, str]:
    """A new conversation and its token. The token is returned once and never stored."""

    token = secrets.token_urlsafe(32)
    session = AssistantSession.objects.create(token_hash=hash_token(token), customer=user)
    append_message(session, role=Role.NOTICE, text=GREETING)
    return session, token


def session_for(*, token: str, user: User | None) -> AssistantSession:
    """The conversation this token opens, for this caller — or not found.

    Not found rather than forbidden for someone else's conversation, so a token cannot be probed.
    A conversation started signed out is claimed by the first signed-in Customer to use it.
    """

    if not token or len(token) > MAX_TOKEN_LENGTH:
        raise AssistantConversationNotFoundApiError
    session = AssistantSession.objects.filter(token_hash=hash_token(token)).first()
    if session is None:
        raise AssistantConversationNotFoundApiError
    if session.customer_id is None and user is not None:
        AssistantSession.objects.filter(id=session.id, customer__isnull=True).update(customer=user)
        session.refresh_from_db()
    if session.customer_id is not None and (user is None or session.customer_id != user.id):
        raise AssistantConversationNotFoundApiError
    return session


@contextmanager
def turn_lease(session: AssistantSession, *, required: bool = True) -> Iterator[bool]:
    """One writer per conversation without a transaction held open across a model call.

    Yields whether the lease was taken. With `required`, a held lease is a 409 instead.
    """

    now = timezone.now()
    acquired = bool(
        AssistantSession.objects.filter(id=session.id)
        .filter(Q(busy_until__isnull=True) | Q(busy_until__lte=now))
        .update(busy_until=now + timedelta(seconds=settings.ASSISTANT_TURN_LEASE_SECONDS))
    )
    if not acquired and required:
        raise AssistantBusyApiError
    try:
        yield acquired
    finally:
        if acquired:
            AssistantSession.objects.filter(id=session.id).update(busy_until=None)


def check_limits(session: AssistantSession) -> None:
    if session.user_message_count >= settings.ASSISTANT_MAX_USER_MESSAGES_PER_SESSION:
        raise AssistantLimitReachedApiError
    since = timezone.now() - timedelta(days=1)
    sent_today = AssistantMessage.objects.filter(role=Role.USER, created_at__gte=since).count()
    if sent_today >= settings.ASSISTANT_DAILY_USER_MESSAGE_CAP:
        raise AssistantUnavailableApiError


def append_message(
    session: AssistantSession, *, role: str, text: str = "", **fields: Any
) -> AssistantMessage:
    """Callers hold the turn lease, so the next sequence number cannot be taken concurrently."""

    last = AssistantMessage.objects.filter(session=session).aggregate(top=Max("sequence"))["top"]
    return AssistantMessage.objects.create(
        session=session,
        sequence=(last or 0) + 1,
        role=role,
        text=text,
        **fields,
    )


def visible_messages(
    session: AssistantSession, *, after_sequence: int = 0
) -> QuerySet[AssistantMessage]:
    """What the Customer sees: their messages, the answers and the notices — never tool data."""

    return (
        AssistantMessage.objects.filter(
            session=session,
            sequence__gt=after_sequence,
            role__in=(Role.USER, Role.ASSISTANT, Role.NOTICE),
        )
        .exclude(role=Role.ASSISTANT, text="")
        .order_by("sequence")
    )


def recent_visible_messages(session: AssistantSession) -> list[AssistantMessage]:
    rows = list(visible_messages(session).order_by("-sequence")[:VISIBLE_MESSAGE_LIMIT])
    return rows[::-1]


def has_open_booking(session: AssistantSession) -> bool:
    return AssistantBooking.objects.filter(session=session, closed_at__isnull=True).exists()


def sync_progress(session: AssistantSession) -> list[AssistantMessage]:
    """Announce the open booking's new phase once, as a server-written notice."""

    booking = AssistantBooking.objects.filter(session=session, closed_at__isnull=True).first()
    if booking is None:
        return []
    group = BookingGroup.objects.select_related("quote").get(id=booking.booking_group_id)
    progress = describe(group)
    if progress.phase == booking.announced_status:
        return []
    updated = AssistantBooking.objects.filter(
        id=booking.id,
        announced_status=booking.announced_status,
        closed_at__isnull=True,
    ).update(
        announced_status=progress.phase,
        closed_at=timezone.now() if progress.closes else None,
    )
    if not updated:
        return []
    return [append_message(session, role=Role.NOTICE, text=progress.text, actions=progress.actions)]


def _stored_objects(raw: object) -> list[JsonObject]:
    return (
        [cast(JsonObject, e) for e in raw if isinstance(e, dict)] if isinstance(raw, list) else []
    )


def _tool_calls(raw: object) -> tuple[ToolCall, ...]:
    return tuple(
        ToolCall(
            id=str(entry.get("id", "")),
            name=str(entry.get("name", "")),
            arguments=cast(JsonObject, entry.get("arguments") or {}),
        )
        for entry in _stored_objects(raw)
    )


def _tool_results(raw: object) -> tuple[ToolResult, ...]:
    return tuple(
        ToolResult(
            call_id=str(entry.get("call_id", "")),
            name=str(entry.get("name", "")),
            content=cast(JsonObject, entry.get("content") or {}),
        )
        for entry in _stored_objects(raw)
    )


def _append_text(turns: list[Turn], role: str, text: str) -> None:
    """Fold consecutive plain text from one side into one turn; vendors expect alternation."""

    previous = turns[-1] if turns else None
    if previous is not None and previous.role == role and not previous.tool_calls:
        turns[-1] = Turn(role=previous.role, text=f"{previous.text}\n\n{text}".strip())
    else:
        turns.append(Turn(role="user" if role == "user" else "assistant", text=text))


def history(session: AssistantSession) -> list[Turn]:
    """The recent conversation in neutral form, starting at a Customer message.

    A tool-call turn whose results never got written (a crash mid-turn) is reduced to its text,
    and results with no call before them are dropped: both vendors refuse an unpaired exchange.
    """

    rows = list(
        AssistantMessage.objects.filter(session=session).order_by("-sequence")[
            : settings.ASSISTANT_HISTORY_MESSAGES
        ]
    )[::-1]
    while rows and rows[0].role != Role.USER:
        rows.pop(0)
    turns: list[Turn] = []
    for index, row in enumerate(rows):
        following = rows[index + 1] if index + 1 < len(rows) else None
        if row.role == Role.USER:
            _append_text(turns, "user", row.text)
        elif row.role == Role.NOTICE:
            _append_text(turns, "assistant", row.text)
        elif row.role == Role.ASSISTANT:
            calls = _tool_calls(row.tool_calls)
            if calls and (following is None or following.role != Role.TOOL):
                calls = ()
            if calls:
                turns.append(
                    Turn(
                        role="assistant",
                        text=row.text,
                        tool_calls=calls,
                        provider=row.provider,
                        provider_payload=cast(JsonObject, row.provider_payload or {}),
                    )
                )
            elif row.text:
                _append_text(turns, "assistant", row.text)
        elif row.role == Role.TOOL and turns and turns[-1].tool_calls:
            turns.append(Turn(role="tool", tool_results=_tool_results(row.tool_results)))
    return turns
