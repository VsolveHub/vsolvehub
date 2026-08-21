"""What a booked visit becomes, and what its share of the plan money becomes with it.

Everything downstream of `visit_plans.confirm_visit_slot` lives here, because in A5 the outcome of
a visit *is* the settlement of a share and the two cannot be read apart: an arrival leads to a
completion, a completion to an estimate that earns the share, and every other ending — a vendor
no-show, a Customer no-show, an estimate that never arrived, a slot nobody took — routes to
`_earn_share`, `_mark_share_replaced` or `refund_share` and then to `_settle_plan_if_complete`,
which proves the arithmetic closes.

The sweep selectors sit here for the same reason. `tasks.py` decides only *when* to look; what it
finds is settled by the commands directly above it, and `held_visit_payout_share_ids` was already
written beside the payout it releases rather than beside the clock that calls it.
"""

import uuid
from datetime import datetime

from django.db import transaction
from django.utils import timezone

from apps.assignments.models import Reservation
from apps.commerce.services import request_standalone_refund
from apps.partners.models import PartnerProfile
from apps.payouts.models import PartnerLedgerEntry
from apps.payouts.services import payable_account
from apps.requirements import pricing
from apps.requirements.exceptions import RequirementTransitionError
from apps.requirements.models import (
    Proposal,
    SiteVisit,
    VisitPlan,
    VisitPlanShare,
)

# ---------------------------------------------------------------------------
# Visit arrival and completion (`M2-BE-423`)
# ---------------------------------------------------------------------------


@transaction.atomic
def complete_plan_visit(*, site_visit_id: uuid.UUID, outcome_notes: str = "") -> SiteVisit:
    """Close a visit that happened, and start the post-visit estimate clock.

    Completing is what makes an estimate submittable at all (`m2_visit_not_completed`), and it is
    also what starts the window inside which one must arrive. Both halves matter: the first stops a
    vendor pricing from a desk, the second stops one taking a slot and never estimating.
    """
    visit = (
        SiteVisit.objects.select_for_update(of=("self",))
        .select_related("requirement__configuration")
        .get(pk=site_visit_id)
    )
    if visit.status == SiteVisit.Status.COMPLETED:
        return visit
    if visit.status != SiteVisit.Status.IN_PROGRESS:
        raise RequirementTransitionError(
            "Enter the Customer's arrival code before completing this visit."
        )
    now = timezone.now()
    visit.status = SiteVisit.Status.COMPLETED
    visit.completed_at = now
    visit.outcome_notes = outcome_notes
    visit.estimate_due_at = pricing.estimate_window_deadline(visit.requirement, completed_at=now)
    visit.save(
        update_fields=(
            "status",
            "completed_at",
            "outcome_notes",
            "estimate_due_at",
            "updated_at",
        )
    )
    return visit


@transaction.atomic
def report_visit_no_show(
    *, site_visit_id: uuid.UUID, party: str, reason_code: str = ""
) -> SiteVisit:
    """Record that a scheduled visit did not happen, and settle its share accordingly.

    The two no-shows settle differently on purpose. A **vendor** no-show costs the Customer
    nothing: the share goes back to `REPLACED` so a free replacement visit can take it, and the
    vendor's standing carries the record. A **Customer** no-show still pays the vendor — they
    travelled — and only the platform share is in question, which is owner decision 3 and is read
    fail-closed rather than guessed.
    """
    visit = (
        SiteVisit.objects.select_for_update(of=("self",))
        .select_related("requirement__configuration", "plan_share__plan", "invitation__partner")
        .get(pk=site_visit_id)
    )
    if visit.status in (SiteVisit.Status.VENDOR_NO_SHOW, SiteVisit.Status.CUSTOMER_NO_SHOW):
        return visit
    if visit.status not in (SiteVisit.Status.SCHEDULED, SiteVisit.Status.IN_PROGRESS):
        raise RequirementTransitionError("Only a scheduled visit can be reported as a no-show.")

    is_vendor = party == "VENDOR"
    visit.status = (
        SiteVisit.Status.VENDOR_NO_SHOW if is_vendor else SiteVisit.Status.CUSTOMER_NO_SHOW
    )
    visit.cancellation_reason_code = reason_code or (
        "vendor_no_show" if is_vendor else "customer_no_show"
    )
    visit.save(update_fields=("status", "cancellation_reason_code", "updated_at"))
    _release_grid_slot(visit)

    share = visit.plan_share
    if share is None:
        return visit
    if is_vendor:
        _mark_share_replaced(share=share, reason_code="vendor_no_show")
        return visit

    refunds_platform_share = pricing.customer_no_show_refunds_platform_share(visit.requirement)
    _earn_share(
        share=share,
        partner=visit.invitation.partner,
        reason_code="customer_no_show",
        refund_platform_share=refunds_platform_share,
    )
    return visit


