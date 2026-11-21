"""Operations can tell who started a refund, and what it was for (contract 1.115.0).

Refunds the system raises on its own (a cancellation, money that arrived after one) are listed
with everything else; without `started_by` they read exactly like one a person issued, so an
operator could not tell what the platform had done without them.
"""

from typing import Any

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from apps.commerce.models import PaymentAttempt, Refund
from apps.identity.models import Role, UserRole
from tests.helpers import force_role_client

User = get_user_model()
pytestmark = pytest.mark.django_db


def _attempt(purpose: str) -> PaymentAttempt:
    return PaymentAttempt.objects.create(
        purpose=purpose,
        amount_paise=100000,
        provider="fake",
        status=PaymentAttempt.Status.CAPTURED,
    )


def _user(phone: str, *, role: str | None = None, revoked: bool = False) -> Any:
    user = User.objects.create(phone_number=phone)
    if role:
        grant_role, _ = Role.objects.get_or_create(code=role, defaults={"name": role.title()})
        grant = UserRole.objects.create(user=user, role=grant_role)
        if revoked:
            grant.revoked_at = timezone.now()
            grant.save(update_fields=("revoked_at",))
    return user


def _refund(attempt: PaymentAttempt | None, *, by: Any = None, reason: str = "test") -> Refund:
    return Refund.objects.create(
        payment_attempt=attempt,
        amount_paise=5000,
        reason_code=reason,
        requested_by=by,
    )


def _operations_client() -> Any:
    return force_role_client(user=_user("+919933300001", role="operations"), role_code="operations")


def _rows(client: Any) -> dict[str, dict[str, Any]]:
    response = client.get("/api/v1/operations/refunds/")
    assert response.status_code == 200
    return {row["id"]: row for row in response.json()["results"]}


def test_each_refund_says_who_started_it() -> None:
    attempt = _attempt(PaymentAttempt.Purpose.A7_RENTAL_BOOKING)
    automatic = _refund(attempt, reason="rental_paid_after_cancellation")
    by_customer = _refund(attempt, by=_user("+919933300002", role="customer"))
    by_staff = _refund(attempt, by=_user("+919933300003", role="operations"))
    by_finance = _refund(attempt, by=_user("+919933300004", role="finance"))

    rows = _rows(_operations_client())

    assert rows[str(automatic.id)]["started_by"] == "AUTOMATIC"
    assert rows[str(by_customer.id)]["started_by"] == "CUSTOMER"
    assert rows[str(by_staff.id)]["started_by"] == "OPERATIONS"
    assert rows[str(by_finance.id)]["started_by"] == "OPERATIONS"


def test_a_revoked_staff_role_does_not_count_as_staff() -> None:
    former = _refund(
        _attempt(PaymentAttempt.Purpose.BOOKING_GROUP),
        by=_user("+919933300005", role="operations", revoked=True),
    )

    rows = _rows(_operations_client())

    assert rows[str(former.id)]["started_by"] == "CUSTOMER"


@pytest.mark.parametrize(
    "purpose",
    [
        PaymentAttempt.Purpose.BOOKING_GROUP,
        PaymentAttempt.Purpose.A7_RENTAL_BOOKING,
        PaymentAttempt.Purpose.A9_STAY_RESERVATION,
        PaymentAttempt.Purpose.M2_STAGE_FUNDING,
    ],
)
def test_each_refund_says_what_the_payment_was_for(purpose: str) -> None:
    refund = _refund(_attempt(purpose))

    rows = _rows(_operations_client())

    assert rows[str(refund.id)]["paid_for"] == purpose


def test_a_refund_without_a_payment_attempt_has_no_purpose() -> None:
    refund = _refund(None)

    rows = _rows(_operations_client())

    assert rows[str(refund.id)]["paid_for"] is None
    assert rows[str(refund.id)]["started_by"] == "AUTOMATIC"


def test_the_list_does_not_query_per_refund() -> None:
    """Who started each refund is read from prefetched roles, not one query per row."""

    client = _operations_client()
    attempt = _attempt(PaymentAttempt.Purpose.A7_RENTAL_BOOKING)
    _refund(attempt, by=_user("+919933300010", role="operations"))
    with CaptureQueriesContext(connection) as few:
        _rows(client)
    for index in range(8):
        _refund(attempt, by=_user(f"+91993330002{index}", role="customer"))

    with CaptureQueriesContext(connection) as many:
        _rows(client)

    assert len(many.captured_queries) == len(few.captured_queries)
