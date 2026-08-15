"""Wave C5: the A5 project's own records — its schedule, its handover and its vendor.

`ProjectDelayClaim`, `ProjectDeliverable` and `ProjectTransfer`. A milestone is still an
`EngagementStage` and none of these re-models work, money, evidence or approval; what lives here
is only the three facts the engagement spine has no room for.
"""

import uuid
from typing import Any, Final

from django.conf import settings
from django.db import models

from apps.partners.models import PartnerProfile

from .evidence import StageEvidence

# ---------------------------------------------------------------------------
# Wave C5 (`M2-BE-541..549`): the A5 project's own records.
#
# Three tables, and the shape of each is decided by what the engagement spine already owns rather
# than by what a project management tool would have. A milestone is an `EngagementStage` — the
# archetype is a field on the record and never a parallel subsystem (`M2-BE-541`) — so nothing
# below re-models work, money, evidence or approval. What is genuinely new is the three facts the
# spine has no room for:
#
# * a **schedule** can move without any money moving (`ProjectDelayClaim`, `M2-BE-544`). The M1
#   amendment engine cannot express that: `requirements_engagement_amendment_moves_money` refuses
#   a zero delta by constraint, deliberately, because an amendment a Customer must decide on that
#   changes no money is a decision about nothing. A date is not scope.
# * a **vendor** can change (`ProjectTransfer`, `M2-BE-545`), which is the one thing an engagement
#   freezes that an amendment was never designed to move.
# * a **deliverable** can be a file rather than a site (`ProjectDeliverable`, `M2-BE-547`), and
#   Event and Media work is finished by handing one over rather than by standing somewhere.
# ---------------------------------------------------------------------------


#: The statuses in which a project request has **not** been decided by a person, and therefore
#: carries no decision timestamp: the one it is created in, and the one a clock moves it to.
#:
#: Module scope, and the class attribute below is bound to the same object rather than retyping
#: it — RULES §3(a), and the reason `commerce.CHECKOUT_FREE_PURPOSES` lives at module scope too: a
#: nested `Meta` body cannot see its enclosing class's namespace, so a constraint that wants a
#: status list either reads one from out here or hand-copies it. The hand-copied one drifts, and
#: `makemigrations --check` cannot see the drift because model state and migration state agree
#: with each other while both disagree with the code.
DELAY_CLAIM_UNDECIDED_STATUSES: Final[tuple[str, ...]] = ("SUBMITTED", "EXPIRED")

#: The same rule for a transfer proposal, and a separate tuple rather than a shared one because
#: the two machines genuinely start in different states — a claim is `SUBMITTED`, a transfer is
#: `PROPOSED` — and collapsing them would be a shared list that is only accidentally the same
#: length.
PROJECT_TRANSFER_UNDECIDED_STATUSES: Final[tuple[str, ...]] = ("PROPOSED", "EXPIRED")


