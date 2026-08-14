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
from datetime import date, datetime, timedelta
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
    RateCardBooking,
    StageCrewAssignment,
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
        CustomerRequirement.objects.select_for_update(of=("self",))
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
        Proposal.objects.select_for_update(of=("self",))
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
        ProposalSelection.objects.select_for_update(of=("self",))
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


def shift_dates(requirement: CustomerRequirement, *, days: int) -> list[date | None]:
    """Which calendar day each A3 shift-day falls on (`M2-BE-521`).

    **This is the writer for `EngagementStage.scheduled_on` on the workforce path**, and it exists
    because the column had a reader and no writer: `workforce.shift_date_of` refuses to assign crew
    to an undated shift-day, and every A3 engagement was opened with `scheduled_on` null — so the
    whole per-stage assignment, conflict and attendance surface was unreachable in every
    environment. Consecutive days from the date the Customer asked for, which is the shape ADR-0009
    describes ("four helpers for two days of shifting") and the only one the preset collects.

    `None` — every entry — when the requirement carries no `requested_start`. Not today's date:
    a server-chosen working day would make the cross-agency conflict guard check a day nobody is
    working, which is a check that reads as passing while protecting nothing. An undated shift-day
    refuses crew assignment with a message Operations can act on instead.
    """
    start = requirement.requested_start
    if start is None:
        return [None] * days
    first = timezone.localtime(start).date()
    return [first + timedelta(days=offset) for offset in range(days)]


def _a3_stages(proposal: Proposal, *, requirement: CustomerRequirement) -> list[dict[str, Any]]:
    """One stage per shift-day. Amounts are server-calculated from the quoted rate.

    `M2-BE-413`: the client never supplies a total. A workforce quote is a rate per worker per day
    and a number of days, so the stage amounts are arithmetic over fields the wage-floor guard has
    already validated — not a number the composer sent.

    Each row also carries the day it is (`M2-BE-521`). The fallback quote flow lays out shift-days
    exactly as the rate-card path does, so its crew, attendance and settlement work identically —
    a vendor whose customer came through the fallback still has a Thursday to assign people to.
    """
    days = proposal.minimum_days or 1
    workers = proposal.worker_count or 1
    rate = proposal.rate_paise_per_worker_day or 0
    per_day = rate * workers
    scheduled = shift_dates(requirement, days=days)
    return [
        {"label": f"Day {index}", "amount_paise": per_day, "scheduled_on": scheduled[index - 1]}
        for index in range(1, days + 1)
    ]


def _a5_stages(proposal: Proposal) -> list[dict[str, Any]]:
    """Milestones, then material advances, as the vendor structured them.

    `proposals._assert_a5_shape` refuses a quote whose stage **and material** amounts do not add up
    to its total, so by the time an engagement is opened the breakdown is known to reconcile.

    Material lines land **after** every work milestone and carry `kind=MATERIAL_ADVANCE`
    (`M2-BE-543`). Two consequences, and both are the reason the column exists:

    * they fund through `PaymentAttempt.Purpose.M2_MATERIAL_ADVANCE` rather than
      `M2_STAGE_FUNDING`, so the ledger can tell an advance from a milestone payment;
    * they are **not** clawed back as unearned work when a capability is suspended — the vendor
      bought the cement, and refunding it would take money for goods that already exist.

    Placing them last is deliberate rather than cosmetic: `create_stage_funding_checkout` funds in
    position order, and a project whose first collection is a materials advance is the
    prepay-then-vanish shape staged funding exists to prevent. Work is funded first.
    """
    stage_rows: list[dict[str, Any]] = []
    for index, stage in enumerate(proposal.stages or [], start=1):
        stage_rows.append(
            {
                "label": str(stage.get("title") or stage.get("label") or f"Stage {index}"),
                # `M2-BE-541`: a milestone is what it *delivers*, not only what it costs. The
                # estimate already carried this (`ProposalStageSerializer.deliverable`, published
                # at 1.24.0) and the engagement threw it away, so the agreement a dispute reads
                # said "Stage 2, 80,000 paise" where the Customer had been shown "second coat and
                # snagging". Copied rather than read back through the proposal, because a proposal
                # is append-only and the vendor may supersede it after reconfirmation.
                "deliverable": str(stage.get("deliverable") or ""),
                "amount_paise": int(stage.get("amount_paise", 0)),
                "scheduled_on": stage.get("ends_on"),
                "kind": EngagementStage.Kind.WORK,
            }
        )
    for index, line in enumerate(proposal.material_lines or [], start=1):
        quantity = line.get("quantity")
        unit = str(line.get("unit") or "").strip()
        stage_rows.append(
            {
                "label": str(line.get("title") or f"Materials {index}"),
                # A material line's "deliverable" is the goods themselves, in the vendor's own
                # units. "40 bags" beside the amount is what makes an advance auditable at the
                # point somebody has to decide whether the cement exists (`M2-BE-543`).
                "deliverable": (
                    f"{quantity} {unit}".strip() if quantity and unit else str(unit or "")
                ),
                "amount_paise": int(line.get("amount_paise", 0)),
                "scheduled_on": None,
                "kind": EngagementStage.Kind.MATERIAL_ADVANCE,
            }
        )
    return stage_rows


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
    retention_paise = 0
    if not is_lead_only:
        commission_paise, commission_treatment = pricing.a5_commission(
            requirement, total_paise=proposal.total_paise
        )
        # `M2-BE-546`. Frozen here, from the configuration that was live when the agreement was
        # made, so a percentage Operations changes next month does not move a hold-back on a
        # project already under way. Zero when the estimate advertised no warranty — retention
        # secures a promise, and there is nothing to secure when none was made.
        #
        # `warranty_terms_or_none` rather than `warranty_terms`: `submit_proposal` already refused
        # an estimate that promises warranty a variant cannot fund, so reaching a missing
        # configuration here means Operations retired it in between — and stranding a Customer who
        # has paid for site visits, at the moment their chosen vendor commits, is the wrong place
        # to fail closed. The absence is recorded in the terms snapshot below.
        terms = pricing.warranty_terms_or_none(requirement)
        if terms is not None and proposal.warranty_terms.strip():
            retention_paise = terms.retention_paise(total_paise=proposal.total_paise)

    rows = _a3_stages(proposal, requirement=requirement) if is_lead_only else _a5_stages(proposal)
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
        retention_paise=retention_paise,
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
                deliverable=str(row.get("deliverable") or ""),
                amount_paise=int(row["amount_paise"]),
                kind=str(row.get("kind") or EngagementStage.Kind.WORK),
                scheduled_on=row.get("scheduled_on") or None,
                original_terms=stages.original_terms_of(row),
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
# A3 rate-card engagement (`M2-BE-432`, revision 4)
# ---------------------------------------------------------------------------


