"""The A3 rate-card front door: book at the published rate, then cascade to leads.

**This is a caller, not a second dispatch engine.** ADR-0009 is explicit that the platform already
owns the machinery an instant product needs, and every piece of it is reused here rather than
rebuilt:

* **Candidate eligibility and ranking** is `matching.evaluate_candidates`. It already classifies the
  pool, names every exclusion and scores prior relationship, distance band and least-recent
  invitation. A second pool would rank the same vendors differently on the same day.
* **The invitation state machine** is `matching.accept_invitation` / `decline_invitation` /
  `expire_invitation`. `07-state-machines-and-permissions.md` §2 says the crew offer *is* that
  machine minus `QUOTED`; slot accounting, cluster conflict and the capacity check all live there.
* **The vendor's diary** is `matching.committed_capacity_partner_ids`, which reads M2's own
  `CapacityHold` **and** the M1 `assignments.Reservation` grid — so a lead holding a Saturday A1
  job is not offered a Saturday crew job.
* **One invitation per beneficial owner** is `matching.cluster_key`, the global crew-identity
  check. Two accounts of one agency racing for the same job is the failure it exists to catch.
* **The soft capacity hold** is the `CapacityHold` `matching.accept_invitation` takes — sized
  against the requested crew, and deliberately not a hard `Reservation`; see `accept_crew_offer`.

What this module genuinely adds is the *clock* and the *shape*: minutes-level offer timeouts on
the M1 dispatch convention instead of business-hours deadlines, one slot instead of three, a
roster gate, an offer that carries the lead's own number, and an honest degradation to the quote
flow when the cascade runs out.

Nothing here charges anybody. `fall_back_to_quote_flow` in particular is free by construction:
there is no money on a rate-card booking until a lead has accepted and the Customer has paid the
booking fee, which is `booking_fees.py`.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from django.db import models, transaction
from django.utils import timezone

from apps.catalog.models import ServiceVariant
from apps.foundation.services import enqueue_outbox_event
from apps.identity.models import User
from apps.partners.models import (
    PartnerCapability,
    PartnerCrewMembership,
    PartnerProfile,
)
from apps.requirements import crew_brief, matching, purchase_gates, rate_cards, services
from apps.requirements.exceptions import (
    InvitationTransitionError,
    LifecycleNotSupportedError,
    PolicyUnavailableError,
    RateCardUnavailableError,
    RequirementTransitionError,
    RosterInsufficientError,
)
from apps.requirements.models import (
    CustomerRequirement,
    RateCard,
    RateCardAcceptance,
    RateCardBooking,
    VendorInvitation,
)

A3 = ServiceVariant.BookingArchetype.A3_TIME_BLOCK

#: How far back the decline-rate alarm looks. A day, because ADR-0009's failure mode is a rate that
#: went stale *this week* and a window long enough to smooth that out is a monthly report wearing
#: an alarm's clothes.
#:
#: Lives here rather than in `tasks.py` since Wave C7: the sweep is no longer the only reader.
#: `M2-BE-806` publishes the same numbers to Operations, and a screen showing a rate over one window
#: beside a threshold that pages on another is worse than no screen.
DECLINE_ALARM_WINDOW_HOURS = 24


# ---------------------------------------------------------------------------
# The roster gate
# ---------------------------------------------------------------------------


def verified_roster_size(partner: PartnerProfile) -> int:
    """How many **verified** crew members this lead can actually field.

    `documents_verified_at` rather than a raw `ACTIVE` count. An unverified membership is a name
    somebody typed, and dispatching a crew on names defeats the identity clustering that stops one
    worker being promised through two agencies. `matching`'s own `CREW_TOO_SMALL` exclusion counts
    active memberships, which is right for a *quote* — a vendor composing an offer can still be
    verifying people — and wrong for an instant booking that confirms a crew today.
    """
    return PartnerCrewMembership.objects.filter(
        partner=partner,
        status=PartnerCrewMembership.Status.ACTIVE,
        documents_verified_at__isnull=False,
    ).count()


def _leads_with_roster(
    *, candidates: tuple[PartnerProfile, ...], headcount: int
) -> list[PartnerProfile]:
    """Keep only the leads whose verified roster covers the whole headcount.

    ADR-0009 forbids aggregating strangers from several vendors: it produces no accountable party,
    no common language and a Customer forced to play site supervisor. So the filter is per lead and
    never a running total across the wave. A one-helper job is a lead with a roster of one.
    """
    return [partner for partner in candidates if verified_roster_size(partner) >= headcount]


# ---------------------------------------------------------------------------
# `book_at_published_rate` (`M2-BE-430`)
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class RateCardBookingResult:
    booking: RateCardBooking
    requirement: CustomerRequirement
    invitations: list[VendorInvitation]


@transaction.atomic
def book_at_published_rate(
    *,
    requirement_id: uuid.UUID,
    actor: User,
    allow_duplicate: bool = False,
) -> RateCardBookingResult:
    """Submit an A3 preset at the published rate and start the cascade, in one step.

    The rate and its inclusion list are shown **before** this runs — `preview_published_rate` is
    the read the booking screen uses — and frozen onto the booking here, so a card loaded between
    the screen and the tap cannot silently become what the Customer agreed to.

    Refuses with `m2_rate_card_unavailable` when no card is live for the city and skill, and the
    caller routes the Customer to the quote flow. That refusal is the guard
    `07-state-machines-and-permissions.md` §1 puts on `DRAFT → MATCHING` for A3, and it is the
    difference between an instant product that degrades honestly and one that promises a crew it
    has no price for.
    """
    requirement = (
        CustomerRequirement.objects.select_for_update(of=("self",))
        .select_related("configuration", "service_area", "variant")
        .get(pk=requirement_id)
    )
    if requirement.archetype != A3:
        raise LifecycleNotSupportedError(
            "Only workforce requests can be booked at a published day rate.",
        )
    if requirement.status != CustomerRequirement.Status.DRAFT:
        raise RequirementTransitionError("This request has already been sent to vendors.")
    # `M2-BE-810`, and the earliest of the three gated doors. Refused here, no lead's phone rings
    # for a job that is about to be turned down, and the Customer keeps a `DRAFT` they can submit
    # the moment Operations releases the switch — nothing they typed is thrown away.
    purchase_gates.assert_new_purchase_allowed(requirement, door="a3_instant_booking")

    card = rate_cards.rate_card_for_requirement(requirement)
    # Reading the preset schema before submitting is a guard, not a formality: an instant booking
    # against a variant with no price-moving facts is the on-site renegotiation with a receipt.
    rate_cards.preset_question_schema(requirement)
    headcount, days = rate_cards.preset_size(requirement)
    quote = rate_cards.quote_at_published_rate(card=card, headcount=headcount, days=days)
    policy = rate_cards.cascade_policy(requirement)

    # Submitting through the ordinary command keeps one submission path: duplicate detection, scope
    # validation, the SLA stamps and the `m2.requirement.submitted` outbox event are all its job,
    # and a second submit here would be a second set of rules for the same act.
    requirement = services.submit_requirement(
        requirement=requirement,
        actor=actor,
        allow_duplicate=allow_duplicate,
    )

    booking = RateCardBooking.objects.create(
        requirement=requirement,
        rate_card=card,
        headcount=headcount,
        days=days,
        day_rate_paise=quote.day_rate_paise,
        worker_day_wage_paise=card.worker_day_wage_paise,
        supervision_margin_paise=card.supervision_margin_paise,
        booking_fee_component_paise=card.booking_fee_paise,
        standard_day_hours=card.standard_day_hours,
        overtime_hourly_paise=card.overtime_hourly_paise,
        add_on_rates=dict(card.add_on_rates),
        inclusions=list(card.inclusions),
        total_customer_paise=quote.total_customer_paise,
        lead_receipt_paise=quote.lead_receipt_paise,
        booking_fee_paise=quote.booking_fee_paise,
    )
    services.record_transition(
        requirement=requirement,
        from_status=requirement.status,
        to_status=requirement.status,
        actor=actor,
        reason_code="booked_at_published_rate",
        reason=(
            f"rate_card:{card.id} {headcount}x{days} at {quote.day_rate_paise} paise/worker-day; "
            f"booking fee {quote.booking_fee_paise} paise"
        ),
    )
    invitations = _invite_crew_wave(booking=booking, policy=policy)
    return RateCardBookingResult(booking=booking, requirement=requirement, invitations=invitations)


@dataclass(frozen=True, slots=True)
class RatePreview:
    """The published rate and its terms, for the screen the Customer reads before booking."""

    card: RateCard
    quote: rate_cards.RateQuote
    inclusions: list[str]
    add_on_rates: dict[str, int]
    standard_day_hours: int
    overtime_hourly_paise: int


def preview_published_rate(
    requirement: CustomerRequirement,
    *,
    headcount: int | None = None,
    days: int | None = None,
) -> RatePreview:
    """What instant booking would cost, before anybody commits to anything.

    Raises the same refusals the command does, deliberately. A preview that quietly answered
    "unavailable" where the command would refuse for a different reason is how a screen ends up
    offering a button that cannot work.

    ## Why a size may be passed in

    The A3 booking screen puts the price beside the form and recalculates it as the Customer
    changes how many people they need. Pricing only the *saved* draft would mean a write on every
    press of a stepper, and — worse — a client that wanted to avoid those writes would have to
    multiply a day rate by a headcount in the browser to keep up. That is the one thing the rate
    disclosure may never do, because a figure this platform did not calculate is a figure it
    cannot stand behind.

    So the size is an argument. Both parts or neither: a headcount without days is not a job, and
    silently pairing one supplied number with one stored one would price something the Customer
    never described. Absent both, the saved preset answers, exactly as before.

    **This prices; it does not book.** `book_at_published_rate` still reads
    `rate_cards.preset_size` from the stored draft, so a size previewed here and never saved can
    never become a purchase.
    """
    card = rate_cards.rate_card_for_requirement(requirement)
    if headcount is None or days is None:
        headcount, days = rate_cards.preset_size(requirement)
    return RatePreview(
        card=card,
        quote=rate_cards.quote_at_published_rate(card=card, headcount=headcount, days=days),
        inclusions=list(card.inclusions),
        add_on_rates=dict(card.add_on_rates),
        standard_day_hours=card.standard_day_hours,
        overtime_hourly_paise=card.overtime_hourly_paise,
    )


# ---------------------------------------------------------------------------
# The cascade (`M2-BE-431`)
# ---------------------------------------------------------------------------


def _invite_crew_wave(
    *, booking: RateCardBooking, policy: rate_cards.CascadePolicy
) -> list[VendorInvitation]:
    """One bounded wave of crew offers, on the M1 dispatch clock.

    Three differences from `matching.invite_wave`, and all three are ADR-0009's:

    1. **The deadline is `now + offer_timeout_seconds`**, not a business-hours SLA. A crew offer
       that expires at nine tomorrow morning is not an instant product, and the M1 dispatch clock
       — minutes, wall time — is the one A1 technicians already answer on.
    2. **The pool is narrowed to leads whose verified roster covers the headcount.**
    3. **The wave widens** as it goes: wave *n* offers to `wave_size + (n - 1) * widening_step`
       leads, so thin supply is met by reaching further rather than by waiting longer.

    Everything else — eligibility, ranking, the snapshot, one invitation per beneficial owner — is
    `matching`'s, unchanged.
    """
    requirement = booking.requirement
    if booking.status != RateCardBooking.Status.MATCHING:
        return []

    evaluation = matching.evaluate_candidates(requirement=requirement)
    leads = _leads_with_roster(candidates=evaluation.ordered, headcount=booking.headcount)
    if not leads:
        return []

    snapshot = matching.snapshot_requirement(requirement)
    provenance = evaluation.provenance(requirement=requirement)
    wave = booking.wave + 1
    size = policy.wave_size + (wave - 1) * policy.widening_step
    responds_by = timezone.now() + timedelta(seconds=policy.offer_timeout_seconds)

    chosen: list[PartnerProfile] = []
    seen_clusters: set[str] = set()
    for partner in leads:
        key = matching.cluster_key(partner)
        if key in seen_clusters:
            continue
        seen_clusters.add(key)
        chosen.append(partner)
        if len(chosen) >= size:
            break

    invitations = [
        VendorInvitation.objects.create(
            requirement=requirement,
            partner=partner,
            snapshot=snapshot,
            cluster_key=matching.cluster_key(partner),
            wave=wave,
            responds_by=responds_by,
            ranking_provenance=provenance,
        )
        for partner in chosen
    ]
    booking.wave = wave
    booking.save(update_fields=("wave", "updated_at"))
    return invitations


@dataclass(frozen=True, slots=True)
class CascadeProgress:
    """How far the search has got, for the Customer who is watching it.

    The waiting screen used to be able to say only "we have widened the search", because `wave` was
    the single number published and a wave count on its own answers neither of the two questions
    somebody staring at that screen actually has: *is anything happening*, and *how long does this
    go on for*. Both are knowable — the cascade's shape is owner configuration and the offers are
    rows — and neither was ever put on the wire.

    So: how many leads are holding this offer right now, how many waves there are in total, and
    when the current one times out. That last is the honest version of "we widen the search on our
    own": the next wave fires when the current offers expire, and the Customer can see when.

    **It is deliberately not on `RateCardBooking`.** That serializer is the purchase snapshot,
    frozen at the rate it was made at; this changes every time an offer is sent or lapses, and
    mixing live dispatch state into a frozen record is how a screen starts showing one as the
    other.
    """

    #: The wave that is out now. 1 is the first, smallest one.
    wave: int
    #: How many waves run before the request falls back to quotes.
    total_waves: int
    #: Leads holding an offer in the current wave — "12 supervisors have this job".
    offers_out: int
    #: When the current wave's offers expire, which is when the next one goes out. `None` once
    #: the last wave is out, because there is no next one to name.
    next_wave_at: datetime | None


def cascade_progress(booking: RateCardBooking) -> CascadeProgress | None:
    """The live cascade, or `None` when there is no live cascade to describe.

    `None` in three cases that are one fact to the reader: the booking is not out to the market
    (it is held, confirmed, cancelled or fell back), the variant's cascade policy is unset — in
    which case the instant path is not open at all and this refuses rather than inventing a wave
    count — or the wave has gone out but its invitations are not visible for some reason.
    """
    if booking.status != RateCardBooking.Status.MATCHING:
        return None
    try:
        policy = rate_cards.cascade_policy(booking.requirement)
    except PolicyUnavailableError:
        # Fail closed, exactly as every other reader of this configuration does. A wave count
        # guessed from a default would describe a cascade nobody configured.
        return None

    current = VendorInvitation.objects.filter(
        requirement_id=booking.requirement_id,
        wave=booking.wave,
    )
    # The wave's deadline is the latest of its own offers': they are all created together with the
    # same `responds_by`, and taking the maximum survives a wave that was topped up.
    deadline = current.aggregate(models.Max("responds_by"))["responds_by__max"]

    return CascadeProgress(
        wave=booking.wave,
        total_waves=policy.max_waves,
        offers_out=current.filter(status=VendorInvitation.Status.INVITED).count(),
        next_wave_at=deadline if booking.wave < policy.max_waves else None,
    )


@dataclass(frozen=True, slots=True)
class CrewOffer:
    """One offer as the lead sees it. **Always carries their own number** (`M2-BE-435`).

    ADR-0009: "the offer screen always shows the vendor's own number — what they receive per day
    for the requested crew, paid directly by the customer at day end". The Customer's
    all-inclusive rate is deliberately absent: it contains this platform's booking fee, and
    showing a lead a number they do not receive is how a rate card starts an argument on site.
    """

    invitation: VendorInvitation
    booking: RateCardBooking
    headcount: int
    days: int
    lead_day_receipt_paise: int
    lead_total_receipt_paise: int
    standard_day_hours: int
    overtime_hourly_paise: int
    inclusions: list[str]
    responds_by: datetime | None
    verified_roster_size: int
    #: What the Customer actually asked for, in the catalogue's words — the occasion, the roles,
    #: the dress code. Without it a lead accepts a headcount and a day count and learns on site
    #: whether it was a wedding or a demolition. See `crew_brief`.
    brief: list[crew_brief.BriefLine]


def crew_offer_for(invitation: VendorInvitation) -> CrewOffer | None:
    """Project one invitation as a crew offer, or `None` when it is an ordinary quote enquiry."""
    booking = (
        RateCardBooking.objects.filter(requirement_id=invitation.requirement_id)
        .select_related("rate_card")
        .first()
    )
    if booking is None:
        return None
    return CrewOffer(
        invitation=invitation,
        booking=booking,
        headcount=booking.headcount,
        days=booking.days,
        lead_day_receipt_paise=booking.lead_day_receipt_paise,
        lead_total_receipt_paise=booking.lead_receipt_paise,
        standard_day_hours=booking.standard_day_hours,
        overtime_hourly_paise=booking.overtime_hourly_paise,
        inclusions=list(booking.inclusions),
        responds_by=invitation.responds_by,
        verified_roster_size=verified_roster_size(invitation.partner),
        brief=crew_brief.brief_lines(invitation.requirement),
    )


@transaction.atomic
def accept_crew_offer(*, invitation_id: uuid.UUID) -> RateCardBooking:
    """A lead takes the job at the published rate. First accept wins.

    Order matters and is the reason this reads as a caller rather than a rewrite:

    1. **The roster gate first.** `m2_roster_insufficient` when the lead's verified roster is
       smaller than the headcount, checked under the invitation's own lock so a member archived a
       second ago cannot be counted.
    2. **`matching.accept_invitation` second**, which does the work that is not this module's:
       slot accounting (one slot on a rate-card requirement, so the second lead to arrive is
       refused by `m2_invitation_slots_exhausted` rather than by a race), the cluster conflict
       check, the vendor's own diary across both `CapacityHold` and the A1 reservation grid, and
       the **soft capacity hold** sized to the requested crew.
    3. **The hold last.** The booking moves to `OFFER_HELD` with an expiry, which is what makes
       "the accepted offer is held while the Customer pays" true. §4c: if they never pay, the hold
       lapses harmlessly and the next offer or wave proceeds.

    The capacity hold is deliberately **soft** rather than an `assignments.Reservation`. A
    reservation's exclusion constraint forbids any overlap for a Partner, which is correct for one
    technician in one slot and wrong for an agency: a lead with twenty verified workers can
    legitimately run two four-worker jobs on one Saturday, and a hard hold would refuse the second
    for no reason anybody could explain.

    Accepting also **records the rate-card acceptance** — accepting a job is accepting that rate
    for that job (ADR-0009), and the record is the evidence in the argument that sentence exists to
    settle.
    """
    invitation = (
        VendorInvitation.objects.select_for_update(of=("self",))
        .select_related("requirement__configuration", "partner")
        .get(pk=invitation_id)
    )
    requirement = invitation.requirement
    booking = (
        RateCardBooking.objects.select_for_update(of=("self",))
        .select_related("rate_card")
        .filter(requirement=requirement)
        .first()
    )
    if booking is None:
        raise LifecycleNotSupportedError(
            "This enquiry is a quote request, not an instant crew booking.",
        )
    if booking.status not in RateCardBooking.DISPATCHABLE_STATUSES:
        raise InvitationTransitionError("This job is no longer open.")
    if booking.status == RateCardBooking.Status.OFFER_HELD:
        if booking.accepted_invitation_id == invitation.id:
            return booking
        raise InvitationTransitionError("Another crew already took this job.")

    if verified_roster_size(invitation.partner) < booking.headcount:
        raise RosterInsufficientError()

    policy = rate_cards.cascade_policy(requirement)
    matching.accept_invitation(invitation_id=invitation.id)

    booking.status = RateCardBooking.Status.OFFER_HELD
    booking.accepted_invitation = invitation
    booking.hold_expires_at = timezone.now() + timedelta(seconds=policy.hold_seconds)
    booking.save(update_fields=("status", "accepted_invitation", "hold_expires_at", "updated_at"))
    # §4c starts the fee at `OFFER_ACCEPTED`, and until this line nothing wrote that state — the
    # checkout constructed a row straight into `PENDING`, so `cancel_booking`'s
    # not-yet-paid branch could never be reached. Imported late because `booking_fees` imports this
    # module at module scope; this is the rarer direction and the one that runs once per accept.
    from apps.requirements import booking_fees  # noqa: PLC0415 — mutual import with this module

    booking_fees.hold_booking_fee(booking=booking, invitation=invitation)
    # `M2-BE-719`: a booking owed a free re-dispatch after a vendor no-show confirms **here**,
    # because there is nothing left for the Customer to pay. Returns `None` on every ordinary
    # acceptance, which is the overwhelming majority, and leaves the hold-then-checkout path
    # exactly as it was.
    redispatched = booking_fees.confirm_free_redispatch(booking_id=booking.id)
    if redispatched is not None:
        booking.refresh_from_db()
    record_rate_card_acceptance(
        partner=invitation.partner,
        variant_id=requirement.variant_id,
        card=booking.rate_card,
        source=RateCardAcceptance.Source.OFFER_ACCEPT,
        actor=None,
    )
    services.record_transition(
        requirement=requirement,
        from_status=requirement.status,
        to_status=requirement.status,
        actor=None,
        reason_code="crew_offer_accepted",
        reason=(
            f"invitation:{invitation.id} holds the job until {booking.hold_expires_at.isoformat()}"
            if booking.hold_expires_at is not None
            # A free re-dispatch confirms in the same breath as the acceptance, so there is no
            # hold and no deadline — the job is already this lead's.
            else f"invitation:{invitation.id} confirmed under a free re-dispatch"
        ),
    )
    enqueue_outbox_event(
        aggregate_type="requirement",
        aggregate_id=requirement.id,
        event_type="m2.crew_offer.accepted",
        idempotency_key=f"crew-offer-accepted:{invitation.id}",
        payload={
            "requirement_id": str(requirement.id),
            "rate_card_booking_id": str(booking.id),
            "vendor_invitation_id": str(invitation.id),
        },
    )
    return booking


@transaction.atomic
def decline_crew_offer(*, invitation_id: uuid.UUID, reason_code: str) -> VendorInvitation:
    """A lead passes. The reason is required and feeds the decline-rate alarm (`M2-BE-434`).

    ADR-0009 makes this load-bearing rather than polite: a rate below the street rate that week
    makes leads silently decline everything and the instant product dies quietly. A decline with no
    reason is a data point that cannot distinguish "your price is wrong" from "I am on holiday".
    """
    invitation = matching.decline_invitation(invitation_id=invitation_id, reason_code=reason_code)
    advance_cascade(requirement_id=invitation.requirement_id)
    return invitation


@transaction.atomic
def expire_crew_offer_and_advance(*, invitation_id: uuid.UUID) -> VendorInvitation:
    """Expire one unanswered crew offer and let the cascade move.

    Idempotent under overlapping sweeps for the reason `matching.expire_invitation_and_replace` is,
    and by the same mechanism: the requirement row is locked before the invitation is examined, so
    two ticks serialise and the second finds nothing to expire.
    """
    invitation = VendorInvitation.objects.select_related("requirement").get(pk=invitation_id)
    CustomerRequirement.objects.select_for_update().get(pk=invitation.requirement_id)
    locked = VendorInvitation.objects.select_for_update().get(pk=invitation_id)
    if locked.status != VendorInvitation.Status.INVITED:
        return locked
    matching.expire_invitation(invitation_id=locked.pk)
    advance_cascade(requirement_id=locked.requirement_id)
    return locked


@transaction.atomic
def advance_cascade(*, requirement_id: uuid.UUID) -> list[VendorInvitation]:
    """Send the next, wider wave — or fall back, once the configured threshold passes.

    Only runs when nothing is outstanding. A wave with a live offer in it is a lead still deciding,
    and widening on top of them would offer one job to a whole city at once.
    """
    requirement = (
        CustomerRequirement.objects.select_for_update(of=("self",))
        .select_related("configuration", "service_area")
        .get(pk=requirement_id)
    )
    booking = (
        RateCardBooking.objects.select_for_update(of=("self",))
        .filter(requirement=requirement)
        .first()
    )
    if booking is None or booking.status != RateCardBooking.Status.MATCHING:
        return []
    if requirement.status not in CustomerRequirement.LIVE_STATUSES:
        return []
    if VendorInvitation.objects.filter(
        requirement=requirement,
        status=VendorInvitation.Status.INVITED,
    ).exists():
        return []

    policy = rate_cards.cascade_policy(requirement)
    if booking.wave >= _wave_ceiling(booking=booking, policy=policy):
        exhaust_cascade(requirement_id=requirement.id, reason_code="cascade_exhausted")
        return []
    invitations = _invite_crew_wave(booking=booking, policy=policy)
    if not invitations:
        # The pool is empty at this width. Widening again would offer the job to nobody a second
        # time, so the honest move is to stop and say so — the Customer decides what happens to
        # their request rather than watching a holding state that will never resolve.
        exhaust_cascade(requirement_id=requirement.id, reason_code="no_eligible_leads")
    return invitations


def _wave_ceiling(*, booking: RateCardBooking, policy: rate_cards.CascadePolicy) -> int:
    """How far this booking may widen before it parks.

    Each retry buys another `max_waves` of reach **on top of** the waves already spent, rather than
    resetting the counter. That is what makes "search wider" mean something: a retry that started
    again from wave one would re-offer the job to the same nearest leads who already passed on it.
    """
    return policy.max_waves * (booking.retry_count + 1)


@transaction.atomic
def exhaust_cascade(*, requirement_id: uuid.UUID, reason_code: str) -> RateCardBooking:
    """The cascade ran out of reach. Park the booking and ask the Customer what next.

    **Nothing is decided here beyond stopping.** This used to be `fall_back_to_quote_flow`, which
    moved the Customer onto a different product — quotes, on a business-hours clock, from vendors
    naming their own prices — without asking whether that was what they wanted. The three ways out
    (`retry_cascade`, `choose_quote_flow`, `cancel_rate_card_booking`) are theirs to pick.

    Outstanding offers are **withdrawn**, not left to lapse. An offer for a job that is no longer
    being dispatched is an offer a lead can still open and press accept on, and the refusal they
    would get describes a race that did not happen. Withdrawing also empties the inbox of a job
    nobody took, which is what a lead expects to see.

    Free by construction: there is no money on a rate-card booking before `OFFER_HELD`, and this
    only runs while the booking is still `MATCHING`.
    """
    booking = (
        RateCardBooking.objects.select_for_update(of=("self",))
        .filter(requirement_id=requirement_id)
        .first()
    )
    if booking is None:
        raise RateCardUnavailableError("This request was not booked at a published rate.")
    if booking.status != RateCardBooking.Status.MATCHING:
        return booking

    booking.status = RateCardBooking.Status.EXHAUSTED
    booking.exhaustion_reason_code = reason_code
    booking.exhausted_at = timezone.now()
    booking.save(update_fields=("status", "exhaustion_reason_code", "exhausted_at", "updated_at"))
    _withdraw_outstanding_offers(requirement_id=requirement_id)
    requirement = CustomerRequirement.objects.get(pk=requirement_id)
    services.record_transition(
        requirement=requirement,
        from_status=requirement.status,
        to_status=requirement.status,
        actor=None,
        reason_code="rate_card_cascade_exhausted",
        reason=f"rate_card_booking:{booking.id} reason:{reason_code}; nothing was charged",
    )
    enqueue_outbox_event(
        aggregate_type="requirement",
        aggregate_id=requirement.id,
        event_type="m2.rate_card.exhausted",
        idempotency_key=f"rate-card-exhausted:{booking.id}:{booking.retry_count}",
        payload={
            "requirement_id": str(requirement.id),
            "rate_card_booking_id": str(booking.id),
            "reason_code": reason_code,
        },
    )
    return booking


def _withdraw_outstanding_offers(*, requirement_id: uuid.UUID) -> int:
    """Take every unanswered offer off the leads' inboxes.

    `expire_invitation` rather than a bare status write, so the invitation's own record says what
    happened to it and the decline-rate reading is not polluted by offers nobody was given a fair
    chance to answer.
    """
    outstanding = list(
        VendorInvitation.objects.select_for_update()
        .filter(requirement_id=requirement_id, status=VendorInvitation.Status.INVITED)
        .values_list("id", flat=True)
    )
    for invitation_id in outstanding:
        matching.expire_invitation(invitation_id=invitation_id)
    return len(outstanding)


@transaction.atomic
def fall_back_to_quote_flow(*, requirement_id: uuid.UUID, reason_code: str) -> RateCardBooking:
    """Hand the requirement to the quote flow. Recorded, explained, and **nothing charged**.

    Free by construction rather than by care: there is no money on a rate-card booking until a lead
    accepts and the Customer pays, and this only ever runs while the booking is still `MATCHING`.

    The requirement itself does not change state — §1 models this as
    `MATCHING → MATCHING (quote mode)` — so the Customer's request stays live and simply starts
    collecting quotes. `matching.invite_wave` takes over from here on the ordinary business-hours
    clock, which is the right clock for a quote and the wrong one for a crew.

    Reachable from `EXHAUSTED` as well as `MATCHING` since this stopped being automatic: it is now
    what the Customer picks when they would rather have quotes than keep looking for a crew. Any
    offer still outstanding is withdrawn first, because a crew offer and a quote request are two
    different products and a lead must not be able to accept the one the Customer just left.
    """
    booking = (
        RateCardBooking.objects.select_for_update(of=("self",))
        .filter(requirement_id=requirement_id)
        .first()
    )
    if booking is None:
        raise RateCardUnavailableError("This request was not booked at a published rate.")
    if booking.status not in (
        RateCardBooking.Status.MATCHING,
        RateCardBooking.Status.EXHAUSTED,
    ):
        return booking
    _withdraw_outstanding_offers(requirement_id=requirement_id)

    booking.status = RateCardBooking.Status.FELL_BACK
    booking.fallback_reason_code = reason_code
    booking.fell_back_at = timezone.now()
    booking.save(update_fields=("status", "fallback_reason_code", "fell_back_at", "updated_at"))
    requirement = CustomerRequirement.objects.get(pk=requirement_id)
    services.record_transition(
        requirement=requirement,
        from_status=requirement.status,
        to_status=requirement.status,
        actor=None,
        reason_code="fell_back_to_quote_flow",
        reason=f"rate_card_booking:{booking.id} reason:{reason_code}; nothing was charged",
    )
    enqueue_outbox_event(
        aggregate_type="requirement",
        aggregate_id=requirement.id,
        event_type="m2.rate_card.fell_back",
        idempotency_key=f"rate-card-fallback:{booking.id}",
        payload={
            "requirement_id": str(requirement.id),
            "rate_card_booking_id": str(booking.id),
            "reason_code": reason_code,
        },
    )
    if requirement.status in CustomerRequirement.LIVE_STATUSES:
        matching.invite_wave(requirement_id=requirement.id)
    return booking


# ---------------------------------------------------------------------------
# The Customer's three ways out of `EXHAUSTED`
# ---------------------------------------------------------------------------
#
# One shape for all three: lock the booking, refuse anything that is not parked, act, record. They
# are deliberately separate commands rather than one with a mode, because they are three different
# decisions with three different consequences and a single endpoint taking an action string would
# make "cancel" one typo away from "keep looking".


@transaction.atomic
def retry_cascade(*, requirement_id: uuid.UUID, actor: User) -> RateCardBooking:
    """Search wider at the same published rate.

    **The price does not move, and that is the design** (ADR-0009). The customer rate is an
    ops-published card sitting above a statutory wage floor, and the wage half of it is paid to the
    crew directly in cash at day end — money this platform never holds. A "pay more to get someone"
    button would therefore advertise a rate nobody could enforce, on top of §7's rule that a partner
    may never charge above the card. Thin supply is met by reaching further, which is what it
    usually needs.

    The wave counter is **not** reset. Restarting at wave one would re-offer the job to the same
    nearest leads who already passed on it, which is the one thing "try again" must not mean.
    """
    booking = _locked_recoverable_booking(requirement_id=requirement_id)
    policy = rate_cards.cascade_policy(booking.requirement)
    booking.retry_count += 1
    booking.status = RateCardBooking.Status.MATCHING
    booking.exhausted_at = None
    booking.exhaustion_reason_code = ""
    booking.save(
        update_fields=(
            "retry_count",
            "status",
            "exhausted_at",
            "exhaustion_reason_code",
            "updated_at",
        )
    )
    services.record_transition(
        requirement=booking.requirement,
        from_status=booking.requirement.status,
        to_status=booking.requirement.status,
        actor=actor,
        reason_code="rate_card_search_widened",
        reason=f"rate_card_booking:{booking.id} retry:{booking.retry_count} at the published rate",
    )
    invitations = _invite_crew_wave(booking=booking, policy=policy)
    if not invitations:
        # Still nobody in reach even one step wider. Park it again rather than leave the Customer
        # watching a cascade that has already run out — and say so through the same event, whose
        # idempotency key carries `retry_count` so this second parking is its own notification.
        return exhaust_cascade(requirement_id=requirement_id, reason_code="no_eligible_leads")
    return booking


@transaction.atomic
def choose_quote_flow(*, requirement_id: uuid.UUID, actor: User) -> RateCardBooking:
    """Take quotes instead of waiting for a crew. The Customer's own choice, now.

    A thin wrapper over `fall_back_to_quote_flow` rather than a second implementation: what happens
    is identical, and only *who decided* has changed. The reason code says which, so the two are
    distinguishable for the rest of the booking's life.
    """
    _locked_recoverable_booking(requirement_id=requirement_id)
    booking = fall_back_to_quote_flow(
        requirement_id=requirement_id, reason_code="customer_chose_quotes"
    )
    services.record_transition(
        requirement=booking.requirement,
        from_status=booking.requirement.status,
        to_status=booking.requirement.status,
        actor=actor,
        reason_code="rate_card_customer_chose_quotes",
        reason=f"rate_card_booking:{booking.id}; nothing was charged",
    )
    return booking


@transaction.atomic
def cancel_rate_card_booking(*, requirement_id: uuid.UUID, actor: User) -> RateCardBooking:
    """Stop looking altogether and close the request.

    Free, and provably so rather than by policy: `booking_fees` only ever writes a fee from
    `accept_crew_offer` onwards, and this refuses any status but `EXHAUSTED` — where, by
    definition, no lead ever accepted. A cancellation from `OFFER_HELD` is a different command with
    a real fee behind it (`booking_fees.cancel_booking`) and is deliberately not reachable here.
    """
    booking = _locked_recoverable_booking(requirement_id=requirement_id)
    booking.status = RateCardBooking.Status.CANCELLED
    booking.save(update_fields=("status", "updated_at"))
    _withdraw_outstanding_offers(requirement_id=requirement_id)
    # Through `close_requirement` rather than a status write: it stamps `closed_at` and
    # `closed_reason_code` together, which the closed-has-a-timestamp constraint requires, and
    # emits `m2.requirement.closed` so everything downstream of a closed request hears about it.
    services.close_requirement(
        requirement_id=requirement_id,
        status=CustomerRequirement.Status.CLOSED_CANCELLED,
        reason_code="rate_card_cancelled_by_customer",
        actor=actor,
    )
    return booking


def _locked_recoverable_booking(*, requirement_id: uuid.UUID) -> RateCardBooking:
    """The booking under its own lock, or the refusal that says why it cannot be recovered."""
    booking = (
        RateCardBooking.objects.select_for_update(of=("self",))
        .select_related("requirement")
        .filter(requirement_id=requirement_id)
        .first()
    )
    if booking is None:
        raise RateCardUnavailableError("This request was not booked at a published rate.")
    if booking.status not in RateCardBooking.RECOVERABLE_STATUSES:
        raise RequirementTransitionError(
            "This request is not waiting on you — it is still looking for a crew, or a crew "
            "already took it.",
        )
    return booking


@transaction.atomic
def release_expired_offer_hold(*, booking_id: uuid.UUID) -> RateCardBooking:
    """The Customer never paid, so the lead's Saturday goes back on the market.

    §4c: "the hold expires harmlessly; next offer or wave proceeds". Harmless is literal — no
    charge was made, an unpaid held fee is released with it, a fee with a payment attempt behind it
    is left in whatever state its provider put it, and the lead's standing is untouched because
    they did nothing wrong.

    Idempotent by state, like every other sweep command in this app.
    """
    booking = (
        RateCardBooking.objects.select_for_update(of=("self",))
        .filter(pk=booking_id)
        .select_related("requirement")
        .first()
    )
    if booking is None or booking.status != RateCardBooking.Status.OFFER_HELD:
        raise RequirementTransitionError("This job is not holding an offer.")
    invitation_id = booking.accepted_invitation_id
    booking.status = RateCardBooking.Status.MATCHING
    booking.accepted_invitation = None
    booking.hold_expires_at = None
    booking.save(update_fields=("status", "accepted_invitation", "hold_expires_at", "updated_at"))
    # The held fee goes with the hold. It only ever touches a row with no payment attempt behind
    # it, so nothing that reaches money can be reached from here.
    from apps.requirements import booking_fees  # noqa: PLC0415 — mutual import with this module

    booking_fees.release_held_booking_fee(booking=booking)
    if invitation_id is not None:
        # Penalty-free: §2's `ACCEPTED → WITHDRAWN` for a change the vendor did not cause. It also
        # releases the capacity hold, which is the half that matters to the lead.
        matching.withdraw_invitation(
            invitation_id=invitation_id, reason_code="booking_fee_not_paid"
        )
    advance_cascade(requirement_id=booking.requirement_id)
    return booking


# ---------------------------------------------------------------------------
# Rate-card acceptance at capability approval (`M2-BE-435`)
# ---------------------------------------------------------------------------


@transaction.atomic
def record_rate_card_acceptance(
    *,
    partner: PartnerProfile,
    variant_id: uuid.UUID,
    card: RateCard,
    source: str,
    actor: User | None,
) -> RateCardAcceptance | None:
    """Record that this lead has agreed to this published card, once.

    Returns `None` when the acceptance already exists — the row is immutable and the unique
    constraint on `(capability, rate_card)` is what makes "once" a database fact. Also `None` when
    the Partner has no capability on this variant, which is the case a wave should never reach and
    a re-driven outbox event legitimately can.
    """
    capability = PartnerCapability.objects.filter(
        partner=partner,
        variant_id=variant_id,
        status=PartnerCapability.Status.APPROVED,
    ).first()
    if capability is None:
        return None
    existing = RateCardAcceptance.objects.filter(capability=capability, rate_card=card).first()
    if existing is not None:
        return None
    return RateCardAcceptance.objects.create(
        partner=partner,
        capability=capability,
        rate_card=card,
        source=source,
        lead_day_receipt_paise=card.lead_day_receipt_paise,
        accepted_by=actor,
    )


@transaction.atomic
def record_acceptances_for_approved_capability(*, capability_id: uuid.UUID) -> int:
    """Record acceptance of every live card this newly-approved A3 capability can be offered at.

    Driven by the `m2.capability.approved` outbox event rather than called from
    `partners.capabilities`: `apps.requirements` imports `apps.partners`, so the reverse call would
    close an import cycle — the same reasoning `handle_capability_suspended` records.

    A capability approved for a city with no published card records nothing, and that is correct:
    there is no number to have agreed to yet, and the offer-accept path records the acceptance the
    moment there is.
    """
    capability = (
        PartnerCapability.objects.select_related("partner", "variant")
        .filter(pk=capability_id, status=PartnerCapability.Status.APPROVED)
        .first()
    )
    if capability is None or capability.archetype != A3:
        return 0
    configuration = (
        capability.variant.m2_configurations.filter(status="ACTIVE")
        .select_related("wage_floor_skill")
        .first()
    )
    if configuration is None or configuration.wage_floor_skill is None:
        return 0

    # The capability's own area scoping narrows the Partner's coverage and never widens it, so the
    # areas a card could be offered at are the intersection the matching guard already applies.
    area_ids = set(
        capability.partner.service_area_links.filter(is_active=True).values_list(
            "service_area_id", flat=True
        )
    )
    scoped = set(capability.service_areas.values_list("id", flat=True))
    if scoped:
        area_ids &= scoped

    recorded = 0
    today = timezone.localdate()
    for area_id in sorted(area_ids, key=str):
        card = (
            RateCard.objects.filter(
                service_area_id=area_id,
                skill=configuration.wage_floor_skill,
                effective_from__lte=today,
            )
            .order_by("-effective_from", "-created_at")
            .first()
        )
        if card is None:
            continue
        if (
            record_rate_card_acceptance(
                partner=capability.partner,
                variant_id=capability.variant_id,
                card=card,
                source=RateCardAcceptance.Source.CAPABILITY_APPROVAL,
                actor=capability.reviewed_by,
            )
            is not None
        ):
            recorded += 1
    return recorded


# ---------------------------------------------------------------------------
# The decline-rate alarm (`M2-BE-434`)
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class DeclineRate:
    """One card's decline rate over a window, and whether it should page Operations."""

    card: RateCard
    offers: int
    declines: int
    rate_basis_points: int
    threshold_basis_points: int
    breached: bool


