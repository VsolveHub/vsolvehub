"""Calling a job off: the evaluation, the counterparty's answer, and the money.

`M2-BE-701`, `702` and `706`, and the shape follows from one observation about ordering.

**The evaluation is written before anything is executed.** `M2-BE-701` asks for a record carrying
"lifecycle state, actor, reason, evidence, contact-disclosure state, fulfilment evidence and
calculated remedy", and every one of those facts stops being knowable the instant the cancellation
runs: the engagement is cancelled, the booking is closed, the stages are gone. A remedy calculated
afterwards would be a remedy calculated against the wreckage. So `evaluate` writes the row, and
`_execute` is a separate step that may not run for hours — or, if the counterparty disputes, ever.

**The remedy is read, never invented.** Every number comes from the money module that owns it:
`booking_fees` for the A3 booking fee and its free-cancel window, `access` for the A3 fallback
unlock and the A5 visit plan, `projects` for A5 milestones and material advances. This module
decides *which* of them applies and records the answer; it does not do arithmetic of its own. That
is why an unset owner value fails closed here exactly as it does there — `cancel_booking` refuses
without T, and this refuses with it.

**Wages are outside all of it.** An A3 service payment is peer-to-peer. There is no branch here
that returns wage money, because the platform never held any: what a cancelled A3 engagement
settles is the booking fee and nothing else, and the remedy says so in words rather than by
silence.
"""

import uuid
from datetime import datetime, timedelta
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.cases.models import OperationsCase
from apps.catalog.models import ServiceVariant
from apps.foundation.services import enqueue_outbox_event
from apps.identity.models import User
from apps.requirements import access, booking_fees, disputes, pricing, projects, services
from apps.requirements.exceptions import (
    PolicyUnavailableError,
    RequirementNotFoundError,
    RequirementTransitionError,
)
from apps.requirements.models import (
    BookingFee,
    CustomerRequirement,
    DaySettlement,
    Engagement,
    EngagementStage,
    QuoteUnlock,
    RequirementCancellation,
    ShiftAttendance,
    VisitPlan,
    VisitPlanShare,
)

A3 = ServiceVariant.BookingArchetype.A3_TIME_BLOCK
A5 = ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT

#: The remedy vocabulary. One code per outcome, shared by the record, the ledger reason and the
#: sentence a support agent reads out, so three descriptions of one decision cannot drift.
REMEDY_NOTHING_CHARGED = "nothing_charged"
REMEDY_BOOKING_FEE_REFUND = "booking_fee_refunded"
REMEDY_BOOKING_FEE_FORFEIT = "booking_fee_forfeit_split"
REMEDY_BOOKING_FEE_EARNED = "booking_fee_earned"
REMEDY_NO_PLATFORM_MONEY = "no_platform_money"
REMEDY_UNLOCK_REFUND = "unlock_refunded"
REMEDY_UNLOCK_EARNED = "unlock_earned"
REMEDY_VISIT_PLAN_PARTIAL_REFUND = "visit_plan_unconsumed_refunded"
REMEDY_PROJECT_UNEARNED_RETURNED = "project_unearned_funding_returned"


# ---------------------------------------------------------------------------
# The facts a remedy is calculated against (`M2-BE-701`)
# ---------------------------------------------------------------------------


def _contact_disclosed(*, requirement: CustomerRequirement, engagement: Engagement | None) -> bool:
    """Whether the two parties can already reach each other.

    Three ways it becomes true, and they are the three doors `07-state-machines-and-permissions.md`
    §7 names: an engagement that released contact, an A3 fallback unlock that has been paid, and an
    A5 visit slot a vendor confirmed. Past any of them a cancellation stops being a private change
    of mind and becomes a claim about a conversation — which is what `M2-BE-702` keys off.
    """
    if engagement is not None and engagement.contact_released_at is not None:
        return True
    if QuoteUnlock.objects.filter(
        requirement=requirement,
        status__in=(QuoteUnlock.Status.ACTIVE, QuoteUnlock.Status.CONSUMED),
    ).exists():
        return True
    return VisitPlanShare.objects.filter(
        plan__requirement=requirement,
        status__in=(VisitPlanShare.Status.COMMITTED, VisitPlanShare.Status.EARNED),
    ).exists()


