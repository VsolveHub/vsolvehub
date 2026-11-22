"""OpenAI Chat Completions adapter (REST, bearer key)."""

import json
from collections.abc import Sequence
from typing import Any, cast

from .http import new_call_id, post_json
from .types import (
    ChatModelRejectedError,
    JsonObject,
    ModelReply,
    ToolCall,
    ToolSpec,
    Turn,
)


class OpenAIChatModel:
    code = "openai"

    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        base_url: str,
        timeout: tuple[float, float],
        max_output_tokens: int,
    ) -> None:
        self.model = model
        self._api_key = api_key
        self._url = f"{base_url.rstrip('/')}/chat/completions"
        self._timeout = timeout
        self._max_output_tokens = max_output_tokens

    def complete(
        self,
        *,
        system: str,
        turns: Sequence[Turn],
        tools: Sequence[ToolSpec],
    ) -> ModelReply:
        messages: list[JsonObject] = [{"role": "system", "content": system}]
        for turn in turns:
            messages.extend(self._messages(turn))
        body: JsonObject = {
            "model": self.model,
            "messages": messages,
            "max_completion_tokens": self._max_output_tokens,
        }
        if tools:
            body["tools"] = [
                {
                    "type": "function",
                    "function": {
                        "name": spec.name,
                        "description": spec.description,
                        "parameters": spec.parameters,
                    },
                }
                for spec in tools
            ]
            body["tool_choice"] = "auto"
        data = post_json(
            url=self._url,
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
            },
            body=body,
            timeout=self._timeout,
            vendor="OpenAI",
        )
        return self._reply(data)

    @staticmethod
    def _messages(turn: Turn) -> list[JsonObject]:
        if turn.role == "user":
            return [{"role": "user", "content": turn.text}]
        if turn.role == "tool":
            return [
                {
                    "role": "tool",
                    "tool_call_id": result.call_id,
                    "content": json.dumps(result.content, ensure_ascii=False),
                }
                for result in turn.tool_results
            ]
        message: JsonObject = {"role": "assistant", "content": turn.text or None}
        if turn.tool_calls:
            message["tool_calls"] = [
                {
                    "id": call.id,
                    "type": "function",
                    "function": {
                        "name": call.name,
                        "arguments": json.dumps(call.arguments, ensure_ascii=False),
                    },
                }
                for call in turn.tool_calls
            ]
        return [message]

    def _reply(self, data: JsonObject) -> ModelReply:
        choices = data.get("choices")
        if not isinstance(choices, list) or not choices or not isinstance(choices[0], dict):
            raise ChatModelRejectedError("OpenAI returned no choice.")
        choice = choices[0]
        message = choice.get("message")
        if not isinstance(message, dict):
            raise ChatModelRejectedError("OpenAI returned no message.")
        calls: list[ToolCall] = []
        for raw in message.get("tool_calls") or []:
            if not isinstance(raw, dict) or not isinstance(raw.get("function"), dict):
                continue
            function = cast(dict[str, Any], raw["function"])
            name = function.get("name")
            if not isinstance(name, str):
                continue
            calls.append(
                ToolCall(
                    id=str(raw.get("id") or new_call_id()),
                    name=name,
                    arguments=_parse_arguments(function.get("arguments")),
                )
            )
        text = message.get("content") if isinstance(message.get("content"), str) else ""
        finish_reason = str(choice.get("finish_reason") or "")
        if not calls and not str(text).strip():
            raise ChatModelRejectedError(f"OpenAI returned an empty answer ({finish_reason}).")
        usage = data.get("usage")
        usage = usage if isinstance(usage, dict) else {}
        return ModelReply(
            text=str(text).strip(),
            tool_calls=tuple(calls),
            provider=self.code,
            model=self.model,
            input_tokens=int(usage.get("prompt_tokens") or 0),
            output_tokens=int(usage.get("completion_tokens") or 0),
            finish_reason=finish_reason,
        )


def _parse_arguments(raw: object) -> JsonObject:
    """Arguments arrive as a JSON string. A malformed one becomes a value the tool refuses."""

    if not isinstance(raw, str) or not raw.strip():
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {"__invalid_arguments__": True}
    return cast(JsonObject, parsed) if isinstance(parsed, dict) else {}
