"""Daily Pass: plans on sale, ₹0 and paid purchase, idempotent retry, activation, expiry."""

from datetime import datetime, timedelta
from typing import Any

import pytest
from django.utils import timezone
from freezegun import freeze_time

from apps.commerce.models import PaymentAttempt
from apps.commerce.services.payments import initiate_standalone_payment_attempt
from apps.commerce.services.simulation import attempt_belongs_to
from apps.partners.models import PartnerApplication
from apps.rides.models import CaptainDutySession, CaptainPass, CaptainPassPlan
from apps.rides.services import complete_pass_payment, expire_passes
from tests.rides.helpers import (
    customer_client,
    make_user,
    partner_client,
    ready_captain,
    start_application,
)

pytestmark = pytest.mark.django_db

PLANS_URL = "/api/v1/partner/rides/pass-plans/"
PASSES_URL = "/api/v1/partner/rides/passes/"


def plan(code: str, price_paise: int, **overrides: Any) -> CaptainPassPlan:
    fields: dict[str, Any] = {
        "code": code,
        "name": code.title(),
        "price_paise": price_paise,
        "duration_hours": 24,
    }
    fields.update(overrides)
    return CaptainPassPlan.objects.create(**fields)


def buy(client: Any, plan_id: Any, key: str = "key-1") -> Any:
    return client.post(
        PASSES_URL, {"plan_id": str(plan_id)}, format="json", HTTP_IDEMPOTENCY_KEY=key
    )


def error_code(response: Any) -> str:
    return str(response.json()["error"]["code"])


# --- plans ------------------------------------------------------------------------------------


def test_only_active_plans_are_on_sale_cheapest_first() -> None:
    plan("week", 24900, duration_hours=168)
    plan("launch", 0)
    plan("retired", 100, is_active=False)

    body = ready_captain()[1].get(PLANS_URL).json()

    assert [p["code"] for p in body] == ["launch", "week"]


def test_customers_cannot_see_or_buy_passes() -> None:
    client = customer_client(make_user("A Customer"))
    assert client.get(PLANS_URL).status_code == 403
    assert buy(client, plan("launch", 0).id).status_code == 403


# --- the ₹0 plan ------------------------------------------------------------------------------


@freeze_time("2026-11-09 10:00:00")
def test_a_free_pass_is_active_at_once_for_its_hours() -> None:
    response = buy(ready_captain()[1], plan("launch", 0).id)

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "ACTIVE"
    assert body["payment_attempt_id"] is None
    ends_at = datetime.fromisoformat(body["ends_at"])
    assert ends_at == timezone.now() + timedelta(hours=24)
    assert not PaymentAttempt.objects.exists()


def test_the_free_plan_can_be_taken_again_once_the_last_pass_ends() -> None:
    _, client = ready_captain()
    free = plan("launch", 0)
    with freeze_time("2026-11-09 10:00:00"):
        assert buy(client, free.id, "a").status_code == 201
    with freeze_time("2026-11-10 10:00:01"):
        assert buy(client, free.id, "b").status_code == 201
    assert CaptainPass.objects.filter(status="ACTIVE").count() == 1
    assert CaptainPass.objects.filter(status="EXPIRED").count() == 1


# --- paid plans -------------------------------------------------------------------------------


def test_a_paid_pass_waits_for_its_payment() -> None:
    day = plan("day", 4900)

    body = buy(ready_captain()[1], day.id).json()

    assert body["status"] == "PENDING_ACTIVATION"
    attempt = PaymentAttempt.objects.get(id=body["payment_attempt_id"])
    assert attempt.purpose == PaymentAttempt.Purpose.RIDE_CAPTAIN_PASS
    assert attempt.amount_paise == 4900


def test_a_retry_with_the_same_key_replays_without_a_second_charge() -> None:
    _, client = ready_captain()
    day = plan("day", 4900)

    first = buy(client, day.id, "same")
    second = buy(client, day.id, "same")

    assert second.json() == first.json()
    assert second["Idempotent-Replay"] == "true"
    assert PaymentAttempt.objects.count() == 1


