"""Marketable services and their configurable booking questions."""

import uuid

from django.conf import settings
from django.db import models


class Category(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    slug = models.SlugField(max_length=100, unique=True)
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    icon_key = models.CharField(max_length=80, blank=True)
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
    subcategory = models.ForeignKey(
        Subcategory,
        on_delete=models.PROTECT,
        related_name="services",
    )
    slug = models.SlugField(max_length=140, unique=True)
    name = models.CharField(max_length=160)
    short_description = models.CharField(max_length=240)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT)
    display_order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("display_order", "name")

    def __str__(self) -> str:
        return self.name


class ServiceVariant(models.Model):
    class BookingArchetype(models.TextChoices):
        LEGACY = "LEGACY", "Legacy"
        A1_TASK_VISIT = "A1_TASK_VISIT", "A1 task visit"
        A3_TIME_BLOCK = "A3_TIME_BLOCK", "A3 time block"
        A5_CUSTOM_PROJECT = "A5_CUSTOM_PROJECT", "A5 custom project"

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
            models.CheckConstraint(
                condition=models.Q(commission_basis_points__isnull=True)
                | models.Q(commission_basis_points__lte=10000),
                name="catalog_m2_configuration_commission_within_range",
            ),
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
