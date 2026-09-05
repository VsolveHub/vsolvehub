"""The A3 booking fee: the commitment device, and the only money Vsolve collects on this path.

`07-state-machines-and-permissions.md` §4c, implemented literally::

    OFFER_ACCEPTED -> PENDING -> ACTIVE -> EARNED | FORFEIT_SPLIT | REFUNDED | FAILED

Everything here is the A3 mirror of the A5 visit plan, on the same rails and for the same reasons,
so `access.py` is the file to read beside it:

* the fee is **priced server-side** from the card's fee component, snapshotted onto the booking;
* it is **never granted from a client redirect** — only a verified provider callback moves
  `PENDING → ACTIVE`, and that same callback creates the engagement;
* **one charge per booking** under duplicate webhooks, browser retries and delayed callbacks, made
  a database fact by `requirements_one_live_booking_fee` rather than a code convention;
* the forfeit split runs on the **M1 payout and ledger rails** — a `PartnerLedgerEntry` with no
  Booking, written `PENDING` when the lead has no verified payout account, because they earned the
  travel compensation whether or not they can be paid it yet.

The one thing this module deliberately does not do is touch wages. Those are peer-to-peer, daily,
at day end; there is no code path here that could hold them and no column that could store them.
"""

import uuid
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from apps.commerce.models import PaymentAttempt
from apps.commerce.services import (
    allocate_document_number,
    initiate_standalone_payment_attempt,
    request_standalone_refund,
)
from apps.foundation.services import enqueue_outbox_event
from apps.identity.models import User
from apps.partners import standing
from apps.partners.models import PartnerStandingEvent
from apps.payouts.models import PartnerLedgerEntry
from apps.payouts.services import payable_account
from apps.requirements import crew_dispatch, engagements, matching, rate_cards, services
from apps.requirements.access import ACCESS_RECEIPT_KIND
from apps.requirements.exceptions import (
    BookingFeeNotChargeableError,
    LifecycleNotSupportedError,
    RequirementTransitionError,
)
from apps.requirements.models import (
    BookingFee,
    CustomerRequirement,
    Engagement,
    RateCardBooking,
    VendorInvitation,
)

#: Reason codes on the settlement, so a support conversation and a ledger row use one vocabulary.
REASON_CUSTOMER_NO_SHOW = "customer_no_show"
REASON_GATE_LOCKED = "gate_locked"
REASON_LATE_CANCELLATION = "late_cancellation"
REASON_FREE_CANCELLATION = "free_cancellation"
REASON_VENDOR_NO_SHOW = "vendor_no_show"
REASON_REQUIREMENT_EXPIRED = "requirement_expired"

#: The forfeit triggers, as a set, so the command can refuse anything else rather than settling
#: money against a reason nobody defined.
FORFEIT_REASONS = (REASON_CUSTOMER_NO_SHOW, REASON_GATE_LOCKED, REASON_LATE_CANCELLATION)


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------


def live_booking_fee(requirement: CustomerRequirement) -> BookingFee | None:
    """The fee that currently means something on this requirement, if there is one.

    `FAILED` rows are excluded because a failed attempt is a retry waiting to happen, not a state
    the Customer is in — the same distinction `active_unlock` draws for the unlock.
    """
    return (
        BookingFee.objects.filter(requirement=requirement)
        .exclude(status__in=BookingFee.NON_BLOCKING_STATUSES)
        .order_by("-created_at")
        .first()
    )


def latest_booking_fee(requirement: CustomerRequirement) -> BookingFee | None:
    """The most recent fee in any state, for the read that has to explain a failed one."""
    return (
        BookingFee.objects.select_related("payment_attempt")
        .filter(requirement=requirement)
        .order_by("-created_at")
        .first()
    )


def booking_fee_checkout_availability(requirement: CustomerRequirement) -> bool:
    """Mirrors the command's guard, for the screen's disabled state.

    A read, never a decision. `create_booking_fee_checkout` re-checks under the booking's row lock,
    because a hold that lapsed a second ago is exactly the state a stale `true` lives in.
    """
    booking = RateCardBooking.objects.filter(requirement=requirement).first()
    if booking is None or booking.status != RateCardBooking.Status.OFFER_HELD:
        return False
    fee = live_booking_fee(requirement)
    return fee is None or fee.status in (
        BookingFee.Status.OFFER_ACCEPTED,
        BookingFee.Status.PENDING,
    )


# ---------------------------------------------------------------------------
# The held fee (`OFFER_ACCEPTED`), written where §4c says it starts
# ---------------------------------------------------------------------------


