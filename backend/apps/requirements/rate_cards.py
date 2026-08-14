"""The published A3 rate card: how it is read, how it is priced, and how it is published.

Revision 4 (ADR-0009) made this platform a price-setter for A3. That is a different obligation from
publishing somebody else's quote, and this module is where it is discharged:

* **A rate is loaded, never edited.** `RateCard` is effective-dated on the `M2AccessPrice` pattern,
  so a booking made last week reconciles against the number it was made at and raising a rate in
  wedding season is one insert. `07-state-machines-and-permissions.md` §7 forbids Operations
  backdating a card under a live booking, and `publish_rate_card` refuses one.
* **No card means no instant booking.** `m2_rate_card_unavailable`, never a guessed price. §1's
  guard is that A3 fails *closed to the quote flow* — the fallback still exists, so the honest
  outcome of an unpriced city is a slower product rather than an invented number.
* **The platform obeys its own wage rule.** The card's wage component passes
  `partners.assert_rate_meets_wage_floor` at publish, the same fail-closed guard vendor quotes
  pass, keyed on the same `(state_code, skill)` the floor is loaded under.

Everything else here is policy the owner has not decided (decisions 12 and 13) and is read from
`catalog.M2VariantConfiguration`, failing closed with `m2_policy_unavailable`. Each reader names
what stops working while its value is unset, because "not decided" costs something different in
each case and the consequence is the thing worth writing down.
"""

import uuid
from dataclasses import dataclass
from datetime import date

from django.db import transaction
from django.utils import timezone

from apps.catalog.models import M2VariantConfiguration, ServiceVariant
from apps.identity.models import User
from apps.locations.models import ServiceArea
from apps.partners.capabilities import assert_rate_meets_wage_floor
from apps.partners.exceptions import PartnerDomainError
from apps.partners.models import Skill
from apps.requirements.exceptions import (
    LifecycleNotSupportedError,
    PolicyUnavailableError,
    RateCardUnavailableError,
    RequirementTransitionError,
)
from apps.requirements.models import CustomerRequirement, RateCard, RateCardBooking

A3 = ServiceVariant.BookingArchetype.A3_TIME_BLOCK


# ---------------------------------------------------------------------------
# Reading a live card
# ---------------------------------------------------------------------------


def live_rate_card(
    *, service_area: ServiceArea, skill: Skill, on_day: date | None = None
) -> RateCard:
    """The card in force for this city and skill on a day, or a refusal.

    Newest `effective_from` that has arrived wins, exactly as `pricing._effective_price` and
    `partners.live_wage_floor` resolve theirs. One flat rate per city per skill — ADR-0009 rules
    out zones and surge until data forces them, and a demand multiplier, if ever added, is
    displayed rather than applied silently, which a second effective-dated row cannot express and
    therefore cannot accidentally become.
    """
    card = (
        RateCard.objects.filter(
            service_area=service_area,
            skill=skill,
            effective_from__lte=on_day or timezone.localdate(),
        )
        .order_by("-effective_from", "-created_at")
        .first()
    )
    if card is None:
        raise RateCardUnavailableError()
    return card


def _configuration(requirement: CustomerRequirement) -> M2VariantConfiguration:
    configuration = requirement.configuration
    if configuration is None:
        raise PolicyUnavailableError(
            "This service has no active configuration, so we cannot apply its rules yet.",
        )
    return configuration


def rate_card_skill(configuration: M2VariantConfiguration) -> Skill:
    """Which statutory skill this variant's rate card is keyed on.

    Deliberately `wage_floor_skill` and not `ServiceVariant.required_skill_code`. ADR-0009 says so
    outright, and `M2-BE-317` already established the reason: the required-skill code is the
    *dispatch trade slug*, matched against `PartnerSkill` to decide who can be sent, so reusing it
    would tie a published price and a statutory floor to a merchandising decision. Null is the
    honest representation of "Operations has not mapped this variant", and the card cannot be found
    without it.
    """
    skill = configuration.wage_floor_skill
    if skill is None:
        raise RateCardUnavailableError(
            "This service is not mapped to a wage classification yet, so we cannot publish a day "
            "rate for it.",
        )
    return skill


