"""Phase A: the vendor price book — anchor-and-band rate cards for A5 item-wise estimates.

Every A5 item-wise estimate line today (`Proposal.item_lines`) is typed from scratch: a Partner
names their own item, unit and rate on every single enquiry, with nothing to compare it against
and nothing to stop an absurd number reaching a Customer with this platform's name on the quote.

The shapes below give a Partner a personal rate card while keeping the platform, not the
Partner, the author of what a "6A switch fixing" costs *at all*:

* `WorkItem` is Operations' catalog of nameable work per skill — the only vocabulary a Partner's
  saved rate or a quote line may use. A Partner cannot invent a customer-visible item name; they
  can only set a rate against one Operations published.
* `WorkItemRate` is the published reference price for one item in one city, on the same
  loaded-never-edited pattern as `rate_cards.RateCard` — a booking made against one version never
  moves when Operations re-anchors it.
* `QuoteGuardrailPolicy` is every ops-editable percentage this feature enforces: how far a
  Partner's rate may sit from the reference (the "band"), and the caps on the two markup dials a
  Partner may add over their own priced lines (Miscellaneous, Margin). Versioned exactly like
  `financial.CommercialPolicy`, because these are commercial terms with the same audit weight.
* `PartnerRateItem` is one Partner's own rate for one catalog item — their price book.
* `CustomWorkItemReview` is the escape hatch: a line a Partner priced that is not in the catalog
  yet, held for Operations to approve into it or reject.

None of this touches A3. A3 pricing is `rate_cards.RateCard` — Operations' own published day
rate, with no Partner-set number anywhere in it. This module is exclusively the A5 item-wise
composer's vocabulary.
"""

from __future__ import annotations

import uuid
from typing import Any, Final

from django.conf import settings
from django.db import models

from apps.locations.models import ServiceArea
from apps.partners.models import PartnerProfile

#: 100% in the codebase's basis-point convention. Every percentage field below is bounded by this.
MAX_BASIS_POINTS: Final[int] = 10_000