def _fulfilment_evidence(
    *, requirement: CustomerRequirement, engagement: Engagement | None
) -> dict[str, Any]:
    """What the platform can see for itself about whether work happened.

    Kept apart from the requester's own `evidence` because one is a record and the other is a
    claim, and a decision that could not tell them apart would be a decision made on whoever wrote
    the longer message.
    """
    evidence: dict[str, Any] = {
        "confirmed_visits": VisitPlanShare.objects.filter(
            plan__requirement=requirement, status=VisitPlanShare.Status.EARNED
        ).count(),
    }
    if engagement is None:
        return evidence
    evidence["stages_approved"] = EngagementStage.objects.filter(
        engagement=engagement, status=EngagementStage.Status.APPROVED
    ).count()
    evidence["stages_released"] = EngagementStage.objects.filter(
        engagement=engagement, status=EngagementStage.Status.RELEASED
    ).count()
    evidence["stages_in_progress"] = EngagementStage.objects.filter(
        engagement=engagement, status=EngagementStage.Status.IN_PROGRESS
    ).count()
    evidence["attendance_records"] = ShiftAttendance.objects.filter(
        stage__engagement=engagement
    ).count()
    evidence["days_settled"] = DaySettlement.objects.filter(
        stage__engagement=engagement, settled_at__isnull=False
    ).count()
    evidence["funded_total_paise"] = engagement.funded_total_paise
    evidence["approved_total_paise"] = engagement.approved_total_paise
    return evidence


def _work_reported_started(fulfilment_evidence: dict[str, Any]) -> bool:
    """Has anybody said work began? Any one of five records is enough.

    Deliberately generous. `M2-BE-702` wants the counterparty asked when a cancellation lands
    *after* somebody says work started, and the cost of asking unnecessarily is one tap, while the
    cost of not asking is a cancellation that erases a day somebody worked.
    """
    return any(
        int(fulfilment_evidence.get(key, 0)) > 0
        for key in (
            "stages_approved",
            "stages_released",
            "stages_in_progress",
            "attendance_records",
            "days_settled",
            "confirmed_visits",
        )
    )


# ---------------------------------------------------------------------------
# The remedy (`M2-BE-706`, and the three fee outcomes it dispatches to)
# ---------------------------------------------------------------------------


def _booking_fee_remedy(
    *, requirement: CustomerRequirement, fee: BookingFee | None
) -> tuple[str, dict[str, Any]]:
    """What happens to the A3 booking fee, and why. `M2-BE-719`'s read half.

    Priced but not executed: `cancel_booking` runs the actual settlement, under the booking's own
    row lock, at execution time. Two calculations of the same split would be two chances to drift,
    so this one reads the window and reports which side of it the Customer is on.
    """
    settled = _settled_booking_fee_remedy(fee)
    if settled is not None:
        return settled
    if fee is None:  # pragma: no cover - `_settled_booking_fee_remedy` answers for `None`
        return REMEDY_NOTHING_CHARGED, {"booking_fee_paise": 0}

    # `ACTIVE`: the live decision, and the only one the free-cancel window T governs. Read
    # fail-closed — an unset T raises `m2_policy_unavailable` here rather than at execution, so
    # the Customer is told before they commit rather than after.
    hours = rate_card_free_cancel_hours(requirement)
    starts_at = requirement.requested_start
    inside_window = starts_at is not None and timezone.now() > starts_at - timedelta(hours=hours)
    if inside_window:
        travel, platform = _forfeit_preview(requirement, amount_paise=fee.amount_paise)
        return REMEDY_BOOKING_FEE_FORFEIT, {
            "booking_fee_paise": fee.amount_paise,
            "travel_compensation_paise": travel,
            "platform_share_paise": platform,
            "free_cancel_hours": hours,
        }
    return REMEDY_BOOKING_FEE_REFUND, {
        "booking_fee_paise": fee.amount_paise,
        "free_cancel_hours": hours,
    }


