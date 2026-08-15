"""Wave C6: calling a job off, and the Operations work spent on a request.

`RequirementCancellation` records the evaluation — lifecycle state, actor, evidence and calculated
remedy — before anything is executed, because every one of those facts stops being knowable once
it is. `OperationsTouch` counts one named operator's deliberate write against one named request.
"""

import uuid
from typing import Any, Final

from django.conf import settings
from django.db import models
from django.utils import timezone

# ---------------------------------------------------------------------------
# Wave C6 (`M2-BE-701`, `702`, `706`): the cancellation policy evaluation.
#
# One row per attempt to call a job off, written **before** anything is executed. That order is
# the whole design: `M2-BE-701` asks for an evaluation "recording lifecycle state, actor, reason,
# evidence, contact-disclosure state, fulfilment evidence and calculated remedy", and every one of
# those facts stops being knowable the moment the cancellation runs. A remedy computed after the
# engagement was cancelled would be computed against a cancelled engagement.
#
# It is deliberately **not** a status on `CustomerRequirement`. Two people can describe the same
# cancellation differently — that is the entire subject of `M2-AC-702` and `M2-AC-703` — and a
# single status column cannot hold two accounts of one event, nor the case that settles them.
# ---------------------------------------------------------------------------


#: The statuses in which a cancellation is still open: somebody has asked, and the money has not
#: moved yet. Module scope so the partial unique index below reads the same list any selector
#: does, per RULES §3(a).
CANCELLATION_LIVE_STATUSES: Final[tuple[str, ...]] = (
    "EVALUATED",
    "AWAITING_CONFIRMATION",
    "CONFIRMED",
    "DISPUTED",
)


class RequirementCancellation(models.Model):
    """Somebody wants to call this job off, and everything the decision rested on.

    Append-mostly: the row is written once at evaluation and afterwards only its own decision
    columns move. The `snapshot` of lifecycle state is never rewritten, because its purpose is to
    say what was true when the remedy was calculated.
    """

    class ActorRole(models.TextChoices):
        CUSTOMER = "CUSTOMER", "Customer"
        PARTNER = "PARTNER", "Partner"
        OPERATIONS = "OPERATIONS", "Operations"
        SYSTEM = "SYSTEM", "System"

    class Status(models.TextChoices):
        #: Recorded and priced. Nothing has moved and nobody else has been asked yet.
        EVALUATED = "EVALUATED", "Evaluated"
        #: `M2-BE-702`: the counterparty has to confirm or dispute before this executes.
        AWAITING_CONFIRMATION = "AWAITING_CONFIRMATION", "Awaiting the other side"
        CONFIRMED = "CONFIRMED", "Confirmed"
        #: The counterparty says this is not what happened. A case owns it from here.
        DISPUTED = "DISPUTED", "Disputed"
        EXECUTED = "EXECUTED", "Executed"
        WITHDRAWN = "WITHDRAWN", "Withdrawn"

    LIVE_STATUSES = CANCELLATION_LIVE_STATUSES

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    requirement = models.ForeignKey(
        "requirements.CustomerRequirement",
        on_delete=models.PROTECT,
        related_name="cancellations",
    )
    #: Null before an engagement exists. A cancellation during matching is a real cancellation and
    #: is the cheapest one there is — nothing has been agreed and, on the A3 rate-card path,
    #: nothing has been charged either.
    engagement = models.ForeignKey(
        "requirements.Engagement",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="cancellations",
    )
    actor_role = models.CharField(max_length=16, choices=ActorRole.choices)
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_cancellations_requested",
    )
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.EVALUATED)
    reason_code = models.SlugField(max_length=80)
    reason = models.TextField(blank=True)

    # --- The lifecycle state the remedy was calculated against (`M2-BE-701`). -----------------
    archetype = models.CharField(max_length=24)
    requirement_status = models.CharField(max_length=24)
    #: Blank when there is no engagement yet.
    engagement_status = models.CharField(max_length=16, blank=True)
    #: `07-state-machines-and-permissions.md` §7: the Customer may not see vendor identity before
    #: crew confirmation, unlock or visit confirmation. Once contact **has** been disclosed a
    #: cancellation is a different animal, because the two parties can now transact off-platform —
    #: which is why this is the flag `M2-BE-702` keys the confirmation requirement off.
    contact_disclosed = models.BooleanField(default=False)
    #: Whether anybody has reported work starting: an arrival, an attendance record, a funded
    #: stage in progress. The second half of `M2-BE-702`'s trigger.
    work_reported_started = models.BooleanField(default=False)
    #: What the requester offered. Free-form references into the rails that already hold evidence
    #: — attachment ids, stage-evidence ids, day-settlement ids — never bytes.
    evidence = models.JSONField(default=list, blank=True)
    #: What the platform can see for itself: arrivals, attendance, settled days, approved stages.
    #: Recorded separately from `evidence` because one is a claim and the other is a record, and a
    #: decision that could not tell them apart would be a decision made on the louder party.
    fulfilment_evidence = models.JSONField(default=dict, blank=True)

    # --- The calculated remedy (`M2-BE-706`, `M2-BE-719`, `M2-BE-705`, `M2-BE-718`). ----------
    #: A stable code naming what will happen to the money, so a support conversation, a ledger row
    #: and a screen use one vocabulary.
    remedy_code = models.SlugField(max_length=80, blank=True)
    #: The arithmetic behind it, in integer paise, per money product. Stored rather than recomputed
    #: because every input is effective-dated policy and a settled cancellation has to reconcile
    #: against the policy it was settled under.
    remedy = models.JSONField(default=dict, blank=True)

    # --- Counterparty confirmation and the case (`M2-BE-702`, `703`). -------------------------
    requires_counterparty_confirmation = models.BooleanField(default=False)
    confirmation_due_at = models.DateTimeField(null=True, blank=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_cancellations_confirmed",
    )
    disputed_at = models.DateTimeField(null=True, blank=True)
    case = models.ForeignKey(
        "cases.OperationsCase",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_cancellations",
    )

    executed_at = models.DateTimeField(null=True, blank=True)
    idempotency_key = models.CharField(max_length=128, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "id")
        constraints = [
            # One open cancellation per requirement. Two people calling the same job off in the
            # same minute is a real race — the vendor rings the Customer while the Customer taps
            # cancel — and two live evaluations would each compute a remedy against a world the
            # other was about to change.
            models.UniqueConstraint(
                fields=("requirement",),
                condition=models.Q(status__in=CANCELLATION_LIVE_STATUSES),
                name="requirements_one_live_cancellation",
            ),
            models.CheckConstraint(
                condition=~models.Q(status="EXECUTED") | models.Q(executed_at__isnull=False),
                name="requirements_executed_cancellation_has_a_timestamp",
            ),
            models.CheckConstraint(
                condition=models.Q(confirmed_at__isnull=True)
                | models.Q(requires_counterparty_confirmation=True),
                name="requirements_confirmed_cancellation_needed_confirming",
            ),
        ]
        indexes = [
            models.Index(fields=("requirement", "status")),
            models.Index(fields=("status", "confirmation_due_at")),
        ]

    def __str__(self) -> str:
        return f"{self.requirement_id}:{self.status}:{self.remedy_code}"


