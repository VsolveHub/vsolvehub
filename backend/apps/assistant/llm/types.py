"""Provider-neutral conversation shapes the agent loop speaks.

Each adapter translates these to and from one vendor's wire format, so the loop, the stored
history and the fallback from one vendor to another never depend on a vendor's message layout.
"""

from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any, Literal, Protocol

JsonObject = dict[str, Any]

TurnRole = Literal["user", "assistant", "tool"]


@dataclass(frozen=True, slots=True)
class ToolSpec:
    name: str
    description: str
    #: The JSON Schema subset both vendors accept: `type`, `properties`, `required`, `enum`,
    #: `items`, `description`. No `additionalProperties`, no `$ref`.
    parameters: JsonObject


@dataclass(frozen=True, slots=True)
class ToolCall:
    id: str
    name: str
    arguments: JsonObject


@dataclass(frozen=True, slots=True)
class ToolResult:
    call_id: str
    name: str
    content: JsonObject


@dataclass(frozen=True, slots=True)
class Turn:
    role: TurnRole
    text: str = ""
    tool_calls: tuple[ToolCall, ...] = ()
    tool_results: tuple[ToolResult, ...] = ()
    #: Which vendor produced an assistant turn, and the opaque data it requires back verbatim
    #: (Gemini's thought signatures). Every other vendor ignores both.
    provider: str = ""
    provider_payload: JsonObject = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class ModelReply:
    text: str
    tool_calls: tuple[ToolCall, ...]
    provider: str
    model: str
    input_tokens: int
    output_tokens: int
    finish_reason: str
    provider_payload: JsonObject = field(default_factory=dict)


class ChatModelError(RuntimeError):
    """The vendor gave no usable answer. Safe to retry on another vendor."""


class ChatModelUnavailableError(ChatModelError):
    """Timeout, connection failure, rate limit or a 5xx: the vendor may answer later."""


class ChatModelRejectedError(ChatModelError):
    """A 4xx, a blocked prompt or an unusable body: this request will not succeed as sent."""


class AssistantNotConfiguredError(RuntimeError):
    """The deployment names a provider it has no key or model for."""


class ChatModel(Protocol):
    code: str
    model: str

    def complete(
        self,
        *,
        system: str,
        turns: Sequence[Turn],
        tools: Sequence[ToolSpec],
    ) -> ModelReply: ...
