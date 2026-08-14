"""The A5 project: milestones, delays, handover, and what happens when a vendor walks away.

**A5 is the same spine as A3, and this module adds no second one** (`M2-BE-541`). A milestone is
an `EngagementStage`; funding, evidence, review, approval, correction, dispute and release are the
Wave C3 commands in `apps.requirements.stages`, unchanged and uncopied. The archetype is a field on
the record. What lives here is only the four facts a project has and a shift-day does not:

* **A milestone delivers something** — a name and a deliverable rather than a date on a calendar.
  That is `EngagementStage.deliverable`, written by `engagements._a5_stages` from the selected
  estimate, and the read below is what publishes it beside the original it was agreed at.
* **A schedule can move without any money moving** (`ProjectDelayClaim`, `M2-BE-544`). The M1
  amendment engine deliberately cannot express this: `requirements_engagement_amendment_moves_money`
  refuses a zero delta at the database, because an amendment a Customer has to decide on that
  changes no money is a decision about nothing. A locked gate on Tuesday is a schedule fact. If it
  costs money it is extra work, and extra work is an amendment both parties accept — keeping the
  two apart is what stops "the site was not ready" from quietly becoming a bill.
* **A vendor can change** (`ProjectTransfer`, `M2-BE-545`). This is the one term an engagement
  freezes that no amendment was ever designed to move, and it is where the delta lives.
* **A deliverable can be a file** (`ProjectDeliverable`, `M2-BE-547`), because Event and Media work
  is finished by handing something over rather than by standing somewhere.

## The money rules, stated once

**Stages fund at face value and there is no stage credit** (07 §4a). Nothing here discounts a
stage: the visit-plan money was spent on the visits and settles per share, and a project that
funded its first milestone short by the price of a visit would be paying for those visits twice
out of the vendor's work.

**A funded material advance is never clawed back** (`M2-BE-543`). `README.md`: material money is
spent rather than earned. Wave C3.5 built the discriminator — `EngagementStage.kind`, its own
payment purpose — and `route_suspended_capability_engagements` was the first rule that could read
it. These are the other two rules it exists for: on a **transfer** the advance is left with the
abandoning vendor and recorded as outstanding, and on an **early termination** it is not returned.
Both are the same refusal: refunding it automatically would be Vsolve settling a goods dispute
with a background job, and handing it to a replacement would buy the same cement twice.

**Retention is payout-side money.** `M2-BE-546` lives in `stages` rather than here, because it is
withheld at approval and released at warranty close — both spine moments — and the only thing this
module does with it is publish it.

## Two guards worth naming

Every command below refuses on an **A3** engagement. A shift-day has no deliverable, no handover
and no schedule to extend, and a delay claim against one would be a vendor asking for a day back
that was already settled in cash that evening.

Every command that changes what a Customer owes needs the **Customer's own acceptance**. Operations
proposes a transfer; the Customer accepts it. An operator repointing a project at a new vendor at a
new price without asking would be a third party changing somebody's agreement, which is exactly
what `07-state-machines-and-permissions.md` §7 forbids Operations from doing.
"""

import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any, Final

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.catalog.models import ServiceVariant
from apps.foundation.services import enqueue_outbox_event
from apps.identity.models import User
from apps.partners import standing
from apps.partners.capabilities import assert_capability_active
from apps.partners.models import PartnerProfile, PartnerStandingEvent
from apps.requirements import pricing, services, stages
from apps.requirements.exceptions import (
    AmendmentNotActionableError,
    RequirementNotFoundError,
    StageDisputedError,
    StageTransitionError,
)
from apps.requirements.models import (
    CustomerRequirement,
    Engagement,
    EngagementStage,
    ProjectDelayClaim,
    ProjectDeliverable,
    ProjectTransfer,
    StageEvidence,
)

A5: Final = ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT

#: The most calendar days one delay claim may ask for. A sanity bound and explicitly **not** a
#: policy: a vendor who needs a quarter of a year back is renegotiating the project rather than
#: extending it, and that is a scope amendment or a cancellation. Bounding it here rather than on
#: the model keeps the table free of anything that looks like an owner decision.
MAXIMUM_EXTENSION_DAYS: Final = 90

#: How many rows one handover may carry. The same reasoning as `MAXIMUM_EVIDENCE_PER_STAGE`: a
#: handover a Customer cannot read in one screen is a handover they accept without reading.
MAXIMUM_DELIVERABLES_PER_HANDOVER: Final = 20

#: Reason codes a cancelled stage can carry, so an Operations reader never has to infer which
#: recovery took a stage out. Statuses answer "is this live"; these answer "settled how".
#:
#: There is deliberately no `transferred_to_replacement_vendor`: a transferred milestone is
#: **repriced and kept**, not cancelled and recreated, so that its evidence, its delay claims and
#: its original terms all stay attached to the work rather than to whoever was doing it.
CANCELLED_MATERIAL_OUTSTANDING: Final = "material_advance_left_with_vendor"
CANCELLED_BY_TERMINATION: Final = "project_terminated_early"


# ---------------------------------------------------------------------------
# Shared plumbing
# ---------------------------------------------------------------------------


def _locked_engagement(engagement_id: uuid.UUID) -> Engagement:
    return (
        Engagement.objects.select_for_update(of=("self",))
        .select_related("requirement__configuration", "requirement__service_area", "partner")
        .get(pk=engagement_id)
    )


def assert_project_engagement(engagement: Engagement) -> None:
    """Refuse an A3 engagement, and say which surface it belongs on.

    The mirror of `workforce._assert_workforce_stage`, and the reason is the same in reverse: one
    spine, two archetypes, and a route that quietly did nothing on the wrong one would leave a
    client believing it had recorded something.
    """
    if engagement.archetype != A5:
        raise StageTransitionError(
            "This is a workforce booking, not a project. Its days are on the shift-day screen.",
        )


