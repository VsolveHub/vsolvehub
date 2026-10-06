"""Expo push transport, selected fail-closed.

An unconfigured environment raises rather than pretending a push was accepted. A silent
no-op would mark a job offer as delivered while the Partner's phone stayed dark.
"""

from dataclasses import dataclass
from typing import Any, Protocol

import requests
from django.conf import settings

EXPO_PUSH_SEND_URL = "https://exp.host/--/api/v2/push/send"
EXPO_PUSH_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts"
_SEND_CHUNK = 100
_RECEIPT_CHUNK = 300
_CONNECT_TIMEOUT_SECONDS = 3


class PushProviderError(RuntimeError):
    """Raised when no push provider can safely accept a message."""

    def __init__(self, message: str, *, failure_code: str = "provider_error") -> None:
        super().__init__(message)
        self.failure_code = failure_code


@dataclass(frozen=True, slots=True)
class PushSendResult:
    status: str
    ticket_id: str = ""
    error: str = ""


@dataclass(frozen=True, slots=True)
class PushReceipt:
    status: str
    error: str = ""


class PushProvider(Protocol):
    code: str

    def send(self, messages: list[dict[str, object]]) -> list[PushSendResult]: ...

    def get_receipts(self, ticket_ids: list[str]) -> dict[str, PushReceipt]: ...


class ExpoPushProvider:
    """HTTPS client for Expo's push service. Never logs the access token."""

    code = "expo"

    def send(self, messages: list[dict[str, object]]) -> list[PushSendResult]:
        results: list[PushSendResult] = []
        for start in range(0, len(messages), _SEND_CHUNK):
            results.extend(self._post_send(messages[start : start + _SEND_CHUNK]))
        return results

    def get_receipts(self, ticket_ids: list[str]) -> dict[str, PushReceipt]:
        receipts: dict[str, PushReceipt] = {}
        for start in range(0, len(ticket_ids), _RECEIPT_CHUNK):
            chunk = ticket_ids[start : start + _RECEIPT_CHUNK]
            payload = self._post(EXPO_PUSH_RECEIPTS_URL, {"ids": chunk})
            data = payload.get("data")
            if not isinstance(data, dict):
                raise PushProviderError("Expo receipt response did not include a data object.")
            for ticket_id, raw in data.items():
                if not isinstance(raw, dict):
                    continue
                status = raw.get("status")
                details = raw.get("details")
                error = ""
                if isinstance(details, dict) and isinstance(details.get("error"), str):
                    error = details["error"]
                receipts[str(ticket_id)] = PushReceipt(
                    status=status if isinstance(status, str) else "error",
                    error=error,
                )
        return receipts

    def _post_send(self, messages: list[dict[str, object]]) -> list[PushSendResult]:
        payload = self._post(EXPO_PUSH_SEND_URL, messages)
        data = payload.get("data")
        if not isinstance(data, list) or len(data) != len(messages):
            raise PushProviderError("Expo push response did not include one ticket per message.")
        results: list[PushSendResult] = []
        for item in data:
            if not isinstance(item, dict):
                raise PushProviderError(
                    "Expo push response included a ticket that was not an object."
                )
            status = item.get("status")
            if status == "ok" and isinstance(item.get("id"), str):
                results.append(PushSendResult(status="ok", ticket_id=item["id"]))
                continue
            details = item.get("details")
            error = ""
            if isinstance(details, dict) and isinstance(details.get("error"), str):
                error = details["error"]
            elif isinstance(item.get("message"), str):
                error = item["message"]
            results.append(PushSendResult(status="error", error=error or "provider_error"))
        return results

    def _post(self, url: str, body: Any) -> dict[str, object]:
        timeout = (
            _CONNECT_TIMEOUT_SECONDS,
            int(getattr(settings, "EXPO_PUSH_TIMEOUT_SECONDS", 10)),
        )
        headers = {"Accept": "application/json", "Content-Type": "application/json"}
        token = getattr(settings, "EXPO_ACCESS_TOKEN", "")
        if isinstance(token, str) and token:
            headers["Authorization"] = f"Bearer {token}"
        try:
            response = requests.post(url, json=body, headers=headers, timeout=timeout)
            response.raise_for_status()
        except requests.Timeout as exc:
            raise PushProviderError(
                "Expo push timed out.",
                failure_code="provider_timeout",
            ) from exc
        except requests.RequestException as exc:
            raise PushProviderError("Expo push request failed.") from exc
        parsed = response.json()
        if not isinstance(parsed, dict):
            raise PushProviderError("Expo push response was not a JSON object.")
        return parsed


class FakePushProvider:
    """Deterministic provider for development and tests. Never selectable in production."""

    code = "fake"

    def send(self, messages: list[dict[str, object]]) -> list[PushSendResult]:
        results: list[PushSendResult] = []
        for index, message in enumerate(messages):
            destination = message.get("to")
            token = destination if isinstance(destination, str) else "unknown"
            results.append(PushSendResult(status="ok", ticket_id=f"fake-{index}-{token[-12:]}"))
        return results

    def get_receipts(self, ticket_ids: list[str]) -> dict[str, PushReceipt]:
        return {ticket_id: PushReceipt(status="ok") for ticket_id in ticket_ids}


def get_push_provider(*, provider_code: str | None = None) -> PushProvider:
    """Select the provider, refusing rather than defaulting."""

    code = provider_code or getattr(settings, "MOBILE_PUSH_PROVIDER", "unconfigured")
    if code == FakePushProvider.code:
        allow_fake = getattr(settings, "MOBILE_PUSH_ALLOW_FAKE", False)
        if not settings.DEBUG and not allow_fake:
            raise PushProviderError("The fake push provider is not permitted in this environment.")
        return FakePushProvider()
    if code == ExpoPushProvider.code:
        return ExpoPushProvider()
    raise PushProviderError("No push provider is configured for this environment.")
