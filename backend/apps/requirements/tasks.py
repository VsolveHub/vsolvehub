"""Periodic M2 watchdogs: expiry, SLA breach, invitation replacement, quote expiry.

Until 12 August 2026 these four sweeps existed only as selectors — `expired_requirement_ids`,
`sla_breached_requirement_ids`, `expired_invitation_ids`, `expired_proposal_ids` — with no
`CELERY_BEAT_SCHEDULE` entry behind any of them. Nothing outside their own tests ever called them,
which meant an unanswered invitation wave stalled forever and a requirement whose needed-by date had
passed was never closed by anything. This module is the missing half.

Two properties every sweep here has, following `apps.fulfilment.tasks`:

**Idempotent under overlapping runs.** Every per-record task delegates to a domain command that is
idempotent by state — `close_requirement` returns early on an already-closed requirement,
`expire_proposal` on an already-expired quote, and `expire_invitation_and_replace` invites a
replacement only when this call is the one that moved the invitation. A slow tick overlapping the
next one therefore changes nothing twice, and in particular **a replay cannot double-invite**.

**The sweep decides only when to look.** Whether a record actually qualifies is the domain's
decision, re-taken under a row lock inside the per-record task. A sweep that re-derived the rule
would drift from the command, and the drift would show up as records the watchdog thinks it has
already handled.
"""

from contextlib import suppress
from uuid import UUID

from celery import shared_task
from django.utils import timezone

from apps.foundation.services import enqueue_outbox_event
from apps.identity.models import User
from apps.notifications.models import NotificationIntent
from apps.notifications.services import request_notification
from apps.requirements import (
    access,
    attachments,
    booking_fees,
    crew_dispatch,
    engagements,
    matching,
    proposals,
    services,
    stages,
    workforce,
)
from apps.requirements.exceptions import RequirementTransitionError
from apps.requirements.models import (
    CustomerRequirement,
    RateCardBooking,
    RequirementAttachmentUpload,
    StageEvidenceUpload,
)
from apps.requirements.storage import DocumentStorageError, get_attachment_storage

#: How many records one tick hands off. Bounded so a backlog is drained over several ticks rather
#: than filling the queue in one, which is how a watchdog turns into an outage.
SWEEP_BATCH_SIZE = 200

#: How long a one-sided "Day settled?" claim stands before Operations is told about it
#: (`M2-BE-536`). A working day: the other party is asleep, on a site, or has no signal, and
#: paging an operator the same evening would page them about every ordinary settlement where one
#: person taps before the other. **Not an owner-blocked value** — nothing about a vendor or a
#: Customer changes when it elapses, and no money moves. It is how long a queue waits.
UNPROVEN_SETTLEMENT_HOURS = 24


# ---------------------------------------------------------------------------
# `service_by` — the clock that outranks every other clock
# ---------------------------------------------------------------------------


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 8},
)
def close_one_expired_requirement(_self: object, requirement_id: str) -> None:
    services.close_requirement(
        requirement_id=UUID(requirement_id),
        status=CustomerRequirement.Status.CLOSED_EXPIRED,
        reason_code="service_by_passed",
    )


@shared_task
def sweep_expired_requirements() -> int:
    """Close every live requirement whose needed-by date has passed.

    A quote delivered after the work date is worthless, so this clock outranks the delivery SLA and
    every other transition. Refunding an unlock against a closed requirement is `M2-BE-705` and
    arrives with the unlock itself in Wave C2; `close_requirement` emits `m2.requirement.closed`,
    which is the event that refund path will consume, so nothing has to be re-plumbed here later.
    """
    swept = 0
    for requirement_id in services.expired_requirement_ids()[:SWEEP_BATCH_SIZE]:
        close_one_expired_requirement.delay(str(requirement_id))
        swept += 1
    return swept


# ---------------------------------------------------------------------------
# Quote-delivery SLA
# ---------------------------------------------------------------------------


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 8},
)
def close_one_sla_breached_requirement(_self: object, requirement_id: str) -> None:
    services.close_requirement(
        requirement_id=UUID(requirement_id),
        status=CustomerRequirement.Status.CLOSED_SLA_BREACH,
        reason_code="quote_delivery_sla_missed",
    )


