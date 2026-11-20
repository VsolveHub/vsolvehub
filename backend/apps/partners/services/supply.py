"""Partner supply per service area: targets, flags, the weekly trend and recruitment needs.

Phase 2 of the Step 3 "Where you work" design (docs/onboarding-step3-flow/FLOW.md sections 3c-3e).

Supply means *approved* partners holding an active link to the area. A trade is a Skill the
partner holds. Nothing here changes who gets jobs: dispatch still reads the partner's own area
link (T21). Targets and flags are for Operations to decide where to recruit.
"""

from __future__ import annotations

import uuid
from collections import Counter, defaultdict
from collections.abc import Iterable, Sequence
from datetime import date, timedelta
from typing import Any
from urllib.parse import urlencode

from django.conf import settings
from django.db import transaction
from django.db.models import Count
from django.utils import timezone

from apps.identity.models import User
from apps.locations.models import ServiceArea, ServiceAreaPostalCode, UnservedDemandEvent
from apps.partners.exceptions import PartnerDomainError, ServiceAreaNotFoundError
from apps.partners.models import (
    AreaSupplyTarget,
    CoverageSnapshot,
    PartnerApplication,
    PartnerAreaRequest,
    PartnerServiceArea,
    PartnerSkill,
    Skill,
)

TREND_WEEKS = 12
LOOKBACK_DAYS = 28

FLAG_RED = "RED"
FLAG_AMBER = "AMBER"
FLAG_GREEN = "GREEN"
FLAG_NONE = "NONE"

#: Below this share of the target an area is red, below the second it is amber (the design's bars).
RED_BELOW = 0.3
AMBER_BELOW = 0.7


def coverage_flag(approved: int, target: int | None, alert_below: int | None = None) -> str:
    """Red, amber or green for approved partners against a target. No target, no flag."""
    if not target:
        return FLAG_NONE
    if alert_below is not None and approved < alert_below:
        return FLAG_RED
    ratio = approved / target
    if ratio < RED_BELOW:
        return FLAG_RED
    if ratio < AMBER_BELOW:
        return FLAG_AMBER
    return FLAG_GREEN


def worst_flag(flags: Iterable[str]) -> str:
    """The most urgent of several flags: red, then amber, then green, then none."""
    order = (FLAG_RED, FLAG_AMBER, FLAG_GREEN)
    found = set(flags)
    return next((flag for flag in order if flag in found), FLAG_NONE)


def week_start_for(day: date) -> date:
    """The Monday of the week a day falls in."""
    return day - timedelta(days=day.weekday())


def approved_supply(
    area_ids: Iterable[uuid.UUID],
) -> tuple[dict[uuid.UUID, int], dict[tuple[uuid.UUID, uuid.UUID], int]]:
    """Approved partners per area, and per (area, skill)."""
    ids = list(area_ids)
    links = list(
        PartnerServiceArea.objects.filter(
            is_active=True,
            service_area_id__in=ids,
            partner__application__status=PartnerApplication.Status.APPROVED,
        ).values_list("service_area_id", "partner_id")
    )
    partner_ids = {partner_id for _area, partner_id in links}
    skills_by_partner: dict[uuid.UUID, list[uuid.UUID]] = defaultdict(list)
    for partner_id, skill_id in PartnerSkill.objects.filter(
        is_active=True, partner_id__in=partner_ids
    ).values_list("partner_id", "skill_id"):
        skills_by_partner[partner_id].append(skill_id)

    overall: Counter[uuid.UUID] = Counter()
    by_trade: Counter[tuple[uuid.UUID, uuid.UUID]] = Counter()
    for area_id, partner_id in links:
        overall[area_id] += 1
        for skill_id in skills_by_partner.get(partner_id, []):
            by_trade[(area_id, skill_id)] += 1
    return dict(overall), dict(by_trade)


def turned_away_by_pin(postal_codes: Iterable[str], *, days: int = LOOKBACK_DAYS) -> dict[str, int]:
    """Customers turned away per PIN over the last `days` days."""
    since = timezone.now() - timedelta(days=days)
    rows = (
        UnservedDemandEvent.objects.filter(
            created_at__gte=since, postal_code__in=list(postal_codes)
        )
        .values("postal_code")
        .annotate(n=Count("id"))
    )
    return {row["postal_code"]: row["n"] for row in rows}


# --- Targets ---


def _area_or_404(area_id: uuid.UUID | str) -> ServiceArea:
    area = ServiceArea.objects.filter(id=area_id).first()
    if area is None:
        raise ServiceAreaNotFoundError
    return area