def _assert_engagement_open(engagement: Engagement) -> None:
    if engagement.status not in (
        Engagement.Status.PENDING_START,
        Engagement.Status.ACTIVE,
        Engagement.Status.DISPUTED,
    ):
        raise StageTransitionError("This project is no longer open to changes.")


def _project_stage(*, engagement: Engagement, stage_id: uuid.UUID) -> EngagementStage:
    stage = EngagementStage.objects.filter(pk=stage_id, engagement=engagement).first()
    if stage is None:
        raise StageTransitionError("That milestone does not belong to this project.")
    return stage


# ---------------------------------------------------------------------------
# Customer-caused delay and the schedule extension (`M2-BE-544`)
# ---------------------------------------------------------------------------


@transaction.atomic
def raise_delay_claim(
    *,
    stage_id: uuid.UUID,
    actor: User,
    reason_code: str,
    description: str,
    extension_days: int,
    evidence_ids: list[uuid.UUID] | None = None,
) -> ProjectDelayClaim:
    """The vendor says the Customer held this milestone up, and asks for the days back.

    **No money moves and none can.** `ProjectDelayClaim` has no amount column, deliberately: a
    delay that costs money is extra work priced through the M1 amendment engine, which the
    Customer accepts and pays for. A single record that could do both would let "the site was
    locked" arrive as a bill the Customer never agreed to.

    Evidence is the stage's own `StageEvidence` rows, uploaded through the rail that already
    exists. The claim references them rather than owning them, so the same photograph can answer a
    dispute about the same milestone without being uploaded twice — and so a claim carries the
    scan status the evidence rail already computes rather than a second, weaker one.

    One live claim per stage, held by `requirements_one_live_delay_claim_per_stage`. Two open
    claims on one milestone would be two answers the Customer has to give about one week.
    """
    stage = (
        EngagementStage.objects.select_for_update(of=("self",))
        .select_related("engagement__requirement__configuration", "engagement__partner")
        .get(pk=stage_id)
    )
    engagement = stage.engagement
    assert_project_engagement(engagement)
    _assert_engagement_open(engagement)
    if stage.status not in EngagementStage.OPEN_STATUSES:
        raise StageTransitionError("This milestone is finished, so its dates cannot move.")
    if not reason_code:
        raise StageTransitionError("A delay claim needs a reason code.")
    if not description.strip():
        raise StageTransitionError("Say what held the work up.")
    if extension_days <= 0:
        raise StageTransitionError("A delay claim has to ask for at least one day.")
    if extension_days > MAXIMUM_EXTENSION_DAYS:
        raise StageTransitionError(
            f"A delay claim can ask for at most {MAXIMUM_EXTENSION_DAYS} days. Longer than that "
            "is a change to the project, not an extension.",
        )
    if ProjectDelayClaim.objects.filter(
        stage=stage,
        status__in=ProjectDelayClaim.LIVE_STATUSES,
    ).exists():
        raise AmendmentNotActionableError(
            "A delay claim on this milestone is already waiting for the Customer.",
        )

    # Raises `m2_policy_unavailable` when the owner has set no response window. Reused from the
    # amendment engine rather than given its own knob: it is the same promise — how long the
    # Customer has to answer the vendor about the agreed work — and a second unset value would
    # block a second command on a decision nobody has been asked for.
    expires_at = pricing.amendment_response_deadline(engagement.requirement)

    claim = ProjectDelayClaim.objects.create(
        engagement=engagement,
        stage=stage,
        raised_by=actor,
        reason_code=reason_code[:80],
        description=description.strip(),
        extension_days=extension_days,
        expires_at=expires_at,
    )
    wanted = list(evidence_ids or [])
    if wanted:
        # Scoped to this stage, so a foreign id reads as "not on this milestone" rather than
        # confirming that somebody else's evidence exists.
        claim.evidence.set(StageEvidence.objects.filter(stage=stage, id__in=wanted))
    stages.record_event(
        engagement=engagement,
        stage=stage,
        from_status=stage.status,
        to_status=stage.status,
        actor=actor,
        reason_code="delay_claim_raised",
        reason=f"+{extension_days}d: {claim.reason_code}",
    )
    enqueue_outbox_event(
        aggregate_type="engagement",
        aggregate_id=engagement.id,
        event_type="m2.project.delay_claimed",
        idempotency_key=f"delay-claim:{claim.id}",
        payload={
            "engagement_id": str(engagement.id),
            "stage_id": str(stage.id),
            "delay_claim_id": str(claim.id),
            "extension_days": extension_days,
        },
    )
    return claim


@transaction.atomic
def decide_delay_claim(
    *, delay_claim_id: uuid.UUID, actor: User, accept: bool, note: str = ""
) -> ProjectDelayClaim:
    """The Customer answers a delay claim. Accepting moves the schedule and nothing else.

    An accepted claim shifts **this milestone and every one after it**, because a project is a
    sequence: a week lost on the first-fix is a week lost on everything that follows, and moving
    only the delayed milestone would produce an agreement whose remaining dates say the vendor can
    make it up by working two milestones at once.

    A milestone with no date is left alone rather than given one. `engagements._a5_stages` takes
    dates from the estimate's own `ends_on`, which is optional — a vendor who priced milestones
    without dating them has a project with no schedule to extend, and inventing dates for it here
    would be the server writing an agreement neither party made.
    """
    claim = (
        ProjectDelayClaim.objects.select_for_update(of=("self",))
        .select_related("engagement__requirement", "stage")
        .get(pk=delay_claim_id)
    )
    if claim.status != ProjectDelayClaim.Status.SUBMITTED:
        raise AmendmentNotActionableError("This delay claim has already been decided.")
    if claim.expires_at <= timezone.now():
        expire_delay_claim(delay_claim_id=claim.id)
        raise AmendmentNotActionableError("This delay claim expired before it was answered.")

    now = timezone.now()
    claim.decided_by = actor
    claim.decided_at = now
    claim.decision_note = note.strip()[:2000]
    if not accept:
        claim.status = ProjectDelayClaim.Status.REJECTED
        claim.save(
            update_fields=("status", "decided_by", "decided_at", "decision_note", "updated_at")
        )
        stages.record_event(
            engagement=claim.engagement,
            stage=claim.stage,
            from_status=ProjectDelayClaim.Status.SUBMITTED,
            to_status=claim.status,
            actor=actor,
            reason_code="delay_claim_rejected",
            reason=claim.decision_note,
        )
        return claim

    claim.status = ProjectDelayClaim.Status.ACCEPTED
    claim.applied_days = claim.extension_days
    claim.save(
        update_fields=(
            "status",
            "applied_days",
            "decided_by",
            "decided_at",
            "decision_note",
            "updated_at",
        )
    )
    shifted = _shift_schedule_from(
        engagement=claim.engagement,
        from_position=claim.stage.position,
        days=claim.extension_days,
    )
    stages.record_event(
        engagement=claim.engagement,
        stage=claim.stage,
        from_status=ProjectDelayClaim.Status.SUBMITTED,
        to_status=claim.status,
        actor=actor,
        reason_code="delay_claim_accepted",
        reason=f"+{claim.extension_days}d on {shifted} milestone(s): {claim.decision_note}",
    )
    return claim