@transaction.atomic
def hold_booking_fee(
    *, booking: RateCardBooking, invitation: VendorInvitation
) -> BookingFee | None:
    """Open the fee in `OFFER_ACCEPTED` the moment a lead takes the job.

    **This is the writer `BookingFee.Status.OFFER_ACCEPTED` did not have.**
    `07-state-machines-and-permissions.md` §4c draws the machine as
    `OFFER_ACCEPTED → PENDING → ACTIVE`, and until now the first state was a model default that no
    path persisted: `accept_crew_offer` wrote no row and `create_booking_fee_checkout` constructed
    one straight into `PENDING`. A published state with a reader and no writer, which is the shape
    RULES §3(b) names one level up from a configuration column.

    It was not merely cosmetic. `cancel_booking` has always had an `OFFER_ACCEPTED` branch — the
    Customer who changes their mind while a lead is holding the job and before they have paid —
    and that branch was **unreachable**: `_locked_fee` found nothing and refused with
    "There is no booking fee on this request", in exactly the window the command was written for.

    What it does **not** change is whether the fee can be paid. `booking_fee_checkout_availability`
    keys on `booking.status == OFFER_HELD` and explicitly tolerates a missing fee row, and
    `create_booking_fee_checkout` builds the row itself when there is none — so the checkout has
    always worked, and it works identically now with the row already there (the `existing` branch
    picks it up and moves it to `PENDING`).

    Reuse rather than insert, because `requirements_one_live_booking_fee` permits exactly one
    non-`FAILED` fee per booking and one booking is reused across every cascade wave. An existing
    `OFFER_ACCEPTED` row is repointed at whoever is holding the job now. Anything else — a charge
    in flight, a settled fee, a refunded one after a vendor no-show — is **left exactly as it is**
    and no row is written, which keeps this strictly a state that was missing rather than a change
    to money that already moved.
    """
    existing = (
        BookingFee.objects.select_for_update()
        .filter(booking=booking)
        .exclude(status__in=BookingFee.NON_BLOCKING_STATUSES)
        .first()
    )
    if existing is not None:
        if existing.status != BookingFee.Status.OFFER_ACCEPTED:
            return None
        if existing.invitation_id != invitation.id:
            existing.invitation = invitation
            existing.save(update_fields=("invitation", "updated_at"))
        return existing
    return BookingFee.objects.create(
        booking=booking,
        requirement_id=booking.requirement_id,
        invitation=invitation,
        rate_card_id=booking.rate_card_id,
        amount_paise=booking.booking_fee_paise,
        status=BookingFee.Status.OFFER_ACCEPTED,
    )


@transaction.atomic
def release_held_booking_fee(*, booking: RateCardBooking) -> BookingFee | None:
    """Let go of an unpaid held fee when the hold lapses or the job leaves the instant path.

    Only ever touches a row that is `OFFER_ACCEPTED` **and** has no payment attempt behind it, so
    it can never reach money. `FAILED` is the published status for "not a state the Customer is
    in" — it is what `live_booking_fee` excludes and what
    `requirements_one_live_booking_fee` permits a second row beside — and `failure_code` carries
    the truth the status name cannot, because nobody's payment failed here: the Customer simply
    never started one.

    Without this a lapsed hold would leave a fee row the next lead's acceptance has to reuse and
    the Customer's screen would keep rendering an amount for a job nobody is holding.
    """
    fee = (
        BookingFee.objects.select_for_update()
        .filter(
            booking=booking,
            status=BookingFee.Status.OFFER_ACCEPTED,
            payment_attempt__isnull=True,
        )
        .first()
    )
    if fee is None:
        return None
    fee.status = BookingFee.Status.FAILED
    fee.failure_code = "offer_hold_released"
    fee.save(update_fields=("status", "failure_code", "updated_at"))
    return fee


# ---------------------------------------------------------------------------
# Checkout and the verified callback (`M2-BE-432`)
# ---------------------------------------------------------------------------


