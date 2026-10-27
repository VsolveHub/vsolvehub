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
`PayoutItemEntry` makes a second reservation an `IntegrityError`, not a race that occasionally
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
from apps.rental.models import RentalBooking


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
    #: The Operations user who verified or rejected it. Never the person who registered it.
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
    )
    #: Shown to the Partner, so it says what to fix rather than why they were suspected.
    rejection_reason = models.CharField(max_length=240, blank=True)
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
    #: A7 rental bookings. Exactly one of ``booking`` / ``rental_booking`` is set on an EARNING.
    rental_booking = models.ForeignKey(
        RentalBooking,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="ledger_entries",
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
    #: Not payable before this instant, whatever its status says. A visit's earning clears once
    #: the Customer's 72-hour quality-dispute window has closed, so a dispute can always freeze
    #: it before any of it leaves. Empty means cleared from the start: corrections, refunds and
    #: M2 entries, which carry their own release windows.
    clears_at = models.DateTimeField(null=True, blank=True)
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
                # One earning per A7 rental booking, same guarantee as above.
                fields=("rental_booking",),
                condition=models.Q(kind="EARNING", rental_booking__isnull=False),
                name="payouts_one_earning_per_rental_booking",
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


class PartnerEarningHold(models.Model):
    """Money that must not leave until somebody decides: a dispute or a case on one booking.

    Explicit rather than read off a booking flag, so the rule can be inspected: a hold names the
    booking it freezes, why, who placed it and when it was lifted. While any hold on a booking is
    `ACTIVE`, that booking's earning is left out of every payout and counted as held in the
    Partner's balance, whether the earning was written before the hold or after it. That is what
    stops a dispute opened after the money became available from being paid straight past.
    """

    class Reason(models.TextChoices):
        COMPLETION_DISPUTE = "COMPLETION_DISPUTE", "Customer disputed the completion"
        QUALITY_DISPUTE = "QUALITY_DISPUTE", "Customer opened a quality dispute"
        OPERATIONS_CASE = "OPERATIONS_CASE", "Operations case holding payouts"
        RENTAL_DEPOSIT_DISPUTE = "RENTAL_DEPOSIT_DISPUTE", "Rental deposit dispute"

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        RELEASED = "RELEASED", "Released"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.ForeignKey(
        PartnerProfile, on_delete=models.PROTECT, related_name="earning_holds"
    )
    booking = models.ForeignKey(
        Booking, null=True, blank=True, on_delete=models.PROTECT, related_name="earning_holds"
    )
    rental_booking = models.ForeignKey(
        RentalBooking,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="earning_holds",
    )
    reason = models.CharField(max_length=32, choices=Reason.choices)
    #: What placed it: the case id for a case, the booking id for a dispute. Two causes on one
    #: booking are two holds, and the money stays frozen until both are lifted.
    source_id = models.CharField(max_length=64)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.ACTIVE)
    placed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    released_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    release_note = models.CharField(max_length=240, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    released_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at", "id")
        indexes = [
            models.Index(fields=("booking", "status")),
            models.Index(fields=("rental_booking", "status")),
            models.Index(fields=("partner", "status")),
        ]
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(booking__isnull=False, rental_booking__isnull=True)
                    | models.Q(booking__isnull=True, rental_booking__isnull=False)
                ),
                name="payouts_hold_names_one_booking",
            ),
            models.UniqueConstraint(
                fields=("reason", "source_id"),
                condition=models.Q(status="ACTIVE"),
                name="payouts_one_active_hold_per_cause",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.reason}:{self.source_id}:{self.status}"


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
    """One transfer to one Partner inside one batch, and what the provider said about it.

    A transfer covers every cleared ledger entry the Partner had when the batch was proposed —
    earnings and the refunds that reduce them — listed in `PayoutItemEntry`. One transfer per
    Partner rather than one per visit is what lets a refund come off the amount paid, and what
    stops a busy week costing a provider fee per job.
    """

    class Status(models.TextChoices):
        RESERVED = "RESERVED", "Reserved"
        SUBMITTED = "SUBMITTED", "Submitted"
        PAID = "PAID", "Paid"
        FAILED = "FAILED", "Failed"
        #: Ambiguous provider result. Never guessed either way — Finance reconciles it.
        UNDER_REVIEW = "UNDER_REVIEW", "Under review"
        RELEASED = "RELEASED", "Released"
        #: Paid, then returned by the beneficiary's bank (RazorpayX allows up to T+3 working
        #: days). The money is back in the Partner's balance, exactly once.
        REVERSED = "REVERSED", "Reversed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    batch = models.ForeignKey(PayoutBatch, on_delete=models.PROTECT, related_name="items")
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
        indexes = [
            models.Index(fields=("batch", "status")),
            models.Index(fields=("provider_payout_id",), name="payouts_item_provider_id_idx"),
        ]
        constraints = [
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
        return f"{self.batch_id}:{self.partner_id}:{self.status}"


class PayoutItemEntry(models.Model):
    """One ledger entry inside one transfer, at the amount it contributed.

    `amount_paise` is signed, like the ledger: a refund's reversal contributes a negative line, and
    the transfer is the sum of its lines.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    item = models.ForeignKey(PayoutBatchItem, on_delete=models.PROTECT, related_name="entries")
    ledger_entry = models.ForeignKey(
        PartnerLedgerEntry, on_delete=models.PROTECT, related_name="payout_lines"
    )
    amount_paise = models.BigIntegerField()
    #: True while the transfer still holds this entry — reserved, sent, paid or uncertain. Kept
    #: on the line rather than read from the item because the double-pay index below can only
    #: look at its own table.
    is_live = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("created_at", "id")
        constraints = [
            models.UniqueConstraint(
                # **The double-pay guarantee.** A ledger entry may be held by at most one live
                # transfer. A released, failed or reversed transfer frees its entries for a later
                # batch; a live one makes a second reservation an IntegrityError rather than a
                # race that occasionally pays a Partner twice for one visit.
                fields=("ledger_entry",),
                condition=models.Q(is_live=True),
                name="payouts_one_live_line_per_ledger_entry",
            ),
            models.UniqueConstraint(
                fields=("item", "ledger_entry"), name="payouts_entry_once_per_item"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.item_id}:{self.ledger_entry_id}:{self.amount_paise}"


class PayoutWebhookEvent(models.Model):
    """Every verified RazorpayX payout webhook, recorded once.

    The provider's event id is unique, so a redelivery is recognised and changes nothing. Only a
    summary of the payout is kept — never the fund account, which can carry bank details.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    provider_event_id = models.CharField(max_length=128, unique=True)
    event_type = models.CharField(max_length=64)
    provider_payout_id = models.CharField(max_length=128, blank=True)
    provider_status = models.CharField(max_length=24, blank=True)
    payout_item = models.ForeignKey(
        PayoutBatchItem,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="webhook_events",
    )
    #: Whether this delivery changed the item's decided status (not just its tracking fields).
    changed_status = models.BooleanField(default=False)
    summary = models.JSONField(default=dict)
    payload_sha256 = models.CharField(max_length=64)
    received_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-received_at", "id")

    def __str__(self) -> str:
        return f"{self.event_type}:{self.provider_event_id}"