def _shift_schedule_from(*, engagement: Engagement, from_position: int, days: int) -> int:
    """Move this milestone and every later one by `days`. Returns how many actually moved.

    `original_terms` is untouched, which is the whole of `M2-BE-549` on this path: the date the
    Customer agreed to and the date the work is now due are both readable, and the difference
    between them is the extension somebody accepted.
    """
    moved = 0
    for stage in (
        EngagementStage.objects.select_for_update()
        .filter(
            engagement=engagement,
            position__gte=from_position,
            scheduled_on__isnull=False,
        )
        .exclude(status=EngagementStage.Status.CANCELLED)
        .order_by("position")
    ):
        if stage.scheduled_on is None:  # pragma: no cover - excluded by the filter above
            continue
        stage.scheduled_on = stage.scheduled_on + timedelta(days=days)
        stage.save(update_fields=("scheduled_on", "updated_at"))
        moved += 1
    return moved


@transaction.atomic
def expire_delay_claim(*, delay_claim_id: uuid.UUID) -> ProjectDelayClaim:
    """The Customer never answered. Idempotent by state, for overlapping sweeps.

    Expiry is a **refusal**, not a silent acceptance: an unanswered claim leaves the agreed dates
    standing. Treating silence as consent would let a vendor move a Customer's schedule by filing
    a claim on a Friday afternoon.
    """
    claim = ProjectDelayClaim.objects.select_for_update(of=("self",)).get(pk=delay_claim_id)
    if claim.status != ProjectDelayClaim.Status.SUBMITTED:
        return claim
    if claim.expires_at > timezone.now():
        return claim
    claim.status = ProjectDelayClaim.Status.EXPIRED
    claim.save(update_fields=("status", "updated_at"))
    stages.record_event(
        engagement=claim.engagement,
        stage=claim.stage,
        from_status=ProjectDelayClaim.Status.SUBMITTED,
        to_status=claim.status,
        actor=None,
        reason_code="delay_claim_expired",
    )
    return claim


def expired_delay_claim_ids(*, at: datetime | None = None) -> list[uuid.UUID]:
    moment = at or timezone.now()
    return list(
        ProjectDelayClaim.objects.filter(
            status=ProjectDelayClaim.Status.SUBMITTED,
            expires_at__lt=moment,
        ).values_list("id", flat=True)
    )


# ---------------------------------------------------------------------------
# Digital deliverable handover (`M2-BE-547`)
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class DeliverableInput:
    """One thing the vendor is handing over, before the server has checked it exists."""

    title: str
    #: A `StageEvidence` row already uploaded and verified through the stage evidence rail.
    evidence_id: uuid.UUID | None = None
    #: Or an external location, recorded rather than hosted.
    external_url: str = ""
    stage_id: uuid.UUID | None = None