@transaction.atomic
def create_booking_fee_checkout(
    *, requirement_id: uuid.UUID, actor: User, idempotency_key: str
) -> tuple[BookingFee, PaymentAttempt]:
    """Start the one online charge on the A3 rate-card path.

    Refuses with `m2_booking_fee_not_chargeable` unless a lead is holding this job **right now**,
    checked under the booking's own row lock in the same transaction that creates the attempt.
    That is what makes "paid but no crew" unreachable rather than merely unlikely.

    The attempt expires with the hold, deliberately. A payment that landed after the hold lapsed
    would buy a crew the lead is no longer committed to, and the Customer would have paid for a
    confirmation nobody made.
    """
    requirement = (
        CustomerRequirement.objects.select_for_update(of=("self",))
        .select_related("configuration")
        .get(pk=requirement_id)
    )
    if requirement.status in CustomerRequirement.CLOSED_STATUSES:
        raise RequirementTransitionError("This request is closed.")
    booking = (
        RateCardBooking.objects.select_for_update(of=("self",))
        .select_related("rate_card")
        .filter(requirement=requirement)
        .first()
    )
    if booking is None:
        raise LifecycleNotSupportedError(
            "This request is on the quote flow; there is no booking fee to pay.",
        )
    if booking.status == RateCardBooking.Status.CONFIRMED:
        raise BookingFeeNotChargeableError("This crew is already confirmed.")
    if booking.status != RateCardBooking.Status.OFFER_HELD:
        raise BookingFeeNotChargeableError()
    if _redispatch_entitlement_is_live(booking):
        # The free re-dispatch after a vendor no-show. There is nothing to pay: the Customer's fee
        # was refunded in full and §4c promises the replacement crew at no charge. Refusing here
        # matters even though `accept_crew_offer` confirms such a booking inline, because a
        # Customer with the checkout screen still open from the first crew would otherwise be
        # charged a second time for one job.
        raise BookingFeeNotChargeableError(
            "Your replacement crew is free — there is nothing more to pay for this booking.",
        )
    if booking.hold_expires_at is not None and booking.hold_expires_at <= timezone.now():
        raise BookingFeeNotChargeableError(
            "The crew's hold on this job has expired. We are looking for another.",
        )
    invitation_id = booking.accepted_invitation_id
    if invitation_id is None:
        raise BookingFeeNotChargeableError()

    existing = (
        BookingFee.objects.select_for_update()
        .filter(booking=booking)
        .exclude(status__in=BookingFee.NON_BLOCKING_STATUSES)
        .first()
    )
    if existing is not None:
        if existing.status == BookingFee.Status.PENDING and existing.payment_attempt is not None:
            # Resume rather than start a second charge — the shape `create_unlock_checkout` and
            # `approve_scope_amendment` both use for a Customer who closed the tab mid-payment.
            return existing, existing.payment_attempt
        if existing.status != BookingFee.Status.OFFER_ACCEPTED:
            raise BookingFeeNotChargeableError("This booking fee is already settled.")

    attempt = initiate_standalone_payment_attempt(
        purpose=PaymentAttempt.Purpose.M2_BOOKING_FEE,
        amount_paise=booking.booking_fee_paise,
        idempotency_key=idempotency_key,
        expires_at=booking.hold_expires_at,
    )
    fee = existing or BookingFee(
        booking=booking,
        requirement=requirement,
        invitation_id=invitation_id,
        rate_card=booking.rate_card,
        amount_paise=booking.booking_fee_paise,
    )
    fee.status = BookingFee.Status.PENDING
    fee.payment_attempt = attempt
    fee.save()
    services.record_transition(
        requirement=requirement,
        from_status=requirement.status,
        to_status=requirement.status,
        actor=actor,
        reason_code="booking_fee_checkout_started",
        reason=f"booking_fee:{fee.id} for {fee.amount_paise} paise",
    )
    return fee, attempt


@transaction.atomic
def complete_booking_fee(*, payment_attempt_id: uuid.UUID) -> BookingFee | None:
    """Confirm the crew and open the engagement. Verified provider callback only.

    Idempotent three ways, because duplicate webhooks, provider retries and the reconciliation
    sweep all arrive here: the fee row is locked, an already-`ACTIVE` fee returns untouched, and
    `requirements_one_live_booking_fee` makes a second row impossible even if this were somehow
    entered twice for one booking.

    **This is the transition that creates the engagement** (§4c). Doing it here rather than from an
    outbox event is the same decision `_apply_m2_capture` records for the unlock: a commit boundary
    between "the Customer's money moved" and "the Customer got what they paid for" is a support
    ticket for every event lost in the gap.
    """
    fee = (
        BookingFee.objects.select_for_update(of=("self",))
        .select_related("booking__requirement__configuration", "payment_attempt", "invitation")
        .filter(payment_attempt_id=payment_attempt_id)
        .first()
    )
    if fee is None:
        return None
    if fee.status in BookingFee.CHARGED_STATUSES:
        return fee
    attempt = fee.payment_attempt
    if attempt is None or attempt.status != PaymentAttempt.Status.CAPTURED:
        return fee
    if attempt.amount_paise != fee.amount_paise:
        # Amount tampering, or a rate that moved between checkout and capture. Neither confirms a
        # crew: the booking snapshot is the authority and a mismatch is a financial exception, not
        # a discount.
        fee.status = BookingFee.Status.FAILED
        fee.failure_code = "amount_mismatch"
        fee.save(update_fields=("status", "failure_code", "updated_at"))
        return fee

    booking = RateCardBooking.objects.select_for_update(of=("self",)).get(pk=fee.booking_id)
    if booking.status not in (
        RateCardBooking.Status.OFFER_HELD,
        RateCardBooking.Status.CONFIRMED,
    ):
        # The hold lapsed before the callback landed. The money is real, so it is refunded rather
        # than kept against a booking nobody is holding — the Customer bought a confirmation that
        # no longer exists.
        return _refund(fee=fee, reason_code="offer_hold_expired")

    series, sequence = allocate_document_number(kind=ACCESS_RECEIPT_KIND)
    now = timezone.now()
    fee.status = BookingFee.Status.ACTIVE
    fee.activated_at = now
    fee.receipt_series = series
    fee.receipt_sequence = sequence
    fee.save(
        update_fields=(
            "status",
            "activated_at",
            "receipt_series",
            "receipt_sequence",
            "updated_at",
        )
    )
    booking.status = RateCardBooking.Status.CONFIRMED
    booking.confirmed_at = now
    booking.hold_expires_at = None
    booking.save(update_fields=("status", "confirmed_at", "hold_expires_at", "updated_at"))

    engagements.open_rate_card_engagement(booking_id=booking.id)
    enqueue_outbox_event(
        aggregate_type="requirement",
        aggregate_id=booking.requirement_id,
        event_type="m2.booking_fee.charged",
        idempotency_key=f"booking-fee-charged:{fee.id}",
        payload={
            "requirement_id": str(booking.requirement_id),
            "rate_card_booking_id": str(booking.id),
            "booking_fee_id": str(fee.id),
        },
    )
    return fee