def test_a_new_tap_while_payment_is_pending_returns_the_same_pass() -> None:
    _, client = ready_captain()
    day = plan("day", 4900)

    first = buy(client, day.id, "tap-1").json()
    second = buy(client, day.id, "tap-2").json()

    assert second["id"] == first["id"]
    assert PaymentAttempt.objects.count() == 1


@freeze_time("2026-11-09 10:00:00")
def test_captured_payment_activates_the_pass_once() -> None:
    body = buy(ready_captain()[1], plan("day", 4900).id).json()

    complete_pass_payment(payment_attempt_id=body["payment_attempt_id"])
    complete_pass_payment(payment_attempt_id=body["payment_attempt_id"])

    captain_pass = CaptainPass.objects.get(id=body["id"])
    assert captain_pass.status == CaptainPass.Status.ACTIVE
    assert captain_pass.ends_at == timezone.now() + timedelta(hours=24)


def test_the_captain_owns_their_pass_payment_and_nobody_else_does() -> None:
    user, client = ready_captain()
    attempt = PaymentAttempt.objects.get(
        id=buy(client, plan("day", 4900).id).json()["payment_attempt_id"]
    )

    assert attempt_belongs_to(attempt=attempt, customer_id=user.id)
    assert not attempt_belongs_to(attempt=attempt, customer_id=make_user("Other").id)


# --- refusals ---------------------------------------------------------------------------------


def test_cannot_buy_while_a_pass_is_active() -> None:
    _, client = ready_captain()
    buy(client, plan("launch", 0).id, "a")

    response = buy(client, plan("day", 4900).id, "b")

    assert response.status_code == 409
    assert error_code(response) == "pass_already_active"


def test_the_idempotency_key_is_required() -> None:
    response = ready_captain()[1].post(
        PASSES_URL, {"plan_id": str(plan("launch", 0).id)}, format="json"
    )
    assert response.status_code == 400


def test_a_retired_plan_cannot_be_bought() -> None:
    assert buy(ready_captain()[1], plan("old", 0, is_active=False).id).status_code == 404


def test_history_shows_only_my_passes() -> None:
    _, mine = ready_captain("Me")
    _, other = ready_captain("Other")
    buy(other, plan("launch", 0).id)

    assert mine.get(PASSES_URL).json() == []


# --- expiry -----------------------------------------------------------------------------------


def test_expiry_ends_the_pass_and_takes_the_captain_off_duty() -> None:
    user, client = ready_captain()
    with freeze_time("2026-11-09 10:00:00"):
        buy(client, plan("launch", 0).id)
        client.post("/api/v1/partner/rides/duty/start/")
    with freeze_time("2026-11-10 10:00:01"):
        assert expire_passes() == 1

    assert CaptainPass.objects.get().status == CaptainPass.Status.EXPIRED
    session = CaptainDutySession.objects.get(partner__user=user)
    assert session.end_reason == CaptainDutySession.EndReason.PASS_EXPIRED


def test_expiry_leaves_valid_passes_alone() -> None:
    _, client = ready_captain()
    with freeze_time("2026-11-09 10:00:00"):
        buy(client, plan("launch", 0).id)
    with freeze_time("2026-11-10 09:59:59"):
        assert expire_passes() == 0
    assert CaptainPass.objects.get().status == CaptainPass.Status.ACTIVE


# --- one purchase in flight, and queued passes (Revision 2, R4) -------------------------------


def test_another_plan_is_refused_while_a_payment_is_going_through() -> None:
    _, client = ready_captain()
    buy(client, plan("day", 4900).id, "k-1")

    paid = buy(client, plan("week", 24900, duration_hours=168).id, "k-2")
    free = buy(client, plan("launch", 0).id, "k-3")

    assert (paid.status_code, error_code(paid)) == (409, "pass_purchase_pending")
    assert (free.status_code, error_code(free)) == (409, "pass_purchase_pending")
    assert PaymentAttempt.objects.count() == 1


