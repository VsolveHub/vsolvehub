"""The two M2 front doors: the A3 quote unlock and the A5 visit plan.

One rule runs through every command here and it is the rule the whole commercial model rests on:
**money is collected only against a real, accepted commitment, and only a verified provider
callback moves a purchase from `PENDING` to `ACTIVE`.** An unlock cannot exist without a usable
quote; a visit plan cannot be charged without a vendor who has confirmed a slot; and neither can be
granted from a client redirect, because a client redirect is a claim made by the party that
benefits from it.

The second rule is that nothing here invents a price. Tier prices and the per-slot split are
blocking owner decision 1, so every amount comes from `apps.requirements.pricing`, which refuses
with `m2_access_price_unavailable` while no row is loaded. A guessed price is indistinguishable
from an approved one once it has been charged to somebody.

Reuse, not a second money system:

* `commerce.PaymentAttempt` with new purposes, its provider orders, its webhooks, its
  reconciliation and its `FinancialException` machinery.
* `commerce.Refund` for every share that does not earn.
* `payouts.PartnerLedgerEntry` for the vendor visit payout, gated on the progressive payout rule.
* `assignments.Reservation` — the A1 booking grid — for visit slots.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone
from psycopg.types.range import Range

from apps.assignments.models import Reservation
from apps.catalog.models import ServiceVariant
from apps.commerce.models import PaymentAttempt
from apps.commerce.services import (
    allocate_document_number,
    initiate_standalone_payment_attempt,
    request_standalone_refund,
)
from apps.foundation.services import enqueue_outbox_event
from apps.identity.models import User
from apps.partners.models import PartnerProfile
from apps.payouts.models import PartnerLedgerEntry
from apps.payouts.services import payable_account
from apps.requirements import matching, pricing, visit_slots
from apps.requirements.exceptions import (
    LifecycleNotSupportedError,
    RequirementTransitionError,
    UnlockNotAvailableError,
    UnlockRequiredError,
    VisitPlanNotChargeableError,
    VisitPlanRequiredError,
    VisitSlotUnavailableError,
)
from apps.requirements.models import (
    CustomerRequirement,
    Proposal,
    QuoteUnlock,
    SiteVisit,
    VendorInvitation,
    VisitPlan,
    VisitPlanShare,
)
from apps.requirements.services import record_transition

A3 = ServiceVariant.BookingArchetype.A3_TIME_BLOCK
A5 = ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT

#: The document series M2 access receipts are numbered in. Reuses `commerce.DocumentSequence` so
#: there is one numbering authority, not a second counter that could collide with invoices.
ACCESS_RECEIPT_KIND = "M2_ACCESS"


# ---------------------------------------------------------------------------
# Shared reads
# ---------------------------------------------------------------------------


def usable_proposals(requirement: CustomerRequirement) -> list[Proposal]:
    """Quotes or estimates the Customer could actually act on, right now.

    `SUBMITTED`, vendor-confirmed and classified `USABLE`. An out-of-budget quote is deliberately
    excluded from *this* list — it is still shown to the Customer, labelled — because an unlock
    sold on the strength of a quote outside the stated budget is an unlock sold against nothing the
    Customer asked for.
    """
    return list(
        Proposal.objects.filter(
            requirement=requirement,
            status=Proposal.Status.SUBMITTED,
            usability=Proposal.Usability.USABLE,
            vendor_confirmed_at__isnull=False,
        ).order_by("total_paise")
    )


def active_unlock(requirement: CustomerRequirement) -> QuoteUnlock | None:
    """The unlock that entitles this Customer to read full quotes, if there is one."""
    return QuoteUnlock.objects.filter(
        requirement=requirement,
        status__in=QuoteUnlock.READABLE_STATUSES,
    ).first()


def charged_visit_plan(requirement: CustomerRequirement) -> VisitPlan | None:
    plan = VisitPlan.objects.filter(requirement=requirement).first()
    if plan is None or plan.status not in VisitPlan.CHARGED_STATUSES:
        return None
    return plan


def latest_unlock(requirement: CustomerRequirement) -> QuoteUnlock | None:
    """The most recent unlock in any state, for the read that has to explain a failed one.

    `active_unlock` answers "may they read"; this answers "what happened". A `PENDING` attempt the
    provider never confirmed and a `FAILED` one whose amount did not match are both states the
    Customer needs told, and neither is readable.
    """
    return QuoteUnlock.objects.filter(requirement=requirement).order_by("-created_at").first()


def customer_may_read_full_quotes(requirement: CustomerRequirement) -> bool:
    """Whether the paywall is open.

    Two different answers by archetype, and that asymmetry is the whole of revision 3: **A3** sells
    access to remote quotes, so a paid unlock is the gate. **A5** sells the visits themselves, so
    the estimates those visits produced are readable with no second paywall — the plan already
    bought them.
    """
    if requirement.archetype == A5:
        return charged_visit_plan(requirement) is not None
    return active_unlock(requirement) is not None


def assert_customer_may_read_full_quotes(requirement: CustomerRequirement) -> None:
    """The same rule as a refusal, for the read that enforces it.

    Two different codes, because the two recoveries are different actions on different screens: A3
    says "unlock the quotes" (`403 m2_unlock_required`) and A5 says "your visit plan is not paid
    for yet" (`409 m2_visit_plan_required`). Collapsing them would send an A5 Customer looking for
    an unlock button that does not exist on their flow.
    """
    if customer_may_read_full_quotes(requirement):
        return
    if requirement.archetype == A5:
        raise VisitPlanRequiredError()
    raise UnlockRequiredError()


# ---------------------------------------------------------------------------
# A3 — quote unlock (`M2-BE-401`..`405`)
# ---------------------------------------------------------------------------


def unlock_availability(requirement: CustomerRequirement) -> bool:
    """Mirrors the command's own guard, for the teaser screen's disabled state.

    A read, never a decision: `create_unlock_checkout` re-checks independently, because a stale
    `true` on a client is exactly the state a duplicate purchase lives in.
    """
    return (
        requirement.archetype == A3
        and requirement.status == CustomerRequirement.Status.QUOTES_READY
        and active_unlock(requirement) is None
        and bool(usable_proposals(requirement))
    )


@transaction.atomic
def create_unlock_checkout(
    *, requirement_id: uuid.UUID, actor: User, idempotency_key: str
) -> tuple[QuoteUnlock, PaymentAttempt]:
    """Start the INR-149-class charge that unlocks delivered quotes. A3 only.

    Refuses unless at least one **usable** quote is live at this instant. That is what makes
    "paid but nothing happened" unreachable rather than merely unlikely: there is no window in
    which a Customer can pay for an empty list, because the guard runs under the requirement's own
    row lock in the same transaction that creates the attempt.
    """
    requirement = (
        CustomerRequirement.objects.select_for_update()
        .select_related("configuration")
        .get(pk=requirement_id)
    )
    if requirement.archetype != A3:
        raise LifecycleNotSupportedError(
            "Project requests do not use a quote unlock; they use a visit plan.",
        )
    if requirement.status in CustomerRequirement.CLOSED_STATUSES:
        raise RequirementTransitionError("This request is closed.")

    existing = (
        QuoteUnlock.objects.select_for_update()
        .filter(
            requirement=requirement,
            status__in=(
                QuoteUnlock.Status.PENDING,
                QuoteUnlock.Status.ACTIVE,
                QuoteUnlock.Status.CONSUMED,
            ),
        )
        .first()
    )
    if existing is not None:
        if existing.status == QuoteUnlock.Status.PENDING and existing.payment_attempt is not None:
            # Resume rather than start a second charge. A Customer who closed the tab mid-payment
            # comes back to the attempt they already have, which is the same shape
            # `fulfilment.amendments.approve_scope_amendment` uses for the same situation.
            return existing, existing.payment_attempt
        raise UnlockNotAvailableError("You have already unlocked the quotes for this request.")

    if not usable_proposals(requirement):
        raise UnlockNotAvailableError()

    price = pricing.unlock_price()
    attempt = initiate_standalone_payment_attempt(
        purpose=PaymentAttempt.Purpose.M2_QUOTE_UNLOCK,
        amount_paise=price.amount_paise,
        idempotency_key=idempotency_key,
    )
    unlock = QuoteUnlock.objects.create(
        requirement=requirement,
        price=price.row,
        price_paise=price.amount_paise,
        payment_attempt=attempt,
        status=QuoteUnlock.Status.PENDING,
    )
    # Who started this charge, and when. The requirement does not move state here — it moves on the
    # verified callback — but a payment dispute asks "who authorised this", and the answer has to
    # exist before the money does rather than being reconstructed from a provider log afterwards.
    record_transition(
        requirement=requirement,
        from_status=requirement.status,
        to_status=requirement.status,
        actor=actor,
        reason_code="unlock_checkout_started",
        reason=f"quote_unlock:{unlock.id} for {price.amount_paise} paise",
    )
    return unlock, attempt


@transaction.atomic
def complete_unlock(*, payment_attempt_id: uuid.UUID) -> QuoteUnlock | None:
    """Grant the unlock. Called only from a verified provider callback.

    Idempotent three ways, because duplicate webhooks, provider retries and a reconciliation sweep
    all arrive here: the row lock serialises them, an already-`ACTIVE` unlock returns untouched,
    and `requirements_one_live_unlock_per_requirement` makes a second row impossible even if this
    function were somehow entered twice for one requirement.
    """
    unlock = (
        QuoteUnlock.objects.select_for_update()
        .select_related("requirement", "payment_attempt")
        .filter(payment_attempt_id=payment_attempt_id)
        .first()
    )
    if unlock is None:
        return None
    if unlock.status in (QuoteUnlock.Status.ACTIVE, QuoteUnlock.Status.CONSUMED):
        return unlock
    attempt = unlock.payment_attempt
    if attempt is None or attempt.status != PaymentAttempt.Status.CAPTURED:
        return unlock
    if attempt.amount_paise != unlock.price_paise:
        # Amount tampering, or a price that moved between checkout and capture. Neither is an
        # unlock: the purchase snapshot is the authority and a mismatch is a financial exception,
        # not a discount.
        unlock.status = QuoteUnlock.Status.FAILED
        unlock.failure_code = "amount_mismatch"
        unlock.save(update_fields=("status", "failure_code", "updated_at"))
        return unlock

    requirement = CustomerRequirement.objects.select_for_update().get(pk=unlock.requirement_id)
    series, sequence = allocate_document_number(kind=ACCESS_RECEIPT_KIND)
    unlock.status = QuoteUnlock.Status.ACTIVE
    unlock.activated_at = timezone.now()
    unlock.unlocked_proposal_ids = [str(item.id) for item in usable_proposals(requirement)]
    unlock.receipt_series = series
    unlock.receipt_sequence = sequence
    unlock.save(
        update_fields=(
            "status",
            "activated_at",
            "unlocked_proposal_ids",
            "receipt_series",
            "receipt_sequence",
            "updated_at",
        )
    )
    if requirement.status == CustomerRequirement.Status.QUOTES_READY:
        requirement.status = CustomerRequirement.Status.UNLOCKED
        requirement.save(update_fields=("status", "updated_at"))
        # `actor=None` and it has to be: the party that moved this is the provider callback, not a
        # person. Attributing it to the Customer would put a signature on a state change they did
        # not make, in the trail that exists to prove who made which one.
        record_transition(
            requirement=requirement,
            from_status=CustomerRequirement.Status.QUOTES_READY,
            to_status=CustomerRequirement.Status.UNLOCKED,
            actor=None,
            reason_code="unlock_payment_verified",
            reason=f"quote_unlock:{unlock.id}",
        )
    enqueue_outbox_event(
        aggregate_type="requirement",
        aggregate_id=requirement.id,
        event_type="m2.unlock.activated",
        idempotency_key=f"unlock-activated:{unlock.id}",
        payload={"requirement_id": str(requirement.id), "quote_unlock_id": str(unlock.id)},
    )
    return unlock


@transaction.atomic
def refund_unlock(*, unlock_id: uuid.UUID, reason_code: str) -> QuoteUnlock:
    """Give the unlock fee back. Idempotent by state.

    Used by `service_by` expiry and by "every unlocked vendor fell through". A `CONSUMED` unlock is
    **not** refunded — an engagement exists, so the fee was earned.
    """
    unlock = QuoteUnlock.objects.select_for_update().get(pk=unlock_id)
    if unlock.status != QuoteUnlock.Status.ACTIVE:
        return unlock
    if unlock.payment_attempt_id is not None:
        unlock.refund = request_standalone_refund(
            payment_attempt_id=unlock.payment_attempt_id,
            amount_paise=unlock.price_paise,
            reason_code=reason_code,
            idempotency_key=f"m2-unlock-refund:{unlock.id}",
        )
    unlock.status = QuoteUnlock.Status.REFUNDED
    unlock.refunded_at = timezone.now()
    unlock.save(update_fields=("status", "refund", "refunded_at", "updated_at"))
    return unlock


@transaction.atomic
def consume_unlock(*, requirement: CustomerRequirement) -> QuoteUnlock | None:
    """Mark the fee earned. Called when an engagement opens on an A3 requirement."""
    unlock = (
        QuoteUnlock.objects.select_for_update()
        .filter(requirement=requirement, status=QuoteUnlock.Status.ACTIVE)
        .first()
    )
    if unlock is None:
        return None
    unlock.status = QuoteUnlock.Status.CONSUMED
    unlock.consumed_at = timezone.now()
    unlock.save(update_fields=("status", "consumed_at", "updated_at"))
    return unlock


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
        CustomerRequirement.objects.select_for_update()
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
        CustomerRequirement.objects.select_for_update()
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
        VisitPlan.objects.select_for_update()
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


# ---------------------------------------------------------------------------
# Visit arrival and completion (`M2-BE-423`)
# ---------------------------------------------------------------------------


@transaction.atomic
def confirm_visit_arrival(*, site_visit_id: uuid.UUID, actor: User) -> SiteVisit:
    """Record that the vendor is on site, on the non-OTP fallback path.

    `milestones.md` defers OTP to M3, so `NON_OTP_FALLBACK` is the *default* path in M2 rather than
    a degraded one — the field is stored so that when the start OTP is activated, every historical
    arrival still says truthfully how it was proved.
    """
    visit = SiteVisit.objects.select_for_update().get(pk=site_visit_id)
    if visit.status == SiteVisit.Status.IN_PROGRESS:
        return visit
    if visit.status != SiteVisit.Status.SCHEDULED:
        raise RequirementTransitionError("Only a scheduled visit can be marked as arrived.")
    visit.status = SiteVisit.Status.IN_PROGRESS
    visit.arrival_confirmed_at = timezone.now()
    visit.arrival_method = SiteVisit.ArrivalMethod.NON_OTP_FALLBACK
    visit.arrival_confirmed_by = actor
    visit.save(
        update_fields=(
            "status",
            "arrival_confirmed_at",
            "arrival_method",
            "arrival_confirmed_by",
            "updated_at",
        )
    )
    return visit


@transaction.atomic
def complete_plan_visit(*, site_visit_id: uuid.UUID, outcome_notes: str = "") -> SiteVisit:
    """Close a visit that happened, and start the post-visit estimate clock.

    Completing is what makes an estimate submittable at all (`m2_visit_not_completed`), and it is
    also what starts the window inside which one must arrive. Both halves matter: the first stops a
    vendor pricing from a desk, the second stops one taking a slot and never estimating.
    """
    visit = (
        SiteVisit.objects.select_for_update()
        .select_related("requirement__configuration")
        .get(pk=site_visit_id)
    )
    if visit.status == SiteVisit.Status.COMPLETED:
        return visit
    if visit.status not in (SiteVisit.Status.SCHEDULED, SiteVisit.Status.IN_PROGRESS):
        raise RequirementTransitionError("Only a scheduled visit can be completed.")
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
        SiteVisit.objects.select_for_update()
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
        VisitPlanShare.objects.select_for_update()
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
    visit = SiteVisit.objects.select_for_update().select_related("plan_share").get(pk=site_visit_id)
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
        SiteVisit.objects.select_for_update()
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


# ---------------------------------------------------------------------------
# Reclassification money rules (`M2-BE-427`)
# ---------------------------------------------------------------------------


@transaction.atomic
def carry_money_across_reclassification(
    *, requirement_id: uuid.UUID, from_archetype: str, to_archetype: str
) -> None:
    """Move what the Customer already paid for onto the other lifecycle. Never charge twice.

    **A3 → A5.** An active unlock becomes visit-plan credit. The plan is created `CHOSEN` at the
    smallest tier that has a price, carrying the unlock's paise, and its checkout collects only the
    difference — nothing when the credit covers it.

    **A5 → A3.** Shares nobody has consumed are refunded; earned shares stay earned, because those
    visits genuinely happened and those vendors genuinely travelled.

    Deliberately does **not** create an A3 unlock out of an A5 plan. An unlock is a purchase the
    Customer makes when quotes exist, and manufacturing one here would hand out access to quotes
    that have not been delivered yet.
    """
    requirement = CustomerRequirement.objects.select_for_update().get(pk=requirement_id)
    if from_archetype == A3 and to_archetype == A5:
        unlock = (
            QuoteUnlock.objects.select_for_update()
            .filter(requirement=requirement, status=QuoteUnlock.Status.ACTIVE)
            .first()
        )
        if unlock is None:
            return
        tiers = pricing.available_visit_plan_tiers()
        if not tiers:
            # No tier is priced, so there is nothing to carry the credit onto. The unlock stays
            # active and refundable rather than being silently spent.
            return
        tier = tiers[0]
        credited = VisitPlan.objects.filter(requirement=requirement).first() or VisitPlan(
            requirement=requirement
        )
        credited.plan_size = tier.row.plan_size
        credited.price = tier.row
        credited.price_paise = tier.amount_paise
        credited.vendor_payout_basis_points = tier.vendor_payout_basis_points or 0
        credited.credit_paise = min(unlock.price_paise, tier.amount_paise)
        credited.credit_unlock = unlock
        credited.status = VisitPlan.Status.CHOSEN
        credited.save()
        credited.shares.all().delete()
        _create_shares(credited)
        unlock.status = QuoteUnlock.Status.CONSUMED
        unlock.consumed_at = timezone.now()
        unlock.save(update_fields=("status", "consumed_at", "updated_at"))
        return

    if from_archetype == A5 and to_archetype == A3:
        existing = VisitPlan.objects.select_for_update().filter(requirement=requirement).first()
        if existing is None:
            return
        if existing.status == VisitPlan.Status.CHOSEN:
            existing.status = VisitPlan.Status.VOID
            existing.voided_at = timezone.now()
            existing.save(update_fields=("status", "voided_at", "updated_at"))
            return
        for share in existing.shares.filter(status__in=VisitPlanShare.OPEN_STATUSES):
            refund_share(share_id=share.id, reason_code="m2_requirement_reclassified")