def _settled_booking_fee_remedy(
    fee: BookingFee | None,
) -> tuple[str, dict[str, Any]] | None:
    """Every booking-fee state whose answer is already fixed. `None` means "still to decide"."""
    if fee is None or fee.status in (BookingFee.Status.OFFER_ACCEPTED, BookingFee.Status.FAILED):
        return REMEDY_NOTHING_CHARGED, {"booking_fee_paise": 0}
    if fee.status == BookingFee.Status.WAIVED:
        return REMEDY_NO_PLATFORM_MONEY, {
            "booking_fee_paise": 0,
            "note": "free re-dispatch; nothing was collected for this crew",
        }
    if fee.status == BookingFee.Status.EARNED:
        return REMEDY_BOOKING_FEE_EARNED, {
            "booking_fee_paise": fee.amount_paise,
            "note": "the crew arrived, so the booking fee is earned; wages are direct and are "
            "not settled by this platform",
        }
    if fee.status == BookingFee.Status.REFUNDED:
        return REMEDY_BOOKING_FEE_REFUND, {"booking_fee_paise": fee.amount_paise}
    if fee.status == BookingFee.Status.FORFEIT_SPLIT:
        return REMEDY_BOOKING_FEE_FORFEIT, {
            "booking_fee_paise": fee.amount_paise,
            "travel_compensation_paise": fee.travel_compensation_paise,
            "platform_share_paise": fee.platform_share_paise,
        }
    return None


def rate_card_free_cancel_hours(requirement: CustomerRequirement) -> int:
    """The free-cancel window T, or a refusal. One indirection so the import stays honest."""
    from apps.requirements import rate_cards  # noqa: PLC0415 - mutual import with booking_fees

    return rate_cards.free_cancel_hours(requirement)


def _forfeit_preview(requirement: CustomerRequirement, *, amount_paise: int) -> tuple[int, int]:
    from apps.requirements import rate_cards  # noqa: PLC0415 - mutual import with booking_fees

    return rate_cards.forfeit_split(requirement, amount_paise=amount_paise)


def _unlock_remedy(requirement: CustomerRequirement) -> tuple[str, dict[str, Any]] | None:
    """The A3 fallback unlock (`M2-BE-705`).

    An unlock is **earned once quotes were readable**: the Customer bought the right to read and
    compare them and they read them. It refunds only when the thing they bought never arrived —
    `service_by` expiry, or every unlocked vendor falling through — and those two are swept
    elsewhere. A cancellation is neither, which is why this is `unlock_earned` and not a refund.
    """
    unlock = access.latest_unlock(requirement)
    if unlock is None:
        return None
    if unlock.status == QuoteUnlock.Status.CONSUMED:
        return REMEDY_UNLOCK_EARNED, {
            "unlock_paise": unlock.price_paise,
            "note": "an engagement opened on this unlock, so the fee is earned",
        }
    if unlock.status == QuoteUnlock.Status.ACTIVE:
        return REMEDY_UNLOCK_EARNED, {
            "unlock_paise": unlock.price_paise,
            "note": "the quotes were unlocked and readable, so the fee is earned",
        }
    if unlock.status == QuoteUnlock.Status.REFUNDED:
        return REMEDY_UNLOCK_REFUND, {"unlock_paise": unlock.price_paise}
    return None


