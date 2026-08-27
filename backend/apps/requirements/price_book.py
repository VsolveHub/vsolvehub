"""Phase A: the vendor price book — commands, guardrail resolution, and quote-time enforcement.

The one rule this module exists to keep: **the guarantee lives here, not in the composer UI.** A
Partner's saved rate is validated on write for convenience; every check below runs again, against
the live catalog and the live policy, at the moment a quote is actually submitted
(`validate_quote_guardrails`, called from `financials.calculate_estimate` for every A5 item-wise
estimate). A band Operations narrows, or a cap Operations lowers, between the Partner saving a rate
and sending a quote is caught here — never assumed from a client that might be stale, patched, or
lying.

Money in this module is otherwise dumb arithmetic: `financials.py` owns tax, commission, platform
fee and reconciliation. This module answers exactly two questions — "is this rate allowed" and "is
this quote's shape allowed" — and hands `financials` a clean, already-validated set of lines plus
two dial amounts to fold into the existing money ladder.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.identity.models import User
from apps.locations.models import ServiceArea
from apps.partners.models import PartnerProfile, Skill
from apps.requirements.exceptions import (
    CustomOnlyQuoteError,
    CustomShareExceededError,
    CustomTitleScreenedError,
    DialOverCapError,
    GuardrailPolicyUnavailableError,
    ProposalShapeError,
    RateOutsideBandError,
    WorkItemRateUnavailableError,
)
from apps.requirements.models import (
    CustomWorkItemReview,
    PartnerRateItem,
    Proposal,
    QuoteGuardrailPolicy,
    WorkItem,
    WorkItemRate,
    band_for_item_in_area,
)

#: `financials._bps`, duplicated rather than imported: that helper is private to the money module
#: and this module's rounding never touches a money total `financials` also computes, so importing
#: it would be a coupling with nothing behind it. Both round half-up on the same 10,000 basis.
_MAX_BASIS_POINTS = 10_000


def _round_bps(amount_paise: int, basis_points: int) -> int:
    return (amount_paise * basis_points + 5_000) // _MAX_BASIS_POINTS


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
    policy = (
        QuoteGuardrailPolicy.objects.filter(
            status=QuoteGuardrailPolicy.Status.ACTIVE,
            approved_at__isnull=False,
            approved_by__isnull=False,
            effective_from__lte=moment,
        )
        .first()
    )
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


def price_book_for_partner(
    *, partner: PartnerProfile, service_area: ServiceArea
) -> list[PriceBookEntry]:
    """Every catalog item this Partner's skills cover, with the band and their own saved rate.

    One read for two screens (§6 of the build prompt): the rate-card editor and the composer's
    "from my rate card" list both call this, so the two can never disagree about what band a rate
    must sit inside. An item with no published rate for this Partner's area is still listed —
    `reference_rate_paise` and the band are `None` — so the screen can say "not priced here yet"
    rather than silently omitting the item.
    """

    skill_ids = list(
        partner.skill_links.filter(is_active=True).values_list("skill_id", flat=True)
    )
    items = list(
        WorkItem.objects.filter(skill_id__in=skill_ids, status=WorkItem.Status.ACTIVE).order_by(
            "sort_order", "name"
        )
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
        entries.append(
            PriceBookEntry(
                work_item=item,
                reference_rate_paise=band["reference_rate_paise"] if band else None,
                rate_version=band["rate_version"] if band else None,
                floor_paise=band["floor_paise"] if band else None,
                ceiling_paise=band["ceiling_paise"] if band else None,
                partner_rate_paise=own.rate_paise if own else None,
                partner_is_active=own.is_active if own else False,
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
# estimate — see that module for where these results join the money ladder.
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class GuardrailCheckResult:
    """What `validate_quote_guardrails` decided, folded into `financials`' snapshot and lines."""

    policy_version: int
    #: Item lines with `reference_rate_paise`/`band_floor_paise`/`band_ceiling_paise`/`rate_version`
    #: attached to every catalog line, unchanged on every custom line.
    item_lines: list[dict[str, Any]]
    misc_amount_paise: int
    margin_amount_paise: int
    custom_reviews: list[CustomWorkItemReview]


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
) -> tuple[list[dict[str, Any]], int]:
    """Band-check every catalog line and attach its resolved band to the snapshot.

    Returns the full line list (catalog lines annotated, custom lines untouched, in original
    order) and the catalog-only subtotal the custom-share cap is measured against.
    """

    work_items = {
        item.id: item
        for item in WorkItem.objects.select_related("skill").filter(
            id__in=[line["work_item_id"] for line in catalog_lines],
            status=WorkItem.Status.ACTIVE,
        )
    }
    annotated_items: list[dict[str, Any]] = []
    catalog_subtotal = 0
    for line in item_lines:
        if not line.get("work_item_id"):
            annotated_items.append(line)
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
        catalog_subtotal += int(line.get("amount_paise") or 0)
        annotated_items.append(
            {
                **line,
                "reference_rate_paise": band["reference_rate_paise"],
                "band_floor_paise": band["floor_paise"],
                "band_ceiling_paise": band["ceiling_paise"],
                "rate_version": band["rate_version"],
            }
        )
    return annotated_items, catalog_subtotal