def rate_card_for_requirement(
    requirement: CustomerRequirement, *, on_day: date | None = None
) -> RateCard:
    """The card that prices this A3 requirement, or `m2_rate_card_unavailable`."""
    if requirement.archetype != A3:
        raise LifecycleNotSupportedError(
            "Only workforce requests are booked at a published day rate.",
        )
    area = requirement.service_area
    if area is None:
        raise RateCardUnavailableError(
            "We do not have a serviceable address for this request yet.",
        )
    return live_rate_card(
        service_area=area,
        skill=rate_card_skill(_configuration(requirement)),
        on_day=on_day,
    )


# ---------------------------------------------------------------------------
# The preset arithmetic
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class RateQuote:
    """What a Customer is shown **before** they book, and what the booking is frozen at.

    Every field is server-calculated from the card in integer paise. The reconciliation is the
    point: `total_customer_paise = lead_receipt_paise + booking_fee_paise`, so the two sentences on
    the two screens — "you pay the crew ₹X at day end" and "you pay us ₹Y now" — always add to the
    one number the Customer agreed to.
    """

    card: RateCard
    headcount: int
    days: int
    day_rate_paise: int
    lead_day_receipt_paise: int
    total_customer_paise: int
    lead_receipt_paise: int
    booking_fee_paise: int


def quote_at_published_rate(*, card: RateCard, headcount: int, days: int) -> RateQuote:
    """Price one preset against one card. Pure arithmetic over integers, no rounding anywhere.

    The booking fee is the card's fee **component** over the whole booking, headcount by days,
    because the component is one of three parts of a per-worker-per-day price. Charging it once per
    request instead would make the published day rate untrue for every booking except a one-worker,
    one-day one, and the all-inclusive number is the entire promise.
    """
    if headcount <= 0 or days <= 0:
        raise RequirementTransitionError("Tell us how many people you need, and for how long.")
    worker_days = headcount * days
    return RateQuote(
        card=card,
        headcount=headcount,
        days=days,
        day_rate_paise=card.customer_day_rate_paise,
        lead_day_receipt_paise=card.lead_day_receipt_paise * headcount,
        total_customer_paise=card.customer_day_rate_paise * worker_days,
        lead_receipt_paise=card.lead_day_receipt_paise * worker_days,
        booking_fee_paise=card.booking_fee_paise * worker_days,
    )


def preset_size(requirement: CustomerRequirement) -> tuple[int, int]:
    """Headcount and days, read from the preset answers the Customer already gave.

    The same two answer codes `matching._requested_days` and `engagements._a3_stages` read. A third
    place to say "how many workers" is a third place for them to disagree.
    """
    headcount = int(requirement.answers.get("worker_count") or 0)
    days = int(requirement.answers.get("duration_days") or 0)
    if headcount <= 0 or days <= 0:
        raise RequirementTransitionError(
            "Tell us how many people you need and for how many days before we can price this.",
        )
    return headcount, days


def preset_question_schema(requirement: CustomerRequirement) -> dict[str, object]:
    """The three or four price-moving facts this variant's preset asks for.

    Empty is a refusal rather than an empty form. A preset whose scope was never pinned down is
    exactly the "third floor, no lift? Extra, bhaiya" ADR-0009 exists to leave nowhere to live, and
    booking instantly against one would be the platform publishing a price for work it did not
    describe.
    """
    schema = _configuration(requirement).a3_preset_question_schema
    if not schema:
        raise PolicyUnavailableError(
            "This service has no instant-booking preset yet, so we will collect quotes instead.",
        )
    return dict(schema)


# ---------------------------------------------------------------------------
# Owner-blocked cascade and fee policy (decisions 12 and 13). All fail closed.
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class CascadePolicy:
    """The shape of the offer cascade, entirely owner-configured.

    Read as one object rather than five separate calls so a partially-configured cascade refuses
    once, with one message, instead of failing on whichever knob the code happened to read first.
    """

    wave_size: int
    widening_step: int
    offer_timeout_seconds: int
    max_waves: int
    hold_seconds: int