# ---------------------------------------------------------------------------
# Earning, forfeiting and refunding (`M2-BE-433`)
# ---------------------------------------------------------------------------


@transaction.atomic
def earn_booking_fee(*, requirement_id: uuid.UUID, actor: User | None) -> BookingFee:
    """First-day crew arrival confirmed, so the fee is earned (§4c).

    Non-OTP, because `milestones.md` defers the start OTP to M3 and M2 proves arrival on the
    fallback path. Idempotent by state: two taps, or a tap from each side, settle on one outcome.

    Nothing is paid out here. The fee is Vsolve's revenue once the crew arrived; the wages are
    peer-to-peer and are settled by the evening dual tap, which is Wave C4.
    """
    fee = _locked_fee(requirement_id)
    if fee.status in (BookingFee.Status.EARNED, BookingFee.Status.WAIVED):
        # A waived fee is a free re-dispatch: the crew arriving is exactly what was promised, and
        # there is no money left on this booking to earn. Idempotent rather than a refusal, because
        # the caller is a supervisor confirming an arrival that really did happen.
        return fee
    if fee.status != BookingFee.Status.ACTIVE:
        raise RequirementTransitionError(
            "This booking is not confirmed, so there is nothing to mark as arrived.",
        )
    now = timezone.now()
    fee.status = BookingFee.Status.EARNED
    fee.earned_at = now
    fee.settled_at = now
    fee.settlement_reason_code = "crew_arrived"
    fee.save(
        update_fields=("status", "earned_at", "settled_at", "settlement_reason_code", "updated_at")
    )
    requirement = CustomerRequirement.objects.get(pk=requirement_id)
    services.record_transition(
        requirement=requirement,
        from_status=requirement.status,
        to_status=requirement.status,
        actor=actor,
        reason_code="crew_arrival_confirmed",
        reason=f"booking_fee:{fee.id} earned",
    )
    return fee


@transaction.atomic
def forfeit_booking_fee(*, requirement_id: uuid.UUID, reason_code: str) -> BookingFee:
    """The crew travelled and could not work, so the fee forfeits and splits.

    Three triggers, all the Customer's side of the door: a no-show, a locked gate, or a
    cancellation inside the free-cancel window T. ADR-0009 is blunt about why this exists — a crew
    that travelled for nothing kills vendor trust faster than anything — and equally blunt that a
    prank booking now costs real money, which is the point.

    The split is `travel compensation + platform share = fee`, in integer paise, with the platform
    share as the **remainder** so the parts always add back. The compensation goes through the M1
    ledger as a `PartnerLedgerEntry` with no Booking, `PENDING` when the lead has no verified
    payout account: the progressive gate is applied as a **hold, not a refusal**, because they
    earned it either way and refusing to write the entry would lose the debt.
    """
    if reason_code not in FORFEIT_REASONS:
        raise RequirementTransitionError("That is not a reason a booking fee can be forfeited for.")
    fee = _locked_fee(requirement_id)
    if fee.status == BookingFee.Status.FORFEIT_SPLIT:
        return fee
    if fee.status == BookingFee.Status.WAIVED:
        # A free re-dispatch collected nothing, so there is nothing to split. The lead who
        # travelled to a locked gate on a re-dispatched booking is genuinely uncompensated, and
        # that is a gap in revision 4 rather than something code may invent a payment for: the
        # platform holds no money for this booking. Recorded as a refusal the caller handles, so
        # the no-show itself is still logged against standing and still opens a case.
        raise RequirementTransitionError(
            "This crew was re-dispatched free of charge, so there is no booking fee to forfeit.",
        )
    if fee.status != BookingFee.Status.ACTIVE:
        raise RequirementTransitionError("This booking fee cannot be forfeited from here.")

    requirement = CustomerRequirement.objects.select_related("configuration").get(pk=requirement_id)
    travel_paise, platform_paise = rate_cards.forfeit_split(
        requirement, amount_paise=fee.amount_paise
    )
    partner = fee.invitation.partner
    entry = PartnerLedgerEntry.objects.filter(
        idempotency_key=f"m2-booking-fee-travel:{fee.id}"
    ).first()
    if entry is None and travel_paise > 0:
        entry = PartnerLedgerEntry.objects.create(
            partner=partner,
            booking=None,
            kind=PartnerLedgerEntry.Kind.EARNING,
            status=(
                PartnerLedgerEntry.Status.AVAILABLE
                if payable_account(partner) is not None
                else PartnerLedgerEntry.Status.PENDING
            ),
            gross_paise=fee.amount_paise,
            commission_paise=platform_paise,
            net_paise=travel_paise,
            calculation_snapshot={
                "source": "m2_booking_fee_forfeit",
                "booking_fee_id": str(fee.id),
                "fee_paise": fee.amount_paise,
                "travel_compensation_paise": travel_paise,
                "platform_share_paise": platform_paise,
                "reason_code": reason_code,
            },
            reason=reason_code,
            idempotency_key=f"m2-booking-fee-travel:{fee.id}",
        )
    now = timezone.now()
    fee.status = BookingFee.Status.FORFEIT_SPLIT
    fee.travel_compensation_paise = travel_paise
    fee.platform_share_paise = platform_paise
    fee.ledger_entry = entry
    fee.settled_at = now
    fee.settlement_reason_code = reason_code
    fee.save(
        update_fields=(
            "status",
            "travel_compensation_paise",
            "platform_share_paise",
            "ledger_entry",
            "settled_at",
            "settlement_reason_code",
            "updated_at",
        )
    )
    services.record_transition(
        requirement=requirement,
        from_status=requirement.status,
        to_status=requirement.status,
        actor=None,
        reason_code="booking_fee_forfeited",
        reason=(
            f"booking_fee:{fee.id} {fee.amount_paise} paise = {travel_paise} travel "
            f"+ {platform_paise} platform ({reason_code})"
        ),
    )
    enqueue_outbox_event(
        aggregate_type="requirement",
        aggregate_id=requirement.id,
        event_type="m2.booking_fee.forfeited",
        idempotency_key=f"m2-booking-fee-forfeited:{fee.id}",
        payload={
            "requirement_id": str(requirement.id),
            "vendor_invitation_id": str(fee.invitation_id),
            "amount_paise": travel_paise,
            "reason_code": reason_code,
        },
    )
    return fee


