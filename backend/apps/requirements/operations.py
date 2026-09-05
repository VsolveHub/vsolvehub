"""The Operations workspace: one timeline, safe recovery actions, queues and the touch metric.

`M2-BE-711` to `M2-BE-715`, plus the crew-document verification Wave C5 deferred here.

The rule that shapes every command in this file is `04-acceptance-and-cutover.md`'s acceptance
evidence rule: **"a scenario is failed if Operations must edit the database to recover it."** So
each one is a real domain command with an actor, a required reason and an audit row — never a
writable field — and each one refuses rather than guessing when the state it would move is not the
state it was written for.

The rule that shapes what is *absent* is `07-state-machines-and-permissions.md` §7's "may never"
column. Operations may reclassify, rematch, extend deadlines, capture on somebody's behalf with
consent, resolve cases and hold payouts. Operations may **not** accept an offer for a vendor,
author a proposal without vendor confirmation, or edit rows directly. `capture_assisted_proposal`
is the sharp edge of that: it writes a quote a vendor gave over the phone and leaves it invisible
to the Customer until the vendor themselves confirms it, because a platform where staff can
publish a vendor's price is a platform where a vendor's price means nothing.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone

from apps.cases.models import TERMINAL_CASE_STATUSES, OperationsCase
from apps.foundation.services import enqueue_outbox_event
from apps.identity.models import User
from apps.partners.models import CrewMember, PartnerCrewMembership
from apps.requirements import disputes, matching, metrics, pricing, proposals, services
from apps.requirements.exceptions import (
    PolicyUnavailableError,
    RequirementDomainError,
    RequirementNotFoundError,
    RequirementTransitionError,
)
from apps.requirements.models import (
    BookingFee,
    CustomerRequirement,
    Engagement,
    EngagementStage,
    OperationsTouch,
    Proposal,
    QuoteUnlock,
    RateCardBooking,
    RequirementCancellation,
    RequirementQuestion,
    RequirementSnapshot,
    SiteVisit,
    VendorInvitation,
    VisitPlan,
    VisitPlanShare,
)

#: Every touch action this module can record, in one tuple, so the metric read and the writers
#: cannot disagree about what counts. Adding a command means adding it here, which is the point.
TOUCH_ACTIONS: tuple[str, ...] = (
    "reclassify",
    "rematch",
    "extend_deadline",
    "assisted_clarification",
    "assisted_proposal",
    "refund_review",
    "case_resolution",
    "cancellation_review",
)


def record_touch(
    *,
    requirement: CustomerRequirement,
    actor: User | None,
    action: str,
    reason: str = "",
) -> OperationsTouch:
    """Write one row saying an operator did something to this request."""
    touch = OperationsTouch.objects.create(
        requirement=requirement,
        actor=actor,
        action=action,
        reason=reason.strip()[:480],
    )
    # `M2-BE-806` / `M2-BE-715`: "Operations touches per request, against the unit economics
    # model". Emitted with the running count and the configured budget so an alert can fire on the
    # *first* request that goes over rather than on a nightly aggregate — the number matters most
    # while the request is still open and somebody could stop touching it.
    #
    # `reason` is deliberately absent from the labels: it is an operator's free text about a real
    # Customer's situation, and a metric line is a log line.
    budget: int | None
    try:
        budget = pricing.operations_touch_budget(requirement)
    except RequirementDomainError:
        budget = None
    metrics.record_operations_touch(
        requirement=requirement,
        action=action,
        touch_count=OperationsTouch.objects.filter(requirement=requirement).count(),
        budget=budget,
    )
    return touch


# ---------------------------------------------------------------------------
# `M2-BE-711`: one chronological timeline
# ---------------------------------------------------------------------------


def _snapshot_events(requirement: CustomerRequirement) -> list[dict[str, Any]]:
    """The immutable copies of what each invited vendor actually saw (`M2-AC-205`).

    A snapshot belongs to the **requirement** and is shared by every invitation of one wave, so it
    is counted here by how many invitations point at it rather than published once per invitation —
    which would say a wave of five produced five different views of the request when it produced
    one.
    """
    return [
        {
            "at": snapshot.created_at,
            "type": "SNAPSHOT_TAKEN",
            "detail": {
                "snapshot_id": str(snapshot.id),
                "content_hash": snapshot.content_hash,
                "invitations": snapshot.invitations.count(),
            },
        }
        for snapshot in RequirementSnapshot.objects.filter(requirement=requirement)
    ]


def _invitation_events(requirement: CustomerRequirement) -> list[dict[str, Any]]:
    """Offers and invitations, **with the vendor named**.

    This is the one place M2 publishes vendor identity beside a requirement before the Customer has
    paid for it, and it is safe here for the reason the whole file exists: the audience is
    Operations. `selectors.requirement_timeline` — the Customer's timeline — publishes a wave as a
    count and no identities at all, and the two projections are deliberately separate functions
    rather than one with a role flag, so a later edit cannot leak one into the other.
    """
    events: list[dict[str, Any]] = []
    for invitation in VendorInvitation.objects.filter(requirement=requirement).select_related(
        "partner"
    ):
        events.append(
            {
                "at": invitation.created_at,
                "type": "VENDOR_INVITED",
                "detail": {
                    "invitation_id": str(invitation.id),
                    "partner_id": str(invitation.partner_id),
                    "partner_name": invitation.partner.display_name,
                    "wave": invitation.wave,
                    "status": invitation.status,
                },
            }
        )
        responded_at = invitation.accepted_at or (
            invitation.updated_at
            if invitation.status
            in (
                VendorInvitation.Status.DECLINED,
                VendorInvitation.Status.EXPIRED,
                VendorInvitation.Status.WITHDRAWN,
            )
            else None
        )
        if responded_at is not None:
            events.append(
                {
                    "at": responded_at,
                    "type": "VENDOR_RESPONDED",
                    "detail": {
                        "invitation_id": str(invitation.id),
                        "partner_id": str(invitation.partner_id),
                        "status": invitation.status,
                        "reason_code": invitation.decline_reason_code,
                    },
                }
            )
    return events


def _money_events(requirement: CustomerRequirement) -> list[dict[str, Any]]:
    """Every financial event on this request, whichever product produced it."""
    events: list[dict[str, Any]] = [
        {
            "at": fee.created_at,
            "type": "BOOKING_FEE",
            "detail": {
                "booking_fee_id": str(fee.id),
                "status": fee.status,
                "amount_paise": fee.amount_paise,
                "travel_compensation_paise": fee.travel_compensation_paise,
                "platform_share_paise": fee.platform_share_paise,
                "settlement_reason_code": fee.settlement_reason_code,
            },
        }
        for fee in BookingFee.objects.filter(requirement=requirement)
    ]
    events.extend(
        {
            "at": unlock.created_at,
            "type": "QUOTE_UNLOCK",
            "detail": {
                "unlock_id": str(unlock.id),
                "status": unlock.status,
                "amount_paise": unlock.price_paise,
            },
        }
        for unlock in QuoteUnlock.objects.filter(requirement=requirement)
    )
    events.extend(
        {
            "at": plan.created_at,
            "type": "VISIT_PLAN",
            "detail": {
                "visit_plan_id": str(plan.id),
                "status": plan.status,
                "amount_paise": plan.price_paise,
                "plan_size": plan.plan_size,
            },
        }
        for plan in VisitPlan.objects.filter(requirement=requirement)
    )
    events.extend(
        {
            "at": share.created_at,
            "type": "VISIT_PLAN_SHARE",
            "detail": {
                "share_id": str(share.id),
                "status": share.status,
                "amount_paise": share.amount_paise,
                "vendor_payout_paise": share.vendor_payout_paise,
                "platform_share_paise": share.platform_share_paise,
            },
        }
        for share in VisitPlanShare.objects.filter(plan__requirement=requirement)
    )
    return events


def _engagement_events(requirement: CustomerRequirement) -> list[dict[str, Any]]:
    engagement = (
        Engagement.objects.filter(requirement=requirement).select_related("partner").first()
    )
    if engagement is None:
        return []
    events: list[dict[str, Any]] = [
        {
            "at": engagement.created_at,
            "type": "ENGAGEMENT_OPENED",
            "detail": {
                "engagement_id": str(engagement.id),
                "partner_id": str(engagement.partner_id),
                "partner_name": engagement.partner.display_name,
                "status": engagement.status,
                "commercial_mode": engagement.commercial_mode,
                "total_paise": engagement.total_paise,
            },
        }
    ]
    events.extend(
        {
            "at": stage.created_at,
            "type": "ENGAGEMENT_STAGE",
            "detail": {
                "stage_id": str(stage.id),
                "position": stage.position,
                "label": stage.label,
                "status": stage.status,
                "amount_paise": stage.amount_paise,
                "funding_state": stage.funding_state,
                "cancellation_reason_code": stage.cancellation_reason_code,
            },
        }
        for stage in EngagementStage.objects.filter(engagement=engagement)
    )
    return events


def _case_events(requirement: CustomerRequirement) -> list[dict[str, Any]]:
    return [
        {
            "at": case.created_at,
            "type": "CASE_OPENED",
            "detail": {
                "case_id": str(case.id),
                "kind": case.kind,
                "status": case.status,
                "severity": case.severity,
                "owner_team": case.owner_team,
                "holds_payout": case.holds_payout,
                "resolution": case.resolution,
                "due_at": case.due_at.isoformat(),
            },
        }
        for case in disputes.request_cases(requirement)
    ]


def request_timeline(requirement: CustomerRequirement) -> list[dict[str, Any]]:
    """One chronological history of everything that happened to one request (`M2-BE-711`).

    Assembled from the aggregates themselves rather than from a projection table, deliberately.
    A materialised timeline is a second source of truth that drifts the first time a command
    forgets to append to it, and the failure mode is the worst available: a timeline that looks
    complete and is not. This is the read a support agent is about to make a money decision from.
    """
    events: list[dict[str, Any]] = [
        {
            "at": transition.occurred_at,
            "type": "REQUIREMENT_TRANSITION",
            "detail": {
                "from_status": transition.from_status,
                "to_status": transition.to_status,
                "reason_code": transition.reason_code,
                "reason": transition.reason,
                "actor_id": str(transition.actor_id) if transition.actor_id else None,
            },
        }
        for transition in requirement.transitions.all()
    ]
    events.extend(_snapshot_events(requirement))
    events.extend(_invitation_events(requirement))
    events.extend(
        {
            "at": question.asked_at,
            "type": "QUESTION",
            "detail": {
                "question_id": str(question.id),
                "answered": question.answered_at is not None,
            },
        }
        for question in RequirementQuestion.objects.filter(requirement=requirement)
    )
    events.extend(
        {
            "at": proposal.created_at,
            "type": "PROPOSAL",
            "detail": {
                "proposal_id": str(proposal.id),
                "partner_id": str(proposal.partner_id),
                "status": proposal.status,
                "total_paise": proposal.total_paise,
                "vendor_confirmed": proposal.vendor_confirmed_at is not None,
            },
        }
        for proposal in Proposal.objects.filter(requirement=requirement)
    )
    events.extend(
        {
            "at": visit.created_at,
            "type": "SITE_VISIT",
            "detail": {"site_visit_id": str(visit.id), "status": visit.status},
        }
        for visit in SiteVisit.objects.filter(requirement=requirement)
    )
    events.extend(_money_events(requirement))
    events.extend(_engagement_events(requirement))
    events.extend(_case_events(requirement))
    events.extend(
        {
            "at": cancellation.created_at,
            "type": "CANCELLATION",
            "detail": {
                "cancellation_id": str(cancellation.id),
                "status": cancellation.status,
                "actor_role": cancellation.actor_role,
                "reason_code": cancellation.reason_code,
                "remedy_code": cancellation.remedy_code,
            },
        }
        for cancellation in RequirementCancellation.objects.filter(requirement=requirement)
    )
    events.extend(
        {
            "at": touch.occurred_at,
            "type": "OPERATIONS_TOUCH",
            "detail": {
                "action": touch.action,
                "reason": touch.reason,
                "actor_id": str(touch.actor_id) if touch.actor_id else None,
            },
        }
        for touch in OperationsTouch.objects.filter(requirement=requirement)
    )
    events.sort(key=lambda event: (event["at"], event["type"]))
    return events


def find_requirement(*, requirement_id: uuid.UUID) -> CustomerRequirement:
    """`M2-AC-801`: Operations finds any request by a safe identifier."""
    requirement = (
        CustomerRequirement.objects.select_related("configuration", "service_area", "variant")
        .filter(pk=requirement_id)
        .first()
    )
    if requirement is None:
        raise RequirementNotFoundError()
    return requirement


# ---------------------------------------------------------------------------
# `M2-BE-712`: safe recovery actions
# ---------------------------------------------------------------------------


@transaction.atomic
def rematch_requirement(
    *, requirement_id: uuid.UUID, actor: User, reason: str
) -> CustomerRequirement:
    """Send the request round again, for free.

    Two shapes behind one command, because the Customer's question is one question — "find me
    somebody else" — and which engine answers it is an implementation detail they should not have
    to know: a rate-card A3 booking advances its **cascade**, and everything else runs another
    **invitation wave**. Neither charges anything: on the rate-card path there is no money until a
    lead accepts and the Customer pays, and on the quote path the unlock is already bought.
    """
    requirement = CustomerRequirement.objects.select_for_update(of=("self",)).get(pk=requirement_id)
    if requirement.status in CustomerRequirement.CLOSED_STATUSES:
        raise RequirementTransitionError("A closed request cannot be rematched.")
    if not reason.strip():
        raise RequirementTransitionError("A rematch needs a reason.")

    booking = RateCardBooking.objects.filter(requirement=requirement).first()
    if booking is not None and booking.status in RateCardBooking.DISPATCHABLE_STATUSES:
        from apps.requirements import crew_dispatch  # noqa: PLC0415 - mutual import

        crew_dispatch.advance_cascade(requirement_id=requirement.id)
    else:
        matching.invite_wave(requirement_id=requirement.id)
    record_touch(requirement=requirement, actor=actor, action="rematch", reason=reason)
    services.record_transition(
        requirement=requirement,
        from_status=requirement.status,
        to_status=requirement.status,
        actor=actor,
        reason_code="operations_rematch",
        reason=reason.strip()[:2000],
    )
    return requirement


@transaction.atomic
def extend_requirement_deadline(
    *, requirement_id: uuid.UUID, actor: User, extra_hours: int, reason: str
) -> CustomerRequirement:
    """Give a request more time before its delivery SLA closes it.

    Moves **`service_by`**, which is the only deadline on a requirement that closing depends on,
    and only ever forwards. A deadline extension that could pull a date in would be a way to close
    somebody's live request by moving its clock, which is the opposite of a recovery action.
    """
    if extra_hours <= 0:
        raise RequirementTransitionError("An extension moves a deadline forward.")
    if not reason.strip():
        raise RequirementTransitionError("An extension needs a reason.")
    requirement = CustomerRequirement.objects.select_for_update(of=("self",)).get(pk=requirement_id)
    if requirement.status in CustomerRequirement.CLOSED_STATUSES:
        raise RequirementTransitionError("A closed request has no deadline left to extend.")
    if requirement.service_by is None:
        raise RequirementTransitionError("This request has no needed-by date to extend.")
    previous = requirement.service_by
    requirement.service_by = previous + timedelta(hours=extra_hours)
    requirement.save(update_fields=("service_by", "updated_at"))
    record_touch(requirement=requirement, actor=actor, action="extend_deadline", reason=reason)
    services.record_transition(
        requirement=requirement,
        from_status=requirement.status,
        to_status=requirement.status,
        actor=actor,
        reason_code="operations_deadline_extended",
        reason=f"service_by {previous.isoformat()} -> {requirement.service_by.isoformat()}: "
        f"{reason.strip()}"[:2000],
    )
    return requirement


@transaction.atomic
def reclassify(
    *, requirement_id: uuid.UUID, to_archetype: str, actor: User, reason: str
) -> CustomerRequirement:
    """Move an ambiguous request to the other lifecycle, and record the touch.

    A thin wrapper on `services.reclassify_requirement` so the metric sees it. The command itself
    is unchanged and still preserves every paid value — that is `access.carry_money_across_
    reclassification`'s job and this does not second-guess it.
    """
    requirement = services.reclassify_requirement(
        requirement_id=requirement_id,
        to_archetype=to_archetype,
        actor=actor,
        reason=reason,
    )
    record_touch(requirement=requirement, actor=actor, action="reclassify", reason=reason)
    return requirement


@transaction.atomic
def review_refund(
    *, requirement_id: uuid.UUID, actor: User, decision: str, reason: str
) -> OperationsTouch:
    """Record a human decision about a refund. Deliberately records rather than moves money.

    `07-state-machines-and-permissions.md` §7 lists "refund review" among what Operations may do,
    and review is what this is: the refund itself is executed by the module that owns the product,
    idempotently, through the M1 rail — `booking_fees._refund`, `access.refund_unlock`,
    `access.refund_share`. An Operations command that could move an arbitrary amount to an
    arbitrary payer would be a second refund path with none of the reconciliation of the first,
    and the acceptance criteria (`M2-AC-712`) require each product to reconcile independently.
    """
    if decision not in ("APPROVED", "DECLINED"):
        raise RequirementTransitionError("A refund review is approved or declined.")
    if not reason.strip():
        raise RequirementTransitionError("A refund review needs a reason.")
    requirement = find_requirement(requirement_id=requirement_id)
    services.record_transition(
        requirement=requirement,
        from_status=requirement.status,
        to_status=requirement.status,
        actor=actor,
        reason_code=f"refund_review_{decision.lower()}",
        reason=reason.strip()[:2000],
    )
    return record_touch(
        requirement=requirement,
        actor=actor,
        action="refund_review",
        reason=f"{decision}: {reason.strip()}",
    )


# ---------------------------------------------------------------------------
# `M2-BE-713`: assisted capture, on behalf of a named actor, with consent
# ---------------------------------------------------------------------------


@transaction.atomic
def capture_assisted_clarification(
    *,
    invitation_id: uuid.UUID,
    actor: User,
    question: str,
    answer: str,
    consent_recorded: bool,
) -> RequirementQuestion:
    """Write down a clarification that happened on the phone.

    Consent is a **refusal**, not a checkbox that decorates the record: without it the capture does
    not happen. `M2-AC-802` requires that assisted capture "record consent and the named
    Customer/Partner actor", and a consent flag that could be false while the row was still written
    would record the absence of consent next to the thing it was absent for.
    """
    if not consent_recorded:
        raise RequirementTransitionError(
            "Assisted capture needs the other party's recorded consent.",
        )
    if not question.strip() or not answer.strip():
        raise RequirementTransitionError("An assisted clarification needs both halves.")
    invitation = (
        VendorInvitation.objects.select_related("requirement", "partner")
        .filter(pk=invitation_id)
        .first()
    )
    if invitation is None:
        raise RequirementNotFoundError()
    requirement = invitation.requirement
    now = timezone.now()
    # `asked_by` is the **Partner's owner** and `answered_by` is the **Customer**, because that is
    # who actually asked and answered; the operator who wrote it down is `captured_by`. Attributing
    # both halves to the operator would put a question the vendor asked into the record as a
    # question staff asked, which is the attribution failure `M2-AC-802` is about.
    captured = RequirementQuestion.objects.create(
        requirement=requirement,
        invitation=invitation,
        asked_by=invitation.partner.user,
        question=question.strip(),
        answer=answer.strip(),
        answered_by=requirement.customer,
        answered_at=now,
        captured_by=actor,
        consent_recorded_at=now,
    )
    record_touch(
        requirement=requirement,
        actor=actor,
        action="assisted_clarification",
        reason=question.strip(),
    )
    return captured


@transaction.atomic
def capture_assisted_proposal(
    *,
    invitation_id: uuid.UUID,
    actor: User,
    payload: dict[str, Any],
    consent_recorded: bool,
) -> Proposal:
    """Write down a quote a vendor gave over the phone. **The vendor still has to confirm it.**

    Revision 4 makes this a primary path rather than a convenience: on the A3 fallback the vendors
    who answer fastest are frequently the ones who will not fill in a form. But `M2-AC-218` and 07
    §7 are both explicit that an assisted quote is "attributed to the Partner, the Partner confirms
    it, and only then is it visible to the Customer" — so this writes a `Proposal` with
    `vendor_confirmed_at` **null**, which every Customer-facing read already filters on, and the
    vendor's own confirmation is what publishes it.

    Attribution is to the Partner, not to the operator. The quote is the vendor's price and the
    record has to say so; who typed it is `captured_by_operations` and the touch row.
    """
    if not consent_recorded:
        raise RequirementTransitionError(
            "Assisted capture needs the Partner's recorded consent.",
        )
    invitation = (
        VendorInvitation.objects.select_related("requirement", "partner")
        .filter(pk=invitation_id)
        .first()
    )
    if invitation is None:
        raise RequirementNotFoundError()
    proposal = proposals.submit_proposal(
        invitation_id=invitation.id,
        captured_by=actor,
        **payload,
    )
    record_touch(
        requirement=invitation.requirement,
        actor=actor,
        action="assisted_proposal",
        reason=f"partner {invitation.partner_id} quoted by phone",
    )
    return proposal


# ---------------------------------------------------------------------------
# The crew-document verification Wave C5 deferred (`documents_verified_at`'s writer)
# ---------------------------------------------------------------------------


@transaction.atomic
def verify_crew_documents(
    *,
    membership_id: uuid.UUID,
    actor: User,
    verified: bool,
    reason: str = "",
) -> PartnerCrewMembership:
    """Verify — or un-verify — one worker on one vendor's roster.

    **This is the writer `PartnerCrewMembership.documents_verified_at` did not have.** Wave C5's
    audit found four readers and no writer anywhere: `crew_dispatch.verified_roster_size` counts
    only verified memberships when it sizes a lead's roster against the headcount,
    `workforce.assign_crew` refuses an unverified worker outright, and both apps publish a badge
    from it. With nothing setting it, **every vendor's verified roster was zero in every
    environment** — so the A3 cascade excluded every lead, `accept_crew_offer` answered
    `m2_roster_insufficient`, and the rate-card walkthrough this whole revision exists for could
    not reach its third step. C5 stamped it in the dev seed so the demo would walk and recorded
    that the honest writer belonged here.

    It is built as a reviewed surface rather than a setter, because that is what it is: it decides
    whether a named person may be sent to a stranger's home.

    * **An actor.** Operations-only by permission; the operator is stored on the audit row.
    * **A reason on the negative path.** Verifying needs none — the documents were seen — but
      *removing* verification takes somebody off jobs they may already be assigned to, and "why"
      is the first thing the vendor will ask.
    * **An audit trail.** A `PartnerStandingEvent` is deliberately *not* used: standing is about a
      vendor's conduct, and a document check is about a worker's paperwork. The trail is the
      `AccessAuditEvent` the Operations permission already writes plus the timestamp itself, which
      is why un-verifying clears the timestamp rather than deleting the row.
    * **Idempotence.** Verifying an already-verified membership returns it unchanged rather than
      re-stamping, so the date keeps meaning "when the documents were actually checked".
    """
    membership = (
        PartnerCrewMembership.objects.select_for_update(of=("self",))
        .select_related("partner", "crew_member")
        .filter(pk=membership_id)
        .first()
    )
    if membership is None:
        raise RequirementNotFoundError()
    if membership.status != PartnerCrewMembership.Status.ACTIVE:
        raise RequirementTransitionError(
            "This crew member is archived, so their documents cannot be verified.",
        )
    if verified and membership.documents_verified_at is not None:
        return membership
    if not verified and membership.documents_verified_at is None:
        return membership
    if not verified and not reason.strip():
        raise RequirementTransitionError(
            "Removing a crew member's verification needs a reason.",
        )
    now = timezone.now()
    membership.documents_verified_at = now if verified else None
    membership.save(update_fields=("documents_verified_at",))
    enqueue_outbox_event(
        aggregate_type="partner",
        aggregate_id=membership.partner_id,
        event_type="m2.crew.documents_verified" if verified else "m2.crew.verification_removed",
        idempotency_key=(
            f"crew-verification:{membership.id}:{now.isoformat() if verified else 'removed'}"
        ),
        payload={
            "partner_id": str(membership.partner_id),
            "membership_id": str(membership.id),
            "verified": verified,
            "actor_id": str(actor.id),
            "reason": reason.strip()[:240],
        },
    )
    return membership


def crew_memberships_awaiting_verification(
    *, partner_id: uuid.UUID | None = None, state: str = "PENDING"
) -> list[PartnerCrewMembership]:
    """The queue the command above works from. Active memberships, oldest first.

    `state` exists because `verify_crew_documents` can un-verify and nothing could reach a
    verified membership to do it. A queue that shows only unverified people is the right *default*
    — it is a worklist, and a reviewer opening it wants what is waiting — but it made the negative
    half of the command unreachable from any screen, which is how a supported operation becomes an
    orphan. `VERIFIED` is how a reviewer finds somebody whose ID turned out to be expired.
    """
    queryset = PartnerCrewMembership.objects.filter(
        status=PartnerCrewMembership.Status.ACTIVE,
    ).select_related("partner", "crew_member")
    if state == "PENDING":
        queryset = queryset.filter(documents_verified_at__isnull=True)
    elif state == "VERIFIED":
        queryset = queryset.filter(documents_verified_at__isnull=False)
    if partner_id is not None:
        queryset = queryset.filter(partner_id=partner_id)
    # Verified rows are ordered by when they were verified, not when they were added: a reviewer
    # looking for a mistake is looking for a recent decision, and `added_at` would bury it under
    # everyone registered since the platform opened.
    ordering = "added_at" if state == "PENDING" else "-documents_verified_at"
    return list(queryset.order_by(ordering)[:200])


@transaction.atomic
def correct_crew_gender(
    *,
    membership_id: uuid.UUID,
    actor: User,
    gender: str,
    reason: str,
) -> PartnerCrewMembership:
    """Settle a disputed crew gender. The arbiter `set_crew_gender` said only a person could be.

    `CrewMember.gender` is one row per person across every agency, so the Partner-facing rule is
    first-write-wins: a contradicting write is refused with `m2_crew_gender_conflict` rather than
    silently flipping which gendered slots another agency can fill. That rule is right and it had
    no exit. The refusal message says *"contact support if that is wrong"* and support had no
    endpoint — so a worker recorded wrongly by whichever agency typed first lost gendered work
    permanently, and the second agency's only recourse was to stop using the platform for them.

    So the correction is here, on the Operations surface, and not on the Partner one:

    * **A reason, always.** Unlike a first recording, this overwrites something another agency is
      already being dispatched against. There is no version of this where "why" is optional.
    * **No clearing.** Blank is refused for the same reason `set_crew_gender` refuses it: it would
      silently re-open every gendered slot the worker had been filling, and there is no honest
      screen for "I would like to un-know this". `UNDISCLOSED` is the value for a worker who
      declined, and it is selectable here.
    * **Addressed by membership.** Operations arrives from the roster row they are looking at, and
      `crew_member_id` is deliberately absent from every published shape.
    """
    membership = (
        PartnerCrewMembership.objects.select_for_update(of=("self",))
        .select_related("partner", "crew_member")
        .filter(pk=membership_id)
        .first()
    )
    if membership is None:
        raise RequirementNotFoundError()
    if gender not in CrewMember.Gender.values:
        raise RequirementTransitionError("Choose what this worker is recorded as.")
    if not reason.strip():
        raise RequirementTransitionError("Correcting a recorded gender needs a reason.")

    crew_member = membership.crew_member
    previous = crew_member.gender
    if previous == gender:
        return membership
    crew_member.gender = gender
    crew_member.save(update_fields=("gender", "updated_at"))

    now = timezone.now()
    enqueue_outbox_event(
        aggregate_type="partner",
        aggregate_id=membership.partner_id,
        event_type="m2.crew.gender_corrected",
        idempotency_key=f"crew-gender:{membership.id}:{now.isoformat()}",
        payload={
            "partner_id": str(membership.partner_id),
            "membership_id": str(membership.id),
            # The previous value is the whole point of the record: this write is only ever made
            # because two agencies disagreed, and an event that omits what it overwrote cannot
            # answer the question the dispute will be reopened with.
            "previous_gender": previous,
            "gender": gender,
            "actor_id": str(actor.id),
            "reason": reason.strip()[:240],
        },
    )
    return membership


# ---------------------------------------------------------------------------
# `M2-BE-714`: stuck-state queues
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class StuckQueue:
    """One named queue, its depth, and the oldest thing in it."""

    code: str
    #: `queue_label`, not `label` — the wire shape cannot use `label` (it shadows DRF's own
    #: `Serializer.label`), and a dataclass whose field names did not match the serializer's would
    #: make `asdict(queue)` silently drop it.
    queue_label: str
    depth: int
    oldest_at: datetime | None
    #: What a scheduled recovery would do to it, or `""` when only a person can decide. Published
    #: so the console renders a real button instead of guessing from the queue name — the same
    #: reason `recovery_action` is published on M1 Booking Groups.
    recovery_action: str


def _oldest(queryset: Any, field: str) -> datetime | None:
    value = queryset.order_by(field).values_list(field, flat=True).first()
    return value if isinstance(value, datetime) else None


def stuck_queues(*, at: datetime | None = None) -> list[StuckQueue]:
    """Every M2 record that has stopped moving and is nobody's inbox item yet.

    The six the plan names — unmatched, under-quoted, SLA-breached, unconfirmed, inactive,
    unreconciled — plus the two Wave C6 creates: a cancellation nobody answered and a case past its
    party deadline.

    **Nothing here invents a threshold.** Every queue is defined by a deadline that already exists
    on the record — `service_by`, `hold_expires_at`, `response_due_at`, `confirmation_due_at`, the
    case SLA — so an unset owner value cannot silently change what counts as stuck. A queue whose
    deadline is null simply has nothing in it, which is the honest reading of "we promised no
    clock here".
    """
    moment = at or timezone.now()
    live = ~Q(status__in=CustomerRequirement.CLOSED_STATUSES)

    unmatched = (
        CustomerRequirement.objects.filter(live, status=CustomerRequirement.Status.MATCHING)
        .annotate(invitation_count=Count("invitations"))
        .filter(invitation_count=0)
    )

    under_quoted = CustomerRequirement.objects.filter(
        live,
        status=CustomerRequirement.Status.MATCHING,
        first_quote_due_at__isnull=False,
        first_quote_due_at__lte=moment,
    )

    expired = CustomerRequirement.objects.filter(
        live, service_by__isnull=False, service_by__lt=moment.date()
    )

    unconfirmed = RateCardBooking.objects.filter(
        status=RateCardBooking.Status.OFFER_HELD,
        hold_expires_at__isnull=False,
        hold_expires_at__lte=moment,
    )

    inactive_engagements = Engagement.objects.filter(
        status__in=(Engagement.Status.PENDING_START, Engagement.Status.ACTIVE),
        updated_at__lt=moment - timedelta(days=14),
    )

    unreconciled_fees = BookingFee.objects.filter(
        status=BookingFee.Status.PENDING,
        created_at__lt=moment - timedelta(hours=1),
    )

    lapsed_cancellations = RequirementCancellation.objects.filter(
        status=RequirementCancellation.Status.AWAITING_CONFIRMATION,
        confirmation_due_at__isnull=False,
        confirmation_due_at__lte=moment,
    )

    overdue_cases = OperationsCase.objects.filter(
        response_due_at__isnull=False, response_due_at__lte=moment
    ).exclude(status__in=tuple(TERMINAL_CASE_STATUSES))

    return [
        StuckQueue(
            code="unmatched",
            queue_label="Matching with nobody invited",
            depth=unmatched.count(),
            oldest_at=_oldest(unmatched, "submitted_at"),
            recovery_action="rematch",
        ),
        StuckQueue(
            code="under_quoted",
            queue_label="Past the first-quote promise",
            depth=under_quoted.count(),
            oldest_at=_oldest(under_quoted, "first_quote_due_at"),
            recovery_action="rematch",
        ),
        StuckQueue(
            code="sla_breached",
            queue_label="Needed-by date has passed",
            depth=expired.count(),
            oldest_at=_oldest(expired, "submitted_at"),
            recovery_action="close_expired",
        ),
        StuckQueue(
            code="unconfirmed",
            queue_label="Accepted offer held past its expiry",
            depth=unconfirmed.count(),
            oldest_at=_oldest(unconfirmed, "hold_expires_at"),
            recovery_action="release_offer_hold",
        ),
        StuckQueue(
            code="inactive",
            queue_label="Engagement with no movement for a fortnight",
            depth=inactive_engagements.count(),
            oldest_at=_oldest(inactive_engagements, "updated_at"),
            recovery_action="",
        ),
        StuckQueue(
            code="unreconciled",
            queue_label="Booking fee awaiting the provider",
            depth=unreconciled_fees.count(),
            oldest_at=_oldest(unreconciled_fees, "created_at"),
            recovery_action="reconcile_payment",
        ),
        StuckQueue(
            code="cancellation_unanswered",
            queue_label="Cancellation nobody confirmed or disputed",
            depth=lapsed_cancellations.count(),
            oldest_at=_oldest(lapsed_cancellations, "confirmation_due_at"),
            recovery_action="lapse_to_operations",
        ),
        StuckQueue(
            code="case_response_overdue",
            queue_label="Case past the parties' response deadline",
            depth=overdue_cases.count(),
            oldest_at=_oldest(overdue_cases, "response_due_at"),
            recovery_action="",
        ),
    ]


# ---------------------------------------------------------------------------
# `M2-BE-715`: the touches-per-request metric
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class TouchMetric:
    """One request's Operations cost, and whether it fits the approved model."""

    requirement_id: uuid.UUID
    archetype: str
    touches: int
    #: `None` while the owner has not set a budget for this variant. The count is still real.
    budget: int | None
    #: `None` for the same reason. Never `False` on an unset budget, which would read as "within
    #: budget" and is the one wrong answer available here.
    within_budget: bool | None
    #: The money the touches have to fit inside. For A3 that is the booking fee's platform share
    #: (decision 10 as restated by ADR-0009), because the booking fee is the platform's entire A3
    #: revenue; for A5 it is the visit plan's platform shares plus commission.
    platform_revenue_paise: int