def cascade_policy(requirement: CustomerRequirement) -> CascadePolicy:
    """How wide the waves are, how fast they time out, and when the fallback runs.

    Every value is on the pre-phase decision list and none has a defensible default. An invented
    wave size decides how much of a small city's supply one request burns; an invented timeout
    decides how long a Customer stares at a holding state; an invented hold decides how long a
    lead's Saturday is off the market for a Customer who may never pay. Unset means the instant
    path is simply not open for this variant, and the quote flow is still there.
    """
    configuration = _configuration(requirement)
    wave_size = configuration.crew_wave_size
    widening_step = configuration.crew_wave_widening_step
    offer_timeout = configuration.crew_offer_timeout_seconds
    max_waves = configuration.crew_cascade_max_waves
    hold_seconds = configuration.crew_offer_hold_seconds
    if (
        wave_size is None
        or widening_step is None
        or offer_timeout is None
        or max_waves is None
        or hold_seconds is None
    ):
        raise PolicyUnavailableError(
            "We have not set up instant crew dispatch for this service yet, so we will collect "
            "quotes instead.",
        )
    if wave_size <= 0 or max_waves <= 0 or offer_timeout <= 0 or hold_seconds <= 0:
        raise PolicyUnavailableError(
            "Instant crew dispatch is misconfigured for this service. Support can help.",
        )
    return CascadePolicy(
        wave_size=wave_size,
        widening_step=widening_step,
        offer_timeout_seconds=offer_timeout,
        max_waves=max_waves,
        hold_seconds=hold_seconds,
    )


def free_cancel_hours(requirement: CustomerRequirement) -> int:
    """The window T. Owner decision 12.

    Unset **blocks Customer cancellation of a paid booking outright**, and that is the honest
    consequence: the choice between refunding in full and executing the forfeit split is the choice
    of whose money it is, and guessing it would make the platform decide a refund policy nobody
    approved on a real Customer's real money.
    """
    hours = _configuration(requirement).booking_fee_free_cancel_hours
    if hours is None:
        raise PolicyUnavailableError(
            "We have not set the free-cancellation window for this service. Support can help.",
        )
    return hours


def forfeit_split(requirement: CustomerRequirement, *, amount_paise: int) -> tuple[int, int]:
    """A forfeited fee as `(travel compensation, platform share)`, in integer paise.

    The platform share is the **remainder**, not a second multiplication — two independent
    roundings of the same number do not have to add back to it, and this one always does. The same
    shape `pricing.split_share` uses for the A5 visit split, which is the 2026-08-13 decision both
    fees are built on.

    Owner decision 12. Unset leaves a forfeitable fee `ACTIVE` and visible rather than split on an
    invented ratio.
    """
    basis_points = _configuration(requirement).booking_fee_travel_compensation_basis_points
    if basis_points is None:
        raise PolicyUnavailableError(
            "We have not set how a missed booking is settled for this service. Support can help.",
        )
    travel = amount_paise * basis_points // 10000
    return travel, amount_paise - travel


def overtime_retroactive_window_minutes(requirement: CustomerRequirement) -> int:
    """How long after a shift ends overtime may still be approved (`M2-BE-531`). Owner-blocked.

    ADR-0009: overtime counts "only after customer one-tap approval, with the retroactive window
    unchanged". This is that window, and unset **blocks a retroactive overtime request outright** —
    a request made while the shift is still running is unaffected, because that one is not
    retroactive and needs no window at all.

    Fails closed rather than defaulting, and the direction matters: a window invented here is the
    single number deciding whether work that has already been done gets paid for. Too long and a
    Customer is asked at midnight to approve hours nobody can now check; too short and a lead
    loses two hours of a gang's labour to an app they were not looking at. Neither is a call code
    may make.
    """
    minutes = _configuration(requirement).overtime_retroactive_window_minutes
    if minutes is None:
        raise PolicyUnavailableError(
            "We have not set how long overtime can be approved for after a shift ends. Ask for "
            "overtime before the shift ends, or contact support.",
        )
    return minutes


@dataclass(frozen=True, slots=True)
class DeclineAlarmPolicy:
    threshold_basis_points: int
    minimum_offers: int


def decline_alarm_policy(configuration: M2VariantConfiguration) -> DeclineAlarmPolicy | None:
    """The decline-rate alarm's threshold, or `None` when the owner has not set one.

    The one owner-blocked reader here that answers `None` instead of raising, and the asymmetry is
    deliberate. Every other value gates an action a person is waiting on, so refusing is the safe
    direction. This one gates a **background alarm**: raising would turn an unset threshold into a
    failing periodic task and a stream of errors that say nothing about the market. `None` means no
    alarm fires, which is a real and reportable gap rather than a hidden one — `M2-BE-434` is
    recorded as blocked on decision 13 precisely because of it.
    """
    threshold = configuration.crew_decline_alarm_basis_points
    minimum = configuration.crew_decline_alarm_min_offers
    if threshold is None or minimum is None:
        return None
    return DeclineAlarmPolicy(threshold_basis_points=threshold, minimum_offers=minimum)