def _visit_plan_remedy(requirement: CustomerRequirement) -> tuple[str, dict[str, Any]] | None:
    """The A5 visit plan (`M2-BE-718`): unconsumed value comes back, earned shares stay.

    Reconciles in paise by construction, because the three buckets are the three share states and
    every share is in exactly one of them.
    """
    plan = VisitPlan.objects.filter(requirement=requirement).order_by("-created_at").first()
    if plan is None or plan.status not in VisitPlan.CHARGED_STATUSES:
        return None
    shares = list(VisitPlanShare.objects.filter(plan=plan))
    earned = sum(
        share.amount_paise for share in shares if share.status == VisitPlanShare.Status.EARNED
    )
    refunded = sum(
        share.amount_paise for share in shares if share.status == VisitPlanShare.Status.REFUNDED
    )
    unconsumed = sum(
        share.amount_paise
        for share in shares
        if share.status not in (VisitPlanShare.Status.EARNED, VisitPlanShare.Status.REFUNDED)
    )
    return REMEDY_VISIT_PLAN_PARTIAL_REFUND, {
        "plan_paise": plan.price_paise,
        "earned_paise": earned,
        "already_refunded_paise": refunded,
        "refundable_paise": unconsumed,
    }


def _project_remedy(engagement: Engagement | None) -> tuple[str, dict[str, Any]] | None:
    """A5 milestones: unearned funding returns, a material advance does not."""
    if engagement is None or engagement.archetype != A5:
        return None
    returnable = 0
    material = 0
    for stage in EngagementStage.objects.filter(
        engagement=engagement, status__in=EngagementStage.OPEN_STATUSES
    ):
        held = stage.funded_paise - stage.refunded_amount_paise
        if held <= 0:
            continue
        if stage.kind == EngagementStage.Kind.MATERIAL_ADVANCE:
            material += held
        else:
            returnable += held
    return REMEDY_PROJECT_UNEARNED_RETURNED, {
        "refundable_paise": returnable,
        "material_advance_outstanding_paise": material,
    }


def calculate_remedy(
    *, requirement: CustomerRequirement, engagement: Engagement | None
) -> tuple[str, dict[str, Any]]:
    """The whole money picture of calling this job off, per product.

    One headline code plus a `products` map, rather than a single number, because a cancelled A5
    request can genuinely have three separate outcomes at once — an earned visit share, a refunded
    one and a funded milestone coming back — and collapsing them into one figure is how a Customer
    ends up disputing a total nobody can explain.
    """
    products: dict[str, Any] = {}
    headline = REMEDY_NOTHING_CHARGED

    if requirement.archetype == A3:
        fee = booking_fees.latest_booking_fee(requirement)
        code, detail = _booking_fee_remedy(requirement=requirement, fee=fee)
        products["booking_fee"] = {"remedy_code": code, **detail}
        headline = code
        unlock = _unlock_remedy(requirement)
        if unlock is not None:
            products["unlock"] = {"remedy_code": unlock[0], **unlock[1]}
            if code == REMEDY_NOTHING_CHARGED:
                headline = unlock[0]
        products["service_payment"] = {
            "remedy_code": REMEDY_NO_PLATFORM_MONEY,
            "note": "wages are paid directly to the lead, daily, and are never held by this "
            "platform, so a cancellation cannot return or withhold them",
        }
    else:
        plan = _visit_plan_remedy(requirement)
        if plan is not None:
            products["visit_plan"] = {"remedy_code": plan[0], **plan[1]}
            headline = plan[0]
        project = _project_remedy(engagement)
        if project is not None:
            products["project"] = {"remedy_code": project[0], **project[1]}
            if project[1]["refundable_paise"] > 0 or plan is None:
                headline = project[0]
    return headline, {"products": products, "calculated_at": timezone.now().isoformat()}


# ---------------------------------------------------------------------------
# Evaluate (`M2-BE-701`)
# ---------------------------------------------------------------------------


def _confirmation_deadline(requirement: CustomerRequirement) -> datetime | None:
    """How long the counterparty has to answer.

    Reuses `amendment_response_hours` rather than adding a twelfth unset knob: it is the same
    promise the amendment engine already makes — how long one party has to answer the other about
    the agreed work — and a second blocked value would have blocked this command on a decision
    nobody has been asked for. `None` when even that is unset, which means the confirmation does
    not lapse on a clock and Operations picks it up from the queue instead.
    """
    try:
        return pricing.amendment_response_deadline(requirement)
    except PolicyUnavailableError:
        return None


