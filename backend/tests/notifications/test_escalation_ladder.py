"""The escalation ladder and the fail-closed message transport."""

from datetime import timedelta

import pytest
from django.test import override_settings

from apps.identity.models import User
from apps.notifications import escalation
from apps.notifications.models import KillSwitch, NotificationIntent
from apps.notifications.transport import (
    MessageTransportError,
    configured_channels,
    get_message_transport,
)

pytestmark = pytest.mark.django_db

Channel = NotificationIntent.Channel

TWO_QUIET_CHANNELS = 2
FOUR_LADDER_CHANNELS = 4


def _recipient(phone: str = "+919812345671") -> User:
    return User.objects.create_user(phone_number=phone, full_name="Rapid Labour")


# ---------------------------------------------------------------------------
# Ladder policy
# ---------------------------------------------------------------------------


def test_a_distant_deadline_stays_on_the_quiet_channel() -> None:
    due = escalation.channels_due(
        purpose="m2.invitation.received", time_remaining=timedelta(days=2)
    )

    assert due == (Channel.PUSH,)


def test_channels_accumulate_as_the_deadline_approaches() -> None:
    at_five_hours = escalation.channels_due(
        purpose="m2.invitation.received", time_remaining=timedelta(hours=5)
    )
    at_twenty_minutes = escalation.channels_due(
        purpose="m2.invitation.received", time_remaining=timedelta(minutes=20)
    )

    assert at_five_hours == (Channel.PUSH, Channel.SMS)
    # Escalation adds; it does not swap. The earlier attempts stay on the record.
    assert at_twenty_minutes == (Channel.PUSH, Channel.SMS, Channel.WHATSAPP, Channel.VOICE)


def test_a_quiet_purpose_never_escalates_to_a_phone_call() -> None:
    due = escalation.channels_due(purpose="m2.quotes.ready", time_remaining=timedelta(minutes=1))

    assert Channel.VOICE not in due
    assert due == (Channel.PUSH, Channel.SMS)


def test_an_unknown_purpose_defaults_to_the_quiet_ladder() -> None:
    due = escalation.channels_due(purpose="something.new", time_remaining=timedelta(minutes=1))

    assert Channel.VOICE not in due


# ---------------------------------------------------------------------------
# Recording intents
# ---------------------------------------------------------------------------


def test_escalating_records_one_intent_per_due_channel() -> None:
    recipient = _recipient()

    intents = escalation.escalate(
        recipient_id=recipient.id,
        purpose="m2.invitation.received",
        template_code="invitation_received",
        time_remaining=timedelta(hours=5),
        correlation_key="invitation-abc",
    )

    assert [intent.channel for intent in intents] == [Channel.PUSH, Channel.SMS]
    assert NotificationIntent.objects.count() == TWO_QUIET_CHANNELS


def test_a_repeated_sweep_does_not_call_the_same_vendor_twice() -> None:
    recipient = _recipient()
    kwargs = {
        "recipient_id": recipient.id,
        "purpose": "m2.invitation.received",
        "template_code": "invitation_received",
        "time_remaining": timedelta(minutes=20),
        "correlation_key": "invitation-abc",
    }

    escalation.escalate(**kwargs)
    escalation.escalate(**kwargs)

    assert NotificationIntent.objects.count() == FOUR_LADDER_CHANNELS  # one per channel, not two
    assert NotificationIntent.objects.filter(channel=Channel.VOICE).count() == 1


def test_a_whatsapp_kill_switch_suppresses_only_whatsapp() -> None:
    recipient = _recipient()
    operator = User.objects.create_user(phone_number="+919900000010", full_name="Ops")
    KillSwitch.objects.create(
        scope=KillSwitch.Scope.WHATSAPP,
        is_engaged=True,
        reason="Provider outage",
        engaged_by=operator,
    )

    intents = escalation.escalate(
        recipient_id=recipient.id,
        purpose="m2.invitation.received",
        template_code="invitation_received",
        time_remaining=timedelta(minutes=20),
        correlation_key="invitation-xyz",
    )

    by_channel = {intent.channel: intent for intent in intents}
    assert by_channel[Channel.WHATSAPP].status == NotificationIntent.Status.SUPPRESSED
    assert by_channel[Channel.WHATSAPP].suppressed_reason == "kill_switch_engaged"
    assert by_channel[Channel.VOICE].status == NotificationIntent.Status.PENDING
    assert by_channel[Channel.SMS].status == NotificationIntent.Status.PENDING


# ---------------------------------------------------------------------------
# Fail-closed transport (MSG91 not yet integrated)
# ---------------------------------------------------------------------------


@override_settings(MESSAGE_TRANSPORT="unconfigured")
def test_an_unconfigured_transport_refuses_rather_than_pretending_to_send() -> None:
    with pytest.raises(MessageTransportError):
        get_message_transport()

    assert configured_channels() == ()


@override_settings(MESSAGE_TRANSPORT="msg91", MSG91_AUTH_KEY="")
def test_msg91_without_credentials_refuses() -> None:
    with pytest.raises(MessageTransportError):
        get_message_transport()


@override_settings(MESSAGE_TRANSPORT="msg91", MSG91_AUTH_KEY="test-key")
def test_msg91_transport_is_selected_when_the_auth_key_is_set() -> None:
    transport = get_message_transport()
    assert transport.code == "msg91"


@override_settings(MESSAGE_TRANSPORT="fake", NOTIFICATIONS_ALLOW_FAKE_TRANSPORT=True)
def test_the_fake_transport_carries_every_ladder_channel() -> None:
    transport = get_message_transport()

    assert escalation.unreachable_channels(transport.supported_channels()) == ()


@override_settings(DEBUG=False, MESSAGE_TRANSPORT="fake", NOTIFICATIONS_ALLOW_FAKE_TRANSPORT=False)
def test_the_fake_transport_is_refused_when_it_is_not_explicitly_allowed() -> None:
    with pytest.raises(MessageTransportError):
        get_message_transport()


@override_settings(MESSAGE_TRANSPORT="unconfigured")
def test_the_ladder_reports_the_channels_it_cannot_reach() -> None:
    unreachable = escalation.unreachable_channels(configured_channels())

    assert Channel.VOICE in unreachable
    assert Channel.WHATSAPP in unreachable