@transaction.atomic
def refund_booking_fee(*, requirement_id: uuid.UUID, reason_code: str) -> BookingFee:
    """Give the whole fee back. Vendor no-show, free-window cancellation, or expiry.

    A **vendor** no-show never pays travel compensation — neither party earns from an undelivered
    crew — and additionally returns the requirement to `MATCHING` for a free re-dispatch, with the
    vendor's standing carrying the record. That asymmetry is the whole of §4c's last line and is
    implemented in `report_crew_no_show` below rather than here, so the refund itself stays one
    thing that does one thing.
    """
    fee = _locked_fee(requirement_id)
    return _refund(fee=fee, reason_code=reason_code)


def _refund(*, fee: BookingFee, reason_code: str) -> BookingFee:
    if fee.status == BookingFee.Status.REFUNDED:
        return fee
    if fee.status == BookingFee.Status.WAIVED:
        # Nothing was collected on a free re-dispatch, so there is nothing to give back. Returned
        # rather than refused: every caller here is a sweep or a cancellation that must still
        # close the booking, and a `409` from a settlement path would strand it.
        return fee
    if fee.status in (BookingFee.Status.EARNED, BookingFee.Status.FORFEIT_SPLIT):
        raise RequirementTransitionError("This booking fee is already settled.")
    if fee.payment_attempt_id is not None and fee.status in BookingFee.CHARGED_STATUSES:
        fee.refund = request_standalone_refund(
            payment_attempt_id=fee.payment_attempt_id,
            amount_paise=fee.amount_paise,
            reason_code=f"m2_{reason_code}",
            idempotency_key=f"m2-booking-fee-refund:{fee.id}",
        )
    now = timezone.now()
    fee.status = BookingFee.Status.REFUNDED
    fee.settled_at = now
    fee.settlement_reason_code = reason_code
    fee.save(
        update_fields=("status", "refund", "settled_at", "settlement_reason_code", "updated_at")
    )
    return fee


@transaction.atomic
def cancel_booking(*, requirement_id: uuid.UUID, actor: User) -> BookingFee:
    """The Customer calls it off. The free-cancel window T decides which way the money goes.

    At or beyond T hours before the requested start: a full refund, no questions. Inside T: the
    forfeit split, because the lead has already turned other work down for that day.

    T is owner decision 12 and is read fail-closed. While it is unset **this command refuses**,
    which is the honest consequence: choosing between a refund and a forfeit by guessing is
    choosing whose money it is.
    """
    requirement = CustomerRequirement.objects.select_related("configuration").get(pk=requirement_id)
    fee = _locked_fee(requirement_id)
    if fee.status == BookingFee.Status.WAIVED:
        # A free re-dispatch. There is no money on this booking either way, so the free-cancel
        # window decides nothing and is not read — which also means an unset T does not block a
        # Customer from calling off a job they are not being charged for.
        _close_booking(requirement=requirement, actor=actor, reason_code="customer_cancelled")
        return fee
    hours = rate_cards.free_cancel_hours(requirement)
    if fee.status not in (BookingFee.Status.ACTIVE, BookingFee.Status.OFFER_ACCEPTED):
        raise RequirementTransitionError("This booking can no longer be cancelled here.")

    starts_at = requirement.requested_start
    inside_window = starts_at is not None and timezone.now() > starts_at - timedelta(hours=hours)
    settled = (
        forfeit_booking_fee(requirement_id=requirement_id, reason_code=REASON_LATE_CANCELLATION)
        if inside_window and fee.status == BookingFee.Status.ACTIVE
        else _refund(fee=fee, reason_code=REASON_FREE_CANCELLATION)
    )
    _close_booking(requirement=requirement, actor=actor, reason_code="customer_cancelled")
    return settled