# ---------------------------------------------------------------------------
# `publish_rate_card` (`M2-BE-429`)
# ---------------------------------------------------------------------------


@transaction.atomic
def publish_rate_card(
    *,
    service_area_id: uuid.UUID,
    skill_id: uuid.UUID,
    worker_day_wage_paise: int,
    supervision_margin_paise: int,
    booking_fee_paise: int,
    standard_day_hours: int,
    overtime_hourly_paise: int,
    inclusions: list[str],
    add_on_rates: dict[str, int],
    effective_from: date,
    actor: User | None,
    source_reference: str = "",
) -> RateCard:
    """Operations publishes a new effective-dated card for one city and skill.

    Three guards, and each one exists because of a specific way a published price can be wrong:

    1. **The wage component clears the statutory floor**, through the same fail-closed guard
       `submit_proposal` runs on a vendor's quote. A platform that refuses a vendor's rate for
       being below the floor and then publishes its own below it has no rule at all. The floor is
       keyed on the area's `state_code`, which is blank until Operations maps it — and a blank one
       raises `m2_wage_floor_unavailable` rather than skipping the check, because a guard that
       silently does nothing is indistinguishable from one that passed.
    2. **No backdating under a live booking** (§7). A card effective on or before the day a live
       booking was made would retroactively change the number that booking was priced at, in the
       table a dispute reads. Superseding forward is always allowed; that is the whole design.
    3. **The components reconcile** to the published customer rate — enforced by the database
       constraint as well, because this is the invariant both disclosure screens rest on.
    """
    area = ServiceArea.objects.get(pk=service_area_id)
    skill = Skill.objects.get(pk=skill_id)

    if not area.state_code:
        raise RateCardUnavailableError(
            "This area has no state code, so we cannot check the rate against the wage floor.",
        )
    try:
        assert_rate_meets_wage_floor(
            state_code=area.state_code,
            skill=skill,
            on_day=effective_from,
            rate_paise_per_day=worker_day_wage_paise,
        )
    except PartnerDomainError:
        # Re-raised untouched. `WageFloorError` and `WageFloorUnsetError` already carry the two
        # published codes (`m2_proposal_below_wage_floor`, `m2_wage_floor_unavailable`) and the
        # sentence an operator needs; wrapping them would invent a third vocabulary for the same
        # refusal a vendor already sees.
        raise

    live_booking = (
        RateCardBooking.objects.filter(
            rate_card__service_area=area,
            rate_card__skill=skill,
            status__in=(
                RateCardBooking.Status.MATCHING,
                RateCardBooking.Status.OFFER_HELD,
                RateCardBooking.Status.CONFIRMED,
            ),
        )
        # Newest, not oldest. The guard has to hold against *every* live booking, and the only
        # one that can be violated while an older one passes is the most recent — comparing
        # against the oldest lets a date later than it slip under a booking made today.
        .order_by("-created_at")
        .first()
    )
    if live_booking is not None and effective_from <= live_booking.created_at.date():
        raise RequirementTransitionError(
            "A live booking was made at the current rate on or after that date. Publish the new "
            "rate from a later date instead.",
        )

    customer_day_rate = worker_day_wage_paise + supervision_margin_paise + booking_fee_paise
    card, _created = RateCard.objects.update_or_create(
        service_area=area,
        skill=skill,
        effective_from=effective_from,
        defaults={
            "worker_day_wage_paise": worker_day_wage_paise,
            "supervision_margin_paise": supervision_margin_paise,
            "booking_fee_paise": booking_fee_paise,
            "customer_day_rate_paise": customer_day_rate,
            "standard_day_hours": standard_day_hours,
            "overtime_hourly_paise": overtime_hourly_paise,
            "inclusions": list(inclusions),
            "add_on_rates": dict(add_on_rates),
            "source_reference": source_reference[:200],
            "published_by": actor,
        },
    )
    return card


def published_rate_cards(*, service_area_id: uuid.UUID | None = None) -> list[RateCard]:
    """Every published card, newest effective date first. The Operations review calendar's read."""
    queryset = RateCard.objects.select_related("service_area", "skill")
    if service_area_id is not None:
        queryset = queryset.filter(service_area_id=service_area_id)
    return list(queryset.order_by("service_area__slug", "skill__code", "-effective_from"))
