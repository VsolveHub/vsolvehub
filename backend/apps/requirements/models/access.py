"""P4 access and visits: the two paid front doors, and the visit and selection behind them.

`M2AccessPrice` prices both products; `QuoteUnlock` is the A3 one and `VisitPlan` with its
`VisitPlanShare` rows is the A5 one. `SiteVisit` is the visit itself under either archetype, and
`ProposalSelection` is the Customer's choice while it waits on the vendor. The boundary is
reconfirmation: what a confirmed selection becomes lives in `engagements`.
"""

import uuid
from typing import Final

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.partners.models import PartnerProfile

# ---------------------------------------------------------------------------
# P4 / revision 3: the two front doors and the money behind them.
#
# A3 sells access to delivered remote quotes (`QuoteUnlock`). A5 sells professional visits that
# produce on-site estimates (`VisitPlan` + `VisitPlanShare`). Both are charged only against a real
# accepted commitment, both price server-side from `M2AccessPrice`, and both snapshot the price
# they were bought at so a later price change cannot rewrite a completed purchase.
# ---------------------------------------------------------------------------


class M2AccessPrice(models.Model):
    """Operations-owned, effective-dated price for one M2 access product.

    The same shape as `partners.MinimumWageFloor`, and for the same reason: money values are
    reference data an operator loads and supersedes with a newer effective-dated row, never a
    constant in code. **Nothing here has a default.** Tier prices and the per-slot split are
    blocking owner decision 1, so `apps.requirements.pricing` refuses with
    `m2_access_price_unavailable` while no row is effective rather than inventing INR 149 or a
    50/50 split. A guessed price is indistinguishable from an approved one once it has been
    charged.
    """

    class Kind(models.TextChoices):
        A3_QUOTE_UNLOCK = "A3_QUOTE_UNLOCK", "A3 quote unlock"
        A5_VISIT_PLAN = "A5_VISIT_PLAN", "A5 visit plan"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kind = models.CharField(max_length=20, choices=Kind.choices)
    #: How many vendor visits this tier buys. Zero for the unlock, which is not a tiered product.
    plan_size = models.PositiveSmallIntegerField(default=0)
    amount_paise = models.PositiveBigIntegerField()
    #: The vendor visit payout's share of one slot, in basis points; the remainder is the Vsolve
    #: platform share. A5 only — an unlock pays no vendor, so it carries no split.
    vendor_payout_basis_points = models.PositiveIntegerField(null=True, blank=True)
    effective_from = models.DateField()
    source_reference = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("kind", "plan_size", "-effective_from")
        constraints = [
            models.UniqueConstraint(
                fields=("kind", "plan_size", "effective_from"),
                name="requirements_unique_access_price_version",
            ),
            models.CheckConstraint(
                condition=models.Q(amount_paise__gt=0),
                name="requirements_access_price_positive",
            ),
            # The two products have genuinely different shapes, and mixing them is the error that
            # would silently produce an unlock with a vendor payout or a tier that buys no visits.
            models.CheckConstraint(
                condition=(
                    models.Q(
                        kind="A3_QUOTE_UNLOCK",
                        plan_size=0,
                        vendor_payout_basis_points__isnull=True,
                    )
                    | models.Q(kind="A5_VISIT_PLAN", vendor_payout_basis_points__isnull=False)
                    & models.Q(plan_size__gt=0)
                ),
                name="requirements_access_price_shape_matches_kind",
            ),
            models.CheckConstraint(
                condition=models.Q(vendor_payout_basis_points__isnull=True)
                | models.Q(vendor_payout_basis_points__lte=10000),
                name="requirements_access_price_split_within_range",
            ),
        ]
        indexes = [
            models.Index(fields=("kind", "plan_size", "effective_from")),
        ]

    def __str__(self) -> str:
        return f"{self.kind}:{self.plan_size}:{self.amount_paise}"


#: The two unlock statuses that entitle a Customer to read full quotes. Module scope for the same
#: reason as `REQUIREMENT_CLOSED_STATUSES`: the constraint inside `QuoteUnlock.Meta` cannot see the
#: class attribute, so before Wave C7 it carried its own copy of this pair.
QUOTE_UNLOCK_READABLE_STATUSES: Final[tuple[str, ...]] = ("ACTIVE", "CONSUMED")