@transaction.atomic
def evaluate_cancellation(
    *,
    requirement_id: uuid.UUID,
    actor: User | None,
    actor_role: str,
    reason_code: str,
    reason: str = "",
    evidence: list[dict[str, Any]] | None = None,
) -> RequirementCancellation:
    """Record what calling this job off would mean, and decide who has to agree.

    Nothing moves here. What comes back is a priced, evidenced record and a status saying whether
    it executes now or waits for the other side — which is the whole of `M2-BE-702`: past contact
    disclosure or a reported work start, one party may no longer end an agreement on their own
    account of it.
    """
    if not reason_code.strip():
        raise RequirementTransitionError("A cancellation needs a reason code.")
    requirement = (
        CustomerRequirement.objects.select_for_update(of=("self",))
        .select_related("configuration", "service_area")
        .get(pk=requirement_id)
    )
    if requirement.status in CustomerRequirement.CLOSED_STATUSES:
        raise RequirementTransitionError("This request is already closed.")
    live = (
        RequirementCancellation.objects.select_for_update()
        .filter(requirement=requirement, status__in=RequirementCancellation.LIVE_STATUSES)
        .first()
    )
    if live is not None:
        raise RequirementTransitionError(
            "This request already has a cancellation waiting on a decision.",
        )

    engagement = Engagement.objects.filter(requirement=requirement).first()
    fulfilment_evidence = _fulfilment_evidence(requirement=requirement, engagement=engagement)
    work_started = _work_reported_started(fulfilment_evidence)
    contact_disclosed = _contact_disclosed(requirement=requirement, engagement=engagement)
    remedy_code, remedy = calculate_remedy(requirement=requirement, engagement=engagement)

    # `M2-BE-702`, stated as one condition rather than three scattered guards. Operations is
    # exempt because Operations *is* the review — asking them to wait for a counterparty they have
    # already spoken to would make the escalation path slower than the thing it escalates.
    needs_confirmation = actor_role != RequirementCancellation.ActorRole.OPERATIONS and (
        contact_disclosed or work_started
    )
    cancellation = RequirementCancellation.objects.create(
        requirement=requirement,
        engagement=engagement,
        actor_role=actor_role,
        requested_by=actor,
        status=(
            RequirementCancellation.Status.AWAITING_CONFIRMATION
            if needs_confirmation
            else RequirementCancellation.Status.EVALUATED
        ),
        reason_code=reason_code.strip()[:80],
        reason=reason.strip(),
        archetype=requirement.archetype,
        requirement_status=requirement.status,
        engagement_status=engagement.status if engagement is not None else "",
        contact_disclosed=contact_disclosed,
        work_reported_started=work_started,
        evidence=evidence or [],
        fulfilment_evidence=fulfilment_evidence,
        remedy_code=remedy_code,
        remedy=remedy,
        requires_counterparty_confirmation=needs_confirmation,
        confirmation_due_at=_confirmation_deadline(requirement) if needs_confirmation else None,
    )
    services.record_transition(
        requirement=requirement,
        from_status=requirement.status,
        to_status=requirement.status,
        actor=actor,
        reason_code="cancellation_evaluated",
        reason=f"cancellation:{cancellation.id} remedy:{remedy_code} confirm:{needs_confirmation}",
    )
    enqueue_outbox_event(
        aggregate_type="requirement",
        aggregate_id=requirement.id,
        event_type="m2.cancellation.evaluated",
        idempotency_key=f"cancellation-evaluated:{cancellation.id}",
        payload={
            "requirement_id": str(requirement.id),
            "cancellation_id": str(cancellation.id),
            "remedy_code": remedy_code,
            "requires_counterparty_confirmation": needs_confirmation,
        },
    )
    if not needs_confirmation:
        return execute_cancellation(cancellation_id=cancellation.id, actor=actor)
    return cancellation


