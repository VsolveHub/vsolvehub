"""The people an approved M2 Partner can actually field, and what they can do.

Part of the M2 capability foundation (A3_TIME_BLOCK and A5_CUSTOM_PROJECT) whose banner opens
`capabilities`. This slice holds the global worker record, the per-Partner roster membership
that points at it, the dated availability exceptions scoped to that membership, the languages a
vendor can work in, and the skills attached to a roster row.

The boundary: rosters and roster facts only. The approval that lets a Partner have a roster at
all is in `capabilities`; the record of how a crew day went is in `standing`.
"""

import uuid

from django.db import models
from django.utils import timezone


class CrewMember(models.Model):
    """A worker as a global person, not a per-agency row.

    Identity is a keyed hash so the same person registered by two agencies resolves
    to one record and cannot be double-booked on one day.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    identity_hash = models.CharField(max_length=64, unique=True)
    display_name = models.CharField(max_length=120)
    #: The last four digits of the phone number, and nothing else.
    #:
    #: `identity_hash` is not reversible, so without this a roster of two people called Ramesh is
    #: two identical rows and the Partner cannot tell which one they archived. Four digits are what
    #: makes the list usable; the number itself stays out of the database, so a dump of this
    #: table is not a contact list.
    phone_suffix = models.CharField(max_length=4, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("display_name", "id")

    def __str__(self) -> str:
        return self.display_name


class PartnerCrewMembership(models.Model):
    """A crew member on one Partner's roster. One person may appear on several."""

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        ARCHIVED = "ARCHIVED", "Archived"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.ForeignKey(
        "partners.PartnerProfile",
        on_delete=models.PROTECT,
        related_name="crew_memberships",
    )
    crew_member = models.ForeignKey(
        CrewMember,
        on_delete=models.PROTECT,
        related_name="partner_memberships",
    )
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    is_supervisor = models.BooleanField(default=False)
    documents_verified_at = models.DateTimeField(null=True, blank=True)
    added_at = models.DateTimeField(default=timezone.now)
    archived_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("partner", "-added_at")
        constraints = [
            models.UniqueConstraint(
                fields=("partner", "crew_member"),
                name="partners_unique_crew_membership",
            ),
            models.CheckConstraint(
                condition=~models.Q(status="ARCHIVED") | models.Q(archived_at__isnull=False),
                name="partners_archived_membership_has_timestamp",
            ),
        ]
        indexes = [
            models.Index(fields=("partner", "status")),
            models.Index(fields=("crew_member", "status")),
        ]

    def __str__(self) -> str:
        return f"{self.partner_id}:{self.crew_member_id}"


class CrewAvailabilityException(models.Model):
    """A dated statement that one crew member is, or is not, available (`M2-BE-107`).

    Deliberately exception-shaped rather than a weekly rule set. A day labourer's default is
    "available"; what a supervisor actually knows is "Ramesh is at a wedding on the 14th". A weekly
    grid would demand a schedule nobody maintains and would silently mark everyone unavailable the
    day it shipped.

    Scoped to the *membership*, not the global `CrewMember`: one agency must not be able to publish
    another agency's worker as unavailable. Cross-agency conflict is settled by assignment, which
    `assert_crew_available` already reads.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    membership = models.ForeignKey(
        PartnerCrewMembership,
        on_delete=models.PROTECT,
        related_name="availability_exceptions",
    )
    date = models.DateField()
    is_available = models.BooleanField(default=False)
    reason = models.CharField(max_length=200, blank=True)
    recorded_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ("date", "id")
        constraints = [
            models.UniqueConstraint(
                fields=("membership", "date"),
                name="partners_unique_crew_availability_exception",
            ),
        ]
        indexes = [
            models.Index(fields=("membership", "date")),
        ]

    def __str__(self) -> str:
        return f"{self.membership_id}:{self.date}:{self.is_available}"


class PartnerLanguage(models.Model):
    """A language this vendor can actually work in (`M2-BE-301`).

    Matching reads it as hard eligibility: a voice note in Telugu sent to a vendor who reads only
    Hindi is a silent failure that looks like an unresponsive vendor. **A Partner who has declared
    no language is never excluded** — absence of a declaration is not a mismatch, and treating it as
    one would empty the candidate pool for every Partner registered before this field existed.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.ForeignKey(
        "partners.PartnerProfile",
        on_delete=models.PROTECT,
        related_name="languages",
    )
    #: BCP-47-ish, matching `CustomerRequirement.language`. Compared on the primary subtag, so
    #: `te-IN` and `te` are one language and a regional tag never fails to match itself.
    language_tag = models.CharField(max_length=16)
    is_active = models.BooleanField(default=True)
    declared_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ("partner", "language_tag")
        constraints = [
            models.UniqueConstraint(
                fields=("partner", "language_tag"),
                name="partners_unique_partner_language",
            ),
        ]
        indexes = [
            models.Index(fields=("partner", "is_active")),
        ]

    def __str__(self) -> str:
        return f"{self.partner_id}:{self.language_tag}"


class CrewSkill(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    membership = models.ForeignKey(
        PartnerCrewMembership,
        on_delete=models.PROTECT,
        related_name="skills",
    )
    skill = models.ForeignKey("partners.Skill", on_delete=models.PROTECT, related_name="crew_links")
    verified_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("membership", "skill"),
                name="partners_unique_crew_skill",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.membership_id}:{self.skill_id}"