@shared_task
def sweep_sla_breached_requirements() -> int:
    """Close requirements still matching past the delivery promise, with no quote yet.

    Nothing was charged, so this is an explanation rather than a refund — and the explanation is the
    point. `CLOSED_SLA_BREACH` is a distinct status precisely so "nobody covers this yet" and "we
    ran out of time" reach the Customer as different sentences with different next actions.

    **The Customer notification is not sent from here and is not sent at all yet.** The escalation
    ladder in `apps.notifications.escalation` is built and its transport is a fail-closed seam
    waiting on MSG91 (`M2-BE-807`). Emitting `m2.requirement.closed` and leaving the delivery
    unwired is honest; calling a transport that raises would turn a missed promise into a retry
    storm.
    """
    swept = 0
    for requirement_id in services.sla_breached_requirement_ids()[:SWEEP_BATCH_SIZE]:
        close_one_sla_breached_requirement.delay(str(requirement_id))
        swept += 1
    return swept


# ---------------------------------------------------------------------------
# Invitations — the sweep the delivery promise actually depends on
# ---------------------------------------------------------------------------


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 8},
)
def expire_one_invitation(_self: object, invitation_id: str) -> int:
    """Expire one invitation and invite its replacement. Returns how many were invited.

    The replacement is taken inside `expire_invitation_and_replace`, in the same transaction and
    under the same requirement lock as the expiry, so a retried task cannot expire once and invite
    twice.
    """
    replacements = matching.expire_invitation_and_replace(invitation_id=UUID(invitation_id))
    return len(replacements)


@shared_task
def sweep_expired_invitations() -> int:
    """Expire unanswered invitations, release their slots and invite replacements.

    This is the sweep whose absence stalled M2: without it a wave that nobody answered sat holding
    every quote slot until the requirement's delivery promise elapsed, and the Customer's only
    signal was silence followed by `CLOSED_SLA_BREACH`.
    """
    swept = 0
    for invitation_id in matching.expired_invitation_ids()[:SWEEP_BATCH_SIZE]:
        expire_one_invitation.delay(str(invitation_id))
        swept += 1
    return swept


# ---------------------------------------------------------------------------
# Proposal validity
# ---------------------------------------------------------------------------


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 8},
)
def expire_one_proposal(_self: object, proposal_id: str) -> None:
    proposals.expire_proposal(proposal_id=UUID(proposal_id))


@shared_task
def sweep_expired_proposals() -> int:
    """Retire quotes past their own validity date, so nobody unlocks one that is already dead."""
    swept = 0
    for proposal_id in proposals.expired_proposal_ids()[:SWEEP_BATCH_SIZE]:
        expire_one_proposal.delay(str(proposal_id))
        swept += 1
    return swept


# ---------------------------------------------------------------------------
# Visit-plan share settlement (`M2-BE-425`)
#
# Four clocks, four sweeps, and they are separate because their outcomes are. A slot nobody took
# refunds; a slot somebody took and abandoned refunds *or* buys a replacement; a hold nobody paid
# for simply lapses. Collapsing them would make one policy decision stand for three.
# ---------------------------------------------------------------------------


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 8},
)
def refund_one_unfilled_share(_self: object, share_id: str) -> None:
    access.refund_share(share_id=UUID(share_id), reason_code="m2_visit_slot_never_filled")


@shared_task
def sweep_unfilled_visit_shares() -> int:
    """Refund every plan slot no vendor ever took, once the visit-delivery SLA passes.

    This is the promise that makes the A5 front door honest: a Customer who paid for three visits
    and received two gets the third one's share back **without a support ticket**. `refund_share`
    is idempotent by state, so two overlapping ticks issue one refund.
    """
    swept = 0
    for share_id in access.unfilled_share_ids()[:SWEEP_BATCH_SIZE]:
        refund_one_unfilled_share.delay(str(share_id))
        swept += 1
    return swept


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 8},
)
def settle_one_missed_estimate(_self: object, site_visit_id: str) -> None:
    access.settle_missed_estimate(site_visit_id=UUID(site_visit_id))