class QuoteUnlock(models.Model):
    """A3 only. What the Customer bought when they paid to read the delivered quotes.

    `ACTIVE` is reachable **only** from a verified provider callback. A client redirect saying
    "payment succeeded" is a claim by the party that benefits from it, and an unlock granted on it
    is an unlock granted for free.
    """

    class Status(models.TextChoices):
        PENDING = "PENDING", "Awaiting the provider"
        ACTIVE = "ACTIVE", "Active"
        CONSUMED = "CONSUMED", "Consumed by an engagement"
        REFUNDED = "REFUNDED", "Refunded"
        FAILED = "FAILED", "Failed"

    #: Statuses in which the Customer may read full quotes. Bound from module scope so the
    #: active-unlock-has-a-timestamp constraint below reads this list rather than a copy of it.
    READABLE_STATUSES = QUOTE_UNLOCK_READABLE_STATUSES

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    requirement = models.ForeignKey(
        "requirements.CustomerRequirement",
        on_delete=models.PROTECT,
        related_name="quote_unlocks",
    )
    #: The reference row this purchase was priced from, and the paise it was priced at. Both are
    #: kept: the FK explains *which policy* applied, the integer is the immutable purchase amount
    #: that a refund has to reconcile against even after the policy is superseded.
    price = models.ForeignKey(M2AccessPrice, on_delete=models.PROTECT, related_name="unlocks")
    price_paise = models.PositiveBigIntegerField()
    payment_attempt = models.ForeignKey(
        "commerce.PaymentAttempt",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_quote_unlocks",
    )
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)
    #: The proposals this unlock actually bought, frozen when it activated. A quote submitted
    #: afterwards is still readable — the promise is "up to three" — but the audit needs to know
    #: what was on the table at the moment money moved.
    unlocked_proposal_ids = models.JSONField(default=list, blank=True)
    non_responsive_rejection_count = models.PositiveSmallIntegerField(default=0)
    refund = models.ForeignKey(
        "commerce.Refund",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_quote_unlocks",
    )
    receipt_series = models.CharField(max_length=24, blank=True)
    receipt_sequence = models.PositiveBigIntegerField(null=True, blank=True)
    activated_at = models.DateTimeField(null=True, blank=True)
    consumed_at = models.DateTimeField(null=True, blank=True)
    refunded_at = models.DateTimeField(null=True, blank=True)
    failure_code = models.SlugField(max_length=80, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "id")
        constraints = [
            # One unlock per requirement, scoped to the ones that still mean something. A failed
            # attempt must not block a retry, and this is what makes "one successful payment
            # grants exactly one unlock" a database fact rather than a code convention.
            models.UniqueConstraint(
                fields=("requirement",),
                condition=~models.Q(status="FAILED"),
                name="requirements_one_live_unlock_per_requirement",
            ),
            models.CheckConstraint(
                condition=~models.Q(status__in=QUOTE_UNLOCK_READABLE_STATUSES)
                | models.Q(activated_at__isnull=False),
                name="requirements_active_unlock_has_a_timestamp",
            ),
            models.CheckConstraint(
                condition=models.Q(price_paise__gt=0),
                name="requirements_unlock_price_positive",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.requirement_id}:{self.status}"


#: The two plan statuses in which the Customer's money has been collected. Module scope for the
#: same reason as the two tuples above.
VISIT_PLAN_CHARGED_STATUSES: Final[tuple[str, ...]] = ("ACTIVE", "SETTLED")


class VisitPlan(models.Model):
    """A5 only. One, two or three professionals visit and estimate on site.

    `CHOSEN` charges nothing — it bounds the invitation wave. The **whole plan** is charged once,
    at the first confirmed visit slot, and only on a verified provider callback. Later slots book
    free. `SETTLED` means every share is `EARNED` or `REFUNDED` and the arithmetic closes:
    `price_paise = Σ vendor payouts + Σ platform shares + Σ refunds`.
    """

    class Status(models.TextChoices):
        CHOSEN = "CHOSEN", "Chosen, nothing charged"
        PENDING = "PENDING", "Awaiting the provider"
        ACTIVE = "ACTIVE", "Charged"
        FAILED = "FAILED", "Payment failed"
        VOID = "VOID", "Closed before any visit was confirmed"
        SETTLED = "SETTLED", "Every share earned or refunded"

    #: Statuses in which the plan has been paid for and its shares are live.
    #: Bound from module scope so the charged-plan-has-a-timestamp constraint below reads this
    #: list rather than a copy of it.
    CHARGED_STATUSES = VISIT_PLAN_CHARGED_STATUSES

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    requirement = models.OneToOneField(
        "requirements.CustomerRequirement",
        on_delete=models.PROTECT,
        related_name="visit_plan",
    )
    plan_size = models.PositiveSmallIntegerField()
    price = models.ForeignKey(M2AccessPrice, on_delete=models.PROTECT, related_name="visit_plans")
    price_paise = models.PositiveBigIntegerField()
    #: Value carried over from an A3 unlock when Operations reclassified the requirement to A5.
    #: `M2-BE-427`: reclassification never charges twice, so the plan checkout collects
    #: `price_paise - credit_paise` and a fully credited plan activates with no payment at all.
    credit_paise = models.PositiveBigIntegerField(default=0)
    credit_unlock = models.ForeignKey(
        QuoteUnlock,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="credited_visit_plans",
    )
    #: Snapshotted alongside the price, because the split decides a vendor's income and must not
    #: move under a visit that has already been promised.
    vendor_payout_basis_points = models.PositiveIntegerField()
    payment_attempt = models.ForeignKey(
        "commerce.PaymentAttempt",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_visit_plans",
    )
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.CHOSEN)
    receipt_series = models.CharField(max_length=24, blank=True)
    receipt_sequence = models.PositiveBigIntegerField(null=True, blank=True)
    #: The visit-delivery SLA, stamped when the plan is charged. Stored rather than recomputed so
    #: the unfilled-share sweep can find due plans with an indexed comparison instead of resolving
    #: a business-hours calendar per row.
    fill_due_at = models.DateTimeField(null=True, blank=True)
    chosen_at = models.DateTimeField(default=timezone.now)
    charged_at = models.DateTimeField(null=True, blank=True)
    settled_at = models.DateTimeField(null=True, blank=True)
    voided_at = models.DateTimeField(null=True, blank=True)
    failure_code = models.SlugField(max_length=80, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "id")
        constraints = [
            models.CheckConstraint(
                condition=models.Q(plan_size__gt=0),
                name="requirements_visit_plan_size_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(price_paise__gt=0),
                name="requirements_visit_plan_price_positive",
            ),
            models.CheckConstraint(
                condition=~models.Q(status__in=VISIT_PLAN_CHARGED_STATUSES)
                | models.Q(charged_at__isnull=False),
                name="requirements_charged_plan_has_a_timestamp",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.requirement_id}:{self.plan_size}:{self.status}"

    @property
    def chargeable_paise(self) -> int:
        """What the Customer still owes: the tier price less any carried-over unlock credit."""
        return max(self.price_paise - self.credit_paise, 0)

    @property
    def charge_required(self) -> bool:
        """False when a reclassification credit already covers the whole plan."""
        return self.chargeable_paise > 0


class VisitPlanShare(models.Model):
    """One slot of a visit plan, and the money that follows it.

    Shares exist from the moment the plan is `CHOSEN`, before anything is charged, because the
    first vendor commits to a slot *before* the Customer pays and the commitment has to attach
    somewhere. Their arithmetic is fixed then: `price / size` in integer paise with the remainder
    on the first share, so the parts always add back to the whole.

    `REPLACED` is transient, not terminal. It means this share's visit fell through — a vendor
    no-show, or a completed visit that produced no estimate — and a **free replacement visit** is
    owed. Confirming that replacement returns the share to `COMMITTED`; the visit SLA sweeping past
    it turns it into `REFUNDED`. `SETTLED` at plan level therefore only ever sees `EARNED` and
    `REFUNDED`, exactly as the state machine says.
    """

    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        COMMITTED = "COMMITTED", "A vendor confirmed a visit"
        EARNED = "EARNED", "Visit completed and estimate delivered"
        REFUNDED = "REFUNDED", "Refunded to the Customer"
        REPLACED = "REPLACED", "Awaiting a free replacement visit"

    class MatchingStatus(models.TextChoices):
        """Customer-visible supply state for this independently requested visit."""

        SEARCHING = "SEARCHING", "Searching"
        HELD = "HELD", "Professional held while payment is pending"
        BOOKED = "BOOKED", "Booked"
        VISITED = "VISITED", "Visited"
        ESTIMATE_RECEIVED = "ESTIMATE_RECEIVED", "Estimate received"
        NO_PROFESSIONAL_FOUND = "NO_PROFESSIONAL_FOUND", "No professional found"
        CANCELLED = "CANCELLED", "Cancelled"
        RECOVERY = "RECOVERY", "Recovery"

    #: Statuses from which a settlement sweep may still move a share.
    OPEN_STATUSES = (Status.OPEN, Status.COMMITTED, Status.REPLACED)

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    plan = models.ForeignKey(VisitPlan, on_delete=models.PROTECT, related_name="shares")
    position = models.PositiveSmallIntegerField()
    amount_paise = models.PositiveBigIntegerField()
    #: The split, computed once from the plan's snapshotted basis points. Stored rather than
    #: derived so a share can be audited without re-running arithmetic against a moving policy.
    vendor_payout_paise = models.PositiveBigIntegerField()
    platform_share_paise = models.PositiveBigIntegerField()
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.OPEN)
    matching_status = models.CharField(
        max_length=24,
        choices=MatchingStatus.choices,
        default=MatchingStatus.SEARCHING,
    )
    requested_start = models.DateTimeField(null=True, blank=True)
    duration_minutes = models.PositiveIntegerField(null=True, blank=True)
    partner = models.ForeignKey(
        PartnerProfile,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="visit_plan_shares",
    )
    #: Written when the share is `EARNED`: the vendor's visit payout, on the M1 payout rails.
    ledger_entry = models.ForeignKey(
        "payouts.PartnerLedgerEntry",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_visit_plan_shares",
    )
    refund = models.ForeignKey(
        "commerce.Refund",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_visit_plan_shares",
    )
    settlement_reason_code = models.SlugField(max_length=80, blank=True)
    committed_at = models.DateTimeField(null=True, blank=True)
    earned_at = models.DateTimeField(null=True, blank=True)
    refunded_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("plan", "position")
        constraints = [
            models.UniqueConstraint(
                fields=("plan", "position"),
                name="requirements_unique_visit_plan_share_position",
            ),
            # The split has to close, in paise, on every row. Without this a rounding change in
            # one caller would silently pay a vendor out of the platform's share.
            models.CheckConstraint(
                condition=models.Q(
                    amount_paise=models.F("vendor_payout_paise") + models.F("platform_share_paise")
                ),
                name="requirements_visit_share_split_reconciles",
            ),
            models.CheckConstraint(
                condition=models.Q(amount_paise__gt=0),
                name="requirements_visit_share_positive",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(requested_start__isnull=True, duration_minutes__isnull=True)
                    | models.Q(requested_start__isnull=False, duration_minutes__isnull=False)
                ),
                name="requirements_visit_share_requested_slot_complete",
            ),
        ]
        indexes = [
            models.Index(fields=("plan", "status")),
            models.Index(fields=("status", "partner")),
        ]

    def __str__(self) -> str:
        return f"{self.plan_id}:{self.position}:{self.status}"

    @property
    def is_settled(self) -> bool:
        return self.status in (self.Status.EARNED, self.Status.REFUNDED)