def get_area_targets(area_id: uuid.UUID | str) -> dict[str, Any]:
    """The area's overall target and one row per trade it offers (or has a target for)."""
    from apps.locations.models import ServiceAreaService  # noqa: PLC0415

    area = _area_or_404(area_id)
    overall_counts, trade_counts = approved_supply([area.id])
    targets = list(AreaSupplyTarget.objects.filter(service_area=area).select_related("skill"))
    overall_target = next((t for t in targets if t.skill_id is None), None)
    by_skill = {t.skill_id: t for t in targets if t.skill_id is not None}

    offered_codes = set(
        ServiceAreaService.objects.filter(
            service_area=area, is_active=True, variant__is_active=True
        )
        .exclude(variant__required_skill_code="")
        .values_list("variant__required_skill_code", flat=True)
    )
    skills = {
        skill.id: skill for skill in Skill.objects.filter(is_active=True, code__in=offered_codes)
    }
    for skill_id, held_target in by_skill.items():
        # A target on a trade the area no longer offers stays visible, so it can be removed.
        if held_target.skill is not None:
            skills.setdefault(skill_id, held_target.skill)

    approved_overall = overall_counts.get(area.id, 0)
    trades = []
    for skill in sorted(skills.values(), key=lambda s: s.name):
        trade_target = by_skill.get(skill.id)
        approved = trade_counts.get((area.id, skill.id), 0)
        trades.append(
            {
                "skill_code": skill.code,
                "skill_name": skill.name,
                "target_partners": trade_target.target_partners if trade_target else None,
                "alert_below": trade_target.alert_below if trade_target else None,
                "approved_partners": approved,
                "flag": coverage_flag(
                    approved,
                    trade_target.target_partners if trade_target else None,
                    trade_target.alert_below if trade_target else None,
                ),
            }
        )
    return {
        "service_area_id": area.id,
        "overall": {
            "target_partners": overall_target.target_partners if overall_target else None,
            "alert_below": overall_target.alert_below if overall_target else None,
            "approved_partners": approved_overall,
            "flag": coverage_flag(
                approved_overall,
                overall_target.target_partners if overall_target else None,
                overall_target.alert_below if overall_target else None,
            ),
        },
        "trades": trades,
    }


def _clean_target(value: int | None, *, field: str) -> int | None:
    if value is None:
        return None
    if value < 0:
        raise PartnerDomainError(
            code="invalid_supply_target",
            message=f"{field} cannot be negative.",
            status_code=400,
        )
    return value


@transaction.atomic
def set_area_targets(
    *,
    area_id: uuid.UUID | str,
    overall: dict[str, Any] | None,
    trades: Sequence[dict[str, Any]],
    actor: User | None = None,
) -> dict[str, Any]:
    """Replace the area's targets. An empty or zero target removes that row."""
    area = _area_or_404(area_id)

    def apply(skill: Skill | None, entry: dict[str, Any] | None) -> None:
        target = _clean_target((entry or {}).get("target_partners"), field="Target")
        alert = _clean_target((entry or {}).get("alert_below"), field="Alert below")
        existing = AreaSupplyTarget.objects.filter(service_area=area, skill=skill)
        if not target:
            existing.delete()
            return
        if alert is not None and alert > target:
            raise PartnerDomainError(
                code="invalid_supply_target",
                message="Alert below cannot be higher than the target.",
                status_code=400,
            )
        AreaSupplyTarget.objects.update_or_create(
            service_area=area,
            skill=skill,
            defaults={"target_partners": target, "alert_below": alert, "updated_by": actor},
        )

    apply(None, overall)
    skills = {s.code: s for s in Skill.objects.filter(code__in=[t["skill_code"] for t in trades])}
    for entry in trades:
        skill = skills.get(entry["skill_code"])
        if skill is None:
            raise PartnerDomainError(
                code="skill_not_found",
                message=f"Unknown trade '{entry['skill_code']}'.",
                status_code=400,
            )
        apply(skill, entry)
    return get_area_targets(area.id)


# --- Snapshots and trend ---


@transaction.atomic
def take_coverage_snapshot(*, today: date | None = None) -> int:
    """Record this week's approved-partner counts for every active area. Idempotent per week."""
    week = week_start_for(today or timezone.localdate())
    areas = list(ServiceArea.objects.filter(is_active=True))
    overall, by_trade = approved_supply(a.id for a in areas)
    targeted = set(
        AreaSupplyTarget.objects.filter(skill__isnull=False).values_list(
            "service_area_id", "skill_id"
        )
    )
    written = 0
    for area in areas:
        CoverageSnapshot.objects.update_or_create(
            week_start=week,
            service_area=area,
            skill=None,
            defaults={"approved_partners": overall.get(area.id, 0)},
        )
        written += 1
    active_ids = {a.id for a in areas}
    for area_id, skill_id in set(by_trade) | {k for k in targeted if k[0] in active_ids}:
        CoverageSnapshot.objects.update_or_create(
            week_start=week,
            service_area_id=area_id,
            skill_id=skill_id,
            defaults={"approved_partners": by_trade.get((area_id, skill_id), 0)},
        )
        written += 1
    return written