@shared_task
def sweep_missed_estimate_windows() -> int:
    """A vendor visited, produced nothing, and the post-visit window closed.

    The visit-side analogue of a non-responsive quote. The share refunds or buys a free replacement
    visit depending on whether the plan still has time to run — `settle_missed_estimate` decides,
    because that is a policy question and this only decides when to ask it.
    """
    swept = 0
    for visit_id in access.missed_estimate_visit_ids()[:SWEEP_BATCH_SIZE]:
        settle_one_missed_estimate.delay(str(visit_id))
        swept += 1
    return swept


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 8},
)
def release_one_expired_visit_hold(_self: object, site_visit_id: str) -> None:
    access.release_expired_visit_hold(site_visit_id=UUID(site_visit_id))


@shared_task
def sweep_expired_visit_holds() -> int:
    """Hand back the grid slot of a first visit the Customer never paid for.

    Nothing was charged, so nothing is refunded — the hold lapses, the share returns to `OPEN` and
    the vendor's time goes back on the availability grid. Without this sweep "the hold expires
    harmlessly if they never pay" would be a sentence with no code behind it, and a vendor's diary
    would carry a dead reservation forever.
    """
    swept = 0
    for visit_id in access.expired_visit_hold_ids()[:SWEEP_BATCH_SIZE]:
        release_one_expired_visit_hold.delay(str(visit_id))
        swept += 1
    return swept


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 8},
)
def release_one_visit_payout_hold(_self: object, share_id: str) -> None:
    access.release_visit_payout_hold(share_id=UUID(share_id))


@shared_task
def sweep_visit_payout_holds() -> int:
    """Make earned visit payouts payable once the vendor's bank details land.

    The progressive gate holds the money, it does not cancel it: a vendor who completed a visit and
    delivered an estimate is owed regardless of when they get round to onboarding their account.
    `payouts.release_payout_hold` cannot do this — it resolves by Booking, and a visit has none.
    """
    swept = 0
    for share_id in access.held_visit_payout_share_ids()[:SWEEP_BATCH_SIZE]:
        release_one_visit_payout_hold.delay(str(share_id))
        swept += 1
    return swept


# ---------------------------------------------------------------------------
# Vendor reconfirmation (`M2-BE-408`, `409`)
# ---------------------------------------------------------------------------


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 8},
)
def expire_one_selection(_self: object, selection_id: str) -> None:
    engagements.expire_selection(selection_id=UUID(selection_id))


@shared_task
def sweep_expired_selections() -> int:
    """Release a selection the chosen vendor never answered.

    The Customer's unlock or visit plan survives it untouched — that is the whole point of the
    command this calls — so the requirement returns to the state it was selectable from and the
    next quote costs nothing more. Without the sweep a silent vendor would freeze a requirement in
    `SELECTED` until its needed-by date.
    """
    swept = 0
    for selection_id in engagements.expired_selection_ids()[:SWEEP_BATCH_SIZE]:
        expire_one_selection.delay(str(selection_id))
        swept += 1
    return swept


# ---------------------------------------------------------------------------
# Attachment housekeeping
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# The engagement stage spine (`M2-BE-503`, `M2-BE-507`)
#
# Two clocks, two sweeps, and their cadences differ for the reason the C1 and C2 cadences differ:
# one of them decides that silence was consent, and the other only moves money that is already
# earned.
# ---------------------------------------------------------------------------


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 8},
)
def expire_one_stage_review(_self: object, stage_id: str) -> None:
    stages.expire_stage_review(stage_id=UUID(stage_id))