class SiteVisit(models.Model):
    """A paid, scheduled visit whose fee adjusts against the final price.

    Free site visits get refused by vendors, who will not travel unpaid, and used by Customers as
    free consulting. Charging for it also compensates the vendor when a Customer goes silent after.

    Two shapes, one model, since revision 3. Under **A5** a visit occupies one `VisitPlanShare`,
    its fee is that share, and its slot is a real hold on the M1 availability grid. Under **A3**
    (and for a second look on A5) it is still the ad-hoc visit with a vendor-priced fee.
    """

    class Status(models.TextChoices):
        REQUESTED = "REQUESTED", "Requested"
        SCHEDULED = "SCHEDULED", "Scheduled"
        IN_PROGRESS = "IN_PROGRESS", "Vendor has arrived"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"
        VENDOR_NO_SHOW = "VENDOR_NO_SHOW", "Vendor did not arrive"
        CUSTOMER_NO_SHOW = "CUSTOMER_NO_SHOW", "Nobody was on site"

    #: Statuses in which a visit still occupies its plan share. A cancelled or no-show visit
    #: releases the share so a free replacement can be booked onto it.
    SHARE_HOLDING_STATUSES = (
        Status.REQUESTED,
        Status.SCHEDULED,
        Status.IN_PROGRESS,
        Status.COMPLETED,
    )

    class ArrivalMethod(models.TextChoices):
        """How arrival was proved. The non-OTP value is retained for historical records only."""

        NON_OTP_FALLBACK = "NON_OTP_FALLBACK", "Confirmed without an OTP"
        START_OTP = "START_OTP", "Confirmed with a start OTP"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    requirement = models.ForeignKey(
        "requirements.CustomerRequirement",
        on_delete=models.PROTECT,
        related_name="site_visits",
    )
    invitation = models.ForeignKey(
        "requirements.VendorInvitation",
        on_delete=models.PROTECT,
        related_name="site_visits",
    )
    #: Set for an A5 plan visit, null for the ad-hoc paid visit. A share holds at most one live
    #: visit, enforced below rather than by a `OneToOneField`, because a replacement visit has to
    #: be able to take the share a cancelled one gave back.
    plan_share = models.ForeignKey(
        VisitPlanShare,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="site_visits",
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.REQUESTED)
    fee_paise = models.PositiveBigIntegerField()
    #: Whether the fee comes off the final price if this vendor is chosen.
    adjusts_against_final_price = models.BooleanField(default=True)
    scheduled_for = models.DateTimeField(null=True, blank=True)
    #: How long the slot occupies the vendor on the shared grid. Stored because the reservation was
    #: written from it, and a reschedule has to reproduce the same width.
    duration_minutes = models.PositiveIntegerField(null=True, blank=True)
    arrival_confirmed_at = models.DateTimeField(null=True, blank=True)
    arrival_method = models.CharField(max_length=20, choices=ArrivalMethod.choices, blank=True)
    arrival_confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_visit_arrivals_confirmed",
    )
    completed_at = models.DateTimeField(null=True, blank=True)
    #: When a completed visit stops being allowed to produce an estimate. Business hours, from the
    #: variant's `post_visit_estimate_window_hours`; null when the owner has set no window.
    estimate_due_at = models.DateTimeField(null=True, blank=True)
    cancellation_reason_code = models.SlugField(max_length=80, blank=True)
    outcome_notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "id")
        constraints = [
            models.CheckConstraint(
                condition=~models.Q(status="SCHEDULED") | models.Q(scheduled_for__isnull=False),
                name="requirements_scheduled_visit_has_a_time",
            ),
            models.CheckConstraint(
                condition=~models.Q(status="COMPLETED") | models.Q(completed_at__isnull=False),
                name="requirements_completed_visit_has_a_timestamp",
            ),
            models.CheckConstraint(
                condition=~models.Q(status="IN_PROGRESS")
                | models.Q(arrival_confirmed_at__isnull=False),
                name="requirements_visit_in_progress_has_an_arrival",
            ),
            models.UniqueConstraint(
                fields=("plan_share",),
                condition=models.Q(plan_share__isnull=False)
                & models.Q(status__in=("REQUESTED", "SCHEDULED", "IN_PROGRESS", "COMPLETED")),
                name="requirements_one_live_visit_per_plan_share",
            ),
            # Partner reservations prevent one professional being in two places.
            # This is the Customer-side twin: two professionals on the same
            # project cannot claim the same visit start. Overlapping non-equal
            # starts are serialized and rejected by the requirement-row lock in
            # `confirm_visit_slot` / `reschedule_plan_visit`.
            models.UniqueConstraint(
                fields=("requirement", "scheduled_for"),
                condition=models.Q(plan_share__isnull=False, scheduled_for__isnull=False)
                & models.Q(status__in=("REQUESTED", "SCHEDULED", "IN_PROGRESS", "COMPLETED")),
                name="requirements_one_plan_visit_per_time",
            ),
        ]
        indexes = [
            models.Index(fields=("requirement", "status")),
            models.Index(fields=("status", "scheduled_for")),
            models.Index(fields=("status", "estimate_due_at")),
        ]

    def __str__(self) -> str:
        return f"{self.requirement_id}:{self.invitation_id}:{self.status}"