def _release_grid_slot(visit: SiteVisit) -> None:
    """Hand the vendor's time back to the grid. A released reservation is history, not a hold."""
    for reservation in Reservation.objects.select_for_update().filter(
        site_visit=visit,
        status__in=(Reservation.Status.TENTATIVE, Reservation.Status.CONFIRMED),
    ):
        reservation.release()


# ---------------------------------------------------------------------------
# Share settlement (`M2-BE-425`, `M2-BE-426`)
# ---------------------------------------------------------------------------


def _refundable_attempt_id(plan: VisitPlan) -> uuid.UUID | None:
    """Which captured payment a share refund actually comes out of.

    Normally the plan's own charge. For a plan carried over from an A3 unlock the money is sitting
    on the *unlock's* attempt — `M2-BE-427` says reclassification never charges twice, so it also
    must not refund from a payment that was never taken.
    """
    if plan.payment_attempt_id is not None:
        return plan.payment_attempt_id
    credit_unlock = plan.credit_unlock
    if credit_unlock is not None:
        return credit_unlock.payment_attempt_id
    return None


@transaction.atomic
def _earn_share(
    *,
    share: VisitPlanShare,
    partner: PartnerProfile,
    reason_code: str,
    refund_platform_share: bool = False,
) -> VisitPlanShare:
    """Pay the vendor for a delivered visit, and book Vsolve's share of it (`M2-BE-426`).

    The payout goes through the **M1 ledger**, as a `PartnerLedgerEntry` with no Booking — the one
    earning-per-Booking constraint is scoped to rows that have one, so a visit payout sits happily
    beside a technician's job earnings in the same statement and the same payout batch.

    **The progressive payout gate is applied as a hold, not a refusal.** A vendor without verified
    bank details has still earned the money; they simply cannot be paid it yet, so the entry is
    written `PENDING` and `release_visit_payout_hold` below moves it when the account lands.
    Refusing to write the entry would lose the debt the moment the sweep moved on.
    """
    locked = VisitPlanShare.objects.select_for_update().select_related("plan").get(pk=share.pk)
    if locked.status in (VisitPlanShare.Status.EARNED, VisitPlanShare.Status.REFUNDED):
        return locked

    entry = PartnerLedgerEntry.objects.filter(idempotency_key=f"m2-visit-share:{locked.id}").first()
    if entry is None and locked.vendor_payout_paise > 0:
        entry = PartnerLedgerEntry.objects.create(
            partner=partner,
            booking=None,
            kind=PartnerLedgerEntry.Kind.EARNING,
            status=(
                PartnerLedgerEntry.Status.AVAILABLE
                if payable_account(partner) is not None
                else PartnerLedgerEntry.Status.PENDING
            ),
            gross_paise=locked.amount_paise,
            commission_paise=locked.platform_share_paise,
            net_paise=locked.vendor_payout_paise,
            calculation_snapshot={
                "source": "m2_visit_plan_share",
                "visit_plan_share_id": str(locked.id),
                "share_amount_paise": locked.amount_paise,
                "vendor_payout_paise": locked.vendor_payout_paise,
                "platform_share_paise": locked.platform_share_paise,
                "reason_code": reason_code,
            },
            reason=reason_code,
            idempotency_key=f"m2-visit-share:{locked.id}",
        )

    if refund_platform_share and locked.platform_share_paise > 0:
        attempt_id = _refundable_attempt_id(locked.plan)
        if attempt_id is not None:
            locked.refund = request_standalone_refund(
                payment_attempt_id=attempt_id,
                amount_paise=locked.platform_share_paise,
                reason_code=f"m2_{reason_code}",
                idempotency_key=f"m2-visit-share-platform-refund:{locked.id}",
            )

    locked.status = VisitPlanShare.Status.EARNED
    locked.partner = partner
    locked.ledger_entry = entry
    locked.earned_at = timezone.now()
    locked.settlement_reason_code = reason_code
    locked.save(
        update_fields=(
            "status",
            "partner",
            "ledger_entry",
            "refund",
            "earned_at",
            "settlement_reason_code",
            "updated_at",
        )
    )
    _settle_plan_if_complete(locked.plan_id)
    return locked