@shared_task
def sweep_stage_reviews() -> int:
    """Approve stages whose review window closed with no decision.

    `07-state-machines-and-permissions.md` §5 permits `AWAITING_REVIEW → APPROVED` on review
    timeout **except while the stage is `DISPUTED`**. That exception is enforced twice on purpose:
    a disputed stage has its `review_due_at` cleared so it cannot appear in the selector at all,
    and `expire_stage_review` re-checks the status under the row lock — because a Customer can
    dispute in the window between this sweep reading a list and the task acting on one entry, and
    that is exactly the moment auto-approval would settle an objection by ignoring it.

    A stage whose variant has no configured review window is never swept, because
    `pricing.stage_review_deadline` answers `None` and this selector requires a real deadline.
    Releasing a vendor's money against a clock nobody set is the failure that would be worse than
    waiting.
    """
    swept = 0
    for stage_id in stages.stage_review_due_ids()[:SWEEP_BATCH_SIZE]:
        expire_one_stage_review.delay(str(stage_id))
        swept += 1
    return swept


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 8},
)
def release_one_stage_payout(_self: object, stage_id: str) -> None:
    stages.release_stage_payout(stage_id=UUID(stage_id))


@shared_task
def sweep_stage_payout_holds() -> int:
    """Release approved stages past their dispute window, and held earnings past their gate.

    One sweep for both halves because one command handles both, and each half is idempotent on its
    own: the stage moves to `RELEASED` when its window closes, and the ledger entry moves to
    `AVAILABLE` when the vendor's payout account is verified. A vendor who never adds bank details
    keeps a `PENDING` entry indefinitely, which is the honest record — the debt is real and unpaid.

    `payouts.release_payout_hold` cannot do this: it resolves an entry **by Booking**, and a stage
    has none. The same reason `access.release_visit_payout_hold` exists for a visit payout.
    """
    swept = 0
    for stage_id in stages.stage_payout_release_due_ids()[:SWEEP_BATCH_SIZE]:
        release_one_stage_payout.delay(str(stage_id))
        swept += 1
    return swept


@shared_task
def sweep_orphaned_stage_evidence_uploads() -> int:
    """Mark expired evidence-upload intents and delete any bytes that arrived against them.

    The stage twin of `sweep_orphaned_attachment_uploads`, and the same problem: an intent whose
    signed URL was used and never finalized is storage nobody owns and no record points at.
    """
    swept = 0
    for upload_id in stages.orphaned_stage_evidence_upload_ids()[:SWEEP_BATCH_SIZE]:
        upload = StageEvidenceUpload.objects.filter(
            id=upload_id,
            status=StageEvidenceUpload.Status.ISSUED,
        ).first()
        if upload is None:
            continue
        StageEvidenceUpload.objects.filter(id=upload.id).update(
            status=StageEvidenceUpload.Status.EXPIRED,
            failure_code="upload_expired",
        )
        with suppress(DocumentStorageError):
            get_attachment_storage().delete_object(object_key=upload.object_key)
        swept += 1
    return swept


@shared_task
def sweep_orphaned_attachment_uploads() -> int:
    """Mark expired upload intents and delete any bytes that arrived against them.

    An intent whose signed URL was used and never finalized is storage nobody owns and no record
    points at. Following `apps.partners.tasks.cleanup_partner_document_uploads`, which solves the
    same problem for KYC documents.
    """
    swept = 0
    for upload_id in attachments.orphaned_upload_ids()[:SWEEP_BATCH_SIZE]:
        upload = RequirementAttachmentUpload.objects.filter(
            id=upload_id,
            status=RequirementAttachmentUpload.Status.ISSUED,
        ).first()
        if upload is None:
            continue
        RequirementAttachmentUpload.objects.filter(id=upload.id).update(
            status=RequirementAttachmentUpload.Status.EXPIRED,
            failure_code="upload_expired",
        )
        # The intent is already marked expired, so nothing will finalize against it. A byte range
        # the provider would not delete is a storage-side orphan and not a reason to leave a live
        # intent behind, so a failure here is suppressed rather than retried.
        with suppress(DocumentStorageError):
            get_attachment_storage().delete_object(object_key=upload.object_key)
        swept += 1
    return swept