def decline_rate_for_card(
    *, card: RateCard, since: datetime, policy: rate_cards.DeclineAlarmPolicy
) -> DeclineRate:
    """Declines as a share of answered offers on this card's bookings since a moment.

    The denominator is offers **sent**, not offers answered, and that is deliberate: a lead who
    ignores an offer until it expires is expressing the same thing as one who declines it, and a
    rate measured only over explicit declines would look healthy in exactly the market where every
    lead has silently stopped answering.
    """
    invitations = VendorInvitation.objects.filter(
        requirement__rate_card_booking__rate_card=card,
        created_at__gte=since,
    )
    counted = invitations.aggregate(
        offers=models.Count("id"),
        declines=models.Count(
            "id",
            filter=models.Q(
                status__in=(
                    VendorInvitation.Status.DECLINED,
                    VendorInvitation.Status.EXPIRED,
                )
            ),
        ),
    )
    offers = int(counted["offers"] or 0)
    declines = int(counted["declines"] or 0)
    rate = (declines * 10000 // offers) if offers else 0
    return DeclineRate(
        card=card,
        offers=offers,
        declines=declines,
        rate_basis_points=rate,
        threshold_basis_points=policy.threshold_basis_points,
        breached=offers >= policy.minimum_offers and rate > policy.threshold_basis_points,
    )


def _alarm_policy_for_card(card: RateCard) -> rate_cards.DeclineAlarmPolicy | None:
    """The alarm threshold configured on any active variant that uses this card's skill.

    A card is keyed on a city and a skill; the threshold is configured per variant, because that is
    where every other M2 policy clock lives. The first active configuration mapped to this skill
    decides, and two variants disagreeing about the same skill is a configuration error worth
    seeing rather than one worth silently averaging.
    """
    from apps.catalog.models import M2VariantConfiguration  # noqa: PLC0415 - import cycle

    configuration = (
        M2VariantConfiguration.objects.filter(
            status=M2VariantConfiguration.Status.ACTIVE,
            wage_floor_skill=card.skill,
        )
        .order_by("variant_id", "-version")
        .first()
    )
    if configuration is None:
        return None
    return rate_cards.decline_alarm_policy(configuration)


@dataclass(frozen=True, slots=True)
class DeclineReading:
    """One card's decline rate **and whether an alarm could fire on it at all** (`M2-BE-806`).

    `breached_decline_rates` answers only the cards that are alarming, which is the right shape for
    a sweep that pages people and the wrong shape for a screen. A screen that only ever receives
    breaches cannot distinguish three states that need three different sentences:

    * **armed and quiet** — a threshold is configured and the rate is under it. The only genuinely
      green state.
    * **not armed** — owner decision 13 is still open for this card's skill, so no alarm can ever
      fire. Rendering that as green would be a lie, and it is exactly what the Operations panel
      refused to do while there was no endpoint to ask.
    * **armed, quiet, and measuring nothing** — a threshold exists but too few offers have gone out
      for a rate to mean anything yet. `minimum_offers` is the knob that says so.

    So `armed` is published beside the numbers rather than inferred from them, and
    `threshold_basis_points` is nullable because an unarmed card genuinely has no threshold.
    """

    card: RateCard
    armed: bool
    offers: int
    declines: int
    rate_basis_points: int
    threshold_basis_points: int | None
    minimum_offers: int | None
    breached: bool


def decline_rate_readings(*, window_hours: int, at: datetime | None = None) -> list[DeclineReading]:
    """Every live card's decline rate, armed or not. The read behind the Operations alarm panel.

    Deliberately returns unarmed cards rather than filtering them out. The single most useful thing
    this endpoint can tell an operator on the day A3 supply starts failing is *"nothing here is
    watching"* — and a list that silently omitted the unconfigured cards would say the opposite by
    being short.
    """
    moment = at or timezone.now()
    since = moment - timedelta(hours=window_hours)
    readings: list[DeclineReading] = []
    for card in RateCard.objects.select_related("service_area", "skill").filter(
        effective_from__lte=moment.date()
    ):
        policy = _alarm_policy_for_card(card)
        if policy is None:
            # Counted with a real rate anyway. The measurement does not depend on the owner having
            # decided a threshold — only the judgement does — which is the same asymmetry
            # `pricing.operations_touch_budget` draws one module along.
            unarmed = decline_rate_for_card(
                card=card,
                since=since,
                policy=rate_cards.DeclineAlarmPolicy(threshold_basis_points=0, minimum_offers=0),
            )
            readings.append(
                DeclineReading(
                    card=card,
                    armed=False,
                    offers=unarmed.offers,
                    declines=unarmed.declines,
                    rate_basis_points=unarmed.rate_basis_points,
                    threshold_basis_points=None,
                    minimum_offers=None,
                    breached=False,
                )
            )
            continue
        reading = decline_rate_for_card(card=card, since=since, policy=policy)
        readings.append(
            DeclineReading(
                card=card,
                armed=True,
                offers=reading.offers,
                declines=reading.declines,
                rate_basis_points=reading.rate_basis_points,
                threshold_basis_points=reading.threshold_basis_points,
                minimum_offers=policy.minimum_offers,
                breached=reading.breached,
            )
        )
    return readings


def breached_decline_rates(*, window_hours: int, at: datetime | None = None) -> list[DeclineRate]:
    """Every live card whose decline rate is above its configured threshold.

    A card with no configured threshold is skipped rather than alarmed on — `decline_alarm_policy`
    answers `None` while owner decision 13 is open, and the honest consequence is that **no alarm
    fires**, recorded as a gap rather than papered over with an invented percentage.
    """
    moment = at or timezone.now()
    since = moment - timedelta(hours=window_hours)
    breached: list[DeclineRate] = []
    for card in RateCard.objects.select_related("service_area", "skill").filter(
        effective_from__lte=moment.date()
    ):
        policy = _alarm_policy_for_card(card)
        if policy is None:
            continue
        reading = decline_rate_for_card(card=card, since=since, policy=policy)
        if reading.breached:
            breached.append(reading)
    return breached


# ---------------------------------------------------------------------------
# Sweep selectors. `tasks.py` decides only *when* to look.
# ---------------------------------------------------------------------------


def expired_crew_offer_ids(*, at: datetime | None = None) -> list[uuid.UUID]:
    """Crew offers past their minutes-level deadline, still unanswered.

    Deliberately separate from `matching.expired_invitation_ids`, which sweeps the *quote* flow and
    replaces one invitation with one other. A crew offer's recovery is the cascade widening, and
    routing it through the quote sweep would invite a replacement on a business-hours deadline.
    """
    moment = at or timezone.now()
    return list(
        VendorInvitation.objects.filter(
            status=VendorInvitation.Status.INVITED,
            responds_by__isnull=False,
            responds_by__lt=moment,
            requirement__rate_card_booking__status=RateCardBooking.Status.MATCHING,
        ).values_list("id", flat=True)
    )


def expired_offer_hold_booking_ids(*, at: datetime | None = None) -> list[uuid.UUID]:
    """Bookings whose accepted offer has been holding longer than the Customer had to pay."""
    moment = at or timezone.now()
    return list(
        RateCardBooking.objects.filter(
            status=RateCardBooking.Status.OFFER_HELD,
            hold_expires_at__isnull=False,
            hold_expires_at__lt=moment,
        ).values_list("id", flat=True)
    )


def stalled_rate_card_booking_ids(*, at: datetime | None = None) -> list[uuid.UUID]:
    """Bookings still matching with no live offer against them — the cascade needs a nudge.

    Every ordinary path calls `advance_cascade` directly; this exists for the ones that do not
    happen, which is the whole reason a watchdog exists. A wave whose last invitation was expired
    by the quote sweep, or a decline whose transaction rolled back after the invitation moved, both
    land here rather than stalling behind a holding state forever.
    """
    moment = at or timezone.now()
    return list(
        RateCardBooking.objects.filter(
            status=RateCardBooking.Status.MATCHING,
            requirement__status__in=CustomerRequirement.LIVE_STATUSES,
        )
        .exclude(
            requirement__invitations__status=VendorInvitation.Status.INVITED,
            requirement__invitations__responds_by__gte=moment,
        )
        .values_list("id", flat=True)
        .distinct()
    )
