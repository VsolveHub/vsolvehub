"""M2's success-measure emitters (`M2-BE-806`). Names live in `common.observability.metrics`.

This module is the thin layer between a domain command and a counter: it reads the SLA that was in
force, works out whether a promise was kept, and hands `emit` a flat set of labels. The names
themselves are deliberately **not** here — `common/observability/metrics.py` is the one registry,
for the reason its own docstring gives: a metric invented at its call site is a metric nobody can
alert on.

Three rules this file follows.

**Nothing here may raise.** `emit` already swallows everything, but the *derivation* above it can
fail on its own — an unset policy, a requirement with no `submitted_at`, a service area with no
operating windows. Every helper below answers a label instead of propagating, because a
measurement that can break the command it measures is worse than no measurement.

**`no_promise` is a real answer.** Where the SLA clock is an owner-blocked value that has not been
set, `within_sla` is `no_promise` rather than `true` or `false`. Scoring an unset promise as kept
would flatter the number; scoring it as broken would invent a target nobody agreed to. It is the
same asymmetry `pricing.first_visit_deadline` draws by answering `None`.

**No personal data on a label.** Labels carry ids, statuses, durations and archetypes. A metric
line is a log line (see the transport note in the registry), and `AGENTS.md`'s rule about what may
never be logged applies to it exactly as it applies to everything else.
"""

import uuid
from datetime import datetime

from django.utils import timezone

from apps.requirements.models import CustomerRequirement
from common.observability.metrics import M2Metric, emit

#: The three answers `within_sla` can take. A tuple rather than three string literals scattered
#: through the helpers below, so a rename cannot leave two of the three behind.
WITHIN_SLA_TRUE = "true"
WITHIN_SLA_FALSE = "false"
WITHIN_SLA_NO_PROMISE = "no_promise"


def _sla_verdict(*, deadline: datetime | None, at: datetime) -> str:
    """Whether a promise was kept, or whether one was ever made."""
    if deadline is None:
        return WITHIN_SLA_NO_PROMISE
    return WITHIN_SLA_TRUE if at <= deadline else WITHIN_SLA_FALSE


def _elapsed_seconds(*, since: datetime | None, until: datetime) -> int | None:
    if since is None:
        return None
    return int((until - since).total_seconds())


def record_transition(
    *,
    requirement: CustomerRequirement,
    from_status: str,
    to_status: str,
    reason_code: str,
) -> None:
    """One audit row, as a counter. Called from `services.record_transition` and nowhere else.

    Every published M2 rate is two filters on this one series. Keeping the emitter beside the write
    that creates the audit row is what stops the two from disagreeing: a command that starts
    recording a new `reason_code` is counted the day it ships, without anybody remembering to add a
    metric for it.
    """
    emit(
        M2Metric.REQUIREMENT_TRANSITION,
        archetype=requirement.archetype,
        variant_id=str(requirement.variant_id),
        from_status=from_status,
        to_status=to_status,
        reason_code=reason_code or "unspecified",
    )


def record_crew_confirmed(
    *,
    requirement: CustomerRequirement,
    confirmed_at: datetime | None = None,
    deadline: datetime | None = None,
) -> None:
    """A3's "time to confirmed crew", measured from submission (`M2-BE-806`).

    Measured from `submitted_at` rather than from the booking row's creation, because the promise
    the Customer was shown starts when they tapped book — the cascade, the waves and the widening
    are all inside the promise, not before it.
    """
    at = confirmed_at or timezone.now()
    emit(
        M2Metric.CREW_CONFIRMED,
        archetype=requirement.archetype,
        variant_id=str(requirement.variant_id),
        service_area_id=str(requirement.service_area_id) if requirement.service_area_id else None,
        elapsed_seconds=_elapsed_seconds(since=requirement.submitted_at, until=at),
        within_sla=_sla_verdict(deadline=deadline, at=at),
    )


def record_first_visit_confirmed(
    *,
    requirement: CustomerRequirement,
    confirmed_at: datetime | None = None,
    deadline: datetime | None = None,
) -> None:
    """A5's "time to first confirmed visit", against `first_visit_sla_hours` (`M2-BE-806`)."""
    at = confirmed_at or timezone.now()
    emit(
        M2Metric.FIRST_VISIT_CONFIRMED,
        archetype=requirement.archetype,
        variant_id=str(requirement.variant_id),
        service_area_id=str(requirement.service_area_id) if requirement.service_area_id else None,
        elapsed_seconds=_elapsed_seconds(since=requirement.submitted_at, until=at),
        within_sla=_sla_verdict(deadline=deadline, at=at),
    )


def record_purchase_paused(*, variant_id: uuid.UUID | None, scope: str, door: str) -> None:
    """A new purchase turned away by a pause (`M2-BE-810`).

    `door` names which of the three gated commands refused, because "we paused A3 and lost forty
    instant bookings" and "we paused A3 and lost forty unlock checkouts" are different sentences
    about the fallback's health.
    """
    emit(
        M2Metric.PURCHASE_PAUSED,
        variant_id=str(variant_id) if variant_id is not None else None,
        scope=scope,
        door=door,
    )


def record_operations_touch(
    *,
    requirement: CustomerRequirement,
    action: str,
    touch_count: int,
    budget: int | None,
) -> None:
    """One Operations touch against the unit-economics budget (`M2-BE-715`, `M2-BE-806`).

    `budget` is published as the string `unset` when the owner has not set one, rather than being
    omitted: a label that is sometimes absent makes every downstream query carry a special case,
    and "we are measuring this and nobody has said what good looks like" is itself worth seeing.
    """
    emit(
        M2Metric.OPERATIONS_TOUCH,
        archetype=requirement.archetype,
        variant_id=str(requirement.variant_id),
        requirement_id=str(requirement.id),
        action=action,
        touch_count=touch_count,
        budget="unset" if budget is None else budget,
        over_budget=budget is not None and touch_count > budget,
    )