# ---------------------------------------------------------------------------
# The counterparty's answer (`M2-BE-702`)
# ---------------------------------------------------------------------------


@transaction.atomic
def confirm_cancellation(*, cancellation_id: uuid.UUID, actor: User) -> RequirementCancellation:
    """The other side agrees. The remedy runs on the terms it was evaluated at."""
    cancellation = _locked(cancellation_id)
    if cancellation.status == RequirementCancellation.Status.EXECUTED:
        return cancellation
    if cancellation.status != RequirementCancellation.Status.AWAITING_CONFIRMATION:
        raise RequirementTransitionError("This cancellation is not waiting on a confirmation.")
    cancellation.status = RequirementCancellation.Status.CONFIRMED
    cancellation.confirmed_at = timezone.now()
    cancellation.confirmed_by = actor
    cancellation.save(update_fields=("status", "confirmed_at", "confirmed_by", "updated_at"))
    return execute_cancellation(cancellation_id=cancellation.id, actor=actor)


@transaction.atomic
def dispute_cancellation(
    *, cancellation_id: uuid.UUID, actor: User | None, reason: str, reason_code: str = "disputed"
) -> RequirementCancellation:
    """The other side says this is not what happened. A case takes it from here.

    `M2-AC-703` exactly: "payout/refund does not auto-resolve and Operations receives evidence
    review". Nothing is executed, nothing is refunded, and the vendor's unpaid earnings are frozen
    by the case rather than by this function — `CANCELLATION_CONFLICT` is a payout-holding kind, so
    opening the case *is* the hold.
    """
    cancellation = _locked(cancellation_id)
    if cancellation.status in (
        RequirementCancellation.Status.EXECUTED,
        RequirementCancellation.Status.WITHDRAWN,
    ):
        raise RequirementTransitionError("This cancellation has already been settled.")
    if cancellation.case_id is None:
        case = disputes.open_linked_case(
            kind=OperationsCase.Kind.CANCELLATION_CONFLICT,
            summary=f"Cancellation disputed: {cancellation.reason_code}",
            source_kind="requirement_cancellation",
            source_id=cancellation.id,
            requirement=cancellation.requirement,
            engagement=cancellation.engagement,
            severity=OperationsCase.Severity.HIGH,
            detail=reason.strip(),
            opened_by=actor,
        )
        cancellation.case = case
    cancellation.status = RequirementCancellation.Status.DISPUTED
    cancellation.disputed_at = timezone.now()
    cancellation.reason = f"{cancellation.reason}\n[{reason_code}] {reason.strip()}".strip()
    cancellation.save(update_fields=("status", "disputed_at", "reason", "case", "updated_at"))
    enqueue_outbox_event(
        aggregate_type="requirement",
        aggregate_id=cancellation.requirement_id,
        event_type="m2.cancellation.disputed",
        idempotency_key=f"cancellation-disputed:{cancellation.id}",
        payload={
            "requirement_id": str(cancellation.requirement_id),
            "cancellation_id": str(cancellation.id),
            "operations_case_id": str(cancellation.case_id),
        },
    )
    return cancellation


@transaction.atomic
def lapse_cancellation_confirmation(*, cancellation_id: uuid.UUID) -> RequirementCancellation:
    """Nobody answered inside the window.

    Silence does **not** execute the cancellation. `M2-BE-702` offers two routes — counterparty
    confirmation *or* Operations review — and a timeout that settled money on one party's account
    of events would make the second route decorative. So it goes to Operations with the same
    machinery a dispute uses, carrying `confirmation_lapsed` rather than a disputant's reason, and
    the money stays exactly where it is meanwhile.
    """
    cancellation = _locked(cancellation_id)
    if cancellation.status != RequirementCancellation.Status.AWAITING_CONFIRMATION:
        return cancellation
    return dispute_cancellation(
        cancellation_id=cancellation.id,
        actor=None,
        reason="The other side did not answer inside the window.",
        reason_code="confirmation_lapsed",
    )


