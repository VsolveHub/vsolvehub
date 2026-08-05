"""Server-authoritative group payment, refund, reconciliation and document commands."""

from collections.abc import Iterable
from datetime import date, timedelta
from uuid import UUID

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Sum
from django.utils import timezone

from apps.assignments.models import Reservation
from apps.carts.models import BookingGroup, CheckoutSession, FulfilmentUnit
from apps.commerce.models import (
    Booking,
    DocumentSequence,
    FinancialException,
    Order,
    PaymentAllocation,
    PaymentAttempt,
    PaymentWebhook,
    Refund,
    RefundAllocation,
    TaxDocument,
    TaxDocumentLine,
)
from apps.commerce.providers import (
    FakePaymentProvider,
    PaymentProviderAmbiguousError,
    PaymentProviderError,
    PaymentProviderRejectedError,
    ProviderPayment,
    ProviderRefund,
    get_payment_provider,
)
from apps.foundation.services import enqueue_outbox_event

PAYMENT_START_SAFETY_SECONDS = 30
FINANCIAL_YEAR_START_MONTH = 4
PAYMENT_FINAL_STATES = {
    PaymentAttempt.Status.CAPTURED,
    PaymentAttempt.Status.PARTIALLY_REFUNDED,
    PaymentAttempt.Status.REFUNDED,
}


