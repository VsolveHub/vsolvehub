"""Wave C2R / revision 4 (ADR-0009): the rate-card A3 front door and its one online charge.

`RateCard` is Operations' published per-city, per-skill day rate; `RateCardAcceptance` is a lead
agreeing to one; `RateCardBooking` is the purchase snapshot the cascade and the fee reconcile
against; `BookingFee` is the only money Vsolve collects on this path. Wage money has no column in
any of them, deliberately — what happens on the shift-day itself is in `workforce`.
"""

import uuid
from typing import Any, Final

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.locations.models import ServiceArea
from apps.partners.models import PartnerProfile

# ---------------------------------------------------------------------------
# Wave C2R / revision 4 (ADR-0009): the rate-card A3 front door.
#
# A3 stops being quote-first. Operations publishes a price per city and skill, the request is a
# preset, the offer cascade sends it to leads, and the only online charge is the booking fee. The
# wage money never touches this platform: it is paid direct, daily, at day end, and the tables
# below deliberately contain no column that could hold it.
#
# Three shapes, and each reuses a pattern that already exists rather than inventing one:
#
# * `RateCard` is `M2AccessPrice` for a per-city-per-skill day rate — effective-dated, superseded
#   rather than edited, fail-closed when nothing is published.
# * `RateCardBooking` is the purchase snapshot the whole cascade and the fee reconcile against,
#   the same job `QuoteUnlock.price_paise` and `VisitPlan.price_paise` do for their products.
# * `BookingFee` is the A3 mirror of `VisitPlan` on the same rails: one charge, `ACTIVE` only from
#   a verified provider callback, and a configured split when it forfeits.
# ---------------------------------------------------------------------------


