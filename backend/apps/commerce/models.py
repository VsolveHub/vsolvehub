import uuid
from typing import Any

from django.conf import settings
from django.db import models

from apps.assignments.models import Reservation
from apps.carts.models import (
    BookingGroup,
    CheckoutSession,
    FulfilmentUnit,
    FulfilmentUnitLine,
    Quote,
)
from apps.partners.models import PartnerProfile


class Order(models.Model):
    class Status(models.TextChoices):
        CONFIRMED = "CONFIRMED", "Confirmed"
        CANCELLED = "CANCELLED", "Cancelled"
        REFUNDING = "REFUNDING", "Refunding"
        REFUNDED = "REFUNDED", "Refunded"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    refunds: Any
    tax_documents: Any
    checkout = models.OneToOneField(CheckoutSession, on_delete=models.PROTECT, related_name="order")
    booking_group = models.OneToOneField(
        BookingGroup,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="order",
    )
    customer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    partner = models.ForeignKey(
        PartnerProfile,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        help_text="Deprecated singleton compatibility field; new Orders are group scoped.",
    )
    quote = models.ForeignKey(Quote, on_delete=models.PROTECT)
    total_paise = models.PositiveBigIntegerField()
    currency = models.CharField(max_length=3, default="INR")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.CONFIRMED)
    version = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=models.Q(total_paise__gt=0),
                name="commerce_order_positive_total",
            ),
        ]

    def __str__(self) -> str:
        return str(self.id)


class Booking(models.Model):
    """One operational Fulfilment Unit after confirmation.

    `partner`, `reservation`, `scheduled_start` and `estimated_duration_minutes` are the one
    deliberate mutability exception in this otherwise append-only model: a post-booking Partner
    recovery (`apps.fulfilment.recovery_services.recover_booking_partner`) rewrites them in place
    when a replacement Partner commits, rather than creating a second `Booking` row for the same
    `FulfilmentUnit` — the unit keeps exactly one operational Booking, matching its `OneToOneField`.
    Every rewrite is recorded in `apps.fulfilment.models.BookingStatusHistory`.
    """

    class Status(models.TextChoices):
        CONFIRMED = "CONFIRMED", "Confirmed"
        EN_ROUTE = "EN_ROUTE", "En route"
        ARRIVED = "ARRIVED", "Arrived"
        IN_PROGRESS = "IN_PROGRESS", "In progress"
        COMPLETION_SUBMITTED = "COMPLETION_SUBMITTED", "Completion submitted"
        COMPLETED = "COMPLETED", "Completed"
        PARTIALLY_COMPLETED = "PARTIALLY_COMPLETED", "Partially completed"
        DISPUTED = "DISPUTED", "Disputed"
        RECOVERY_REQUIRED = "RECOVERY_REQUIRED", "Recovery required"
        ABORTED = "ABORTED", "Aborted"
        CANCELLED = "CANCELLED", "Cancelled"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey(Order, on_delete=models.PROTECT, related_name="bookings")
    fulfilment_unit = models.OneToOneField(
        FulfilmentUnit,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="booking",
    )
    reservation = models.OneToOneField(
        Reservation, on_delete=models.PROTECT, related_name="booking"
    )
    customer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    partner = models.ForeignKey(PartnerProfile, on_delete=models.PROTECT)
    scheduled_start = models.DateTimeField()
    estimated_duration_minutes = models.PositiveIntegerField()
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.CONFIRMED)
    version = models.PositiveIntegerField(default=1)
    en_route_at = models.DateTimeField(null=True, blank=True)
    arrived_at = models.DateTimeField(null=True, blank=True)
    customer_unavailable_wait_started_at = models.DateTimeField(null=True, blank=True)
    late_declared_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancellation_reason = models.CharField(max_length=240, blank=True)
    # Set when a dispute/safety/damage case opens. Read (never written) by the future B9/BE-10
    # Partner ledger before releasing a payout — this is the documented seam, not a fabricated
    # OperationsCase.
    payout_hold = models.BooleanField(default=False)
    # Direct-assignment safeguards (spec §11.3): the Partner acknowledges the advance job,
    # and an unacknowledged job near the visit is flagged for Operations re-dispatch.
    assignment_acknowledged_at = models.DateTimeField(null=True, blank=True)
    needs_redispatch = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return str(self.id)


