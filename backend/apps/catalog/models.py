"""Marketable services and their configurable booking questions."""

import uuid

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

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    service = models.ForeignKey(Service, on_delete=models.CASCADE, related_name="policies")
    kind = models.CharField(max_length=20, choices=Kind.choices)
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
