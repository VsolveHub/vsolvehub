"""The people an approved M2 Partner can actually field, and what they can do.

Part of the M2 capability foundation (A3_TIME_BLOCK and A5_CUSTOM_PROJECT) whose banner opens
`capabilities`. This slice holds the global worker record, the per-Partner roster membership
that points at it, the dated availability exceptions scoped to that membership, the languages a
vendor can work in, and the skills attached to a roster row.

The boundary: rosters and roster facts only. The approval that lets a Partner have a roster at
all is in `capabilities`; the record of how a crew day went is in `standing`.
"""

import uuid
from datetime import date

from django.conf import settings
from django.db import models
from django.utils import timezone


class CrewMember(models.Model):
    """A worker as a global person, not a per-agency row.

    Identity is a keyed hash so the same person registered by two agencies resolves
    to one record and cannot be double-booked on one day.
    """

    class Gender(models.TextChoices):
        """What a worker is, for the one purpose a Customer may ask about it.

        `UNDISCLOSED` is the worker declining to say and is **not** the same as blank: blank means
        nobody has asked yet, which is the state every row starts in. Both are treated the same way
        by the mix rules -- neither fills a gendered slot -- but only one of them is a question
        still worth putting to the Partner.
        """

        MAN = "MAN", "Man"
        WOMAN = "WOMAN", "Woman"
        OTHER = "OTHER", "Other"
        UNDISCLOSED = "UNDISCLOSED", "Prefers not to say"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    identity_hash = models.CharField(max_length=64, unique=True)
    display_name = models.CharField(max_length=120)
    #: Recorded only because a Customer may book a crew by mix, and blank until somebody asks.
    #:
    #: **Blank is never male.** Every row that existed before this field starts blank, and a mix
    #: rule that read blank as a man would quietly staff a wedding wrongly on day one. Only `MAN`
    #: fills a man-slot and only `WOMAN` a woman-slot; `OTHER` and `UNDISCLOSED` count toward the
    #: headcount and toward no gendered slot.
    #:
    #: **It is never inferred.** Not from `display_name`, not from a document, not from a photo.
    #: The only writer is a Partner recording what the worker told them.
    #:
    #: **First write wins.** This row is one person across every agency that has registered them,
    #: so an agency writing a value that contradicts one already here is refused
    #: (`m2_crew_gender_conflict`) rather than allowed to flip another agency's roster.
    gender = models.CharField(max_length=12, choices=Gender.choices, blank=True)
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
    #: What *this* agency calls the worker. Blank means "whatever the global record says".
    #:
    #: The name is the one thing on a crew row that is a label rather than a fact.
    #: `CrewMember.display_name` is shared by every agency that resolved to the same number, so
    #: publishing it as editable meant one agency's correction silently renaming a person on
    #: another agency's roster — and publishing it as read-only meant a typo nobody could ever
    #: fix. Re-adding does not help: `add_crew_to_roster` resolves by `identity_hash` and
    #: `get_or_create` ignores `defaults` on a hit, so "archive and add the correct person"
    #: returned the same wrong name.
    #:
    #: A per-membership override is what the Add form already promised — *"what your team calls
    #: them"*. Blank rather than a copy of the global name on every row, so a membership that
    #: never had an opinion keeps tracking the global record instead of freezing a snapshot of it.
    display_name = models.CharField(max_length=120, blank=True)
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

    @property
    def roster_name(self) -> str:
        """What to call this worker on this roster, and in anything this agency's work produces.

        Every partner-facing, customer-facing and Operations-facing read goes through here rather
        than at `crew_member.display_name`, so a corrected name reaches the shift-day screen and
        the refusal messages too — a name that is right on the roster and wrong in
        "Ramesh is booked on the 14th" is a name the supervisor cannot act on.
        """
        return self.display_name or self.crew_member.display_name


