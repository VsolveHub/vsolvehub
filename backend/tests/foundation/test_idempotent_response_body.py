"""What `execute_idempotent` is allowed to store, and why it has to normalise first.

## The failure this file exists to prevent coming back

A DRF serializer's `.data` is not JSON. It is a mapping the JSON *renderer* finishes on the way out
of the view, and a `PrimaryKeyRelatedField` over a UUID primary key leaves a `uuid.UUID` object in
it. `IdempotencyRecord.response_body` is a plain `JSONField`, which encodes with the stdlib
encoder — so storing that body raised `TypeError: Object of type UUID is not JSON serializable`.

The shape of the failure is what makes it worth a test of its own:

* it lands **after** the command has already done its work,
* **inside** the same transaction, so the domain write is rolled back with it,
* and it reaches the caller as `internal_error`, which says nothing about a serializer.

`POST /api/v1/proposals/` failed exactly this way. The `Proposal` was created, the record could not
be written, everything rolled back, and a vendor could not submit a quote at all — with a 500 that
pointed at nothing.

A hundred command endpoints share this boundary. Any of them returning a UUID, a `datetime` or a
`Decimal` would fail identically, so the guarantee is asserted here once rather than trusted at a
hundred call sites.
"""

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

import pytest

from apps.foundation.models import IdempotencyRecord
from apps.foundation.services import execute_idempotent
from apps.identity.models import User

#: Named rather than repeated inline: a bare `201` in an assertion is the magic value ruff
#: objects to, and the name says which of the two numbers in these tests is the status.
CREATED = 201

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture
def actor() -> User:
    return User.objects.create(phone_number="+919000000001")


def test_a_uuid_in_the_body_does_not_destroy_the_command(actor: User) -> None:
    """The regression itself, in one line of payload."""

    result = execute_idempotent(
        actor=actor,
        operation="test.command",
        key="uuid-body",
        request_payload={"a": 1},
        command=lambda: (201, {"id": uuid.uuid4()}),
    )

    assert result.status_code == CREATED
    assert isinstance(result.body, dict)
    # Stored as the string the renderer would have sent, not as a UUID.
    assert isinstance(result.body["id"], str)


def test_the_other_types_a_serializer_leaves_behind(actor: User) -> None:
    """`datetime` and `Decimal` reach a body as readily as a UUID does.

    Every M2 command response carries a `server_now`, and every money field is a `Decimal` before
    the renderer sees it. Both would have raised the same `TypeError` on the same line.
    """

    body = {
        "when": datetime(2026, 8, 19, 10, 30, tzinfo=UTC),
        "day": date(2026, 8, 19),
        "amount": Decimal("1234.50"),
        "nested": {"ids": [uuid.uuid4(), uuid.uuid4()]},
    }

    result = execute_idempotent(
        actor=actor,
        operation="test.command",
        key="mixed-body",
        request_payload={"a": 1},
        command=lambda: (200, body),
    )

    assert isinstance(result.body, dict)
    assert isinstance(result.body["when"], str)
    assert isinstance(result.body["day"], str)
    assert isinstance(result.body["amount"], str)
    assert all(isinstance(value, str) for value in result.body["nested"]["ids"])


def test_the_command_result_is_not_rolled_back(actor: User) -> None:
    """The half that made the bug so hard to read from the outside.

    The record is written inside the command's own transaction, so a failure storing it undoes work
    the command had already completed successfully. Asserting the record exists and is `COMPLETED`
    is asserting that nothing was undone.
    """

    execute_idempotent(
        actor=actor,
        operation="test.command",
        key="not-rolled-back",
        request_payload={"a": 1},
        command=lambda: (201, {"id": uuid.uuid4()}),
    )

    record = IdempotencyRecord.objects.get(operation="test.command", key="not-rolled-back")
    assert record.status == IdempotencyRecord.Status.COMPLETED
    assert record.response_status == CREATED


def test_a_replay_answers_exactly_what_the_first_call_answered(actor: User) -> None:
    """The promise an idempotency record makes, and the reason for a JSON round trip.

    Encoding the body on the way in is what makes the stored copy identical to the response the
    first caller received. An encoder on the column alone would store the value but leave a replay
    free to answer with a different *type* than the original response did — a `Decimal` where the
    first caller got a string — which is the kind of difference a client only discovers in
    production.
    """

    calls: list[int] = []

    def command() -> tuple[int, dict[str, object]]:
        calls.append(1)
        return 201, {"id": "fixed-id", "when": datetime(2026, 8, 19, tzinfo=UTC)}

    first = execute_idempotent(
        actor=actor,
        operation="test.command",
        key="replay",
        request_payload={"a": 1},
        command=command,
    )
    second = execute_idempotent(
        actor=actor,
        operation="test.command",
        key="replay",
        request_payload={"a": 1},
        command=command,
    )

    assert len(calls) == 1
    assert second.replayed is True
    assert first.body == second.body


def test_a_body_of_none_stays_none(actor: User) -> None:
    """A `204` carries nothing, and nothing is a valid stored body rather than a `"null"` string."""

    result = execute_idempotent(
        actor=actor,
        operation="test.command",
        key="empty-body",
        request_payload={"a": 1},
        command=lambda: (204, None),
    )

    assert result.body is None
    record = IdempotencyRecord.objects.get(operation="test.command", key="empty-body")
    assert record.response_body is None
