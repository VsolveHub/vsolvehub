"""Partner ledger and Operations-reviewed payout batches.

`05-pricing-payments-and-settlement.md` gives the flow in four steps:

    eligible entries → transactionally reserve → idempotent provider payout
                     → webhook/reconciliation → paid or safely released

Three properties make that safe, and each is enforced by the database rather than by discipline.

**A ledger entry is immutable.** Amounts never change. A correction is a *new* entry of kind
`ADJUSTMENT` or `REVERSAL` — the settlement document is explicit that a mistake is fixed by
"ledger reversal rather than an off-ledger cash adjustment", because an edited ledger cannot be
reconciled against the payments that produced it. Only `status` moves, and only along the
reservation lifecycle.

**One entry can be reserved by at most one live batch.** A partial unique index on
`PayoutBatchItem` makes a second reservation an `IntegrityError`, not a race that occasionally
pays a Partner twice. Cancelling a batch frees its entries by releasing the index.

**A batch is approved by someone other than its proposer.** Maker-checker is a check constraint,
so it holds even if a future command forgets to ask.

## Why `net_paise` is stored rather than derived

`gross - commission` is trivially derivable, and deriving it would be wrong. The commission
policy is effective-dated and versioned; an entry written under one policy must keep reporting
the number the Partner was actually shown at offer time, however the policy moves afterwards.
The stored value is the promise; a recomputation is an opinion.
"""

import uuid
from typing import Any

from django.conf import settings
from django.db import models

from apps.commerce.models import Booking
from apps.partners.models import PartnerProfile