def trend_weeks(*, today: date | None = None, weeks: int = TREND_WEEKS) -> list[date]:
    current = week_start_for(today or timezone.localdate())
    return [current - timedelta(weeks=n) for n in range(weeks - 1, -1, -1)]


def area_trends(
    area_ids: Iterable[uuid.UUID],
    live_overall: dict[uuid.UUID, int],
    *,
    today: date | None = None,
) -> tuple[list[date], dict[uuid.UUID, list[int | None]]]:
    """Twelve weekly approved-partner counts per area. The current week is live, earlier weeks
    come from snapshots; a week with no snapshot is None rather than an invented zero."""
    weeks = trend_weeks(today=today)
    ids = list(area_ids)
    snaps = {
        (row["service_area_id"], row["week_start"]): row["approved_partners"]
        for row in CoverageSnapshot.objects.filter(
            skill__isnull=True, service_area_id__in=ids, week_start__in=weeks
        ).values("service_area_id", "week_start", "approved_partners")
    }
    result: dict[uuid.UUID, list[int | None]] = {}
    for area_id in ids:
        series: list[int | None] = []
        for index, week in enumerate(weeks):
            if index == len(weeks) - 1:
                series.append(live_overall.get(area_id, 0))
            else:
                series.append(snaps.get((area_id, week)))
        result[area_id] = series
    return weeks, result


# --- Recruitment ---


def apply_link(area: ServiceArea) -> str:
    """A tagged link to the partner application, so sign-ups can be traced to the push."""
    base = str(getattr(settings, "PARTNER_PORTAL_BASE_URL", "") or "").rstrip("/")
    query = urlencode(
        {"utm_source": "recruitment", "utm_medium": "operations", "utm_campaign": area.slug}
    )
    return f"{base}/apply?{query}"


def recruitment_needs(*, zone: str | None = None) -> list[dict[str, Any]]:
    """Red and amber areas with what is missing, ready for a recruitment push."""
    areas_qs = ServiceArea.objects.filter(is_active=True).order_by("zone", "name")
    if zone:
        areas_qs = areas_qs.filter(zone__iexact=zone)
    areas = list(areas_qs)
    ids = [a.id for a in areas]
    overall, by_trade = approved_supply(ids)
    targets = list(AreaSupplyTarget.objects.filter(service_area_id__in=ids).select_related("skill"))
    pins_by_area: dict[uuid.UUID, list[str]] = defaultdict(list)
    for area_id, code in ServiceAreaPostalCode.objects.filter(service_area_id__in=ids).values_list(
        "service_area_id", "postal_code__code"
    ):
        pins_by_area[area_id].append(code)
    all_pins = [pin for pins in pins_by_area.values() for pin in pins]
    away = turned_away_by_pin(all_pins)
    asked = dict(
        PartnerAreaRequest.objects.filter(dismissed_at__isnull=True, postal_code__in=all_pins)
        .values_list("postal_code")
        .annotate(n=Count("id"))
    )

    needs: list[dict[str, Any]] = []
    for area in areas:
        area_targets = [t for t in targets if t.service_area_id == area.id]
        overall_target = next((t for t in area_targets if t.skill_id is None), None)
        approved_overall = overall.get(area.id, 0)
        area_flag = coverage_flag(
            approved_overall,
            overall_target.target_partners if overall_target else None,
            overall_target.alert_below if overall_target else None,
        )
        trade_gaps = []
        worst = area_flag
        for target in area_targets:
            if target.skill is None:
                continue
            if target.skill_id is None:
                continue
            approved = by_trade.get((area.id, target.skill_id), 0)
            flag = coverage_flag(approved, target.target_partners, target.alert_below)
            if flag in (FLAG_RED, FLAG_AMBER):
                trade_gaps.append(
                    {
                        "skill_code": target.skill.code,
                        "skill_name": target.skill.name,
                        "approved_partners": approved,
                        "target_partners": target.target_partners,
                        "shortfall": max(0, target.target_partners - approved),
                        "flag": flag,
                    }
                )
            if flag == FLAG_RED or (flag == FLAG_AMBER and worst != FLAG_RED):
                worst = flag
        if worst not in (FLAG_RED, FLAG_AMBER):
            continue
        pins = pins_by_area.get(area.id, [])
        needs.append(
            {
                "service_area_id": area.id,
                "name": area.name,
                "slug": area.slug,
                "zone": area.zone,
                "flag": worst,
                "approved_partners": approved_overall,
                "target_partners": overall_target.target_partners if overall_target else None,
                "shortfall": max(0, overall_target.target_partners - approved_overall)
                if overall_target
                else 0,
                "trade_gaps": trade_gaps,
                "open_asked_pins_count": sum(asked.get(pin, 0) for pin in pins),
                "turned_away_28d_count": sum(away.get(pin, 0) for pin in pins),
                "apply_link": apply_link(area),
            }
        )
    return sorted(needs, key=lambda n: (n["flag"] != FLAG_RED, n["zone"], n["name"]))