def _assert_custom_share_within_cap(
    *, custom_lines: list[dict[str, Any]], catalog_subtotal: int, policy: QuoteGuardrailPolicy
) -> None:
    if not custom_lines:
        return
    custom_subtotal = sum(int(line.get("amount_paise") or 0) for line in custom_lines)
    custom_share_bps = (
        (custom_subtotal * _MAX_BASIS_POINTS) // catalog_subtotal
        if catalog_subtotal > 0
        else _MAX_BASIS_POINTS
    )
    if custom_share_bps > (policy.custom_share_cap_bps or 0):
        raise CustomShareExceededError(
            "Custom items cannot make up more than "
            f"{(policy.custom_share_cap_bps or 0) / 100:.0f}% of your priced items."
        )


def _build_custom_item_reviews(
    *, custom_lines: list[dict[str, Any]], partner: PartnerProfile, proposal: Proposal | None
) -> list[CustomWorkItemReview]:
    reviews: list[CustomWorkItemReview] = []
    for line in custom_lines:
        title = str(line.get("title") or "").strip()
        if not title:
            raise ProposalShapeError("Every custom item needs a description.")
        _screen_custom_title(title)
        reviews.append(
            CustomWorkItemReview(
                partner=partner,
                proposal=proposal,
                title=title,
                unit=str(line.get("unit") or ""),
                rate_paise=int(line.get("rate_paise") or line.get("amount_paise") or 0),
            )
        )
    return reviews


def _assert_dials_within_cap(
    *, misc_bps: int, margin_bps: int, policy: QuoteGuardrailPolicy
) -> None:
    if misc_bps > (policy.misc_cap_bps or 0):
        raise DialOverCapError(
            f"Miscellaneous cannot exceed {(policy.misc_cap_bps or 0) / 100:.0f}%."
        )
    if margin_bps > (policy.margin_cap_bps or 0):
        raise DialOverCapError(f"Margin cannot exceed {(policy.margin_cap_bps or 0) / 100:.0f}%.")


def validate_quote_guardrails(
    *,
    partner: PartnerProfile,
    service_area: ServiceArea,
    item_lines: list[dict[str, Any]],
    line_subtotal_paise: int,
    misc_bps: int,
    margin_bps: int,
    proposal: Proposal | None = None,
) -> GuardrailCheckResult:
    """Enforce every Phase A rule against the *current* catalog and policy. See the build prompt §5.

    Runs only when at least one line carries `work_item_id` or `is_custom` — an A5 estimate that
    never touches the price book (an older client, or a labour-wise estimate) passes through
    untouched, at zero-bps dials, exactly as it did before this feature existed.
    """

    catalog_lines = [line for line in item_lines if line.get("work_item_id")]
    custom_lines = [line for line in item_lines if line.get("is_custom")]
    unclassified = [
        line for line in item_lines if line not in catalog_lines and line not in custom_lines
    ]
    if unclassified:
        raise ProposalShapeError(
            "Every item line must either come from your rate card or be marked as a custom item."
        )
    if not catalog_lines:
        raise CustomOnlyQuoteError()

    policy = active_guardrail_policy()

    annotated_items, catalog_subtotal = _annotate_catalog_lines(
        item_lines=item_lines,
        catalog_lines=catalog_lines,
        service_area=service_area,
        policy=policy,
    )
    _assert_custom_share_within_cap(
        custom_lines=custom_lines, catalog_subtotal=catalog_subtotal, policy=policy
    )
    custom_reviews = _build_custom_item_reviews(
        custom_lines=custom_lines, partner=partner, proposal=proposal
    )
    _assert_dials_within_cap(misc_bps=misc_bps, margin_bps=margin_bps, policy=policy)

    return GuardrailCheckResult(
        policy_version=policy.version,
        item_lines=annotated_items,
        misc_amount_paise=_round_bps(line_subtotal_paise, misc_bps),
        margin_amount_paise=_round_bps(line_subtotal_paise, margin_bps),
        custom_reviews=custom_reviews,
    )


@transaction.atomic
def save_custom_item_reviews(reviews: list[CustomWorkItemReview]) -> None:
    """Persist the custom-item review rows a submitted quote produced.

    Split from `validate_quote_guardrails` on purpose: validation must be able to run as a
    dry-run preview (`proposals.preview_proposal`) without writing anything, and only an actual
    `submit_proposal` should ever queue a review for Operations.
    """

    for review in reviews:
        review.save()


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