@transaction.atomic
def report_crew_no_show(
    *, requirement_id: uuid.UUID, party: str, reason_code: str = ""
) -> BookingFee:
    """Day one, and somebody was not there. Who decides everything.

    **Vendor no-show:** the fee refunds in full, no travel compensation is paid, the requirement
    goes back to `MATCHING` for a **free re-dispatch** through the cascade, and the vendor's
    standing takes the hit. §1 says so explicitly and it is the only path that returns an engaged
    requirement to matching.

    **Customer no-show or a locked gate:** the forfeit split runs. The crew travelled.
    """
    _open_no_show_case(requirement_id=requirement_id, party=party)
    if party == "VENDOR":
        fee = refund_booking_fee(requirement_id=requirement_id, reason_code=REASON_VENDOR_NO_SHOW)
        # "The vendor's standing takes the hit" was a sentence in this docstring and nothing else
        # until Wave C4 built somewhere to put it. Recorded before the re-dispatch clears the
        # accepted invitation, because that is where the identity of the lead who did not turn up
        # still is. One event per fee row, so a retried report does not count twice.
        _record_vendor_no_show_standing(fee=fee)
        _redispatch_after_vendor_no_show(requirement_id=requirement_id)
        return fee
    return forfeit_booking_fee(
        requirement_id=requirement_id,
        reason_code=reason_code or REASON_CUSTOMER_NO_SHOW,
    )


def _open_no_show_case(*, requirement_id: uuid.UUID, party: str) -> None:
    """`M2-BE-703`: somebody was not there on day one, and that is somebody's job to chase.

    Opened **before** the money settles, deliberately: on the customer-no-show branch
    `forfeit_booking_fee` can refuse — an unset forfeit split, or a fee that was waived under a
    free re-dispatch — and a case that only opened after a successful settlement would be missing
    from exactly the cases that need a person most.

    Imported late for the cycle `apps.cases.services` documents: `disputes` reaches back into
    `apps.cases`, which reaches into this module's siblings.
    """
    from apps.requirements import disputes  # noqa: PLC0415 - avoids a module import cycle

    requirement = CustomerRequirement.objects.filter(pk=requirement_id).first()
    if requirement is None:  # pragma: no cover - the caller loaded it
        return
    booking = RateCardBooking.objects.filter(requirement=requirement).first()
    engagement = Engagement.objects.filter(requirement=requirement).first()
    disputes.open_no_show_case(
        requirement=requirement,
        engagement=engagement,
        party=party,
        source_kind="rate_card_booking_no_show",
        # Keyed on the booking **and** how many times it has been re-dispatched, so a second crew
        # that also fails to arrive opens a second case rather than silently joining the first.
        source_id=uuid.uuid5(
            uuid.UUID(str(booking.id if booking is not None else requirement.id)),
            f"{party}:{booking.redispatch_count if booking is not None else 0}",
        ),
    )


def _record_vendor_no_show_standing(*, fee: BookingFee) -> None:
    """A crew that never arrived is a fact about the lead, kept as one.

    Not a penalty and not a score — `apps.partners.standing` stores events and counts patterns
    against thresholds the owner has not set. Nothing happens to the vendor here beyond the record,
    which is the fail-closed direction: the money consequence already ran (a full refund, no travel
    compensation) and taking their trade as well on an unconfigured number is not code's call.
    """
    invitation = fee.invitation
    if invitation is None:  # pragma: no cover - the FK is not nullable
        return
    standing.record_event(
        partner=invitation.partner,
        kind=PartnerStandingEvent.Kind.VENDOR_NO_SHOW,
        source_kind="booking_fee",
        source_id=fee.id,
        reason=f"requirement {fee.requirement_id}",
    )