@transaction.atomic
def open_rate_card_engagement(*, booking_id: uuid.UUID) -> Engagement:
    """Open the A3 engagement the verified booking fee just bought.

    Called **only** from `booking_fees.complete_booking_fee`, inside the provider callback's own
    transaction. §4c: "only a verified provider callback moves `PENDING → ACTIVE`, and that same
    callback creates the engagement".

    Three things are deliberately different from the quote path, and all three follow from there
    being no proposal:

    1. **`selection` and `proposal` are null.** §1 never routes a rate-card requirement through
       `QUOTES_READY`, `UNLOCKED` or `SELECTED`, so there is no quote to point at. Fabricating one
       would put a proposal nobody wrote into the table a dispute reads.
    2. **`total_paise` is the lead's receipt, not the Customer's all-in total.** The engagement is
       the *work agreement*, and the work is paid peer-to-peer at the published wage plus
       supervision margin. The booking fee is Vsolve's own revenue with its own receipt — the same
       relationship the unlock fee has to an A3 quote engagement, where the fee is likewise not
       part of the agreed total.
    3. **The stages are shift-days at the published rate**, laid out here rather than by
       `_a3_stages`, which reads a proposal. Same arithmetic, same one-stage-per-day shape, same
       `NOT_REQUIRED` funding state — because A3 is `LEAD_ONLY` and Vsolve funds nothing.
    """
    booking = (
        RateCardBooking.objects.select_for_update(of=("self",))
        .select_related("requirement", "accepted_invitation__partner")
        .get(pk=booking_id)
    )
    existing = Engagement.objects.filter(requirement_id=booking.requirement_id).first()
    if existing is not None:
        # A re-driven callback finds the engagement it already created. `complete_booking_fee` is
        # idempotent on the fee row; this is the second lock on the same door.
        return existing
    invitation = booking.accepted_invitation
    if invitation is None:
        raise RequirementTransitionError("This booking has no confirmed crew.")

    requirement = booking.requirement
    now = timezone.now()
    per_day = booking.lead_day_receipt_paise
    engagement = Engagement.objects.create(
        requirement=requirement,
        selection=None,
        proposal=None,
        partner=invitation.partner,
        customer=requirement.customer,
        archetype=A3,
        commercial_mode=Engagement.CommercialMode.LEAD_ONLY,
        status=Engagement.Status.ACTIVE,
        total_paise=booking.lead_receipt_paise,
        tax_paise=0,
        # The published rate is what the Customer pays the lead; how that lead accounts for tax on
        # it is between them and the law. Recording a basis here would be this platform asserting a
        # treatment for money it never touches — and the GST question on the booking fee itself is
        # owner decision 5.
        tax_basis="UNKNOWN",
        commission_paise=0,
        commission_treatment="",
        staged_total_paise=per_day * booking.days,
        terms_snapshot={
            "source": "rate_card",
            "rate_card_id": str(booking.rate_card_id),
            "rate_card_booking_id": str(booking.id),
            "headcount": booking.headcount,
            "days": booking.days,
            "day_rate_paise": booking.day_rate_paise,
            "worker_day_wage_paise": booking.worker_day_wage_paise,
            "supervision_margin_paise": booking.supervision_margin_paise,
            "booking_fee_component_paise": booking.booking_fee_component_paise,
            "lead_day_receipt_paise": per_day,
            "lead_receipt_paise": booking.lead_receipt_paise,
            "booking_fee_paise": booking.booking_fee_paise,
            "total_customer_paise": booking.total_customer_paise,
            "standard_day_hours": booking.standard_day_hours,
            "overtime_hourly_paise": booking.overtime_hourly_paise,
            "add_on_rates": booking.add_on_rates,
            "inclusions": booking.inclusions,
        },
        # A3 *is* a connection: contact and work start the moment the fee is verified.
        contact_released_at=now,
        work_may_start_at=now,
    )
    # `M2-BE-521`: a shift-day is a *day*, and the date is what the whole of Wave C4 hangs off —
    # the cross-agency crew conflict rule is "this person, on this date", and it cannot run
    # against a null. Written here rather than left to be inferred later, because the requirement
    # knows the answer at exactly this moment and nothing downstream does.
    scheduled = shift_dates(requirement, days=booking.days)
    EngagementStage.objects.bulk_create(
        [
            EngagementStage(
                engagement=engagement,
                position=day,
                label=f"Day {day}",
                amount_paise=per_day,
                kind=EngagementStage.Kind.WORK,
                scheduled_on=scheduled[day - 1],
                # A3 shift-days get an original too, even though nothing on this path amends a
                # schedule today. `M2-BE-549` asks for the original beside the amended, and a
                # column written on one archetype and not the other is a column whose reader has
                # to know which archetype it is looking at before it can trust it.
                original_terms=stages.original_terms_of(
                    {
                        "label": f"Day {day}",
                        "amount_paise": per_day,
                        "scheduled_on": scheduled[day - 1],
                    }
                ),
                funding_state=EngagementStage.FundingState.NOT_REQUIRED,
            )
            for day in range(1, booking.days + 1)
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
        reason_code="booking_fee_verified",
        reason=f"engagement:{engagement.id} from rate_card_booking:{booking.id}",
    )
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


@transaction.atomic
def reopen_rate_card_engagement(*, booking_id: uuid.UUID) -> Engagement:
    """Put a replacement crew on the job after a vendor no-show (`M2-BE-719`).

    **The second engagement-opening path**, and the reason there had to be one is a hard structural
    fact rather than a preference: `Engagement.requirement` is a `OneToOneField`, so a re-dispatched
    requirement cannot have a second engagement. Wave C4 spotted the gap and deferred it; the free
    re-dispatch has been unreachable since, because `open_rate_card_engagement` finds the cancelled
    engagement, returns it untouched, and the replacement lead ends up attached to a cancelled
    agreement belonging to the vendor who never turned up.

    So the engagement is **re-pointed**, exactly as `projects.decide_project_transfer` re-points an
    abandoned A5 project. That is a reviewed pattern with a precedent rather than a novelty here,
    and the reason it is safe in both places is the same: the *agreement* has not changed. The
    Customer is owed the crew they booked — same headcount, same dates, same frozen rate, §4c's
    "at its original snapshot" — and what moved is only who is supplying it.

    Three things are handled that a naive re-point would leave behind:

    1. **The old lead's crew assignments are released.** A `StageCrewAssignment` names a worker on
       the abandoning agency's roster, and leaving it standing would both misrepresent who is
       coming and hold that worker's date against the cross-agency conflict index.
    2. **`terms_snapshot` gains the re-dispatch**, so a dispute reads that this engagement had two
       vendors and why, rather than silently showing the second one as if they had always been it.
    3. **Contact and work clearance are re-released**, because A3 is a connection and the Customer
       has a different number to ring.

    The shift-days themselves are **reused, not re-laid**, and the money columns do not move at
    all. §4c only ever reaches a vendor no-show from an `ACTIVE` fee — the fee earns at first-day
    arrival, so a no-show is by construction before any day was delivered — and re-laying days
    nobody worked would inflate `staged_total_paise` and force a matching movement in
    `amendment_delta_paise`, recording an amendment that nobody proposed and nobody accepted. A
    stage that has actually progressed therefore **refuses** rather than being reset: a vendor
    walking off mid-job is a different remedy, and it is not this one.
    """
    booking = (
        RateCardBooking.objects.select_for_update(of=("self",))
        .select_related("requirement", "accepted_invitation__partner")
        .get(pk=booking_id)
    )
    invitation = booking.accepted_invitation
    if invitation is None:
        raise RequirementTransitionError("This booking has no confirmed crew.")
    engagement = (
        Engagement.objects.select_for_update().filter(requirement=booking.requirement).first()
    )
    if engagement is None:
        # Nothing to reopen — the no-show landed before an engagement ever existed, which the
        # ordinary path handles.
        return open_rate_card_engagement(booking_id=booking.id)
    if engagement.partner_id == invitation.partner_id and engagement.status in (
        Engagement.Status.ACTIVE,
        Engagement.Status.PENDING_START,
    ):
        # Already re-pointed by an earlier delivery of the same command.
        return engagement

    requirement = booking.requirement
    now = timezone.now()
    previous_partner_id = engagement.partner_id

    progressed = (
        EngagementStage.objects.filter(engagement=engagement)
        .exclude(
            status__in=(EngagementStage.Status.PENDING, EngagementStage.Status.CANCELLED),
        )
        .exists()
    )
    if progressed:
        raise RequirementTransitionError(
            "Work has already been recorded on this booking, so it cannot be re-dispatched as "
            "though nothing happened. Support can help.",
        )
    StageCrewAssignment.objects.filter(
        stage__engagement=engagement,
        status=StageCrewAssignment.Status.ASSIGNED,
    ).update(
        status=StageCrewAssignment.Status.RELEASED,
        released_at=now,
        released_reason_code="vendor_no_show_redispatch",
        updated_at=now,
    )

    snapshot = dict(engagement.terms_snapshot)
    redispatches = list(snapshot.get("redispatches", []))
    redispatches.append(
        {
            "at": now.isoformat(),
            "from_partner_id": str(previous_partner_id),
            "to_partner_id": str(invitation.partner_id),
            "reason_code": "vendor_no_show",
        }
    )
    snapshot["redispatches"] = redispatches
    Engagement.objects.filter(pk=engagement.id).update(
        partner=invitation.partner,
        status=Engagement.Status.ACTIVE,
        terms_snapshot=snapshot,
        contact_released_at=now,
        work_may_start_at=now,
        updated_at=now,
    )
    engagement.refresh_from_db()
    stages.record_event(
        engagement=engagement,
        stage=None,
        from_status=Engagement.Status.CANCELLED,
        to_status=engagement.status,
        actor=None,
        reason_code="vendor_no_show_free_redispatch",
        reason=f"partner {previous_partner_id} -> {invitation.partner_id}",
    )
    if requirement.status != CustomerRequirement.Status.ENGAGED:
        from_status = requirement.status
        requirement.status = CustomerRequirement.Status.ENGAGED
        requirement.save(update_fields=("status", "updated_at"))
        record_transition(
            requirement=requirement,
            from_status=from_status,
            to_status=requirement.status,
            actor=None,
            reason_code="free_redispatch_confirmed",
            reason=f"engagement:{engagement.id} re-pointed to partner {invitation.partner_id}",
        )
    enqueue_outbox_event(
        aggregate_type="requirement",
        aggregate_id=requirement.id,
        event_type="m2.engagement.redispatched",
        idempotency_key=f"engagement-redispatched:{engagement.id}:{invitation.id}",
        payload={
            "requirement_id": str(requirement.id),
            "engagement_id": str(engagement.id),
            "rate_card_booking_id": str(booking.id),
            "from_partner_id": str(previous_partner_id),
            "to_partner_id": str(invitation.partner_id),
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

    # A material advance is a different money purpose from a work milestone (`M2-BE-543`), and the
    # purpose is what carries that difference into the ledger, the reconciliation report and the
    # refund rules. Same table, same capture path, same face-value rule — a different name for
    # money that is spent rather than earned.
    attempt = initiate_standalone_payment_attempt(
        purpose=(
            PaymentAttempt.Purpose.M2_MATERIAL_ADVANCE
            if stage.kind == EngagementStage.Kind.MATERIAL_ADVANCE
            else PaymentAttempt.Purpose.M2_STAGE_FUNDING
        ),
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
        EngagementStage.objects.select_for_update(of=("self",))
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
    * **A funded *work* stage nobody has started is refunded.** Vsolve is holding money for work
      this vendor is no longer permitted to do.
    * **A funded *material advance* is never swept back.** `README.md`: material money is spent,
      not earned. The vendor has bought the cement, so the money is gone in the physical world and
      refunding it automatically would be Vsolve deciding a goods dispute with a cron job. It is
      flagged for replacement instead, which is where a human decides whether the materials exist
      and who they belong to (`M2-BE-543`).
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
            is_material = stage.kind == EngagementStage.Kind.MATERIAL_ADVANCE
            if unstarted and not is_material and stage.funded_paise > stage.refunded_amount_paise:
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
            if not unstarted or (is_material and stage.funded_paise > 0):
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
