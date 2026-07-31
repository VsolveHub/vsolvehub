import uuid

from django.conf import settings
from django.db import models

from apps.assignments.models import Reservation
from apps.carts.models import CheckoutSession, Quote
from apps.partners.models import PartnerProfile


class Order(models.Model):
    class Status(models.TextChoices):
        CONFIRMED = "CONFIRMED", "Confirmed"
        CANCELLED = "CANCELLED", "Cancelled"
        REFUNDING = "REFUNDING", "Refunding"
        REFUNDED = "REFUNDED", "Refunded"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    checkout = models.OneToOneField(CheckoutSession, on_delete=models.PROTECT, related_name="order")
    customer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    partner = models.ForeignKey(PartnerProfile, on_delete=models.PROTECT)
    quote = models.ForeignKey(Quote, on_delete=models.PROTECT)
    total_paise = models.PositiveBigIntegerField()
    currency = models.CharField(max_length=3, default="INR")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.CONFIRMED)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return str(self.id)


class Booking(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.OneToOneField(Order, on_delete=models.PROTECT, related_name="booking")
    reservation = models.OneToOneField(
        Reservation, on_delete=models.PROTECT, related_name="booking"
    )
    customer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    partner = models.ForeignKey(PartnerProfile, on_delete=models.PROTECT)
    scheduled_start = models.DateTimeField()
    estimated_duration_minutes = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return str(self.id)


class PaymentAttempt(models.Model):
    class Status(models.TextChoices):
        CREATED = "CREATED", "Created"
        AUTHORIZED = "AUTHORIZED", "Authorized"
        CAPTURED = "CAPTURED", "Captured"
        FAILED = "FAILED", "Failed"
        EXPIRED = "EXPIRED", "Expired"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    checkout = models.ForeignKey(
        CheckoutSession, on_delete=models.PROTECT, related_name="payment_attempts"
    )
    provider = models.CharField(max_length=32)
    provider_order_id = models.CharField(max_length=128, unique=True)
    provider_payment_id = models.CharField(max_length=128, blank=True)
    amount_paise = models.PositiveBigIntegerField()
    currency = models.CharField(max_length=3, default="INR")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.CREATED)
    created_at = models.DateTimeField(auto_now_add=True)
    captured_at = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:
        return self.provider_order_id


class PaymentWebhook(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    provider = models.CharField(max_length=32)
    provider_event_id = models.CharField(max_length=128)
    event_type = models.CharField(max_length=128)
    signature_verified = models.BooleanField(default=False)
    payload = models.JSONField(default=dict)
    received_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("provider", "provider_event_id"), name="commerce_unique_provider_event"
            )
        ]

    def __str__(self) -> str:
        return f"{self.provider}:{self.provider_event_id}"


class Refund(models.Model):
    class Status(models.TextChoices):
        REQUESTED = "REQUESTED", "Requested"
        PROCESSING = "PROCESSING", "Processing"
        SUCCEEDED = "SUCCEEDED", "Succeeded"
        FAILED = "FAILED", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey(
        Order, null=True, blank=True, on_delete=models.PROTECT, related_name="refunds"
    )
    amount_paise = models.PositiveBigIntegerField()
    reason_code = models.SlugField(max_length=80)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.REQUESTED)
    provider_refund_id = models.CharField(max_length=128, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:
        return str(self.id)


class TaxDocument(models.Model):
    class Kind(models.TextChoices):
        INVOICE = "INVOICE", "Invoice"
        CREDIT_NOTE = "CREDIT_NOTE", "Credit note"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey(Order, on_delete=models.PROTECT, related_name="tax_documents")
    kind = models.CharField(max_length=16, choices=Kind.choices)
    series = models.CharField(max_length=24)
    sequence = models.PositiveBigIntegerField()
    total_paise = models.PositiveBigIntegerField()
    tax_snapshot = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("series", "sequence"), name="commerce_unique_document_number"
            )
        ]

    def __str__(self) -> str:
        return f"{self.series}-{self.sequence}"