class ProjectDelayClaim(models.Model):
    """The vendor says the Customer held the job up, and asks for the dates back (`M2-BE-544`).

    **It moves no money, ever.** There is no amount on this row and none may be added: a delay
    that costs money is extra work, and extra work is a scope amendment both parties accept and
    the Customer pays for. Keeping the two apart is what stops "the site was locked on Tuesday"
    from quietly becoming a bill.

    Evidence is the stage's own `StageEvidence` rows rather than a second uploader — the presign,
    the checksum verification and the scan status are all already there, and `M2-BE-544` asks for
    evidence, not for an evidence subsystem. `stages._assert_evidence_may_be_added` accepts a
    `PENDING` stage for exactly this reason: a customer-caused delay is a claim about work that
    has **not** started, so refusing evidence until it has would make the one claim that most
    needs a photograph the one claim that cannot carry one.
    """

    class Status(models.TextChoices):
        SUBMITTED = "SUBMITTED", "Waiting for the Customer"
        ACCEPTED = "ACCEPTED", "Accepted; the schedule moved"
        REJECTED = "REJECTED", "Rejected; the schedule stands"
        EXPIRED = "EXPIRED", "Not answered in time"
        WITHDRAWN = "WITHDRAWN", "Withdrawn by the vendor"

    #: The one status in which this claim is still waiting on somebody.
    LIVE_STATUSES = (Status.SUBMITTED,)
    #: Bound from module scope so the constraint below and any reader out here are the same list.
    #: Deliberately **not** `LIVE_STATUSES`: "still waiting on somebody" and "has no decision
    #: timestamp" are different questions that happen to overlap, and an expired claim answers
    #: `False` to the first and `True` to the second.
    UNDECIDED_STATUSES = DELAY_CLAIM_UNDECIDED_STATUSES

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    engagement = models.ForeignKey(
        "requirements.Engagement",
        on_delete=models.PROTECT,
        related_name="delay_claims",
    )
    #: The milestone that was held up. Required, because "the project is late" is not actionable
    #: and "this milestone is late for this reason" is: the extension is applied from here
    #: onwards, and a claim with no stage would have no idea which dates to move.
    stage = models.ForeignKey(
        "requirements.EngagementStage",
        on_delete=models.PROTECT,
        related_name="delay_claims",
    )
    raised_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="m2_delay_claims_raised",
    )
    reason_code = models.SlugField(max_length=80)
    #: What happened, in the vendor's own words. Required — a claim on somebody's schedule that
    #: says only "delayed" is a claim the Customer cannot answer.
    description = models.TextField()
    #: Annotated because django-stubs cannot infer a lazy `ManyToManyField`'s target from a
    #: string reference and strict mypy refuses an unannotated one. The annotation itself is a
    #: **string**: `ManyToManyField` is not subscriptable at runtime, so the unquoted form is a
    #: `TypeError` at import even though the type checker is happy with it.
    evidence: "models.ManyToManyField[StageEvidence, Any]" = models.ManyToManyField(
        "StageEvidence",
        blank=True,
        related_name="delay_claims",
    )
    #: Calendar days the vendor is asking for. Bounded above in the domain rather than here: a
    #: number is a sanity bound and not a policy, and this table should not look like it holds one.
    extension_days = models.PositiveSmallIntegerField()
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.SUBMITTED)
    #: Reuses `pricing.amendment_response_deadline`, deliberately: this is the same promise the
    #: amendment engine makes — how long the Customer has to answer a vendor's request about the
    #: agreed work — and a second owner-blocked clock for it would be a second thing nobody has
    #: been asked to decide.
    expires_at = models.DateTimeField()
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_delay_claims_decided",
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    decision_note = models.TextField(blank=True)
    #: What the schedule actually moved by. Equal to `extension_days` on acceptance and zero
    #: otherwise — stored rather than derived so a later claim on the same stage reads a history
    #: rather than a running total it has to reconstruct.
    applied_days = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "id")
        constraints = [
            models.UniqueConstraint(
                fields=("stage",),
                condition=models.Q(status="SUBMITTED"),
                name="requirements_one_live_delay_claim_per_stage",
            ),
            models.CheckConstraint(
                condition=models.Q(extension_days__gt=0),
                name="requirements_delay_claim_moves_the_schedule",
            ),
            # A decided claim names when it was decided. The same shape as the stage timestamps
            # above, and for the same reason: a decision with no moment is not auditable.
            models.CheckConstraint(
                condition=models.Q(status__in=DELAY_CLAIM_UNDECIDED_STATUSES)
                | models.Q(decided_at__isnull=False),
                name="requirements_decided_delay_claim_has_a_timestamp",
            ),
            # Only an accepted claim moves days. A rejected or expired one that recorded an
            # extension would be a schedule change nobody agreed to hiding in a settled row.
            models.CheckConstraint(
                condition=models.Q(status="ACCEPTED") | models.Q(applied_days=0),
                name="requirements_only_accepted_delay_claims_move_days",
            ),
        ]
        indexes = [
            models.Index(fields=("engagement", "status")),
            models.Index(fields=("status", "expires_at")),
        ]

    def __str__(self) -> str:
        return f"{self.stage_id}:{self.status}:+{self.extension_days}d"


