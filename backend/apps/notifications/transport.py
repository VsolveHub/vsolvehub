"""Outbound message transport boundary, selected fail-closed.

Follows ADR-0004: an unconfigured environment raises rather than guessing a provider. A
transport that quietly no-ops is worse than one that refuses, because a silent no-op reports
success to the escalation ladder and the deadline still passes unheard.

MSG91 is the SMS, WhatsApp and voice provider. It sends only when `MSG91_AUTH_KEY` is set.
Until that value arrives, selecting `msg91` still refuses rather than pretending a message left.
The deterministic fake remains selectable only outside production.
"""

import json
from dataclasses import dataclass
from typing import Protocol
from urllib.error import URLError
from urllib.request import Request, urlopen

from django.conf import settings

from apps.notifications.models import NotificationIntent


class MessageTransportError(RuntimeError):
    """Raised when no transport can safely carry a message."""


@dataclass(frozen=True, slots=True)
class TransportResult:
    provider: str
    provider_message_id: str
    accepted: bool
    failure_code: str = ""


class MessageTransport(Protocol):
    code: str

    def supported_channels(self) -> tuple[str, ...]: ...

    def send(
        self,
        *,
        channel: str,
        destination: str,
        template_code: str,
        context: dict[str, object],
    ) -> TransportResult: ...


class FakeMessageTransport:
    """Deterministic transport for development and tests. Never selectable in production."""

    code = "fake"

    def supported_channels(self) -> tuple[str, ...]:
        return (
            NotificationIntent.Channel.SMS,
            NotificationIntent.Channel.EMAIL,
            NotificationIntent.Channel.PUSH,
            NotificationIntent.Channel.WHATSAPP,
            NotificationIntent.Channel.VOICE,
        )

    def send(
        self,
        *,
        channel: str,
        destination: str,
        template_code: str,
        context: dict[str, object],
    ) -> TransportResult:
        del destination, context
        if channel not in self.supported_channels():
            raise MessageTransportError(f"The fake transport cannot carry {channel}.")
        return TransportResult(
            provider=self.code,
            provider_message_id=f"fake-{channel.lower()}-{template_code}",
            accepted=True,
        )


class Msg91MessageTransport:
    """MSG91 send. Refuses when the auth key is absent so an empty env cannot report success."""

    code = "msg91"

    def supported_channels(self) -> tuple[str, ...]:
        return (
            NotificationIntent.Channel.SMS,
            NotificationIntent.Channel.WHATSAPP,
        )

    def send(
        self,
        *,
        channel: str,
        destination: str,
        template_code: str,
        context: dict[str, object],
    ) -> TransportResult:
        auth_key = getattr(settings, "MSG91_AUTH_KEY", "")
        if not auth_key:
            raise MessageTransportError("MSG91 auth key is not configured.")
        if channel not in self.supported_channels():
            raise MessageTransportError(f"MSG91 cannot carry {channel}.")
        payload = json.dumps(
            {
                "template_id": template_code,
                "recipients": [{"mobiles": destination, **{k: str(v) for k, v in context.items()}}],
            }
        ).encode()
        request = Request(  # noqa: S310
            f"{settings.MSG91_API_BASE_URL}/flow/",
            data=payload,
            headers={
                "authkey": auth_key,
                "Content-Type": "application/json",
                "accept": "application/json",
            },
            method="POST",
        )
        try:
            with urlopen(request, timeout=10) as response:  # noqa: S310
                body = response.read().decode()
        except URLError as exc:
            raise MessageTransportError("MSG91 did not accept the message.") from exc
        return TransportResult(
            provider=self.code,
            provider_message_id=body[:120],
            accepted=True,
        )


def get_message_transport(*, provider_code: str | None = None) -> MessageTransport:
    """Select the transport, refusing rather than defaulting."""
    code = provider_code or getattr(settings, "MESSAGE_TRANSPORT", "unconfigured")
    if code == Msg91MessageTransport.code:
        if not getattr(settings, "MSG91_AUTH_KEY", ""):
            raise MessageTransportError("MSG91 auth key is not configured.")
        return Msg91MessageTransport()
    if code == FakeMessageTransport.code:
        allow_fake = getattr(settings, "NOTIFICATIONS_ALLOW_FAKE_TRANSPORT", False)
        if not settings.DEBUG and not allow_fake:
            raise MessageTransportError(
                "The fake message transport is not permitted in this environment.",
            )
        return FakeMessageTransport()
    raise MessageTransportError("No message transport is configured for this environment.")


def configured_channels() -> tuple[str, ...]:
    """Channels this deployment can actually send on, or none when nothing is wired."""
    try:
        return get_message_transport().supported_channels()
    except MessageTransportError:
        return ()
