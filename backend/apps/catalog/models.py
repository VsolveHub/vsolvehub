"""Marketable services and their configurable booking questions."""

import uuid
from typing import TYPE_CHECKING, Final

from django.conf import settings
from django.db import models

from apps.catalog.icons import ServiceIconKey


class Category(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    slug = models.SlugField(max_length=100, unique=True)
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    icon_key = models.CharField(max_length=80, blank=True)
    #: Photographic tile for browse surfaces (2026-08-26 owner decision: images, not icons).
    #: Blank is honest — the client falls back to the icon rather than a wrong picture.
    image_url = models.URLField(max_length=500, blank=True, default="")
    display_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("display_order", "name")
        verbose_name_plural = "categories"

    def __str__(self) -> str:
        return self.name


class Subcategory(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    category = models.ForeignKey(
        Category,
        on_delete=models.PROTECT,
        related_name="subcategories",
    )
    slug = models.SlugField(max_length=100)
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    #: The "Select a service" tile. Subcategories are the tile level of the browse
    #: hierarchy (category page -> tile grid -> that tile's services), so they carry
    #: their own glyph and photo; a free CharField like `Category.icon_key`, not the
    #: constrained `ServiceIconKey`, because tiles outnumber the curated glyph set.
    icon_key = models.CharField(max_length=80, blank=True, default="")
    image_url = models.URLField(max_length=500, blank=True, default="")
    display_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("display_order", "name")
        constraints = [
            models.UniqueConstraint(
                fields=("category", "slug"),
                name="catalog_unique_subcategory_slug_per_category",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.category.name} / {self.name}"


class Service(models.Model):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        ACTIVE = "ACTIVE", "Active"
        PAUSED = "PAUSED", "Paused"
        RETIRED = "RETIRED", "Retired"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    if TYPE_CHECKING:
        media: models.Manager["ServiceMedia"]
        variants: models.Manager["ServiceVariant"]
    subcategory = models.ForeignKey(
        Subcategory,
        on_delete=models.PROTECT,
        related_name="services",
    )
    slug = models.SlugField(max_length=140, unique=True)
    name = models.CharField(max_length=160)
    icon_key = models.CharField(
        max_length=40,
        choices=ServiceIconKey.choices,
        default=ServiceIconKey.SERVICE,
    )
    short_description = models.CharField(max_length=240)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT)
    display_order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("display_order", "name")
        constraints = [
            models.CheckConstraint(
                condition=models.Q(icon_key__in=ServiceIconKey.values),
                name="catalog_service_icon_key_supported",
            ),
        ]

    def __str__(self) -> str:
        return self.name


class ServiceVariant(models.Model):
    class BookingArchetype(models.TextChoices):
        LEGACY = "LEGACY", "Legacy"
        A1_TASK_VISIT = "A1_TASK_VISIT", "A1 task visit"
        A3_TIME_BLOCK = "A3_TIME_BLOCK", "A3 time block"
        A5_CUSTOM_PROJECT = "A5_CUSTOM_PROJECT", "A5 custom project"
        A7_RENTAL = "A7_RENTAL", "A7 rental"
        A9_STAY = "A9_STAY", "A9 stay"

    class PricingStrategy(models.TextChoices):
        FIXED = "FIXED", "Fixed"
        DURATION = "DURATION", "Duration based"
        INSPECTION = "INSPECTION", "Inspection first"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    service = models.ForeignKey(Service, on_delete=models.PROTECT, related_name="variants")
    code = models.SlugField(max_length=80)
    name = models.CharField(max_length=160)
    description = models.TextField(blank=True)
    pricing_strategy = models.CharField(max_length=24, choices=PricingStrategy.choices)
    booking_archetype = models.CharField(
        max_length=24,
        choices=BookingArchetype.choices,
        default=BookingArchetype.LEGACY,
    )
    minimum_duration_minutes = models.PositiveSmallIntegerField(default=60)
    recommended_duration_minutes = models.PositiveSmallIntegerField(default=60)
    duration_increment_minutes = models.PositiveSmallIntegerField(default=30)
    maximum_duration_minutes = models.PositiveSmallIntegerField(default=480)
    required_skill_code = models.SlugField(max_length=100)
    tax_category_code = models.SlugField(max_length=100)
    #: Variant-level photo (an AC tonnage, a hair length). Blank falls back to the
    #: service's COVER media on the client, so only genuinely distinct variants need one.
    image_url = models.URLField(max_length=500, blank=True, default="")
    display_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("display_order", "name")
        constraints = [
            models.UniqueConstraint(
                fields=("service", "code"),
                name="catalog_unique_variant_code_per_service",
            ),
            models.CheckConstraint(
                condition=models.Q(minimum_duration_minutes__gt=0),
                name="catalog_variant_min_duration_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(duration_increment_minutes__gt=0),
                name="catalog_variant_increment_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(
                    maximum_duration_minutes__gte=models.F("minimum_duration_minutes")
                ),
                name="catalog_variant_max_duration_gte_min",
            ),
            models.CheckConstraint(
                condition=models.Q(
                    recommended_duration_minutes__gte=models.F("minimum_duration_minutes"),
                )
                & models.Q(
                    recommended_duration_minutes__lte=models.F("maximum_duration_minutes"),
                ),
                name="catalog_variant_recommended_duration_in_bounds",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.service.name}: {self.name}"


class A1VariantConfiguration(models.Model):
    """Versioned Operations-owned scope and fulfilment configuration for one A1 variant."""

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        ACTIVE = "ACTIVE", "Active"
        RETIRED = "RETIRED", "Retired"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    variant = models.ForeignKey(
        ServiceVariant,
        on_delete=models.PROTECT,
        related_name="a1_configurations",
    )
    version = models.PositiveIntegerField()
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT)
    scope_schema = models.JSONField(default=dict)
    required_equipment = models.JSONField(default=list)
    out_of_scope_rules = models.JSONField(default=list)
    evidence_policy = models.JSONField(default=dict)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="a1_variant_configurations_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("variant", "-version")
        constraints = [
            models.UniqueConstraint(
                fields=("variant", "version"),
                name="catalog_unique_a1_variant_configuration_version",
            ),
            models.UniqueConstraint(
                fields=("variant",),
                condition=models.Q(status="ACTIVE"),
                name="catalog_unique_active_a1_variant_configuration",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.variant_id}:v{self.version}:{self.status}"


class A7VariantConfiguration(models.Model):
    """Versioned scope and policy configuration for an A7_RENTAL variant."""

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        ACTIVE = "ACTIVE", "Active"
        RETIRED = "RETIRED", "Retired"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    variant = models.ForeignKey(
        ServiceVariant,
        on_delete=models.PROTECT,
        related_name="a7_configurations",
    )
    version = models.PositiveIntegerField(default=1)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    deposit_required = models.BooleanField(default=True)
    default_deposit_paise = models.PositiveBigIntegerField(default=0)
    pickup_allowed = models.BooleanField(default=True)
    delivery_allowed = models.BooleanField(default=True)
    min_rental_days = models.PositiveSmallIntegerField(default=1)
    max_rental_days = models.PositiveSmallIntegerField(default=30)
    late_fee_per_day_paise = models.PositiveBigIntegerField(default=0)
    minor_damage_cap_paise = models.PositiveBigIntegerField(default=500000)  # INR 5,000
    damage_policy_schema = models.JSONField(default=dict, blank=True)
    asset_profile_schema = models.JSONField(
        default=dict,
        blank=True,
        help_text="JSON Schema for category-specific rental asset attributes.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("variant", "-version")
        constraints = [
            models.UniqueConstraint(
                fields=("variant", "version"),
                name="catalog_unique_a7_variant_configuration_version",
            ),
            models.UniqueConstraint(
                fields=("variant",),
                condition=models.Q(status="ACTIVE"),
                name="catalog_unique_active_a7_variant_configuration",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.variant_id}:v{self.version}:{self.status}"


class A9VariantConfiguration(models.Model):
    """Versioned scope and policy configuration for an A9_STAY variant."""

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        ACTIVE = "ACTIVE", "Active"
        RETIRED = "RETIRED", "Retired"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    variant = models.ForeignKey(
        ServiceVariant,
        on_delete=models.PROTECT,
        related_name="a9_configurations",
    )
    version = models.PositiveIntegerField(default=1)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    deposit_required = models.BooleanField(default=True)
    default_deposit_paise = models.PositiveBigIntegerField(default=0)
    min_stay_nights = models.PositiveSmallIntegerField(default=1)
    max_stay_nights = models.PositiveSmallIntegerField(default=365)
    id_verification_required = models.BooleanField(default=True)
    house_rules_schema = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("variant", "-version")
        constraints = [
            models.UniqueConstraint(
                fields=("variant", "version"),
                name="catalog_unique_a9_variant_configuration_version",
            ),
            models.UniqueConstraint(
                fields=("variant",),
                condition=models.Q(status="ACTIVE"),
                name="catalog_unique_active_a9_variant_configuration",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.variant_id}:v{self.version}:{self.status}"


#: The Wave C4 and C5 policy columns that are meaningless at zero, and the short name each one's
#: check constraint is built from. **The constraints below are generated from this tuple** rather
#: than typed out beside it: Wave C2R lost real time to a hand-copied purpose list whose comment
#: claimed it was generated from the tuple it had drifted from, and `makemigrations --check` cannot
#: see that kind of divergence because model state and migration state agree with each other while
#: both disagree with the code. The short names exist only because PostgreSQL identifiers stop at 63
#: characters and `catalog_m2_configuration_overtime_retroactive_window_minutes_positive` does not.
#:
#: `warranty_retention_basis_points` is deliberately **absent**: zero retention is a decision
#: Operations may legitimately take ("we advertise a warranty and hold nothing back"), so a
#: `> 0` constraint on it would forbid a real configuration. The window is not like that — a
#: warranty period of zero days is not a warranty.
M2_POSITIVE_WHEN_SET_POLICY_FIELDS: Final[tuple[tuple[str, str], ...]] = (
    ("overtime_retroactive_window_minutes", "overtime_window"),
    ("crew_shortfall_standing_threshold", "shortfall_threshold"),
    ("cash_demand_removal_threshold", "cash_demand_threshold"),
    ("vendor_standing_window_days", "standing_window"),
    ("warranty_window_days", "warranty_window"),
    # Wave C6. A case response window of zero hours is a deadline that has already passed when it
    # is set, and an appeal window of zero hours is not an appeal. Both are refusals rather than
    # configurations.
    ("case_response_window_hours", "case_response_window"),
    ("case_appeal_window_hours", "case_appeal_window"),
    # A chargeback alarm that fires on the first charge is noise, not an alarm.
    ("chargeback_alarm_min_charges", "chargeback_alarm_min_charges"),
    # A budget of zero Operations touches per request is unreachable by construction — a request
    # that reaches Operations at all has been touched once — so it would flag every request as a
    # breach and mean nothing.
    ("operations_touch_budget_per_request", "touch_budget"),
)

#: The basis-point policy columns, which are all bounded at 100%. Same rule as the tuple above and
#: for the same reason: the four `<= 10000` constraints that existed before Wave C6 were four
#: hand-written copies of one sentence, and a fifth typed beside them is how the fifth one ends up
#: bounded at 1000.
M2_BASIS_POINT_POLICY_FIELDS: Final[tuple[tuple[str, str], ...]] = (
    ("commission_basis_points", "commission"),
    ("booking_fee_travel_compensation_basis_points", "forfeit_split"),
    ("crew_decline_alarm_basis_points", "decline_alarm"),
    ("warranty_retention_basis_points", "retention"),
    ("chargeback_alarm_basis_points", "chargeback_alarm"),
)


class M2VariantConfiguration(models.Model):
    """Versioned Operations-owned configuration for one A3 or A5 variant.

    Deliberately the same shape as `A1VariantConfiguration`: a version, one active row, and a
    JSON schema that `carts.item_inputs.validate_scope` can check answers against. A second
    configuration shape would mean a second validator.

    `quote_delivery_sla_hours` and `first_quote_sla_hours` are nullable because the SLA per
    category is an open owner decision. Nullable and fail-closed is the honest representation of
    "not decided"; a default here would bake a policy nobody approved into the schema.

    `wage_floor_skill` follows the same rule for the same reason. It is the variant-to-skill
    mapping the A3 minimum-wage guard needs, and it lives here rather than being derived from
    `ServiceVariant.required_skill_code` because that field is the *dispatch* trade slug — it is
    matched against `PartnerSkill` to decide who can be sent, and reusing it as the statutory wage
    classification would silently tie a legal floor to a merchandising decision. Nullable is the
    honest representation of "Operations has not mapped this variant"; `proposals.submit_proposal`
    refuses an A3 quote with `m2_wage_floor_unavailable` rather than skipping the check.
    """

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        ACTIVE = "ACTIVE", "Active"
        RETIRED = "RETIRED", "Retired"

    class MaterialFulfilmentMode(models.TextChoices):
        """Who owns procurement for an estimate, independently of its A3/A5 lifecycle."""

        NOT_APPLICABLE = "NOT_APPLICABLE", "Not applicable"
        CUSTOMER_PROCURES = "CUSTOMER_PROCURES", "Customer procures"
        PARTNER_TURNKEY = "PARTNER_TURNKEY", "Partner supplies turnkey"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    variant = models.ForeignKey(
        ServiceVariant,
        on_delete=models.PROTECT,
        related_name="m2_configurations",
    )
    version = models.PositiveIntegerField()
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT)
    #: Validated by the same helper the A1 cart uses.
    question_schema = models.JSONField(default=dict)
    #: The category-specific questions a *vendor* answers when requesting this capability
    #: (`M2-BE-106`). Same shape, same validator, same version as `question_schema` — one versioned
    #: schema per variant configuration rather than a second question subsystem for registration.
    registration_question_schema = models.JSONField(default=dict, blank=True)
    #: Which statutory wage classification an A3 rate on this variant is measured against.
    #: Operations-owned; null until they map it, and the guard fails closed while it is null.
    wage_floor_skill = models.ForeignKey(
        "partners.Skill",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_variant_configurations",
    )
    #: The **trade** this variant's estimates are priced from — the `Skill.code` whose work-item
    #: catalogue (`requirements.WorkItem`) the composer opens: `electrician` for a rewiring, a
    #: consultation and a day-hire alike. Distinct from `required_skill_code`, which is the
    #: dispatch capability and is per service. Blank falls back to `required_skill_code`.
    pricing_skill_code = models.SlugField(max_length=100, blank=True)
    #: Procurement responsibility is a commercial product decision, not an inference from the
    #: service slug or category. A3 day-hire explicitly uses `NOT_APPLICABLE`; every A5 variant is
    #: configured as either customer-procured or Partner-turnkey. There is deliberately no model
    #: default: silently choosing the wrong party changes who must spend money.
    material_fulfilment_mode = models.CharField(
        max_length=24,
        choices=MaterialFulfilmentMode.choices,
    )
    #: Hours from submission to the first usable quote, and to the full set. Owner decision 2.
    first_quote_sla_hours = models.PositiveSmallIntegerField(null=True, blank=True)
    quote_delivery_sla_hours = models.PositiveSmallIntegerField(null=True, blank=True)
    #: Maximum quotes a Customer can unlock. Revision 2 fixes the promise at "up to three".
    max_quotes = models.PositiveSmallIntegerField(default=3)
    #: How many non-responsive rejections a Customer may make before the slot stops reopening.
    non_responsive_rejection_cap = models.PositiveSmallIntegerField(null=True, blank=True)

    # --- Revision 3 (ADR-0008): the A5 visit clocks and the A5 commission terms. -------------
    # All nullable/blank for the same reason `first_quote_sla_hours` is: they are owner decisions
    # 2, 3 and 4, and a default here would bake a policy nobody approved into the schema. Every
    # reader in `apps.requirements.pricing` refuses with `m2_policy_unavailable` while one is
    # unset rather than guessing.
    #: How long an A5 plan visit occupies the vendor on the shared availability grid. Null blocks
    #: `confirm_visit_slot`: there is no defensible default for "how long does a site visit take",
    #: and guessing it would either double-book a vendor or hide half their day.
    visit_duration_minutes = models.PositiveSmallIntegerField(null=True, blank=True)
    #: Business hours from submission to the first *confirmed visit slot* (A5's answer to
    #: `first_quote_sla_hours`). Owner decision 2.
    first_visit_sla_hours = models.PositiveSmallIntegerField(null=True, blank=True)
    #: **Seconds**, not business hours — the fixed-visit offer's answer window (owner decision,
    #: 2026-09-01). A fixed-visit offer is a yes/no on a Customer-chosen time, broadcast
    #: first-accept-wins, and it borrowed `first_quote_sla_hours` — a clock sized for *writing a
    #: quote* — which handed a 30-second decision a two-day countdown and held the Customer in
    #: `SEARCHING` for days. Same reasoning as `crew_offer_timeout_seconds`: an instant product
    #: cannot wait for a service area to open tomorrow morning. Null keeps the old ceiling —
    #: honest, but slow — rather than inventing a number nobody approved.
    fixed_visit_offer_timeout_seconds = models.PositiveIntegerField(null=True, blank=True)
    #: Business hours from submission by which every plan slot should be filled. An unfilled share
    #: auto-refunds once this passes. Owner decision 2.
    visit_plan_fill_sla_hours = models.PositiveSmallIntegerField(null=True, blank=True)
    #: Business hours after a `COMPLETED` visit within which a usable estimate must land. A visit
    #: that produces nothing refunds or replaces its share. Owner decision 2.
    post_visit_estimate_window_hours = models.PositiveSmallIntegerField(null=True, blank=True)
    #: On a Customer no-show the vendor visit payout is always paid — they travelled. This decides
    #: only what happens to the platform share. Owner decision 3.
    customer_no_show_refunds_platform_share = models.BooleanField(null=True, blank=True)
    #: Vsolve's share of an A5 engagement, in basis points. Owner decision 4's arithmetic half.
    commission_basis_points = models.PositiveIntegerField(null=True, blank=True)
    #: Whether that commission sits inside the vendor's quoted price or is added on top. A
    #: displayed, immutable term on every A5 proposal, so it is Operations-owned rather than
    #: vendor-declared. Owner decision 4's disclosure half.
    commission_treatment = models.CharField(max_length=24, blank=True)

    # --- Wave C3 (`M2-BE-503`, `505`, `507`): the engagement spine's three clocks. -------------
    # Nullable and fail-closed for the same reason as every clock above. The consequence of an
    # unset value is stated on each, because "not decided" has a different cost in each case and
    # `apps.requirements.pricing` refuses or declines to sweep accordingly.
    #: Business hours a Customer has to review submitted stage evidence before silence becomes
    #: approval. Null means **no auto-approval**: a stage waits for a real decision rather than
    #: being approved against a deadline nobody set.
    stage_review_window_hours = models.PositiveSmallIntegerField(null=True, blank=True)
    #: Business hours an approved stage's payout is held before it becomes payable — the dispute
    #: window `M2-BE-507` names. Null means the hold never lifts on a clock; Operations releases
    #: it. The earning is still written, so the debt exists either way.
    stage_payout_hold_hours = models.PositiveSmallIntegerField(null=True, blank=True)
    #: Business hours a Customer has to accept or decline a proposed scope amendment. Null blocks
    #: `propose_engagement_amendment`: an amendment with no expiry is an open-ended claim on
    #: somebody's money, and `fulfilment.ScopeAmendment.expires_at` is not nullable.
    amendment_response_hours = models.PositiveSmallIntegerField(null=True, blank=True)

    # --- Wave C2R / revision 4 (ADR-0009): the rate-card A3 preset, cascade and fee policy. ----
    #
    # Every one of these is nullable for the reason the eleven above are, and each names the
    # consequence of leaving it unset. They live here rather than on `RateCard` because a rate
    # card is a *price* and these are *policy*: the split percentage, the cancellation window and
    # the cascade shape do not change when a city's day rate moves, and putting them on the card
    # would block publishing a rate until somebody decided a refund rule.
    #
    # `apps.requirements.rate_cards` is the only reader and refuses with `m2_policy_unavailable`
    # while one is unset.

    #: The A3 preset: the three or four **price-moving facts** for this variant — floor number,
    #: lift, carry distance, packing. Same shape, same `carts.item_inputs.validate_scope` validator
    #: and same version as `question_schema`, because a second question subsystem is the thing
    #: `02-backend-tasks.md` §"Reuse before building" names. Empty means this variant has no preset
    #: and `book_at_published_rate` refuses: an instant booking whose scope was never pinned down
    #: is exactly the on-site renegotiation ADR-0009 exists to prevent.
    a3_preset_question_schema = models.JSONField(default=dict, blank=True)
    #: How many leads one cascade wave offers the job to. Null blocks the cascade entirely — a
    #: wave size guessed here is a decision about how much of a city's supply one request burns.
    crew_wave_size = models.PositiveSmallIntegerField(null=True, blank=True)
    #: How many extra leads each subsequent wave adds as the cascade widens.
    crew_wave_widening_step = models.PositiveSmallIntegerField(null=True, blank=True)
    #: **Seconds**, not business hours. ADR-0009 is explicit that the crew offer runs on the M1
    #: dispatch clock — small wave, first accept wins, minutes-level timeouts — because an instant
    #: product cannot wait for a service area to open tomorrow morning.
    crew_offer_timeout_seconds = models.PositiveIntegerField(null=True, blank=True)
    #: How many waves may go out before `fall_back_to_quote_flow` runs. Null blocks the fallback,
    #: which would leave a request cascading forever behind a holding state.
    crew_cascade_max_waves = models.PositiveSmallIntegerField(null=True, blank=True)
    #: How long an accepted offer holds the job while the Customer pays the booking fee, in
    #: seconds. Null blocks acceptance: a hold with no expiry is a lead's Saturday taken off the
    #: market by a Customer who may never pay.
    crew_offer_hold_seconds = models.PositiveIntegerField(null=True, blank=True)
    #: The decline-rate alarm (`M2-BE-434`): the rate above which sustained declines page
    #: Operations, in basis points, and the minimum number of offers before the rate means
    #: anything. Owner decision 13. Null means **no alarm fires** — the honest consequence, and the
    #: reason the alarm is recorded as blocked rather than shipped with an invented threshold.
    crew_decline_alarm_basis_points = models.PositiveIntegerField(null=True, blank=True)
    crew_decline_alarm_min_offers = models.PositiveSmallIntegerField(null=True, blank=True)
    #: The free-cancel window T, in hours before the requested start. A Customer cancelling at or
    #: beyond T refunds in full; inside T the forfeit split runs. Owner decision 12. Null blocks
    #: Customer cancellation of a paid booking outright — deciding between a full refund and a
    #: forfeit by guessing is deciding whose money it is.
    booking_fee_free_cancel_hours = models.PositiveSmallIntegerField(null=True, blank=True)
    #: The forfeit split: the lead's travel-compensation share of a forfeited booking fee, in
    #: basis points. The remainder is the platform share. Owner decision 12. Null blocks the
    #: forfeit, which leaves the fee `ACTIVE` and visible rather than split on an invented ratio.
    booking_fee_travel_compensation_basis_points = models.PositiveIntegerField(
        null=True, blank=True
    )

    # --- Wave C4 / revision 4: the shift-day's own policy values. -----------------------------
    #
    # Four more, on the same rule as everything above: nullable, no default in code, and each one
    # naming what stops working while it is unset. `apps.requirements.rate_cards` reads all four
    # and `apps.partners.standing` consumes the last three.

    #: How long after a shift ends the Customer may still approve overtime that was already
    #: worked (`M2-BE-531`). ADR-0009: unapproved overtime is unpaid, "with the retroactive window
    #: unchanged". Null blocks a **retroactive** overtime request outright — overtime proposed
    #: while the shift is still running is unaffected — because the alternative is inventing the
    #: one number that decides whether work already done gets paid for.
    overtime_retroactive_window_minutes = models.PositiveSmallIntegerField(null=True, blank=True)
    #: How many short shift-days inside `vendor_standing_window_days` make a pattern, after which
    #: the lead is demoted in matching (`M2-BE-537`). Null means **no demotion ever fires**: the
    #: short days are still recorded as standing events, so the evidence exists either way, but
    #: guessing the threshold would decide how much under-delivery costs a vendor's livelihood.
    crew_shortfall_standing_threshold = models.PositiveSmallIntegerField(null=True, blank=True)
    #: How many cash-demand reports inside the same window remove the vendor (`M2-BE-539`). Null
    #: means **no automatic removal fires** and the reports are still recorded — the same
    #: asymmetry `crew_decline_alarm_basis_points` draws, and for the same reason: a report is a
    #: Customer's account of what happened and is never refused for want of a threshold, while
    #: suspending somebody's trade on an invented number is not a decision code may take.
    cash_demand_removal_threshold = models.PositiveSmallIntegerField(null=True, blank=True)
    #: The window both thresholds above count inside, in days. Null means neither pattern can be
    #: evaluated at all, because "three reports" without "three reports since when" is not a rule.
    vendor_standing_window_days = models.PositiveSmallIntegerField(null=True, blank=True)

    # --- Wave C5 / A5 projects: warranty retention (`M2-BE-546`). -----------------------------
    #
    # `07-state-machines-and-permissions.md` §9 lists "retention percentage, warranty window" on
    # the pre-phase decision list, so both are nullable and neither has a default in code. What
    # they gate is stated on `M2-BE-546` itself: **a variant either funds retention or does not
    # advertise warranty.** `proposals._assert_a5_shape` refuses an estimate carrying warranty
    # terms while either is unset, which is that sentence enforced at the composer rather than
    # discovered at the end of a project when there is nothing held back to honour it with.

    #: How much of an A5 engagement's agreed total is held back from the vendor's payout until the
    #: warranty window closes, in basis points. **Zero is a legitimate decision** — "we advertise a
    #: warranty and hold nothing back" — which is exactly why the unset case has to be `None`.
    warranty_retention_basis_points = models.PositiveIntegerField(null=True, blank=True)
    #: How long the warranty period runs after the Customer accepts completion, in days. Null
    #: blocks an estimate that advertises warranty; a warranty of zero days is not a warranty,
    #: which is why this one is in `M2_POSITIVE_WHEN_SET_POLICY_FIELDS` and the percentage is not.
    warranty_window_days = models.PositiveSmallIntegerField(null=True, blank=True)

    # --- Wave C6 / recovery: the case clocks, the chargeback alarm and the touch budget. -------
    #
    # Five more on the same rule, and the direction each one fails in is chosen so that an unset
    # value never silences a report and never invents a deadline somebody loses against.

    #: Business hours a named party has to answer a case that is about them — the response
    #: deadline `M2-BE-704` asks for. Null means a case still opens, still carries its Operations
    #: `due_at` from the severity SLA, and simply **carries no party deadline**: nobody is timed
    #: out against a clock nobody set. It does not block the case, because refusing to open a
    #: safety case for want of a response window would be the worst possible fail-closed direction.
    case_response_window_hours = models.PositiveSmallIntegerField(null=True, blank=True)
    #: Business hours after a case resolves within which the losing party may appeal it. Null
    #: **blocks an appeal against a resolved case** with `m2_policy_unavailable`: an appeal window
    #: with no bound is an open-ended claim to reverse a decision that already moved money. An
    #: appeal while the case is still open needs no window and is unaffected.
    case_appeal_window_hours = models.PositiveSmallIntegerField(null=True, blank=True)
    #: The chargeback alarm `M2-BE-708` names: the rate above which chargebacks on the booking,
    #: unlock or visit-plan fee page Operations, in basis points, and the minimum number of
    #: charges before a rate means anything. Null means **no alarm fires** and every chargeback is
    #: still recorded as a case — the same asymmetry `crew_decline_alarm_basis_points` draws.
    chargeback_alarm_basis_points = models.PositiveIntegerField(null=True, blank=True)
    chargeback_alarm_min_charges = models.PositiveSmallIntegerField(null=True, blank=True)
    #: The approved unit-economics budget `M2-BE-715` measures against: how many Operations
    #: touches one request may take before the workspace design has failed. Null means **the
    #: metric is still emitted and nothing is flagged** — measurement never depends on the owner
    #: having decided, only the judgement does. For A3 the check is against the booking fee's
    #: platform share (decision 10 as restated by ADR-0009), which is why the budget is a count
    #: rather than a currency amount: the money it has to fit inside is already published.
    operations_touch_budget_per_request = models.PositiveSmallIntegerField(null=True, blank=True)

    evidence_policy = models.JSONField(default=dict)
    contact_policy = models.JSONField(default=dict)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="m2_variant_configurations_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("variant", "-version")
        constraints = [
            models.UniqueConstraint(
                fields=("variant", "version"),
                name="catalog_unique_m2_variant_configuration_version",
            ),
            models.UniqueConstraint(
                fields=("variant",),
                condition=models.Q(status="ACTIVE"),
                name="catalog_unique_active_m2_variant_configuration",
            ),
            models.CheckConstraint(
                condition=models.Q(max_quotes__gt=0),
                name="catalog_m2_configuration_max_quotes_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(quote_delivery_sla_hours__isnull=True)
                | models.Q(first_quote_sla_hours__isnull=True)
                | models.Q(quote_delivery_sla_hours__gte=models.F("first_quote_sla_hours")),
                name="catalog_m2_configuration_sla_order",
            ),
            models.CheckConstraint(
                condition=models.Q(visit_plan_fill_sla_hours__isnull=True)
                | models.Q(first_visit_sla_hours__isnull=True)
                | models.Q(visit_plan_fill_sla_hours__gte=models.F("first_visit_sla_hours")),
                name="catalog_m2_configuration_visit_sla_order",
            ),
            *[
                models.CheckConstraint(
                    condition=models.Q(**{f"{field}__isnull": True})
                    | models.Q(**{f"{field}__lte": 10000}),
                    name=f"catalog_m2_configuration_{short_name}_within_range",
                )
                for field, short_name in M2_BASIS_POINT_POLICY_FIELDS
            ],
            *[
                models.CheckConstraint(
                    condition=models.Q(**{f"{field}__isnull": True})
                    | models.Q(**{f"{field}__gte": 1}),
                    name=f"catalog_m2_configuration_{short_name}_positive",
                )
                for field, short_name in M2_POSITIVE_WHEN_SET_POLICY_FIELDS
            ],
        ]

    def __str__(self) -> str:
        return f"{self.variant_id}:v{self.version}:{self.status}"


class ServiceQuestion(models.Model):
    class Kind(models.TextChoices):
        SINGLE_CHOICE = "SINGLE_CHOICE", "Single choice"
        MULTIPLE_CHOICE = "MULTIPLE_CHOICE", "Multiple choice"
        BOOLEAN = "BOOLEAN", "Yes or no"
        NUMBER = "NUMBER", "Number"
        TEXT = "TEXT", "Text"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    variant = models.ForeignKey(
        ServiceVariant,
        on_delete=models.CASCADE,
        related_name="questions",
    )
    code = models.SlugField(max_length=80)
    prompt = models.CharField(max_length=240)
    help_text = models.CharField(max_length=300, blank=True)
    kind = models.CharField(max_length=24, choices=Kind.choices)
    is_required = models.BooleanField(default=False)
    validation_rules = models.JSONField(default=dict, blank=True)
    display_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("display_order", "prompt")
        constraints = [
            models.UniqueConstraint(
                fields=("variant", "code"),
                name="catalog_unique_question_code_per_variant",
            ),
        ]

    def __str__(self) -> str:
        return self.prompt


class ServiceQuestionOption(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    question = models.ForeignKey(
        ServiceQuestion,
        on_delete=models.CASCADE,
        related_name="options",
    )
    code = models.SlugField(max_length=80)
    label = models.CharField(max_length=180)
    description = models.CharField(max_length=300, blank=True)
    display_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("display_order", "label")
        constraints = [
            models.UniqueConstraint(
                fields=("question", "code"),
                name="catalog_unique_option_code_per_question",
            ),
        ]

    def __str__(self) -> str:
        return self.label


class ServicePolicy(models.Model):
    class Kind(models.TextChoices):
        INCLUDED = "INCLUDED", "Included"
        EXCLUDED = "EXCLUDED", "Not included"
        GOOD_TO_KNOW = "GOOD_TO_KNOW", "Good to know"
        #: One numbered step of "how this visit works", ordered by `display_order`.
        #:
        #: Here rather than in its own model because a step is the same shape as every other
        #: policy line — a sentence about the service, ordered, switchable off — and the only
        #: thing it needed that the others did not was a short heading.
        PROCESS = "PROCESS", "Process step"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    service = models.ForeignKey(Service, on_delete=models.CASCADE, related_name="policies")
    kind = models.CharField(max_length=20, choices=Kind.choices)
    #: The step's heading — "Inspection", "Quote approval". Blank for every other kind, which
    #: is a bullet rather than a titled block.
    title = models.CharField(max_length=120, blank=True)
    text = models.CharField(max_length=400)
    display_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("kind", "display_order", "id")

    def __str__(self) -> str:
        return f"{self.kind}: {self.text[:60]}"


class ServiceMedia(models.Model):
    class Kind(models.TextChoices):
        COVER = "COVER", "Cover"
        GALLERY = "GALLERY", "Gallery"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    service = models.ForeignKey(Service, on_delete=models.CASCADE, related_name="media")
    kind = models.CharField(max_length=16, choices=Kind.choices)
    url = models.URLField(max_length=500)
    alt_text = models.CharField(max_length=200)
    display_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("display_order", "id")

    def __str__(self) -> str:
        return self.alt_text
