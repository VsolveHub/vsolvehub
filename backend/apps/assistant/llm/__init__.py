"""Vendor adapters behind one neutral interface."""

from .gemini import GeminiChatModel
from .openai import OpenAIChatModel
from .router import FallbackChatModel, chat_model_from_settings
from .types import (
    AssistantNotConfiguredError,
    ChatModel,
    ChatModelError,
    ChatModelRejectedError,
    ChatModelUnavailableError,
    JsonObject,
    ModelReply,
    ToolCall,
    ToolResult,
    ToolSpec,
    Turn,
)

__all__ = [
    "AssistantNotConfiguredError",
    "ChatModel",
    "ChatModelError",
    "ChatModelRejectedError",
    "ChatModelUnavailableError",
    "FallbackChatModel",
    "GeminiChatModel",
    "JsonObject",
    "ModelReply",
    "OpenAIChatModel",
    "ToolCall",
    "ToolResult",
    "ToolSpec",
    "Turn",
    "chat_model_from_settings",
]