def _allocate_exact(total: int, weights: list[int]) -> list[int]:
    if total < 0 or not weights or sum(weights) <= 0:
        raise ValueError("A positive allocation basis is required.")
    denominator = sum(weights)
    allocations = [total * weight // denominator for weight in weights]
    for index in range(total - sum(allocations)):
        allocations[index % len(allocations)] += 1
    return allocations


def _financial_year(on_date: date) -> str:
    start = on_date.year if on_date.month >= FINANCIAL_YEAR_START_MONTH else on_date.year - 1
    return f"{start}-{str(start + 1)[-2:]}"


def _open_exception(
    *,
    kind: str,
    code: str,
    attempt: PaymentAttempt | None = None,
    refund: Refund | None = None,
    context: dict[str, object] | None = None,
) -> FinancialException:
    exception, _created = FinancialException.objects.get_or_create(
        kind=kind,
        status=FinancialException.Status.OPEN,
        payment_attempt=attempt,
        refund=refund,
        code=code,
        defaults={"context": context or {}},
    )
    return exception


def _locked_payment_context(
    *, checkout_id: UUID, customer_id: UUID, expected_checkout_version: int
) -> tuple[CheckoutSession, BookingGroup, list[FulfilmentUnit], list[Reservation]]:
    checkout = (
        CheckoutSession.objects.select_for_update(of=("self",))
        .select_related("quote", "booking_group")
        .get(id=checkout_id, customer_id=customer_id)
    )
    group = checkout.booking_group
    if group is None:
        raise ValueError("Legacy singleton checkouts cannot start a group payment.")
    group = BookingGroup.objects.select_for_update().get(id=group.id)
    if checkout.version != expected_checkout_version:
        raise ValueError("The checkout changed. Refresh before starting payment.")
    if (
        checkout.status
        not in (
            CheckoutSession.Status.PARTNER_COMMITTED,
            CheckoutSession.Status.PAYMENT_PENDING,
        )
        or group.status != BookingGroup.Status.PAYMENT_PENDING
    ):
        raise ValueError("Payment is unavailable until every required Partner commits.")
    now = timezone.now()
    if checkout.expires_at <= now + timedelta(seconds=PAYMENT_START_SAFETY_SECONDS):
        raise ValueError("The Partner holds are too close to expiry to start payment.")
    units = list(group.units.select_for_update().prefetch_related("lines").order_by("position"))
    if not units:
        raise ValueError("The Booking Group has no Fulfilment Units.")
    reservations = list(
        Reservation.objects.select_for_update()
        .filter(fulfilment_unit__booking_group=group)
        .order_by("fulfilment_unit__position")
    )
    if (
        len(reservations) != len(units)
        or any(reservation.status != Reservation.Status.TENTATIVE for reservation in reservations)
        or min(reservation.expires_at for reservation in reservations)
        <= now + timedelta(seconds=PAYMENT_START_SAFETY_SECONDS)
    ):
        raise ValueError("Every Fulfilment Unit must have a live Partner hold before payment.")
    if sum(unit.total_paise for unit in units) != checkout.quote.total_paise:
        raise ValueError("The Fulfilment Unit totals do not reconcile to the selected quote.")
    return checkout, group, units, reservations


@transaction.atomic
def initiate_payment_attempt(
    *,
    checkout_id: UUID,
    customer_id: UUID,
    expected_checkout_version: int,
    idempotency_key: str,
) -> PaymentAttempt:
    checkout, group, units, reservations = _locked_payment_context(
        checkout_id=checkout_id,
        customer_id=customer_id,
        expected_checkout_version=expected_checkout_version,
    )
    active_attempt = checkout.payment_attempts.filter(
        status__in=(
            PaymentAttempt.Status.PROVIDER_PENDING,
            PaymentAttempt.Status.CREATED,
            PaymentAttempt.Status.AUTHORIZED,
        )
    ).first()
    if active_attempt is not None:
        if active_attempt.idempotency_key == idempotency_key:
            return active_attempt
        raise ValueError("A payment attempt is already active for this checkout.")

    attempt = PaymentAttempt.objects.create(
        checkout=checkout,
        booking_group=group,
        quote=checkout.quote,
        idempotency_key=idempotency_key,
        provider=settings.PAYMENT_PROVIDER,
        amount_paise=checkout.quote.total_paise,
        currency=checkout.quote.currency,
        expires_at=min(reservation.expires_at for reservation in reservations),
    )
    allocation_total = 0
    for unit in units:
        unit_lines = list(unit.lines.order_by("position"))
        if sum(line.amount_paise for line in unit_lines) != unit.total_paise:
            raise ValueError("A Fulfilment Unit does not reconcile to its immutable lines.")
        for line in unit_lines:
            PaymentAllocation.objects.create(
                payment_attempt=attempt,
                fulfilment_unit=unit,
                fulfilment_line=line,
                position=line.position,
                amount_paise=line.amount_paise,
                currency=line.currency,
                line_snapshot={
                    "kind": line.kind,
                    "code": line.code,
                    "label": line.label,
                    "quantity": line.quantity,
                    "snapshot": line.snapshot,
                },
            )
            allocation_total += line.amount_paise
    if allocation_total != attempt.amount_paise:
        raise ValueError("Payment allocations do not reconcile to the payment total.")
    checkout.status = CheckoutSession.Status.PAYMENT_PENDING
    checkout.version += 1
    checkout.save(update_fields=("status", "version"))
    enqueue_outbox_event(
        aggregate_type="payment_attempt",
        aggregate_id=attempt.id,
        event_type="payment_attempt.order_requested",
        idempotency_key=f"payment-order:{attempt.id}",
        payload={"payment_attempt_id": str(attempt.id)},
    )
    return attempt


def create_provider_order(*, attempt_id: UUID) -> PaymentAttempt:
    attempt = PaymentAttempt.objects.get(id=attempt_id)
    if attempt.status != PaymentAttempt.Status.PROVIDER_PENDING:
        return attempt
    provider = get_payment_provider(provider_code=attempt.provider)
    try:
        provider_order = provider.create_order(
            amount_paise=attempt.amount_paise,
            currency=attempt.currency,
            receipt=str(attempt.id),
            idempotency_key=attempt.idempotency_key,
        )
    except PaymentProviderAmbiguousError:
        with transaction.atomic():
            locked = PaymentAttempt.objects.select_for_update().get(id=attempt.id)
            locked.reconciliation_state = PaymentAttempt.ReconciliationState.NEEDS_ATTENTION
            locked.failure_code = "provider_order_ambiguous"
            locked.version += 1
            locked.save(
                update_fields=("reconciliation_state", "failure_code", "version", "updated_at")
            )
            _open_exception(
                kind=FinancialException.Kind.PROVIDER_AMBIGUITY,
                code="provider_order_ambiguous",
                attempt=locked,
            )
            return locked
    except PaymentProviderRejectedError:
        with transaction.atomic():
            locked = PaymentAttempt.objects.select_for_update().get(id=attempt.id)
            locked.status = PaymentAttempt.Status.FAILED
            locked.reconciliation_state = PaymentAttempt.ReconciliationState.IN_SYNC
            locked.failure_code = "provider_order_rejected"
            locked.version += 1
            locked.save(
                update_fields=(
                    "status",
                    "reconciliation_state",
                    "failure_code",
                    "version",
                    "updated_at",
                )
            )
            return locked
    if (
        provider_order.amount_paise != attempt.amount_paise
        or provider_order.currency != attempt.currency
    ):
        with transaction.atomic():
            locked = PaymentAttempt.objects.select_for_update().get(id=attempt.id)
            locked.status = PaymentAttempt.Status.FAILED
            locked.reconciliation_state = PaymentAttempt.ReconciliationState.NEEDS_ATTENTION
            locked.failure_code = "provider_order_amount_mismatch"
            locked.version += 1
            locked.save(
                update_fields=(
                    "status",
                    "reconciliation_state",
                    "failure_code",
                    "version",
                    "updated_at",
                )
            )
            _open_exception(
                kind=FinancialException.Kind.AMOUNT_MISMATCH,
                code="provider_order_amount_mismatch",
                attempt=locked,
            )
            return locked
    with transaction.atomic():
        locked = PaymentAttempt.objects.select_for_update().get(id=attempt.id)
        if locked.status != PaymentAttempt.Status.PROVIDER_PENDING:
            return locked
        locked.provider_order_id = provider_order.provider_order_id
        locked.status = PaymentAttempt.Status.CREATED
        locked.reconciliation_state = PaymentAttempt.ReconciliationState.IN_SYNC
        locked.failure_code = ""
        locked.version += 1
        locked.save(
            update_fields=(
                "provider_order_id",
                "status",
                "reconciliation_state",
                "failure_code",
                "version",
                "updated_at",
            )
        )
        return locked


def _document_sequence(*, kind: str, issued_on: date) -> tuple[str, str, int]:
    financial_year = _financial_year(issued_on)
    prefix = "INV" if kind == TaxDocument.Kind.INVOICE else "CRN"
    series = f"{prefix}-{financial_year}"
    sequence, _created = DocumentSequence.objects.select_for_update().get_or_create(
        legal_entity_code=settings.PAYMENT_LEGAL_ENTITY_CODE,
        financial_year=financial_year,
        kind=kind,
        series=series,
    )
    sequence.last_sequence += 1
    sequence.save(update_fields=("last_sequence",))
    return financial_year, series, sequence.last_sequence


def _issue_document(
    *,
    order: Order,
    attempt: PaymentAttempt,
    kind: str,
    allocations: Iterable[PaymentAllocation],
    total_paise: int,
    allocation_amounts: dict[UUID, int] | None = None,
) -> TaxDocument:
    now = timezone.now()
    financial_year, series, sequence = _document_sequence(kind=kind, issued_on=now.date())
    tax_rate = int(order.quote.pricing_policy.gst_rate_basis_points)
    allocation_list = list(allocations)
    line_amounts = [
        allocation.amount_paise if allocation_amounts is None else allocation_amounts[allocation.id]
        for allocation in allocation_list
    ]
    if sum(line_amounts) != total_paise:
        raise ValueError("Financial document lines do not reconcile to the document total.")
    if kind == TaxDocument.Kind.INVOICE:
        tax_allocations = _allocate_exact(order.quote.tax_paise, line_amounts)
    else:
        invoice_taxes = dict(
            TaxDocumentLine.objects.filter(
                document__order=order,
                document__kind=TaxDocument.Kind.INVOICE,
                payment_allocation_id__in=[allocation.id for allocation in allocation_list],
            ).values_list("payment_allocation_id", "tax_paise")
        )
        tax_allocations = [invoice_taxes.get(allocation.id, 0) for allocation in allocation_list]
    tax_total = sum(tax_allocations)
    document = TaxDocument.objects.create(
        order=order,
        payment_attempt=attempt,
        booking_group=order.booking_group,
        kind=kind,
        legal_entity_code=settings.PAYMENT_LEGAL_ENTITY_CODE,
        financial_year=financial_year,
        series=series,
        sequence=sequence,
        total_paise=total_paise,
        tax_snapshot={
            "gst_rate_basis_points": tax_rate,
            "tax_paise": tax_total,
            "currency": order.currency,
            "legal_review_approved": settings.PAYMENT_LIVE_COLLECTIONS_APPROVED,
        },
        is_test=not settings.PAYMENT_LIVE_COLLECTIONS_APPROVED,
        issued_at=now,
    )
    for position, (allocation, line_amount, tax_paise) in enumerate(
        zip(allocation_list, line_amounts, tax_allocations, strict=True),
        start=1,
    ):
        snapshot = allocation.line_snapshot
        TaxDocumentLine.objects.create(
            document=document,
            payment_allocation=allocation,
            position=position,
            code=str(snapshot.get("code", "service")),
            label=str(snapshot.get("label", "Service")),
            quantity=int(snapshot.get("quantity", 1)),
            total_paise=line_amount,
            tax_paise=tax_paise,
            currency=allocation.currency,
            snapshot=snapshot,
        )
    return document


def _try_confirm_group_capacity(*, group: BookingGroup) -> bool:
    units = list(group.units.select_for_update().order_by("position"))
    reservations = list(
        Reservation.objects.select_for_update()
        .filter(fulfilment_unit__booking_group=group)
        .select_related("partner")
        .order_by("fulfilment_unit__position")
    )
    if len(units) != len(reservations):
        return False
    try:
        with transaction.atomic():
            for reservation in reservations:
                reservation.status = Reservation.Status.CONFIRMED
                reservation.released_at = None
                reservation.save(update_fields=("status", "released_at"))
    except IntegrityError:
        return False
    return True


def _request_automatic_refund(*, attempt: PaymentAttempt, reason_code: str) -> Refund:
    existing = attempt.refunds.exclude(status=Refund.Status.FAILED).first()
    if existing is not None:
        return existing
    refund = Refund.objects.create(
        payment_attempt=attempt,
        amount_paise=attempt.amount_paise,
        currency=attempt.currency,
        reason_code=reason_code,
        idempotency_key=f"automatic:{reason_code}:{attempt.id}",
    )
    for allocation in attempt.allocations.all():
        if allocation.amount_paise == 0:
            continue
        RefundAllocation.objects.create(
            refund=refund,
            payment_allocation=allocation,
            amount_paise=allocation.amount_paise,
        )
    enqueue_outbox_event(
        aggregate_type="refund",
        aggregate_id=refund.id,
        event_type="refund.submission_requested",
        idempotency_key=f"refund-submit:{refund.id}",
        payload={"refund_id": str(refund.id)},
    )
    return refund


def _materialize_captured_group(*, attempt: PaymentAttempt) -> Order | None:
    if attempt.checkout_id is None:
        raise ValueError("Only a Booking Group payment attempt has a Checkout to materialize.")
    checkout = (
        CheckoutSession.objects.select_for_update()
        .select_related("quote")
        .get(id=attempt.checkout_id)
    )
    group_id = attempt.booking_group_id
    if group_id is None:
        raise ValueError("A captured payment has no Booking Group target.")
    group = BookingGroup.objects.select_for_update().get(id=group_id)
    existing = Order.objects.filter(booking_group=group).first()
    if existing is not None:
        return existing
    if not _try_confirm_group_capacity(group=group):
        attempt.reconciliation_state = PaymentAttempt.ReconciliationState.NEEDS_ATTENTION
        attempt.failure_code = "capture_without_capacity"
        attempt.save(update_fields=("reconciliation_state", "failure_code", "updated_at"))
        refund = _request_automatic_refund(
            attempt=attempt,
            reason_code="capture_without_capacity",
        )
        _open_exception(
            kind=FinancialException.Kind.CAPTURE_WITHOUT_CAPACITY,
            code="capture_without_capacity",
            attempt=attempt,
            refund=refund,
            context={"booking_group_id": str(group.id)},
        )
        return None
    order = Order.objects.create(
        checkout=checkout,
        booking_group=group,
        customer=checkout.customer,
        quote=checkout.quote,
        total_paise=attempt.amount_paise,
        currency=attempt.currency,
    )
    reservations = {
        reservation.fulfilment_unit_id: reservation
        for reservation in Reservation.objects.filter(
            fulfilment_unit__booking_group=group,
            status=Reservation.Status.CONFIRMED,
        ).select_related("partner")
    }
    for unit in group.units.select_for_update().order_by("position"):
        reservation = reservations.get(unit.id)
        if reservation is None:
            raise ValueError("A confirmed Fulfilment Unit reservation is missing.")
        Booking.objects.create(
            order=order,
            fulfilment_unit=unit,
            reservation=reservation,
            customer=checkout.customer,
            partner=reservation.partner,
            scheduled_start=unit.requested_start,
            estimated_duration_minutes=unit.estimated_duration_minutes,
        )
        unit.status = FulfilmentUnit.Status.BOOKED
        unit.version += 1
        unit.save(update_fields=("status", "version", "updated_at"))
    group.status = BookingGroup.Status.BOOKED
    group.version += 1
    group.save(update_fields=("status", "version", "updated_at"))
    checkout.status = CheckoutSession.Status.COMPLETED
    checkout.version += 1
    checkout.save(update_fields=("status", "version"))
    _issue_document(
        order=order,
        attempt=attempt,
        kind=TaxDocument.Kind.INVOICE,
        allocations=attempt.allocations.order_by("fulfilment_unit__position", "position"),
        total_paise=attempt.amount_paise,
    )
    return order


def _validate_payment_amount(*, attempt: PaymentAttempt, payment: ProviderPayment) -> bool:
    if (
        payment.provider_order_id != attempt.provider_order_id
        or payment.amount_paise != attempt.amount_paise
        or payment.currency != attempt.currency
    ):
        attempt.reconciliation_state = PaymentAttempt.ReconciliationState.NEEDS_ATTENTION
        attempt.failure_code = "provider_payment_amount_mismatch"
        attempt.version += 1
        attempt.save(
            update_fields=(
                "reconciliation_state",
                "failure_code",
                "version",
                "updated_at",
            )
        )
        _open_exception(
            kind=FinancialException.Kind.AMOUNT_MISMATCH,
            code="provider_payment_amount_mismatch",
            attempt=attempt,
        )
        return False
    return True


@transaction.atomic
def apply_provider_payment(
    *, payment: ProviderPayment, provider_code: str | None = None
) -> Order | None:
    attempts = PaymentAttempt.objects.filter(provider_order_id=payment.provider_order_id)
    if provider_code is not None:
        attempts = attempts.filter(provider=provider_code)
    attempt = PaymentAttempt.objects.select_for_update().get(
        id=attempts.values_list("id", flat=True).get(),
    )
    if not _validate_payment_amount(attempt=attempt, payment=payment):
        return None
    attempt.provider_payment_id = payment.provider_payment_id
    attempt.reconciliation_state = PaymentAttempt.ReconciliationState.IN_SYNC
    attempt.failure_code = ""
    if payment.status == "captured":
        if attempt.status not in PAYMENT_FINAL_STATES:
            attempt.status = PaymentAttempt.Status.CAPTURED
            attempt.captured_at = timezone.now()
            attempt.version += 1
            attempt.save(
                update_fields=(
                    "provider_payment_id",
                    "status",
                    "captured_at",
                    "reconciliation_state",
                    "failure_code",
                    "version",
                    "updated_at",
                )
            )
        return _materialize_captured_group(attempt=attempt)
    if payment.status == "authorized" and attempt.status in (
        PaymentAttempt.Status.PROVIDER_PENDING,
        PaymentAttempt.Status.CREATED,
    ):
        attempt.status = PaymentAttempt.Status.AUTHORIZED
        attempt.version += 1
    elif payment.status == "failed" and attempt.status not in PAYMENT_FINAL_STATES:
        attempt.status = PaymentAttempt.Status.FAILED
        attempt.failure_code = "provider_payment_failed"
        attempt.version += 1
    attempt.save(
        update_fields=(
            "provider_payment_id",
            "status",
            "reconciliation_state",
            "failure_code",
            "version",
            "updated_at",
        )
    )
    return None


@transaction.atomic
def record_verified_webhook(
    *,
    provider: str,
    event_id: str,
    event_type: str,
    payload_sha256: str,
    event_data: dict[str, object],
) -> tuple[PaymentWebhook, bool]:
    webhook, created = PaymentWebhook.objects.get_or_create(
        provider=provider,
        provider_event_id=event_id,
        defaults={
            "event_type": event_type,
            "signature_verified": True,
            "payload_sha256": payload_sha256,
            "event_data": event_data,
        },
    )
    if not created and webhook.payload_sha256 != payload_sha256:
        raise ValueError("The provider event identifier was reused with different content.")
    if created:
        enqueue_outbox_event(
            aggregate_type="payment_webhook",
            aggregate_id=webhook.id,
            event_type="payment.webhook_received",
            idempotency_key=f"payment-webhook:{provider}:{event_id}",
            payload={"payment_webhook_id": str(webhook.id)},
        )
    return webhook, created


def _payment_from_event(webhook: PaymentWebhook) -> ProviderPayment:
    data = webhook.event_data
    return ProviderPayment(
        provider_payment_id=str(data["provider_payment_id"]),
        provider_order_id=str(data["provider_order_id"]),
        amount_paise=int(data["amount_paise"]),
        currency=str(data["currency"]),
        status=str(data["status"]),
    )


@transaction.atomic
def process_payment_webhook(*, webhook_id: UUID) -> PaymentWebhook:
    webhook = PaymentWebhook.objects.select_for_update().get(id=webhook_id)
    if webhook.status in (PaymentWebhook.Status.PROCESSED, PaymentWebhook.Status.IGNORED):
        return webhook
    try:
        if webhook.event_type in (
            "payment.authorized",
            "payment.captured",
            "payment.failed",
        ):
            payment = _payment_from_event(webhook)
            if webhook.provider == FakePaymentProvider.code:
                FakePaymentProvider.record_payment(
                    provider_payment_id=payment.provider_payment_id,
                    provider_order_id=payment.provider_order_id,
                    amount_paise=payment.amount_paise,
                    currency=payment.currency,
                    status=payment.status,
                )
            apply_provider_payment(payment=payment, provider_code=webhook.provider)
            webhook.status = PaymentWebhook.Status.PROCESSED
        elif webhook.event_type in ("refund.processed", "refund.failed"):
            _apply_refund_provider_result(
                ProviderRefund(
                    provider_refund_id=str(webhook.event_data["provider_refund_id"]),
                    provider_payment_id=str(webhook.event_data["provider_payment_id"]),
                    amount_paise=int(webhook.event_data["amount_paise"]),
                    currency=str(webhook.event_data["currency"]),
                    status=str(webhook.event_data["status"]),
                )
            )
            webhook.status = PaymentWebhook.Status.PROCESSED
        else:
            webhook.status = PaymentWebhook.Status.IGNORED
    except (KeyError, ValueError, PaymentAttempt.DoesNotExist, Refund.DoesNotExist) as exc:
        webhook.status = PaymentWebhook.Status.FAILED
        webhook.processing_error = str(exc)[:500]
        webhook.save(update_fields=("status", "processing_error"))
        raise
    webhook.processed_at = timezone.now()
    webhook.processing_error = ""
    webhook.save(update_fields=("status", "processed_at", "processing_error"))
    return webhook


def reconcile_payment_attempt(*, attempt_id: UUID) -> PaymentAttempt:
    attempt = PaymentAttempt.objects.get(id=attempt_id)
    if not attempt.provider_order_id:
        provider = get_payment_provider(provider_code=attempt.provider)
        try:
            matching_orders = provider.find_orders_by_receipt(receipt=str(attempt.id))
        except PaymentProviderError:
            matching_orders = ()
        if len(matching_orders) > 1:
            with transaction.atomic():
                locked = PaymentAttempt.objects.select_for_update().get(id=attempt.id)
                locked.reconciliation_state = PaymentAttempt.ReconciliationState.NEEDS_ATTENTION
                locked.failure_code = "multiple_provider_orders"
                locked.version += 1
                locked.save(
                    update_fields=(
                        "reconciliation_state",
                        "failure_code",
                        "version",
                        "updated_at",
                    )
                )
                _open_exception(
                    kind=FinancialException.Kind.PROVIDER_AMBIGUITY,
                    code="multiple_provider_orders",
                    attempt=locked,
                )
                return locked
        if matching_orders:
            provider_order = matching_orders[0]
            if (
                provider_order.amount_paise != attempt.amount_paise
                or provider_order.currency != attempt.currency
            ):
                with transaction.atomic():
                    locked = PaymentAttempt.objects.select_for_update().get(id=attempt.id)
                    locked.reconciliation_state = PaymentAttempt.ReconciliationState.NEEDS_ATTENTION
                    locked.failure_code = "reconciled_order_amount_mismatch"
                    locked.version += 1
                    locked.save(
                        update_fields=(
                            "reconciliation_state",
                            "failure_code",
                            "version",
                            "updated_at",
                        )
                    )
                    _open_exception(
                        kind=FinancialException.Kind.AMOUNT_MISMATCH,
                        code="reconciled_order_amount_mismatch",
                        attempt=locked,
                    )
                    return locked
            with transaction.atomic():
                locked = PaymentAttempt.objects.select_for_update().get(id=attempt.id)
                locked.provider_order_id = provider_order.provider_order_id
                locked.status = PaymentAttempt.Status.CREATED
                locked.reconciliation_state = PaymentAttempt.ReconciliationState.IN_SYNC
                locked.failure_code = ""
                locked.version += 1
                locked.save(
                    update_fields=(
                        "provider_order_id",
                        "status",
                        "reconciliation_state",
                        "failure_code",
                        "version",
                        "updated_at",
                    )
                )
                attempt = locked
        else:
            return create_provider_order(attempt_id=attempt.id)
    provider = get_payment_provider(provider_code=attempt.provider)
    try:
        payments = provider.fetch_order_payments(provider_order_id=attempt.provider_order_id)
    except PaymentProviderError:
        with transaction.atomic():
            locked = PaymentAttempt.objects.select_for_update().get(id=attempt.id)
            locked.reconciliation_state = PaymentAttempt.ReconciliationState.NEEDS_ATTENTION
            locked.version += 1
            locked.save(update_fields=("reconciliation_state", "version", "updated_at"))
            _open_exception(
                kind=FinancialException.Kind.PROVIDER_AMBIGUITY,
                code="payment_reconciliation_failed",
                attempt=locked,
            )
            return locked
    priority = {"failed": 0, "authorized": 1, "captured": 2}
    if payments:
        payment = max(payments, key=lambda item: priority.get(item.status, -1))
        apply_provider_payment(payment=payment, provider_code=attempt.provider)
    return PaymentAttempt.objects.get(id=attempt.id)


@transaction.atomic
def request_unit_refund(
    *,
    order_id: UUID,
    unit_ids: list[UUID],
    reason_code: str,
    idempotency_key: str,
    requested_by_id: UUID,
) -> Refund:
    order = (
        Order.objects.select_for_update(of=("self",))
        .select_related("booking_group")
        .get(id=order_id)
    )
    if order.booking_group_id is None:
        raise ValueError("Legacy singleton Orders cannot use unit refunds.")
    attempt = (
        PaymentAttempt.objects.select_for_update()
        .filter(checkout=order.checkout, status__in=PAYMENT_FINAL_STATES)
        .order_by("-captured_at")
        .first()
    )
    if attempt is None:
        raise ValueError("The Order has no captured payment to refund.")
    existing = attempt.refunds.filter(idempotency_key=idempotency_key).first()
    if existing is not None:
        return existing
    requested_units = set(unit_ids)
    owned_units = set(
        FulfilmentUnit.objects.filter(
            booking_group_id=order.booking_group_id,
            id__in=requested_units,
        ).values_list("id", flat=True)
    )
    if not requested_units or owned_units != requested_units:
        raise ValueError("Every requested refund unit must belong to the Order's Booking Group.")
    allocations = list(
        PaymentAllocation.objects.select_for_update()
        .filter(payment_attempt=attempt, fulfilment_unit_id__in=requested_units)
        .order_by("fulfilment_unit__position", "position")
    )
    refund_parts: list[tuple[PaymentAllocation, int]] = []
    for allocation in allocations:
        pending = (
            RefundAllocation.objects.filter(
                payment_allocation=allocation,
                refund__status__in=(
                    Refund.Status.REQUESTED,
                    Refund.Status.SUBMITTED,
                    Refund.Status.PROCESSING,
                    Refund.Status.UNDER_REVIEW,
                ),
            ).aggregate(total=Sum("amount_paise"))["total"]
            or 0
        )
        available = allocation.amount_paise - allocation.refunded_paise - pending
        if available > 0:
            refund_parts.append((allocation, available))
    amount_paise = sum(amount for _allocation, amount in refund_parts)
    if amount_paise <= 0:
        raise ValueError("The selected Fulfilment Units have no refundable balance.")
    refund = Refund.objects.create(
        order=order,
        payment_attempt=attempt,
        amount_paise=amount_paise,
        currency=attempt.currency,
        reason_code=reason_code,
        idempotency_key=idempotency_key,
        requested_by_id=requested_by_id,
    )
    for allocation, amount in refund_parts:
        RefundAllocation.objects.create(
            refund=refund,
            payment_allocation=allocation,
            amount_paise=amount,
        )
    order.status = Order.Status.REFUNDING
    order.version += 1
    order.save(update_fields=("status", "version", "updated_at"))
    enqueue_outbox_event(
        aggregate_type="refund",
        aggregate_id=refund.id,
        event_type="refund.submission_requested",
        idempotency_key=f"refund-submit:{refund.id}",
        payload={"refund_id": str(refund.id)},
    )
    return refund


def submit_refund(*, refund_id: UUID) -> Refund:
    refund = Refund.objects.select_related("payment_attempt").get(id=refund_id)
    if refund.status != Refund.Status.REQUESTED:
        return refund
    attempt = refund.payment_attempt
    if attempt is None or not attempt.provider_payment_id:
        with transaction.atomic():
            locked = Refund.objects.select_for_update().get(id=refund.id)
            locked.status = Refund.Status.UNDER_REVIEW
            locked.failure_code = "provider_payment_reference_missing"
            locked.reconciliation_state = PaymentAttempt.ReconciliationState.NEEDS_ATTENTION
            locked.save(update_fields=("status", "failure_code", "reconciliation_state"))
            _open_exception(
                kind=FinancialException.Kind.REFUND_FAILED,
                code="provider_payment_reference_missing",
                attempt=attempt,
                refund=locked,
            )
            return locked
    provider = get_payment_provider(provider_code=attempt.provider)
    try:
        provider_refund = provider.create_refund(
            provider_payment_id=attempt.provider_payment_id,
            amount_paise=refund.amount_paise,
            receipt=str(refund.id),
            idempotency_key=refund.idempotency_key,
        )
    except PaymentProviderAmbiguousError:
        with transaction.atomic():
            locked = Refund.objects.select_for_update().get(id=refund.id)
            locked.status = Refund.Status.UNDER_REVIEW
            locked.failure_code = "provider_refund_ambiguous"
            locked.reconciliation_state = PaymentAttempt.ReconciliationState.NEEDS_ATTENTION
            locked.save(update_fields=("status", "failure_code", "reconciliation_state"))
            _open_exception(
                kind=FinancialException.Kind.PROVIDER_AMBIGUITY,
                code="provider_refund_ambiguous",
                attempt=attempt,
                refund=locked,
            )
            return locked
    except PaymentProviderRejectedError:
        with transaction.atomic():
            locked = Refund.objects.select_for_update().get(id=refund.id)
            locked.status = Refund.Status.FAILED
            locked.failure_code = "provider_refund_rejected"
            locked.reconciliation_state = PaymentAttempt.ReconciliationState.IN_SYNC
            locked.completed_at = timezone.now()
            locked.save(
                update_fields=(
                    "status",
                    "failure_code",
                    "reconciliation_state",
                    "completed_at",
                )
            )
            _open_exception(
                kind=FinancialException.Kind.REFUND_FAILED,
                code="provider_refund_rejected",
                attempt=attempt,
                refund=locked,
            )
            return locked
    return _apply_refund_provider_result(provider_refund, refund_id=refund.id)


@transaction.atomic
def _apply_refund_provider_result(
    provider_refund: ProviderRefund, *, refund_id: UUID | None = None
) -> Refund:
    refunds = Refund.objects.select_for_update(of=("self",)).select_related(
        "payment_attempt", "order"
    )
    refund = (
        refunds.filter(id=refund_id).first()
        if refund_id is not None
        else refunds.filter(
            payment_attempt__provider_payment_id=provider_refund.provider_payment_id,
            provider_refund_id=provider_refund.provider_refund_id,
        ).first()
    )
    if refund is None:
        raise Refund.DoesNotExist("No local refund matches the provider refund.")
    if (
        refund.provider_refund_id
        and refund.provider_refund_id != provider_refund.provider_refund_id
    ):
        raise ValueError("The provider refund identifier does not match the local command.")
    refund.provider_refund_id = provider_refund.provider_refund_id
    refund.submitted_at = refund.submitted_at or timezone.now()
    normalized = provider_refund.status.lower()
    if normalized in ("processed", "succeeded"):
        if refund.status != Refund.Status.SUCCEEDED:
            allocations = list(
                refund.allocations.select_for_update().select_related("payment_allocation")
            )
            for refund_allocation in allocations:
                payment_allocation = refund_allocation.payment_allocation
                next_refunded = payment_allocation.refunded_paise + refund_allocation.amount_paise
                if next_refunded > payment_allocation.amount_paise:
                    raise ValueError("The provider refund exceeds its immutable allocation.")
                payment_allocation.refunded_paise = next_refunded
                payment_allocation.save(update_fields=("refunded_paise",))
            refund.status = Refund.Status.SUCCEEDED
            refund.reconciliation_state = PaymentAttempt.ReconciliationState.IN_SYNC
            refund.failure_code = ""
            refund.completed_at = timezone.now()
            attempt = refund.payment_attempt
            if attempt is None:
                raise ValueError("The provider refund has no payment attempt.")
            refunded_total = (
                attempt.allocations.aggregate(total=Sum("refunded_paise"))["total"] or 0
            )
            attempt.status = (
                PaymentAttempt.Status.REFUNDED
                if refunded_total == attempt.amount_paise
                else PaymentAttempt.Status.PARTIALLY_REFUNDED
            )
            attempt.version += 1
            attempt.save(update_fields=("status", "version", "updated_at"))
            if refund.order is not None:
                refund.order.status = (
                    Order.Status.REFUNDED
                    if refunded_total == attempt.amount_paise
                    else Order.Status.CONFIRMED
                )
                refund.order.version += 1
                refund.order.save(update_fields=("status", "version", "updated_at"))
                _issue_document(
                    order=refund.order,
                    attempt=attempt,
                    kind=TaxDocument.Kind.CREDIT_NOTE,
                    allocations=[item.payment_allocation for item in allocations],
                    total_paise=refund.amount_paise,
                    allocation_amounts={
                        item.payment_allocation_id: item.amount_paise for item in allocations
                    },
                )
    elif normalized in ("failed", "rejected"):
        refund.status = Refund.Status.FAILED
        refund.failure_code = "provider_refund_failed"
        refund.reconciliation_state = PaymentAttempt.ReconciliationState.IN_SYNC
        refund.completed_at = timezone.now()
        _open_exception(
            kind=FinancialException.Kind.REFUND_FAILED,
            code="provider_refund_failed",
            attempt=refund.payment_attempt,
            refund=refund,
        )
    else:
        refund.status = Refund.Status.PROCESSING
        refund.reconciliation_state = PaymentAttempt.ReconciliationState.PENDING
    refund.save(
        update_fields=(
            "provider_refund_id",
            "submitted_at",
            "status",
            "reconciliation_state",
            "failure_code",
            "completed_at",
        )
    )
    return refund


def reconcile_refund(*, refund_id: UUID) -> Refund:
    refund = Refund.objects.select_related("payment_attempt").get(id=refund_id)
    if not refund.provider_refund_id:
        return submit_refund(refund_id=refund.id)
    attempt = refund.payment_attempt
    if attempt is None:
        raise ValueError("The refund has no payment attempt.")
    provider = get_payment_provider(provider_code=attempt.provider)
    try:
        provider_refund = provider.fetch_refund(provider_refund_id=refund.provider_refund_id)
    except PaymentProviderError:
        with transaction.atomic():
            locked = Refund.objects.select_for_update().get(id=refund.id)
            locked.status = Refund.Status.UNDER_REVIEW
            locked.reconciliation_state = PaymentAttempt.ReconciliationState.NEEDS_ATTENTION
            locked.failure_code = "refund_reconciliation_failed"
            locked.save(update_fields=("status", "reconciliation_state", "failure_code"))
            _open_exception(
                kind=FinancialException.Kind.PROVIDER_AMBIGUITY,
                code="refund_reconciliation_failed",
                attempt=attempt,
                refund=locked,
            )
            return locked
    return _apply_refund_provider_result(provider_refund, refund_id=refund.id)