def lapsed_confirmation_ids(*, at: datetime | None = None) -> list[uuid.UUID]:
    """Cancellations whose confirmation window has passed. Sweep selector."""
    moment = at or timezone.now()
    return list(
        RequirementCancellation.objects.filter(
            status=RequirementCancellation.Status.AWAITING_CONFIRMATION,
            confirmation_due_at__isnull=False,
            confirmation_due_at__lte=moment,
        ).values_list("id", flat=True)
    )


# ---------------------------------------------------------------------------
# Execute (`M2-BE-706`)
# ---------------------------------------------------------------------------


@transaction.atomic
def execute_cancellation(
    *, cancellation_id: uuid.UUID, actor: User | None
) -> RequirementCancellation:
    """Run the remedy that was evaluated, through the module that owns each product.

    Nothing is recomputed here. Each branch calls the command that already knows how to settle its
    own money and is already idempotent, so a retried execution settles once — and the reason this
    function is short is that it is supposed to be: a cancellation engine that did its own
    arithmetic would be a fourth opinion about the booking fee.
    """
    cancellation = _locked(cancellation_id)
    if cancellation.status == RequirementCancellation.Status.EXECUTED:
        return cancellation
    if cancellation.status not in (
        RequirementCancellation.Status.EVALUATED,
        RequirementCancellation.Status.CONFIRMED,
    ):
        raise RequirementTransitionError("This cancellation is not ready to run.")

    requirement = cancellation.requirement
    engagement = cancellation.engagement
    if requirement.archetype == A3:
        _execute_a3(cancellation=cancellation, requirement=requirement, actor=actor)
    else:
        _execute_a5(
            cancellation=cancellation,
            requirement=requirement,
            engagement=engagement,
            actor=actor,
        )

    cancellation.status = RequirementCancellation.Status.EXECUTED
    cancellation.executed_at = timezone.now()
    cancellation.save(update_fields=("status", "executed_at", "updated_at"))
    enqueue_outbox_event(
        aggregate_type="requirement",
        aggregate_id=requirement.id,
        event_type="m2.cancellation.executed",
        idempotency_key=f"cancellation-executed:{cancellation.id}",
        payload={
            "requirement_id": str(requirement.id),
            "cancellation_id": str(cancellation.id),
            "remedy_code": cancellation.remedy_code,
        },
    )
    return cancellation


def _execute_a3(
    *, cancellation: RequirementCancellation, requirement: CustomerRequirement, actor: User | None
) -> None:
    """A3: settle the booking fee if there is one, then close. Wages are untouched by design."""
    fee = booking_fees.latest_booking_fee(requirement)
    settleable = fee is not None and fee.status in (
        BookingFee.Status.ACTIVE,
        BookingFee.Status.OFFER_ACCEPTED,
        BookingFee.Status.WAIVED,
    )
    if settleable and actor is not None:
        # `cancel_booking` owns the free-cancel window, the forfeit split and closing the booking.
        booking_fees.cancel_booking(requirement_id=requirement.id, actor=actor)
        return
    services.close_requirement(
        requirement_id=requirement.id,
        status=CustomerRequirement.Status.CLOSED_CANCELLED,
        reason_code=cancellation.reason_code,
        actor=actor,
    )


