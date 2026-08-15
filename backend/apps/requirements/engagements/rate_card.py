"""The A3 rate-card engagement: opened by a verified booking fee, re-pointed after a no-show.

`M2-BE-432`, revision 4. The second way an engagement comes into existence, and the one with no
proposal behind it — the price came from the published rate card, so there is no quote to freeze
and no selection to point at. Both functions here are driven from `booking_fees` inside the
provider callback's own transaction.

The boundary: the quote-flow engagement is `opening`, and it is never reached from here. These two
paths share only `base.shift_dates`, which lays the shift-days out identically so that crew,
attendance and settlement downstream cannot tell which door the Customer came through.
"""

import uuid

from django.db import transaction
from django.utils import timezone

from apps.foundation.services import enqueue_outbox_event
from apps.requirements import metrics, stages
from apps.requirements.exceptions import RequirementTransitionError
from apps.requirements.models import (
    CustomerRequirement,
    Engagement,
    EngagementStage,
    RateCardBooking,
    StageCrewAssignment,
)
from apps.requirements.services import record_transition

from .base import A3, shift_dates

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
    # `M2-BE-806`: A3's "time to confirmed crew". This is the moment the README's phrase
    # "accepted, fee-confirmed crew" becomes true — a lead has accepted, the provider has verified
    # the fee, and the engagement exists.
    #
    # Measured against `first_quote_due_at`, the deadline stamped on the row at submission, for two
    # reasons. It is the only promise this platform has actually made about an A3 requirement —
    # ADR-0009 declares no separate instant-crew SLA, and the cascade's wave timeouts are an
    # internal shape rather than a published promise — and being a stamped column it cannot be
    # rewritten by a configuration change made after the Customer booked. Null is `no_promise`.
    metrics.record_crew_confirmed(
        requirement=requirement,
        confirmed_at=now,
        deadline=requirement.first_quote_due_at,
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
