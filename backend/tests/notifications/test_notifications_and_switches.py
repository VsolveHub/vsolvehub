"""Notification intent, delivery and kill switches.

The property this file exists to protect: **a message that was not sent leaves a record saying
so.** A system that quietly drops a notification and reports nothing is one where "we told the
customer" and "we decided to tell the customer" become indistinguishable, which is exactly the
confusion `NotificationIntent` and `NotificationDelivery` are separate tables to prevent.
"""

import uuid
from typing import Any

import pytest

from apps.identity.models import CommunicationPreference, User
from apps.notifications.models import KillSwitch, NotificationDelivery, NotificationIntent
from apps.notifications.services import (
    MAX_DELIVERY_ATTEMPTS,
    engage_kill_switch,
    is_engaged,
    record_delivery_attempt,
    release_kill_switch,
    request_notification,
    retryable_intents,
)

pytestmark = pytest.mark.django_db(transaction=True)


def _user() -> User:
    return User.objects.create_user(phone_number=f"+919{uuid.uuid4().int % 10**9:09d}")


def _intent(
    recipient: User, *, purpose: str = "booking.confirmed", **kwargs: Any
) -> NotificationIntent:
    return request_notification(
        recipient_id=recipient.id,
        purpose=purpose,
        channel=NotificationIntent.Channel.SMS,
        template_code="tpl.booking_confirmed",
        **kwargs,
    )


# --------------------------------------------------------------------------------------------
# Intent
# --------------------------------------------------------------------------------------------


def test_requesting_a_notification_records_the_decision_as_pending() -> None:
    intent = _intent(_user())

    assert intent.status == NotificationIntent.Status.PENDING
    assert intent.attempts == 0


def test_the_same_key_requests_one_notification() -> None:
    recipient = _user()
    key = f"booking-confirmed:{uuid.uuid4()}"

    first = _intent(recipient, idempotency_key=key)
    second = _intent(recipient, idempotency_key=key)

    assert first.id == second.id
    assert NotificationIntent.objects.filter(idempotency_key=key).count() == 1


def test_the_context_carries_template_values_not_a_rendered_message() -> None:
    """A rendered body would freeze today's copy into a row that outlives it, and would store
    personal data this table has no reason to hold."""

    intent = request_notification(
        recipient_id=_user().id,
        purpose="booking.confirmed",
        channel=NotificationIntent.Channel.SMS,
        template_code="tpl.booking_confirmed",
        context={"booking_ref": "VSH-1234"},
    )

    assert intent.context == {"booking_ref": "VSH-1234"}
    assert not hasattr(intent, "body")


# --------------------------------------------------------------------------------------------
# Suppression is recorded, never silent
# --------------------------------------------------------------------------------------------


def test_a_kill_switch_suppresses_and_says_so() -> None:
    """A missing row looks identical to a bug. "We chose not to send this" is a fact an
    incident review needs."""

    engage_kill_switch(
        scope=KillSwitch.Scope.NOTIFICATIONS, reason="Provider incident", actor=_user()
    )

    intent = _intent(_user())

    assert intent.status == NotificationIntent.Status.SUPPRESSED
    assert intent.suppressed_reason == "kill_switch_engaged"


def test_an_sms_switch_suppresses_only_sms() -> None:
    engage_kill_switch(scope=KillSwitch.Scope.SMS, reason="Gateway down", actor=_user())
    recipient = _user()

    sms = _intent(recipient)
    email = request_notification(
        recipient_id=recipient.id,
        purpose="booking.confirmed",
        channel=NotificationIntent.Channel.EMAIL,
        template_code="tpl.booking_confirmed",
    )

    assert sms.status == NotificationIntent.Status.SUPPRESSED
    assert email.status == NotificationIntent.Status.PENDING


def test_an_opt_out_suppresses_a_marketing_message() -> None:
    recipient = _user()
    CommunicationPreference.objects.create(
        user=recipient,
        channel=NotificationIntent.Channel.SMS,
        purpose="marketing-offers",
        is_enabled=False,
    )

    intent = _intent(recipient, purpose="marketing-offers")

    assert intent.status == NotificationIntent.Status.SUPPRESSED
    assert intent.suppressed_reason == "recipient_opted_out"


def test_a_transactional_message_cannot_be_muted() -> None:
    """A preference screen that could switch this off would be a preference screen that breaks
    the product's promises. Somebody who muted promotions still learns their visit was
    cancelled."""

    recipient = _user()
    CommunicationPreference.objects.create(
        user=recipient,
        channel=NotificationIntent.Channel.SMS,
        purpose="booking.cancelled",
        is_enabled=False,
    )

    intent = _intent(recipient, purpose="booking.cancelled")

    assert intent.status == NotificationIntent.Status.PENDING


