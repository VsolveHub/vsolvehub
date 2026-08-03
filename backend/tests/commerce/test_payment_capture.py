import hashlib
import hmac
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from http import HTTPStatus
from typing import Any

import pytest
from django.conf import settings
from django.db import close_old_connections
from django.db.models import Sum
from django.utils import timezone
from rest_framework.test import APIClient

from apps.assignments.group_services import accept_unit_offer, reconcile_group_dispatch
from apps.assignments.models import PartnerOffer, Reservation
from apps.carts.models import BookingGroup, CheckoutSession, FulfilmentUnit
from apps.commerce import tasks as commerce_tasks
from apps.commerce.models import (
    Booking,
    FinancialException,
    Order,
    PaymentAllocation,
    PaymentAttempt,
    PaymentWebhook,
    Refund,
    TaxDocument,
    TaxDocumentLine,
)
from apps.commerce.providers import (
    FakePaymentProvider,
    PaymentProviderAmbiguousError,
    PaymentProviderRejectedError,
    ProviderOrder,
    ProviderPayment,
)
from apps.commerce.services import (
    apply_provider_payment,
    create_provider_order,
    initiate_payment_attempt,
    reconcile_payment_attempt,
    request_unit_refund,
    submit_refund,
)
from apps.identity.models import Role, User, UserRole, UserSession
from tests.carts.test_fulfilment_planning import (
    _add_item,
    _customer_context,
    _partner,
    _plan,
)
from tests.helpers import force_role_client

pytestmark = pytest.mark.django_db(transaction=True)
EXPECTED_WEBHOOK_EVENTS = 3
EXPECTED_PARALLEL_UNITS = 2
CONCURRENT_PAYMENT_COMMANDS = 2


def _payment_ready_group(
    *, parallel: bool = False
) -> tuple[APIClient, User, CheckoutSession, BookingGroup]:
    client, customer, address_id, version = _customer_context()
    cart = _add_item(client, slug="switch-socket-repair", cart_version=version)
    _partner(suffix="81", variant_slugs=("switch-socket-repair",))
    if parallel:
        cart = _add_item(client, slug="tap-repair", cart_version=int(cart["version"]))
        _partner(suffix="82", variant_slugs=("tap-repair",))
    plan = _plan(client, address_id=address_id, cart_version=int(cart["version"]))["plans"][0]
    quote_response = client.post(
        "/api/v1/plan-quotes/",
        {"plan_id": plan["id"]},
        format="json",
        HTTP_IDEMPOTENCY_KEY="be08-quote",
    )
    assert quote_response.status_code == HTTPStatus.CREATED
    checkout_response = client.post(
        "/api/v1/checkouts/",
        {"quote_id": quote_response.json()["id"]},
        format="json",
        HTTP_IDEMPOTENCY_KEY="be08-checkout",
    )
    assert checkout_response.status_code == HTTPStatus.CREATED
    checkout = CheckoutSession.objects.get(id=checkout_response.json()["id"])
    group = BookingGroup.objects.get(id=checkout.booking_group_id)
    offers = list(
        PartnerOffer.objects.filter(fulfilment_unit__booking_group=group).select_related("partner")
    )
    assert offers
    for offer in offers:
        accepted = accept_unit_offer(offer_id=offer.id, partner=offer.partner)
        accepted.undo_deadline = timezone.now() - timedelta(seconds=1)
        accepted.save(update_fields=("undo_deadline",))
    reconcile_group_dispatch(group_id=group.id)
    checkout.refresh_from_db()
    group.refresh_from_db()
    assert checkout.status == CheckoutSession.Status.PARTNER_COMMITTED
    assert group.status == BookingGroup.Status.PAYMENT_PENDING
    return client, customer, checkout, group


