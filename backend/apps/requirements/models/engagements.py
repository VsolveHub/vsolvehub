"""The engagement spine: the agreement, and the stages its money moves through.

`Engagement` is the frozen agreement both archetypes become, carrying the money envelope as
maintained columns so `M2-BE-504` can be a database constraint; `EngagementStage` is one shift-day
(A3) or one milestone (A5) with the same bounds per row. The records written *against* the spine —
events, evidence, amendments — are in `evidence`, and the A5 project's own tables in `projects`.
"""

import uuid
from typing import Any

from django.conf import settings
from django.db import models

from apps.partners.models import PartnerProfile


class Engagement(models.Model):
    """One agreement, both archetypes. Created only after the vendor reconfirms.

    The commercial mode is **fixed by archetype** and copied here rather than configured: A3 is
    `LEAD_ONLY` (the Customer pays the vendor directly and Vsolve's revenue is the unlock fee), A5
    is `MANAGED_PAYMENT_REQUIRED` (staged funding through Vsolve). Neither the vendor nor
    Operations can change it on a live engagement, which is why it is a stored, frozen term.

    C2 creates this aggregate and freezes its terms. The stage command spine — evidence, approval,
    correction, dispute, release — is Wave C3 and deliberately absent here.
    """

    class CommercialMode(models.TextChoices):
        LEAD_ONLY = "LEAD_ONLY", "Customer pays the vendor directly"
        MANAGED_PAYMENT_REQUIRED = "MANAGED_PAYMENT_REQUIRED", "Paid through Vsolve"

    class Status(models.TextChoices):
        PENDING_START = "PENDING_START", "Pending start"
        ACTIVE = "ACTIVE", "Active"
        COMPLETING = "COMPLETING", "Completing"
        COMPLETED = "COMPLETED", "Completed"
        WARRANTY = "WARRANTY", "In warranty"
        CLOSED = "CLOSED", "Closed"
        DISPUTED = "DISPUTED", "Disputed"
        CANCELLED = "CANCELLED", "Cancelled"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    requirement = models.OneToOneField(
        "requirements.CustomerRequirement",
        on_delete=models.PROTECT,
        related_name="engagement",
    )
    #: Null on the **rate-card A3 path** (revision 4, ADR-0009). There is no proposal and no
    #: selection there: the first accepting lead is the crew and the verified booking fee is the
    #: confirmation, so `07-state-machines-and-permissions.md` §1 never passes such a requirement
    #: through `QUOTES_READY`, `UNLOCKED` or `SELECTED`. Nullable rather than fabricated — a
    #: synthetic `Proposal` row would put a quote nobody wrote into the table a dispute reads.
    #: The same shape C3 gave `fulfilment.ScopeAmendment.booking`, for the same reason.
    selection = models.OneToOneField(
        "requirements.ProposalSelection",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="engagement",
    )
    proposal = models.ForeignKey(
        "requirements.Proposal",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="engagements",
    )
    partner = models.ForeignKey(
        PartnerProfile, on_delete=models.PROTECT, related_name="engagements"
    )
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="m2_engagements",
    )
    archetype = models.CharField(max_length=24)
    commercial_mode = models.CharField(max_length=24, choices=CommercialMode.choices)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING_START)

    #: Frozen from the selected proposal. A later supersession cannot move an agreed price, and
    #: neither can an amendment: an accepted amendment moves `amendment_delta_paise`, so the
    #: number both parties originally agreed to stays readable next to the number they now owe.
    total_paise = models.PositiveBigIntegerField()
    tax_paise = models.PositiveBigIntegerField(default=0)
    tax_basis = models.CharField(max_length=12)
    #: Server-calculated, never client-supplied. Zero for `LEAD_ONLY`: Vsolve does not collect the
    #: A3 service payment, so recording a commission against it would book revenue that does not
    #: exist.
    commission_paise = models.PositiveBigIntegerField(default=0)
    commission_treatment = models.CharField(max_length=24, blank=True)
    #: The whole proposal as it stood at reconfirmation, so a dispute years later reads the terms
    #: both parties actually agreed to rather than the current row.
    terms_snapshot = models.JSONField(default=dict)

    # --- Wave C3: the money envelope, as columns so it can be a database constraint -----------
    #
    # `M2-BE-504` asks that stage amounts reconcile to the engagement total and that funded,
    # approved, paid and refunded amounts cannot exceed their legal bounds — **as database
    # constraints, not only as application validation**. A sum across stage rows cannot be a
    # row-level `CHECK`, so the sums live here as maintained columns and the reconciliation
    # becomes a check between two columns of one row. Every writer updates them with `F()`
    # arithmetic inside the transaction that moved the stage, so two concurrent approvals add
    # rather than overwrite.

    #: Σ of this engagement's stage amounts. Equal to `total_paise + amendment_delta_paise` by
    #: constraint — which is the reconciliation `M2-BE-504` names, expressed where the database
    #: can refuse a violation instead of a report noticing one.
    staged_total_paise = models.PositiveBigIntegerField(default=0)
    #: Net of every **authorized** amendment, signed. Positive for extra work, negative for scope
    #: taken out. `total_paise` never moves; this is what moved.
    amendment_delta_paise = models.BigIntegerField(default=0)
    funded_total_paise = models.PositiveBigIntegerField(default=0)
    approved_total_paise = models.PositiveBigIntegerField(default=0)
    released_total_paise = models.PositiveBigIntegerField(default=0)
    refunded_total_paise = models.PositiveBigIntegerField(default=0)

    # --- Wave C5: warranty retention and the handover (`M2-BE-546`, `547`, `548`) -------------
    #
    # Retention is **payout-side money, not Customer money**. The Customer funds every stage at
    # face value exactly as before; what retention changes is how much of an approved stage the
    # vendor may draw before the warranty period is over. That is why it sits beside the six
    # columns above rather than inside them: none of the `M2-BE-504` bounds involve it, and
    # subtracting it from `released_total_paise` would make the Customer's ledger disagree with
    # what they actually paid.

    #: Frozen at engagement creation from the variant's configured percentage, and zero when the
    #: estimate advertised no warranty. Zero on every `LEAD_ONLY` engagement by constraint: Vsolve
    #: never collects an A3 service payment, so there is no payout to hold anything back out of.
    retention_paise = models.PositiveBigIntegerField(default=0)
    #: How much of `retention_paise` has actually been withheld so far, accumulated as stages are
    #: approved. It reaches `retention_paise` exactly when the last stage is approved — see
    #: `stages._stage_retention_paise` for why it is allocated against the cumulative total rather
    #: than against "the final stage", which stops being knowable the moment an amendment appends
    #: one.
    retention_withheld_paise = models.PositiveBigIntegerField(default=0)
    #: The single ledger entry that pays the whole withheld amount when the warranty window closes.
    #: Null until then; null forever on an engagement that withheld nothing.
    retention_ledger_entry = models.ForeignKey(
        "payouts.PartnerLedgerEntry",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_retention_engagements",
    )
    #: When the warranty period ends. Stamped at `COMPLETED → WARRANTY` from the variant's
    #: configured window; null on an engagement with no warranty, which is why `CLOSED` is
    #: reachable only through `WARRANTY` and `COMPLETED` is terminal without one.
    warranty_ends_at = models.DateTimeField(null=True, blank=True)
    #: `M2-BE-547`. The vendor hands over digital deliverables and the Customer accepts them.
    #: `accept_engagement_completion` refuses while a submitted handover is unaccepted, which is
    #: the whole mechanism: Event and Media delivery cannot be finished off-platform without the
    #: Customer simply declining to close the engagement.
    handover_submitted_at = models.DateTimeField(null=True, blank=True)
    handover_accepted_at = models.DateTimeField(null=True, blank=True)
    handover_note = models.TextField(blank=True)

    #: When the counterparties may see each other's contact details, and when work may begin. A3
    #: releases both at creation — a connection *is* the product. A5 releases both only once the
    #: first stage is funded, because managed work that starts unfunded has no protection behind
    #: it.
    contact_released_at = models.DateTimeField(null=True, blank=True)
    work_may_start_at = models.DateTimeField(null=True, blank=True)
    disputed_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    #: Terms frozen at reconfirmation. Written once, at creation, and refused afterwards by
    #: `save()` — `M2-BE-508` in the one place no caller can route around.
    FROZEN_TERM_FIELDS = (
        "archetype",
        "commercial_mode",
        "total_paise",
        "tax_paise",
        "tax_basis",
        "commission_paise",
        "commission_treatment",
        "terms_snapshot",
    )

    class Meta:
        ordering = ("-created_at", "id")
        constraints = [
            models.CheckConstraint(
                condition=models.Q(total_paise__gt=0),
                name="requirements_engagement_total_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(tax_paise__lte=models.F("total_paise")),
                name="requirements_engagement_tax_within_total",
            ),
            models.CheckConstraint(
                condition=models.Q(commission_paise__lte=models.F("total_paise")),
                name="requirements_engagement_commission_within_total",
            ),
            # `LEAD_ONLY` earns no commission, by product rule rather than by configuration.
            models.CheckConstraint(
                condition=~models.Q(commercial_mode="LEAD_ONLY") | models.Q(commission_paise=0),
                name="requirements_lead_only_engagement_has_no_commission",
            ),
            # `M2-BE-504`, the reconciliation itself. The stages are the agreement: their amounts
            # add to the agreed total plus whatever amendments both parties authorized, and
            # nothing else. A stage created without moving the delta, or an amendment applied
            # without creating a stage, is refused by the database rather than discovered in a
            # month of unexplained variance.
            models.CheckConstraint(
                condition=models.Q(
                    staged_total_paise=models.F("total_paise") + models.F("amendment_delta_paise")
                ),
                name="requirements_engagement_stages_reconcile_to_total",
            ),
            # **Vsolve never holds more of a Customer's money than there is agreed work.** The
            # live exposure is what was collected less what has been given back, and it is bounded
            # by the staged scope — which is what makes a scope reduction sound: the refund runs
            # first, then the scope shrinks, and this holds at both steps.
            models.CheckConstraint(
                condition=models.Q(
                    funded_total_paise__lte=models.F("staged_total_paise")
                    + models.F("refunded_total_paise")
                ),
                name="requirements_engagement_exposure_within_scope",
            ),
            models.CheckConstraint(
                condition=models.Q(refunded_total_paise__lte=models.F("funded_total_paise")),
                name="requirements_engagement_refund_within_funding",
            ),
            models.CheckConstraint(
                condition=models.Q(approved_total_paise__lte=models.F("staged_total_paise")),
                name="requirements_engagement_approved_within_scope",
            ),
            models.CheckConstraint(
                condition=models.Q(released_total_paise__lte=models.F("approved_total_paise")),
                name="requirements_engagement_released_within_approved",
            ),
            # Wave C5. Retention is bounded by the agreed total rather than by `staged_total`,
            # because it is frozen at creation from a total that never moves — an amendment that
            # shrinks the staged scope must not retroactively make an already-frozen hold-back
            # illegal.
            models.CheckConstraint(
                condition=models.Q(retention_paise__lte=models.F("total_paise")),
                name="requirements_engagement_retention_within_total",
            ),
            models.CheckConstraint(
                condition=models.Q(
                    retention_withheld_paise__lte=models.F("retention_paise"),
                ),
                name="requirements_engagement_withheld_within_retention",
            ),
            # `LEAD_ONLY` holds nothing back, for the same reason it books no commission: Vsolve
            # never collects the A3 service payment, so there is no payout to retain out of.
            models.CheckConstraint(
                condition=~models.Q(commercial_mode="LEAD_ONLY") | models.Q(retention_paise=0),
                name="requirements_lead_only_engagement_has_no_retention",
            ),
        ]
        indexes = [
            models.Index(fields=("partner", "status")),
            models.Index(fields=("customer", "status")),
        ]

    def __str__(self) -> str:
        return f"{self.requirement_id}:{self.commercial_mode}:{self.status}"

    def save(self, *args: Any, **kwargs: Any) -> None:
        """Frozen commercial terms are frozen (`M2-BE-508`).

        The rule "no scope, amount or completion change through clarification, callback or any
        unilateral UI action" is only worth as much as the narrowest place it is enforced. A
        service that forgets it is a bug; a model that permits it is an invitation. Following
        `payouts.PartnerLedgerEntry.save`, which refuses the same class of edit for the same
        reason: this is the table where "someone will remember not to" is not good enough.

        An amendment moves `amendment_delta_paise` and `staged_total_paise`, never these eight.
        """
        if not self._state.adding:
            update_fields = set(kwargs.get("update_fields") or ())
            frozen = update_fields.intersection(self.FROZEN_TERM_FIELDS)
            if frozen or not update_fields:
                raise ValueError(
                    "An engagement's agreed terms are frozen at reconfirmation. Change scope or "
                    "price through an accepted scope amendment, never by writing the engagement."
                )
        super().save(*args, **kwargs)