class ProjectDeliverable(models.Model):
    """One thing handed over at the end of a project (`M2-BE-547`).

    `README.md` wants Event and Media delivery to happen on the platform rather than through a
    private message with a download link nobody can find in six months. The mechanism is not a
    file host — it is that **`COMPLETING → COMPLETED` refuses while a submitted handover is
    unaccepted**, so a vendor who delivers off-platform is a vendor whose engagement does not
    close and whose retention does not release.

    Files reuse the stage evidence rail whole: the same presign, the same checksum verification,
    the same scan status. A second uploader for "deliverables" would be a second bucket, a second
    orphan sweep and a second set of media-type rules that could disagree with the first.

    A `LINK` is recorded rather than hosted, and that is stated rather than hidden: a 40 GB wedding
    film is not going through this rail, and pretending otherwise would push the handover back off
    the platform entirely. What the row buys is that the Customer accepted *that* link, at *that*
    moment, against *that* engagement.
    """

    class Kind(models.TextChoices):
        FILE = "FILE", "A file uploaded through the evidence rail"
        LINK = "LINK", "A recorded external location"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    engagement = models.ForeignKey(
        "requirements.Engagement",
        on_delete=models.PROTECT,
        related_name="deliverables",
    )
    #: The milestone this deliverable belongs to, when it belongs to one. Null for a handover of
    #: the project as a whole, which is the ordinary Event and Media case.
    stage = models.ForeignKey(
        "requirements.EngagementStage",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="deliverables",
    )
    kind = models.CharField(max_length=8, choices=Kind.choices)
    title = models.CharField(max_length=200)
    evidence = models.ForeignKey(
        "StageEvidence",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="deliverables",
    )
    external_url = models.URLField(max_length=1000, blank=True)
    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="m2_deliverables_submitted",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("engagement", "created_at", "id")
        constraints = [
            # Exactly one of the two, held here rather than in the serializer: a `FILE` with no
            # object behind it and a `LINK` with no address are both a handover the Customer is
            # being asked to accept sight unseen.
            models.CheckConstraint(
                condition=(
                    models.Q(kind="FILE", evidence__isnull=False, external_url="")
                    | models.Q(kind="LINK", evidence__isnull=True) & ~models.Q(external_url="")
                ),
                name="requirements_deliverable_has_exactly_one_body",
            ),
        ]
        indexes = [
            models.Index(fields=("engagement", "created_at")),
        ]

    def __str__(self) -> str:
        return f"{self.engagement_id}:{self.kind}:{self.title}"


