"""Phase A: the vendor price book — commands, guardrail resolution, and quote-time enforcement.

The one rule this module exists to keep: **the guarantee lives here, not in the composer UI.** A
Partner's saved rate is validated on write for convenience; every check below runs again, against
the live catalog and the live policy, at the moment a quote is actually submitted
(`validate_quote_guardrails`, called from `financials.calculate_estimate` for every A5 item-wise
estimate that touches the catalog). A band Operations narrows between the Partner saving a rate
and sending a quote is caught here — never assumed from a client that might be stale, patched, or
lying.

Two owner decisions (2026-08-29) shape what is *not* enforced:

* **Custom items are allowed inline, without review.** A Partner on site adds "Something not
  listed", prices it, and sends. There is no share cap and no "custom-only quote" refusal — a
  review queue that held the estimate would mean the estimate never went out in the visit window.
  The one thing still screened is the title itself (no phone numbers, no links).
* **Materials are always the Customer's to buy.** The catalog carries a *material recipe* per item
  and `shopping_list_for_lines` turns the tapped items into the list the Customer shops from —
  quantities only, never money.

Money in this module is otherwise dumb arithmetic: `financials.py` owns tax, commission, platform
fee and reconciliation. This module answers "is this rate allowed", "what should the Customer buy",
and hands `financials` a clean, already-validated set of lines.
"""

from __future__ import annotations

import math
import uuid
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.identity.models import User
from apps.locations.models import ServiceArea
from apps.partners.models import PartnerProfile, Skill
from apps.requirements.exceptions import (
    CustomTitleScreenedError,
    GuardrailPolicyUnavailableError,
    ProposalShapeError,
    RateOutsideBandError,
    WorkItemRateUnavailableError,
)
from apps.requirements.models import (
    CustomWorkItemReview,
    PartnerRateItem,
    QuoteGuardrailPolicy,
    WorkItem,
    WorkItemRate,
    band_for_item_in_area,
)

_MAX_BASIS_POINTS = 10_000


# ---------------------------------------------------------------------------
# The active guardrail policy — resolved exactly like `financials.active_policy`.
# ---------------------------------------------------------------------------


def active_guardrail_policy(*, at: datetime | None = None) -> QuoteGuardrailPolicy:
    """The one `ACTIVE` `QuoteGuardrailPolicy`, or a fail-closed refusal.

    No `effective_from` filter beyond "has it arrived": unlike `CommercialPolicy` this policy has
    no `effective_until` column, because — like `RateCard` — Operations retires a version by
    activating its successor rather than by scheduling an end date. `activate_guardrail_policy`
    enforces "at most one ACTIVE" at write time; this only has to find it.
    """

    moment = at or timezone.now()
    policy = QuoteGuardrailPolicy.objects.filter(
        status=QuoteGuardrailPolicy.Status.ACTIVE,
        approved_at__isnull=False,
        approved_by__isnull=False,
        effective_from__lte=moment,
    ).first()
    if policy is None:
        raise GuardrailPolicyUnavailableError()
    required_bps = (
        policy.default_band_below_bps,
        policy.default_band_above_bps,
        policy.misc_cap_bps,
        policy.margin_cap_bps,
        policy.custom_share_cap_bps,
    )
    if any(value is None for value in required_bps):
        raise GuardrailPolicyUnavailableError()
    return policy


