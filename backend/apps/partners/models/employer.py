"""Employer onboarding ("I want to hire staff"): who is hiring, and Operations' manual checks.

A business employer's company facts live on `PartnerBusinessProfile`; this module holds the
person hiring and the review checks.
"""

import uuid

from django.conf import settings
from django.db import models


class EmployerProfile(models.Model):
    """The person who is hiring. One per employer partner."""

    class HiringAs(models.TextChoices):
        INDIVIDUAL = "INDIVIDUAL", "For myself or my home"
        BUSINESS = "BUSINESS", "For my business"

    class PosterRole(models.TextChoices):
        OWNER = "OWNER", "Owner / Partner / Director"
        HR = "HR", "HR / Recruiter"
        MANAGER = "MANAGER", "Manager"
        OTHER = "OTHER", "Other"

    class IdDocumentType(models.TextChoices):
        AADHAAR_MASKED = "AADHAAR_MASKED", "Masked Aadhaar"
        PAN = "PAN", "PAN"
        DRIVING_LICENCE = "DRIVING_LICENCE", "Driving licence"
        VOTER_ID = "VOTER_ID", "Voter ID"
        PASSPORT = "PASSPORT", "Passport"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.OneToOneField(
        "partners.PartnerProfile",
        on_delete=models.PROTECT,
        related_name="employer_profile",
    )
    #: Blank means they have not chosen yet.
    hiring_as = models.CharField(max_length=12, choices=HiringAs.choices, blank=True)
    #: Business only.
    poster_role = models.CharField(max_length=12, choices=PosterRole.choices, blank=True)
    id_document_type = models.CharField(max_length=20, choices=IdDocumentType.choices, blank=True)
    email = models.EmailField(blank=True)
    #: Individual only. `area` and `city` are shown publicly; `pin_code` never is.
    area = models.CharField(max_length=120, blank=True)
    city = models.CharField(max_length=80, blank=True)
    pin_code = models.CharField(max_length=6, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=~models.Q(hiring_as="INDIVIDUAL") | models.Q(poster_role=""),
                name="partners_employer_individual_no_role",
            ),
            models.CheckConstraint(
                condition=~models.Q(hiring_as="BUSINESS") | models.Q(area="", city="", pin_code=""),
                name="partners_employer_business_no_home_location",
            ),
            models.CheckConstraint(
                condition=models.Q(pin_code="") | models.Q(pin_code__regex=r"^[1-9][0-9]{5}$"),
                name="partners_employer_pin_code_format",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.partner_id}:{self.hiring_as or 'unchosen'}"


class EmployerReviewCheck(models.Model):
    """One check Operations ticks on an employer application.

    `method` exists so automatic checks can write into this table later without changing screens.
    """

    class Code(models.TextChoices):
        NAME_MATCHES_ID = "NAME_MATCHES_ID", "The name on the ID matches the name they gave"
        SELFIE_MATCHES_ID = "SELFIE_MATCHES_ID", "The selfie is the same person as the ID photo"
        GST_ACTIVE_ON_PORTAL = (
            "GST_ACTIVE_ON_PORTAL",
            "GSTIN is Active on the GST portal and the legal name matches",
        )
        PROOF_MATCHES_BUSINESS = (
            "PROOF_MATCHES_BUSINESS",
            "The business proof shows the same legal name and isn't edited",
        )
        POSTER_ID_MATCHES = "POSTER_ID_MATCHES", "The poster's ID matches the name they gave"
        AUTHORITY_CONFIRMED = (
            "AUTHORITY_CONFIRMED",
            "Owner: ID name matches the business owner. Others: the owner's letter is valid",
        )

    class Result(models.TextChoices):
        PASS = "PASS", "Pass"
        FAIL = "FAIL", "Fail"

    class Method(models.TextChoices):
        MANUAL = "MANUAL", "Manual"
        AUTOMATIC = "AUTOMATIC", "Automatic"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    application = models.ForeignKey(
        "partners.PartnerApplication",
        on_delete=models.PROTECT,
        related_name="employer_checks",
    )
    code = models.CharField(max_length=32, choices=Code.choices)
    result = models.CharField(max_length=8, choices=Result.choices)
    note = models.CharField(max_length=480, blank=True)
    method = models.CharField(max_length=12, choices=Method.choices, default=Method.MANUAL)
    checked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="employer_checks_made",
    )
    checked_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("application", "code"),
                name="partners_employer_check_unique_code",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.application_id}:{self.code}:{self.result}"