def _redispatch_after_vendor_no_show(*, requirement_id: uuid.UUID) -> None:
    """Free re-dispatch: cancel the engagement, release the lead, and cascade again.

    The booking returns to `MATCHING` **at its original snapshot** — the same headcount, the same
    days, the same frozen rate — because the Customer is owed the crew they booked, not a new
    negotiation at whatever this week's card says.
    """
    booking = (
        RateCardBooking.objects.select_for_update(of=("self",))
        .filter(requirement_id=requirement_id)
        .first()
    )
    if booking is None:
        return
    engagement = Engagement.objects.filter(requirement_id=requirement_id).first()
    if engagement is not None and engagement.status in (
        Engagement.Status.PENDING_START,
        Engagement.Status.ACTIVE,
    ):
        engagement.status = Engagement.Status.CANCELLED
        engagement.save(update_fields=("status", "updated_at"))
    invitation_id = booking.accepted_invitation_id
    booking.status = RateCardBooking.Status.MATCHING
    booking.accepted_invitation = None
    booking.hold_expires_at = None
    booking.confirmed_at = None
    # **The entitlement, which is the half of §4c's promise that was unreachable until Wave C6.**
    # "Refunds in full (free re-dispatch)" has two halves and only the first was built: the refund
    # left the fee slot occupied, so the replacement lead's acceptance could not write a fee row,
    # the checkout refused with "already settled", and `complete_booking_fee` — the only path that
    # opened an engagement — never ran. Granting it here, in the same transaction as the refund,
    # is what makes the second half reachable: `accept_crew_offer` reads it and confirms the
    # replacement crew at no charge.
    booking.free_redispatch_entitled_at = timezone.now()
    booking.free_redispatch_consumed_at = None
    booking.redispatch_count += 1
    booking.save(
        update_fields=(
            "status",
            "accepted_invitation",
            "hold_expires_at",
            "confirmed_at",
            "free_redispatch_entitled_at",
            "free_redispatch_consumed_at",
            "redispatch_count",
            "updated_at",
        )
    )
    if invitation_id is not None:
        matching.withdraw_invitation(invitation_id=invitation_id, reason_code=REASON_VENDOR_NO_SHOW)
    requirement = CustomerRequirement.objects.select_for_update().get(pk=requirement_id)
    if requirement.status == CustomerRequirement.Status.ENGAGED:
        requirement.status = CustomerRequirement.Status.MATCHING
        requirement.save(update_fields=("status", "updated_at"))
        services.record_transition(
            requirement=requirement,
            from_status=CustomerRequirement.Status.ENGAGED,
            to_status=CustomerRequirement.Status.MATCHING,
            actor=None,
            reason_code="vendor_no_show_free_redispatch",
        )
    enqueue_outbox_event(
        aggregate_type="requirement",
        aggregate_id=requirement.id,
        event_type="m2.crew.vendor_no_show",
        idempotency_key=f"crew-vendor-no-show:{booking.id}:{invitation_id}",
        payload={
            "requirement_id": str(requirement.id),
            "rate_card_booking_id": str(booking.id),
            "vendor_invitation_id": str(invitation_id) if invitation_id else None,
        },
    )
    crew_dispatch.advance_cascade(requirement_id=requirement.id)


def _redispatch_entitlement_is_live(booking: RateCardBooking) -> bool:
    """Whether this booking is owed a replacement crew at no charge."""
    return (
        booking.free_redispatch_entitled_at is not None
        and booking.free_redispatch_consumed_at is None
    )


@transaction.atomic
def confirm_free_redispatch(*, booking_id: uuid.UUID) -> BookingFee | None:
    """Confirm a replacement crew at no charge, and reopen the engagement (`M2-BE-719`).

    **The completion of §4c's "refunds in full (free re-dispatch)".** Everything before this
    existed: the refund, the standing hit, the cascade going out again, a lead accepting. What did
    not exist was any way for that acceptance to become a confirmed crew, because the only
    engagement-opening path ran off a verified booking-fee callback and there is — correctly — no
    second payment to make.

    So this is the money decision C4 deferred, taken explicitly: **Vsolve earns nothing on a
    booking whose first crew did not turn up.** The fee is refunded whole, the replacement is
    confirmed at no charge, and `WAIVED` records the confirmation without pretending money moved.
    The alternative readings were both worse — charging again is not "free", and reversing the
    refund would take back money the Customer has already been told is theirs.

    Called from `crew_dispatch.accept_crew_offer` rather than from a route: there is nothing for
    the Customer to do, and an endpoint here would be an endpoint that confirms a crew without
    anybody paying, which is the shape every guard on this path exists to make unreachable.
    Returns `None` when there is no entitlement to spend, so the caller stays a plain read.
    """
    booking = (
        RateCardBooking.objects.select_for_update(of=("self",))
        .select_related("requirement")
        .get(pk=booking_id)
    )
    if not _redispatch_entitlement_is_live(booking):
        return None
    if booking.status != RateCardBooking.Status.OFFER_HELD:
        return None
    invitation_id = booking.accepted_invitation_id
    if invitation_id is None:  # pragma: no cover - `OFFER_HELD` always carries one
        return None

    now = timezone.now()
    fee = (
        BookingFee.objects.select_for_update()
        .filter(booking=booking)
        .exclude(status__in=BookingFee.NON_BLOCKING_STATUSES)
        .first()
    )
    if fee is not None and fee.status == BookingFee.Status.WAIVED:
        return fee
    if fee is not None and fee.status != BookingFee.Status.OFFER_ACCEPTED:
        # A charge is in flight or already settled on this booking. Never overwrite money.
        return None
    if fee is None:
        fee = BookingFee(
            booking=booking,
            requirement_id=booking.requirement_id,
            invitation_id=invitation_id,
            rate_card_id=booking.rate_card_id,
            amount_paise=booking.booking_fee_paise,
        )
    fee.invitation_id = invitation_id
    fee.status = BookingFee.Status.WAIVED
    fee.settled_at = now
    fee.settlement_reason_code = "free_redispatch"
    fee.save()

    booking.status = RateCardBooking.Status.CONFIRMED
    booking.confirmed_at = now
    booking.hold_expires_at = None
    booking.free_redispatch_consumed_at = now
    booking.save(
        update_fields=(
            "status",
            "confirmed_at",
            "hold_expires_at",
            "free_redispatch_consumed_at",
            "updated_at",
        )
    )
    engagements.reopen_rate_card_engagement(booking_id=booking.id)
    services.record_transition(
        requirement=booking.requirement,
        from_status=booking.requirement.status,
        to_status=booking.requirement.status,
        actor=None,
        reason_code="free_redispatch_confirmed",
        reason=f"booking_fee:{fee.id} waived; invitation:{invitation_id}",
    )
    enqueue_outbox_event(
        aggregate_type="requirement",
        aggregate_id=booking.requirement_id,
        event_type="m2.booking_fee.waived",
        idempotency_key=f"booking-fee-waived:{fee.id}",
        payload={
            "requirement_id": str(booking.requirement_id),
            "rate_card_booking_id": str(booking.id),
            "booking_fee_id": str(fee.id),
            "vendor_invitation_id": str(invitation_id),
        },
    )
    return fee