def _execute_a5(
    *,
    cancellation: RequirementCancellation,
    requirement: CustomerRequirement,
    engagement: Engagement | None,
    actor: User | None,
) -> None:
    """A5: return unearned milestone funding, refund unconsumed visit value, then close."""
    if (
        engagement is not None
        and actor is not None
        and engagement.status
        in (
            Engagement.Status.PENDING_START,
            Engagement.Status.ACTIVE,
            Engagement.Status.DISPUTED,
        )
    ):
        # `terminate_project_early` refunds unearned funding, records the material advance as
        # outstanding, cancels the engagement **and** closes the requirement. It is an Operations
        # command by permission, which is why the actor is passed through rather than replaced —
        # and why a system-driven execution with no actor takes the plain closure branch instead:
        # a termination is a decision somebody took, and attributing one to nobody would put an
        # unattributed money movement into the record a dispute reads.
        projects.terminate_project_early(
            engagement_id=engagement.id,
            actor=actor,
            reason_code=cancellation.reason_code,
            note=cancellation.reason,
        )
    else:
        services.close_requirement(
            requirement_id=requirement.id,
            status=CustomerRequirement.Status.CLOSED_CANCELLED,
            reason_code=cancellation.reason_code,
            actor=actor,
        )
    # Unconsumed visit shares come back whatever happened to the engagement: the Customer paid for
    # visits that are not going to happen, and no policy decision is involved in returning money
    # nobody earned. Earned shares are untouched — the vendor visited. `refund_share` is idempotent
    # by state, so a re-driven execution refunds each share once.
    unconsumed = (
        VisitPlanShare.objects.filter(
            plan__requirement=requirement,
            plan__status__in=VisitPlan.CHARGED_STATUSES,
        )
        .exclude(status__in=(VisitPlanShare.Status.EARNED, VisitPlanShare.Status.REFUNDED))
        .values_list("id", flat=True)
    )
    for share_id in list(unconsumed):
        access.refund_share(share_id=share_id, reason_code="m2_requirement_cancelled")


def _locked(cancellation_id: uuid.UUID) -> RequirementCancellation:
    cancellation = (
        RequirementCancellation.objects.select_for_update(of=("self",))
        .select_related("requirement__configuration", "engagement")
        .filter(pk=cancellation_id)
        .first()
    )
    if cancellation is None:
        raise RequirementNotFoundError()
    return cancellation


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------


def live_cancellation(requirement: CustomerRequirement) -> RequirementCancellation | None:
    return (
        RequirementCancellation.objects.filter(
            requirement=requirement, status__in=RequirementCancellation.LIVE_STATUSES
        )
        .order_by("-created_at")
        .first()
    )


def cancellation_for_participant(
    *, user: User, cancellation_id: uuid.UUID
) -> RequirementCancellation:
    """`404` rather than `403`, per 07 §7: existence itself is private here."""
    cancellation = (
        RequirementCancellation.objects.select_related("requirement", "engagement__partner")
        .filter(pk=cancellation_id)
        .first()
    )
    if cancellation is None:
        raise RequirementNotFoundError()
    engagement = cancellation.engagement
    is_customer = cancellation.requirement.customer_id == user.id
    is_partner = (
        engagement is not None
        and engagement.partner is not None
        and engagement.partner.user_id == user.id
    )
    if not is_customer and not is_partner:
        raise RequirementNotFoundError()
    return cancellation


def cancellation_payload(cancellation: RequirementCancellation) -> dict[str, Any]:
    """One cancellation, as either party may read it. Both sides see the same numbers."""
    return {
        "id": str(cancellation.id),
        "status": cancellation.status,
        "actor_role": cancellation.actor_role,
        "reason_code": cancellation.reason_code,
        "reason": cancellation.reason,
        "remedy_code": cancellation.remedy_code,
        "remedy": cancellation.remedy,
        "contact_disclosed": cancellation.contact_disclosed,
        "work_reported_started": cancellation.work_reported_started,
        "requires_counterparty_confirmation": (cancellation.requires_counterparty_confirmation),
        "confirmation_due_at": cancellation.confirmation_due_at,
        "confirmed_at": cancellation.confirmed_at,
        "disputed_at": cancellation.disputed_at,
        "executed_at": cancellation.executed_at,
        "operations_case_id": (
            str(cancellation.case_id) if cancellation.case_id is not None else None
        ),
        "created_at": cancellation.created_at,
        "server_now": timezone.now(),
    }