@transaction.atomic
def submit_project_handover(
    *, engagement_id: uuid.UUID, actor: User, note: str, items: list[DeliverableInput]
) -> Engagement:
    """The vendor hands over the digital deliverables. Partner command.

    Files reuse the stage evidence rail whole — the same presign, the same checksum verification,
    the same scan status — so this command **references** evidence and never receives bytes. A
    second uploader for deliverables would be a second bucket, a second orphan sweep and a second
    set of media-type rules that could disagree with the first.

    A `LINK` is recorded, not hosted, and saying so is more honest than pretending otherwise: a
    40 GB wedding film is never going through this rail, and a handover surface that refused links
    would push the whole exchange back into a private message. What the row buys is that *this*
    Customer accepted *that* location at *that* moment against *this* engagement.

    Re-submitting before acceptance appends rather than replaces. A vendor who forgot a file
    should not have to withdraw a handover to add one, and deleting rows the Customer has already
    looked at would make the record of what was offered depend on what was offered last.
    """
    engagement = _locked_engagement(engagement_id)
    assert_project_engagement(engagement)
    if engagement.status not in (Engagement.Status.ACTIVE, Engagement.Status.COMPLETING):
        raise StageTransitionError("This project is not at the handover stage.")
    if engagement.handover_accepted_at is not None:
        raise StageTransitionError("The Customer has already accepted this handover.")
    if not items:
        raise StageTransitionError("A handover needs at least one deliverable.")
    already = ProjectDeliverable.objects.filter(engagement=engagement).count()
    if already + len(items) > MAXIMUM_DELIVERABLES_PER_HANDOVER:
        raise StageTransitionError(
            f"A handover can carry up to {MAXIMUM_DELIVERABLES_PER_HANDOVER} deliverables.",
        )

    rows: list[ProjectDeliverable] = []
    for item in items:
        if not item.title.strip():
            raise StageTransitionError("Every deliverable needs a name.")
        stage: EngagementStage | None = None
        if item.stage_id is not None:
            stage = _project_stage(engagement=engagement, stage_id=item.stage_id)
        if item.evidence_id is not None:
            evidence = StageEvidence.objects.filter(
                id=item.evidence_id,
                stage__engagement=engagement,
            ).first()
            if evidence is None:
                # Scoped to this engagement, so an id belonging to somebody else's project reads
                # as "not yours" rather than confirming that it exists.
                raise StageTransitionError("That file is not attached to this project.")
            rows.append(
                ProjectDeliverable(
                    engagement=engagement,
                    stage=stage or evidence.stage,
                    kind=ProjectDeliverable.Kind.FILE,
                    title=item.title.strip()[:200],
                    evidence=evidence,
                    external_url="",
                    submitted_by=actor,
                )
            )
            continue
        url = item.external_url.strip()
        if not url.lower().startswith("https://"):
            # `https` only, and refused rather than coerced. A handover link the Customer opens is
            # a link this platform showed them, and downgrading one to plain http on their behalf
            # is not a decision to take quietly.
            raise StageTransitionError(
                "A deliverable is either a file you uploaded or an https link.",
            )
        rows.append(
            ProjectDeliverable(
                engagement=engagement,
                stage=stage,
                kind=ProjectDeliverable.Kind.LINK,
                title=item.title.strip()[:200],
                evidence=None,
                external_url=url[:1000],
                submitted_by=actor,
            )
        )
    ProjectDeliverable.objects.bulk_create(rows)

    now = timezone.now()
    engagement.handover_submitted_at = now
    engagement.handover_note = note.strip()[:4000]
    engagement.save(
        update_fields=("handover_submitted_at", "handover_note", "updated_at"),
    )
    stages.record_event(
        engagement=engagement,
        stage=None,
        from_status=engagement.status,
        to_status=engagement.status,
        actor=actor,
        reason_code="handover_submitted",
        reason=f"{len(rows)} deliverable(s)",
    )
    enqueue_outbox_event(
        aggregate_type="engagement",
        aggregate_id=engagement.id,
        event_type="m2.project.handover_submitted",
        idempotency_key=f"handover-submitted:{engagement.id}:{now.isoformat()}",
        payload={"engagement_id": str(engagement.id), "deliverables": len(rows)},
    )
    return engagement


@transaction.atomic
def accept_project_handover(*, engagement_id: uuid.UUID, actor: User) -> Engagement:
    """The Customer accepts the deliverables. Customer command.

    Acceptance is its own act rather than a side effect of closing the engagement, because the two
    can legitimately happen at different moments: a photographer delivers the gallery in week two
    of a four-week edit, and the project closes when the last milestone is approved.

    When the project is already `COMPLETING`, accepting the handover finishes it — the Customer
    has just said the only outstanding thing is done, and asking them to tap a second button to
    say so again would be the app's bookkeeping, not theirs.
    """
    engagement = _locked_engagement(engagement_id)
    assert_project_engagement(engagement)
    if engagement.handover_submitted_at is None:
        raise StageTransitionError("There is nothing to accept yet.")
    if engagement.handover_accepted_at is None:
        now = timezone.now()
        engagement.handover_accepted_at = now
        engagement.save(update_fields=("handover_accepted_at", "updated_at"))
        stages.record_event(
            engagement=engagement,
            stage=None,
            from_status=engagement.status,
            to_status=engagement.status,
            actor=actor,
            reason_code="handover_accepted",
        )
    if engagement.status == Engagement.Status.COMPLETING:
        return stages.accept_engagement_completion(engagement_id=engagement.id, actor=actor)
    engagement.refresh_from_db()
    return engagement


# ---------------------------------------------------------------------------
# Vendor abandonment: transfer, and the material-advance recovery rule
# (`M2-BE-545`, and the half of `M2-BE-543` Wave C3.5 left open)
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class TransferQuote:
    """What the replacement vendor wants for one milestone that is left."""

    stage_id: uuid.UUID
    amount_paise: int


def transferable_stages(engagement: Engagement) -> list[EngagementStage]:
    """The milestones a replacement vendor would take on.

    Two exclusions, and each is a rule rather than a filter:

    * **A settled stage is not transferable.** Approved and released work happened; a replacement
      is not doing it again and the Customer is not paying for it again.
    * **A funded material advance is not transferable** (`M2-BE-543`). The abandoning vendor spent
      that money on goods. Handing the line to a replacement would buy the same cement twice, and
      refunding it would be Vsolve deciding a goods dispute with a background job. It is cancelled
      and recorded as outstanding instead, which is where a human decides where the goods went.

    A **disputed** stage is excluded by `TRANSFERABLE_STATUSES` and blocks the whole transfer in
    `propose_project_transfer` rather than being quietly left behind — see there.
    """
    return [
        stage
        for stage in EngagementStage.objects.filter(
            engagement=engagement,
            status__in=EngagementStage.TRANSFERABLE_STATUSES,
        ).order_by("position")
        if not (
            stage.kind == EngagementStage.Kind.MATERIAL_ADVANCE
            and stage.funded_paise > stage.refunded_amount_paise
        )
    ]


def outstanding_material_advances(engagement: Engagement) -> list[EngagementStage]:
    """Funded material advances that a recovery leaves exactly where they are."""
    return list(
        EngagementStage.objects.filter(
            engagement=engagement,
            kind=EngagementStage.Kind.MATERIAL_ADVANCE,
            status__in=EngagementStage.OPEN_STATUSES,
        )
        .filter(funded_paise__gt=0)
        .order_by("position")
    )