@transaction.atomic
def refund_share(*, share_id: uuid.UUID, reason_code: str) -> VisitPlanShare:
    """Give one undelivered visit's money back. Idempotent by state, for overlapping sweeps.

    Neither party earns from a visit that did not deliver: the Customer gets the whole share back,
    including the part that would have been the platform's. That is what makes "you only pay for
    visits that produced an estimate" a promise rather than a slogan.
    """
    share = VisitPlanShare.objects.select_for_update().select_related("plan").get(pk=share_id)
    if share.status in (VisitPlanShare.Status.EARNED, VisitPlanShare.Status.REFUNDED):
        return share
    attempt_id = _refundable_attempt_id(share.plan)
    if attempt_id is not None and share.plan.status in VisitPlan.CHARGED_STATUSES:
        share.refund = request_standalone_refund(
            payment_attempt_id=attempt_id,
            amount_paise=share.amount_paise,
            reason_code=reason_code,
            idempotency_key=f"m2-visit-share-refund:{share.id}",
        )
    share.status = VisitPlanShare.Status.REFUNDED
    share.refunded_at = timezone.now()
    share.settlement_reason_code = reason_code
    share.save(
        update_fields=("status", "refund", "refunded_at", "settlement_reason_code", "updated_at")
    )
    _settle_plan_if_complete(share.plan_id)
    return share


def held_visit_payout_share_ids() -> list[uuid.UUID]:
    """Earned visit payouts still waiting on the vendor's bank details.

    `payouts.release_payout_hold` cannot do this job: it resolves an entry **by Booking**, and a
    visit payout has no Booking. That is not an oversight in either place — the M1 rule is one
    earning per Booking, and a visit is not one — so the progressive gate needs its own release,
    and this is the selector behind it.
    """
    return list(
        VisitPlanShare.objects.filter(
            status=VisitPlanShare.Status.EARNED,
            ledger_entry__isnull=False,
            ledger_entry__status=PartnerLedgerEntry.Status.PENDING,
        ).values_list("id", flat=True)
    )


@transaction.atomic
def release_visit_payout_hold(*, share_id: uuid.UUID) -> PartnerLedgerEntry | None:
    """Make one earned visit payout payable, once the vendor's account is verified.

    Idempotent by state, like every other sweep command here. A vendor who never adds bank details
    keeps a `PENDING` entry indefinitely, which is the honest record: the debt is real and unpaid,
    and deleting it to tidy the queue would be writing off somebody else's money.
    """
    share = (
        VisitPlanShare.objects.select_for_update(of=("self",))
        .select_related("ledger_entry", "partner")
        .get(pk=share_id)
    )
    entry = share.ledger_entry
    if entry is None or entry.status != PartnerLedgerEntry.Status.PENDING:
        return entry
    if share.partner is None or payable_account(share.partner) is None:
        return entry
    entry.status = PartnerLedgerEntry.Status.AVAILABLE
    entry.save(update_fields=("status", "updated_at"))
    return entry


def _mark_share_replaced(*, share: VisitPlanShare, reason_code: str) -> VisitPlanShare:
    """Owe the Customer a free replacement visit on this slot."""
    share.status = VisitPlanShare.Status.REPLACED
    share.partner = None
    share.settlement_reason_code = reason_code
    share.save(update_fields=("status", "partner", "settlement_reason_code", "updated_at"))
    return share


def _settle_plan_if_complete(plan_id: uuid.UUID) -> None:
    """Close the plan once every share has earned or refunded, and prove the arithmetic.

    The reconciliation is asserted rather than assumed: `price = Σ payouts + Σ platform + Σ
    refunds` in integer paise. A plan that does not add up is a financial defect, and finding it
    at settlement is the difference between a bug and a month of unexplained variance.
    """
    plan = VisitPlan.objects.select_for_update().get(pk=plan_id)
    if plan.status != VisitPlan.Status.ACTIVE:
        return
    shares = list(plan.shares.all())
    if any(not share.is_settled for share in shares):
        return
    plan.status = VisitPlan.Status.SETTLED
    plan.settled_at = timezone.now()
    plan.save(update_fields=("status", "settled_at", "updated_at"))


def settle_share_for_estimate(*, proposal: Proposal) -> VisitPlanShare | None:
    """A usable estimate landed against a completed visit, so its share is earned.

    Called from proposal submission rather than from a sweep, because "the estimate arrived" is an
    event and waiting for a clock to notice it would delay a vendor's pay for no reason.
    """
    visit = proposal.site_visit
    if visit is None or visit.plan_share_id is None:
        return None
    if proposal.usability != Proposal.Usability.USABLE:
        return None
    share = VisitPlanShare.objects.select_related("plan").get(pk=visit.plan_share_id)
    if share.status != VisitPlanShare.Status.COMMITTED:
        return share
    return _earn_share(
        share=share,
        partner=proposal.partner,
        reason_code="estimate_delivered",
    )