class PartnerPayoutAccount(models.Model):
    """Where a Partner's money goes, with a cooling period on changes.

    `effective_from` is the cooling control. A newly added or changed account is not payable
    immediately: account takeover is the highest-value attack on a payouts system, and a delay
    between "the account changed" and "money can leave" is what gives a Partner time to notice
    and Operations time to act. The settlement document names it as a precondition for on-demand
    payout; it applies to the batch flow too, at no cost.

    Only the last four digits are stored in a readable field. The full number lives with the
    payout provider, which is the only party that needs it.
    """

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending verification"
        VERIFIED = "VERIFIED", "Verified"
        REJECTED = "REJECTED", "Rejected"
        REPLACED = "REPLACED", "Replaced"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.ForeignKey(
        PartnerProfile, on_delete=models.PROTECT, related_name="payout_accounts"
    )
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)
    #: The provider's own token for the account. No bank number is stored here.
    provider_contact_id = models.CharField(max_length=128, blank=True)
    provider_fund_account_id = models.CharField(max_length=128, blank=True)
    account_last4 = models.CharField(max_length=4)
    ifsc = models.CharField(max_length=16, blank=True)
    holder_name = models.CharField(max_length=140)
    verified_at = models.DateTimeField(null=True, blank=True)
    #: Not payable before this instant, even once verified.
    effective_from = models.DateTimeField()
    #: Who registered it. An account change is the event a takeover investigation starts from.
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "id")
        constraints = [
            models.UniqueConstraint(
                fields=("partner",),
                condition=models.Q(status__in=("PENDING", "VERIFIED")),
                name="payouts_one_live_account_per_partner",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.partner_id}:****{self.account_last4}"


class PartnerLedgerEntry(models.Model):
    """One immutable line of what a Partner is owed, and what happened to it."""

    class Kind(models.TextChoices):
        EARNING = "EARNING", "Earning"
        ADJUSTMENT = "ADJUSTMENT", "Adjustment"
        REVERSAL = "REVERSAL", "Reversal"

    class Status(models.TextChoices):
        #: Earned, but not yet releasable — an open payout-holding case, or a dispute.
        PENDING = "PENDING", "Pending"
        AVAILABLE = "AVAILABLE", "Available"
        RESERVED = "RESERVED", "Reserved in a batch"
        PAID = "PAID", "Paid"
        #: A reservation that came back: the batch was cancelled or the payout failed.
        RELEASED = "RELEASED", "Released"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.ForeignKey(
        PartnerProfile, on_delete=models.PROTECT, related_name="ledger_entries"
    )
    booking = models.ForeignKey(
        Booking, null=True, blank=True, on_delete=models.PROTECT, related_name="ledger_entries"
    )
    rental_booking = models.ForeignKey(
        "rentals.RentalBooking", null=True, blank=True, on_delete=models.PROTECT, related_name="ledger_entries"
    )
    stay_reservation = models.ForeignKey(
        "stays.StayReservation", null=True, blank=True, on_delete=models.PROTECT, related_name="ledger_entries"
    )
    kind = models.CharField(max_length=12, choices=Kind.choices, default=Kind.EARNING)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)

    #: Signed. An `EARNING` is positive; a `REVERSAL` is negative, so a partner's balance is a
    #: plain SUM and never a case analysis that a report could get wrong.
    gross_paise = models.BigIntegerField()
    commission_paise = models.BigIntegerField()
    net_paise = models.BigIntegerField()
    currency = models.CharField(max_length=3, default="INR")

    #: Everything that decided the numbers: the pricing policy version, the commission basis
    #: points, the outcomes settled. An entry has to be explainable years later.
    calculation_snapshot = models.JSONField(default=dict)
    #: Present on `ADJUSTMENT`/`REVERSAL`: the entry being corrected.
    corrects = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.PROTECT, related_name="corrections"
    )
    reason = models.CharField(max_length=240, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    idempotency_key = models.CharField(max_length=128, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("created_at", "id")
        indexes = [
            models.Index(fields=("partner", "status")),
            models.Index(fields=("status", "created_at")),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=("idempotency_key",),
                condition=~models.Q(idempotency_key=""),
                name="payouts_unique_ledger_key",
            ),
            models.UniqueConstraint(
                # One earning per Booking. A second would pay for the same visit twice, and the
                # settlement path is idempotent precisely because this constraint exists.
                fields=("booking",),
                condition=models.Q(kind="EARNING", booking__isnull=False),
                name="payouts_one_earning_per_booking",
            ),
            models.UniqueConstraint(
                fields=("rental_booking",),
                condition=models.Q(kind="EARNING", rental_booking__isnull=False),
                name="payouts_one_earning_per_rental_booking",
            ),
            models.UniqueConstraint(
                fields=("stay_reservation",),
                condition=models.Q(kind="EARNING", stay_reservation__isnull=False),
                name="payouts_one_earning_per_stay_reservation",
            ),
            models.CheckConstraint(
                condition=models.Q(
                    net_paise=models.F("gross_paise") - models.F("commission_paise")
                ),
                name="payouts_net_reconciles_to_gross_less_commission",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(kind="EARNING", corrects__isnull=True)
                    | models.Q(kind__in=("ADJUSTMENT", "REVERSAL"))
                ),
                name="payouts_only_corrections_reference_an_entry",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(booking__isnull=False, rental_booking__isnull=True, stay_reservation__isnull=True)
                    | models.Q(booking__isnull=True, rental_booking__isnull=False, stay_reservation__isnull=True)
                    | models.Q(booking__isnull=True, rental_booking__isnull=True, stay_reservation__isnull=False)
                    | models.Q(booking__isnull=True, rental_booking__isnull=True, stay_reservation__isnull=True)
                ),
                name="payouts_ledger_entry_at_most_one_scope",
            ),
            models.CheckConstraint(
                condition=(
                    ~models.Q(kind="EARNING")
                    | models.Q(booking__isnull=False, rental_booking__isnull=True, stay_reservation__isnull=True)
                    | models.Q(booking__isnull=True, rental_booking__isnull=False, stay_reservation__isnull=True)
                    | models.Q(booking__isnull=True, rental_booking__isnull=True, stay_reservation__isnull=False)
                ),
                name="payouts_earning_must_have_exactly_one_scope",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.partner_id}:{self.kind}:{self.net_paise}"

    def save(self, *args: Any, **kwargs: Any) -> None:
        """Immutable except for the reservation lifecycle.

        Enforced here rather than only in the service layer because a ledger is the one table
        where "someone will remember not to" is not good enough. `update_fields` naming only
        status/updated_at is a lifecycle move; anything else on an existing row is refused.
        """

        if not self._state.adding:
            allowed = {"status", "updated_at"}
            update_fields = set(kwargs.get("update_fields") or ())
            if not update_fields or not update_fields.issubset(allowed):
                raise ValueError(
                    "Partner ledger entries are immutable. Correct one with an ADJUSTMENT or "
                    "REVERSAL entry instead of editing it."
                )
        super().save(*args, **kwargs)