@transaction.atomic
def activate_guardrail_policy(
    *,
    actor: User,
    version: int,
    approval_reference: str,
    effective_from: datetime,
    default_band_below_bps: int,
    default_band_above_bps: int,
    misc_cap_bps: int,
    margin_cap_bps: int,
    custom_share_cap_bps: int,
    per_skill_bands: dict[str, dict[str, int]] | None = None,
) -> QuoteGuardrailPolicy:
    """Record and activate one Operations-approved guardrail policy, idempotently by version.

    Mirrors `financials.activate_policy` exactly: read-then-write inside one lock, retire whatever
    was `ACTIVE` before inserting or updating this version, and a second call at the same version
    is a no-op rather than a duplicate. The one shape check specific to this policy —
    `per_skill_bands` naming only real skills, with paired in-range values — happens here rather
    than at the database, because a skill id is a foreign fact this table cannot constrain against.
    """

    if not approval_reference.strip():
        raise GuardrailPolicyUnavailableError("An approval reference is required.")
    bounded = {
        "default_band_below_bps": default_band_below_bps,
        "default_band_above_bps": default_band_above_bps,
        "misc_cap_bps": misc_cap_bps,
        "margin_cap_bps": margin_cap_bps,
        "custom_share_cap_bps": custom_share_cap_bps,
    }
    for name, value in bounded.items():
        if not isinstance(value, int) or not 0 <= value <= _MAX_BASIS_POINTS:
            raise GuardrailPolicyUnavailableError(f"{name} must be integer basis points, 0-10000.")

    skill_bands = per_skill_bands or {}
    known_skill_ids = set(
        Skill.objects.filter(id__in=skill_bands.keys()).values_list("id", flat=True)
    )
    for skill_id, band in skill_bands.items():
        try:
            parsed_id = uuid.UUID(str(skill_id))
        except ValueError as exc:
            raise GuardrailPolicyUnavailableError(
                f"'{skill_id}' in per_skill_bands is not a valid skill id."
            ) from exc
        if parsed_id not in known_skill_ids:
            raise GuardrailPolicyUnavailableError(
                f"Unknown skill id in per_skill_bands: {skill_id}."
            )
        below = band.get("below_bps")
        above = band.get("above_bps")
        if (
            not isinstance(below, int)
            or not isinstance(above, int)
            or not 0 <= below <= _MAX_BASIS_POINTS
            or not 0 <= above <= _MAX_BASIS_POINTS
        ):
            raise GuardrailPolicyUnavailableError(
                f"per_skill_bands['{skill_id}'] needs integer below_bps/above_bps, 0-10000."
            )

    values: dict[str, Any] = {
        "approval_reference": approval_reference.strip(),
        "effective_from": effective_from,
        "per_skill_bands": skill_bands,
        **bounded,
    }
    existing = QuoteGuardrailPolicy.objects.select_for_update().filter(version=version).first()
    if existing is not None and existing.status == QuoteGuardrailPolicy.Status.ACTIVE:
        return existing
    QuoteGuardrailPolicy.objects.select_for_update().filter(
        status=QuoteGuardrailPolicy.Status.ACTIVE
    ).update(status=QuoteGuardrailPolicy.Status.RETIRED, updated_at=timezone.now())
    if existing is None:
        policy = QuoteGuardrailPolicy(version=version, **values)
    else:
        policy = existing
        for field, value in values.items():
            setattr(policy, field, value)
    policy.status = QuoteGuardrailPolicy.Status.ACTIVE
    policy.approved_by = actor
    policy.approved_at = timezone.now()
    policy.full_clean()
    policy.save()
    return policy


# ---------------------------------------------------------------------------
# Publishing a reference rate — the `WorkItemRate` load-never-edit lifecycle.
# ---------------------------------------------------------------------------


@transaction.atomic
def publish_reference_rate(
    *,
    actor: User,
    work_item_id: uuid.UUID,
    service_area_id: uuid.UUID,
    reference_rate_paise: int,
) -> WorkItemRate:
    """Publish a new reference rate for one item in one city, retiring the previous version.

    Same shape as `rate_cards.publish_rate_card`: a card is loaded, never edited, so a Partner
    rate or a quote validated against version N still reconciles against version N after
    Operations publishes N+1 tomorrow.
    """

    if reference_rate_paise <= 0:
        raise ProposalShapeError("A reference rate must be a positive amount.")
    work_item = WorkItem.objects.select_for_update().get(pk=work_item_id)
    service_area = ServiceArea.objects.get(pk=service_area_id)
    current = (
        WorkItemRate.objects.select_for_update()
        .filter(
            work_item=work_item,
            service_area=service_area,
            status=WorkItemRate.Status.PUBLISHED,
        )
        .first()
    )
    next_version = (
        WorkItemRate.objects.filter(work_item=work_item, service_area=service_area)
        .order_by("-version")
        .values_list("version", flat=True)
        .first()
        or 0
    ) + 1
    if current is not None:
        current.status = WorkItemRate.Status.RETIRED
        current.save(update_fields=("status",))
    return WorkItemRate.objects.create(
        work_item=work_item,
        service_area=service_area,
        version=next_version,
        reference_rate_paise=reference_rate_paise,
        status=WorkItemRate.Status.PUBLISHED,
        published_at=timezone.now(),
        published_by=actor,
    )


# ---------------------------------------------------------------------------
# The Partner's own price book.
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class PriceBookEntry:
    """One catalog item, as the Partner's rate-card screen and the composer both need it."""

    work_item: WorkItem
    reference_rate_paise: int | None
    rate_version: int | None
    floor_paise: int | None
    ceiling_paise: int | None
    partner_rate_paise: int | None
    partner_is_active: bool
    #: True while the Partner has never saved a rate: `partner_rate_paise` is the city reference.
    is_default_rate: bool
    #: The trade this item belongs to - the rate-card screen's section heading.
    trade_code: str
    trade_name: str