class ProposalSelection(models.Model):
    """The Customer chose a proposal; the vendor has not yet reconfirmed.

    Selection is not a booking. This row is the gap between the two, and it exists as its own
    record rather than as two timestamps on `Proposal` because the gap has a history: a vendor who
    declines or times out closes one selection, the Customer's unlock or visit-plan entitlement
    survives it, and the next selection is a new row against a different proposal.
    """

    class Status(models.TextChoices):
        PENDING_RECONFIRMATION = "PENDING_RECONFIRMATION", "Awaiting the vendor"
        CONFIRMED = "CONFIRMED", "Vendor reconfirmed"
        DECLINED = "DECLINED", "Vendor declined"
        EXPIRED = "EXPIRED", "Vendor did not answer in time"
        WITHDRAWN = "WITHDRAWN", "Customer withdrew the selection"

    #: Statuses that occupy the requirement's one selection slot.
    LIVE_STATUSES = (Status.PENDING_RECONFIRMATION, Status.CONFIRMED)

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    requirement = models.ForeignKey(
        "requirements.CustomerRequirement",
        on_delete=models.PROTECT,
        related_name="selections",
    )
    proposal = models.ForeignKey(
        "requirements.Proposal", on_delete=models.PROTECT, related_name="selections"
    )
    partner = models.ForeignKey(
        PartnerProfile,
        on_delete=models.PROTECT,
        related_name="requirement_selections",
    )
    status = models.CharField(
        max_length=24,
        choices=Status.choices,
        default=Status.PENDING_RECONFIRMATION,
    )
    #: Business hours, like every other M2 clock. Null when the area carries no operating windows.
    reconfirm_by = models.DateTimeField(null=True, blank=True)
    decided_at = models.DateTimeField(null=True, blank=True)
    decline_reason_code = models.SlugField(max_length=80, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "id")
        constraints = [
            # "Multiple simultaneous selections are not supported" as a database fact. The
            # multiple-lots allowance was withdrawn because it was an undefined branch in the most
            # safety-critical command in the system.
            models.UniqueConstraint(
                fields=("requirement",),
                condition=models.Q(status__in=("PENDING_RECONFIRMATION", "CONFIRMED")),
                name="requirements_one_live_selection_per_requirement",
            ),
        ]
        indexes = [
            models.Index(fields=("status", "reconfirm_by")),
        ]

    def __str__(self) -> str:
        return f"{self.requirement_id}:{self.proposal_id}:{self.status}"