# --------------------------------------------------------------------------------------------
# Delivery
# --------------------------------------------------------------------------------------------


def test_an_accepted_delivery_marks_the_intent_sent() -> None:
    intent = _intent(_user())

    updated = record_delivery_attempt(
        intent_id=intent.id,
        provider="msg91",
        status=NotificationDelivery.Status.ACCEPTED,
        provider_message_id="m-1",
    )

    assert updated.status == NotificationIntent.Status.SENT
    assert updated.deliveries.count() == 1


def test_a_first_failure_reads_as_still_trying() -> None:
    intent = _intent(_user())

    updated = record_delivery_attempt(
        intent_id=intent.id, provider="msg91", status=NotificationDelivery.Status.FAILED
    )

    assert updated.status == NotificationIntent.Status.PENDING
    assert updated.attempts == 1


def test_an_intent_fails_visibly_once_its_budget_is_spent() -> None:
    """The state that must not exist is a message nobody sent that still reads `PENDING` --
    that is how a team ends up believing somebody was told."""

    intent = _intent(_user())
    for _ in range(MAX_DELIVERY_ATTEMPTS):
        record_delivery_attempt(
            intent_id=intent.id, provider="msg91", status=NotificationDelivery.Status.FAILED
        )

    intent.refresh_from_db()
    assert intent.status == NotificationIntent.Status.FAILED
    assert intent.deliveries.count() == MAX_DELIVERY_ATTEMPTS


def test_a_spent_intent_is_no_longer_retryable() -> None:
    intent = _intent(_user())
    for _ in range(MAX_DELIVERY_ATTEMPTS):
        record_delivery_attempt(
            intent_id=intent.id, provider="msg91", status=NotificationDelivery.Status.FAILED
        )

    assert intent.id not in {item.id for item in retryable_intents()}


def test_delivery_attempts_are_immutable() -> None:
    intent = _intent(_user())
    record_delivery_attempt(
        intent_id=intent.id, provider="msg91", status=NotificationDelivery.Status.FAILED
    )
    attempt = intent.deliveries.first()
    assert attempt is not None

    attempt.status = NotificationDelivery.Status.DELIVERED
    with pytest.raises(ValueError, match="immutable"):
        attempt.save(update_fields=("status",))


# --------------------------------------------------------------------------------------------
# Kill switches
# --------------------------------------------------------------------------------------------


def test_a_switch_needs_a_reason() -> None:
    """An outage nobody can explain afterwards is worse than the outage."""

    with pytest.raises(ValueError, match="reason"):
        engage_kill_switch(scope=KillSwitch.Scope.PAYOUTS, reason="   ", actor=_user())


def test_engaging_and_releasing_records_both_actors() -> None:
    engager = _user()
    releaser = _user()

    engage_kill_switch(scope=KillSwitch.Scope.PAYOUTS, reason="Bank incident", actor=engager)
    assert is_engaged(KillSwitch.Scope.PAYOUTS) is True

    released = release_kill_switch(scope=KillSwitch.Scope.PAYOUTS, actor=releaser)

    assert released is not None
    assert released.is_engaged is False
    assert released.engaged_by_id == engager.id
    assert released.released_by_id == releaser.id
    assert is_engaged(KillSwitch.Scope.PAYOUTS) is False


def test_a_targeted_switch_does_not_stop_everything() -> None:
    """Stopping one service area must not require stopping the platform."""

    engage_kill_switch(
        scope=KillSwitch.Scope.SERVICE_AREA,
        target="hyderabad-500032",
        reason="Flooding",
        actor=_user(),
    )

    assert is_engaged(KillSwitch.Scope.SERVICE_AREA, "hyderabad-500032") is True
    assert is_engaged(KillSwitch.Scope.SERVICE_AREA, "hyderabad-500081") is False


def test_a_global_switch_covers_every_target() -> None:
    engage_kill_switch(scope=KillSwitch.Scope.DISPATCH, reason="Total outage", actor=_user())

    assert is_engaged(KillSwitch.Scope.DISPATCH, "hyderabad-500032") is True


def test_releasing_a_switch_that_was_never_engaged_is_harmless() -> None:
    assert release_kill_switch(scope=KillSwitch.Scope.PAYMENTS, actor=_user()) is None