def test_a_pending_purchase_stops_blocking_after_30_minutes() -> None:
    _, client = ready_captain()
    buy(client, plan("day", 4900).id, "k-1")

    with freeze_time(timezone.now() + timedelta(minutes=31)):
        response = buy(client, plan("launch", 0).id, "k-2")

    assert response.json()["status"] == "ACTIVE"


def _paid_pass_captured_during_a_free_one(client: Any) -> tuple[Any, Any]:
    """A paid purchase that hangs, a free pass taken after 30 minutes, then the late capture."""
    paid = buy(client, plan("day", 4900).id, "k-1").json()
    with freeze_time(timezone.now() + timedelta(minutes=31)):
        free = buy(client, plan("launch", 0).id, "k-2").json()
        complete_pass_payment(payment_attempt_id=paid["payment_attempt_id"])
    return CaptainPass.objects.get(id=paid["id"]), CaptainPass.objects.get(id=free["id"])


def test_a_payment_captured_during_an_active_pass_is_queued_not_lost() -> None:
    _, client = ready_captain()

    paid, free = _paid_pass_captured_during_a_free_one(client)

    assert (paid.status, paid.starts_at) == (CaptainPass.Status.QUEUED, None)
    assert free.status == CaptainPass.Status.ACTIVE  # the running pass is not shortened
    me = client.get("/api/v1/partner/rides/me/").json()
    assert me["queued_pass"]["id"] == str(paid.id)
    assert me["active_pass"]["id"] == str(free.id)


def test_the_queued_pass_starts_exactly_when_the_active_one_ends() -> None:
    user, client = ready_captain()
    paid, free = _paid_pass_captured_during_a_free_one(client)
    CaptainDutySession.objects.create(partner=paid.partner)

    # The expiry task runs a few minutes late; the queued pass still starts at the old end.
    with freeze_time(free.ends_at + timedelta(minutes=3)):
        expire_passes()

    paid.refresh_from_db()
    free.refresh_from_db()
    assert free.status == CaptainPass.Status.EXPIRED
    assert paid.status == CaptainPass.Status.ACTIVE
    assert paid.starts_at == free.ends_at
    assert paid.ends_at == free.ends_at + timedelta(hours=24)
    # The captain had a pass the whole time, so duty did not end.
    assert CaptainDutySession.objects.filter(partner__user=user, ended_at__isnull=True).exists()


def test_a_second_late_payment_is_left_for_operations_not_dropped() -> None:
    _, client = ready_captain()
    queued, _ = _paid_pass_captured_during_a_free_one(client)
    # Another hung payment for a third plan, captured while one pass is active and one queued.
    late = CaptainPass.objects.create(
        partner=queued.partner,
        plan=plan("week", 24900, duration_hours=168),
        payment_attempt=initiate_standalone_payment_attempt(
            purpose=PaymentAttempt.Purpose.RIDE_CAPTAIN_PASS,
            amount_paise=24900,
            idempotency_key="late-week",
        ),
    )

    complete_pass_payment(payment_attempt_id=late.payment_attempt_id)

    late.refresh_from_db()
    assert late.status == CaptainPass.Status.PENDING_ACTIVATION
    assert CaptainPass.objects.filter(status=CaptainPass.Status.QUEUED).count() == 1


@pytest.mark.parametrize("status", ["DRAFT", "SUBMITTED", "SUSPENDED"])
def test_only_an_approved_captain_can_buy_a_pass(status: str) -> None:
    user, client = ready_captain()
    application = PartnerApplication.objects.get(partner__user=user)
    application.status = status
    application.save(update_fields=("status",))

    response = buy(client, plan("launch", 0).id)

    assert (response.status_code, error_code(response)) == (403, "captain_not_approved")
    assert not CaptainPass.objects.exists()


def test_a_partner_on_another_track_cannot_buy_a_pass() -> None:
    electrician = make_user("Suresh Electrician")
    start_application(electrician, track=PartnerApplication.Track.SERVICES)

    response = buy(partner_client(electrician), plan("launch", 0).id)

    assert (response.status_code, error_code(response)) == (403, "captain_not_approved")