class WorkItem(models.Model):
    """One nameable unit of work in a trade's catalog, Operations-authored.

    The *only* vocabulary a Partner's saved rate or a quote's catalog line may use — a Partner
    picks one of these and sets a rate against it, and never types a customer-visible item name.
    That is what keeps every electrician's "6A switch fixing" the same three words on every quote
    a Customer compares, and what keeps a phone number or an off-platform handle out of an item
    name entirely: there is no free-text field for either to hide in.

    Retired rather than deleted (`status`), because a `WorkItemRate` and a `PartnerRateItem` both
    point here and a quote already sent may still reference it through its snapshot.
    """

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        RETIRED = "RETIRED", "Retired"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    #: The statutory/dispatch skill this item belongs to — the same FK `RateCard.skill` and
    #: `PartnerProfile`'s capability rows use, so "which items can this Partner price" is answered
    #: by the same skill vocabulary as the rest of the platform.
    skill = models.ForeignKey(
        "partners.Skill",
        on_delete=models.PROTECT,
        related_name="work_items",
    )
    #: Customer-visible. Operations-authored so it reads the same on every Partner's quote.
    name = models.CharField(max_length=120)
    #: Constrained to `financials.ALLOWED_UNITS` at the serializer layer — this module does not
    #: import `financials` to avoid a cycle (`financials` will import this module's resolver).
    unit = models.CharField(max_length=16)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.ACTIVE)
    #: Display order inside the skill's catalog. Not unique — Operations reorders by editing many
    #: rows, same as any hand-curated list.
    sort_order = models.PositiveIntegerField(default=0)
    #: The composer's tab this item sits under — "Points", "MCB / DB", "Labour". Operations-
    #: authored free text, grouped by exact match; blank lands under the catalog's last tab.
    group = models.CharField(max_length=40, blank=True)
    #: What one unit of this item consumes, so the estimate can hand the Customer a shopping
    #: list without the Partner typing one (materials are always the Customer's to buy). Each
    #: entry: `{title, spec, unit, per_unit, pack_size?, pack_unit?}` — `per_unit` is the
    #: quantity per unit of work as a decimal string; a pack rounds the total up to what a
    #: shop actually sells ("90 m coil"). Empty for labour-day items and anything consumable-free.
    material_recipe = models.JSONField(default=list, blank=True)
    #: Suggested quantities per quick set, keyed by set code (`{"1bhk": 8, "2bhk": 12}`). An
    #: item absent from a set is simply not added when the Partner taps that set.
    bundle_quantities = models.JSONField(default=dict, blank=True)
    #: Per-item band override, in basis points below/above the reference rate. **Both** must be set
    #: together or **both** must be null — see `Meta.constraints` — because a floor with no ceiling
    #: (or the reverse) is a policy nobody actually approved for this one item.
    band_below_bps = models.PositiveIntegerField(null=True, blank=True)
    band_above_bps = models.PositiveIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("skill", "sort_order", "name")
        constraints = [
            models.UniqueConstraint(
                fields=("skill", "name"),
                condition=models.Q(status="ACTIVE"),
                name="requirements_unique_active_work_item_name",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(band_below_bps__isnull=True, band_above_bps__isnull=True)
                    | models.Q(band_below_bps__isnull=False, band_above_bps__isnull=False)
                ),
                name="requirements_work_item_band_override_paired",
            ),
            models.CheckConstraint(
                condition=models.Q(band_below_bps__isnull=True)
                | models.Q(band_below_bps__lte=MAX_BASIS_POINTS),
                name="requirements_work_item_band_below_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(band_above_bps__isnull=True)
                | models.Q(band_above_bps__lte=MAX_BASIS_POINTS),
                name="requirements_work_item_band_above_valid",
            ),
        ]
        indexes = [
            models.Index(fields=("skill", "status")),
        ]

    def __str__(self) -> str:
        return f"{self.skill_id}:{self.name}"

    def has_band_override(self) -> bool:
        return self.band_below_bps is not None and self.band_above_bps is not None


class WorkItemRate(models.Model):
    """Operations' published reference rate for one `WorkItem` in one `ServiceArea`.

    Loaded, never edited — the same pattern `RateCard` documents for the same reason: a Partner's
    rate validated against version 3 of this item's Hyderabad reference must still reconcile
    against version 3 after Operations publishes version 4 next month. `publish_reference_rate`
    (in `price_book.py`, the command module) is the only writer and it retires the previous
    `PUBLISHED` row in the same transaction it inserts this one.
    """

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        PUBLISHED = "PUBLISHED", "Published"
        RETIRED = "RETIRED", "Retired"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    work_item = models.ForeignKey(WorkItem, on_delete=models.PROTECT, related_name="rates")
    service_area = models.ForeignKey(
        ServiceArea, on_delete=models.PROTECT, related_name="work_item_rates"
    )
    #: Per (work_item, service_area), starting at 1. Not a global sequence — each item/city pair
    #: has its own version history, the same shape `RateCardBooking` reads `RateCard` through.
    version = models.PositiveIntegerField()
    reference_rate_paise = models.PositiveBigIntegerField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    published_at = models.DateTimeField(null=True, blank=True)
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="work_item_rates_published",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("work_item", "service_area", "-version")
        constraints = [
            models.UniqueConstraint(
                fields=("work_item", "service_area", "version"),
                name="requirements_unique_work_item_rate_version",
            ),
            # Exactly one live reference price per item per city — the number every Partner's band
            # and every quote's snapshot resolves against right now.
            models.UniqueConstraint(
                fields=("work_item", "service_area"),
                condition=models.Q(status="PUBLISHED"),
                name="requirements_one_published_work_item_rate",
            ),
            models.CheckConstraint(
                condition=models.Q(reference_rate_paise__gt=0),
                name="requirements_work_item_rate_positive",
            ),
        ]
        indexes = [
            models.Index(fields=("work_item", "service_area", "status")),
        ]

    def __str__(self) -> str:
        return (
            f"{self.work_item_id}:{self.service_area_id}:"
            f"v{self.version}:{self.reference_rate_paise}"
        )


