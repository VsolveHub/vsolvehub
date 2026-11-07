"""The idempotency behaviour the Rides start-OTP design depends on (proposal 0030, *Start OTP*).

A wrong OTP must count exactly once even when the phone retries. That is safe only if
`execute_idempotent` keeps a write made by a command that *returns* a refusal, replays that refusal
without running the command again, and rolls back a command that *raises*. These tests prove those
properties against the real `execute_idempotent`. Each counted attempt inserts one row, so "the
counter" is a row count. The start-OTP endpoint itself is not built yet; its own tests are listed in
the proposal's *Required tests*.
"""

from collections.abc import Callable

import pytest

from apps.foundation.exceptions import IdempotencyKeyReuseError
from apps.foundation.models import IdempotencyRecord
from apps.foundation.services import CommandResult, execute_idempotent
from apps.identity.models import User
from tests.rides.helpers import make_user

pytestmark = pytest.mark.django_db(transaction=True)

OPERATION = "rides.test.counted-refusal"
ATTEMPT_MARKER = "counted attempt"

Command = Callable[[], tuple[int, dict[str, object]]]


class _RefusedError(Exception):
    pass


def _attempts() -> int:
    return User.objects.filter(full_name=ATTEMPT_MARKER).count()


def _count_and_return_refusal(calls: list[int]) -> Command:
    """Stands in for a wrong OTP: one counted write, then a 400 *returned* as the result."""

    def command() -> tuple[int, dict[str, object]]:
        calls.append(1)
        make_user(ATTEMPT_MARKER)
        return 400, {"code": "otp_invalid", "attempts_left": 4}

    return command


def _count_and_raise(calls: list[int]) -> Command:
    """The wrong way: the same counted write, then the refusal *raised*."""

    def command() -> tuple[int, dict[str, object]]:
        calls.append(1)
        make_user(ATTEMPT_MARKER)
        raise _RefusedError

    return command


def _run(actor: User, key: str, payload: dict[str, str], command: Command) -> CommandResult:
    return execute_idempotent(
        actor=actor, operation=OPERATION, key=key, request_payload=payload, command=command
    )


def test_a_returned_refusal_keeps_its_write_and_its_stored_response_together() -> None:
    actor = make_user()
    calls: list[int] = []

    result = _run(actor, "k-1", {"otp_mac": "m1"}, _count_and_return_refusal(calls))

    assert result.status_code == 400
    assert _attempts() == 1
    record = IdempotencyRecord.objects.get(actor=actor, operation=OPERATION, key="k-1")
    assert record.status == IdempotencyRecord.Status.COMPLETED
    assert record.response_status == 400
    assert record.response_body == {"code": "otp_invalid", "attempts_left": 4}


def test_a_retry_with_the_same_key_replays_the_refusal_without_counting_again() -> None:
    actor = make_user()
    calls: list[int] = []
    command = _count_and_return_refusal(calls)

    first = _run(actor, "k-1", {"otp_mac": "m1"}, command)
    retry = _run(actor, "k-1", {"otp_mac": "m1"}, command)

    assert retry.replayed is True
    assert (retry.status_code, retry.body) == (first.status_code, first.body)
    assert len(calls) == 1
    assert _attempts() == 1


def test_the_same_key_with_a_different_payload_is_refused_without_counting() -> None:
    actor = make_user()
    calls: list[int] = []
    command = _count_and_return_refusal(calls)
    _run(actor, "k-1", {"otp_mac": "m1"}, command)

    with pytest.raises(IdempotencyKeyReuseError) as raised:
        _run(actor, "k-1", {"otp_mac": "m2"}, command)

    assert raised.value.status_code == 409
    assert len(calls) == 1
    assert _attempts() == 1


def test_each_new_key_is_a_new_attempt() -> None:
    actor = make_user()
    calls: list[int] = []
    command = _count_and_return_refusal(calls)

    for attempt in range(3):
        _run(actor, f"k-{attempt}", {"otp_mac": f"m{attempt}"}, command)

    assert len(calls) == 3
    assert _attempts() == 3


def test_a_raised_refusal_rolls_back_its_write_and_stores_nothing() -> None:
    """Why the OTP command must return its refusal: raising would undo the attempt count."""
    actor = make_user()
    calls: list[int] = []

    with pytest.raises(_RefusedError):
        _run(actor, "k-1", {"otp_mac": "m1"}, _count_and_raise(calls))

    assert _attempts() == 0
    assert not IdempotencyRecord.objects.filter(operation=OPERATION, key="k-1").exists()

    with pytest.raises(_RefusedError):
        _run(actor, "k-1", {"otp_mac": "m1"}, _count_and_raise(calls))

    assert len(calls) == 2, "nothing was stored, so the same key runs the command again"
    assert _attempts() == 0