class SiteVisitArrivalOtp(models.Model):
    """The code the Customer reads out and the vendor types in, to prove arrival.

    ## Why arrival needed proving at all

    `SiteVisit.arrival_confirmed_at` was written by whichever party tapped a button, from
    anywhere. The A5 visit plan is money the Customer has already paid for somebody to travel, and
    the visit is what earns the vendor their share of it — so "did they actually turn up" is a
    financial question, and a button either side can press from a sofa is not an answer to it.

    ## Why the Customer holds the code and the vendor enters it

    The code is issued to the Customer and displayed on their visit page; the vendor types it into
    the partner app. That direction is what makes it proof: the two people have to be in the same
    place for the code to move between them. Reversing it would prove the same thing, but M1's
    start OTP already runs this way (`apps.fulfilment.otp`), and one platform teaching two
    opposite habits for the same gesture is how a vendor ends up reading their code down a phone.

    ## Why this is its own model rather than `BookingOtp` reused

    `BookingOtp` is scoped to an M1 `Booking` by a non-null foreign key, and a site visit is a
    different aggregate on a different lifecycle. Widening it would make both nullable and put
    "which one is this" into every query. The shape is deliberately identical — hashed, expiring,
    single-use, attempt-limited — because that shape has already been through review once.

    The code itself is never stored. `code_hash` is a password hash, so a database read cannot
    tell a vendor what to type, and a leaked backup does not become a set of skeleton keys.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    site_visit = models.ForeignKey(
        SiteVisit,
        on_delete=models.PROTECT,
        related_name="arrival_otps",
    )
    code_hash = models.CharField(max_length=255)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)
    #: Who typed the accepted code. The vendor, on every live path — stored anyway, because
    #: "which account proved this arrival" is the first question asked about a disputed visit.
    consumed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_visit_arrival_otps_consumed",
    )
    failed_attempts = models.PositiveSmallIntegerField(default=0)
    max_attempts = models.PositiveSmallIntegerField(default=5)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at", "id")
        indexes = [models.Index(fields=("site_visit", "created_at"))]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(max_attempts__gt=0),
                name="requirements_visit_otp_attempts_positive",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.site_visit_id}:{self.created_at.isoformat()}"

    @property
    def is_consumed(self) -> bool:
        return self.consumed_at is not None

    @property
    def is_expired(self) -> bool:
        return self.expires_at <= timezone.now()

    @property
    def is_exhausted(self) -> bool:
        return self.failed_attempts >= self.max_attempts

    @property
    def is_live(self) -> bool:
        """Whether this code can still be entered. All three refusals, in one place."""

        return not (self.is_consumed or self.is_expired or self.is_exhausted)