class QuoteGuardrailPolicy(models.Model):
    """Every Operations-flexible percentage Phase A enforces, versioned like `CommercialPolicy`.

    Nothing in this feature is a hardcoded number. The band a Partner's rate must sit inside, the
    caps on the Miscellaneous and Margin dials, and the ceiling on how much of a quote may be
    custom (unlisted) items are all read from the one `ACTIVE` row here — so Operations can widen a
    band for a thin-supply city, tighten a margin cap after a complaint pattern, or raise the
    custom-item ceiling for a trade the catalog does not cover well yet, all without a deploy.

    `Proposal.calculation_snapshot["guardrail_policy_version"]` freezes which version a quote was
    checked against, on the same "a booking never moves under a later policy edit" principle every
    versioned policy in this codebase already keeps.
    """

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        ACTIVE = "ACTIVE", "Active"
        RETIRED = "RETIRED", "Retired"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    version = models.PositiveIntegerField(unique=True)
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.DRAFT)
    approval_reference = models.CharField(max_length=120, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="quote_guardrail_policies_approved",
    )
    effective_from = models.DateTimeField(null=True, blank=True)

    #: The default band, applied whenever neither a per-item nor a per-skill override exists.
    #: Basis points below/above the published reference rate. Seeded at -20%/+30%.
    default_band_below_bps = models.PositiveIntegerField(null=True, blank=True)
    default_band_above_bps = models.PositiveIntegerField(null=True, blank=True)
    #: The Miscellaneous and Margin dial ceilings a Partner may add over their priced lines,
    #: expressed as a share of the catalog-line subtotal. Seeded at 10% and 25%.
    misc_cap_bps = models.PositiveIntegerField(null=True, blank=True)
    margin_cap_bps = models.PositiveIntegerField(null=True, blank=True)
    #: How much of a quote's catalog-line subtotal may be covered by custom (unlisted) items.
    #: Seeded at 20%. A quote made entirely of custom items is refused regardless of this value —
    #: see `price_book.validate_quote_guardrails` — because at least one catalog line must anchor
    #: every quote to a price Operations has actually reviewed.
    custom_share_cap_bps = models.PositiveIntegerField(null=True, blank=True)
    #: Optional per-skill band override, the middle layer between a per-item override and the
    #: policy default: `{"<skill_id>": {"below_bps": int, "above_bps": int}}`. Validated in
    #: `serializers.price_book` — every key must be a real skill id, every value a paired,
    #: in-range band.
    per_skill_bands = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-version",)
        verbose_name_plural = "quote guardrail policies"
        constraints = [
            models.UniqueConstraint(
                fields=("status",),
                condition=models.Q(status="ACTIVE"),
                name="requirements_one_active_quote_guardrail_policy",
            ),
            models.CheckConstraint(
                condition=models.Q(default_band_below_bps__isnull=True)
                | models.Q(default_band_below_bps__lte=MAX_BASIS_POINTS),
                name="requirements_guardrail_default_band_below_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(default_band_above_bps__isnull=True)
                | models.Q(default_band_above_bps__lte=MAX_BASIS_POINTS),
                name="requirements_guardrail_default_band_above_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(misc_cap_bps__isnull=True)
                | models.Q(misc_cap_bps__lte=MAX_BASIS_POINTS),
                name="requirements_guardrail_misc_cap_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(margin_cap_bps__isnull=True)
                | models.Q(margin_cap_bps__lte=MAX_BASIS_POINTS),
                name="requirements_guardrail_margin_cap_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(custom_share_cap_bps__isnull=True)
                | models.Q(custom_share_cap_bps__lte=MAX_BASIS_POINTS),
                name="requirements_guardrail_custom_share_cap_valid",
            ),
            # An ACTIVE policy must be complete — the same "no field silently governs by omission"
            # rule `CommercialPolicy` enforces at the database, not only at the call site.
            models.CheckConstraint(
                condition=~models.Q(status="ACTIVE")
                | models.Q(
                    approved_at__isnull=False,
                    approved_by__isnull=False,
                    approval_reference__gt="",
                    effective_from__isnull=False,
                    default_band_below_bps__isnull=False,
                    default_band_above_bps__isnull=False,
                    misc_cap_bps__isnull=False,
                    margin_cap_bps__isnull=False,
                    custom_share_cap_bps__isnull=False,
                ),
                name="requirements_active_quote_guardrail_policy_complete",
            ),
        ]

    def __str__(self) -> str:
        return f"quote-guardrail-policy:{self.version}:{self.status}"

    def skill_band_override(self, *, skill_id: uuid.UUID) -> tuple[int, int] | None:
        """The per-skill band for this skill, if the policy sets one. `None` means "no override"."""

        raw = (
            self.per_skill_bands.get(str(skill_id))
            if isinstance(self.per_skill_bands, dict)
            else None
        )
        if not isinstance(raw, dict):
            return None
        below = raw.get("below_bps")
        above = raw.get("above_bps")
        if not isinstance(below, int) or not isinstance(above, int):
            return None
        return below, above