class EngagementStage(models.Model):
    """One shift-day (A3) or one milestone (A5), with the same money semantics either way.

    A5 stages fund **at face value**. There is no stage credit: the visit-plan money was spent on
    the visits themselves and settles per share, so discounting a stage by it would pay for the
    visits twice.
    """

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        IN_PROGRESS = "IN_PROGRESS", "In progress"
        AWAITING_REVIEW = "AWAITING_REVIEW", "Awaiting review"
        APPROVED = "APPROVED", "Approved"
        CORRECTION_REQUESTED = "CORRECTION_REQUESTED", "Correction requested"
        DISPUTED = "DISPUTED", "Disputed"
        RELEASED = "RELEASED", "Released"
        #: Wave C5. This stage is no longer part of the live agreement, because a recovery took it
        #: out: the vendor abandoned the project and the remaining work moved to somebody else
        #: (`M2-BE-545`), or the project ended early (`M2-BE-543`). **Reachable only from
        #: `apps.requirements.projects`** — no Customer or vendor command produces it, because
        #: "this work is not happening" is a decision with money behind it and not a status
        #: somebody taps their way into.
        #:
        #: A cancelled stage keeps its `amount_paise` and its funding history. Zeroing it would
        #: erase what was agreed and what was collected, which is exactly what a dispute reads.
        CANCELLED = "CANCELLED", "Cancelled by a recovery"

    class FundingState(models.TextChoices):
        NOT_REQUIRED = "NOT_REQUIRED", "Not required"
        REQUIRED = "REQUIRED", "Funding required"
        PENDING = "PENDING", "Awaiting the provider"
        FUNDED = "FUNDED", "Funded"

    class Kind(models.TextChoices):
        """What this row's money buys, and therefore how it can be recovered (`M2-BE-543`).

        There is still exactly **one** money spine — a second table for materials would be the
        duplication this plan forbids — but "a milestone of work" and "an advance against
        materials" are not the same promise and cannot share a recovery rule. `README.md`:
        *material money is spent, not earned, so it cannot be recovered like an unearned work
        stage when a project ends early.* Without this column that sentence has nothing to read,
        and `route_suspended_capability_engagements` would refund a Customer for cement the
        vendor has already bought.
        """

        WORK = "WORK", "Work"
        MATERIAL_ADVANCE = "MATERIAL_ADVANCE", "Material advance"

    #: Statuses in which the vendor still owes work on this stage. `CANCELLED` is deliberately
    #: absent: a cancelled stage owes nothing, which is what lets the completion check, the
    #: suspension sweep and the transfer all skip it without each holding its own exclusion list.
    OPEN_STATUSES = (
        Status.PENDING,
        Status.IN_PROGRESS,
        Status.AWAITING_REVIEW,
        Status.CORRECTION_REQUESTED,
        Status.DISPUTED,
    )
    #: Statuses in which the money for this stage is decided.
    SETTLED_STATUSES = (Status.RELEASED,)
    #: Statuses a recovery may take a stage out of (`M2-BE-545`). `DISPUTED` is **not** here and
    #: its absence is the guard: a disputed stage is a live objection about work somebody says was
    #: done, and cancelling it in a transfer would close that objection by deleting it.
    TRANSFERABLE_STATUSES = (
        Status.PENDING,
        Status.IN_PROGRESS,
        Status.AWAITING_REVIEW,
        Status.CORRECTION_REQUESTED,
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    engagement = models.ForeignKey(Engagement, on_delete=models.PROTECT, related_name="stages")
    position = models.PositiveSmallIntegerField()
    label = models.CharField(max_length=200)
    amount_paise = models.PositiveBigIntegerField()
    #: `WORK` for every A3 shift-day and every A5 milestone; `MATERIAL_ADVANCE` for a material
    #: line the vendor priced on their estimate. Defaulted rather than nullable so every row
    #: written before 1.26.0 reads as what it was.
    kind = models.CharField(max_length=20, choices=Kind.choices, default=Kind.WORK)
    #: What this milestone hands over, copied from the selected estimate's own stage row
    #: (`M2-BE-541`). Blank on every A3 shift-day — a day of labour delivers a day of labour — and
    #: blank on an amendment stage, whose deliverable is the amendment's reason.
    #:
    #: Copied rather than read back through `engagement.proposal.stages`, because a proposal is
    #: append-only and a vendor may supersede it after reconfirmation: the agreement is what was
    #: selected, not what the vendor last said.
    deliverable = models.TextField(blank=True)
    scheduled_on = models.DateField(null=True, blank=True)
    #: `M2-BE-549`: the label, deliverable, amount and date this stage was **created** with, so a
    #: schedule extension or a vendor transfer leaves both readings intact. Written once at
    #: creation by every path that lays out a stage, and never written again — the current values
    #: live in the columns beside it and the difference between the two is the whole answer to
    #: "what changed since we agreed".
    #:
    #: A JSON snapshot rather than four `original_*` columns: they are read together, they are
    #: never queried on, and four more nullable columns on the widest table in M2 would be four
    #: more things a writer can forget.
    original_terms = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.PENDING)
    funding_state = models.CharField(
        max_length=16,
        choices=FundingState.choices,
        default=FundingState.NOT_REQUIRED,
    )
    payment_attempt = models.ForeignKey(
        "commerce.PaymentAttempt",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_engagement_stages",
    )
    #: The four money numbers `M2-BE-504` bounds, per stage. Stored rather than derived because a
    #: bound the database can enforce has to be a column, and because a stage that was funded at
    #: one amount and amended to another must still reconcile against what was actually taken.
    funded_paise = models.PositiveBigIntegerField(default=0)
    approved_amount_paise = models.PositiveBigIntegerField(default=0)
    released_amount_paise = models.PositiveBigIntegerField(default=0)
    refunded_amount_paise = models.PositiveBigIntegerField(default=0)
    #: The vendor's earning for this stage, on the M1 payout rails. Written `PENDING` at approval
    #: — held for the dispute window — and moved to `AVAILABLE` by the release sweep. Null for a
    #: `LEAD_ONLY` stage, where Vsolve collects nothing and therefore owes nothing.
    ledger_entry = models.ForeignKey(
        "payouts.PartnerLedgerEntry",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_engagement_stages",
    )
    refund = models.ForeignKey(
        "commerce.Refund",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_engagement_stages",
    )
    #: When silence becomes approval. Business hours, stamped when evidence lands; null when the
    #: owner has set no review window, and those stages are deliberately never auto-approved.
    review_due_at = models.DateTimeField(null=True, blank=True)
    #: When an approved stage's held payout becomes payable. Business hours from approval; null
    #: when the hold window is unset, and those payouts wait for Operations rather than for a
    #: clock nobody configured.
    payout_release_due_at = models.DateTimeField(null=True, blank=True)
    correction_note = models.TextField(blank=True)
    dispute_reason_code = models.SlugField(max_length=80, blank=True)
    #: The amendment that created this stage, if it was not part of the original agreement.
    source_amendment = models.ForeignKey(
        "EngagementAmendment",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="created_stages",
    )
    funded_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    evidence_submitted_at = models.DateTimeField(null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    released_at = models.DateTimeField(null=True, blank=True)
    disputed_at = models.DateTimeField(null=True, blank=True)
    #: Wave C5, written only by `apps.requirements.projects`. The reason code says which recovery
    #: took the stage out — a transfer, an early termination, or a material advance the platform
    #: refuses to claw back — because "cancelled" on its own is the answer to a different question.
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancellation_reason_code = models.SlugField(max_length=80, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("engagement", "position")
        constraints = [
            models.UniqueConstraint(
                fields=("engagement", "position"),
                name="requirements_unique_engagement_stage_position",
            ),
            models.CheckConstraint(
                condition=~models.Q(funding_state="FUNDED") | models.Q(funded_at__isnull=False),
                name="requirements_funded_stage_has_a_timestamp",
            ),
            # `M2-BE-504`, per stage. Four bounds, four constraints, because collapsing them would
            # tell an operator that *something* about the money is wrong without saying which.
            #
            # **At face value or not at all.** A partly funded A5 stage is the state in which work
            # starts against money that does not cover it, and `complete_stage_funding` already
            # refuses a short payment — this is the same rule where no caller can miss it. Written
            # `>=` rather than `=` so that a stage whose scope was later *reduced* by an accepted
            # amendment stays legal: the excess is refunded, and funding that once covered a
            # larger stage still covers the smaller one.
            models.CheckConstraint(
                condition=~models.Q(funding_state="FUNDED")
                | models.Q(funded_paise__gte=models.F("amount_paise")),
                name="requirements_stage_funding_covers_amount",
            ),
            models.CheckConstraint(
                condition=models.Q(refunded_amount_paise__lte=models.F("funded_paise")),
                name="requirements_stage_refund_within_funding",
            ),
            # The per-stage twin of the engagement's exposure bound: never hold more of the
            # Customer's money for this stage than the stage is worth.
            models.CheckConstraint(
                condition=models.Q(
                    funded_paise__lte=models.F("amount_paise") + models.F("refunded_amount_paise")
                ),
                name="requirements_stage_exposure_within_amount",
            ),
            models.CheckConstraint(
                condition=models.Q(approved_amount_paise__lte=models.F("amount_paise")),
                name="requirements_stage_approved_within_amount",
            ),
            models.CheckConstraint(
                condition=models.Q(
                    released_amount_paise__lte=models.F("approved_amount_paise"),
                ),
                name="requirements_stage_released_within_approved",
            ),
            models.CheckConstraint(
                condition=~models.Q(status__in=("APPROVED", "RELEASED"))
                | models.Q(approved_at__isnull=False),
                name="requirements_approved_stage_has_a_timestamp",
            ),
            models.CheckConstraint(
                condition=~models.Q(status="RELEASED") | models.Q(released_at__isnull=False),
                name="requirements_released_stage_has_a_timestamp",
            ),
            models.CheckConstraint(
                condition=~models.Q(status="DISPUTED") | models.Q(disputed_at__isnull=False),
                name="requirements_disputed_stage_has_a_timestamp",
            ),
            # Wave C5. A cancelled stage carries **both** a timestamp and a reason, because the
            # money question a dispute asks about one is always "taken out by what?" — a transfer
            # to a replacement vendor and an unrecoverable material advance leave the same status
            # and settle completely differently.
            models.CheckConstraint(
                condition=~models.Q(status="CANCELLED")
                | (models.Q(cancelled_at__isnull=False) & ~models.Q(cancellation_reason_code="")),
                name="requirements_cancelled_stage_has_a_reason",
            ),
        ]
        indexes = [
            models.Index(fields=("engagement", "status")),
            models.Index(fields=("status", "review_due_at")),
            models.Index(fields=("status", "payout_release_due_at")),
        ]

    def __str__(self) -> str:
        return f"{self.engagement_id}:{self.position}:{self.status}"

    #: Opt-in for the two writes below that are allowed to move `amount_paise`. Not a field — it
    #: exists only for the lifetime of the instance applying an authorized change.
    #:
    #: There are exactly two authorized changes and they are named methods rather than a flag any
    #: caller may set: an accepted scope amendment (`apply_amendment_amount`) and an accepted
    #: vendor transfer (`apply_transfer_amount`). Both require the counterparty's agreement before
    #: they are reached; nothing else in M2 may move an agreed stage amount.
    applying_authorized_change = False

    def save(self, *args: Any, **kwargs: Any) -> None:
        """`amount_paise` moves only through an authorized amendment (`M2-BE-508`).

        The stage amount is the agreed price of one shift-day or one milestone. Everything that
        touches a stage after the agreement opens — evidence, approval, correction, dispute,
        release — has a legitimate reason to write this row and no reason at all to write that
        column, so the column is refused unless the caller has said it is applying an amendment.

        `apply_amendment_amount` below is the only way to say that, and
        `apps.requirements.amendments` is its only caller — after the amendment reached
        `AUTHORIZED`, which for an A5 engagement means a verified provider callback moved it
        there.

        `kind` is refused outright rather than gated on the amendment, because there is no
        legitimate write at all: whether a row is work or a material advance is decided by the
        estimate the Customer selected, and changing it afterwards would move a stage between two
        different recovery rules with nobody's agreement.
        """
        if not self._state.adding:
            update_fields = set(kwargs.get("update_fields") or ())
            touches_everything = not update_fields
            if "kind" in update_fields or touches_everything:
                stored_kind = (
                    EngagementStage.objects.filter(pk=self.pk)
                    .values_list("kind", flat=True)
                    .first()
                )
                if stored_kind is not None and stored_kind != self.kind:
                    raise ValueError("A stage's kind is fixed by the selected estimate.")
            changes_amount = "amount_paise" in update_fields or touches_everything
            if changes_amount and not self.applying_authorized_change:
                raise ValueError(
                    "A stage amount changes only through an authorized scope amendment or an "
                    "accepted vendor transfer."
                )
        super().save(*args, **kwargs)

    def _apply_authorized_amount(self, amount_paise: int) -> None:
        self.amount_paise = amount_paise
        self.applying_authorized_change = True
        try:
            self.save(update_fields=("amount_paise", "updated_at"))
        finally:
            self.applying_authorized_change = False

    def apply_amendment_amount(self, amount_paise: int) -> None:
        """Set the agreed amount of this stage from an authorized amendment.

        A named operation rather than a flag the caller sets by hand, so the one legitimate write
        to a frozen column reads as what it is at the call site — and so nothing has to reach into
        a private attribute to perform it.
        """
        self._apply_authorized_amount(amount_paise)

    def apply_transfer_amount(self, amount_paise: int) -> None:
        """Set the agreed amount of this stage from a Customer-accepted vendor transfer.

        Its own name rather than a second caller of `apply_amendment_amount`, because the two are
        different agreements and a reader has to be able to tell them apart: an amendment is the
        *same* vendor asking to change the work, a transfer is a *different* vendor pricing the
        work that is left. `apps.requirements.projects` is the only caller, and only after the
        Customer accepted the transfer (`M2-BE-545`).
        """
        self._apply_authorized_amount(amount_paise)
