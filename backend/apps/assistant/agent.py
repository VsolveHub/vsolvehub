"""One Customer message in, the assistant's answer out: the tool-calling loop.

The caller holds the conversation's turn lease. Everything the model decides goes through
`tools.execute_tool`; everything it says is stored before it is returned, so a lost response can
be replayed by `client_message_id` instead of running the turn twice.
"""

import logging
import time
from dataclasses import asdict

from django.conf import settings
from django.db.models import F
from django.utils import timezone

from apps.identity.models import User

from .llm import ChatModel, ChatModelError, ModelReply, ToolResult, Turn
from .models import AssistantMessage, AssistantSession
from .prompts import SYSTEM_PROMPT, turn_context
from .services import (
    append_message,
    check_limits,
    has_open_booking,
    history,
    sync_progress,
    visible_messages,
)
from .tools import TOOL_SPECS, ToolContext, execute_tool

logger = logging.getLogger(__name__)

Role = AssistantMessage.Role

UNAVAILABLE_REPLY = (
    "Sorry, I'm having trouble answering right now. You can also book directly from the website."
)
UNFINISHED_REPLY = "Sorry, I couldn't finish that. Could you say it another way?"
CATALOG_ACTION = {"type": "OPEN_LINK", "label": "Browse services", "href": "/catalog"}


def _record_usage(session: AssistantSession, reply: ModelReply) -> None:
    AssistantSession.objects.filter(id=session.id).update(
        input_tokens=F("input_tokens") + reply.input_tokens,
        output_tokens=F("output_tokens") + reply.output_tokens,
    )


def run_turn(
    *,
    session: AssistantSession,
    user: User | None,
    cart_session_key: str,
    text: str,
    client_message_id: str,
    chat_model: ChatModel,
) -> list[AssistantMessage]:
    replayed = AssistantMessage.objects.filter(
        session=session, client_message_id=client_message_id
    ).first()
    if replayed is not None:
        return list(visible_messages(session, after_sequence=replayed.sequence - 1))

    check_limits(session)
    notices = sync_progress(session)
    customer_message = append_message(
        session, role=Role.USER, text=text, client_message_id=client_message_id
    )
    first_sequence = notices[0].sequence if notices else customer_message.sequence
    AssistantSession.objects.filter(id=session.id).update(
        turn_count=F("turn_count") + 1,
        user_message_count=F("user_message_count") + 1,
        last_activity_at=timezone.now(),
    )
    session.refresh_from_db(fields=("turn_count", "user_message_count", "state"))

    context = ToolContext(
        session=session,
        user=user,
        cart_session_key=cart_session_key,
        turn=session.turn_count,
    )
    system = SYSTEM_PROMPT + turn_context(
        signed_in=user is not None,
        has_open_booking=has_open_booking(session),
    )
    turns = history(session)
    deadline = time.monotonic() + settings.ASSISTANT_TURN_DEADLINE_SECONDS

    for _round in range(settings.ASSISTANT_MAX_TOOL_ROUNDS):
        if time.monotonic() > deadline:
            break
        started = time.monotonic()
        try:
            reply = chat_model.complete(system=system, turns=turns, tools=TOOL_SPECS)
        except ChatModelError as exc:
            logger.warning(
                "assistant.model_failed",
                extra={"session_id": str(session.id), "reason": exc.__class__.__name__},
            )
            append_message(
                session, role=Role.ASSISTANT, text=UNAVAILABLE_REPLY, actions=[CATALOG_ACTION]
            )
            return list(visible_messages(session, after_sequence=first_sequence - 1))
        latency_ms = int((time.monotonic() - started) * 1000)
        _record_usage(session, reply)
        logger.info(
            "assistant.model_call",
            extra={
                "session_id": str(session.id),
                "provider": reply.provider,
                "model": reply.model,
                "input_tokens": reply.input_tokens,
                "output_tokens": reply.output_tokens,
                "latency_ms": latency_ms,
                "finish_reason": reply.finish_reason,
                "tools": [call.name for call in reply.tool_calls],
            },
        )
        usage = {
            "provider": reply.provider,
            "model": reply.model,
            "input_tokens": reply.input_tokens,
            "output_tokens": reply.output_tokens,
            "latency_ms": latency_ms,
        }
        if not reply.tool_calls:
            append_message(
                session, role=Role.ASSISTANT, text=reply.text, actions=context.actions, **usage
            )
            return list(visible_messages(session, after_sequence=first_sequence - 1))

        append_message(
            session,
            role=Role.ASSISTANT,
            text=reply.text,
            tool_calls=[asdict(call) for call in reply.tool_calls],
            provider_payload=reply.provider_payload,
            **usage,
        )
        results: list[ToolResult] = [execute_tool(call, context) for call in reply.tool_calls]
        append_message(session, role=Role.TOOL, tool_results=[asdict(result) for result in results])
        turns.extend(
            (
                Turn(
                    role="assistant",
                    text=reply.text,
                    tool_calls=reply.tool_calls,
                    provider=reply.provider,
                    provider_payload=reply.provider_payload,
                ),
                Turn(role="tool", tool_results=tuple(results)),
            )
        )

    append_message(session, role=Role.ASSISTANT, text=UNFINISHED_REPLY, actions=context.actions)
    return list(visible_messages(session, after_sequence=first_sequence - 1))
