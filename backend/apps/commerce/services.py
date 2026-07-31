"""Server-authoritative payment, booking conversion, refund, and document commands."""

from datetime import timedelta
from uuid import UUID

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from apps.assignments.models import Reservation
from apps.carts.models import CheckoutSession
from apps.commerce.models import Booking, Order, PaymentAttempt, PaymentWebhook, Refund, TaxDocument
from apps.commerce.providers import FakePaymentProvider


def create_payment_attempt(*, checkout_id: UUID) -> PaymentAttempt:
    with transaction.atomic():
        checkout = (
            CheckoutSession.objects.select_for_update().select_related("quote").get(id=checkout_id)
        )
        if checkout.status != CheckoutSession.Status.PARTNER_COMMITTED:
            raise ValueError("Payment is unavailable until a Partner commits.")
        if checkout.expires_at <= timezone.now() + timedelta(seconds=30):
            raise ValueError("The reservation is too close to expiry to start payment.")
        provider_order = FakePaymentProvider().create_order(
            amount_paise=checkout.quote.total_paise, currency="INR", _receipt=str(checkout.id)
        )
        checkout.status = CheckoutSession.Status.PAYMENT_PENDING
        checkout.version += 1
        checkout.save(update_fields=("status", "version"))
        return PaymentAttempt.objects.create(
            checkout=checkout,
            provider=FakePaymentProvider.code,
            provider_order_id=provider_order.provider_order_id,
            amount_paise=provider_order.amount_paise,
            currency=provider_order.currency,
        )


def _document_for(*, order: Order) -> TaxDocument:
    latest = (
        TaxDocument.objects.select_for_update()
        .filter(series="M1-INV")
        .order_by("-sequence")
        .first()
    )
    return TaxDocument.objects.create(
        order=order,
        kind=TaxDocument.Kind.INVOICE,
        series="M1-INV",
        sequence=1 if latest is None else latest.sequence + 1,
        total_paise=order.total_paise,
        tax_snapshot={"gst_rate_basis_points": order.quote.pricing_policy.gst_rate_basis_points},
    )


def _convert_captured_attempt(*, attempt: PaymentAttempt) -> Order:
    checkout = (
        CheckoutSession.objects.select_for_update()
        .select_related("quote")
        .get(id=attempt.checkout_id)
    )
    existing = Order.objects.filter(checkout=checkout).first()
    if existing is not None:
        return existing
    reservation = (
        Reservation.objects.select_for_update().select_related("partner").get(checkout=checkout)
    )
    if (
        reservation.status != Reservation.Status.TENTATIVE
        or reservation.expires_at <= timezone.now()
    ):
        raise ValueError("Reservation expired before payment capture; refund is required.")
    order = Order.objects.create(
        checkout=checkout,
        customer=checkout.customer,
        partner=reservation.partner,
        quote=checkout.quote,
        total_paise=attempt.amount_paise,
    )
    Booking.objects.create(
        order=order,
        reservation=reservation,
        customer=checkout.customer,
        partner=reservation.partner,
        scheduled_start=checkout.quote.requested_start,
        estimated_duration_minutes=checkout.quote.estimated_duration_minutes,
    )
    reservation.status = Reservation.Status.CONFIRMED
    reservation.save(update_fields=("status",))
    checkout.status = CheckoutSession.Status.COMPLETED
    checkout.version += 1
    checkout.save(update_fields=("status", "version"))
    _document_for(order=order)
    return order


@transaction.atomic
def record_verified_webhook(
    *, provider: str, event_id: str, event_type: str, payload: dict[str, object]
) -> Order | None:
    webhook, created = PaymentWebhook.objects.get_or_create(
        provider=provider,
        provider_event_id=event_id,
        defaults={"event_type": event_type, "signature_verified": True, "payload": payload},
    )
    if not created:
        return None
    if event_type != "payment.captured":
        webhook.processed_at = timezone.now()
        webhook.save(update_fields=("processed_at",))
        return None
    provider_order_id = str(payload.get("provider_order_id", ""))
    provider_payment_id = str(payload.get("provider_payment_id", ""))
    attempt = PaymentAttempt.objects.select_for_update().get(
        provider=provider, provider_order_id=provider_order_id
    )
    if attempt.status == PaymentAttempt.Status.CAPTURED:
        return Order.objects.filter(checkout=attempt.checkout).first()
    attempt.status = PaymentAttempt.Status.CAPTURED
    attempt.provider_payment_id = provider_payment_id
    attempt.captured_at = timezone.now()
    attempt.save(update_fields=("status", "provider_payment_id", "captured_at"))
    try:
        order = _convert_captured_attempt(attempt=attempt)
    except ValueError:
        Refund.objects.create(
            order=None,
            amount_paise=attempt.amount_paise,
            reason_code="reservation_expired_capture",
            status=Refund.Status.PROCESSING,
        )
        raise
    webhook.processed_at = timezone.now()
    webhook.save(update_fields=("processed_at",))
    return order


@transaction.atomic
def request_refund(*, order_id: UUID, amount_paise: int, reason_code: str) -> Refund:
    order = Order.objects.select_for_update().get(id=order_id)
    refunded = (
        order.refunds.exclude(status=Refund.Status.FAILED).aggregate(total=Sum("amount_paise"))[
            "total"
        ]
        or 0
    )
    if amount_paise <= 0 or amount_paise + refunded > order.total_paise:
        raise ValueError("Refund amount exceeds the captured order total.")
    order.status = Order.Status.REFUNDING
    order.save(update_fields=("status",))
    return Refund.objects.create(order=order, amount_paise=amount_paise, reason_code=reason_code)
