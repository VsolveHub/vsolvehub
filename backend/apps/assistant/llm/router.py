"""Choosing the model, and the one explicit fallback.

Fail closed, as ADR 0004 requires of every provider: a named provider without its key or model is
a configuration error, never a silent switch to something else. The fallback is opt-in through
`ASSISTANT_FALLBACK_PROVIDER` and every use of it is logged.
"""

import logging
from collections.abc import Sequence

from django.conf import settings

from .gemini import GeminiChatModel
from .openai import OpenAIChatModel
from .types import (
    AssistantNotConfiguredError,
    ChatModel,
    ChatModelError,
    ModelReply,
    ToolSpec,
    Turn,
)

logger = logging.getLogger(__name__)


def _timeout() -> tuple[float, float]:
    return (
        float(settings.ASSISTANT_LLM_CONNECT_TIMEOUT_SECONDS),
        float(settings.ASSISTANT_LLM_READ_TIMEOUT_SECONDS),
    )


def _build(code: str) -> ChatModel:
    if code == GeminiChatModel.code:
        key = (settings.GEMINI_API_KEY or "").strip()
        model = (settings.GEMINI_MODEL or "").strip()
        if not key or not model:
            raise AssistantNotConfiguredError("Gemini needs GEMINI_API_KEY and GEMINI_MODEL.")
        return GeminiChatModel(
            api_key=key,
            model=model,
            base_url=settings.GEMINI_API_BASE_URL,
            timeout=_timeout(),
            max_output_tokens=settings.ASSISTANT_MAX_OUTPUT_TOKENS,
        )
    if code == OpenAIChatModel.code:
        key = (settings.OPENAI_API_KEY or "").strip()
        model = (settings.OPENAI_MODEL or "").strip()
        if not key or not model:
            raise AssistantNotConfiguredError("OpenAI needs OPENAI_API_KEY and OPENAI_MODEL.")
        return OpenAIChatModel(
            api_key=key,
            model=model,
            base_url=settings.OPENAI_API_BASE_URL,
            timeout=_timeout(),
            max_output_tokens=settings.ASSISTANT_MAX_OUTPUT_TOKENS,
        )
    raise AssistantNotConfiguredError(f"No assistant provider is named {code!r}.")


class FallbackChatModel:
    """Ask the primary; on any vendor failure ask the fallback once."""

    def __init__(self, *, primary: ChatModel, fallback: ChatModel) -> None:
        self.code = primary.code
        self.model = primary.model
        self._primary = primary
        self._fallback = fallback

    def complete(
        self,
        *,
        system: str,
        turns: Sequence[Turn],
        tools: Sequence[ToolSpec],
    ) -> ModelReply:
        try:
            return self._primary.complete(system=system, turns=turns, tools=tools)
        except ChatModelError as exc:
            logger.warning(
                "assistant.llm_fallback",
                extra={
                    "from_provider": self._primary.code,
                    "to_provider": self._fallback.code,
                    "reason": exc.__class__.__name__,
                    "detail": str(exc),
                },
            )
            return self._fallback.complete(system=system, turns=turns, tools=tools)


def chat_model_from_settings() -> ChatModel:
    primary = _build(settings.ASSISTANT_PRIMARY_PROVIDER)
    fallback_code = (settings.ASSISTANT_FALLBACK_PROVIDER or "").strip()
    if not fallback_code:
        return primary
    if fallback_code == primary.code:
        raise AssistantNotConfiguredError("The fallback provider must differ from the primary.")
    return FallbackChatModel(primary=primary, fallback=_build(fallback_code))