class ProjectTransfer(models.Model):
    """The remaining milestones move to a replacement vendor, and the delta is settled
    (`M2-BE-545`).

    **The delta is the whole point.** A transfer that silently absorbed a price difference is how
    somebody ends up paying twice — the Customer having funded the abandoning vendor for work
    nobody did, and then funding the replacement for the same work. So the settlement is
    structural rather than a number in a report:

    1. every transferable stage refunds what the Customer had funded and the abandoning vendor had
       not earned, through the M1 refund rail (`stages.refund_stage_amount`);
    2. every transferable stage is then repriced to the replacement's own number, and the
       engagement's `amendment_delta_paise` moves by exactly the difference, so
       `staged_total = total + amendment_delta` still holds by constraint;
    3. the Customer funds the replacement's stages as they reach them, at the replacement's price.

    There is therefore **no transfer checkout and no new payment purpose**. The money the Customer
    is asked for after a transfer is the ordinary stage funding they would have been asked for
    anyway, at a price they accepted before any of it moved.

    A **funded material advance is never transferred and never clawed back** (`M2-BE-543`).
    `README.md`: material money is spent rather than earned. The vendor has bought the cement, so
    the money is gone in the physical world; refunding it automatically would be Vsolve settling a
    goods dispute with a cron job, and handing it to the replacement would be paying for the same
    cement twice. The stage is cancelled, the amount is recorded here as outstanding, and a human
    decides where the goods are.
    """

    class Status(models.TextChoices):
        PROPOSED = "PROPOSED", "Waiting for the Customer"
        ACCEPTED = "ACCEPTED", "Accepted and applied"
        DECLINED = "DECLINED", "Declined by the Customer"
        EXPIRED = "EXPIRED", "Not answered in time"

    LIVE_STATUSES = (Status.PROPOSED,)
    #: As on `ProjectDelayClaim`, and bound from module scope for the same reason.
    UNDECIDED_STATUSES = PROJECT_TRANSFER_UNDECIDED_STATUSES

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    engagement = models.ForeignKey(
        "requirements.Engagement",
        on_delete=models.PROTECT,
        related_name="transfers",
    )
    from_partner = models.ForeignKey(
        PartnerProfile,
        on_delete=models.PROTECT,
        related_name="project_transfers_out",
    )
    to_partner = models.ForeignKey(
        PartnerProfile,
        on_delete=models.PROTECT,
        related_name="project_transfers_in",
    )
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PROPOSED)
    reason_code = models.SlugField(max_length=80)
    note = models.TextField(blank=True)

    #: What the abandoning vendor was owed for the work that is left, and what the replacement
    #: wants for the same work. Both frozen at proposal, so the Customer accepts the two numbers
    #: they were shown rather than whatever the stages say by the time they tap.
    previous_remaining_paise = models.PositiveBigIntegerField()
    replacement_remaining_paise = models.PositiveBigIntegerField()
    #: Signed, and equal to the difference by constraint. Positive means the project got more
    #: expensive.
    delta_paise = models.BigIntegerField()
    #: What was actually returned to the Customer when this was applied: funding the abandoning
    #: vendor held against work they never did.
    refunded_paise = models.PositiveBigIntegerField(default=0)
    #: Funded material advances left with the abandoning vendor, which this transfer deliberately
    #: does **not** recover. Zero on most transfers; when it is not zero it is the number an
    #: Operations case is about.
    material_advance_outstanding_paise = models.PositiveBigIntegerField(default=0)
    #: `{stage_id: amount_paise}` as proposed. The proposal is priced per remaining milestone
    #: rather than as one lump, because a replacement who names a single number for "the rest of
    #: it" has not said which of the agreed milestones they are doing.
    stage_prices = models.JSONField(default=dict)

    proposed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="m2_transfers_proposed",
    )
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_transfers_decided",
    )
    expires_at = models.DateTimeField()
    decided_at = models.DateTimeField(null=True, blank=True)
    applied_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "id")
        constraints = [
            models.UniqueConstraint(
                fields=("engagement",),
                condition=models.Q(status="PROPOSED"),
                name="requirements_one_live_project_transfer",
            ),
            # The delta is not a field anybody types. Held at the database so a row can never say
            # one thing in its total and another in its difference.
            models.CheckConstraint(
                condition=models.Q(
                    delta_paise=models.F("replacement_remaining_paise")
                    - models.F("previous_remaining_paise")
                ),
                name="requirements_transfer_delta_reconciles",
            ),
            models.CheckConstraint(
                condition=~models.Q(from_partner=models.F("to_partner")),
                name="requirements_transfer_changes_the_vendor",
            ),
            models.CheckConstraint(
                condition=models.Q(status__in=PROJECT_TRANSFER_UNDECIDED_STATUSES)
                | models.Q(decided_at__isnull=False),
                name="requirements_decided_transfer_has_a_timestamp",
            ),
        ]
        indexes = [
            models.Index(fields=("engagement", "status")),
            models.Index(fields=("status", "expires_at")),
        ]

    def __str__(self) -> str:
        return f"{self.engagement_id}:{self.from_partner_id}->{self.to_partner_id}:{self.status}"