def pricing_trades_for_partner(partner: PartnerProfile) -> list[str]:
    """The trade codes this Partner prices from.

    Every skill they hold, plus the pricing trade of every active M2 configuration whose dispatch
    skill they hold (`full-home-rewiring` -> `electrician`) - so the rate card shows a rewiring
    electrician the electrician catalogue even when the only skill row they carry is the
    service's own.
    """

    from apps.catalog.models import M2VariantConfiguration  # noqa: PLC0415 - avoid a model cycle

    held = list(partner.skill_links.filter(is_active=True).values_list("skill__code", flat=True))
    mapped = (
        M2VariantConfiguration.objects.filter(
            status=M2VariantConfiguration.Status.ACTIVE,
            variant__required_skill_code__in=held,
        )
        .exclude(pricing_skill_code="")
        .values_list("pricing_skill_code", flat=True)
    )
    trades: list[str] = []
    for code in (*held, *mapped):
        if code and code not in trades:
            trades.append(code)
    return trades


def price_book_for_partner(
    *, partner: PartnerProfile, service_area: ServiceArea, skill_code: str | None = None
) -> list[PriceBookEntry]:
    """Every catalog item this Partner's skills cover, with the band and their own rate.

    One read for two screens (§6 of the build prompt): the rate-card editor and the composer's
    catalog both call this, so the two can never disagree about what band a rate must sit inside.

    **A rate the Partner never set is the city reference.** A new Partner can quote on day one;
    the entry says `is_default_rate` so the screen can show "set your own" rather than pretend.
    An item with no published rate for this Partner's area is still listed — the band and the
    rate are `None` — so the screen can say "not priced here yet" rather than silently omit it.
    """

    trades = [skill_code] if skill_code else pricing_trades_for_partner(partner)
    items = list(
        WorkItem.objects.filter(skill__code__in=trades, status=WorkItem.Status.ACTIVE)
        .select_related("skill")
        .order_by("skill__name", "sort_order", "name")
    )
    try:
        policy = active_guardrail_policy()
    except GuardrailPolicyUnavailableError:
        policy = None
    saved = {
        row.work_item_id: row
        for row in PartnerRateItem.objects.filter(partner=partner, work_item__in=items)
    }
    entries: list[PriceBookEntry] = []
    for item in items:
        band = (
            band_for_item_in_area(work_item=item, service_area=service_area, policy=policy)
            if policy
            else None
        )
        own = saved.get(item.id)
        reference = band["reference_rate_paise"] if band else None
        entries.append(
            PriceBookEntry(
                work_item=item,
                reference_rate_paise=reference,
                rate_version=band["rate_version"] if band else None,
                floor_paise=band["floor_paise"] if band else None,
                ceiling_paise=band["ceiling_paise"] if band else None,
                partner_rate_paise=own.rate_paise if own else reference,
                partner_is_active=own.is_active if own else reference is not None,
                is_default_rate=own is None,
                trade_code=item.skill.code,
                trade_name=item.skill.name,
            )
        )
    return entries


@transaction.atomic
def set_partner_rate(
    *,
    partner: PartnerProfile,
    work_item_id: uuid.UUID,
    service_area: ServiceArea,
    rate_paise: int,
    is_active: bool,
) -> PartnerRateItem:
    """Save the Partner's own rate for one item, band-checked for their service area.

    Convenience only — see this module's docstring. `validate_quote_guardrails` is the check that
    actually protects a Customer, and it runs again at submission against whatever the band is
    *then*.
    """

    if rate_paise <= 0:
        raise ProposalShapeError("A rate must be a positive amount.")
    work_item = WorkItem.objects.select_related("skill").get(
        pk=work_item_id, status=WorkItem.Status.ACTIVE
    )
    policy = active_guardrail_policy()
    band = band_for_item_in_area(work_item=work_item, service_area=service_area, policy=policy)
    if band is None:
        raise WorkItemRateUnavailableError()
    if not (band["floor_paise"] <= rate_paise <= band["ceiling_paise"]):
        raise RateOutsideBandError(
            f"The allowed range for {work_item.name} here is "
            f"₹{band['floor_paise'] / 100:.2f} to ₹{band['ceiling_paise'] / 100:.2f}."
        )
    item_row, _created = PartnerRateItem.objects.update_or_create(
        partner=partner,
        work_item=work_item,
        defaults={"rate_paise": rate_paise, "is_active": is_active},
    )
    return item_row