class OperationsTouch(models.Model):
    """One Operations action on one request (`M2-BE-715`). Append-only.

    `GAP-033` asks that Operations touches per request be **measured**, so the workspace design can
    be checked against the approved unit economics — for A3 against the booking fee's platform
    share, because that fee is the platform's entire A3 revenue.

    It is an explicit row rather than a count derived from audit events, and the reason is that
    every derivation available was wrong in a way that would have made the metric useless:
    `identity.AccessAuditEvent` counts *requests to a view*, so one operator scrolling a queue
    would look like ten touches; `RequirementTransition` records the actor but not their role, so
    a Customer cancelling their own request would count as Operations work. A touch is a
    deliberate write by a named operator against a named request, and nothing else can tell you
    that.

    What it deliberately does **not** carry is a cost. The money it has to fit inside is already
    published on the rate card and the access price table, and duplicating a number here would
    make two answers to "what did this request cost us".
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    requirement = models.ForeignKey(
        "requirements.CustomerRequirement",
        on_delete=models.PROTECT,
        related_name="operations_touches",
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_operations_touches",
    )
    #: The command that was run, as its own stable slug. Never a view name — a route can be
    #: renamed and the history has to stay comparable across that.
    action = models.SlugField(max_length=80)
    reason = models.CharField(max_length=480, blank=True)
    occurred_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ("-occurred_at", "id")
        indexes = [
            models.Index(fields=("requirement", "occurred_at")),
            models.Index(fields=("action", "occurred_at")),
        ]

    def __str__(self) -> str:
        return f"{self.requirement_id}:{self.action}"

    def save(self, *args: Any, **kwargs: Any) -> None:
        if not self._state.adding:
            raise ValueError("An Operations touch is immutable.")
        super().save(*args, **kwargs)
