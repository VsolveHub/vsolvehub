"""The M2 capability foundation: what a Partner is approved to do, and as what business.

Carries the banner that opened the M2 half of the original module (reproduced verbatim below):
the business identity a workforce agency or project vendor registers under, the reviewed
capability that authorises a workspace, its immutable transition audit, and the insurance
declaration a construction capability cannot be approved without.

The boundary: this module answers "may they?". The roster they field once approved lives in
`crew`; the record of how they behaved afterwards lives in `standing`.
"""

import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.catalog.models import ServiceVariant
from apps.foundation.storage_paths import employer_logo_upload_to
from apps.locations.models import ServiceArea
from apps.locations.pins import pin_constraints

# ---------------------------------------------------------------------------
# M2 capability foundation (A3_TIME_BLOCK and A5_CUSTOM_PROJECT)
#
# See docs/adr/0007-m2-engagement-spine-and-fee-after-value.md. Commercial mode
# is a property of the archetype and is deliberately not stored here: a field
# Operations could edit would reintroduce the per-variant mode matrix ADR-0007
# removes.
# ---------------------------------------------------------------------------


def commercial_mode_for_archetype(archetype: str) -> str:
    """Derive the commercial mode. A3 is always lead-only; A5/A7/A9 managed; A10 N/A."""
    if archetype == ServiceVariant.BookingArchetype.A3_TIME_BLOCK:
        return PartnerCapability.CommercialMode.LEAD_ONLY
    if archetype in (
        ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT,
        ServiceVariant.BookingArchetype.A7_RENTAL,
        ServiceVariant.BookingArchetype.A9_STAY,
    ):
        return PartnerCapability.CommercialMode.MANAGED_PAYMENT_REQUIRED
    return PartnerCapability.CommercialMode.NOT_APPLICABLE


