"""Every owner-blocked M2 money and policy value, read in one place and failing closed.

`07-state-machines-and-permissions.md` §9 lists nine values the owner has not decided and requires
that implementations "read them from configuration and fail closed when unset — no default is baked
into code". This module is the only place that reads them, so there is exactly one answer to "what
happens when the owner has not decided yet", and it is a refusal rather than a guess.

The distinction the two refusals draw:

* `m2_access_price_unavailable` — no effective `M2AccessPrice` row. Nothing can be sold.
* `m2_policy_unavailable` — a clock, a cap or a disposition rule was never set. A specific action
  is blocked and the message says which.

A price is resolved by **effective date**, exactly like `partners.MinimumWageFloor`: the newest row
whose `effective_from` has arrived wins, so raising a price is loading a row rather than editing
one, and a purchase made yesterday still reconciles against the price it was made at.
"""

from dataclasses import dataclass
from datetime import date, datetime

from django.utils import timezone

from apps.catalog.models import M2VariantConfiguration
from apps.locations.models import ServiceArea
from apps.requirements.exceptions import (
    AccessPriceUnavailableError,
    PolicyUnavailableError,
)
from apps.requirements.models import CustomerRequirement, M2AccessPrice
from apps.requirements.sla import ServiceAreaNeverOpenError, add_business_hours

#: The tiers revision 3 defines. A request for any other size is refused before it reaches the
#: price table, because "how many professionals visit" is a product decision with three answers.
VISIT_PLAN_SIZES = (1, 2, 3)


@dataclass(frozen=True, slots=True)
class AccessPrice:
    """One resolved, effective price and the split that goes with it."""

    row: M2AccessPrice
    amount_paise: int
    #: `None` for the unlock, which pays no vendor.
    vendor_payout_basis_points: int | None


def _effective_price(*, kind: str, plan_size: int, on_day: date) -> AccessPrice:
    row = (
        M2AccessPrice.objects.filter(
            kind=kind,
            plan_size=plan_size,
            effective_from__lte=on_day,
        )
        .order_by("-effective_from", "-created_at")
        .first()
    )
    if row is None:
        raise AccessPriceUnavailableError()
    return AccessPrice(
        row=row,
        amount_paise=row.amount_paise,
        vendor_payout_basis_points=row.vendor_payout_basis_points,
    )


def unlock_price(*, on_day: date | None = None) -> AccessPrice:
    """The A3 quote-unlock price. Blocking owner decision 1."""
    return _effective_price(
        kind=M2AccessPrice.Kind.A3_QUOTE_UNLOCK,
        plan_size=0,
        on_day=on_day or timezone.localdate(),
    )


def visit_plan_price(*, plan_size: int, on_day: date | None = None) -> AccessPrice:
    """One A5 visit tier, with its vendor-payout split. Blocking owner decision 1."""
    if plan_size not in VISIT_PLAN_SIZES:
        raise AccessPriceUnavailableError()
    return _effective_price(
        kind=M2AccessPrice.Kind.A5_VISIT_PLAN,
        plan_size=plan_size,
        on_day=on_day or timezone.localdate(),
    )


def available_visit_plan_tiers(*, on_day: date | None = None) -> list[AccessPrice]:
    """Every tier that currently has a price, for the review screen's chooser.

    An empty list is the honest answer while owner decision 1 is open, and the review screen
    renders "we cannot offer visits here yet" from it rather than three hardcoded prices. It does
    **not** raise: a read that lists nothing is not a failure, and refusing the whole review screen
    because a price is missing would hide a requirement the Customer can still submit for A3.
    """
    day = on_day or timezone.localdate()
    tiers: list[AccessPrice] = []
    for size in VISIT_PLAN_SIZES:
        row = (
            M2AccessPrice.objects.filter(
                kind=M2AccessPrice.Kind.A5_VISIT_PLAN,
                plan_size=size,
                effective_from__lte=day,
            )
            .order_by("-effective_from", "-created_at")
            .first()
        )
        if row is not None:
            tiers.append(
                AccessPrice(
                    row=row,
                    amount_paise=row.amount_paise,
                    vendor_payout_basis_points=row.vendor_payout_basis_points,
                )
            )
    return tiers