def _create_attempt(
    client: APIClient,
    checkout: CheckoutSession,
    *,
    key: str = "be08-payment",
) -> PaymentAttempt:
    response = client.post(
        "/api/v1/payment-attempts/",
        {
            "checkout_id": str(checkout.id),
            "expected_checkout_version": checkout.version,
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY=key,
    )
    assert response.status_code == HTTPStatus.ACCEPTED, response.json()
    attempt = PaymentAttempt.objects.get(id=response.json()["id"])
    assert attempt.status == PaymentAttempt.Status.CREATED
    assert attempt.provider_order_id
    return attempt


def _capture(attempt: PaymentAttempt, *, payment_id: str = "fake_payment_be08") -> Order:
    order = apply_provider_payment(
        provider_code="fake",
        payment=ProviderPayment(
            provider_payment_id=payment_id,
            provider_order_id=attempt.provider_order_id,
            amount_paise=attempt.amount_paise,
            currency=attempt.currency,
            status="captured",
        ),
    )
    assert order is not None
    return order


def _finance_client() -> tuple[APIClient, User]:
    role, _created = Role.objects.get_or_create(
        code="finance",
        defaults={"name": "Finance", "is_system": True},
    )
    user = User.objects.create_user(phone_number="+919876548888")
    UserRole.objects.create(user=user, role=role)
    client = force_role_client(user=user, role_code="finance")
    session = UserSession.objects.get(user=user, active_role=role)
    session.stepped_up_at = timezone.now()
    session.save(update_fields=("stepped_up_at",))
    return client, user


def test_group_payment_allocates_every_line_and_capture_materializes_every_unit() -> None:
    client, _customer, checkout, group = _payment_ready_group()
    attempt = _create_attempt(client, checkout)

    allocations = list(attempt.allocations.select_related("fulfilment_line"))
    assert len(allocations) == group.units.first().lines.count()  # type: ignore[union-attr]
    assert sum(allocation.amount_paise for allocation in allocations) == attempt.amount_paise
    assert all(
        allocation.fulfilment_line.unit_id == allocation.fulfilment_unit_id
        for allocation in allocations
    )
    detail = client.get(f"/api/v1/payment-attempts/{attempt.id}/")
    checkout_payment = client.get(f"/api/v1/checkouts/{checkout.id}/payment/")
    reconciliation = client.post(
        f"/api/v1/payment-attempts/{attempt.id}/reconcile/",
        HTTP_IDEMPOTENCY_KEY="payment-read-reconcile",
    )
    assert detail.status_code == checkout_payment.status_code == HTTPStatus.OK
    assert reconciliation.status_code == HTTPStatus.OK

    order = _capture(attempt)
    replay = _capture(attempt)
    attempt.refresh_from_db()
    group.refresh_from_db()
    checkout.refresh_from_db()

    assert replay.id == order.id
    assert attempt.status == PaymentAttempt.Status.CAPTURED
    assert group.status == BookingGroup.Status.BOOKED
    assert checkout.status == CheckoutSession.Status.COMPLETED
    assert Order.objects.count() == 1
    assert Booking.objects.filter(order=order).count() == group.units.count()
    assert set(group.units.values_list("status", flat=True)) == {FulfilmentUnit.Status.BOOKED}
    assert not Order.objects.filter(partner__isnull=False).exists()
    assert TaxDocument.objects.filter(order=order, kind=TaxDocument.Kind.INVOICE).count() == 1
    invoice = TaxDocument.objects.get(order=order, kind=TaxDocument.Kind.INVOICE)
    assert invoice.lines.aggregate(total=Sum("total_paise"))["total"] == order.total_paise
    assert invoice.lines.aggregate(tax=Sum("tax_paise"))["tax"] == order.quote.tax_paise


def test_payment_creation_is_idempotent_and_conflicting_active_attempt_is_rejected() -> None:
    client, _customer, checkout, _group = _payment_ready_group()
    payload = {
        "checkout_id": str(checkout.id),
        "expected_checkout_version": checkout.version,
    }
    first = client.post(
        "/api/v1/payment-attempts/",
        payload,
        format="json",
        HTTP_IDEMPOTENCY_KEY="stable-payment-command",
    )
    replay = client.post(
        "/api/v1/payment-attempts/",
        payload,
        format="json",
        HTTP_IDEMPOTENCY_KEY="stable-payment-command",
    )
    assert first.status_code == replay.status_code == HTTPStatus.ACCEPTED
    assert first.json() == replay.json()
    assert replay["Idempotent-Replay"] == "true"
    assert PaymentAttempt.objects.count() == 1

    checkout.refresh_from_db()
    conflict = client.post(
        "/api/v1/payment-attempts/",
        {
            "checkout_id": str(checkout.id),
            "expected_checkout_version": checkout.version,
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY="different-payment-command",
    )
    assert conflict.status_code == HTTPStatus.CONFLICT
    assert conflict.json()["error"]["code"] == "payment_conflict"


def test_concurrent_payment_start_serializes_to_one_attempt() -> None:
    _client, customer, checkout, _group = _payment_ready_group()

    def start(key: str) -> str:
        close_old_connections()
        try:
            initiate_payment_attempt(
                checkout_id=checkout.id,
                customer_id=customer.id,
                expected_checkout_version=checkout.version,
                idempotency_key=key,
            )
        except ValueError:
            return "conflict"
        finally:
            close_old_connections()
        return "created"

    with ThreadPoolExecutor(max_workers=CONCURRENT_PAYMENT_COMMANDS) as executor:
        outcomes = set(executor.map(start, ("concurrent-a", "concurrent-b")))

    assert outcomes == {"created", "conflict"}
    assert PaymentAttempt.objects.filter(checkout=checkout).count() == 1


def test_duplicate_and_out_of_order_webhooks_converge_without_downgrade() -> None:
    client, _customer, checkout, _group = _payment_ready_group()
    attempt = _create_attempt(client, checkout)
    attempt.provider = "razorpay"
    attempt.save(update_fields=("provider",))

    def send(event_type: str, event_id: str, status_value: str) -> Any:
        payload = {
            "event": event_type,
            "payload": {
                "payment": {
                    "entity": {
                        "id": "pay_be08_webhook",
                        "order_id": attempt.provider_order_id,
                        "amount": attempt.amount_paise,
                        "currency": attempt.currency,
                        "status": status_value,
                    }
                }
            },
        }
        raw = json.dumps(payload, separators=(",", ":")).encode()
        signature = hmac.new(
            settings.PAYMENT_WEBHOOK_SECRET.encode(), raw, hashlib.sha256
        ).hexdigest()
        return client.post(
            "/api/v1/payment-webhooks/razorpay/",
            data=raw,
            content_type="application/json",
            HTTP_X_RAZORPAY_SIGNATURE=signature,
            HTTP_X_RAZORPAY_EVENT_ID=event_id,
        )

    captured = send("payment.captured", "rzp-event-captured", "captured")
    duplicate = send("payment.captured", "rzp-event-captured", "captured")
    late_authorized = send("payment.authorized", "rzp-event-authorized", "authorized")
    late_failed = send("payment.failed", "rzp-event-failed", "failed")

    assert captured.status_code == HTTPStatus.ACCEPTED
    assert duplicate.status_code == HTTPStatus.OK
    assert duplicate.json()["duplicate"] is True
    assert late_authorized.status_code == late_failed.status_code == HTTPStatus.ACCEPTED
    attempt.refresh_from_db()
    assert attempt.status == PaymentAttempt.Status.CAPTURED
    assert Order.objects.count() == 1
    assert PaymentWebhook.objects.count() == EXPECTED_WEBHOOK_EVENTS
    assert set(PaymentWebhook.objects.values_list("status", flat=True)) == {
        PaymentWebhook.Status.PROCESSED
    }


def test_failed_payment_event_is_monotonic_before_capture() -> None:
    client, _customer, checkout, _group = _payment_ready_group()
    attempt = _create_attempt(client, checkout, key="failed-payment")

    result = apply_provider_payment(
        provider_code="fake",
        payment=ProviderPayment(
            provider_payment_id="fake_payment_failed",
            provider_order_id=attempt.provider_order_id,
            amount_paise=attempt.amount_paise,
            currency=attempt.currency,
            status="failed",
        ),
    )

    assert result is None
    attempt.refresh_from_db()
    assert attempt.status == PaymentAttempt.Status.FAILED
    assert attempt.failure_code == "provider_payment_failed"


def test_provider_payment_amount_mismatch_fails_closed_and_opens_exception() -> None:
    client, _customer, checkout, _group = _payment_ready_group()
    attempt = _create_attempt(client, checkout, key="amount-mismatch-payment")

    result = apply_provider_payment(
        provider_code="fake",
        payment=ProviderPayment(
            provider_payment_id="fake_payment_wrong_amount",
            provider_order_id=attempt.provider_order_id,
            amount_paise=attempt.amount_paise + 1,
            currency=attempt.currency,
            status="captured",
        ),
    )

    assert result is None
    attempt.refresh_from_db()
    assert attempt.status == PaymentAttempt.Status.CREATED
    assert attempt.reconciliation_state == PaymentAttempt.ReconciliationState.NEEDS_ATTENTION
    assert attempt.failure_code == "provider_payment_amount_mismatch"
    assert FinancialException.objects.filter(
        payment_attempt=attempt,
        kind=FinancialException.Kind.AMOUNT_MISMATCH,
        status=FinancialException.Status.OPEN,
    ).exists()


def test_redirect_loss_reconciliation_recovers_from_provider_truth() -> None:
    client, _customer, checkout, _group = _payment_ready_group()
    attempt = _create_attempt(client, checkout)
    FakePaymentProvider.record_payment(
        provider_payment_id="fake_payment_redirect_loss",
        provider_order_id=attempt.provider_order_id,
        amount_paise=attempt.amount_paise,
        status="captured",
    )

    reconciled = reconcile_payment_attempt(attempt_id=attempt.id)

    assert reconciled.status == PaymentAttempt.Status.CAPTURED
    assert Order.objects.filter(booking_group=attempt.booking_group).exists()


def test_ambiguous_order_creation_stays_reconcilable_and_opens_exception(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _client, customer, checkout, _group = _payment_ready_group()
    monkeypatch.setattr(
        "apps.foundation.services._queue_outbox_event",
        lambda _event_id: None,
    )
    attempt = initiate_payment_attempt(
        checkout_id=checkout.id,
        customer_id=customer.id,
        expected_checkout_version=checkout.version,
        idempotency_key="ambiguous-order",
    )

    class AmbiguousProvider:
        def create_order(self, **_kwargs: object) -> None:
            raise PaymentProviderAmbiguousError

    monkeypatch.setattr(
        "apps.commerce.services.get_payment_provider",
        lambda **_kwargs: AmbiguousProvider(),
    )

    result = create_provider_order(attempt_id=attempt.id)

    assert result.status == PaymentAttempt.Status.PROVIDER_PENDING
    assert result.reconciliation_state == PaymentAttempt.ReconciliationState.NEEDS_ATTENTION
    assert result.failure_code == "provider_order_ambiguous"
    assert FinancialException.objects.filter(
        payment_attempt=attempt,
        kind=FinancialException.Kind.PROVIDER_AMBIGUITY,
    ).exists()


def test_rejected_provider_order_fails_definitively_without_financial_exception(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _client, customer, checkout, _group = _payment_ready_group()
    monkeypatch.setattr("apps.foundation.services._queue_outbox_event", lambda _event_id: None)
    attempt = initiate_payment_attempt(
        checkout_id=checkout.id,
        customer_id=customer.id,
        expected_checkout_version=checkout.version,
        idempotency_key="rejected-provider-order",
    )

    class RejectedProvider:
        def create_order(self, **_kwargs: object) -> None:
            raise PaymentProviderRejectedError

    monkeypatch.setattr(
        "apps.commerce.services.get_payment_provider",
        lambda **_kwargs: RejectedProvider(),
    )

    result = create_provider_order(attempt_id=attempt.id)

    assert result.status == PaymentAttempt.Status.FAILED
    assert result.reconciliation_state == PaymentAttempt.ReconciliationState.IN_SYNC
    assert result.failure_code == "provider_order_rejected"
    assert not FinancialException.objects.filter(payment_attempt=attempt).exists()


def test_provider_order_amount_mismatch_fails_closed_and_opens_exception(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _client, customer, checkout, _group = _payment_ready_group()
    monkeypatch.setattr("apps.foundation.services._queue_outbox_event", lambda _event_id: None)
    attempt = initiate_payment_attempt(
        checkout_id=checkout.id,
        customer_id=customer.id,
        expected_checkout_version=checkout.version,
        idempotency_key="mismatched-provider-order",
    )

    class MismatchedProvider:
        def create_order(self, **_kwargs: object) -> ProviderOrder:
            return ProviderOrder(
                provider_order_id="fake_order_wrong_amount",
                amount_paise=attempt.amount_paise + 1,
                currency=attempt.currency,
                status="created",
            )

    monkeypatch.setattr(
        "apps.commerce.services.get_payment_provider",
        lambda **_kwargs: MismatchedProvider(),
    )

    result = create_provider_order(attempt_id=attempt.id)

    assert result.status == PaymentAttempt.Status.FAILED
    assert result.reconciliation_state == PaymentAttempt.ReconciliationState.NEEDS_ATTENTION
    assert result.failure_code == "provider_order_amount_mismatch"
    assert FinancialException.objects.filter(
        payment_attempt=attempt,
        kind=FinancialException.Kind.AMOUNT_MISMATCH,
        code="provider_order_amount_mismatch",
    ).exists()


def test_parallel_group_capture_creates_one_booking_per_unit_and_partial_unit_refund() -> None:
    customer_client, _customer, checkout, group = _payment_ready_group(parallel=True)
    assert group.units.count() == EXPECTED_PARALLEL_UNITS
    attempt = _create_attempt(customer_client, checkout, key="parallel-payment")
    order = _capture(attempt, payment_id="fake_payment_parallel")
    assert order.bookings.count() == group.units.count()
    assert set(order.bookings.values_list("fulfilment_unit_id", flat=True)) == set(
        group.units.values_list("id", flat=True)
    )

    unit = group.units.order_by("position").first()
    assert unit is not None
    finance_client, _finance_user = _finance_client()
    response = finance_client.post(
        "/api/v1/finance/refunds/",
        {
            "order_id": str(order.id),
            "fulfilment_unit_ids": [str(unit.id)],
            "reason_code": "unit_cancelled",
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY="parallel-one-unit-refund",
    )

    assert response.status_code == HTTPStatus.ACCEPTED
    refund = Refund.objects.get(id=response.json()["id"])
    attempt.refresh_from_db()
    order.refresh_from_db()
    assert refund.status == Refund.Status.SUCCEEDED
    assert refund.amount_paise == unit.total_paise
    assert attempt.status == PaymentAttempt.Status.PARTIALLY_REFUNDED
    assert order.status == Order.Status.CONFIRMED
    refunded_unit_ids = refund.allocations.values_list(
        "payment_allocation__fulfilment_unit_id", flat=True
    )
    assert set(refunded_unit_ids) == {unit.id}
    assert TaxDocument.objects.filter(order=order, kind=TaxDocument.Kind.CREDIT_NOTE).count() == 1


def test_late_capture_without_reacquirable_capacity_refunds_and_opens_exception() -> None:
    client, _customer, checkout, group = _payment_ready_group(parallel=True)
    attempt = _create_attempt(client, checkout, key="late-capture-payment")
    reservations = list(
        Reservation.objects.filter(fulfilment_unit__booking_group=group).order_by(
            "fulfilment_unit__position"
        )
    )
    assert len(reservations) == EXPECTED_PARALLEL_UNITS
    first, second = reservations
    first.release()
    second.partner = first.partner
    second.occupied_range = first.occupied_range
    second.save(update_fields=("partner", "occupied_range"))

    result = apply_provider_payment(
        provider_code="fake",
        payment=ProviderPayment(
            provider_payment_id="fake_payment_late_capture",
            provider_order_id=attempt.provider_order_id,
            amount_paise=attempt.amount_paise,
            currency=attempt.currency,
            status="captured",
        ),
    )

    assert result is None
    attempt.refresh_from_db()
    assert attempt.status == PaymentAttempt.Status.REFUNDED
    assert not Order.objects.filter(booking_group=group).exists()
    refund = Refund.objects.get(payment_attempt=attempt)
    assert refund.status == Refund.Status.SUCCEEDED
    assert refund.reason_code == "capture_without_capacity"
    assert FinancialException.objects.filter(
        payment_attempt=attempt,
        kind=FinancialException.Kind.CAPTURE_WITHOUT_CAPACITY,
        status=FinancialException.Status.OPEN,
    ).exists()


def test_finance_unit_refund_reconciles_allocations_and_issues_credit_note() -> None:
    customer_client, _customer, checkout, group = _payment_ready_group()
    attempt = _create_attempt(customer_client, checkout)
    order = _capture(attempt, payment_id="fake_payment_refund")
    FakePaymentProvider.record_payment(
        provider_payment_id=attempt.provider_payment_id,
        provider_order_id=attempt.provider_order_id,
        amount_paise=attempt.amount_paise,
    )
    unit_ids = list(group.units.values_list("id", flat=True))
    finance_client, finance_user = _finance_client()

    response = finance_client.post(
        "/api/v1/finance/refunds/",
        {
            "order_id": str(order.id),
            "fulfilment_unit_ids": [str(unit_id) for unit_id in unit_ids],
            "reason_code": "customer_cancelled",
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY="refund-all-units",
    )

    assert response.status_code == HTTPStatus.ACCEPTED, response.json()
    refund = Refund.objects.get(id=response.json()["id"])
    assert refund.requested_by == finance_user
    assert refund.status == Refund.Status.SUCCEEDED
    assert refund.amount_paise == order.total_paise
    assert (
        sum(
            PaymentAllocation.objects.filter(payment_attempt=attempt).values_list(
                "refunded_paise", flat=True
            )
        )
        == attempt.amount_paise
    )
    attempt.refresh_from_db()
    order.refresh_from_db()
    assert attempt.status == PaymentAttempt.Status.REFUNDED
    assert order.status == Order.Status.REFUNDED
    credit_note = TaxDocument.objects.get(order=order, kind=TaxDocument.Kind.CREDIT_NOTE)
    assert sum(credit_note.lines.values_list("total_paise", flat=True)) == refund.amount_paise
    assert not FinancialException.objects.exists()

    detail = customer_client.get(f"/api/v1/refunds/{refund.id}/")
    document = customer_client.get(f"/api/v1/tax-documents/{credit_note.id}/")
    order_detail = customer_client.get(f"/api/v1/orders/{order.id}/")
    assert detail.status_code == document.status_code == order_detail.status_code == HTTPStatus.OK
    assert len(order_detail.json()["bookings"]) == group.units.count()
    reconcile = finance_client.post(
        f"/api/v1/finance/refunds/{refund.id}/reconcile/",
        HTTP_IDEMPOTENCY_KEY="refund-reconcile-after-webhook",
    )
    assert reconcile.status_code == HTTPStatus.OK


def test_definitive_refund_failure_is_visible_to_finance(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, _customer, checkout, group = _payment_ready_group()
    attempt = _create_attempt(client, checkout, key="failed-refund-payment")
    order = _capture(attempt, payment_id="fake_payment_failed_refund")
    finance_client, finance_user = _finance_client()
    del finance_client
    monkeypatch.setattr(
        "apps.foundation.services._queue_outbox_event",
        lambda _event_id: None,
    )
    unit = group.units.first()
    assert unit is not None
    refund = request_unit_refund(
        order_id=order.id,
        unit_ids=[unit.id],
        reason_code="provider_failure_test",
        idempotency_key="failed-refund-command",
        requested_by_id=finance_user.id,
    )

    class RejectedProvider:
        def create_refund(self, **_kwargs: object) -> None:
            raise PaymentProviderRejectedError

    monkeypatch.setattr(
        "apps.commerce.services.get_payment_provider",
        lambda **_kwargs: RejectedProvider(),
    )

    failed = submit_refund(refund_id=refund.id)

    assert failed.status == Refund.Status.FAILED
    assert failed.failure_code == "provider_refund_rejected"
    assert FinancialException.objects.filter(
        refund=refund,
        kind=FinancialException.Kind.REFUND_FAILED,
        status=FinancialException.Status.OPEN,
    ).exists()


def test_customer_cannot_initiate_finance_refund_command() -> None:
    client, _customer, checkout, group = _payment_ready_group()
    attempt = _create_attempt(client, checkout)
    order = _capture(attempt, payment_id="fake_payment_no_finance")

    response = client.post(
        "/api/v1/finance/refunds/",
        {
            "order_id": str(order.id),
            "fulfilment_unit_ids": [str(group.units.first().id)],  # type: ignore[union-attr]
            "reason_code": "customer_cancelled",
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY="unauthorized-refund",
    )

    assert response.status_code == HTTPStatus.FORBIDDEN
    assert not Refund.objects.exists()


def test_webhook_rejects_invalid_signature_without_persisting_payload() -> None:
    response = APIClient().post(
        "/api/v1/payment-webhooks/razorpay/",
        data=b'{"event":"payment.captured"}',
        content_type="application/json",
        HTTP_X_RAZORPAY_SIGNATURE="invalid",
        HTTP_X_RAZORPAY_EVENT_ID="invalid-signature-event",
    )

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert not PaymentWebhook.objects.exists()
    assert not hasattr(PaymentWebhook(), "payload")
    assert TaxDocumentLine.objects.count() == 0
    assert Reservation.objects.count() == 0


def test_webhook_rejects_invalid_json_and_safely_ignores_unsubscribed_event() -> None:
    client = APIClient()
    invalid_body = b"not-json"
    invalid_signature = hmac.new(
        settings.PAYMENT_WEBHOOK_SECRET.encode(), invalid_body, hashlib.sha256
    ).hexdigest()
    invalid = client.post(
        "/api/v1/payment-webhooks/razorpay/",
        data=invalid_body,
        content_type="application/json",
        HTTP_X_RAZORPAY_SIGNATURE=invalid_signature,
        HTTP_X_RAZORPAY_EVENT_ID="invalid-json-event",
    )
    assert invalid.status_code == HTTPStatus.BAD_REQUEST

    ignored_payload = {
        "event": "payment.dispute.created",
        "payload": {"payment": {"entity": {}}},
    }
    ignored_body = json.dumps(ignored_payload).encode()
    ignored_signature = hmac.new(
        settings.PAYMENT_WEBHOOK_SECRET.encode(), ignored_body, hashlib.sha256
    ).hexdigest()
    ignored = client.post(
        "/api/v1/payment-webhooks/razorpay/",
        data=ignored_body,
        content_type="application/json",
        HTTP_X_RAZORPAY_SIGNATURE=ignored_signature,
        HTTP_X_RAZORPAY_EVENT_ID="ignored-event",
    )

    assert ignored.status_code == HTTPStatus.ACCEPTED
    assert PaymentWebhook.objects.get(provider_event_id="ignored-event").status == (
        PaymentWebhook.Status.IGNORED
    )


def test_periodic_reconciliation_enqueues_each_ambiguous_financial_record(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, _customer, checkout, _group = _payment_ready_group()
    attempt = _create_attempt(client, checkout, key="periodic-reconcile-payment")
    attempt.reconciliation_state = PaymentAttempt.ReconciliationState.PENDING
    attempt.save(update_fields=("reconciliation_state",))
    refund = Refund.objects.create(
        payment_attempt=attempt,
        amount_paise=1,
        currency=attempt.currency,
        reason_code="periodic_reconciliation",
        status=Refund.Status.PROCESSING,
    )
    payment_ids: list[str] = []
    refund_ids: list[str] = []
    monkeypatch.setattr(
        commerce_tasks.reconcile_one_payment,
        "delay",
        payment_ids.append,
    )
    monkeypatch.setattr(
        commerce_tasks.reconcile_one_refund,
        "delay",
        refund_ids.append,
    )

    assert commerce_tasks.reconcile_payments() == 1
    assert commerce_tasks.reconcile_refunds() == 1
    assert payment_ids == [str(attempt.id)]
    assert refund_ids == [str(refund.id)]

    called: list[str] = []
    monkeypatch.setattr(
        commerce_tasks,
        "reconcile_payment_attempt",
        lambda *, attempt_id: called.append(f"payment:{attempt_id}"),
    )
    monkeypatch.setattr(
        commerce_tasks,
        "reconcile_refund",
        lambda *, refund_id: called.append(f"refund:{refund_id}"),
    )
    commerce_tasks.reconcile_one_payment(str(attempt.id))
    commerce_tasks.reconcile_one_refund(str(refund.id))
    assert called == [f"payment:{attempt.id}", f"refund:{refund.id}"]
