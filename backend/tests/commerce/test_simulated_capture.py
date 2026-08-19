"""The development-only capture door, and the transaction it must open for itself.

`simulate_capture` takes a `select_for_update` lock on the `PaymentAttempt` as its very first
statement, and nothing above it supplies a transaction: the view does not wrap it and
`ATOMIC_REQUESTS` is off. Django raises `TransactionManagementError` for a row lock taken outside
a transaction, so a missing `@transaction.atomic` turns every "Mark as paid" press into a `500`.

**These tests take `transaction=True` deliberately.** Under the ordinary `django_db` mark each test
body already runs inside a transaction, which silently satisfies the lock and hides exactly this
defect — which is how it reached a running server once already. Only a test that owns no ambient
transaction can see it.
"""

import uuid

import pytest
from django.db.transaction import TransactionManagementError
from django.test import override_settings

from apps.commerce.models import PaymentAttempt
from apps.commerce.services import simulate_capture

pytestmark = pytest.mark.django_db(transaction=True)


@override_settings(PAYMENTS_ALLOW_SIMULATED_CAPTURE=True)
def test_simulate_capture_opens_its_own_transaction() -> None:
    """It must reach the lookup, not die on the lock.

    An unknown id is the cheapest probe that proves the lock was allowed to run: reaching
    `DoesNotExist` means `select_for_update` executed, and that can only happen inside a
    transaction. `TransactionManagementError` here is the regression itself.
    """
    with pytest.raises(PaymentAttempt.DoesNotExist):
        simulate_capture(attempt_id=uuid.uuid4(), customer_id=uuid.uuid4())


@override_settings(PAYMENTS_ALLOW_SIMULATED_CAPTURE=False)
def test_simulate_capture_stays_shut_when_disabled() -> None:
    """The settings flag is checked before the database is touched at all."""
    with pytest.raises(PermissionError):
        simulate_capture(attempt_id=uuid.uuid4(), customer_id=uuid.uuid4())


@override_settings(PAYMENTS_ALLOW_SIMULATED_CAPTURE=True)
def test_lock_failure_is_never_the_reason_a_capture_refuses() -> None:
    """Guards the specific failure mode rather than only its symptom.

    Asserting `DoesNotExist` above would still pass if some future refactor moved the lock behind
    another guard that raised `DoesNotExist` for its own reasons. This says the thing that actually
    matters: whatever `simulate_capture` refuses for, it is never for want of a transaction.
    """
    try:
        simulate_capture(attempt_id=uuid.uuid4(), customer_id=uuid.uuid4())
    except TransactionManagementError as exc:  # pragma: no cover - the regression
        pytest.fail(f"simulate_capture did not open a transaction for its row lock: {exc}")
    except PaymentAttempt.DoesNotExist:
        pass
