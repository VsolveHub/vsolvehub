"""Selection, vendor reconfirmation and the engagement both archetypes run on.

**Selection is not a booking.** A Customer choosing a proposal starts a clock, not a job: the
vendor has to reconfirm price, date and capacity, and the checks that ran when they quoted are run
again at the moment they commit. A capability suspended in between, a diary that filled, a quote
whose validity elapsed — all of them have to bite here, because this is the last point at which
either party can walk away cheaply.

When a vendor declines or the clock runs out, **the Customer's entitlement survives**. The unlock
(A3) or the visit plan (A5) is not consumed by a selection that failed, and the next quote,
estimate or replacement visit costs nothing more. That single rule is what stops a timeout from
becoming a second purchase.

One spine, two archetypes:

* **A3 is `LEAD_ONLY`.** The engagement *is* the connection: contact is released, work may start,
  and Vsolve's revenue was the unlock fee. No commission is recorded, because Vsolve does not
  collect the service payment and booking a commission against money it never touches would be
  fiction.
* **A5 is `MANAGED_PAYMENT_REQUIRED`.** The engagement opens, stages are frozen at their quoted
  amounts, and nothing starts until the first stage is funded **at face value** — the visit money
  settled per share and never discounts a stage.

Wave C2 creates this aggregate and freezes its terms. The stage command spine — evidence,
approval, correction, dispute, release — is Wave C3 and is deliberately absent here rather than
half-built.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.catalog.models import ServiceVariant
from apps.commerce.models import PaymentAttempt
from apps.commerce.services import initiate_standalone_payment_attempt
from apps.foundation.services import enqueue_outbox_event
from apps.identity.models import User
from apps.partners.capabilities import assert_capability_active
from apps.requirements import access, matching, pricing, stages
from apps.requirements.exceptions import (
    CapacityUnavailableError,
    ProposalNotSelectableError,
    ReconfirmationExpiredError,
    RequirementTransitionError,
    SelectionConflictError,
    StageNotFundedError,
    UnlockRequiredError,
    VisitPlanRequiredError,
)
from apps.requirements.models import (
    CustomerRequirement,
    Engagement,
    EngagementStage,
    Proposal,
    ProposalSelection,
    VendorInvitation,
)
from apps.requirements.services import record_transition

A3 = ServiceVariant.BookingArchetype.A3_TIME_BLOCK
A5 = ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT


def _assert_customer_may_select(requirement: CustomerRequirement) -> None:
    """The paywall, applied where it decides something rather than where it is displayed.

    A3 needs a paid unlock; A5 needs a charged plan. Checking it here rather than only on the read
    is the difference between hiding a button and enforcing a rule.
    """
    if requirement.archetype == A5:
        if access.charged_visit_plan(requirement) is None:
            raise VisitPlanRequiredError()
        return
    if access.active_unlock(requirement) is None:
        raise UnlockRequiredError()


@transaction.atomic
def select_proposal(
    *, requirement_id: uuid.UUID, proposal_id: uuid.UUID, actor: User
) -> ProposalSelection:
    """Choose one vendor (`M2-BE-407`).

    The requirement row is locked first and the uniqueness of a live selection is a database
    constraint, so two sessions racing produce one selection and one `m2_selection_conflict` — not
    two engagements against one requirement, which is the failure the withdrawn "multiple lots"
    allowance would have made routine.
    """
    requirement = (
        CustomerRequirement.objects.select_for_update()
        .select_related("configuration")
        .get(pk=requirement_id)
    )
    if requirement.status in CustomerRequirement.CLOSED_STATUSES:
        raise RequirementTransitionError("This request is closed.")
    _assert_customer_may_select(requirement)

    if ProposalSelection.objects.filter(
        requirement=requirement,
        status__in=ProposalSelection.LIVE_STATUSES,
    ).exists():
        raise SelectionConflictError()

    proposal = (
        Proposal.objects.select_for_update()
        .select_related("invitation", "partner", "site_visit")
        .get(pk=proposal_id, requirement=requirement)
    )
    if proposal.status != Proposal.Status.SUBMITTED:
        raise ProposalNotSelectableError("This quote can no longer be selected.")
    if proposal.vendor_confirmed_at is None:
        raise ProposalNotSelectableError("This quote has not been confirmed by the vendor yet.")
    if proposal.valid_until is not None and proposal.valid_until <= timezone.now():
        raise ProposalNotSelectableError(
            "This quote's validity has passed. Ask the vendor to re-validate it.",
        )
    if requirement.archetype == A5 and proposal.site_visit_id is None:
        raise ProposalNotSelectableError("An estimate must come from a completed site visit.")

    selection = ProposalSelection.objects.create(
        requirement=requirement,
        proposal=proposal,
        partner=proposal.partner,
        reconfirm_by=pricing.reconfirmation_deadline(requirement),
    )
    proposal.status = Proposal.Status.SELECTED
    proposal.save(update_fields=("status", "updated_at"))
    from_status = requirement.status
    requirement.status = CustomerRequirement.Status.SELECTED
    requirement.save(update_fields=("status", "updated_at"))
    # The one command in M2 that commits a Customer to a named vendor, so the actor is recorded
    # rather than inferred from the requirement's owner: Operations can act on a Customer's behalf
    # elsewhere in this system, and "the Customer chose" and "somebody chose for them" must not be
    # the same row.
    record_transition(
        requirement=requirement,
        from_status=from_status,
        to_status=requirement.status,
        actor=actor,
        reason_code="proposal_selected",
        reason=f"proposal:{proposal.id} partner:{proposal.partner_id}",
    )
    enqueue_outbox_event(
        aggregate_type="requirement",
        aggregate_id=requirement.id,
        event_type="m2.proposal.selected",
        idempotency_key=f"proposal-selected:{selection.id}",
        payload={
            "requirement_id": str(requirement.id),
            "selection_id": str(selection.id),
            "proposal_id": str(proposal.id),
        },
    )
    return selection


def _restore_after_failed_selection(requirement: CustomerRequirement) -> None:
    """Put the requirement back where the Customer can choose again, entitlement intact.

    A3 returns to `UNLOCKED` and A5 to `QUOTES_READY` — the two states in which the paywall is
    already satisfied. Neither the unlock nor the plan is touched: the Customer paid for access to
    a set of quotes, and a vendor who changed their mind does not take that away.
    """
    if requirement.status != CustomerRequirement.Status.SELECTED:
        return
    requirement.status = (
        CustomerRequirement.Status.UNLOCKED
        if requirement.archetype == A3
        else CustomerRequirement.Status.QUOTES_READY
    )
    requirement.save(update_fields=("status", "updated_at"))
    record_transition(
        requirement=requirement,
        from_status=CustomerRequirement.Status.SELECTED,
        to_status=requirement.status,
        actor=None,
        reason_code="selection_released",
        reason="entitlement preserved; no new charge",
    )


@transaction.atomic
def decline_selection(*, selection_id: uuid.UUID, reason_code: str) -> ProposalSelection:
    """The vendor says no after being chosen (`M2-BE-409`)."""
    selection = (
        ProposalSelection.objects.select_for_update()
        .select_related("requirement", "proposal")
        .get(pk=selection_id)
    )
    if selection.status != ProposalSelection.Status.PENDING_RECONFIRMATION:
        return selection
    selection.status = ProposalSelection.Status.DECLINED
    selection.decline_reason_code = reason_code or "vendor_declined"
    selection.decided_at = timezone.now()
    selection.save(update_fields=("status", "decline_reason_code", "decided_at", "updated_at"))
    _lapse_proposal(selection.proposal)
    requirement = CustomerRequirement.objects.select_for_update().get(pk=selection.requirement_id)
    _restore_after_failed_selection(requirement)
    return selection


@transaction.atomic
def expire_selection(*, selection_id: uuid.UUID) -> ProposalSelection:
    """The reconfirmation clock ran out. Idempotent by state, for overlapping sweeps."""
    selection = (
        ProposalSelection.objects.select_for_update()
        .select_related("requirement", "proposal")
        .get(pk=selection_id)
    )
    if selection.status != ProposalSelection.Status.PENDING_RECONFIRMATION:
        return selection
    selection.status = ProposalSelection.Status.EXPIRED
    selection.decided_at = timezone.now()
    selection.save(update_fields=("status", "decided_at", "updated_at"))
    _lapse_proposal(selection.proposal)
    requirement = CustomerRequirement.objects.select_for_update().get(pk=selection.requirement_id)
    _restore_after_failed_selection(requirement)
    return selection


def _lapse_proposal(proposal: Proposal) -> None:
    """`LAPSED`, never `REJECTED`.

    `REJECTED` is the Customer's refusal. A vendor reading "rejected" against their own timeout
    would be told the wrong story about their own standing, which is why
    `07-state-machines-and-permissions.md` §3 names the two ends of a selection separately.
    """
    if proposal.status == Proposal.Status.SELECTED:
        proposal.status = Proposal.Status.LAPSED
        proposal.save(update_fields=("status", "updated_at"))


def expired_selection_ids(*, at: datetime | None = None) -> list[uuid.UUID]:
    moment = at or timezone.now()
    return list(
        ProposalSelection.objects.filter(
            status=ProposalSelection.Status.PENDING_RECONFIRMATION,
            reconfirm_by__isnull=False,
            reconfirm_by__lt=moment,
        ).values_list("id", flat=True)
    )


@transaction.atomic
def reconfirm_selection(*, selection_id: uuid.UUID) -> Engagement:
    """The vendor commits, and the engagement opens (`M2-BE-408`, `411`, `412`).

    Everything is re-checked here rather than trusted from quoting time: the capability is
    re-asserted against the requirement's own area and start date, the vendor's diary is consulted
    again, and the quote's validity is re-read. A vendor whose approval lapsed between quoting and
    committing must not end up holding authorized money against unauthorized work.
    """
    selection = (
        ProposalSelection.objects.select_for_update()
        .select_related("requirement__configuration", "proposal", "partner")
        .get(pk=selection_id)
    )
    if selection.status == ProposalSelection.Status.CONFIRMED:
        return Engagement.objects.get(selection=selection)
    if selection.status != ProposalSelection.Status.PENDING_RECONFIRMATION:
        raise RequirementTransitionError("This selection is no longer awaiting confirmation.")
    if selection.reconfirm_by is not None and selection.reconfirm_by <= timezone.now():
        # Expire it here rather than waiting for the sweep. A vendor arriving one minute late must
        # not find the door still open, and the Customer's requirement must not sit in `SELECTED`
        # until a tick notices.
        expire_selection(selection_id=selection.id)
        raise ReconfirmationExpiredError()

    requirement = CustomerRequirement.objects.select_for_update().get(pk=selection.requirement_id)
    proposal = selection.proposal
    if proposal.valid_until is not None and proposal.valid_until <= timezone.now():
        raise ProposalNotSelectableError("This quote's validity has passed.")

    # Re-check the capability against this requirement's area and start date. Not a duplicate of
    # the acceptance check: months of calendar and coverage changes can sit between the two.
    assert_capability_active(
        partner=selection.partner,
        variant=requirement.variant,
        service_area=requirement.service_area,
        on_day=(
            requirement.requested_start.date() if requirement.requested_start is not None else None
        ),
    )
    # The vendor's own diary, at the moment of commitment. `committed_capacity_partner_ids` reads
    # both notions of busy — M2 holds from other enquiries and A1 bookings on the shared grid —
    # and this vendor's own hold for *this* requirement is excluded by the invitation filter below.
    conflicting = matching.committed_capacity_partner_ids(
        requirement=requirement,
        partner_ids=[selection.partner_id],
    )
    if selection.partner_id in conflicting and not _hold_belongs_to_this_requirement(
        requirement=requirement, partner_id=selection.partner_id
    ):
        raise CapacityUnavailableError()

    selection.status = ProposalSelection.Status.CONFIRMED
    selection.decided_at = timezone.now()
    selection.save(update_fields=("status", "decided_at", "updated_at"))
    proposal.status = Proposal.Status.ACCEPTED
    proposal.save(update_fields=("status", "updated_at"))
    return _open_engagement(requirement=requirement, selection=selection, proposal=proposal)


def _hold_belongs_to_this_requirement(
    *, requirement: CustomerRequirement, partner_id: uuid.UUID
) -> bool:
    """Is the capacity conflict this vendor's own hold for this very job?

    Without this, reconfirmation would refuse every vendor whose soft hold it created itself at
    acceptance — the guard would fire on its own footprint.
    """
    return VendorInvitation.objects.filter(
        requirement=requirement,
        partner_id=partner_id,
        capacity_hold__status="ACTIVE",
    ).exists()


def _proposal_terms(proposal: Proposal) -> dict[str, Any]:
    """The immutable copy a dispute reads years later."""
    return {
        "proposal_id": str(proposal.id),
        "revision": proposal.revision,
        "total_paise": proposal.total_paise,
        "tax_paise": proposal.tax_paise,
        "tax_basis": proposal.tax_basis,
        "rate_paise_per_worker_day": proposal.rate_paise_per_worker_day,
        "minimum_days": proposal.minimum_days,
        "worker_count": proposal.worker_count,
        "inclusions": proposal.inclusions,
        "exclusions": proposal.exclusions,
        "stages": proposal.stages,
        "warranty_terms": proposal.warranty_terms,
        "valid_until": proposal.valid_until.isoformat() if proposal.valid_until else None,
        "site_visit_id": str(proposal.site_visit_id) if proposal.site_visit_id else None,
    }


def _a3_stages(proposal: Proposal) -> list[dict[str, Any]]:
    """One stage per shift-day. Amounts are server-calculated from the quoted rate.

    `M2-BE-413`: the client never supplies a total. A workforce quote is a rate per worker per day
    and a number of days, so the stage amounts are arithmetic over fields the wage-floor guard has
    already validated — not a number the composer sent.
    """
    days = proposal.minimum_days or 1
    workers = proposal.worker_count or 1
    rate = proposal.rate_paise_per_worker_day or 0
    per_day = rate * workers
    return [{"label": f"Day {index}", "amount_paise": per_day} for index in range(1, days + 1)]


def _a5_stages(proposal: Proposal) -> list[dict[str, Any]]:
    """Milestones, as the vendor structured them and the composer already reconciled.

    `proposals._assert_a5_shape` refuses a quote whose stage amounts do not add up to its total, so
    by the time an engagement is opened the breakdown is known to reconcile.
    """
    stages: list[dict[str, Any]] = []
    for index, stage in enumerate(proposal.stages or [], start=1):
        stages.append(
            {
                "label": str(stage.get("title") or stage.get("label") or f"Stage {index}"),
                "amount_paise": int(stage.get("amount_paise", 0)),
                "scheduled_on": stage.get("ends_on"),
            }
        )
    return stages


def _open_engagement(
    *,
    requirement: CustomerRequirement,
    selection: ProposalSelection,
    proposal: Proposal,
) -> Engagement:
    """Freeze the agreement and lay out its stages (`M2-BE-411`, `412`, `413`, `416`)."""
    now = timezone.now()
    is_lead_only = requirement.archetype == A3
    commission_paise = 0
    commission_treatment = ""
    if not is_lead_only:
        commission_paise, commission_treatment = pricing.a5_commission(
            requirement, total_paise=proposal.total_paise
        )

    rows = _a3_stages(proposal) if is_lead_only else _a5_stages(proposal)
    staged_total = sum(int(row["amount_paise"]) for row in rows)
    if staged_total != proposal.total_paise:
        # `M2-BE-504` at the one moment it can still be prevented rather than reported. The stage
        # breakdown *is* the agreement, so a breakdown that does not add up to the agreed total is
        # an engagement whose money can never reconcile — and the database constraint below would
        # refuse it anyway, as a 500 rather than as a sentence anybody can act on.
        raise RequirementTransitionError(
            "This quote's stage amounts no longer add up to its total. Ask the vendor to "
            "re-submit it.",
        )

    engagement = Engagement.objects.create(
        requirement=requirement,
        selection=selection,
        proposal=proposal,
        partner=selection.partner,
        customer=requirement.customer,
        archetype=requirement.archetype,
        commercial_mode=(
            Engagement.CommercialMode.LEAD_ONLY
            if is_lead_only
            else Engagement.CommercialMode.MANAGED_PAYMENT_REQUIRED
        ),
        status=Engagement.Status.ACTIVE if is_lead_only else Engagement.Status.PENDING_START,
        total_paise=proposal.total_paise,
        tax_paise=proposal.tax_paise,
        tax_basis=proposal.tax_basis,
        commission_paise=commission_paise,
        commission_treatment=commission_treatment,
        # The reconciliation column `M2-BE-504` checks against. Equal to `total_paise` at
        # creation, because no amendment has moved anything yet.
        staged_total_paise=staged_total,
        terms_snapshot=_proposal_terms(proposal),
        # `M2-BE-416`, and the one place the two commercial modes visibly diverge. A3 *is* a
        # connection, so contact and work start the moment it opens. A5 releases neither until the
        # first stage is funded — managed work that starts unfunded has no protection behind it,
        # and telling a Customer otherwise is the promise this platform cannot keep.
        contact_released_at=now if is_lead_only else None,
        work_may_start_at=now if is_lead_only else None,
    )

    EngagementStage.objects.bulk_create(
        [
            EngagementStage(
                engagement=engagement,
                position=position,
                label=row["label"][:200],
                amount_paise=int(row["amount_paise"]),
                scheduled_on=row.get("scheduled_on") or None,
                funding_state=(
                    EngagementStage.FundingState.NOT_REQUIRED
                    if is_lead_only
                    else EngagementStage.FundingState.REQUIRED
                ),
            )
            for position, row in enumerate(rows, start=1)
        ]
    )

    from_status = requirement.status
    requirement.status = CustomerRequirement.Status.ENGAGED
    requirement.save(update_fields=("status", "updated_at"))
    record_transition(
        requirement=requirement,
        from_status=from_status,
        to_status=requirement.status,
        actor=None,
        reason_code="vendor_reconfirmed",
        reason=f"engagement:{engagement.id} mode:{engagement.commercial_mode}",
    )
    if is_lead_only:
        # The A3 fee is earned from this point. It is not refunded for a change of mind afterwards,
        # which the Customer was told before they paid it.
        access.consume_unlock(requirement=requirement)
    enqueue_outbox_event(
        aggregate_type="requirement",
        aggregate_id=requirement.id,
        event_type="m2.engagement.opened",
        idempotency_key=f"engagement-opened:{engagement.id}",
        payload={
            "requirement_id": str(requirement.id),
            "engagement_id": str(engagement.id),
            "commercial_mode": engagement.commercial_mode,
        },
    )
    return engagement


# ---------------------------------------------------------------------------
# A5 stage funding (`M2-BE-412`, `413`)
# ---------------------------------------------------------------------------


@transaction.atomic
def create_stage_funding_checkout(
    *, stage_id: uuid.UUID, actor: User, idempotency_key: str
) -> tuple[EngagementStage, PaymentAttempt]:
    """Fund one stage, at face value.

    **At face value** is the load-bearing phrase. The visit-plan money was spent on the visits and
    settles per share; discounting a stage by it would pay for those visits a second time, out of
    the vendor's work. There is no stage credit in this model.

    Stages fund one at a time and in order. Collecting the whole project because a proposal was
    accepted is the thing `README.md` explicitly forbids.
    """
    stage = (
        EngagementStage.objects.select_for_update()
        .select_related("engagement__requirement")
        .get(pk=stage_id)
    )
    engagement = stage.engagement
    if engagement.commercial_mode != Engagement.CommercialMode.MANAGED_PAYMENT_REQUIRED:
        raise StageNotFundedError("This engagement is paid directly to the vendor.")
    if stage.funding_state == EngagementStage.FundingState.FUNDED:
        raise StageNotFundedError("This stage is already funded.")
    if stage.funding_state == EngagementStage.FundingState.PENDING and (
        stage.payment_attempt is not None
    ):
        return stage, stage.payment_attempt
    unfunded_earlier = (
        EngagementStage.objects.filter(engagement=engagement, position__lt=stage.position)
        .exclude(funding_state=EngagementStage.FundingState.FUNDED)
        .exists()
    )
    if unfunded_earlier:
        raise StageNotFundedError("Fund the earlier stages of this project first.")

    attempt = initiate_standalone_payment_attempt(
        purpose=PaymentAttempt.Purpose.M2_STAGE_FUNDING,
        amount_paise=stage.amount_paise,
        idempotency_key=idempotency_key,
    )
    stage.funding_state = EngagementStage.FundingState.PENDING
    stage.payment_attempt = attempt
    stage.save(update_fields=("funding_state", "payment_attempt", "updated_at"))
    requirement = engagement.requirement
    record_transition(
        requirement=requirement,
        from_status=requirement.status,
        to_status=requirement.status,
        actor=actor,
        reason_code="stage_funding_started",
        reason=f"stage:{stage.id} position:{stage.position} for {stage.amount_paise} paise",
    )
    return stage, attempt


@transaction.atomic
def complete_stage_funding(*, payment_attempt_id: uuid.UUID) -> EngagementStage | None:
    """Verified callback only. Funding the first stage is what starts an A5 project."""
    stage = (
        EngagementStage.objects.select_for_update()
        .select_related("engagement", "payment_attempt")
        .filter(payment_attempt_id=payment_attempt_id)
        .first()
    )
    if stage is None:
        return None
    if stage.funding_state == EngagementStage.FundingState.FUNDED:
        return stage
    attempt = stage.payment_attempt
    if attempt is None or attempt.status != PaymentAttempt.Status.CAPTURED:
        return stage
    if attempt.amount_paise != stage.amount_paise:
        # A stage funds at face value or it does not fund. A short payment leaves the stage
        # unfunded and visible in reconciliation rather than quietly starting work.
        return stage

    now = timezone.now()
    stage.funding_state = EngagementStage.FundingState.FUNDED
    stage.funded_at = now
    stage.funded_paise = attempt.amount_paise
    stage.status = EngagementStage.Status.IN_PROGRESS
    stage.started_at = stage.started_at or now
    stage.save(
        update_fields=(
            "funding_state",
            "funded_at",
            "funded_paise",
            "status",
            "started_at",
            "updated_at",
        )
    )
    stages.add_engagement_money(stage.engagement_id, funded_total_paise=attempt.amount_paise)
    stages.record_event(
        engagement=stage.engagement,
        stage=stage,
        from_status=EngagementStage.Status.PENDING,
        to_status=stage.status,
        actor=None,
        reason_code="stage_funding_verified",
        reason=f"{attempt.amount_paise} paise",
    )

    engagement = Engagement.objects.select_for_update().get(pk=stage.engagement_id)
    if engagement.work_may_start_at is None:
        engagement.work_may_start_at = now
        engagement.contact_released_at = now
        engagement.status = Engagement.Status.ACTIVE
        engagement.save(
            update_fields=(
                "work_may_start_at",
                "contact_released_at",
                "status",
                "updated_at",
            )
        )
    return stage


# ---------------------------------------------------------------------------
# Capability suspension (`M2-BE-509`, and the unblock for `M2-BE-113`)
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class SuspensionRouting:
    """What a suspension actually did to the money already committed against a capability."""

    #: Every live engagement the suspension touched.
    engagement_ids: tuple[uuid.UUID, ...]
    #: Engagements whose remaining work is now blocked and needs a replacement vendor.
    replacement_engagement_ids: tuple[uuid.UUID, ...]
    #: Stages whose funding was returned because no work had started against it.
    refunded_stage_ids: tuple[uuid.UUID, ...]


def capability_engagements(
    *, partner_id: uuid.UUID, variant_ids: list[uuid.UUID]
) -> list[Engagement]:
    """Live engagements a suspended capability was authorizing.

    Scoped by the variants the capability covers rather than by the Partner alone: a vendor
    suspended for workforce supply may hold perfectly valid project engagements, and sweeping
    those into a replacement queue would punish work the suspension says nothing about.
    """
    return list(
        Engagement.objects.select_for_update()
        .select_related("requirement")
        .filter(
            partner_id=partner_id,
            requirement__variant_id__in=variant_ids,
            status__in=(
                Engagement.Status.PENDING_START,
                Engagement.Status.ACTIVE,
                Engagement.Status.DISPUTED,
            ),
        )
    )


@transaction.atomic
def route_suspended_capability_engagements(
    *, partner_id: uuid.UUID, variant_ids: list[uuid.UUID], reason_code: str
) -> SuspensionRouting:
    """Send funded or committed work somewhere safe when a capability is suspended.

    **This is `M2-BE-113`, blocked since 10 August on the aggregate that did not exist until Wave
    C2 and the stage money that did not exist until this one.** `README.md` states the rule it
    implements: a capability suspended after selection is not only a Partner problem, because the
    platform is otherwise left holding authorized money against unauthorized work.

    Three outcomes, and which one applies is decided per stage rather than per engagement, because
    a half-finished project is exactly the case where one answer for the whole agreement is wrong:

    * **Work already approved or released stays settled.** It happened, the vendor did it, and a
      suspension is not a reason to claw back money for work a Customer accepted.
    * **A funded stage nobody has started is refunded.** Vsolve is holding money for work this
      vendor is no longer permitted to do.
    * **Everything else is flagged for replacement.** A stage in progress or awaiting review is a
      judgement call — did the work happen? — and `README.md` is explicit that Operations makes it
      through a case rather than a sweep guessing.

    The engagement is not cancelled. Cancelling it would take the Customer's dispute rights and
    their evidence with it, and the Customer's problem is an unfinished building rather than a
    ledger entry.
    """
    touched: list[uuid.UUID] = []
    replacements: list[uuid.UUID] = []
    refunded: list[uuid.UUID] = []
    for engagement in capability_engagements(partner_id=partner_id, variant_ids=variant_ids):
        touched.append(engagement.id)
        needs_replacement = False
        for stage in EngagementStage.objects.select_for_update().filter(
            engagement=engagement,
            status__in=EngagementStage.OPEN_STATUSES,
        ):
            unstarted = stage.status == EngagementStage.Status.PENDING
            if unstarted and stage.funded_paise > stage.refunded_amount_paise:
                refundable = stage.funded_paise - stage.refunded_amount_paise
                if (
                    stages.refund_stage_amount(
                        stage_id=stage.id,
                        amount_paise=refundable,
                        reason_code=f"m2_capability_suspended:{reason_code}"[:80],
                    )
                    is not None
                ):
                    refunded.append(stage.id)
            if not unstarted:
                needs_replacement = True
        if needs_replacement:
            replacements.append(engagement.id)
        stages.record_event(
            engagement=engagement,
            stage=None,
            from_status=engagement.status,
            to_status=engagement.status,
            actor=None,
            reason_code="capability_suspended",
            reason=reason_code,
        )
        enqueue_outbox_event(
            aggregate_type="engagement",
            aggregate_id=engagement.id,
            event_type="m2.engagement.capability_suspended",
            idempotency_key=f"engagement-capability-suspended:{engagement.id}:{reason_code}",
            payload={
                "engagement_id": str(engagement.id),
                "partner_id": str(partner_id),
                "reason_code": reason_code,
                "needs_replacement": needs_replacement,
            },
        )
    return SuspensionRouting(
        engagement_ids=tuple(touched),
        replacement_engagement_ids=tuple(replacements),
        refunded_stage_ids=tuple(refunded),
    )