class PayoutBatch(models.Model):
    """A reviewed set of reservations, paid once.

    Weekly and Operations-reviewed for M1 — the settlement document prefers it to on-demand
    withdrawal until account-change cooling, fraud monitoring and reconciliation are proven, and
    two of those three are still open.
    """

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        PENDING_APPROVAL = "PENDING_APPROVAL", "Pending approval"
        APPROVED = "APPROVED", "Approved"
        PAYING = "PAYING", "Paying"
        PAID = "PAID", "Paid"
        FAILED = "FAILED", "Failed"
        CANCELLED = "CANCELLED", "Cancelled"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reference = models.CharField(max_length=64, unique=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    period_start = models.DateTimeField()
    period_end = models.DateTimeField()

    proposed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="proposed_payout_batches"
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="approved_payout_batches",
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    #: Cancelling releases every reservation back to the ledger. That is an Operations action on
    #: money in flight, so it is named rather than inferred from a status change.
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="cancelled_payout_batches",
    )
    cancelled_at = models.DateTimeField(null=True, blank=True)
    version = models.PositiveIntegerField(default=1)
    total_paise = models.BigIntegerField(default=0)
    currency = models.CharField(max_length=3, default="INR")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "id")
        constraints = [
            models.CheckConstraint(
                # Maker-checker, in the schema. A command that forgot to check would still be
                # refused by PostgreSQL, which is the point of putting it here.
                condition=(
                    models.Q(approved_by__isnull=True)
                    | ~models.Q(approved_by=models.F("proposed_by"))
                ),
                name="payouts_approver_is_not_the_proposer",
            ),
            models.CheckConstraint(
                condition=models.Q(period_end__gt=models.F("period_start")),
                name="payouts_batch_period_is_ordered",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.reference}:{self.status}"


class PayoutBatchItem(models.Model):
    """One ledger entry's reservation inside one batch, and the provider result for it."""

    class Status(models.TextChoices):
        RESERVED = "RESERVED", "Reserved"
        SUBMITTED = "SUBMITTED", "Submitted"
        PAID = "PAID", "Paid"
        FAILED = "FAILED", "Failed"
        #: Ambiguous provider result. Never guessed either way — Finance reconciles it.
        UNDER_REVIEW = "UNDER_REVIEW", "Under review"
        RELEASED = "RELEASED", "Released"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    batch = models.ForeignKey(PayoutBatch, on_delete=models.PROTECT, related_name="items")
    ledger_entry = models.ForeignKey(
        PartnerLedgerEntry, on_delete=models.PROTECT, related_name="payout_items"
    )
    partner = models.ForeignKey(
        PartnerProfile, on_delete=models.PROTECT, related_name="payout_items"
    )
    payout_account = models.ForeignKey(
        PartnerPayoutAccount, on_delete=models.PROTECT, related_name="payout_items"
    )
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.RESERVED)
    amount_paise = models.BigIntegerField()
    currency = models.CharField(max_length=3, default="INR")
    provider_payout_id = models.CharField(max_length=128, blank=True)
    failure_code = models.SlugField(max_length=80, blank=True)
    #: Sent to the provider so a retried submission cannot pay twice.
    idempotency_key = models.CharField(max_length=128)
    submitted_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("created_at", "id")
        indexes = [models.Index(fields=("batch", "status"))]
        constraints = [
            models.UniqueConstraint(
                # **The double-pay guarantee.** A ledger entry may be held by at most one item
                # that is not finished with it. A released or failed item frees the entry for a
                # later batch; a live one makes a second reservation an IntegrityError rather
                # than a race that occasionally pays a Partner twice for one visit.
                fields=("ledger_entry",),
                condition=models.Q(status__in=("RESERVED", "SUBMITTED", "PAID", "UNDER_REVIEW")),
                name="payouts_one_live_reservation_per_ledger_entry",
            ),
            models.UniqueConstraint(
                fields=("idempotency_key",),
                name="payouts_unique_item_key",
            ),
            models.CheckConstraint(
                condition=models.Q(amount_paise__gt=0),
                name="payouts_item_amount_is_positive",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.batch_id}:{self.ledger_entry_id}:{self.status}"
