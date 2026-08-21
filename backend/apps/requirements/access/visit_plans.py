"""A5's front door: the visit plan, from tier choice to a paid-for slot on the grid.

Read this module as one sequence, because that is the order the money moves in: the Customer picks
a tier (`choose_visit_plan`, which charges nothing and only bounds the invitation wave), a vendor
commits to a real time (`confirm_visit_slot`, which takes a *hard* `assignments.Reservation`), and
only then does a charge exist (`create_visit_plan_checkout` / `complete_visit_plan`). The private
helpers in between — `_create_shares`, `_next_open_share`, `_hold_grid_slot`, `_mark_visits_booked`,
`_activate_free_plan` — are steps of that sequence and are only called from within it.

The boundary is the *booking* of a visit. What a booked visit then becomes — arrival, completion,
a no-show, the share it earns or refunds — is `settlement`. The one exception that stays here is
`reschedule_plan_visit`, because moving a visit is a re-booking on the grid and shares every rule
`_hold_grid_slot` exists to enforce.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone
from psycopg.types.range import Range

from apps.assignments.models import Reservation
from apps.commerce.models import PaymentAttempt
from apps.commerce.services import (
    allocate_document_number,
    initiate_standalone_payment_attempt,
)
from apps.foundation.services import enqueue_outbox_event
from apps.identity.models import User
from apps.partners.models import PartnerProfile
from apps.requirements import matching, metrics, pricing, purchase_gates, visit_slots
from apps.requirements.exceptions import (
    LifecycleNotSupportedError,
    RequirementDomainError,
    RequirementTransitionError,
    VisitPlanNotChargeableError,
    VisitPlanRequiredError,
    VisitSlotUnavailableError,
)
from apps.requirements.models import (
    CustomerRequirement,
    SiteVisit,
    VendorInvitation,
    VisitPlan,
    VisitPlanShare,
)
from apps.requirements.services import record_transition

from .base import A5, ACCESS_RECEIPT_KIND

# ---------------------------------------------------------------------------
# A5 — the visit plan (`M2-BE-215`, `419`..`427`)
# ---------------------------------------------------------------------------


@transaction.atomic
def choose_visit_plan(*, requirement_id: uuid.UUID, plan_size: int, actor: User) -> VisitPlan:
    """Pick how many professionals will visit. A5 only, and it charges nothing (`M2-BE-215`).

    Choosing bounds the invitation wave, which is the only thing it does before money exists. The
    price is snapshotted **here**, at choice, rather than at charge: the Customer is shown a number
    on the review screen and a price loaded between then and the first vendor confirming must not
    silently become what they pay.

    Re-choosing is allowed while nothing is committed, because it is a control on a review screen
    and a Customer changing their mind before submitting is not an error.
    """
    requirement = (
        CustomerRequirement.objects.select_for_update(of=("self",))
        .select_related("configuration")
        .get(pk=requirement_id)
    )
    if requirement.archetype != A5:
        raise LifecycleNotSupportedError(
            "Only project requests use a visit plan; workforce requests use quotes.",
        )
    if requirement.status in CustomerRequirement.CLOSED_STATUSES:
        raise RequirementTransitionError("This request is closed.")

    price = pricing.visit_plan_price(plan_size=plan_size)
    plan = VisitPlan.objects.select_for_update().filter(requirement=requirement).first()
    if plan is not None and plan.status != VisitPlan.Status.CHOSEN:
        raise RequirementTransitionError(
            "Your visit plan is already in progress and cannot be changed here.",
        )
    if plan is not None and plan.shares.exclude(status=VisitPlanShare.Status.OPEN).exists():
        raise RequirementTransitionError(
            "A vendor has already committed to a visit, so the plan cannot be resized.",
        )
    # `M2-BE-810`. Choosing charges nothing, but it is where the commitment is made — the plan and
    # its shares are created here and the invitation wave is bounded by them — so this is the door
    # a pause has to close. Deliberately *after* the two guards above: a plan already in progress
    # must hear "already in progress", not "we have paused new bookings", because only one of those
    # two sentences is true of it.
    purchase_gates.assert_new_purchase_allowed(requirement, door="a5_visit_plan_choice")

    if plan is None:
        plan = VisitPlan(requirement=requirement)
    else:
        plan.shares.all().delete()
    plan.plan_size = plan_size
    plan.price = price.row
    plan.price_paise = price.amount_paise
    plan.vendor_payout_basis_points = price.vendor_payout_basis_points or 0
    plan.chosen_at = timezone.now()
    plan.save()
    _create_shares(plan)
    # Re-choosing is allowed while nothing is committed, so this is an append-only record of what
    # the Customer was actually shown and picked — the tier and the price snapshot both. The plan
    # row only ever carries the latest choice; a plan that was resized after a wave went out is a
    # question the invitation count will raise later, and this is where it gets answered.
    record_transition(
        requirement=requirement,
        from_status=requirement.status,
        to_status=requirement.status,
        actor=actor,
        reason_code="visit_plan_chosen",
        reason=f"{plan_size} visit(s) at {price.amount_paise} paise",
    )
    return plan


def _create_shares(plan: VisitPlan) -> list[VisitPlanShare]:
    """Cut the plan into its per-slot shares, in integer paise that add back to the whole."""
    amounts = pricing.share_amounts(price_paise=plan.price_paise, plan_size=plan.plan_size)
    shares: list[VisitPlanShare] = []
    for position, amount in enumerate(amounts, start=1):
        vendor_paise, platform_paise = pricing.split_share(
            amount_paise=amount,
            vendor_payout_basis_points=plan.vendor_payout_basis_points,
        )
        shares.append(
            VisitPlanShare(
                plan=plan,
                position=position,
                amount_paise=amount,
                vendor_payout_paise=vendor_paise,
                platform_share_paise=platform_paise,
            )
        )
    return list(VisitPlanShare.objects.bulk_create(shares))


def visit_plan_checkout_availability(requirement: CustomerRequirement) -> bool:
    """Mirrors `create_visit_plan_checkout`'s guard, for the screen's disabled state.

    A read, never a decision — the same relationship `unlock_availability` has to the unlock
    command. True means a vendor is holding a slot right now and the plan is unpaid; the command
    re-checks under the requirement's row lock, because a hold that lapsed a second ago is exactly
    the state a stale `true` lives in.
    """
    if requirement.archetype != A5:
        return False
    plan = VisitPlan.objects.filter(requirement=requirement).first()
    if plan is None or plan.status in VisitPlan.CHARGED_STATUSES or not plan.charge_required:
        return False
    return SiteVisit.objects.filter(
        requirement=requirement,
        status=SiteVisit.Status.REQUESTED,
        plan_share__isnull=False,
    ).exists()


def assert_visit_plan_chosen(requirement: CustomerRequirement) -> VisitPlan:
    """An A5 requirement cannot be submitted without a plan. `m2_visit_plan_required`."""
    plan = VisitPlan.objects.filter(requirement=requirement).first()
    if plan is None or plan.status == VisitPlan.Status.VOID:
        raise VisitPlanRequiredError()
    return plan


def _next_open_share(plan: VisitPlan) -> VisitPlanShare | None:
    """The lowest-numbered slot still waiting for a vendor.

    `REPLACED` is included: it is a slot whose first visit fell through and which owes the Customer
    a **free** replacement visit, so it is exactly the slot the next vendor should take.
    """
    return (
        plan.shares.select_for_update()
        .filter(status__in=(VisitPlanShare.Status.OPEN, VisitPlanShare.Status.REPLACED))
        .order_by("position")
        .first()
    )


@dataclass(frozen=True, slots=True)
class VisitSlotConfirmation:
    visit: SiteVisit
    share: VisitPlanShare
    plan: VisitPlan
    #: True when this is the confirmation that opens the Customer's plan checkout. Later slots
    #: book free and this is `False` for them.
    opens_plan_checkout: bool


@transaction.atomic
def confirm_visit_slot(*, invitation_id: uuid.UUID, slot_id: str) -> VisitSlotConfirmation:
    """A vendor commits to being on site at a specific time (`M2-BE-421`).

    This **is** A5 acceptance — `07-state-machines-and-permissions.md` §2 says so — so it takes the
    quote slot and the soft capacity hold through the same `accept_invitation` command A3 uses, and
    then takes a *hard* slot on the shared availability grid on top.

    The grid slot is an `assignments.Reservation`. That is the load-bearing choice in this
    function: the exclusion constraint on `(partner, occupied_range)` already refuses two
    overlapping live reservations, so a visit cannot be booked over an A1 job and an A1 job cannot
    be booked over a visit — by construction, in the database, without either flow knowing about
    the other.

    The **first** confirmation on an uncharged plan holds its slot `TENTATIVE` and opens the
    Customer's checkout. If the Customer never pays, the hold lapses and nothing was charged, which
    is exactly what "charged at the first confirmed visit slot" has to mean to stay honest. Later
    slots, on an already-`ACTIVE` plan, are confirmed outright.
    """
    invitation = VendorInvitation.objects.select_related(
        "requirement__configuration", "partner"
    ).get(pk=invitation_id)
    requirement = invitation.requirement
    if requirement.archetype != A5:
        raise LifecycleNotSupportedError("Only project requests book visit slots.")

    # Every visit on one Customer project takes this same row lock. Partner
    # availability is protected by the reservation exclusion constraint; this
    # lock protects the Customer's diary when two different Partners race for
    # the same time.
    CustomerRequirement.objects.select_for_update().get(pk=requirement.pk)
    plan = VisitPlan.objects.select_for_update().filter(requirement=requirement).first()
    if plan is None or plan.status in (VisitPlan.Status.VOID, VisitPlan.Status.SETTLED):
        raise VisitPlanRequiredError()

    choice = visit_slots.read_visit_slot(slot_id=slot_id, invitation_id=invitation.id)
    if choice.starts_at <= timezone.now():
        raise VisitSlotUnavailableError("That time has passed. Pick another.")

    share = _next_open_share(plan)
    if share is None:
        raise VisitSlotUnavailableError(
            "Every visit in this plan is already taken.",
        )

    # Acceptance first: slot accounting, identity clustering and the vendor's own diary are all
    # checked there, and none of them should be re-implemented here.
    if invitation.status == VendorInvitation.Status.INVITED:
        matching.accept_invitation(invitation_id=invitation.id)
        invitation.refresh_from_db()
    elif invitation.status != VendorInvitation.Status.ACCEPTED:
        raise RequirementTransitionError("This enquiry can no longer take a visit slot.")

    if not visit_slots.slot_is_still_free(invitation=invitation, choice=choice):
        raise VisitSlotUnavailableError()

    is_first_charge = plan.status == VisitPlan.Status.CHOSEN and plan.charge_required
    visit = SiteVisit.objects.create(
        requirement=requirement,
        invitation=invitation,
        plan_share=share,
        # Held, not scheduled, until the plan is paid for. A visit the Customer has not paid for is
        # a promise nobody has bought yet, and calling it `SCHEDULED` would tell both parties it is
        # real before it is.
        status=SiteVisit.Status.REQUESTED if is_first_charge else SiteVisit.Status.SCHEDULED,
        # The share is the fee. An A5 plan visit is paid for out of the plan the Customer bought,
        # and it does **not** adjust against the final price: there is no stage credit, because the
        # plan money is spent on the visits themselves.
        fee_paise=share.amount_paise,
        adjusts_against_final_price=False,
        scheduled_for=choice.starts_at,
        duration_minutes=choice.duration_minutes,
    )
    _hold_grid_slot(
        visit=visit,
        partner=invitation.partner,
        choice=choice,
        tentative=is_first_charge,
    )

    share.status = VisitPlanShare.Status.COMMITTED
    share.partner = invitation.partner
    share.committed_at = timezone.now()
    share.save(update_fields=("status", "partner", "committed_at", "updated_at"))

    if not is_first_charge and requirement.status == CustomerRequirement.Status.MATCHING:
        # A fully credited plan (reclassified from A3) never has a checkout, so the first confirmed
        # slot is also the moment visits become real.
        _mark_visits_booked(requirement)
        _activate_free_plan(plan)

    return VisitSlotConfirmation(
        visit=visit,
        share=share,
        plan=plan,
        opens_plan_checkout=is_first_charge,
    )


def _hold_grid_slot(
    *,
    visit: SiteVisit,
    partner: PartnerProfile,
    choice: visit_slots.VisitSlotChoice,
    tentative: bool,
) -> Reservation:
    """Take the visit's slot on the shared grid, or refuse the whole confirmation.

    The `IntegrityError` branch is not defensive padding: it is the race this design exists to
    lose safely. Two vendors — or a vendor and an A1 checkout — can reach the same instant, and
    the exclusion constraint is what decides, not the read a moment earlier.
    """
    lower, upper = visit_slots.occupied_range_bounds(choice)
    try:
        return Reservation.objects.create(
            site_visit=visit,
            partner=partner,
            occupied_range=Range(lower, upper, "[)"),
            status=(Reservation.Status.TENTATIVE if tentative else Reservation.Status.CONFIRMED),
            expires_at=timezone.now() + timedelta(seconds=settings.M2_VISIT_PLAN_HOLD_SECONDS),
        )
    except IntegrityError as exc:
        raise VisitSlotUnavailableError() from exc


def _mark_visits_booked(requirement: CustomerRequirement) -> None:
    if requirement.status == CustomerRequirement.Status.MATCHING:
        requirement.status = CustomerRequirement.Status.VISITS_BOOKED
        requirement.save(update_fields=("status", "updated_at"))
        record_transition(
            requirement=requirement,
            from_status=CustomerRequirement.Status.MATCHING,
            to_status=CustomerRequirement.Status.VISITS_BOOKED,
            actor=None,
            reason_code="first_visit_slot_confirmed",
        )
        # `M2-BE-806`: A5's "time to first confirmed visit, against the declared promise". Emitted
        # here rather than from `record_transition` because this is the one measure a counter cannot
        # express — it needs the elapsed time and the SLA that was in force, and this branch runs
        # exactly once per requirement, on the *first* confirmed slot.
        try:
            deadline = pricing.first_visit_deadline(requirement)
        except RequirementDomainError:
            # An unset or retired configuration is `no_promise`, not a breach. A measurement may
            # never be the reason a vendor's confirmed slot fails to record.
            deadline = None
        metrics.record_first_visit_confirmed(requirement=requirement, deadline=deadline)


def _activate_free_plan(plan: VisitPlan) -> None:
    """Activate a plan whose whole price was already paid for as an A3 unlock credit."""
    if plan.status != VisitPlan.Status.CHOSEN:
        return
    plan.status = VisitPlan.Status.ACTIVE
    plan.charged_at = timezone.now()
    plan.fill_due_at = pricing.visit_plan_fill_deadline(plan.requirement)
    plan.save(update_fields=("status", "charged_at", "fill_due_at", "updated_at"))


@transaction.atomic
def create_visit_plan_checkout(
    *, requirement_id: uuid.UUID, actor: User, idempotency_key: str
) -> tuple[VisitPlan, PaymentAttempt]:
    """Charge the whole plan, once, against a slot a vendor has actually committed to.

    `m2_visit_plan_not_chargeable` when no held slot exists. That refusal is the A5 twin of the
    A3 unlock's "no usable quote yet": both make "paid but nothing happened" unreachable rather
    than merely unlikely.
    """
    requirement = (
        CustomerRequirement.objects.select_for_update(of=("self",))
        .select_related("configuration")
        .get(pk=requirement_id)
    )
    if requirement.archetype != A5:
        raise LifecycleNotSupportedError("Only project requests have a visit plan.")
    plan = VisitPlan.objects.select_for_update().filter(requirement=requirement).first()
    if plan is None:
        raise VisitPlanRequiredError()
    if plan.status in VisitPlan.CHARGED_STATUSES:
        raise VisitPlanNotChargeableError("Your visit plan is already paid for.")
    if plan.status == VisitPlan.Status.PENDING and plan.payment_attempt is not None:
        return plan, plan.payment_attempt
    if not plan.charge_required:
        raise VisitPlanNotChargeableError(
            "Your earlier payment already covers this plan; there is nothing to pay.",
        )
    held = SiteVisit.objects.filter(
        requirement=requirement,
        status=SiteVisit.Status.REQUESTED,
        plan_share__isnull=False,
    ).first()
    if held is None:
        raise VisitPlanNotChargeableError()

    attempt = initiate_standalone_payment_attempt(
        purpose=PaymentAttempt.Purpose.M2_VISIT_PLAN,
        amount_paise=plan.chargeable_paise,
        idempotency_key=idempotency_key,
        # The attempt expires with the slot it is holding. A payment that lands after the hold has
        # gone would buy a visit the vendor is no longer free for.
        expires_at=timezone.now() + timedelta(seconds=settings.M2_VISIT_PLAN_HOLD_SECONDS),
    )
    plan.status = VisitPlan.Status.PENDING
    plan.payment_attempt = attempt
    plan.save(update_fields=("status", "payment_attempt", "updated_at"))
    record_transition(
        requirement=requirement,
        from_status=requirement.status,
        to_status=requirement.status,
        actor=actor,
        reason_code="visit_plan_checkout_started",
        reason=f"visit_plan:{plan.id} for {plan.chargeable_paise} paise",
    )
    return plan, attempt


@transaction.atomic
def complete_visit_plan(*, payment_attempt_id: uuid.UUID) -> VisitPlan | None:
    """Charge the plan and harden its held slot. Verified provider callback only.

    One plan per successful payment, under duplicate webhooks and retries: the plan row is locked,
    an already-charged plan returns untouched, and every held visit is promoted in the same
    transaction as the charge — so there is no moment in which the money moved and the slot did
    not become real.
    """
    plan = (
        VisitPlan.objects.select_for_update(of=("self",))
        .select_related("requirement__configuration", "payment_attempt")
        .filter(payment_attempt_id=payment_attempt_id)
        .first()
    )
    if plan is None:
        return None
    if plan.status in VisitPlan.CHARGED_STATUSES:
        return plan
    attempt = plan.payment_attempt
    if attempt is None or attempt.status != PaymentAttempt.Status.CAPTURED:
        return plan
    if attempt.amount_paise != plan.chargeable_paise:
        plan.status = VisitPlan.Status.FAILED
        plan.failure_code = "amount_mismatch"
        plan.save(update_fields=("status", "failure_code", "updated_at"))
        return plan

    requirement = CustomerRequirement.objects.select_for_update().get(pk=plan.requirement_id)
    series, sequence = allocate_document_number(kind=ACCESS_RECEIPT_KIND)
    plan.status = VisitPlan.Status.ACTIVE
    plan.charged_at = timezone.now()
    plan.fill_due_at = pricing.visit_plan_fill_deadline(requirement)
    plan.receipt_series = series
    plan.receipt_sequence = sequence
    plan.save(
        update_fields=(
            "status",
            "charged_at",
            "fill_due_at",
            "receipt_series",
            "receipt_sequence",
            "updated_at",
        )
    )
    for visit in SiteVisit.objects.select_for_update().filter(
        requirement=requirement,
        status=SiteVisit.Status.REQUESTED,
        plan_share__isnull=False,
    ):
        visit.status = SiteVisit.Status.SCHEDULED
        visit.save(update_fields=("status", "updated_at"))
        Reservation.objects.filter(
            site_visit=visit,
            status=Reservation.Status.TENTATIVE,
        ).update(status=Reservation.Status.CONFIRMED, released_at=None)
    _mark_visits_booked(requirement)
    enqueue_outbox_event(
        aggregate_type="requirement",
        aggregate_id=requirement.id,
        event_type="m2.visit_plan.charged",
        idempotency_key=f"visit-plan-charged:{plan.id}",
        payload={"requirement_id": str(requirement.id), "visit_plan_id": str(plan.id)},
    )
    return plan


@transaction.atomic
def reschedule_plan_visit(*, visit: SiteVisit, scheduled_for: datetime) -> SiteVisit:
    """Move an A5 plan visit, and move its reservation with it.

    A plan visit's slot is a **grid reservation**, not a timestamp. `_hold_grid_slot` wrote an
    `assignments.Reservation` over the instants it occupies, and the exclusion constraint on
    `(partner, occupied_range)` is what makes "a visit and an A1 job cannot double-book" a database
    fact rather than a hope. Rescheduling therefore has to be a re-booking:

    1. check the new start is free for this vendor on the same snapshot the picker drew from;
    2. release the old reservation;
    3. take the new one, at the same width and the same tentative-or-confirmed state.

    The order matters. Releasing first would hand the vendor's original time back before knowing
    the new one is available, so a refused reschedule would leave them with neither — and taking
    the new one first would collide with their own old reservation whenever the two overlap, which
    is exactly what a fifteen-minute nudge is.

    The **state is preserved rather than recomputed**: a held slot on an unpaid plan stays held,
    because moving a visit is not a payment and a reschedule must not harden a hold the Customer
    has not paid for.
    """
    # Confirmation takes the same lock. Without it, two Partners could both
    # pass the requirement-wide overlap read before either moved its visit.
    CustomerRequirement.objects.select_for_update().get(pk=visit.requirement_id)
    partner = visit.invitation.partner
    duration = visit.duration_minutes or visit_slots.visit_duration_minutes(visit.requirement)
    choice = visit_slots.VisitSlotChoice(starts_at=scheduled_for, duration_minutes=duration)
    if choice.starts_at <= timezone.now():
        raise VisitSlotUnavailableError("That time has passed. Pick another.")

    existing = list(
        Reservation.objects.select_for_update().filter(
            site_visit=visit,
            status__in=(Reservation.Status.TENTATIVE, Reservation.Status.CONFIRMED),
        )
    )
    # Free for this vendor *apart from the reservation being moved*. Their own current hold is the
    # one overlap that must not block the move, and `slot_is_still_free` cannot know that, so the
    # old rows are released inside the transaction and the check runs against the grid without
    # them. A refusal rolls the whole thing back, hold included.
    was_tentative = any(item.status == Reservation.Status.TENTATIVE for item in existing)
    for reservation in existing:
        reservation.release()
    if not visit_slots.slot_is_still_free(
        invitation=visit.invitation,
        choice=choice,
        exclude_site_visit_id=visit.id,
    ):
        raise VisitSlotUnavailableError()

    _hold_grid_slot(visit=visit, partner=partner, choice=choice, tentative=was_tentative)
    visit.scheduled_for = choice.starts_at
    visit.duration_minutes = duration
    # A held first slot stays `REQUESTED` until the plan is paid for. Only a visit that was already
    # scheduled stays scheduled.
    visit.save(update_fields=("scheduled_for", "duration_minutes", "updated_at"))
    return visit