# ---------------------------------------------------------------------------
# Quote-time enforcement. Called from `financials.calculate_estimate` for every A5 item-wise
# estimate that carries a catalog or custom line — see that module for where the results join
# the money ladder.
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class GuardrailCheckResult:
    """What `validate_quote_guardrails` decided, folded into `financials`' snapshot and lines."""

    policy_version: int | None
    #: Item lines with `reference_rate_paise`/`band_floor_paise`/`band_ceiling_paise`/`rate_version`
    #: attached to every catalog line; custom lines carry `is_custom: True` and nothing else new.
    item_lines: list[dict[str, Any]]


def _screen_custom_title(title: str) -> None:
    """Reuse `proposals.looks_like_contact_sharing` — the one contact-detection pattern in this
    codebase — rather than inventing a second one that could drift from it.

    Imported inline rather than at module scope: `proposals` imports `financials`, and
    `financials.calculate_estimate` calls into this module, so a top-level import here would
    close the cycle `financials -> price_book -> proposals -> financials`.
    """

    from apps.requirements.proposals import looks_like_contact_sharing  # noqa: PLC0415

    if looks_like_contact_sharing(title):
        raise CustomTitleScreenedError()


def _annotate_catalog_lines(
    *,
    item_lines: list[dict[str, Any]],
    catalog_lines: list[dict[str, Any]],
    service_area: ServiceArea,
    policy: QuoteGuardrailPolicy,
) -> list[dict[str, Any]]:
    """Band-check every catalog line and attach its resolved band to the snapshot.

    Returns the full line list — catalog lines annotated, custom lines marked, original order.
    """

    work_items = {
        item.id: item
        for item in WorkItem.objects.select_related("skill").filter(
            id__in=[line["work_item_id"] for line in catalog_lines],
            status=WorkItem.Status.ACTIVE,
        )
    }
    annotated_items: list[dict[str, Any]] = []
    for line in item_lines:
        if not line.get("work_item_id"):
            annotated_items.append(
                {**line, "is_custom": True, "category": str(line.get("category") or "Custom")}
            )
            continue
        work_item_id = uuid.UUID(str(line["work_item_id"]))
        work_item = work_items.get(work_item_id)
        if work_item is None:
            raise ProposalShapeError("One of your rate-card items is no longer available.")
        band = band_for_item_in_area(work_item=work_item, service_area=service_area, policy=policy)
        if band is None:
            raise WorkItemRateUnavailableError(
                f"{work_item.name} has no published rate in your service area."
            )
        rate_paise = int(line["rate_paise"])
        if not (band["floor_paise"] <= rate_paise <= band["ceiling_paise"]):
            raise RateOutsideBandError(
                f"{work_item.name} must be priced between "
                f"₹{band['floor_paise'] / 100:.2f} and ₹{band['ceiling_paise'] / 100:.2f}."
            )
        annotated_items.append(
            {
                **line,
                "work_item_id": str(work_item_id),
                "is_custom": False,
                # The catalogue's own words, so every Partner's line reads the same on a
                # comparison; the composer sends whatever it had.
                "title": work_item.name,
                "category": work_item.group or str(line.get("category") or ""),
                "reference_rate_paise": band["reference_rate_paise"],
                "band_floor_paise": band["floor_paise"],
                "band_ceiling_paise": band["ceiling_paise"],
                "rate_version": band["rate_version"],
            }
        )
    return annotated_items


def validate_quote_guardrails(
    *,
    service_area: ServiceArea | None,
    item_lines: list[dict[str, Any]],
) -> GuardrailCheckResult:
    """Enforce the price-book rules against the *current* catalog and policy.

    A line with `work_item_id` is a catalog line and must sit inside its band; any other line is
    a custom line the Partner typed on site, allowed as-is once its title passes the contact
    screen. With no catalog line at all the policy is not even consulted — an older client, a
    labour-wise estimate or an all-custom estimate passes through untouched.
    """

    catalog_lines = [line for line in item_lines if line.get("work_item_id")]
    for line in item_lines:
        if line.get("work_item_id"):
            continue
        title = str(line.get("title") or "").strip()
        if not title:
            raise ProposalShapeError("Every item needs a name.")
        _screen_custom_title(title)

    if not catalog_lines:
        return GuardrailCheckResult(
            policy_version=None,
            item_lines=[
                {**line, "is_custom": True, "category": str(line.get("category") or "Custom")}
                for line in item_lines
            ],
        )
    if service_area is None:
        raise WorkItemRateUnavailableError(
            "This request has no service area, so rate-card items cannot be checked."
        )

    policy = active_guardrail_policy()
    annotated = _annotate_catalog_lines(
        item_lines=item_lines,
        catalog_lines=catalog_lines,
        service_area=service_area,
        policy=policy,
    )
    return GuardrailCheckResult(policy_version=policy.version, item_lines=annotated)