def _close_booking(
    *, requirement: CustomerRequirement, actor: User | None, reason_code: str
) -> None:
    booking = (
        RateCardBooking.objects.select_for_update(of=("self",))
        .filter(requirement=requirement)
        .first()
    )
    if booking is not None and booking.status != RateCardBooking.Status.CANCELLED:
        booking.status = RateCardBooking.Status.CANCELLED
        booking.hold_expires_at = None
        booking.save(update_fields=("status", "hold_expires_at", "updated_at"))
    engagement = Engagement.objects.filter(requirement=requirement).first()
    if engagement is not None and engagement.status in (
        Engagement.Status.PENDING_START,
        Engagement.Status.ACTIVE,
    ):
        engagement.status = Engagement.Status.CANCELLED
        engagement.save(update_fields=("status", "updated_at"))
    if requirement.status not in CustomerRequirement.CLOSED_STATUSES:
        from_status = requirement.status
        requirement.status = CustomerRequirement.Status.CLOSED_CANCELLED
        requirement.closed_at = timezone.now()
        requirement.closed_reason_code = reason_code
        requirement.save(update_fields=("status", "closed_at", "closed_reason_code", "updated_at"))
        services.record_transition(
            requirement=requirement,
            from_status=from_status,
            to_status=requirement.status,
            actor=actor,
            reason_code=reason_code,
        )


def _locked_fee(requirement_id: uuid.UUID) -> BookingFee:
    fee = (
        BookingFee.objects.select_for_update(of=("self",))
        .select_related("invitation__partner", "booking")
        .filter(requirement_id=requirement_id)
        .exclude(status=BookingFee.Status.FAILED)
        .order_by("-created_at")
        .first()
    )
    # `FAILED` only, deliberately, and **not** `NON_BLOCKING_STATUSES`: a refunded fee is still the
    # fee this requirement had, and the settlement commands need to find it in order to answer
    # "already settled" rather than "there is no booking fee on this request". The constraint
    # excludes `REFUNDED` because a refunded row must not block a *second* row; that is a different
    # question from whether a reader can still see it.
    if fee is None:
        raise BookingFeeNotChargeableError("There is no booking fee on this request.")
    return fee


# ---------------------------------------------------------------------------
# Sweep selectors
# ---------------------------------------------------------------------------


def unearned_fee_requirement_ids_for_expiry() -> list[uuid.UUID]:
    """Requirements that closed with a booking fee still unearned.

    §1: `* → CLOSED_EXPIRED` refunds any unearned booking fee in full. Selected rather than swept
    inline because the closure command belongs to `services` and a refund adapter timing out must
    not stop a requirement from closing.
    """
    return list(
        BookingFee.objects.filter(
            status=BookingFee.Status.ACTIVE,
            requirement__status__in=CustomerRequirement.CLOSED_STATUSES,
        )
        .values_list("requirement_id", flat=True)
        .distinct()
    )


def held_travel_compensation_fee_ids() -> list[uuid.UUID]:
    """Forfeit payouts still waiting on the lead's bank details.

    The booking-fee twin of `access.held_visit_payout_share_ids`, and it exists for the same
    structural reason: `payouts.release_payout_hold` resolves an entry **by Booking**, and a
    travel-compensation earning has none.
    """
    return list(
        BookingFee.objects.filter(
            status=BookingFee.Status.FORFEIT_SPLIT,
            ledger_entry__isnull=False,
            ledger_entry__status=PartnerLedgerEntry.Status.PENDING,
        ).values_list("id", flat=True)
    )


@transaction.atomic
def release_travel_compensation_hold(*, booking_fee_id: uuid.UUID) -> PartnerLedgerEntry | None:
    """Make one forfeit payout payable once the lead's account is verified. Idempotent by state."""
    fee = (
        BookingFee.objects.select_for_update(of=("self",))
        .select_related("ledger_entry", "invitation__partner")
        .get(pk=booking_fee_id)
    )
    entry = fee.ledger_entry
    if entry is None or entry.status != PartnerLedgerEntry.Status.PENDING:
        return entry
    if payable_account(fee.invitation.partner) is None:
        return entry
    entry.status = PartnerLedgerEntry.Status.AVAILABLE
    entry.save(update_fields=("status", "updated_at"))
    return entry


def crew_offer_holder(requirement: CustomerRequirement) -> VendorInvitation | None:
    """The invitation currently holding this job, for the read that has to name a deadline."""
    booking = RateCardBooking.objects.filter(requirement=requirement).first()
    if booking is None or booking.accepted_invitation_id is None:
        return None
    return VendorInvitation.objects.filter(pk=booking.accepted_invitation_id).first()