@transaction.atomic
def propose_project_transfer(
    *,
    engagement_id: uuid.UUID,
    actor: User,
    to_partner_id: uuid.UUID,
    quotes: list[TransferQuote],
    reason_code: str,
    note: str = "",
) -> ProjectTransfer:
    """Operations proposes moving the remaining milestones to a replacement vendor.

    **Priced per remaining milestone, never as a lump.** A replacement who names one number for
    "the rest of it" has not said which of the agreed milestones they are doing, and the Customer
    would be accepting a total against a scope nobody restated. Every transferable stage must
    appear exactly once and every price must be positive, so the two numbers the Customer is shown
    — what the old vendor was owed, and what the new one wants — are sums over the same list of
    work.

    **A disputed milestone blocks the whole transfer.** A dispute is a live objection about work
    somebody says was done; transferring around it would close that objection by moving it out of
    the agreement, and transferring *it* would ask a replacement to price a question. Operations
    decides the dispute first — `resolve_stage_dispute` exists precisely so that is not a dead
    end — and then transfers.

    Nothing moves here. The proposal is a proposal until the Customer accepts it, because their
    remaining cost changes and `07-state-machines-and-permissions.md` §7 does not let Operations
    change somebody's agreement for them.
    """
    engagement = _locked_engagement(engagement_id)
    assert_project_engagement(engagement)
    _assert_engagement_open(engagement)
    if engagement.commercial_mode != Engagement.CommercialMode.MANAGED_PAYMENT_REQUIRED:
        raise StageTransitionError("This engagement is paid directly to the vendor.")
    if not reason_code:
        raise StageTransitionError("A transfer needs a reason code.")
    if ProjectTransfer.objects.filter(
        engagement=engagement,
        status__in=ProjectTransfer.LIVE_STATUSES,
    ).exists():
        raise AmendmentNotActionableError(
            "A transfer is already waiting for the Customer on this project.",
        )
    if EngagementStage.objects.filter(
        engagement=engagement,
        status=EngagementStage.Status.DISPUTED,
    ).exists():
        raise StageDisputedError(
            "A milestone on this project is disputed. Decide it before transferring the rest.",
        )

    replacement = PartnerProfile.objects.filter(pk=to_partner_id).first()
    if replacement is None:
        raise RequirementNotFoundError()
    if replacement.id == engagement.partner_id:
        raise StageTransitionError("The replacement has to be a different vendor.")
    requirement = engagement.requirement
    # The same check `reconfirm_selection` makes, for the same reason: a replacement whose
    # capability is not approved for this variant and this area on the day the work restarts would
    # be authorized work nobody approved.
    assert_capability_active(
        partner=replacement,
        variant=requirement.variant,
        service_area=requirement.service_area,
        on_day=(
            requirement.requested_start.date() if requirement.requested_start is not None else None
        ),
    )

    remaining = transferable_stages(engagement)
    if not remaining:
        raise StageTransitionError(
            "There is no unfinished work on this project to transfer.",
        )
    priced = {quote.stage_id: quote.amount_paise for quote in quotes}
    if len(priced) != len(quotes):
        raise StageTransitionError("Each milestone can be priced only once.")
    expected = {stage.id for stage in remaining}
    if set(priced) != expected:
        raise StageTransitionError(
            "Price every unfinished milestone exactly once, and no others.",
        )
    if any(amount <= 0 for amount in priced.values()):
        raise StageTransitionError("Every milestone needs a price above zero.")

    previous_remaining = sum(stage.amount_paise for stage in remaining)
    replacement_remaining = sum(priced.values())
    outstanding = sum(
        stage.funded_paise - stage.refunded_amount_paise
        for stage in outstanding_material_advances(engagement)
    )
    transfer = ProjectTransfer.objects.create(
        engagement=engagement,
        from_partner=engagement.partner,
        to_partner=replacement,
        reason_code=reason_code[:80],
        note=note.strip()[:2000],
        previous_remaining_paise=previous_remaining,
        replacement_remaining_paise=replacement_remaining,
        delta_paise=replacement_remaining - previous_remaining,
        material_advance_outstanding_paise=max(outstanding, 0),
        stage_prices={str(stage_id): amount for stage_id, amount in priced.items()},
        proposed_by=actor,
        # The same clock the amendment engine runs on, and raising `m2_policy_unavailable` when
        # the owner has set none. A transfer proposal with no deadline is a replacement vendor's
        # diary held open indefinitely.
        expires_at=pricing.amendment_response_deadline(requirement),
    )
    stages.record_event(
        engagement=engagement,
        stage=None,
        from_status=engagement.status,
        to_status=engagement.status,
        actor=actor,
        reason_code="project_transfer_proposed",
        reason=(
            f"{previous_remaining} -> {replacement_remaining} paise across "
            f"{len(remaining)} milestone(s)"
        ),
    )
    enqueue_outbox_event(
        aggregate_type="engagement",
        aggregate_id=engagement.id,
        event_type="m2.project.transfer_proposed",
        idempotency_key=f"project-transfer:{transfer.id}",
        payload={
            "engagement_id": str(engagement.id),
            "project_transfer_id": str(transfer.id),
            "delta_paise": transfer.delta_paise,
        },
    )
    return transfer


