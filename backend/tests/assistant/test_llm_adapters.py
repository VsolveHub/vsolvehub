"""Vendor adapters: wire shapes, error mapping, thought-signature replay and the fallback."""

from typing import Any

import pytest
import requests
from pytest_django.fixtures import SettingsWrapper

from apps.assistant.llm import (
    AssistantNotConfiguredError,
    ChatModelRejectedError,
    ChatModelUnavailableError,
    FallbackChatModel,
    GeminiChatModel,
    ModelReply,
    OpenAIChatModel,
    ToolCall,
    ToolResult,
    ToolSpec,
    Turn,
    chat_model_from_settings,
)

SEARCH = ToolSpec(
    "search_services",
    "Find services.",
    {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]},
)
NO_INPUT = ToolSpec("booking_status", "Status.", {"type": "object", "properties": {}})


class _Response:
    def __init__(self, status_code: int, body: Any) -> None:
        self.status_code = status_code
        self._body = body

    def json(self) -> Any:
        if isinstance(self._body, Exception):
            raise self._body
        return self._body


def _capture(monkeypatch: pytest.MonkeyPatch, response: _Response) -> dict[str, Any]:
    seen: dict[str, Any] = {}

    def fake_post(url: str, **kwargs: Any) -> _Response:
        seen["url"] = url
        seen.update(kwargs)
        return response

    monkeypatch.setattr(requests, "post", fake_post)
    return seen


def _gemini() -> GeminiChatModel:
    return GeminiChatModel(
        api_key="test-key",
        model="gemini-test",
        base_url="https://gemini.invalid/v1beta",
        timeout=(1.0, 2.0),
        max_output_tokens=256,
    )


def _openai() -> OpenAIChatModel:
    return OpenAIChatModel(
        api_key="test-key",
        model="gpt-test",
        base_url="https://openai.invalid/v1",
        timeout=(1.0, 2.0),
        max_output_tokens=256,
    )


def test_gemini_request_shape_and_function_call_parsing(monkeypatch: pytest.MonkeyPatch) -> None:
    parts = [
        {"text": "Let me look."},
        {
            "functionCall": {"name": "search_services", "args": {"query": "fan"}},
            "thoughtSignature": "sig-1",
        },
    ]
    seen = _capture(
        monkeypatch,
        _Response(
            200,
            {
                "candidates": [
                    {"content": {"role": "model", "parts": parts}, "finishReason": "STOP"}
                ],
                "usageMetadata": {
                    "promptTokenCount": 120,
                    "candidatesTokenCount": 9,
                    "thoughtsTokenCount": 4,
                },
            },
        ),
    )

    reply = _gemini().complete(
        system="be brief", turns=[Turn(role="user", text="fan noise")], tools=[SEARCH, NO_INPUT]
    )

    assert seen["url"] == "https://gemini.invalid/v1beta/models/gemini-test:generateContent"
    assert seen["headers"]["x-goog-api-key"] == "test-key"
    body = seen["json"]
    assert body["systemInstruction"] == {"parts": [{"text": "be brief"}]}
    assert body["contents"] == [{"role": "user", "parts": [{"text": "fan noise"}]}]
    declarations = body["tools"][0]["functionDeclarations"]
    assert declarations[0]["parameters"] == SEARCH.parameters
    assert "parameters" not in declarations[1], "Gemini refuses an object with no properties"
    assert reply.text == "Let me look."
    assert reply.tool_calls[0].name == "search_services"
    assert reply.tool_calls[0].arguments == {"query": "fan"}
    assert reply.input_tokens == 120
    assert reply.output_tokens == 13
    assert reply.provider_payload == {"parts": parts}