def share_amounts(*, price_paise: int, plan_size: int) -> list[int]:
    """`price / size` in integer paise, remainder on the **first** share.

    Fixed by `07-state-machines-and-permissions.md` §4a. Which share carries the remainder matters:
    it is one paise, and it is also the difference between "the parts add up" and a reconciliation
    report that is off by a rupee a thousand plans later.
    """
    if plan_size <= 0:
        raise AccessPriceUnavailableError()
    base = price_paise // plan_size
    remainder = price_paise - base * plan_size
    return [base + remainder] + [base] * (plan_size - 1)


def split_share(*, amount_paise: int, vendor_payout_basis_points: int) -> tuple[int, int]:
    """One share as `(vendor visit payout, Vsolve platform share)`, in integer paise.

    The platform share is the **remainder**, not a second multiplication: two independent
    roundings of the same number do not have to add back to it, and this one always does.
    """
    vendor = amount_paise * vendor_payout_basis_points // 10000
    return vendor, amount_paise - vendor


# ---------------------------------------------------------------------------
# Policy clocks and rules. Owner decisions 2, 3 and 4.
# ---------------------------------------------------------------------------


def _configuration(requirement: CustomerRequirement) -> M2VariantConfiguration:
    configuration = requirement.configuration
    if configuration is None:
        raise PolicyUnavailableError(
            "This service has no active configuration, so we cannot apply its rules yet.",
        )
    return configuration


def _business_hours_deadline(
    *, area: ServiceArea | None, start: datetime, hours: int
) -> datetime | None:
    """Advance a clock through the area's open hours, or answer `None` when it cannot run.

    Reuses `requirements.sla`, which reuses `locations.ServiceAreaOperatingWindow`. A second
    calendar is the thing `02-backend-tasks.md` §"Reuse before building" names explicitly.
    """
    if area is None:
        return None
    windows = list(area.operating_windows.all())
    exceptions = list(area.operating_exceptions.all())
    if not windows and not exceptions:
        return None
    try:
        return add_business_hours(start=start, hours=hours, windows=windows, exceptions=exceptions)
    except ServiceAreaNeverOpenError:
        return None


def first_visit_deadline(
    requirement: CustomerRequirement, *, at: datetime | None = None
) -> datetime | None:
    """When a first confirmed visit slot is due. `None` when the owner promised no SLA."""
    hours = _configuration(requirement).first_visit_sla_hours
    if hours is None:
        return None
    return _business_hours_deadline(
        area=requirement.service_area,
        start=at or requirement.submitted_at or timezone.now(),
        hours=hours,
    )


def visit_plan_fill_deadline(
    requirement: CustomerRequirement, *, at: datetime | None = None
) -> datetime | None:
    """When every plan slot should be filled. Unfilled shares auto-refund after it."""
    hours = _configuration(requirement).visit_plan_fill_sla_hours
    if hours is None:
        return None
    return _business_hours_deadline(
        area=requirement.service_area,
        start=at or requirement.submitted_at or timezone.now(),
        hours=hours,
    )


def estimate_window_deadline(
    requirement: CustomerRequirement, *, completed_at: datetime
) -> datetime | None:
    """When a completed visit stops being allowed to produce an estimate.

    `None` means the owner has set no window, and a visit that produced nothing then never
    auto-refunds. That is the honest consequence of an unset policy — the alternative is inventing
    a deadline and refunding a vendor's earned visit against it.
    """
    hours = _configuration(requirement).post_visit_estimate_window_hours
    if hours is None:
        return None
    return _business_hours_deadline(
        area=requirement.service_area,
        start=completed_at,
        hours=hours,
    )


def customer_no_show_refunds_platform_share(requirement: CustomerRequirement) -> bool:
    """Owner decision 3. The vendor payout is always paid; this decides the platform share only."""
    value = _configuration(requirement).customer_no_show_refunds_platform_share
    if value is None:
        raise PolicyUnavailableError(
            "We have not decided how a missed visit is settled yet. Support can help.",
        )
    return value


def non_responsive_rejection_cap(requirement: CustomerRequirement) -> int:
    """How many free replacements a Customer gets. Unset blocks the mechanism, not the rejection.

    A cap of zero is a legitimate configuration — "no free replacements" — which is why the unset
    case has to be `None` and not `0`.
    """
    cap = _configuration(requirement).non_responsive_rejection_cap
    if cap is None:
        raise PolicyUnavailableError(
            "We have not set how many free replacements this service offers. Support can help.",
        )
    return cap


