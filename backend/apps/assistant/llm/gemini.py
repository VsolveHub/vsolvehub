"""Google Gemini `generateContent` adapter (REST, API key).

## Thought signatures are replayed verbatim

Recent Gemini models attach a `thoughtSignature` to the parts of an answer that call a function,
and refuse the next request of the same turn if the signature does not come back with it. So an
assistant turn this adapter produced is stored with its raw `parts` and replayed exactly as
received. A turn some other vendor produced (after a fallback) is rebuilt from the neutral shape;
it never had a signature to lose.
"""

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


class GeminiChatModel:
    code = "gemini"

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
        self._url = f"{base_url.rstrip('/')}/models/{model}:generateContent"
        self._timeout = timeout
        self._max_output_tokens = max_output_tokens

    def complete(
        self,
        *,
        system: str,
        turns: Sequence[Turn],
        tools: Sequence[ToolSpec],
    ) -> ModelReply:
        body: JsonObject = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [self._content(turn) for turn in turns],
            "generationConfig": {"maxOutputTokens": self._max_output_tokens},
        }
        if tools:
            body["tools"] = [{"functionDeclarations": [self._declaration(t) for t in tools]}]
            body["toolConfig"] = {"functionCallingConfig": {"mode": "AUTO"}}
        data = post_json(
            url=self._url,
            headers={"x-goog-api-key": self._api_key, "Content-Type": "application/json"},
            body=body,
            timeout=self._timeout,
            vendor="Gemini",
        )
        return self._reply(data)

    @staticmethod
    def _declaration(spec: ToolSpec) -> JsonObject:
        declaration: JsonObject = {"name": spec.name, "description": spec.description}
        # Gemini refuses an object schema with no properties; a tool without inputs omits it.
        if spec.parameters.get("properties"):
            declaration["parameters"] = spec.parameters
        return declaration

    def _content(self, turn: Turn) -> JsonObject:
        if turn.role == "user":
            return {"role": "user", "parts": [{"text": turn.text}]}
        if turn.role == "tool":
            return {
                "role": "user",
                "parts": [
                    {"functionResponse": {"name": result.name, "response": result.content}}
                    for result in turn.tool_results
                ],
            }
        raw_parts = turn.provider_payload.get("parts")
        if turn.provider == self.code and isinstance(raw_parts, list) and raw_parts:
            return {"role": "model", "parts": raw_parts}
        parts: list[JsonObject] = [{"text": turn.text}] if turn.text else []
        parts.extend(
            {"functionCall": {"name": call.name, "args": call.arguments}}
            for call in turn.tool_calls
        )
        return {"role": "model", "parts": parts or [{"text": ""}]}

    def _reply(self, data: JsonObject) -> ModelReply:
        candidates = data.get("candidates")
        if not isinstance(candidates, list) or not candidates:
            feedback = data.get("promptFeedback")
            reason = (
                feedback.get("blockReason", "no_candidates")
                if isinstance(feedback, dict)
                else "no_candidates"
            )
            raise ChatModelRejectedError(f"Gemini returned no candidate ({reason}).")
        candidate = candidates[0] if isinstance(candidates[0], dict) else {}
        content = candidate.get("content")
        parts: list[Any] = (content.get("parts", []) if isinstance(content, dict) else []) or []
        texts: list[str] = []
        calls: list[ToolCall] = []
        for part in parts:
            if not isinstance(part, dict) or part.get("thought"):
                # A thought summary is not answer text; its signature still travels in `parts`.
                continue
            if isinstance(part.get("text"), str):
                texts.append(part["text"])
            call = part.get("functionCall")
            if isinstance(call, dict) and isinstance(call.get("name"), str):
                arguments = call.get("args")
                calls.append(
                    ToolCall(
                        id=str(call.get("id") or new_call_id()),
                        name=call["name"],
                        arguments=cast(JsonObject, arguments)
                        if isinstance(arguments, dict)
                        else {},
                    )
                )
        finish_reason = str(candidate.get("finishReason") or "")
        if not calls and not "".join(texts).strip():
            raise ChatModelRejectedError(f"Gemini returned an empty answer ({finish_reason}).")
        usage = data.get("usageMetadata")
        usage = usage if isinstance(usage, dict) else {}
        return ModelReply(
            text="".join(texts).strip(),
            tool_calls=tuple(calls),
            provider=self.code,
            model=self.model,
            input_tokens=int(usage.get("promptTokenCount") or 0),
            output_tokens=int(usage.get("candidatesTokenCount") or 0)
            + int(usage.get("thoughtsTokenCount") or 0),
            finish_reason=finish_reason,
            provider_payload={"parts": parts},
        )