@transaction.atomic
def decide_project_transfer(
    *, project_transfer_id: uuid.UUID, actor: User, accept: bool
) -> ProjectTransfer:
    """The Customer answers a proposed transfer. Accepting settles the delta and repoints the job.

    **The settlement is structural rather than a number in a report**, which is what stops anybody
    paying twice:

    1. every transferable milestone **refunds** what the Customer funded and the abandoning vendor
       did not earn, through the M1 refund rail, and drops back to `REQUIRED`;
    2. every transferable milestone is then **repriced** to the replacement's own number, and the
       engagement's `amendment_delta_paise` moves by exactly the difference — so
       `staged_total = total + amendment_delta` still holds by database constraint;
    3. the Customer funds the replacement's milestones as they reach them, at the price they just
       accepted.

    So there is **no transfer checkout and no new payment purpose**. The money asked for after a
    transfer is the ordinary stage funding that was always going to be asked for, at a number the
    Customer agreed to before any of it moved.

    The order inside step 1 and 2 is load-bearing rather than tidy: `requirements_stage_exposure_
    within_amount` is checked on every statement, so repricing a funded milestone downwards before
    returning the money would be the one instant in which the platform holds more of the
    Customer's money than the milestone is worth, and the database would refuse it.
    """
    transfer = (
        ProjectTransfer.objects.select_for_update(of=("self",))
        .select_related("engagement__requirement__configuration", "from_partner", "to_partner")
        .get(pk=project_transfer_id)
    )
    if transfer.status != ProjectTransfer.Status.PROPOSED:
        raise AmendmentNotActionableError("This transfer has already been decided.")
    if transfer.expires_at <= timezone.now():
        expire_project_transfer(project_transfer_id=transfer.id)
        raise AmendmentNotActionableError("This transfer expired before it was answered.")

    now = timezone.now()
    transfer.decided_by = actor
    transfer.decided_at = now
    if not accept:
        transfer.status = ProjectTransfer.Status.DECLINED
        transfer.save(update_fields=("status", "decided_by", "decided_at", "updated_at"))
        stages.record_event(
            engagement=transfer.engagement,
            stage=None,
            from_status=ProjectTransfer.Status.PROPOSED,
            to_status=transfer.status,
            actor=actor,
            reason_code="project_transfer_declined",
        )
        return transfer

    engagement = Engagement.objects.select_for_update().get(pk=transfer.engagement_id)
    _assert_engagement_open(engagement)
    if EngagementStage.objects.filter(
        engagement=engagement,
        status=EngagementStage.Status.DISPUTED,
    ).exists():
        # Re-checked at acceptance, not only at proposal: a Customer can dispute a milestone in
        # the window between Operations proposing a transfer and the Customer accepting it, and
        # that is exactly the moment a transfer would move the objection out of the agreement.
        raise StageDisputedError(
            "A milestone was disputed after this transfer was proposed. It has to be decided "
            "first.",
        )

    priced: dict[str, int] = {str(key): int(value) for key, value in transfer.stage_prices.items()}
    remaining = transferable_stages(engagement)
    if {str(stage.id) for stage in remaining} != set(priced):
        # The unfinished work moved after the proposal was priced — a milestone was approved, or
        # an amendment appended one. The Customer would be accepting a price for a list of work
        # that no longer exists, so the transfer is refused rather than re-derived on their
        # behalf.
        raise AmendmentNotActionableError(
            "The unfinished work on this project changed after this transfer was priced. Ask "
            "Operations to propose it again.",
        )

    refunded_total = 0
    for stage in remaining:
        refunded_total += _return_unearned_funding(
            stage=stage,
            reason_code="m2_project_transferred",
        )
        locked = EngagementStage.objects.select_for_update().get(pk=stage.id)
        # `apply_transfer_amount` is one of the two doors in `EngagementStage` that may move an
        # agreed amount, and this is its only caller — `M2-BE-508` held at the narrowest point
        # rather than by everybody remembering.
        locked.apply_transfer_amount(priced[str(stage.id)])

    material_outstanding = 0
    for advance in outstanding_material_advances(engagement):
        material_outstanding += advance.funded_paise - advance.refunded_amount_paise
        _cancel_stage(
            stage=advance,
            reason_code=CANCELLED_MATERIAL_OUTSTANDING,
            actor=None,
        )

    stages.add_engagement_money(
        engagement.id,
        staged_total_paise=transfer.delta_paise,
        amendment_delta_paise=transfer.delta_paise,
    )
    Engagement.objects.filter(pk=engagement.id).update(
        partner=transfer.to_partner,
        # Work stops until the replacement's first milestone is funded, exactly as it did when the
        # project opened. `PENDING_START` rather than `ACTIVE` is the honest state: the new vendor
        # has nothing funded and no clearance, and leaving `work_may_start_at` standing would say
        # otherwise.
        status=Engagement.Status.PENDING_START,
        work_may_start_at=None,
        updated_at=now,
    )
    transfer.status = ProjectTransfer.Status.ACCEPTED
    transfer.refunded_paise = refunded_total
    transfer.material_advance_outstanding_paise = material_outstanding
    transfer.applied_at = now
    transfer.save(
        update_fields=(
            "status",
            "refunded_paise",
            "material_advance_outstanding_paise",
            "decided_by",
            "decided_at",
            "applied_at",
            "updated_at",
        )
    )
    standing.record_event(
        partner=transfer.from_partner,
        kind=PartnerStandingEvent.Kind.PROJECT_ABANDONED,
        source_kind="project_transfer",
        source_id=transfer.id,
        reason=f"remaining milestones transferred: {transfer.reason_code}",
    )
    stages.record_event(
        engagement=engagement,
        stage=None,
        from_status=ProjectTransfer.Status.PROPOSED,
        to_status=transfer.status,
        actor=actor,
        reason_code="project_transfer_accepted",
        reason=(
            f"delta {transfer.delta_paise} paise; refunded {refunded_total} paise; "
            f"material advance outstanding {material_outstanding} paise"
        ),
    )
    enqueue_outbox_event(
        aggregate_type="engagement",
        aggregate_id=engagement.id,
        event_type="m2.project.transferred",
        idempotency_key=f"project-transferred:{transfer.id}",
        payload={
            "engagement_id": str(engagement.id),
            "project_transfer_id": str(transfer.id),
            "from_partner_id": str(transfer.from_partner_id),
            "to_partner_id": str(transfer.to_partner_id),
            "delta_paise": transfer.delta_paise,
            "refunded_paise": refunded_total,
            "material_advance_outstanding_paise": material_outstanding,
        },
    )
    return transfer


@transaction.atomic
def expire_project_transfer(*, project_transfer_id: uuid.UUID) -> ProjectTransfer:
    """Nobody answered. The vendor, the prices and the agreement all stay as they were."""
    transfer = ProjectTransfer.objects.select_for_update(of=("self",)).get(pk=project_transfer_id)
    if transfer.status != ProjectTransfer.Status.PROPOSED:
        return transfer
    if transfer.expires_at > timezone.now():
        return transfer
    transfer.status = ProjectTransfer.Status.EXPIRED
    transfer.save(update_fields=("status", "updated_at"))
    stages.record_event(
        engagement=transfer.engagement,
        stage=None,
        from_status=ProjectTransfer.Status.PROPOSED,
        to_status=transfer.status,
        actor=None,
        reason_code="project_transfer_expired",
    )
    return transfer