class PartnerBusinessProfile(models.Model):
    """Business identity for a Partner operating as an agency or project vendor."""

    class BusinessType(models.TextChoices):
        INDIVIDUAL = "INDIVIDUAL", "Individual"
        WORKFORCE_AGENCY = "WORKFORCE_AGENCY", "Workforce agency"
        PROJECT_VENDOR = "PROJECT_VENDOR", "Project vendor"
        EMPLOYER = "EMPLOYER", "Employer"
        RENTAL_OWNER = "RENTAL_OWNER", "Rental owner"
        PROPERTY_HOST = "PROPERTY_HOST", "Property host"

    class BusinessCategory(models.TextChoices):
        """What kind of business an employer runs ("I want to hire staff")."""

        SHOP = "SHOP", "Shop / retail"
        RESTAURANT = "RESTAURANT", "Restaurant / food"
        CLINIC = "CLINIC", "Clinic / hospital"
        OFFICE = "OFFICE", "Office / IT"
        SCHOOL = "SCHOOL", "School / coaching"
        FACTORY = "FACTORY", "Factory / workshop"
        CONSTRUCTION = "CONSTRUCTION", "Construction"
        FACILITY = "FACILITY", "Security / facility services"
        LOGISTICS = "LOGISTICS", "Delivery / logistics"
        HOTEL = "HOTEL", "Hotel"
        SALON = "SALON", "Salon / beauty"
        OTHER = "OTHER", "Other"

    class LegalStructure(models.TextChoices):
        PROPRIETORSHIP = "PROPRIETORSHIP", "Proprietorship"
        PARTNERSHIP_LLP = "PARTNERSHIP_LLP", "Partnership / LLP"
        COMPANY = "COMPANY", "Company"
        TRUST_SOCIETY_NGO = "TRUST_SOCIETY_NGO", "Trust / society / NGO"
        GOVERNMENT = "GOVERNMENT", "Government"

    class CompanySize(models.TextChoices):
        SIZE_1_10 = "SIZE_1_10", "1-10"
        SIZE_11_50 = "SIZE_11_50", "11-50"
        SIZE_51_200 = "SIZE_51_200", "51-200"
        SIZE_200_PLUS = "SIZE_200_PLUS", "200+"

    class BusinessProofType(models.TextChoices):
        GST_CERTIFICATE = "GST_CERTIFICATE", "GST certificate"
        INCORPORATION_CERTIFICATE = "INCORPORATION_CERTIFICATE", "Incorporation certificate"
        COMPANY_PAN = "COMPANY_PAN", "Company PAN"
        SHOP_ESTABLISHMENT = "SHOP_ESTABLISHMENT", "Shop & Establishment licence"
        TRADE_LICENCE = "TRADE_LICENCE", "Trade licence"
        FSSAI = "FSSAI", "FSSAI licence"
        CLINIC_REGISTRATION = "CLINIC_REGISTRATION", "Clinic registration"
        UDYAM = "UDYAM", "Udyam registration"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.OneToOneField(
        "partners.PartnerProfile",
        on_delete=models.PROTECT,
        related_name="business_profile",
    )
    business_type = models.CharField(
        max_length=24,
        choices=BusinessType.choices,
        default=BusinessType.INDIVIDUAL,
    )
    legal_name = models.CharField(max_length=200, blank=True)
    registration_number = models.CharField(max_length=64, blank=True)
    gst_registered = models.BooleanField(default=False)
    gstin = models.CharField(max_length=15, blank=True)
    gstin_verified_at = models.DateTimeField(null=True, blank=True)
    registered_state_code = models.CharField(max_length=8, blank=True)
    tax_profile_effective_from = models.DateField(null=True, blank=True)
    years_in_operation = models.PositiveSmallIntegerField(default=0)
    #: The lead's own UPI handle, for the evening "Day settled?" convenience link (`M2-BE-536`).
    #:
    #: **This is not a payout rail and must never become one.** A3 wages are peer-to-peer: the
    #: Customer's own UPI app sends the money to this address and the platform never holds, routes,
    #: books or reconciles it. It lives here rather than on `payouts.PartnerPayoutAccount` for
    #: exactly that reason — that table is where Vsolve pays somebody, this is where somebody else
    #: pays them, and putting a collection handle in the payout table is the first step to a
    #: settlement job finding it. Blank is the ordinary state: the deep link is simply not offered,
    #: the published amount still is, and the crew is paid the way they were paid before the app.
    upi_vpa = models.CharField(max_length=120, blank=True)
    #: An employer's business details, asked on the "Business details" sign-up step. Blank for
    #: every other Partner. `legal_name` above is the business name shown on their jobs.
    business_category = models.CharField(
        max_length=16, choices=BusinessCategory.choices, blank=True
    )
    city = models.CharField(max_length=80, blank=True)
    address = models.CharField(max_length=240, blank=True)
    #: Public name on job cards. Blank means `legal_name` is shown.
    trade_name = models.CharField(max_length=120, blank=True)
    legal_structure = models.CharField(max_length=24, choices=LegalStructure.choices, blank=True)
    company_size = models.CharField(max_length=16, choices=CompanySize.choices, blank=True)
    area = models.CharField(max_length=120, blank=True)
    state = models.CharField(max_length=40, default="Telangana")
    pin_code = models.CharField(max_length=6, blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    logo = models.FileField(upload_to=employer_logo_upload_to, blank=True)
    website_url = models.URLField(max_length=300, blank=True)
    business_proof_type = models.CharField(
        max_length=32, choices=BusinessProofType.choices, blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-updated_at",)
        constraints = [
            models.CheckConstraint(
                condition=models.Q(gst_registered=False, gstin="") | models.Q(gst_registered=True),
                name="partners_gstin_requires_gst_registered",
            ),
            models.CheckConstraint(
                condition=models.Q(business_proof_type="")
                | models.Q(gst_registered=True, business_proof_type="GST_CERTIFICATE")
                | (
                    models.Q(gst_registered=False)
                    & ~models.Q(business_proof_type="GST_CERTIFICATE")
                ),
                name="partners_business_proof_fits_gst",
            ),
            models.CheckConstraint(
                condition=models.Q(pin_code="") | models.Q(pin_code__regex=r"^[1-9][0-9]{5}$"),
                name="partners_business_pin_code_format",
            ),
            *pin_constraints(
                prefix="partners_business", latitude="latitude", longitude="longitude"
            ),
            models.CheckConstraint(
                condition=models.Q(gstin_verified_at__isnull=True)
                | models.Q(gst_registered=True, gstin__gt="", registered_state_code__gt=""),
                name="partners_verified_gstin_has_tax_identity",
            ),
            models.CheckConstraint(
                condition=~models.Q(business_type="INDIVIDUAL") | models.Q(registration_number=""),
                name="partners_individual_has_no_registration_number",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.partner_id}:{self.business_type}"


class PartnerCapability(models.Model):
    """One approved lifecycle capability. Authorises a workspace and its actions.

    A skill supports eligibility; only an approved capability authorises work.
    """

    class Status(models.TextChoices):
        REQUESTED = "REQUESTED", "Requested"
        UNDER_REVIEW = "UNDER_REVIEW", "Under review"
        CHANGES_REQUIRED = "CHANGES_REQUIRED", "Changes required"
        APPROVED = "APPROVED", "Approved"
        SUSPENDED = "SUSPENDED", "Suspended"
        #: Operations refused. Distinct from WITHDRAWN on purpose — see proposal 0013 §Answered.
        #: "We said no" needs a reason and a support path; "you closed this" needs an obvious way
        #: to ask again. Collapsing them, as this model did until 12 August, left the Partner app
        #: unable to say either honestly.
        REJECTED = "REJECTED", "Rejected"
        #: The Partner's own exit, and nothing else.
        WITHDRAWN = "WITHDRAWN", "Withdrawn"

    class CommercialMode(models.TextChoices):
        LEAD_ONLY = "LEAD_ONLY", "Lead only"
        MANAGED_PAYMENT_REQUIRED = "MANAGED_PAYMENT_REQUIRED", "Managed payment required"
        NOT_APPLICABLE = "NOT_APPLICABLE", "Not applicable"

    ACTIVE_STATUSES = (
        Status.REQUESTED,
        Status.UNDER_REVIEW,
        Status.CHANGES_REQUIRED,
        Status.APPROVED,
    )
    #: Statuses a reviewer cannot reach without saying what is wrong. `CHANGES_REQUIRED` is here
    #: for the same reason `SUSPENDED` needs a reason code: the Partner's only next action is to
    #: fix something, and "we need a correction" without naming it sends them back to re-upload
    #: the document that was already right.
    REVIEW_STATUSES_NEEDING_NOTES = (Status.CHANGES_REQUIRED, Status.REJECTED)

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.ForeignKey(
        "partners.PartnerProfile",
        on_delete=models.PROTECT,
        related_name="capabilities",
    )
    variant = models.ForeignKey(
        ServiceVariant,
        on_delete=models.PROTECT,
        related_name="partner_capabilities",
    )
    archetype = models.CharField(
        max_length=24,
        choices=ServiceVariant.BookingArchetype.choices,
    )
    #: Where this capability is approved to operate (`M2-BE-102`). **Empty means every area the
    #: Partner serves**, which is the common case and keeps the M1 `PartnerServiceArea` link the
    #: single source of coverage. A non-empty set narrows it: a workforce agency approved for
    #: construction labour in one city but not the next is a real Operations decision, and before
    #: this field the only way to express it was to remove the whole service area — which also
    #: removed their A1 work. `PartnerServiceArea` still gates first; this can only subtract.
    service_areas = models.ManyToManyField(
        ServiceArea,
        blank=True,
        related_name="partner_capabilities",
    )
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.REQUESTED)
    #: Category-specific registration answers (`M2-BE-106`), validated at request time against
    #: `M2VariantConfiguration.registration_question_schema` through the same
    #: `carts.item_inputs.validate_scope` the Customer's answers use. Kept on the capability rather
    #: than the profile because the questions are per variant: "how many scaffolders can you field"
    #: is not a question about the business, it is a question about this capability.
    registration_answers = models.JSONField(default=dict, blank=True)
    max_crew_size = models.PositiveSmallIntegerField(null=True, blank=True)
    max_concurrent_engagements = models.PositiveSmallIntegerField(null=True, blank=True)
    max_project_value_paise = models.PositiveBigIntegerField(null=True, blank=True)
    requires_insurance = models.BooleanField(default=False)
    review_notes = models.TextField(blank=True)
    suspension_reason_code = models.SlugField(max_length=80, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="partner_capabilities_reviewed",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("partner", "archetype", "-updated_at")
        constraints = [
            models.UniqueConstraint(
                fields=("partner", "variant"),
                condition=models.Q(
                    status__in=("REQUESTED", "UNDER_REVIEW", "CHANGES_REQUIRED", "APPROVED")
                ),
                name="partners_unique_live_capability_per_variant",
            ),
            models.CheckConstraint(
                condition=models.Q(max_crew_size__isnull=True) | models.Q(max_crew_size__gt=0),
                name="partners_capability_crew_size_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(max_project_value_paise__isnull=True)
                | models.Q(max_project_value_paise__gt=0),
                name="partners_capability_project_value_positive",
            ),
            models.CheckConstraint(
                condition=~models.Q(status="SUSPENDED") | ~models.Q(suspension_reason_code=""),
                name="partners_capability_suspension_needs_reason",
            ),
            models.CheckConstraint(
                condition=~models.Q(status__in=("CHANGES_REQUIRED", "REJECTED"))
                | ~models.Q(review_notes=""),
                name="partners_capability_review_state_needs_notes",
            ),
        ]
        indexes = [
            models.Index(fields=("archetype", "status"), name="partners_capability_lookup_idx"),
            models.Index(fields=("partner", "status")),
            models.Index(fields=("status", "expires_at")),
        ]

    def __str__(self) -> str:
        return f"{self.partner_id}:{self.archetype}:{self.status}"

    @property
    def commercial_mode(self) -> str:
        return commercial_mode_for_archetype(self.archetype)

    @property
    def workspace_key(self) -> str:
        return self.archetype


class PartnerCapabilityTransition(models.Model):
    """Immutable audit of every capability review decision."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    capability = models.ForeignKey(
        PartnerCapability,
        on_delete=models.PROTECT,
        related_name="transitions",
    )
    from_status = models.CharField(max_length=24, blank=True)
    to_status = models.CharField(max_length=24)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="partner_capability_transitions_made",
    )
    reason_code = models.SlugField(max_length=80)
    reason = models.TextField(blank=True)
    occurred_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("occurred_at", "id")
        indexes = [
            models.Index(fields=("capability", "occurred_at")),
        ]

    def __str__(self) -> str:
        return f"{self.capability_id}:{self.from_status}->{self.to_status}"


class PartnerInsuranceDeclaration(models.Model):
    """Worker insurance and liability declaration required for workforce capability.

    Blocking for construction labour. The policy reference is stored for Operations
    verification; the document itself lives behind the M1 document storage adapter.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.ForeignKey(
        "partners.PartnerProfile",
        on_delete=models.PROTECT,
        related_name="insurance_declarations",
    )
    insurer_name = models.CharField(max_length=160)
    policy_reference = models.CharField(max_length=120)
    coverage_paise = models.PositiveBigIntegerField()
    covers_workmen_compensation = models.BooleanField(default=False)
    valid_from = models.DateField()
    valid_to = models.DateField()
    declared_at = models.DateTimeField(default=timezone.now)
    verified_at = models.DateTimeField(null=True, blank=True)
    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="partner_insurance_verified",
    )

    class Meta:
        ordering = ("-valid_to", "-declared_at")
        constraints = [
            models.CheckConstraint(
                condition=models.Q(valid_to__gt=models.F("valid_from")),
                name="partners_insurance_valid_range",
            ),
            models.CheckConstraint(
                condition=models.Q(coverage_paise__gt=0),
                name="partners_insurance_coverage_positive",
            ),
        ]
        indexes = [
            models.Index(fields=("partner", "valid_to")),
        ]

    def __str__(self) -> str:
        return f"{self.partner_id}:{self.insurer_name}"