def a5_commission(requirement: CustomerRequirement, *, total_paise: int) -> tuple[int, str]:
    """Vsolve's commission on an A5 engagement, in paise, and how it is displayed.

    Owner decision 4, in both halves: the rate and whether it sits inside the vendor's quoted price
    or is added on top. Both are Operations-owned rather than vendor-declared — a vendor who could
    name the commission treatment could make every comparison view dishonest — and both fail closed.
    """
    configuration = _configuration(requirement)
    basis_points = configuration.commission_basis_points
    treatment = configuration.commission_treatment
    if basis_points is None or not treatment:
        raise PolicyUnavailableError(
            "We have not set the commission terms for this service yet. Support can help.",
        )
    return total_paise * basis_points // 10000, treatment


def stage_review_deadline(
    requirement: CustomerRequirement, *, at: datetime | None = None
) -> datetime | None:
    """When silence on submitted stage evidence becomes approval.

    `None` means the owner has set no review window, and the honest consequence is that **no
    stage is ever auto-approved**. `07-state-machines-and-permissions.md` §5 permits
    `AWAITING_REVIEW → APPROVED` on timeout; it does not permit inventing the timeout. A default
    here would release a vendor's money against a deadline nobody agreed to.
    """
    hours = _configuration(requirement).stage_review_window_hours
    if hours is None:
        return None
    return _business_hours_deadline(
        area=requirement.service_area,
        start=at or timezone.now(),
        hours=hours,
    )


def stage_payout_hold_deadline(
    requirement: CustomerRequirement, *, at: datetime | None = None
) -> datetime | None:
    """When an approved stage's held payout becomes payable — the dispute window (`M2-BE-507`).

    `None` means the hold does not lift on a clock. The earning is still written and still held,
    because the vendor is owed either way; what is missing is only the automatic release, and
    releasing money early on a guessed window is the one failure a dispute window exists to
    prevent.
    """
    hours = _configuration(requirement).stage_payout_hold_hours
    if hours is None:
        return None
    return _business_hours_deadline(
        area=requirement.service_area,
        start=at or timezone.now(),
        hours=hours,
    )


def amendment_response_deadline(
    requirement: CustomerRequirement, *, at: datetime | None = None
) -> datetime:
    """How long a Customer has to answer a proposed scope amendment.

    The one clock in this module that **raises** rather than answering `None`.
    `fulfilment.ScopeAmendment.expires_at` is not nullable, and an amendment with no expiry is an
    open-ended claim on somebody's money that the vendor could hold over a live job indefinitely.
    Refusing to propose one is the fail-closed outcome; inventing a window is not.
    """
    hours = _configuration(requirement).amendment_response_hours
    deadline = (
        None
        if hours is None
        else _business_hours_deadline(
            area=requirement.service_area,
            start=at or timezone.now(),
            hours=hours,
        )
    )
    if deadline is None:
        raise PolicyUnavailableError(
            "We have not set how long a change request stays open for this service. "
            "Support can help.",
        )
    return deadline


@dataclass(frozen=True, slots=True)
class WarrantyTerms:
    """What a variant holds back, and for how long (`M2-BE-546`)."""

    #: Basis points of the agreed total held out of the vendor's payout until the window closes.
    #: **Zero is a real answer** — "we advertise a warranty and hold nothing back" — which is why
    #: the unset case is a refusal rather than a zero.
    retention_basis_points: int
    window_days: int

    def retention_paise(self, *, total_paise: int) -> int:
        return total_paise * self.retention_basis_points // 10000


def warranty_terms(requirement: CustomerRequirement) -> WarrantyTerms:
    """The retention percentage and warranty window for this variant, or a refusal.

    `M2-BE-546`: **a variant either funds retention or does not advertise warranty.** Both halves
    are pre-phase owner decisions, so an unset value refuses rather than defaulting — and the
    refusal lands at `proposals.submit_proposal`, where a vendor writing warranty terms into an
    estimate is told the variant cannot back them yet. Defaulting to zero here would be worse than
    unhelpful: it would let a Customer select an estimate promising a year's warranty against
    which nothing at all is held, and neither party would find out until the end of the project.
    """
    configuration = _configuration(requirement)
    basis_points = configuration.warranty_retention_basis_points
    window_days = configuration.warranty_window_days
    if basis_points is None or window_days is None:
        raise PolicyUnavailableError(
            "We have not set the warranty terms for this service yet, so an estimate cannot "
            "promise one. Support can help.",
        )
    return WarrantyTerms(retention_basis_points=basis_points, window_days=window_days)


