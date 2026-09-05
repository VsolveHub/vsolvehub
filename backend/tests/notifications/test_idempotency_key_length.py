"""An idempotency key that does not fit its column.

`NotificationIntent.idempotency_key` is `varchar(128)`, and every caller composes one by
concatenation: `notify_for_outbox_event` wraps the outbox event's own key in
`in-app:{key}:{recipient_id}` -- 44 characters of overhead -- and `escalation` appends a channel.

`OutboxEvent.idempotency_key` is **also** `varchar(128)`, so a key read from one column and grown
by 44 characters cannot be written back into a column of the same width. Two live event types
already exceed it:

    m2.fixed_visit_offer.held   94 -> 138
    m2.stage.awaiting_review    91 -> 135

which is a `DataError` inside the outbox handler, so the event retries until it is `FAILED` and
the notification is never delivered -- silently, from the reader's point of view.

The fix belongs here rather than in each caller: this module owns the column, and a rule enforced
at one of two call sites is a rule the third call site will not know about.
"""

import uuid

import pytest

from apps.identity.models import User
from apps.notifications.models import NotificationIntent
from apps.notifications.services import request_notification

pytestmark = pytest.mark.django_db(transaction=True)

MAX = NotificationIntent._meta.get_field("idempotency_key").max_length


def _user() -> User:
    return User.objects.create_user(phone_number=f"+919{uuid.uuid4().int % 10**9:09d}")


def _request(user: User, key: str) -> NotificationIntent:
    return request_notification(
        recipient_id=user.id,
        purpose="m2_shift_day",
        channel=NotificationIntent.Channel.EMAIL,
        template_code="m2_stage_awaiting_review",
        context={},
        idempotency_key=key,
    )


def _real_overflowing_key(recipient_id: uuid.UUID) -> str:
    """The exact shape that failed in dev: a stage event, wrapped for the in-app feed."""
    event_key = (
        "stage-awaiting-review:aa9e8b28-1c7d-4537-8ee0-d8f9bfc8fe4c"
        ":2026-09-01T18:51:46.416458+00:00"
    )
    return f"in-app:{event_key}:{recipient_id}"


def test_a_key_longer_than_the_column_is_still_stored() -> None:
    user = _user()
    key = _real_overflowing_key(user.id)
    assert len(key) > MAX, "the fixture must actually overflow, or this test proves nothing"

    intent = _request(user, key)

    assert len(intent.idempotency_key) <= MAX


def test_the_same_long_key_twice_is_one_intent() -> None:
    """The whole point of the field. A retried outbox delivery must not send twice."""
    user = _user()
    key = _real_overflowing_key(user.id)

    first = _request(user, key)
    second = _request(user, key)

    assert first.id == second.id
    assert NotificationIntent.objects.filter(recipient=user).count() == 1


def test_two_long_keys_sharing_a_prefix_are_not_confused() -> None:
    """The failure a plain truncation would introduce, which is worse than the crash.

    Every one of these keys begins with the same event type and the same UUID and differs only in
    a timestamp near the end -- exactly the part a naive `key[:128]` throws away. Two distinct
    events would then dedupe into one, and the second notification would never be sent.
    """
    user = _user()
    base = "in-app:stage-awaiting-review:aa9e8b28-1c7d-4537-8ee0-d8f9bfc8fe4c"
    first = _request(user, f"{base}:2026-09-01T18:51:46.416458+00:00:{user.id}")
    second = _request(user, f"{base}:2026-09-01T18:51:46.416459+00:00:{user.id}")

    assert first.id != second.id
    assert first.idempotency_key != second.idempotency_key


def test_a_key_that_fits_is_left_exactly_as_it_was() -> None:
    """Readability is not sacrificed for the long case.

    These keys are grepped for during support. Hashing every one of them to make the rare long
    one fit would trade a daily cost for a rare one.
    """
    user = _user()
    key = f"in-app:booking-fee-charged:{uuid.uuid4()}:{user.id}"
    assert len(key) <= MAX

    intent = _request(user, key)

    assert intent.idempotency_key == key


def test_an_empty_key_still_means_no_deduplication() -> None:
    """Blank is how a caller says "this one is not idempotent", and must stay blank."""
    user = _user()

    first = _request(user, "")
    second = _request(user, "")

    assert first.id != second.id
    assert first.idempotency_key == ""