def expired_project_transfer_ids(*, at: datetime | None = None) -> list[uuid.UUID]:
    moment = at or timezone.now()
    return list(
        ProjectTransfer.objects.filter(
            status=ProjectTransfer.Status.PROPOSED,
            expires_at__lt=moment,
        ).values_list("id", flat=True)
    )


@transaction.atomic
def terminate_project_early(
    *, engagement_id: uuid.UUID, actor: User, reason_code: str, note: str = ""
) -> Engagement:
    """The project ends with work outstanding and no replacement. Operations command.

    **This is the second half of `M2-BE-543`** — the recovery rule a material advance needs and a
    work milestone must not share:

    * a funded, unearned **work** milestone is **refunded**. Vsolve is holding the Customer's
      money for work that is not going to happen, and there is no policy decision in giving it
      back — the absence of one is why this is safe to do without the owner's cancellation
      remedies;
    * a funded **material advance** is **not** refunded and not clawed back. The vendor spent it
      on goods. It is recorded on the cancelled stage with its own reason code and reaches
      Operations as an outstanding balance somebody has to resolve against the physical world.

    **What this command deliberately does not do is decide a remedy.** No penalty, no forfeit, no
    compensation, no standing consequence beyond recording that the project was abandoned. Who
    owes whom what when a project ends early is the cancellation policy engine, which is Wave C6
    (`M2-BE-701`, `706`), and guessing it inside a wave about milestones would put an unreviewed
    money branch where nobody would look for one. Returning money nobody earned is not a remedy;
    it is the absence of one.
    """
    engagement = _locked_engagement(engagement_id)
    assert_project_engagement(engagement)
    _assert_engagement_open(engagement)
    if not reason_code:
        raise StageTransitionError("Ending a project early needs a reason code.")

    now = timezone.now()
    refunded_total = 0
    material_outstanding = 0
    for stage in EngagementStage.objects.select_for_update().filter(
        engagement=engagement,
        status__in=EngagementStage.OPEN_STATUSES,
    ):
        is_material = stage.kind == EngagementStage.Kind.MATERIAL_ADVANCE
        held = stage.funded_paise - stage.refunded_amount_paise
        if is_material and held > 0:
            material_outstanding += held
            _cancel_stage(stage=stage, reason_code=CANCELLED_MATERIAL_OUTSTANDING, actor=actor)
            continue
        refunded_total += _return_unearned_funding(
            stage=stage,
            reason_code="m2_project_terminated",
        )
        _cancel_stage(stage=stage, reason_code=CANCELLED_BY_TERMINATION, actor=actor)

    Engagement.objects.filter(pk=engagement.id).update(
        status=Engagement.Status.CANCELLED,
        work_may_start_at=None,
        updated_at=now,
    )
    stages.record_event(
        engagement=engagement,
        stage=None,
        from_status=engagement.status,
        to_status=Engagement.Status.CANCELLED,
        actor=actor,
        reason_code="project_terminated_early",
        reason=(
            f"{reason_code}: refunded {refunded_total} paise; material advance outstanding "
            f"{material_outstanding} paise. {note.strip()}"
        )[:2000],
    )
    standing.record_event(
        partner=engagement.partner,
        kind=PartnerStandingEvent.Kind.PROJECT_ABANDONED,
        source_kind="engagement",
        source_id=engagement.id,
        reason=f"project ended early: {reason_code}",
    )
    services.close_requirement(
        requirement_id=engagement.requirement_id,
        status=CustomerRequirement.Status.CLOSED_CANCELLED,
        reason_code=reason_code[:80],
        actor=actor,
    )
    enqueue_outbox_event(
        aggregate_type="engagement",
        aggregate_id=engagement.id,
        event_type="m2.project.terminated",
        idempotency_key=f"project-terminated:{engagement.id}",
        payload={
            "engagement_id": str(engagement.id),
            "reason_code": reason_code,
            "refunded_paise": refunded_total,
            "material_advance_outstanding_paise": material_outstanding,
        },
    )
    engagement.refresh_from_db()
    return engagement


def _return_unearned_funding(*, stage: EngagementStage, reason_code: str) -> int:
    """Give back everything the Customer funded on this stage that nobody has earned.

    Returns the amount refunded, which is zero on an unfunded stage — the ordinary case, and not a
    failure: taking scope out of work nobody has paid for costs nobody anything.

    The stage drops back to `REQUIRED` afterwards, and that is what makes it safe to reprice: the
    `requirements_stage_funding_covers_amount` constraint only binds a stage that says it is
    `FUNDED`, and a stage whose funding has just been returned is not.
    """
    refundable = stage.funded_paise - stage.refunded_amount_paise - stage.released_amount_paise
    refunded = 0
    if refundable > 0:
        refund = stages.refund_stage_amount(
            stage_id=stage.id,
            amount_paise=refundable,
            reason_code=reason_code[:80],
        )
        if refund is not None:
            refunded = refundable
    locked = EngagementStage.objects.select_for_update().get(pk=stage.id)
    if locked.funding_state in (
        EngagementStage.FundingState.FUNDED,
        EngagementStage.FundingState.PENDING,
    ):
        locked.funding_state = EngagementStage.FundingState.REQUIRED
        locked.payment_attempt = None
        locked.funded_at = None
        locked.save(
            update_fields=("funding_state", "payment_attempt", "funded_at", "updated_at"),
        )
    return refunded