def warranty_terms_or_none(requirement: CustomerRequirement) -> WarrantyTerms | None:
    """The same values, for a caller that must not refuse.

    `engagements._open_engagement` uses this: by the time an engagement opens, the estimate has
    already passed the guard above, and an engagement that could not be created because Operations
    retired a configuration in between would strand a Customer who has paid for visits. An
    estimate with no warranty terms answers `None` here and retains nothing, which is the correct
    reading of "this vendor promised no warranty".
    """
    try:
        return warranty_terms(requirement)
    except PolicyUnavailableError:
        return None


# ---------------------------------------------------------------------------
# Wave C6: the case clocks, the chargeback alarm and the touch budget.
# ---------------------------------------------------------------------------


def case_response_deadline(
    requirement: CustomerRequirement, *, at: datetime | None = None
) -> datetime | None:
    """When the parties' window to answer a case closes (`M2-BE-704`).

    `None` means the variant set no window, and the honest consequence is that **the case carries
    no party deadline at all** — it still opens, still has its Operations SLA, and nobody is timed
    out against a clock nobody set. Deliberately not a refusal: a safety case that could not be
    opened because a response window was unconfigured would be the worst fail-closed direction
    available in this file.
    """
    hours = _configuration(requirement).case_response_window_hours
    if hours is None:
        return None
    return _business_hours_deadline(
        area=requirement.service_area,
        start=at or timezone.now(),
        hours=hours,
    )


def case_appeal_deadline(requirement: CustomerRequirement, *, resolved_at: datetime) -> datetime:
    """The last moment a resolved case may be appealed. Raises when unset.

    The one case clock that **refuses**, and it is the mirror of `amendment_response_deadline`'s
    reasoning: an appeal window with no bound is an open-ended claim to reverse a decision that has
    already moved money, and no default here is defensible. Appealing a case that is still open
    needs no window and never reaches this function.
    """
    hours = _configuration(requirement).case_appeal_window_hours
    deadline = (
        None
        if hours is None
        else _business_hours_deadline(
            area=requirement.service_area,
            start=resolved_at,
            hours=hours,
        )
    )
    if deadline is None:
        raise PolicyUnavailableError(
            "We have not set how long a decision on this service can be appealed for. "
            "Support can help.",
        )
    return deadline


@dataclass(frozen=True, slots=True)
class ChargebackAlarm:
    """When a chargeback rate stops being noise and starts being an alarm (`M2-BE-708`)."""

    basis_points: int
    min_charges: int


def chargeback_alarm(requirement: CustomerRequirement) -> ChargebackAlarm | None:
    """The alarm thresholds, or `None` while the owner has not set them.

    `None` means **no alarm fires** and every chargeback is still recorded as a case — the same
    asymmetry `rate_cards.decline_alarm_policy` draws, and for the same reason: recording is never
    refused for want of a threshold, and paging somebody on an invented rate is not code's call.
    """
    configuration = _configuration(requirement)
    basis_points = configuration.chargeback_alarm_basis_points
    min_charges = configuration.chargeback_alarm_min_charges
    if basis_points is None or min_charges is None:
        return None
    return ChargebackAlarm(basis_points=basis_points, min_charges=min_charges)


def operations_touch_budget(requirement: CustomerRequirement) -> int | None:
    """How many Operations touches one request may take (`M2-BE-715`). `None` when unset.

    The metric is emitted either way. Measurement never waits on the owner; only the judgement
    about whether a number is acceptable does, and reporting "3 touches, budget unset" is more
    useful than reporting nothing at all.
    """
    return _configuration(requirement).operations_touch_budget_per_request


def reconfirmation_deadline(
    requirement: CustomerRequirement, *, at: datetime | None = None
) -> datetime | None:
    """How long a selected vendor has to reconfirm.

    Reuses `first_quote_sla_hours` deliberately: reconfirmation is the same promise as a first
    response, made by a vendor who has already engaged, and owner decision 2 lists the two together.
    A separate unset knob would have blocked selection on a value nobody has been asked for.
    """
    hours = _configuration(requirement).first_quote_sla_hours
    if hours is None:
        return None
    return _business_hours_deadline(
        area=requirement.service_area,
        start=at or timezone.now(),
        hours=hours,
    )