class RateCard(models.Model):
    """Operations' published all-inclusive day rate for one city and one statutory skill.

    Effective-dated on the `M2AccessPrice` pattern: a rate is **loaded, never edited**, so a
    booking made last week still reconciles against the number it was made at, and raising a rate
    in wedding season is one insert. `07-state-machines-and-permissions.md` section 7 forbids
    Operations backdating a card under a live booking, and `rate_cards.publish_rate_card` enforces
    it.

    The three components are stored separately and the customer-facing rate is their sum, checked
    by a database constraint rather than by the command that writes it. That is what makes the
    disclosure honest in both directions: the lead's offer screen shows
    `worker_day_wage + supervision_margin` — what they actually receive per worker per day, paid
    directly by the Customer at day end — and the Customer's screen shows the whole number. Neither
    is derived from the other by a subtraction somebody could get wrong.

    **The wage component clears the statutory floor at publish**, through the same fail-closed
    `partners.assert_rate_meets_wage_floor` guard vendor quotes pass. The platform sets prices now,
    so it obeys the rule it enforces on everybody else.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    service_area = models.ForeignKey(
        ServiceArea,
        on_delete=models.PROTECT,
        related_name="m2_rate_cards",
    )
    #: The **statutory wage classification**, not the dispatch trade slug — the same key
    #: `M2VariantConfiguration.wage_floor_skill` carries and the same one `MinimumWageFloor` is
    #: loaded under. ADR-0009 names this reuse explicitly: a rate card needs exactly the key the
    #: wage floor already has, and a second skill notion would let a legal floor and a published
    #: price drift apart.
    skill = models.ForeignKey(
        "partners.Skill",
        on_delete=models.PROTECT,
        related_name="m2_rate_cards",
    )

    #: The three configured parts, per worker per standard day, in integer paise. The margin may
    #: be zero when the working lead is already paid inside the wage component.
    worker_day_wage_paise = models.PositiveBigIntegerField()
    supervision_margin_paise = models.PositiveBigIntegerField()
    #: Vsolve's revenue in A3 and the **only** money this platform collects on the rate-card path.
    #: Per worker-day because it is one of three parts of a per-worker-day price; the booking fee
    #: actually charged is this component over the whole booking, taken once.
    booking_fee_paise = models.PositiveBigIntegerField()
    #: Their sum, stored so the published number is a column rather than an expression every
    #: reader has to recompute, and constrained so the two can never disagree.
    customer_day_rate_paise = models.PositiveBigIntegerField()

    #: What counts as a day, and when overtime starts. No default: "eight hours" is ADR-0009's
    #: product definition, but the card is what a Customer and a lead are held to, so Operations
    #: publishes it rather than inheriting it from a constant that could change under live work.
    standard_day_hours = models.PositiveSmallIntegerField()
    #: The published overtime rate per worker per hour beyond `standard_day_hours`. Overtime counts
    #: only after the Customer's one-tap approval (`M2-BE-531`); this is what it costs when it does.
    overtime_hourly_paise = models.PositiveBigIntegerField()
    #: Published add-on rates, keyed by add-on code. Any genuine extra is a scope amendment at
    #: these numbers, which is what leaves the on-site renegotiation nowhere to live.
    add_on_rates = models.JSONField(default=dict, blank=True)
    #: The printed inclusion list: what the preset's scope covers, in the Customer's words. A list
    #: of strings, shown before booking and frozen onto the booking.
    inclusions = models.JSONField(default=list, blank=True)

    effective_from = models.DateField()
    #: Where the number came from — the phone survey, the gazette, the review meeting. On a real
    #: card this is the citation; on a seeded one it carries the dev-seed marker.
    source_reference = models.CharField(max_length=200, blank=True)
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="m2_rate_cards_published",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("service_area", "skill", "-effective_from")
        constraints = [
            models.UniqueConstraint(
                fields=("service_area", "skill", "effective_from"),
                name="requirements_unique_rate_card_version",
            ),
            models.CheckConstraint(
                condition=models.Q(worker_day_wage_paise__gt=0)
                & models.Q(supervision_margin_paise__gte=0)
                & models.Q(booking_fee_paise__gt=0),
                name="requirements_rate_card_components_positive",
            ),
            # The disclosure invariant. A card whose parts do not add to its published price is a
            # card that tells the lead and the Customer two different stories about the same job.
            models.CheckConstraint(
                condition=models.Q(
                    customer_day_rate_paise=models.F("worker_day_wage_paise")
                    + models.F("supervision_margin_paise")
                    + models.F("booking_fee_paise")
                ),
                name="requirements_rate_card_components_reconcile",
            ),
            models.CheckConstraint(
                condition=models.Q(standard_day_hours__gt=0) & models.Q(standard_day_hours__lte=24),
                name="requirements_rate_card_day_within_a_day",
            ),
            models.CheckConstraint(
                condition=models.Q(overtime_hourly_paise__gt=0),
                name="requirements_rate_card_overtime_positive",
            ),
        ]
        indexes = [
            models.Index(fields=("service_area", "skill", "effective_from")),
        ]

    def __str__(self) -> str:
        return f"{self.service_area_id}:{self.skill_id}:{self.customer_day_rate_paise}"

    @property
    def lead_day_receipt_paise(self) -> int:
        """What the lead receives per worker per day, paid directly by the Customer at day end.

        The number on the offer screen. ADR-0009 requires it to be the vendor's *own* number
        rather than the Customer's, because accepting a job is accepting that rate for that job.
        """
        return self.worker_day_wage_paise + self.supervision_margin_paise


class RateCardAcceptance(models.Model):
    """A lead accepted a published rate card as part of their A3 capability (`M2-BE-435`).

    Append-only. ADR-0009: "accepting the rate card is part of A3 capability approval", and an
    acceptance that could be edited afterwards would be worth nothing in the argument it exists to
    settle — whether this vendor agreed to this number before they took work at it.

    Recorded per `(capability, rate_card)` rather than per Partner, because a card is superseded
    every time a rate moves and the question is always "which card did they agree to".
    """

    class Source(models.TextChoices):
        CAPABILITY_APPROVAL = "CAPABILITY_APPROVAL", "Recorded when the capability was approved"
        OFFER_ACCEPT = "OFFER_ACCEPT", "Recorded when a job at this rate was accepted"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.ForeignKey(
        PartnerProfile,
        on_delete=models.PROTECT,
        related_name="m2_rate_card_acceptances",
    )
    capability = models.ForeignKey(
        "partners.PartnerCapability",
        on_delete=models.PROTECT,
        related_name="m2_rate_card_acceptances",
    )
    rate_card = models.ForeignKey(
        RateCard,
        on_delete=models.PROTECT,
        related_name="acceptances",
    )
    source = models.CharField(max_length=24, choices=Source.choices)
    #: The lead's own number at the moment they agreed to it, frozen. The card is the authority on
    #: what was published; this is the authority on what they were shown.
    lead_day_receipt_paise = models.PositiveBigIntegerField()
    accepted_at = models.DateTimeField(default=timezone.now)
    accepted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="m2_rate_card_acceptances",
    )

    class Meta:
        ordering = ("-accepted_at", "id")
        constraints = [
            models.UniqueConstraint(
                fields=("capability", "rate_card"),
                name="requirements_unique_rate_card_acceptance",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.capability_id}:{self.rate_card_id}"

    def save(self, *args: Any, **kwargs: Any) -> None:
        """Refuse any write that is not the original insert.

        The same rule `assignments.DispatchCommandAudit` applies for the same reason: consent
        evidence that can be edited is not evidence.
        """
        if not self._state.adding:
            raise ValueError("A rate-card acceptance is immutable.")
        super().save(*args, **kwargs)


class RateCardBooking(models.Model):
    """One A3 request booked at a published rate, and the arithmetic it was booked at.

    Created by `book_at_published_rate` in the same transaction that submits the requirement, so
    there is no window in which an A3 requirement is matching with no published price behind it.
    Every number is snapshotted from the card: a rate loaded tomorrow does not move a booking made
    today, which is the whole reason cards are effective-dated rather than edited.

    The three money columns reconcile in integer paise:
    `total_customer_paise = lead_receipt_paise + booking_fee_paise`, and the constraint below says
    so. `lead_receipt_paise` is **peer-to-peer money this platform never holds** — it is recorded
    because the daily settlement, the evidence pack and the UPI deep-link all need the exact
    published amount, not because Vsolve is a party to it.
    """

    class Status(models.TextChoices):
        MATCHING = "MATCHING", "Looking for a crew"
        #: A lead accepted and is holding the job while the Customer pays the booking fee.
        OFFER_HELD = "OFFER_HELD", "A lead is holding this job"
        CONFIRMED = "CONFIRMED", "Crew confirmed and the booking fee is paid"
        #: The cascade ran out of reach and **is waiting for the Customer to say what next**.
        #: Distinct from `FELL_BACK` on purpose: this state changes nothing about the request, and
        #: the three ways out of it — search wider, take quotes instead, cancel — are the
        #: Customer's to choose. Nothing was charged, because on this path nothing can be before
        #: `OFFER_HELD`.
        EXHAUSTED = "EXHAUSTED", "No crew accepted"
        #: The requirement is now on the quote flow and nothing was charged. Reached by the
        #: Customer choosing it from `EXHAUSTED`, no longer automatically.
        FELL_BACK = "FELL_BACK", "Fell back to the quote flow"
        CANCELLED = "CANCELLED", "Cancelled"

    #: Statuses in which the cascade may still send offers. `EXHAUSTED` is deliberately absent: a
    #: parked booking must not widen on its own, and slot accounting reverts to the quote flow's
    #: rules the moment it stops being a live crew job (`matching._slot_holding_statuses`).
    DISPATCHABLE_STATUSES = (Status.MATCHING, Status.OFFER_HELD)

    #: Statuses from which the Customer's three recovery commands may run.
    RECOVERABLE_STATUSES = (Status.EXHAUSTED,)

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    requirement = models.OneToOneField(
        "requirements.CustomerRequirement",
        on_delete=models.PROTECT,
        related_name="rate_card_booking",
    )
    rate_card = models.ForeignKey(RateCard, on_delete=models.PROTECT, related_name="bookings")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.MATCHING)

    headcount = models.PositiveSmallIntegerField()
    days = models.PositiveSmallIntegerField()

    #: The card's three components and its published terms, frozen at booking.
    day_rate_paise = models.PositiveBigIntegerField()
    worker_day_wage_paise = models.PositiveBigIntegerField()
    supervision_margin_paise = models.PositiveBigIntegerField()
    booking_fee_component_paise = models.PositiveBigIntegerField()
    standard_day_hours = models.PositiveSmallIntegerField()
    overtime_hourly_paise = models.PositiveBigIntegerField()
    add_on_rates = models.JSONField(default=dict, blank=True)
    inclusions = models.JSONField(default=list, blank=True)

    #: The whole job at the published rate, and how it splits.
    total_customer_paise = models.PositiveBigIntegerField()
    #: Paid direct, daily, at day end. Never held by Vsolve.
    lead_receipt_paise = models.PositiveBigIntegerField()
    #: The one online charge. `booking_fee_component_paise * headcount * days`.
    booking_fee_paise = models.PositiveBigIntegerField()

    #: How many cascade waves have gone out, and the offer currently holding the job.
    wave = models.PositiveSmallIntegerField(default=0)
    accepted_invitation = models.OneToOneField(
        "requirements.VendorInvitation",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="rate_card_booking",
    )
    #: When the holding offer stops holding. A Customer who never pays lets it lapse harmlessly and
    #: the next offer or wave proceeds — `07-state-machines-and-permissions.md` section 4c.
    hold_expires_at = models.DateTimeField(null=True, blank=True)
    fallback_reason_code = models.SlugField(max_length=80, blank=True)
    fell_back_at = models.DateTimeField(null=True, blank=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)

    # --- Exhaustion and the Customer's recovery. -----------------------------------------------
    #
    # The cascade used to hand an unmet job straight to the quote flow, which changed what the
    # Customer had bought into without asking them. It now parks here and waits.

    #: When the cascade ran out of reach. Null on a booking that has never been parked — including
    #: one parked and then retried, which clears it, because it is a live cascade again.
    exhausted_at = models.DateTimeField(null=True, blank=True)
    #: Why it ran out: `cascade_exhausted` (the widening steps are spent) or `no_eligible_leads`
    #: (nobody in reach at this width). Two different conversations for support to have.
    exhaustion_reason_code = models.SlugField(max_length=80, blank=True)
    #: How many times the Customer has asked for a wider search. Bounds the retry so a request
    #: cannot loop the cascade forever, and records that they kept trying.
    retry_count = models.PositiveSmallIntegerField(default=0)

    # --- Wave C6 (`M2-BE-719`): the free re-dispatch entitlement. ------------------------------
    #
    # `07-state-machines-and-permissions.md` §4c promises a vendor no-show "refunds in full (free
    # re-dispatch)". The refund was built in C2R; the entitlement had nowhere to live, so the
    # second half of the promise was unreachable — a replacement lead could accept the re-offered
    # job and then had to be asked for the money again, which is not free.
    #
    # Two timestamps rather than a boolean, because "was owed one" and "has used it" are different
    # facts and a support conversation needs both. `redispatch_count` is kept beside them so a
    # requirement that has burned three crews is visible without walking the standing events.

    #: When a vendor no-show granted this booking a replacement crew at no charge. Null on a
    #: booking that has never had one.
    free_redispatch_entitled_at = models.DateTimeField(null=True, blank=True)
    #: When a replacement lead's acceptance used it. Null while the entitlement is live.
    free_redispatch_consumed_at = models.DateTimeField(null=True, blank=True)
    #: How many times this booking has gone back through the cascade after a vendor no-show.
    redispatch_count = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "id")
        constraints = [
            models.CheckConstraint(
                condition=models.Q(headcount__gt=0) & models.Q(days__gt=0),
                name="requirements_rate_card_booking_size_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(
                    total_customer_paise=models.F("lead_receipt_paise")
                    + models.F("booking_fee_paise")
                ),
                name="requirements_rate_card_booking_reconciles",
            ),
            models.CheckConstraint(
                condition=~models.Q(status="CONFIRMED") | models.Q(confirmed_at__isnull=False),
                name="requirements_confirmed_booking_has_a_timestamp",
            ),
            # An entitlement cannot be spent before it is granted. Two nullable timestamps, so
            # nothing is enumerated and there is no list here to drift.
            models.CheckConstraint(
                condition=models.Q(free_redispatch_consumed_at__isnull=True)
                | models.Q(free_redispatch_entitled_at__isnull=False),
                name="requirements_consumed_redispatch_was_granted",
            ),
        ]
        indexes = [
            models.Index(fields=("status", "hold_expires_at")),
            models.Index(fields=("rate_card", "status")),
        ]

    def __str__(self) -> str:
        return f"{self.requirement_id}:{self.headcount}x{self.days}:{self.status}"

    @property
    def lead_day_receipt_paise(self) -> int:
        """What the lead receives per day for the whole requested crew. The offer's headline."""
        return (self.worker_day_wage_paise + self.supervision_margin_paise) * self.headcount


