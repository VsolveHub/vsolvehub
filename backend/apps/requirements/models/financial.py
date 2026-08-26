"""Operations-owned commercial policy used to calculate immutable estimates."""

import uuid

from django.conf import settings
from django.db import models


class CommercialPolicy(models.Model):
    """A versioned, explicitly approved set of collection and settlement rules."""

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        ACTIVE = "ACTIVE", "Active"
        RETIRED = "RETIRED", "Retired"

    class TaxBasis(models.TextChoices):
        INCLUSIVE = "INCLUSIVE", "Included in Partner rates"
        EXCLUSIVE = "EXCLUSIVE", "Added to Partner rates"

    class PlatformFeeTreatment(models.TextChoices):
        NONE = "NONE", "Not applicable"
        CUSTOMER = "CUSTOMER", "Charged separately to Customer"
        PARTNER = "PARTNER", "Deducted from Partner proceeds"

    class SupplierOfRecord(models.TextChoices):
        PARTNER = "PARTNER", "Partner"
        VSOLVE = "VSOLVE", "V Solve Hub"

    class AmountBasis(models.TextChoices):
        PARTNER_QUOTE = "PARTNER_QUOTE", "Partner quote total"
        TAXABLE_VALUE = "TAXABLE_VALUE", "Taxable value"
        NONE = "NONE", "Not applicable"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    version = models.PositiveIntegerField(unique=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.DRAFT)
    effective_from = models.DateTimeField()
    effective_until = models.DateTimeField(null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="commercial_policies_approved",
    )
    approval_reference = models.CharField(max_length=120, blank=True)
    supplier_of_record = models.CharField(
        max_length=32, choices=SupplierOfRecord.choices, blank=True
    )
    material_supplier_of_record = models.CharField(
        max_length=32, choices=SupplierOfRecord.choices, blank=True
    )
    visit_supplier_of_record = models.CharField(
        max_length=32, choices=SupplierOfRecord.choices, blank=True
    )
    tax_basis = models.CharField(max_length=12, choices=TaxBasis.choices, blank=True)
    tax_rates_bps = models.JSONField(default=dict, blank=True)
    material_tax_category = models.SlugField(max_length=100, blank=True)
    charge_tax_categories = models.JSONField(default=dict, blank=True)
    platform_fee_treatment = models.CharField(
        max_length=12,
        choices=PlatformFeeTreatment.choices,
        blank=True,
    )
    platform_fee_bps = models.PositiveIntegerField(null=True, blank=True)
    platform_fee_tax_bps = models.PositiveIntegerField(null=True, blank=True)
    commission_bps = models.PositiveIntegerField(null=True, blank=True)
    commission_basis = models.CharField(max_length=20, choices=AmountBasis.choices, blank=True)
    withholding_bps = models.PositiveIntegerField(null=True, blank=True)
    withholding_basis = models.CharField(max_length=20, choices=AmountBasis.choices, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-version",)
        constraints = [
            models.UniqueConstraint(
                fields=("status",),
                condition=models.Q(status="ACTIVE"),
                name="requirements_one_active_commercial_policy",
            ),
            models.CheckConstraint(
                condition=models.Q(platform_fee_bps__isnull=True)
                | models.Q(platform_fee_bps__lte=10_000),
                name="requirements_platform_fee_bps_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(platform_fee_tax_bps__isnull=True)
                | models.Q(platform_fee_tax_bps__lte=10_000),
                name="requirements_platform_fee_tax_bps_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(commission_bps__isnull=True)
                | models.Q(commission_bps__lte=10_000),
                name="requirements_commission_bps_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(withholding_bps__isnull=True)
                | models.Q(withholding_bps__lte=10_000),
                name="requirements_withholding_bps_valid",
            ),
            models.CheckConstraint(
                condition=~models.Q(status="ACTIVE")
                | models.Q(
                    approved_at__isnull=False,
                    approved_by__isnull=False,
                    approval_reference__gt="",
                    commission_basis__gt="",
                    supplier_of_record__gt="",
                    material_supplier_of_record__gt="",
                    material_tax_category__gt="",
                    visit_supplier_of_record__gt="",
                    tax_basis__gt="",
                    platform_fee_treatment__gt="",
                    platform_fee_bps__isnull=False,
                    platform_fee_tax_bps__isnull=False,
                    commission_bps__isnull=False,
                    withholding_bps__isnull=False,
                    withholding_basis__gt="",
                ),
                name="requirements_active_commercial_policy_complete",
            ),
        ]

    def __str__(self) -> str:
        return f"commercial-policy:{self.version}:{self.status}"