def _cancel_stage(
    *, stage: EngagementStage, reason_code: str, actor: User | None
) -> EngagementStage:
    """Take one milestone out of the live agreement, keeping every number it carries.

    `amount_paise`, `funded_paise` and `refunded_amount_paise` are all left exactly as they are,
    and the engagement's `staged_total_paise` does not move. That is deliberate: the agreement
    **was** that big, the money **was** collected, and shrinking the totals to make a cancelled
    project look tidy would erase the record a dispute reads. What changes is only that nobody
    owes work on this row any more.
    """
    locked = EngagementStage.objects.select_for_update().get(pk=stage.id)
    if locked.status == EngagementStage.Status.CANCELLED:
        return locked
    from_status = locked.status
    locked.status = EngagementStage.Status.CANCELLED
    locked.cancelled_at = timezone.now()
    locked.cancellation_reason_code = reason_code[:80]
    locked.save(
        update_fields=("status", "cancelled_at", "cancellation_reason_code", "updated_at"),
    )
    stages.record_event(
        engagement=locked.engagement,
        stage=locked,
        from_status=from_status,
        to_status=locked.status,
        actor=actor,
        reason_code="stage_cancelled",
        reason=reason_code,
    )
    return locked


# ---------------------------------------------------------------------------
# The read (`M2-BE-541`, `549`)
# ---------------------------------------------------------------------------


def milestone_rows(engagement: Engagement) -> list[dict[str, Any]]:
    """Every milestone, as agreed and as it stands now (`M2-BE-549`).

    The two readings sit side by side rather than one replacing the other, because "what did we
    agree" and "what is due" are different questions and a project screen that can only answer the
    second is useless in a dispute. `schedule_shift_days` is published rather than left to the
    client to subtract: a date difference computed in a browser is a date difference computed in
    whatever timezone the browser happens to be in.
    """
    rows: list[dict[str, Any]] = []
    for stage in EngagementStage.objects.filter(engagement=engagement).order_by("position"):
        original = stage.original_terms or {}
        original_scheduled = original.get("scheduled_on")
        shift_days: int | None = None
        if stage.scheduled_on is not None and isinstance(original_scheduled, str):
            try:
                shift_days = (stage.scheduled_on - date.fromisoformat(original_scheduled)).days
            except ValueError:
                shift_days = None
        rows.append(
            {
                "stage_id": stage.id,
                "position": stage.position,
                "milestone_label": stage.label,
                "deliverable": stage.deliverable,
                "kind": stage.kind,
                "amount_paise": stage.amount_paise,
                "scheduled_on": stage.scheduled_on,
                "status": stage.status,
                "funding_state": stage.funding_state,
                "funded_paise": stage.funded_paise,
                "refunded_amount_paise": stage.refunded_amount_paise,
                "cancellation_reason_code": stage.cancellation_reason_code,
                "original_milestone_label": str(original.get("label") or ""),
                "original_deliverable": str(original.get("deliverable") or ""),
                "original_amount_paise": int(original.get("amount_paise") or 0),
                "original_scheduled_on": original_scheduled,
                "schedule_shift_days": shift_days,
            }
        )
    return rows


def project_payload(engagement: Engagement) -> dict[str, Any]:
    """The whole A5 project as one read.

    One request rather than five, for the reason `shift_day_payload` gives on the other archetype:
    the milestone list, the money, the warranty, the handover and whatever recovery is in flight
    are the same screen at five moments of one project, and a client assembling them from five
    endpoints would render four of them against a state the fifth had already left.

    Reads only. Nothing here creates a row, so opening the screen changes nothing.
    """
    live_transfer = (
        ProjectTransfer.objects.filter(engagement=engagement)
        .order_by("-created_at")
        .select_related("to_partner", "from_partner")
        .first()
    )
    return {
        "engagement_id": engagement.id,
        "status": engagement.status,
        "commercial_mode": engagement.commercial_mode,
        "total_paise": engagement.total_paise,
        "staged_total_paise": engagement.staged_total_paise,
        "amendment_delta_paise": engagement.amendment_delta_paise,
        "funded_total_paise": engagement.funded_total_paise,
        "approved_total_paise": engagement.approved_total_paise,
        "released_total_paise": engagement.released_total_paise,
        "refunded_total_paise": engagement.refunded_total_paise,
        "retention_paise": engagement.retention_paise,
        "retention_withheld_paise": engagement.retention_withheld_paise,
        "warranty_ends_at": engagement.warranty_ends_at,
        "milestones": milestone_rows(engagement),
        "handover": {
            "submitted_at": engagement.handover_submitted_at,
            "accepted_at": engagement.handover_accepted_at,
            "note": engagement.handover_note,
            "deliverables": list(
                ProjectDeliverable.objects.filter(engagement=engagement).order_by("created_at")
            ),
        },
        "delay_claims": list(
            ProjectDelayClaim.objects.filter(engagement=engagement)
            .prefetch_related("evidence")
            .order_by("-created_at")
        ),
        "transfer": live_transfer,
    }


def live_delay_claim(stage: EngagementStage) -> ProjectDelayClaim | None:
    return ProjectDelayClaim.objects.filter(
        stage=stage,
        status__in=ProjectDelayClaim.LIVE_STATUSES,
    ).first()


def delay_claim_for_participant(*, user: User, delay_claim_id: uuid.UUID) -> ProjectDelayClaim:
    """One delay claim, if the caller is either party to its engagement. `404` otherwise."""
    claim = (
        ProjectDelayClaim.objects.select_related("engagement__partner", "stage")
        .filter(
            Q(engagement__customer=user) | Q(engagement__partner__user=user),
            id=delay_claim_id,
        )
        .first()
    )
    if claim is None:
        raise RequirementNotFoundError()
    return claim


def transfer_for_customer(*, customer: User, project_transfer_id: uuid.UUID) -> ProjectTransfer:
    """One transfer proposal, scoped to the Customer who has to decide it."""
    transfer = (
        ProjectTransfer.objects.select_related("engagement", "from_partner", "to_partner")
        .filter(engagement__customer=customer, id=project_transfer_id)
        .first()
    )
    if transfer is None:
        raise RequirementNotFoundError()
    return transfer