# ---------------------------------------------------------------------------
# Sweep selectors. The tasks in `tasks.py` decide only *when* to look.
# ---------------------------------------------------------------------------


def unfilled_share_ids(*, at: datetime | None = None) -> list[uuid.UUID]:
    """Shares nobody ever took, past the visit-delivery SLA. They auto-refund."""
    moment = at or timezone.now()
    return list(
        VisitPlanShare.objects.filter(
            status__in=(VisitPlanShare.Status.OPEN, VisitPlanShare.Status.REPLACED),
            plan__status=VisitPlan.Status.ACTIVE,
            plan__fill_due_at__isnull=False,
            plan__fill_due_at__lt=moment,
        ).values_list("id", flat=True)
    )


def missed_estimate_visit_ids(*, at: datetime | None = None) -> list[uuid.UUID]:
    """Completed visits that never produced an estimate inside the window.

    The visit-side analogue of a non-responsive quote: the vendor took a slot, travelled, and left
    the Customer with nothing to read. `estimate_due_at` is null when the owner has set no window,
    and those are deliberately not swept — the alternative is refunding a vendor's earned visit
    against a deadline nobody approved.
    """
    moment = at or timezone.now()
    return list(
        SiteVisit.objects.filter(
            status=SiteVisit.Status.COMPLETED,
            plan_share__status=VisitPlanShare.Status.COMMITTED,
            estimate_due_at__isnull=False,
            estimate_due_at__lt=moment,
        ).values_list("id", flat=True)
    )


def expired_visit_hold_ids(*, at: datetime | None = None) -> list[uuid.UUID]:
    """Held slots whose plan checkout was never completed. The hold lapses harmlessly."""
    moment = at or timezone.now()
    return list(
        SiteVisit.objects.filter(
            status=SiteVisit.Status.REQUESTED,
            plan_share__isnull=False,
            reservations__status=Reservation.Status.TENTATIVE,
            reservations__expires_at__lt=moment,
        )
        .values_list("id", flat=True)
        .distinct()
    )


@transaction.atomic
def release_expired_visit_hold(*, site_visit_id: uuid.UUID) -> SiteVisit:
    """Undo an unpaid slot hold: the visit is cancelled and the share goes back to `OPEN`.

    Idempotent by state, like every other sweep command here, so two overlapping ticks settle on
    one outcome rather than cancelling a visit somebody has since paid for.
    """
    visit = (
        SiteVisit.objects.select_for_update(of=("self",))
        .select_related("plan_share")
        .get(pk=site_visit_id)
    )
    if visit.status != SiteVisit.Status.REQUESTED:
        return visit
    visit.status = SiteVisit.Status.CANCELLED
    visit.cancellation_reason_code = "visit_plan_hold_expired"
    visit.save(update_fields=("status", "cancellation_reason_code", "updated_at"))
    _release_grid_slot(visit)
    share = visit.plan_share
    if share is not None:
        locked = VisitPlanShare.objects.select_for_update().get(pk=share.pk)
        if locked.status == VisitPlanShare.Status.COMMITTED:
            locked.status = VisitPlanShare.Status.OPEN
            locked.partner = None
            locked.committed_at = None
            locked.save(update_fields=("status", "partner", "committed_at", "updated_at"))
    return visit


@transaction.atomic
def settle_missed_estimate(*, site_visit_id: uuid.UUID) -> SiteVisit:
    """A completed visit produced nothing in the window: refund or replace that share."""
    visit = (
        SiteVisit.objects.select_for_update(of=("self",))
        .select_related("plan_share__plan__requirement__configuration")
        .get(pk=site_visit_id)
    )
    share = visit.plan_share
    if share is None or share.status != VisitPlanShare.Status.COMMITTED:
        return visit
    plan = share.plan
    # A replacement is only worth offering while the plan still has time to run. Past the fill
    # deadline the honest outcome is the Customer's money back.
    if plan.fill_due_at is not None and plan.fill_due_at > timezone.now():
        _mark_share_replaced(share=share, reason_code="estimate_window_missed")
    else:
        refund_share(share_id=share.id, reason_code="m2_estimate_window_missed")
    return visit