def _platform_revenue_paise(requirement: CustomerRequirement) -> int:
    """What Vsolve actually kept on this request, in paise.

    Only settled money counts. An `ACTIVE` booking fee is money the platform is holding against a
    crew that has not arrived yet, and counting it as revenue would make the unit economics look
    healthiest exactly when the most is at risk.
    """
    revenue = 0
    for fee in BookingFee.objects.filter(requirement=requirement):
        if fee.status == BookingFee.Status.EARNED:
            revenue += fee.amount_paise
        elif fee.status == BookingFee.Status.FORFEIT_SPLIT:
            revenue += fee.platform_share_paise
    for unlock in QuoteUnlock.objects.filter(
        requirement=requirement, status=QuoteUnlock.Status.CONSUMED
    ):
        revenue += unlock.price_paise
    for share in VisitPlanShare.objects.filter(
        plan__requirement=requirement, status=VisitPlanShare.Status.EARNED
    ):
        revenue += share.platform_share_paise
    engagement = Engagement.objects.filter(requirement=requirement).first()
    if engagement is not None:
        revenue += engagement.commission_paise
    return revenue


def touch_metric(requirement: CustomerRequirement) -> TouchMetric:
    """`GAP-033`: measure it, and say plainly when the budget is not set rather than passing."""
    touches = OperationsTouch.objects.filter(requirement=requirement).count()
    try:
        budget = pricing.operations_touch_budget(requirement)
    except PolicyUnavailableError:
        budget = None
    return TouchMetric(
        requirement_id=requirement.id,
        archetype=requirement.archetype,
        touches=touches,
        budget=budget,
        within_budget=None if budget is None else touches <= budget,
        platform_revenue_paise=_platform_revenue_paise(requirement),
    )