# ---------------------------------------------------------------------------
# Wave C2R — the rate-card cascade, the fee, and the decline alarm.
#
# These run on the **M1 dispatch cadence**, not the M2 business-hours one. Everything above sweeps
# a clock measured in business hours and ticks every two to fifteen minutes; a crew offer times out
# in minutes of wall time, so a two-minute sweep is the *slow* end of what it needs and the
# cadences below say so.
# ---------------------------------------------------------------------------

#: How far back the decline-rate alarm looks. A day, because ADR-0009's failure mode is a rate that
#: went stale *this week* and a window long enough to smooth that out is a monthly report wearing
#: an alarm's clothes.
DECLINE_ALARM_WINDOW_HOURS = 24


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 5},
)
def expire_one_crew_offer(_self: object, invitation_id: str) -> None:
    crew_dispatch.expire_crew_offer_and_advance(invitation_id=UUID(invitation_id))


@shared_task
def sweep_expired_crew_offers() -> int:
    """Expire crew offers past their wall-clock deadline and widen the cascade.

    Deliberately not folded into `sweep_expired_invitations`. That sweep replaces one invitation
    with one other on a business-hours deadline, which is right for a quote and wrong for a crew:
    the recovery here is the cascade widening, and routing a crew offer through the quote sweep
    would re-invite one lead tomorrow morning instead of three more in two minutes.
    """
    swept = 0
    for invitation_id in crew_dispatch.expired_crew_offer_ids()[:SWEEP_BATCH_SIZE]:
        expire_one_crew_offer.delay(str(invitation_id))
        swept += 1
    return swept


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 5},
)
def release_one_offer_hold(_self: object, booking_id: str) -> None:
    with suppress(RequirementTransitionError):
        crew_dispatch.release_expired_offer_hold(booking_id=UUID(booking_id))


@shared_task
def sweep_expired_offer_holds() -> int:
    """Hand back a lead's dates when the Customer never paid the booking fee.

    §4c: the hold "expires harmlessly" — no charge was made, the lead's standing is untouched, and
    the cascade proceeds. The suppression above is the idempotency: a booking somebody paid for
    between the selector and the task is no longer holding an offer, and that is the expected
    outcome rather than an error.
    """
    swept = 0
    for booking_id in crew_dispatch.expired_offer_hold_booking_ids()[:SWEEP_BATCH_SIZE]:
        release_one_offer_hold.delay(str(booking_id))
        swept += 1
    return swept


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 5},
)
def advance_one_cascade(_self: object, booking_id: str) -> None:
    booking = RateCardBooking.objects.filter(id=UUID(booking_id)).first()
    if booking is None:
        return
    crew_dispatch.advance_cascade(requirement_id=booking.requirement_id)


@shared_task
def sweep_stalled_rate_card_bookings() -> int:
    """Nudge any booking that is matching with no live offer against it.

    Every ordinary path calls `advance_cascade` directly; this is the watchdog for the paths that
    do not happen. Without it, a wave whose last invitation was expired by the quote sweep leaves
    the Customer watching a holding state that resolves to nothing.
    """
    swept = 0
    for booking_id in crew_dispatch.stalled_rate_card_booking_ids()[:SWEEP_BATCH_SIZE]:
        advance_one_cascade.delay(str(booking_id))
        swept += 1
    return swept


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 8},
)
def refund_one_unearned_booking_fee(_self: object, requirement_id: str) -> None:
    with suppress(RequirementTransitionError):
        booking_fees.refund_booking_fee(
            requirement_id=UUID(requirement_id),
            reason_code=booking_fees.REASON_REQUIREMENT_EXPIRED,
        )


@shared_task
def sweep_unearned_booking_fees() -> int:
    """Refund any booking fee still unearned on a requirement that has closed.

    §1: `* → CLOSED_EXPIRED` refunds unearned booking-fee value in full. Kept out of
    `close_requirement` on purpose — a refund adapter timing out must not stop a requirement whose
    needed-by date has passed from closing.
    """
    swept = 0
    for requirement_id in booking_fees.unearned_fee_requirement_ids_for_expiry()[:SWEEP_BATCH_SIZE]:
        refund_one_unearned_booking_fee.delay(str(requirement_id))
        swept += 1
    return swept


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 5},
)
def release_one_travel_compensation(_self: object, booking_fee_id: str) -> None:
    booking_fees.release_travel_compensation_hold(booking_fee_id=UUID(booking_fee_id))


