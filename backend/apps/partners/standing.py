"""Vendor standing: recording what happened, counting patterns, and nothing in between.

ADR-0009 asks for three consequences that all begin with the same sentence — "this hits standing":
a short crew day (`M2-BE-537`), a cash extra demanded on site (`M2-BE-539`) and a vendor no-show.
Before this module the sentence had nowhere to land, so it was written in docstrings and enforced
nowhere.

Two rules run through everything here, and both are refusals rather than features:

**A record is not a verdict.** `record_event` writes what happened and stops. It does not suspend,
demote, notify or score. A Customer's report of a cash demand is an account of an argument on a
site, and ADR-0009 is explicit that it "is never treated as proof on its own" — one report is one
person's word, and the platform's answer to it is to remember it, not to act on it.

**A pattern is the owner's number, not ours.** `standing_policy` reads the threshold and the window
from `M2VariantConfiguration` and answers `None` while either is unset, exactly as
`rate_cards.decline_alarm_policy` does. `None` means no demotion and no removal ever fires, and the
events accumulate regardless — so turning the rule on later is loading a value, not backfilling a
history. That is the fail-closed direction here: guessing "three reports and you are removed" would
end somebody's trade on a number nobody approved, and the events would look identical afterwards to
ones that had been judged properly.
"""

import uuid
from collections import Counter
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta

from django.utils import timezone

from apps.catalog.models import M2VariantConfiguration
from apps.partners.models import PartnerProfile, PartnerStandingEvent


@dataclass(frozen=True, slots=True)
class StandingPolicy:
    """How many events inside how many days make a pattern. Entirely owner-configured."""

    window_days: int
    #: Short shift-days before a lead is demoted in matching. `None` when the owner has set no
    #: threshold, in which case no demotion fires and the shortfalls are still recorded.
    shortfall_threshold: int | None
    #: Cash-demand reports before the capability is suspended. Same `None` meaning.
    cash_demand_threshold: int | None

    def window_start(self, *, at: datetime | None = None) -> datetime:
        return (at or timezone.now()) - timedelta(days=self.window_days)


def standing_policy(configuration: M2VariantConfiguration | None) -> StandingPolicy | None:
    """The pattern rules for one variant, or `None` while the window is unset.

    The window is load-bearing and the thresholds are not: "three reports" without "three reports
    since when" is not a rule at all, so a missing window disables both patterns, whereas a missing
    threshold disables only its own. Both are reported as gaps rather than substituted.
    """
    if configuration is None:
        return None
    window = configuration.vendor_standing_window_days
    if window is None:
        return None
    return StandingPolicy(
        window_days=window,
        shortfall_threshold=configuration.crew_shortfall_standing_threshold,
        cash_demand_threshold=configuration.cash_demand_removal_threshold,
    )


def record_event(
    *,
    partner: PartnerProfile,
    kind: str,
    source_kind: str,
    source_id: uuid.UUID | None,
    reason: str = "",
    occurred_at: datetime | None = None,
) -> PartnerStandingEvent:
    """Write one standing event, once per causing row.

    `get_or_create` on `(kind, source_id)` rather than `create`, because every caller is a command
    that can be re-driven — a retried webhook, a second tap, a sweep passing over the same
    settlement — and a standing record that double-counts a retry is worse than none: it makes the
    pattern threshold mean something different for a vendor whose Customer refreshed the page.

    **A null `source_id` writes a plain row.** `partners_one_standing_event_per_source` is a
    partial index over non-null sources, and matching on `source_id IS NULL` would hand the second
    sourceless event of a kind the *first* vendor's row — a caller trying to record a fact about
    one vendor would silently update somebody else's. Deduplication is a property of having a
    causing row; without one there is nothing to deduplicate against and the honest answer is a
    new row.
    """
    if source_id is None:
        return PartnerStandingEvent.objects.create(
            partner=partner,
            kind=kind,
            source_kind=source_kind,
            reason=reason[:240],
            occurred_at=occurred_at or timezone.now(),
        )
    event, _created = PartnerStandingEvent.objects.get_or_create(
        kind=kind,
        source_id=source_id,
        defaults={
            "partner": partner,
            "source_kind": source_kind,
            "reason": reason[:240],
            "occurred_at": occurred_at or timezone.now(),
        },
    )
    return event


def event_count(
    *,
    partner: PartnerProfile,
    kind: str,
    since: datetime,
) -> int:
    """How many events of one kind this vendor has inside a window."""
    return PartnerStandingEvent.objects.filter(
        partner=partner,
        kind=kind,
        occurred_at__gte=since,
    ).count()


def hits_by_partner(
    *,
    partner_ids: Sequence[uuid.UUID],
    since: datetime,
    kinds: Iterable[str] = (),
) -> dict[uuid.UUID, int]:
    """Recent standing events per Partner, for the matching demotion (`M2-BE-537`).

    One query for the whole pool. Returns only Partners that have events, so a caller reads it with
    `.get(partner_id, 0)` and a clean vendor costs nothing.
    """
    ids = list(partner_ids)
    if not ids:
        return {}
    queryset = PartnerStandingEvent.objects.filter(partner_id__in=ids, occurred_at__gte=since)
    kind_list = list(kinds)
    if kind_list:
        queryset = queryset.filter(kind__in=kind_list)
    return dict(Counter(queryset.values_list("partner_id", flat=True)))


def pattern_reached(
    *,
    partner: PartnerProfile,
    kind: str,
    threshold: int | None,
    policy: StandingPolicy | None,
    at: datetime | None = None,
) -> bool:
    """Whether this vendor has crossed a configured pattern threshold.

    Answers `False` — never raises — when the owner has set no window or no threshold. The caller
    is always a command a Customer or a supervisor is waiting on, and refusing their action because
    a background policy is unconfigured would punish them for an Operations gap. The gap itself is
    reported in the wave record and in `frontend-execution-plan.md` §7, which is where an unset
    policy belongs.
    """
    if policy is None or threshold is None:
        return False
    return event_count(partner=partner, kind=kind, since=policy.window_start(at=at)) >= threshold