class PartnerRateItem(models.Model):
    """One Partner's own rate for one `WorkItem` — their personal price book.

    Validated against the item's resolved band **for the Partner's own service area** on every
    write, so the rate-card screen refuses out-of-band input immediately. That validation is a
    convenience, not the guarantee: `price_book.validate_quote_line` re-checks every catalog line
    against the *current* band at quote submission, because a band Operations narrows after this
    row was saved must not let a stale rate through on the next quote.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.ForeignKey(
        PartnerProfile, on_delete=models.CASCADE, related_name="rate_book_items"
    )
    work_item = models.ForeignKey(WorkItem, on_delete=models.PROTECT, related_name="partner_rates")
    rate_paise = models.PositiveBigIntegerField()
    #: An inactive item is kept (not deleted) but never offered by the composer's "from my rate
    #: card" list — the same soft-hide the electrical flow's "Deactivate" control describes.
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("work_item__sort_order", "work_item__name")
        constraints = [
            models.UniqueConstraint(
                fields=("partner", "work_item"),
                name="requirements_unique_partner_rate_item",
            ),
            models.CheckConstraint(
                condition=models.Q(rate_paise__gt=0),
                name="requirements_partner_rate_item_positive",
            ),
        ]
        indexes = [
            models.Index(fields=("partner", "is_active")),
        ]

    def __str__(self) -> str:
        return f"{self.partner_id}:{self.work_item_id}:{self.rate_paise}"


class CustomWorkItemReview(models.Model):
    """A quote line naming work outside the catalog, held for Operations to judge.

    Not a refusal mechanism — a Partner is allowed to price a job the catalog does not cover yet
    (§5's caps and screening still apply to the line itself). This is the *learning loop*: every
    custom line a Customer actually paid for is a candidate to become a real `WorkItem`, priced
    from what Partners in the field are actually charging rather than from an office guess.
    """

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending review"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.ForeignKey(
        PartnerProfile, on_delete=models.PROTECT, related_name="custom_work_item_reviews"
    )
    #: The quote this line appeared on. Nullable: a review created from `submit_proposal` always
    #: has one, but nothing stops a future admin-only "propose an item" path from leaving it blank.
    proposal = models.ForeignKey(
        "requirements.Proposal",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="custom_work_item_reviews",
    )
    title = models.CharField(max_length=200)
    unit = models.CharField(max_length=16)
    rate_paise = models.PositiveBigIntegerField()
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.PENDING)
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="custom_work_item_reviews_resolved",
    )
    resolved_at = models.DateTimeField(null=True, blank=True)
    #: Set when Operations approves this line straight into the catalog as a new `WorkItem`.
    promoted_work_item = models.ForeignKey(
        WorkItem,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="promoted_from_reviews",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)
        constraints = [
            models.CheckConstraint(
                condition=models.Q(rate_paise__gt=0),
                name="requirements_custom_work_item_review_rate_positive",
            ),
            models.CheckConstraint(
                condition=~(models.Q(status="PENDING") & models.Q(resolved_at__isnull=False)),
                name="requirements_custom_work_item_review_pending_unresolved",
            ),
        ]
        indexes = [
            models.Index(fields=("status", "created_at")),
            models.Index(fields=("partner", "status")),
        ]

    def __str__(self) -> str:
        return f"{self.partner_id}:{self.title}:{self.status}"


def resolve_band(
    *,
    work_item: WorkItem,
    policy: QuoteGuardrailPolicy,
) -> tuple[int, int]:
    """The (below_bps, above_bps) band for one item, resolved through all three override layers.

    Pure and total against a *complete* policy: an `ACTIVE` `QuoteGuardrailPolicy` is guaranteed by
    its own database constraint to carry non-null defaults, so this never has to invent a
    fallback. Resolution order, most specific first:

    1. The item's own `band_below_bps`/`band_above_bps`, if both are set.
    2. The policy's `per_skill_bands` entry for this item's skill, if present.
    3. The policy's `default_band_below_bps`/`default_band_above_bps`.
    """

    if work_item.has_band_override():
        assert work_item.band_below_bps is not None  # noqa: S101 - narrows for mypy; guarded above
        assert work_item.band_above_bps is not None  # noqa: S101
        return work_item.band_below_bps, work_item.band_above_bps

    skill_override = policy.skill_band_override(skill_id=work_item.skill_id)
    if skill_override is not None:
        return skill_override

    assert policy.default_band_below_bps is not None  # noqa: S101
    assert policy.default_band_above_bps is not None  # noqa: S101
    return policy.default_band_below_bps, policy.default_band_above_bps


def band_bounds_paise(
    *, reference_rate_paise: int, below_bps: int, above_bps: int
) -> tuple[int, int]:
    """The (floor, ceiling) in paise for a reference rate and a resolved band.

    Floor rounds up and ceiling rounds down — both directions narrow the allowed range rather than
    widen it, so integer rounding can never let a rate through that the band, read exactly, would
    have refused.
    """

    floor = -(-(reference_rate_paise * (MAX_BASIS_POINTS - below_bps)) // MAX_BASIS_POINTS)
    ceiling = (reference_rate_paise * (MAX_BASIS_POINTS + above_bps)) // MAX_BASIS_POINTS
    return floor, ceiling


def band_for_item_in_area(
    *,
    work_item: WorkItem,
    service_area: ServiceArea,
    policy: QuoteGuardrailPolicy,
) -> dict[str, Any] | None:
    """The full band context for one item in one city, or `None` with no published rate.

    The one function both the partner price-book screen and quote-submission validation call, so
    the two can never resolve a different band for the same item.
    """

    rate = (
        WorkItemRate.objects.filter(
            work_item=work_item, service_area=service_area, status=WorkItemRate.Status.PUBLISHED
        )
        .order_by("-version")
        .first()
    )
    if rate is None:
        return None
    below_bps, above_bps = resolve_band(work_item=work_item, policy=policy)
    floor_paise, ceiling_paise = band_bounds_paise(
        reference_rate_paise=rate.reference_rate_paise,
        below_bps=below_bps,
        above_bps=above_bps,
    )
    return {
        "work_item_id": work_item.id,
        "reference_rate_paise": rate.reference_rate_paise,
        "rate_version": rate.version,
        "below_bps": below_bps,
        "above_bps": above_bps,
        "floor_paise": floor_paise,
        "ceiling_paise": ceiling_paise,
    }