def touch_rollup(*, since: datetime | None = None) -> dict[str, Any]:
    """The whole book, for the dashboard `M2-AC-810` measures against."""
    start = since or (timezone.now() - timedelta(days=30))
    rows = (
        OperationsTouch.objects.filter(occurred_at__gte=start)
        .values("action")
        .annotate(count=Count("id"))
        .order_by("-count")
    )
    touched_requirements = (
        OperationsTouch.objects.filter(occurred_at__gte=start)
        .values("requirement_id")
        .distinct()
        .count()
    )
    total = sum(int(row["count"]) for row in rows)
    return {
        "since": start,
        "requests_touched": touched_requirements,
        "total_touches": total,
        "mean_touches_per_touched_request": (
            round(total / touched_requirements, 2) if touched_requirements else 0.0
        ),
        "by_action": [{"action": row["action"], "count": int(row["count"])} for row in rows],
        "server_now": timezone.now(),
    }


def unearned_booking_fee_exposure_paise() -> int:
    """How much Customer money is sitting against crews that have not arrived.

    Not part of any task, and one query: it is the number the stop-conditions in
    `04-acceptance-and-cutover.md` are actually about, and a reconciliation report that could not
    answer it would be a report about the past.
    """
    return sum(
        fee.amount_paise
        for fee in BookingFee.objects.filter(status=BookingFee.Status.ACTIVE).only("amount_paise")
    )