# ---------------------------------------------------------------------------
# The shopping list: what the Customer buys, from the items the Partner tapped.
# ---------------------------------------------------------------------------


def _decimal(value: object, default: Decimal = Decimal(0)) -> Decimal:
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return default


def shopping_list_for_lines(  # noqa: PLR0912 - one pass: aggregate, then round to packs
    item_lines: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Aggregate every catalog line's material recipe into one list, rounded up to packs.

    Quantities only — never money. Entries with the same title/spec/unit merge, and a recipe that
    names a pack ("90 m coil") reports whole packs rather than raw metres, because that is what
    the shop sells and what the Customer should ask for. The Partner corrects quantities before
    sending; this is the starting point that spares them typing sixteen rows.
    """

    ids: list[uuid.UUID] = []
    for line in item_lines:
        raw = line.get("work_item_id")
        if raw:
            ids.append(uuid.UUID(str(raw)))
    if not ids:
        return []
    recipes = {
        item.id: item.material_recipe
        for item in WorkItem.objects.filter(id__in=ids).only("id", "material_recipe")
    }

    totals: dict[tuple[str, str, str], dict[str, Any]] = {}
    order: list[tuple[str, str, str]] = []
    for line in item_lines:
        raw = line.get("work_item_id")
        if not raw:
            continue
        recipe = recipes.get(uuid.UUID(str(raw))) or []
        quantity = _decimal(line.get("quantity"), Decimal(1))
        for entry in recipe:
            if not isinstance(entry, dict):
                continue
            title = str(entry.get("title") or "").strip()
            if not title:
                continue
            spec = str(entry.get("spec") or "").strip()
            unit = str(entry.get("unit") or "").strip()
            key = (title, spec, unit)
            if key not in totals:
                order.append(key)
                totals[key] = {
                    "title": title,
                    "spec": spec,
                    "unit": unit,
                    "raw": Decimal(0),
                    "pack_size": _decimal(entry.get("pack_size")),
                    "pack_unit": str(entry.get("pack_unit") or "").strip(),
                }
            totals[key]["raw"] += _decimal(entry.get("per_unit")) * quantity

    result: list[dict[str, Any]] = []
    for key in order:
        row = totals[key]
        raw_total: Decimal = row["raw"]
        if raw_total <= 0:
            continue
        pack_size: Decimal = row["pack_size"]
        if pack_size > 0 and row["pack_unit"]:
            packs = math.ceil(raw_total / pack_size)
            result.append(
                {
                    "title": row["title"],
                    "spec": row["spec"],
                    "unit": row["pack_unit"],
                    "quantity": str(packs),
                    "note": f"about {raw_total.normalize():f} {row['unit']}".strip(),
                }
            )
        else:
            result.append(
                {
                    "title": row["title"],
                    "spec": row["spec"],
                    "unit": row["unit"],
                    "quantity": str(math.ceil(raw_total)),
                    "note": "",
                }
            )
    return result


# ---------------------------------------------------------------------------
# Operations: promoting a custom item into the catalog. Nothing queues reviews any more — a
# Partner's custom line goes out with the estimate — but Operations can still read the queue
# table and graduate an item they noticed into the catalog.
# ---------------------------------------------------------------------------


@transaction.atomic
def resolve_custom_item_review(
    *,
    actor: User,
    review_id: uuid.UUID,
    approve: bool,
    skill_id: uuid.UUID | None = None,
) -> CustomWorkItemReview:
    """Operations approves a custom line into the catalog, or rejects it.

    Approval creates the `WorkItem` in the same transaction — it does not touch `WorkItemRate`,
    because a reference rate is Operations' own separate market decision
    (`publish_reference_rate`), not something this review's one Partner's price implies.
    """

    review = CustomWorkItemReview.objects.select_for_update().get(pk=review_id)
    if review.status != CustomWorkItemReview.Status.PENDING:
        raise ProposalShapeError("This custom item has already been resolved.")
    if approve:
        if skill_id is None:
            raise ProposalShapeError("Choose which skill this item belongs to before approving it.")
        skill = Skill.objects.get(pk=skill_id)
        work_item = WorkItem.objects.create(
            skill=skill,
            name=review.title,
            unit=review.unit,
            status=WorkItem.Status.ACTIVE,
        )
        review.status = CustomWorkItemReview.Status.APPROVED
        review.promoted_work_item = work_item
    else:
        review.status = CustomWorkItemReview.Status.REJECTED
    review.resolved_by = actor
    review.resolved_at = timezone.now()
    review.save(update_fields=("status", "promoted_work_item", "resolved_by", "resolved_at"))
    return review