class CrewDocument(models.Model):
    """One piece of identity evidence for one worker on one roster.

    ## Why this exists at all

    `PartnerCrewMembership.documents_verified_at` had a writer — an Operations command with an
    actor, a reason on the negative path and an audit event — and nothing to look at. The reviewer
    was attesting to a check that happened in a chat app, or had not happened. This is the
    document behind the timestamp.

    ## Why it hangs off the membership and not off the global `CrewMember`

    An identity document describes the *person*, so the tempting shape is one per `CrewMember`,
    uploaded once and reused by every agency. That shape leaks the thing this whole slice is built
    to hide. `crew_roster` publishes no `crew_member_id` precisely so two agencies cannot discover
    they share a worker; a document pool visible to both would announce it. The cost is real and
    accepted: a worker on two rosters is checked twice.

    ## Why the row is created before the bytes arrive

    `AWAITING_UPLOAD` **is** the upload intent — the same two-phase shape as
    `PartnerDocumentUpload` → `PartnerDocument`, in one table because a crew document has no
    application version to guard and no separate lifecycle worth a second row. The client declares
    size, media type and SHA-256 first; `submit_crew_document` streams the stored object back
    through the storage boundary and compares. A client that declares a clean PDF and uploads
    something else fails there rather than reaching a reviewer.
    """

    class Kind(models.TextChoices):
        GOVERNMENT_ID = "GOVERNMENT_ID", "Government identity"
        ADDRESS_PROOF = "ADDRESS_PROOF", "Address proof"
        POLICE_VERIFICATION = "POLICE_VERIFICATION", "Police verification"

    class Status(models.TextChoices):
        AWAITING_UPLOAD = "AWAITING_UPLOAD", "Awaiting upload"
        PENDING = "PENDING", "Pending review"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        SUPERSEDED = "SUPERSEDED", "Superseded"
        FAILED = "FAILED", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    membership = models.ForeignKey(
        PartnerCrewMembership,
        on_delete=models.PROTECT,
        related_name="documents",
    )
    kind = models.CharField(max_length=32, choices=Kind.choices)
    version = models.PositiveIntegerField()
    #: Never reused across versions, so a replacement cannot be served from a signed link issued
    #: against the one it replaced — which is how a rejected document comes back after it was
    #: supposedly gone. Mirrors `photo_object_key`'s reasoning.
    object_key = models.CharField(max_length=500, unique=True)
    content_type = models.CharField(max_length=120)
    size_bytes = models.PositiveBigIntegerField()
    sha256 = models.CharField(max_length=64)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.AWAITING_UPLOAD)
    #: The day this document stops being valid, or nothing. Nullable for the same reason
    #: `PartnerDocument.expires_on` is: a photograph of a government ID has no expiry the platform
    #: tracks, a police verification does, and a non-null default would be a policy guess.
    expires_on = models.DateField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="crew_documents_reviewed",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_reason = models.TextField(blank=True)
    failure_code = models.CharField(max_length=64, blank=True)
    #: When the signed upload stops being usable. A row still `AWAITING_UPLOAD` past this is an
    #: abandoned intent and `cleanup_stale_crew_documents` removes it and its object.
    upload_expires_at = models.DateTimeField()
    object_deleted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("kind", "-version")
        constraints = [
            models.UniqueConstraint(
                fields=("membership", "kind", "version"),
                name="partners_unique_crew_document_version",
            ),
            models.CheckConstraint(
                condition=models.Q(size_bytes__gt=0),
                name="partners_crew_document_size_positive",
            ),
            # A reviewed row carries who reviewed it, and a rejection carries why. Enforced here
            # rather than in the service so a second writer cannot produce a decision with no
            # author, which is the one thing an audit trail may not contain.
            models.CheckConstraint(
                condition=~models.Q(status__in=("APPROVED", "REJECTED"))
                | models.Q(reviewed_by__isnull=False, reviewed_at__isnull=False),
                name="partners_crew_document_decision_has_reviewer",
            ),
            models.CheckConstraint(
                condition=~models.Q(status="REJECTED") | ~models.Q(review_reason=""),
                name="partners_crew_document_rejection_has_reason",
            ),
        ]
        indexes = [
            models.Index(fields=("membership", "kind", "status")),
            models.Index(fields=("status", "upload_expires_at")),
            models.Index(fields=("kind", "expires_on")),
        ]

    def __str__(self) -> str:
        return f"{self.membership_id}:{self.kind}:v{self.version}"

    def is_expired_on(self, day: date) -> bool:
        """A document with no recorded expiry never expires. Absence is not staleness."""
        return self.expires_on is not None and self.expires_on < day


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