#: The booking-fee statuses that do **not** occupy the one-live-fee slot.
#:
#: `FAILED` never did — a failed attempt must not block a retry. Wave C6 adds `REFUNDED` for the
#: same class of reason: a fee refunded in full is settled history rather than a live charge, and
#: leaving it holding the slot is exactly what made the free re-dispatch unreachable (a
#: replacement lead's acceptance had nowhere to write a fee row, so the checkout refused and the
#: only engagement-opening path never ran).
#:
#: Module scope, and the class attribute is bound to the same object rather than retyped, for the
#: reason `DELAY_CLAIM_UNDECIDED_STATUSES` records: a nested `Meta` body cannot see its enclosing
#: class's namespace, so a constraint that wants a status list either reads one from out here or
#: hand-copies it — and the hand-copied one drifts invisibly to `makemigrations --check`. The
#: pre-C6 constraint hand-copied a one-element list; this is the moment that list grew.
BOOKING_FEE_NON_BLOCKING_STATUSES: Final[tuple[str, ...]] = ("FAILED", "REFUNDED")


class BookingFee(models.Model):
    """A3 rate-card only. The commitment device, and Vsolve's only revenue on this path.

    `07-state-machines-and-permissions.md` section 4c, exactly::

        OFFER_ACCEPTED -> PENDING -> ACTIVE -> EARNED | FORFEIT_SPLIT | REFUNDED | FAILED

    `ACTIVE` is reachable **only** from a verified provider callback, and that same callback
    creates the engagement — the A3 mirror of `VisitPlan`, on the same rails. `EARNED` at first-day
    crew arrival. `FORFEIT_SPLIT` pays the lead a configured travel-compensation share through the
    M1 payout rails and books the remainder as the platform share, reconciling in integer paise as
    `amount = travel compensation + platform share`. A **vendor** no-show refunds the whole fee and
    pays no travel compensation — neither party earns from an undelivered crew.
    """

    class Status(models.TextChoices):
        OFFER_ACCEPTED = "OFFER_ACCEPTED", "A lead accepted; the Customer has not paid yet"
        PENDING = "PENDING", "Awaiting the provider"
        ACTIVE = "ACTIVE", "Paid; the crew is confirmed"
        EARNED = "EARNED", "The crew arrived on day one"
        FORFEIT_SPLIT = "FORFEIT_SPLIT", "Forfeited and split with the lead"
        REFUNDED = "REFUNDED", "Refunded in full"
        FAILED = "FAILED", "Payment failed"

        # Wave C6 (`M2-BE-719`). The free re-dispatch's own state, and the reason it had to exist
        # is structural rather than cosmetic: after a vendor no-show the fee is `REFUNDED`, and
        # `07-state-machines-and-permissions.md` §1 then promises the Customer "a free
        # re-dispatch" — a replacement crew at **no second charge**. There is no charge to
        # represent that with, so before this state the replacement lead's acceptance had nowhere
        # to go: `create_booking_fee_checkout` refused ("this booking fee is already settled") and
        # `complete_booking_fee`, the only path that opens an engagement, never ran.
        #
        # `WAIVED` records the confirmation without the money: the amount stays the published fee
        # (what it *would* have cost), nothing is collected, nothing is payable, and it is
        # deliberately **not** in `CHARGED_STATUSES`, so no reconciliation counts it as revenue.
        WAIVED = "WAIVED", "Confirmed at no charge under a free re-dispatch"

    #: Statuses in which the Customer's money has actually been collected. `WAIVED` is absent on
    #: purpose: a re-dispatched booking collected nothing the second time.
    CHARGED_STATUSES = (Status.ACTIVE, Status.EARNED, Status.FORFEIT_SPLIT)
    #: Statuses in which nothing further can happen to this fee.
    SETTLED_STATUSES = (
        Status.EARNED,
        Status.FORFEIT_SPLIT,
        Status.REFUNDED,
        Status.FAILED,
        Status.WAIVED,
    )
    #: Bound from module scope so the constraint below, `live_booking_fee` and `_locked_fee` are
    #: reading one list rather than three copies of it.
    NON_BLOCKING_STATUSES = BOOKING_FEE_NON_BLOCKING_STATUSES

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking = models.ForeignKey(
        RateCardBooking,
        on_delete=models.PROTECT,
        related_name="booking_fees",
    )
    #: Denormalised so ownership of a checkout-free `PaymentAttempt` resolves in one query, the
    #: same job `QuoteUnlock.requirement` does for `commerce._standalone_attempt_belongs_to`.
    requirement = models.ForeignKey(
        "requirements.CustomerRequirement",
        on_delete=models.PROTECT,
        related_name="booking_fees",
    )
    #: The accepted crew offer this fee confirms. The fee cannot exist without one — that is what
    #: `m2_booking_fee_not_chargeable` protects.
    invitation = models.ForeignKey(
        "requirements.VendorInvitation",
        on_delete=models.PROTECT,
        related_name="booking_fees",
    )
    rate_card = models.ForeignKey(RateCard, on_delete=models.PROTECT, related_name="booking_fees")
    amount_paise = models.PositiveBigIntegerField()
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.OFFER_ACCEPTED)

    #: The forfeit split, both zero until `FORFEIT_SPLIT`. Stored rather than recomputed because
    #: the split percentage is effective-dated policy and a settled fee must reconcile against the
    #: percentage it was settled at.
    travel_compensation_paise = models.PositiveBigIntegerField(default=0)
    platform_share_paise = models.PositiveBigIntegerField(default=0)

    payment_attempt = models.ForeignKey(
        "commerce.PaymentAttempt",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_booking_fees",
    )
    refund = models.ForeignKey(
        "commerce.Refund",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_booking_fees",
    )
    #: The lead's travel compensation as an M1 ledger earning. Written even when the vendor has no
    #: payout account, `PENDING` — they earned it, they simply cannot be paid it yet.
    ledger_entry = models.ForeignKey(
        "payouts.PartnerLedgerEntry",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_booking_fees",
    )
    receipt_series = models.CharField(max_length=24, blank=True)
    receipt_sequence = models.PositiveBigIntegerField(null=True, blank=True)
    activated_at = models.DateTimeField(null=True, blank=True)
    earned_at = models.DateTimeField(null=True, blank=True)
    settled_at = models.DateTimeField(null=True, blank=True)
    settlement_reason_code = models.SlugField(max_length=80, blank=True)
    failure_code = models.SlugField(max_length=80, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "id")
        constraints = [
            # One live fee per booking, scoped to the statuses that still mean something. A failed
            # attempt must not block a retry, and neither must a refunded one block the free
            # re-dispatch it is the precondition for. This is still what makes "exactly one charge
            # per booking under duplicate webhooks" a database fact rather than a code convention:
            # `OFFER_ACCEPTED`, `PENDING`, `ACTIVE`, `EARNED`, `FORFEIT_SPLIT` and `WAIVED` all
            # occupy the slot, so at most one chargeable fee can exist at a time.
            models.UniqueConstraint(
                fields=("booking",),
                condition=~models.Q(status__in=BOOKING_FEE_NON_BLOCKING_STATUSES),
                name="requirements_one_live_booking_fee",
            ),
            models.CheckConstraint(
                condition=models.Q(amount_paise__gt=0),
                name="requirements_booking_fee_positive",
            ),
            models.CheckConstraint(
                condition=~models.Q(status="ACTIVE") | models.Q(activated_at__isnull=False),
                name="requirements_active_booking_fee_has_a_timestamp",
            ),
            # The forfeit reconciliation, where the database can refuse a violation rather than a
            # report noticing one a month later.
            models.CheckConstraint(
                condition=~models.Q(status="FORFEIT_SPLIT")
                | models.Q(
                    amount_paise=models.F("travel_compensation_paise")
                    + models.F("platform_share_paise")
                ),
                name="requirements_forfeit_split_reconciles",
            ),
        ]
        indexes = [
            models.Index(fields=("requirement", "status")),
            models.Index(fields=("status", "created_at")),
        ]

    def __str__(self) -> str:
        return f"{self.booking_id}:{self.amount_paise}:{self.status}"