def test_gemini_replays_its_own_parts_verbatim_and_rebuilds_foreign_turns(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    raw = [{"functionCall": {"name": "booking_status", "args": {}}, "thoughtSignature": "sig-2"}]
    seen = _capture(
        monkeypatch,
        _Response(200, {"candidates": [{"content": {"parts": [{"text": "Done."}]}}]}),
    )
    call = ToolCall(id="call_1", name="booking_status", arguments={})
    turns = [
        Turn(role="user", text="status?"),
        Turn(
            role="assistant", tool_calls=(call,), provider="gemini", provider_payload={"parts": raw}
        ),
        Turn(
            role="tool", tool_results=(ToolResult("call_1", "booking_status", {"status": "none"}),)
        ),
        Turn(role="assistant", text="From OpenAI", tool_calls=(call,), provider="openai"),
        Turn(
            role="tool", tool_results=(ToolResult("call_1", "booking_status", {"status": "none"}),)
        ),
    ]

    _gemini().complete(system="s", turns=turns, tools=[NO_INPUT])

    contents = seen["json"]["contents"]
    assert contents[1] == {"role": "model", "parts": raw}, "the signature must come back untouched"
    assert contents[2]["parts"][0]["functionResponse"] == {
        "name": "booking_status",
        "response": {"status": "none"},
    }
    assert contents[3]["parts"] == [
        {"text": "From OpenAI"},
        {"functionCall": {"name": "booking_status", "args": {}}},
    ]


@pytest.mark.parametrize(
    ("status_code", "error"),
    [
        (429, ChatModelUnavailableError),
        (503, ChatModelUnavailableError),
        (400, ChatModelRejectedError),
    ],
)
def test_vendor_http_errors_map_to_retryable_or_rejected(
    monkeypatch: pytest.MonkeyPatch, status_code: int, error: type[Exception]
) -> None:
    _capture(monkeypatch, _Response(status_code, {"error": {"message": "model not found"}}))

    with pytest.raises(error, match=str(status_code)):
        _gemini().complete(system="s", turns=[Turn(role="user", text="hi")], tools=[])


def test_a_timeout_is_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    def timeout(*_args: Any, **_kwargs: Any) -> None:
        raise requests.Timeout

    monkeypatch.setattr(requests, "post", timeout)

    with pytest.raises(ChatModelUnavailableError):
        _openai().complete(system="s", turns=[Turn(role="user", text="hi")], tools=[])


def test_gemini_blocked_prompt_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    _capture(monkeypatch, _Response(200, {"promptFeedback": {"blockReason": "SAFETY"}}))

    with pytest.raises(ChatModelRejectedError, match="SAFETY"):
        _gemini().complete(system="s", turns=[Turn(role="user", text="hi")], tools=[])


def test_openai_maps_tool_turns_and_parses_arguments(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = _capture(
        monkeypatch,
        _Response(
            200,
            {
                "choices": [
                    {
                        "message": {
                            "content": None,
                            "tool_calls": [
                                {
                                    "id": "call_x",
                                    "type": "function",
                                    "function": {
                                        "name": "search_services",
                                        "arguments": '{"query": "ac"}',
                                    },
                                },
                                {
                                    "id": "call_y",
                                    "type": "function",
                                    "function": {
                                        "name": "search_services",
                                        "arguments": "{not json",
                                    },
                                },
                            ],
                        },
                        "finish_reason": "tool_calls",
                    }
                ],
                "usage": {"prompt_tokens": 50, "completion_tokens": 7},
            },
        ),
    )
    call = ToolCall(id="call_1", name="booking_status", arguments={})
    turns = [
        Turn(role="user", text="hi"),
        Turn(role="assistant", text="", tool_calls=(call,), provider="gemini"),
        Turn(
            role="tool", tool_results=(ToolResult("call_1", "booking_status", {"status": "none"}),)
        ),
    ]

    reply = _openai().complete(system="sys", turns=turns, tools=[SEARCH])

    messages = seen["json"]["messages"]
    assert messages[0] == {"role": "system", "content": "sys"}
    assert messages[2]["tool_calls"][0]["id"] == "call_1"
    assert messages[3] == {
        "role": "tool",
        "tool_call_id": "call_1",
        "content": '{"status": "none"}',
    }
    assert seen["json"]["tools"][0]["function"]["name"] == "search_services"
    assert reply.tool_calls[0].arguments == {"query": "ac"}
    assert reply.tool_calls[1].arguments == {"__invalid_arguments__": True}
    assert (reply.input_tokens, reply.output_tokens) == (50, 7)


class _Scripted:
    def __init__(self, code: str, outcome: ModelReply | Exception) -> None:
        self.code = code
        self.model = f"{code}-model"
        self.calls = 0
        self._outcome = outcome

    def complete(self, **_kwargs: Any) -> ModelReply:
        self.calls += 1
        if isinstance(self._outcome, Exception):
            raise self._outcome
        return self._outcome


def _reply(provider: str) -> ModelReply:
    return ModelReply(
        text="hello",
        tool_calls=(),
        provider=provider,
        model=f"{provider}-model",
        input_tokens=1,
        output_tokens=1,
        finish_reason="stop",
    )


def test_fallback_is_used_only_when_the_primary_fails() -> None:
    primary = _Scripted("gemini", ChatModelUnavailableError("503"))
    fallback = _Scripted("openai", _reply("openai"))

    reply = FallbackChatModel(primary=primary, fallback=fallback).complete(
        system="s", turns=[], tools=[]
    )

    assert reply.provider == "openai"
    assert (primary.calls, fallback.calls) == (1, 1)

    healthy = _Scripted("gemini", _reply("gemini"))
    unused = _Scripted("openai", _reply("openai"))
    assert (
        FallbackChatModel(primary=healthy, fallback=unused)
        .complete(system="s", turns=[], tools=[])
        .provider
        == "gemini"
    )
    assert unused.calls == 0


def test_a_named_provider_without_key_or_model_fails_closed(settings: SettingsWrapper) -> None:
    settings.ASSISTANT_PRIMARY_PROVIDER = "gemini"
    settings.GEMINI_API_KEY = "key"
    settings.GEMINI_MODEL = ""

    with pytest.raises(AssistantNotConfiguredError):
        chat_model_from_settings()

    settings.GEMINI_MODEL = "gemini-test"
    settings.ASSISTANT_FALLBACK_PROVIDER = "openai"
    settings.OPENAI_API_KEY = ""
    with pytest.raises(AssistantNotConfiguredError):
        chat_model_from_settings()

    settings.ASSISTANT_FALLBACK_PROVIDER = ""
    assert isinstance(chat_model_from_settings(), GeminiChatModel)