#: Purposes that are charged outside a cart and therefore carry no `CheckoutSession`.
#:
#: Module-level so that `PaymentAttempt.Meta` can reference it: a nested class body cannot see
#: the enclosing class's namespace, which is why the check constraint below used to carry its own
#: hand-copied duplicate of this list. That duplicate drifted — `M2_BOOKING_FEE` was added to the
#: tuple and not to the constraint, and because the model's `Meta` and its migration agreed with
#: each other, `makemigrations --check` stayed green while every booking-fee checkout raised
#: `IntegrityError` at the database. One list, referenced twice, is the fix.
CHECKOUT_FREE_PURPOSES = (
    "SCOPE_AMENDMENT_REVISION",
    "M2_QUOTE_UNLOCK",
    "M2_VISIT_PLAN",
    "M2_SITE_VISIT_FEE",
    "M2_STAGE_FUNDING",
    "M2_MATERIAL_ADVANCE",
    "M2_SCOPE_AMENDMENT",
    "M2_BOOKING_FEE",
    "A7_RENTAL_BOOKING",
    "A7_DEPOSIT_HOLD",
    "A7_DAMAGE_SETTLEMENT",
    "A7_EXTENSION",
    "A9_STAY_RESERVATION",
    "A9_DEPOSIT_HOLD",
    "A9_DAMAGE_SETTLEMENT",
    "A9_EXTENSION",
    "A10_VENDOR_SUBSCRIPTION",
    "A10_PREMIUM_LISTING",
)