@shared_task
def sweep_travel_compensation_holds() -> int:
    """Make forfeit payouts payable once the lead's bank details land.

    The booking-fee twin of the visit-payout half of `sweep_stage_payout_holds`, and it exists for
    the same structural reason: `payouts.release_payout_hold` resolves an entry by Booking, and a
    travel-compensation earning has none.
    """
    swept = 0
    for fee_id in booking_fees.held_travel_compensation_fee_ids()[:SWEEP_BATCH_SIZE]:
        release_one_travel_compensation.delay(str(fee_id))
        swept += 1
    return swept


@shared_task
def sweep_rate_card_decline_alarm() -> int:
    """Page Operations when a published rate is being declined out of the market (`M2-BE-434`).

    **An alarm, not a report.** ADR-0009 is explicit about why: a rate below the street rate that
    week makes leads silently decline everything and the instant product dies quietly, so this has
    to reach a person on the day rather than appear in a monthly review.

    It reaches them through the M1 notification rail — `notifications.request_notification` with an
    in-app-equivalent channel and an idempotency key per card per day, so a five-minute sweep pages
    once and not two hundred and eighty-eight times. A card whose variant has no configured
    threshold is skipped: owner decision 13 is open, and **no alarm fires** while it is, which is
    recorded as a gap rather than papered over with an invented percentage.
    """
    breaches = crew_dispatch.breached_decline_rates(window_hours=DECLINE_ALARM_WINDOW_HOURS)
    if not breaches:
        return 0
    recipients = list(
        User.objects.filter(
            userrole__role__code="operations",
            userrole__revoked_at__isnull=True,
            is_active=True,
        )
        .distinct()
        .values_list("id", flat=True)
    )
    today = timezone.localdate().isoformat()
    paged = 0
    for breach in breaches:
        for recipient_id in recipients:
            request_notification(
                recipient_id=recipient_id,
                purpose="m2_rate_card_decline_alarm",
                channel=NotificationIntent.Channel.EMAIL,
                template_code="m2_rate_card_decline_alarm",
                context={
                    "rate_card_id": str(breach.card.id),
                    "service_area": breach.card.service_area.slug,
                    "skill": breach.card.skill.code,
                    "customer_day_rate_paise": breach.card.customer_day_rate_paise,
                    "offers": breach.offers,
                    "declines": breach.declines,
                    "decline_rate_basis_points": breach.rate_basis_points,
                    "threshold_basis_points": breach.threshold_basis_points,
                    "window_hours": DECLINE_ALARM_WINDOW_HOURS,
                },
                idempotency_key=f"m2-decline-alarm:{breach.card.id}:{recipient_id}:{today}",
            )
            paged += 1
    return paged


@shared_task
def sweep_unproven_day_settlements() -> int:
    """Put one-sided "Day settled?" claims in front of a person (`M2-BE-536`).

    ADR-0009: a one-sided settlement claim without the tap trail "goes to Operations as unproven,
    not as fact". This is that sentence, and the shape of it is the point — **there is no command
    behind this sweep that could settle a day on one person's word.** It emits an outbox event per
    settlement and stops. A cash dispute where both sides lie is unadjudicable, which the plan
    accepted for `LEAD_ONLY`; the only thing that can move one of these rows is a human reading it.

    Keyed on the settlement so a re-drive finds its own event rather than paging twice about the
    same evening.
    """
    raised = 0
    for settlement_id in workforce.unproven_settlement_ids(
        older_than_hours=UNPROVEN_SETTLEMENT_HOURS
    )[:SWEEP_BATCH_SIZE]:
        enqueue_outbox_event(
            aggregate_type="engagement",
            aggregate_id=settlement_id,
            event_type="m2.shift.settlement_unproven",
            idempotency_key=f"settlement-unproven:{settlement_id}",
            payload={"day_settlement_id": str(settlement_id)},
        )
        raised += 1
    return raised