class PaymentAttempt(models.Model):
    class Purpose(models.TextChoices):
        """Why money is being collected. One enum, one payment path.

        Every M2 purpose below is a *post-cart* charge with no `CheckoutSession`, exactly as
        `SCOPE_AMENDMENT_REVISION` already was. They are added here rather than modelled as a
        second payment aggregate so reconciliation, webhooks, refunds and the financial-exception
        machinery keep working on one table (`M2-BE-414`).
        """

        BOOKING_GROUP = "BOOKING_GROUP", "Booking group"
        SCOPE_AMENDMENT_REVISION = "SCOPE_AMENDMENT_REVISION", "Scope amendment revision"
        #: A3: the INR 149 that unlocks delivered quotes, charged only once a usable quote exists.
        M2_QUOTE_UNLOCK = "M2_QUOTE_UNLOCK", "M2 quote unlock"
        #: A5: the whole tiered visit plan, charged once at the first confirmed visit slot.
        M2_VISIT_PLAN = "M2_VISIT_PLAN", "M2 visit plan"
        #: An ad-hoc paid site visit, priced by the vendor. Distinct from the plan fee: it is the
        #: vendor's fee for one journey, not the Customer's access product.
        M2_SITE_VISIT_FEE = "M2_SITE_VISIT_FEE", "M2 site visit fee"
        #: A5: one engagement stage, funded at face value. Visit money never discounts a stage.
        M2_STAGE_FUNDING = "M2_STAGE_FUNDING", "M2 stage funding"
        #: A5: material money, which is spent rather than earned, so it cannot be recovered like
        #: an unearned work stage. A distinct purpose is what keeps that rule expressible.
        M2_MATERIAL_ADVANCE = "M2_MATERIAL_ADVANCE", "M2 material advance"
        #: Additional work on a live M2 engagement, after an accepted scope amendment.
        #: **Deliberately not `SCOPE_AMENDMENT_REVISION`**: that purpose's capture handler
        #: resolves a `PriceRevision` by `Booking`, which an M2 engagement does not have, so
        #: reusing it would route an M2 payment into a lookup that cannot succeed. One amendment
        #: engine, two aggregates, two capture routes.
        M2_SCOPE_AMENDMENT = "M2_SCOPE_AMENDMENT", "M2 engagement scope amendment"
        #: A3 rate-card (revision 4): the booking fee charged once at vendor accept, and the only
        #: money Vsolve collects on that path. Deliberately not `M2_QUOTE_UNLOCK` — the unlock is
        #: the demoted fallback's product and refunds on different rules, and a shared purpose
        #: would route a forfeit split into the unlock's completion.
        M2_BOOKING_FEE = "M2_BOOKING_FEE", "M2 booking fee"
        #: A7 Rental purposes:
        A7_RENTAL_BOOKING = "A7_RENTAL_BOOKING", "A7 rental booking"
        A7_DEPOSIT_HOLD = "A7_DEPOSIT_HOLD", "A7 deposit hold"
        A7_DAMAGE_SETTLEMENT = "A7_DAMAGE_SETTLEMENT", "A7 damage settlement"
        A7_EXTENSION = "A7_EXTENSION", "A7 extension"
        #: A9 Stay purposes:
        A9_STAY_RESERVATION = "A9_STAY_RESERVATION", "A9 stay reservation"
        A9_DEPOSIT_HOLD = "A9_DEPOSIT_HOLD", "A9 deposit hold"
        A9_DAMAGE_SETTLEMENT = "A9_DAMAGE_SETTLEMENT", "A9 damage settlement"
        A9_EXTENSION = "A9_EXTENSION", "A9 extension"
        #: A10 Listing B2B poster charges:
        A10_VENDOR_SUBSCRIPTION = "A10_VENDOR_SUBSCRIPTION", "A10 vendor subscription"
        A10_PREMIUM_LISTING = "A10_PREMIUM_LISTING", "A10 premium listing"

    #: Purposes that are charged outside a cart and therefore carry no `CheckoutSession`. Bound
    #: from the module-level tuple, which the check constraint below reads from the same name, so
    #: adding a purpose to one and not the other is no longer possible.
    CHECKOUT_FREE_PURPOSES = CHECKOUT_FREE_PURPOSES

    class Status(models.TextChoices):
        PROVIDER_PENDING = "PROVIDER_PENDING", "Provider pending"
        CREATED = "CREATED", "Created"
        AUTHORIZED = "AUTHORIZED", "Authorized"
        CAPTURED = "CAPTURED", "Captured"
        FAILED = "FAILED", "Failed"
        EXPIRED = "EXPIRED", "Expired"
        PARTIALLY_REFUNDED = "PARTIALLY_REFUNDED", "Partially refunded"
        REFUNDED = "REFUNDED", "Refunded"

    class ReconciliationState(models.TextChoices):
        PENDING = "PENDING", "Pending"
        IN_SYNC = "IN_SYNC", "In sync"
        NEEDS_ATTENTION = "NEEDS_ATTENTION", "Needs attention"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    allocations: Any
    refunds: Any
    rental_allocations: Any
    stay_allocations: Any
    fulfilment_price_revisions: Any
    tax_documents: Any
    financial_exceptions: Any
    # Nullable for every purpose in `CHECKOUT_FREE_PURPOSES` — a post-booking charge for
    # additional catalog work, and every M2 access or stage charge, has no `CheckoutSession`.
    # `BOOKING_GROUP` still requires one, and the check constraint below enforces both halves.
    checkout = models.ForeignKey(
        CheckoutSession,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="payment_attempts",
    )
    booking_group = models.ForeignKey(
        BookingGroup,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="payment_attempts",
    )
    quote = models.ForeignKey(
        Quote,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="payment_attempts",
    )
    purpose = models.CharField(
        max_length=24,
        choices=Purpose.choices,
        default=Purpose.BOOKING_GROUP,
    )
    idempotency_key = models.CharField(max_length=128, blank=True)
    provider = models.CharField(max_length=32)
    provider_order_id = models.CharField(max_length=128, blank=True)
    provider_payment_id = models.CharField(max_length=128, blank=True)
    amount_paise = models.PositiveBigIntegerField()
    currency = models.CharField(max_length=3, default="INR")
    status = models.CharField(
        max_length=24,
        choices=Status.choices,
        default=Status.PROVIDER_PENDING,
    )
    reconciliation_state = models.CharField(
        max_length=24,
        choices=ReconciliationState.choices,
        default=ReconciliationState.PENDING,
    )
    failure_code = models.SlugField(max_length=80, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    version = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    captured_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=models.Q(amount_paise__gt=0),
                name="commerce_payment_attempt_positive_amount",
            ),
            models.UniqueConstraint(
                fields=("provider", "provider_order_id"),
                condition=~models.Q(provider_order_id=""),
                name="commerce_unique_provider_order",
            ),
            models.UniqueConstraint(
                fields=("provider", "provider_payment_id"),
                condition=~models.Q(provider_payment_id=""),
                name="commerce_unique_provider_payment",
            ),
            models.UniqueConstraint(
                fields=("booking_group", "idempotency_key"),
                condition=(models.Q(booking_group__isnull=False) & ~models.Q(idempotency_key="")),
                name="commerce_unique_group_payment_key",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(purpose="BOOKING_GROUP", checkout__isnull=False)
                    | models.Q(
                        purpose__in=CHECKOUT_FREE_PURPOSES,
                        checkout__isnull=True,
                    )
                ),
                name="commerce_payment_attempt_checkout_matches_purpose",
            ),
        ]

    def __str__(self) -> str:
        return self.provider_order_id or str(self.id)


class PaymentAllocation(models.Model):
    """Immutable captured-money ownership for one Fulfilment Unit line."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    payment_attempt = models.ForeignKey(
        PaymentAttempt,
        on_delete=models.PROTECT,
        related_name="allocations",
    )
    fulfilment_unit = models.ForeignKey(
        FulfilmentUnit,
        on_delete=models.PROTECT,
        related_name="payment_allocations",
    )
    fulfilment_line = models.ForeignKey(
        FulfilmentUnitLine,
        on_delete=models.PROTECT,
        related_name="payment_allocations",
    )
    position = models.PositiveSmallIntegerField()
    amount_paise = models.PositiveBigIntegerField()
    refunded_paise = models.PositiveBigIntegerField(default=0)
    currency = models.CharField(max_length=3, default="INR")
    line_snapshot = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("fulfilment_unit__position", "position", "id")
        constraints = [
            models.UniqueConstraint(
                fields=("payment_attempt", "fulfilment_line"),
                name="commerce_unique_payment_line_allocation",
            ),
            models.CheckConstraint(
                condition=models.Q(refunded_paise__lte=models.F("amount_paise")),
                name="commerce_allocation_refund_lte_amount",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.payment_attempt_id}:{self.fulfilment_line_id}"


class PaymentWebhook(models.Model):
    class Status(models.TextChoices):
        RECEIVED = "RECEIVED", "Received"
        PROCESSED = "PROCESSED", "Processed"
        IGNORED = "IGNORED", "Ignored"
        FAILED = "FAILED", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    provider = models.CharField(max_length=32)
    provider_event_id = models.CharField(max_length=128)
    event_type = models.CharField(max_length=128)
    signature_verified = models.BooleanField(default=False)
    payload_sha256 = models.CharField(max_length=64, blank=True)
    event_data = models.JSONField(default=dict)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.RECEIVED)
    processing_error = models.CharField(max_length=500, blank=True)
    provider_created_at = models.DateTimeField(null=True, blank=True)
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
        SUBMITTED = "SUBMITTED", "Submitted"
        PROCESSING = "PROCESSING", "Processing"
        SUCCEEDED = "SUCCEEDED", "Succeeded"
        FAILED = "FAILED", "Failed"
        UNDER_REVIEW = "UNDER_REVIEW", "Under review"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    allocations: Any
    financial_exceptions: Any
    order = models.ForeignKey(
        Order, null=True, blank=True, on_delete=models.PROTECT, related_name="refunds"
    )
    payment_attempt = models.ForeignKey(
        PaymentAttempt,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="refunds",
    )
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="requested_refunds",
    )
    amount_paise = models.PositiveBigIntegerField()
    currency = models.CharField(max_length=3, default="INR")
    reason_code = models.SlugField(max_length=80)
    idempotency_key = models.CharField(max_length=128, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.REQUESTED)
    provider_refund_id = models.CharField(max_length=128, blank=True)
    reconciliation_state = models.CharField(
        max_length=24,
        choices=PaymentAttempt.ReconciliationState.choices,
        default=PaymentAttempt.ReconciliationState.PENDING,
    )
    failure_code = models.SlugField(max_length=80, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=models.Q(amount_paise__gt=0),
                name="commerce_refund_positive_amount",
            ),
            models.UniqueConstraint(
                fields=("payment_attempt", "idempotency_key"),
                condition=(models.Q(payment_attempt__isnull=False) & ~models.Q(idempotency_key="")),
                name="commerce_unique_payment_refund_key",
            ),
            models.UniqueConstraint(
                fields=("payment_attempt", "provider_refund_id"),
                condition=~models.Q(provider_refund_id=""),
                name="commerce_unique_provider_refund",
            ),
        ]

    def __str__(self) -> str:
        return str(self.id)


class RefundAllocation(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    refund = models.ForeignKey(Refund, on_delete=models.PROTECT, related_name="allocations")
    payment_allocation = models.ForeignKey(
        PaymentAllocation,
        on_delete=models.PROTECT,
        related_name="refund_allocations",
    )
    amount_paise = models.PositiveBigIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("refund", "payment_allocation"),
                name="commerce_unique_refund_allocation",
            ),
            models.CheckConstraint(
                condition=models.Q(amount_paise__gt=0),
                name="commerce_refund_allocation_positive_amount",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.refund_id}:{self.payment_allocation_id}"


class DocumentSequence(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    legal_entity_code = models.SlugField(max_length=40)
    financial_year = models.CharField(max_length=9)
    kind = models.CharField(max_length=16)
    series = models.CharField(max_length=24)
    last_sequence = models.PositiveBigIntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("legal_entity_code", "financial_year", "kind", "series"),
                name="commerce_unique_document_sequence",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.series}:{self.last_sequence}"


class TaxDocument(models.Model):
    class Kind(models.TextChoices):
        INVOICE = "INVOICE", "Invoice"
        CREDIT_NOTE = "CREDIT_NOTE", "Credit note"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey(Order, on_delete=models.PROTECT, related_name="tax_documents")
    payment_attempt = models.ForeignKey(
        PaymentAttempt,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="tax_documents",
    )
    booking_group = models.ForeignKey(
        BookingGroup,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="tax_documents",
    )
    kind = models.CharField(max_length=16, choices=Kind.choices)
    legal_entity_code = models.SlugField(max_length=40, default="vsolve")
    financial_year = models.CharField(max_length=9, default="legacy")
    series = models.CharField(max_length=24)
    sequence = models.PositiveBigIntegerField()
    total_paise = models.PositiveBigIntegerField()
    tax_snapshot = models.JSONField(default=dict)
    is_test = models.BooleanField(default=True)
    issued_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("series", "sequence"), name="commerce_unique_document_number"
            )
        ]

    def __str__(self) -> str:
        return f"{self.series}-{self.sequence}"


class TaxDocumentLine(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey(TaxDocument, on_delete=models.PROTECT, related_name="lines")
    payment_allocation = models.ForeignKey(
        PaymentAllocation,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
    )
    position = models.PositiveSmallIntegerField()
    code = models.CharField(max_length=140)
    label = models.CharField(max_length=240)
    quantity = models.PositiveIntegerField(default=1)
    total_paise = models.PositiveBigIntegerField()
    tax_paise = models.PositiveBigIntegerField(default=0)
    currency = models.CharField(max_length=3, default="INR")
    snapshot = models.JSONField(default=dict)

    class Meta:
        ordering = ("position", "id")
        constraints = [
            models.UniqueConstraint(
                fields=("document", "position"),
                name="commerce_unique_document_line_position",
            ),
            models.CheckConstraint(
                condition=models.Q(tax_paise__lte=models.F("total_paise")),
                name="commerce_document_line_tax_lte_total",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.document_id}:{self.position}"


class FinancialException(models.Model):
    class Kind(models.TextChoices):
        CAPTURE_WITHOUT_CAPACITY = "CAPTURE_WITHOUT_CAPACITY", "Capture without capacity"
        PROVIDER_AMBIGUITY = "PROVIDER_AMBIGUITY", "Provider ambiguity"
        REFUND_FAILED = "REFUND_FAILED", "Refund failed"
        AMOUNT_MISMATCH = "AMOUNT_MISMATCH", "Amount mismatch"
        # Wave C6. The Customer's bank pulled a charge back (`M2-BE-708`), and the scheduled
        # reconciliation found two records of one fact that do not agree (`M2-BE-710`). Both are
        # `FinancialException` rather than new tables for the reason this model exists at all:
        # there is one queue for "the money and the record disagree", and a second one would be a
        # second place for an unreconciled rupee to be somebody else's problem.
        CHARGEBACK = "CHARGEBACK", "Chargeback"
        RECONCILIATION_MISMATCH = "RECONCILIATION_MISMATCH", "Reconciliation mismatch"

    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        RESOLVED = "RESOLVED", "Resolved"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kind = models.CharField(max_length=40, choices=Kind.choices)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.OPEN)
    payment_attempt = models.ForeignKey(
        PaymentAttempt,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="financial_exceptions",
    )
    refund = models.ForeignKey(
        Refund,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="financial_exceptions",
    )
    code = models.SlugField(max_length=80)
    context = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=("status", "kind", "created_at"))]

    def __str__(self) -> str:
        return f"{self.kind}:{self.id}"
