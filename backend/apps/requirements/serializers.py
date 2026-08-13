"""Wire shapes for the M2 requirement, enquiry and proposal surface.

Two rules run through this file and neither is negotiable:

* **A requirement is free.** Nothing in the Customer requirement serializers carries a price,
  quotes one, or hints that one is coming. `is_free` on the submit response is read from the
  server that enforces the rule rather than hardcoded in a screen that outlives it.
* **A teaser is not a quote.** `QuoteTeaserSerializer` is an explicit field list, never a
  `ModelSerializer`. Before an active unlock the response must not carry vendor identity, contact,
  scope or an exact total — not in a field the UI happens not to render, because a client cannot
  un-receive a payload and cached identity survives a refund.
"""

from datetime import datetime
from typing import Any

from django.conf import settings
from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.catalog.models import ServiceVariant
from apps.requirements.models import (
    BookingFee,
    CustomerRequirement,
    Engagement,
    EngagementAmendment,
    EngagementEvent,
    EngagementStage,
    Proposal,
    ProposalSelection,
    QuoteUnlock,
    RateCard,
    RateCardBooking,
    RequirementAttachment,
    RequirementQuestion,
    SiteVisit,
    StageEvidence,
    VendorInvitation,
    VisitPlan,
    VisitPlanShare,
)
from apps.requirements.selectors import (
    QUESTION_ASKER_ROLES,
    access_receipt_for,
    closure_reason,
    confirmed_teaser_count,
    lifecycle_explanation,
    missing_answer_codes,
    question_asker_role,
)

#: Why a vendor declined an enquiry, published so both apps render one vocabulary.
#:
#: `07-state-machines-and-permissions.md` requires a reason on every decline and names none, and
#: `VendorInvitation.decline_reason_code` is deliberately left an unconstrained `SlugField` on the
#: model: the same column also carries **system** reasons (`requirement_changed` from a withdrawal,
#: `non_responsive_quote` from a Customer rejection), and constraining the column would refuse the
#: platform's own writes. The vocabulary therefore lives here, on the one surface a vendor types
#: into — which is where it was missing.
INVITATION_DECLINE_REASONS = (
    ("TOO_FAR", "Too far to travel"),
    ("NO_CAPACITY", "No capacity on those dates"),
    ("OUT_OF_SCOPE", "Not work we do"),
    ("BUDGET_TOO_LOW", "Budget is below what this costs"),
    ("UNCLEAR_SCOPE", "Cannot tell what is being asked for"),
    ("OTHER", "Another reason"),
)

#: Whose absence is being reported. A request-shape vocabulary with no column behind it — the
#: outcome is written as a `SiteVisit.Status`, not as this string.
VISIT_NO_SHOW_PARTIES = (
    ("VENDOR", "Vendor"),
    ("CUSTOMER", "Customer"),
)

#: Why the visit did not happen. Published at 1.26.0; until then `reason_code` was an unconstrained
#: slug declared required with an empty default, so the Partner app sent it **blank** rather than
#: invent a vocabulary Operations would then have to report on.
#:
#: These six are deliberately about the *fact*, not about the settlement. The settlement is already
#: decided by `party` and is not a thing either side gets to nominate: a vendor no-show replaces the
#: slot at no charge to the Customer, and a Customer no-show still pays the vendor's visit payout
#: because they travelled. A reason code that could change the money would be a refund button
#: labelled as a dropdown.
#:
#: `cancellation_reason_code` on the model stays an unconstrained slug for the reason
#: `decline_reason_code` does: the same column also carries the platform's own writes
#: (`vendor_no_show`, `customer_no_show` from the sweeps), and constraining it would refuse them.
VISIT_NO_SHOW_REASONS = (
    ("NOBODY_ON_SITE", "Nobody was at the address"),
    ("SITE_INACCESSIBLE", "Could not get access to the site"),
    ("ADDRESS_WRONG", "The address was wrong or could not be found"),
    ("VENDOR_DID_NOT_ARRIVE", "The professional never arrived"),
    ("CANCELLED_ON_THE_DAY", "The other party cancelled on the day"),
    ("OTHER", "Another reason"),
)

# ---------------------------------------------------------------------------
# Customer: requirement capture
# ---------------------------------------------------------------------------


class RequirementCreateSerializer(serializers.Serializer[dict[str, Any]]):
    variant_id = serializers.UUIDField()
    answers = serializers.JSONField(required=False, default=dict)
    language = serializers.CharField(max_length=16, required=False, default="en-IN")


class RequirementUpdateSerializer(serializers.Serializer[dict[str, Any]]):
    """Partial update, one screen at a time, for save-and-resume.

    Every field is optional and `None` means "not sent" rather than "clear this", matching
    `services.update_draft`, which skips `None` for exactly that reason.
    """

    answers = serializers.JSONField(required=False)
    address_id = serializers.UUIDField(required=False, allow_null=True)
    requested_start = serializers.DateTimeField(required=False, allow_null=True)
    flexibility_days = serializers.IntegerField(required=False, min_value=0, max_value=365)
    service_by = serializers.DateField(required=False, allow_null=True)
    budget_min_paise = serializers.IntegerField(required=False, min_value=0, allow_null=True)
    budget_max_paise = serializers.IntegerField(required=False, min_value=0, allow_null=True)
    additional_details = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=4000,
    )
    language = serializers.CharField(required=False, max_length=16)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        low = attrs.get("budget_min_paise")
        high = attrs.get("budget_max_paise")
        if low is not None and high is not None and high < low:
            raise serializers.ValidationError(
                {"budget_max_paise": "The top of the budget cannot be below the bottom."}
            )
        return attrs


class RequirementAttachmentSerializer(serializers.ModelSerializer[RequirementAttachment]):
    scan_status = serializers.CharField(source="processing_status", read_only=True)
    language = serializers.CharField(source="transcript_language", read_only=True)
    #: Why an attachment was refused, in words the Customer can act on. Empty for every other
    #: state — a reason attached to a clean file is a warning about nothing.
    scan_failure_reason = serializers.CharField(source="failure_reason", read_only=True)

    class Meta:
        model = RequirementAttachment
        fields = (
            "id",
            "kind",
            "scan_status",
            "scan_failure_reason",
            "size_bytes",
            "language",
        )
        read_only_fields = fields


class AttachmentUploadRequestSerializer(serializers.Serializer[dict[str, Any]]):
    """What the client declares before any bytes exist.

    The checksum is required, and it is the point of the whole handshake: finalization streams the
    stored object back and compares it against these three values, so an upload that swapped the
    file after presigning is refused rather than stored. Without them "verify the upload" would mean
    "believe the client".
    """

    kind = serializers.ChoiceField(choices=RequirementAttachment.Kind.choices)
    content_type = serializers.CharField(max_length=120)
    size_bytes = serializers.IntegerField(min_value=1)
    sha256 = serializers.CharField(min_length=64, max_length=64)
    #: For a voice note, the language it was spoken in. Carried through so a vendor who cannot
    #: understand it is a matching decision rather than a silent failure at the door.
    language = serializers.CharField(max_length=16, required=False, allow_blank=True, default="")


class AttachmentUploadGrantSerializer(serializers.Serializer[dict[str, Any]]):
    """The signed-upload grant. Bytes go to storage, never through Django."""

    id = serializers.UUIDField(read_only=True)
    kind = serializers.CharField(read_only=True)
    upload_url = serializers.URLField(read_only=True)
    upload_token = serializers.CharField(read_only=True)
    upload_expires_at = serializers.DateTimeField(read_only=True)
    #: `PENDING` on arrival, always. The object does not exist yet, so nothing has been scanned.
    scan_status = serializers.CharField(read_only=True)
    server_now = serializers.DateTimeField(read_only=True)


class AttachmentFinalizeSerializer(serializers.Serializer[dict[str, Any]]):
    upload_id = serializers.UUIDField()


class RequirementDraftSerializer(serializers.ModelSerializer[CustomerRequirement]):
    """The full record the four-screen flow reads after every write.

    `inferred_lifecycle` is published but is never rendered as an archetype name — `GAP-006` is
    explicit that the Customer describes what they need and the platform works out the lifecycle.
    `lifecycle_explanation` is the sentence they actually see.
    """

    category_slug = serializers.SlugField(source="variant.service.slug", read_only=True)
    #: The name a human reads. `category_slug` is a slug and misnamed besides, so `My requests` was
    #: titling rows by formatting one — `frontend-execution-plan.md` §7, `M2-FE-213`.
    service_name = serializers.CharField(source="variant.service.name", read_only=True)
    inferred_lifecycle = serializers.CharField(source="archetype", read_only=True)
    lifecycle_explanation = serializers.SerializerMethodField()
    missing_required_answers = serializers.SerializerMethodField()
    address_id = serializers.UUIDField(read_only=True, allow_null=True)
    #: Derived from `flexibility_days`, which stays the source of truth. Published because the
    #: date-flexibility control is a checkbox and re-deriving the boolean per client is how two
    #: apps end up disagreeing about what zero days means.
    is_date_flexible = serializers.SerializerMethodField()
    #: The three tracking fields that were on the list projection and not on this one, so a direct
    #: navigation to `/requests/{id}` rendered a state with no countdown and no quote count
    #: (`M2-FE-215`). Filling them from the list cache would have shown a deadline read at some
    #: earlier moment as though it had just been confirmed, on the one screen whose job is to be
    #: truthful about a promise with a clock on it.
    quote_delivery_deadline_at = serializers.DateTimeField(source="quotes_due_at", read_only=True)
    teaser_count = serializers.SerializerMethodField()
    closure_reason = serializers.SerializerMethodField()
    #: Stated **before** the button rather than after. Until now the only field saying a
    #: requirement costs nothing was on the submit *response* — i.e. the Customer was told after
    #: they had already sent it (`M2-FE-212`).
    is_free = serializers.SerializerMethodField()
    attachments = RequirementAttachmentSerializer(many=True, read_only=True)
    server_now = serializers.SerializerMethodField()

    class Meta:
        model = CustomerRequirement
        fields = (
            "id",
            "status",
            "category_slug",
            "service_name",
            "inferred_lifecycle",
            "lifecycle_explanation",
            "answers",
            "missing_required_answers",
            "address_id",
            "requested_start",
            "flexibility_days",
            "is_date_flexible",
            "service_by",
            "quote_delivery_deadline_at",
            "teaser_count",
            "closure_reason",
            "is_free",
            "budget_min_paise",
            "budget_max_paise",
            "language",
            "additional_details",
            "attachments",
            "server_now",
        )
        read_only_fields = fields

    def get_lifecycle_explanation(self, obj: CustomerRequirement) -> str | None:
        return lifecycle_explanation(obj.archetype)

    def get_missing_required_answers(self, obj: CustomerRequirement) -> list[str]:
        return missing_answer_codes(obj)

    def get_is_date_flexible(self, obj: CustomerRequirement) -> bool:
        return obj.flexibility_days > 0

    def get_teaser_count(self, obj: CustomerRequirement) -> int:
        return confirmed_teaser_count(obj)

    def get_closure_reason(self, obj: CustomerRequirement) -> str | None:
        return closure_reason(obj)

    def get_is_free(self, _obj: CustomerRequirement) -> bool:
        """Always `True`, and read from the server on purpose.

        Submitting a requirement is free in both archetypes — the A3 unlock and the A5 visit plan
        are separate purchases made later, against a delivered quote or a confirmed visit. A screen
        that hardcodes the promise keeps making it after the policy changes; this is the field that
        would go `false` first.
        """
        return True

    def get_server_now(self, _obj: CustomerRequirement) -> str:
        server_now: datetime = self.context["server_now"]
        return server_now.isoformat()


class RequirementSubmitSerializer(serializers.Serializer[dict[str, Any]]):
    #: Set only after the Customer has seen the duplicate and chosen to continue anyway. The
    #: override is explicit because a silent one turns the duplicate check into decoration.
    allow_duplicate = serializers.BooleanField(required=False, default=False)


class RequirementSubmittedSerializer(serializers.Serializer[dict[str, Any]]):
    id = serializers.UUIDField(read_only=True)
    status = serializers.CharField(read_only=True)
    service_by = serializers.DateField(read_only=True, allow_null=True)
    quote_delivery_deadline_at = serializers.DateTimeField(read_only=True, allow_null=True)
    #: Not decoration. `M2-FE-212` requires the submit screen to promise nothing is charged until
    #: quotes arrive, and that promise belongs to the server that enforces it.
    is_free = serializers.BooleanField(read_only=True)
    server_now = serializers.DateTimeField(read_only=True)


class RequirementSummarySerializer(serializers.ModelSerializer[CustomerRequirement]):
    """A `My requests` row."""

    category_slug = serializers.SlugField(source="variant.service.slug", read_only=True)
    #: See `RequirementDraftSerializer.service_name`. A row title is not a slug.
    service_name = serializers.CharField(source="variant.service.name", read_only=True)
    lifecycle_explanation = serializers.SerializerMethodField()
    quote_delivery_deadline_at = serializers.DateTimeField(source="quotes_due_at", read_only=True)
    teaser_count = serializers.SerializerMethodField()
    closure_reason = serializers.SerializerMethodField()
    last_activity_at = serializers.DateTimeField(source="updated_at", read_only=True)

    class Meta:
        model = CustomerRequirement
        fields = (
            "id",
            "status",
            "category_slug",
            "service_name",
            "lifecycle_explanation",
            "service_by",
            "quote_delivery_deadline_at",
            "teaser_count",
            "closure_reason",
            "last_activity_at",
        )
        read_only_fields = fields

    def get_lifecycle_explanation(self, obj: CustomerRequirement) -> str | None:
        return lifecycle_explanation(obj.archetype)

    def get_teaser_count(self, obj: CustomerRequirement) -> int:
        annotated = getattr(obj, "teaser_count", None)
        return annotated if isinstance(annotated, int) else confirmed_teaser_count(obj)

    def get_closure_reason(self, obj: CustomerRequirement) -> str | None:
        return closure_reason(obj)


class RequirementSummaryPageSerializer(serializers.Serializer[dict[str, Any]]):
    """The page envelope `My requests` has always been sent, now also declared.

    Until 13 August the operation declared a bare array and the view returned this envelope, so a
    client generated from the contract threw on its first real request and every consumer had to
    hand-write a narrowing around the generated type. The shape is
    `carts.serializers.BookingGroupPageSerializer`'s, because there is no reason for two page
    envelopes in one API.
    """

    next = serializers.URLField(allow_null=True)
    previous = serializers.URLField(allow_null=True)
    results = RequirementSummarySerializer(many=True)


class DuplicateCheckQuerySerializer(serializers.Serializer[dict[str, Any]]):
    variant_id = serializers.UUIDField()
    address_id = serializers.UUIDField()
    requested_start = serializers.DateTimeField()


class ProbableDuplicateSerializer(serializers.Serializer[dict[str, Any]]):
    id = serializers.UUIDField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)
    #: Server-authored. The client never reconstructs a summary from another requirement's answers.
    summary = serializers.CharField(read_only=True)
    status = serializers.CharField(read_only=True)
    mergeable = serializers.BooleanField(read_only=True)


class ProbableDuplicateListSerializer(serializers.Serializer[dict[str, Any]]):
    probable_duplicates = ProbableDuplicateSerializer(many=True, read_only=True)


class RequirementTimelineEventSerializer(serializers.Serializer[dict[str, Any]]):
    id = serializers.CharField(read_only=True)
    at = serializers.DateTimeField(read_only=True)
    type = serializers.CharField(read_only=True)
    detail = serializers.JSONField(read_only=True)


class RequirementTimelineSerializer(serializers.Serializer[dict[str, Any]]):
    events = RequirementTimelineEventSerializer(many=True, read_only=True)
    server_now = serializers.DateTimeField(read_only=True)


# ---------------------------------------------------------------------------
# Customer: teasers
# ---------------------------------------------------------------------------


class QuoteTeaserSerializer(serializers.Serializer[dict[str, Any]]):
    """**This payload goes to a Customer who has paid nothing.**

    An explicit field list rather than a `ModelSerializer`, because the difference between the two
    is one `fields` edit away from shipping a vendor's name to an unpaid Customer. The price
    *band* is the point: enough to judge whether unlocking is worth it, not enough to act on.
    """

    proposal_id = serializers.UUIDField(read_only=True)
    vendor_type = serializers.CharField(read_only=True)
    is_verified = serializers.BooleanField(read_only=True)
    price_band_low_paise = serializers.IntegerField(read_only=True)
    price_band_high_paise = serializers.IntegerField(read_only=True)
    is_out_of_budget = serializers.BooleanField(read_only=True)


class QuoteTeaserListSerializer(serializers.Serializer[dict[str, Any]]):
    teasers = QuoteTeaserSerializer(many=True, read_only=True)
    usable_quote_count = serializers.IntegerField(read_only=True)
    #: Mirrors the server's own guard so the control can be disabled, never so the client can
    #: decide. The unlock command refuses independently — a stale `true` is exactly the state a
    #: duplicate purchase lives in.
    unlock_available = serializers.BooleanField(read_only=True)
    server_now = serializers.DateTimeField(read_only=True)


# ---------------------------------------------------------------------------
# Clarification, shared by both roles
# ---------------------------------------------------------------------------


class RequirementQuestionSerializer(serializers.ModelSerializer[RequirementQuestion]):
    """One question and its answer, on the timeline both parties read.

    `asked_by_role` is new at 1.26.0 and is not decoration: clarification ran one way until this
    release, so "who asked" was implied by the surface you were looking at. Now that a Customer can
    ask a vendor about a delivered quote, a client with no direction field renders both halves of a
    conversation as though the other side started it, and neither app can tell whose turn it is.

    Derived by **identity comparison, not by inference**: the requirement records its Customer and
    the invitation records its Partner's user, so the three answers are exact rather than guessed.
    `OPERATIONS` covers an assisted question, which has no route yet and will have one in Wave C6 —
    naming it now is what stops the answer defaulting to `VENDOR` when it arrives.
    """

    asked_by_role = serializers.SerializerMethodField()

    class Meta:
        model = RequirementQuestion
        fields = (
            "id",
            "invitation",
            "asked_by_role",
            "question",
            "answer",
            "asked_at",
            "answered_at",
        )
        read_only_fields = fields

    @extend_schema_field(serializers.ChoiceField(choices=QUESTION_ASKER_ROLES))
    def get_asked_by_role(self, obj: RequirementQuestion) -> str:
        return question_asker_role(obj)


class QuestionCreateSerializer(serializers.Serializer[dict[str, Any]]):
    question = serializers.CharField(max_length=2000)


class QuestionAnswerSerializer(serializers.Serializer[dict[str, Any]]):
    answer = serializers.CharField(max_length=2000)


class SiteVisitSerializer(serializers.ModelSerializer[SiteVisit]):
    """One visit, in both its shapes.

    `is_plan_visit` is the field that decides how the whole record reads. A plan visit is paid for
    out of the A5 visit plan, occupies a share of it and opens an estimate window when it completes;
    an ad-hoc visit is a vendor-priced journey with none of that behind it. Publishing the flag
    rather than letting a client infer it from `fee_paise` keeps the two from being rendered as one
    thing with a different price.
    """

    is_plan_visit = serializers.SerializerMethodField()
    #: The service area's own IANA zone, so a client renders "Tuesday 10am" in the hours the area
    #: actually keeps. `BookingWindows` has published one since M1 and the visit — booked against
    #: the *same* `carts.availability` grid — carried only an instant, so every caller fell back to
    #: a deprecated Hyderabad-only constant: correct while the platform is one city and wrong the
    #: day it is not (`M2-FE-421`).
    timezone = serializers.SerializerMethodField()

    class Meta:
        model = SiteVisit
        fields = (
            "id",
            "status",
            "is_plan_visit",
            "timezone",
            "fee_paise",
            "adjusts_against_final_price",
            "scheduled_for",
            "duration_minutes",
            "arrival_confirmed_at",
            "arrival_method",
            "completed_at",
            #: When a completed visit stops being allowed to produce an estimate. Null when the
            #: owner has set no post-visit window — which is an unset policy, not "no deadline
            #: soon", and the composer must not render it as time in hand.
            "estimate_due_at",
            "cancellation_reason_code",
        )
        read_only_fields = fields

    def get_is_plan_visit(self, obj: SiteVisit) -> bool:
        return obj.plan_share_id is not None

    def get_timezone(self, obj: SiteVisit) -> str:
        """The area's zone, or the platform's own as a last resort.

        A visit cannot exist on a requirement without a serviceable area — `_assert_submittable`
        refuses the submit — so the fallback is unreachable through any live path. It is written as
        the deployment's `TIME_ZONE` rather than a literal so that the one impossible case cannot
        become a second place Hyderabad is hardcoded.
        """
        area = getattr(obj.requirement, "service_area", None)
        return str(area.timezone) if area is not None else str(settings.TIME_ZONE)


class SiteVisitRequestSerializer(serializers.Serializer[dict[str, Any]]):
    #: No default. A free site visit gets refused by vendors who will not travel unpaid, and used
    #: by Customers as free consulting; the fee is what makes the visit real. The domain refuses
    #: a non-positive fee, and a default here would put a policy number in a serializer.
    fee_paise = serializers.IntegerField(min_value=1)
    adjusts_against_final_price = serializers.BooleanField(required=False, default=True)


class SiteVisitScheduleSerializer(serializers.Serializer[dict[str, Any]]):
    scheduled_for = serializers.DateTimeField()


class SiteVisitCompleteSerializer(serializers.Serializer[dict[str, Any]]):
    #: Optional. A visit that happened and produced nothing worth writing down is still a visit
    #: that happened, and requiring prose here would produce prose nobody reads.
    outcome_notes = serializers.CharField(required=False, allow_blank=True, max_length=4000)


# ---------------------------------------------------------------------------
# Partner: enquiries and proposals
# ---------------------------------------------------------------------------


class EnquirySummarySerializer(serializers.ModelSerializer[VendorInvitation]):
    """An enquiry list row.

    Reads the **snapshot**, not the live requirement: the snapshot is what this vendor was invited
    against, and re-reading the requirement would silently move the goalposts under a quote in
    progress. Customer identity and address are absent before acceptance by design.
    """

    requirement_id = serializers.UUIDField(read_only=True)
    category_slug = serializers.SlugField(
        source="requirement.variant.service.slug",
        read_only=True,
    )
    #: The catalogue's own name. It landed on `EnquiryDetail` at 1.24.0 and not here, so the
    #: **inbox list** went on de-slugging `category_slug` into a title — presentation of a server
    #: value that the server already holds correctly.
    service_name = serializers.CharField(
        source="requirement.variant.service.name",
        read_only=True,
    )
    archetype = serializers.CharField(source="snapshot.archetype", read_only=True)
    requested_start = serializers.DateTimeField(source="snapshot.requested_start", read_only=True)
    service_by = serializers.DateField(source="snapshot.service_by", read_only=True)
    language = serializers.CharField(source="snapshot.language", read_only=True)
    #: Guidance for a countdown only. The backend owns expiry and slot ownership; a client clock
    #: that has drifted must never be what decides an enquiry is still open.
    responds_by = serializers.DateTimeField(read_only=True)

    class Meta:
        model = VendorInvitation
        #: Annotated widely so the detail subclass can extend it. Without this the inherited
        #: `Meta` fixes the tuple at its own arity and every added field is a type error.
        fields: tuple[str, ...] = (
            "id",
            "requirement_id",
            "category_slug",
            "service_name",
            "archetype",
            "status",
            "wave",
            "requested_start",
            "service_by",
            "language",
            "responds_by",
            "created_at",
        )
        read_only_fields: tuple[str, ...] = fields


class EnquirySummaryPageSerializer(serializers.Serializer[dict[str, Any]]):
    """The Partner enquiry inbox's page envelope.

    The same correction as `RequirementSummaryPageSerializer`, and it closes a second gap Session B
    logged: no `cursor` parameter was published, so a Partner with more than twenty enquiries saw a
    silently truncated inbox with no way to page past it.
    """

    next = serializers.URLField(allow_null=True)
    previous = serializers.URLField(allow_null=True)
    results = EnquirySummarySerializer(many=True)


class VendorAttachmentSerializer(serializers.Serializer[dict[str, Any]]):
    """One of the Customer's checked files, as a short-lived signed link.

    `download_url` is a bearer credential — anyone holding it holds the file — which is why it is
    minted per read and expires in minutes rather than being stored anywhere.
    """

    id = serializers.UUIDField(read_only=True)
    kind = serializers.CharField(read_only=True)
    size_bytes = serializers.IntegerField(read_only=True)
    #: For a voice note, the language it was spoken in — the field that decides whether this vendor
    #: can act on it at all.
    language = serializers.CharField(read_only=True, allow_blank=True)
    download_url = serializers.URLField(read_only=True)
    expires_at = serializers.DateTimeField(read_only=True)


class VendorAttachmentListSerializer(serializers.Serializer[dict[str, Any]]):
    """Attachments this vendor may see, and whether they still may.

    `has_access` is `false` once the invitation was declined, expired or withdrawn and this vendor
    was not selected. It is published as a state on a `200` rather than as an error because the
    vendor is entitled to their own enquiry record either way, and because "there are no
    photographs" and "you may no longer see the photographs" are different things to render.
    """

    has_access = serializers.BooleanField(read_only=True)
    attachments = VendorAttachmentSerializer(many=True, read_only=True)
    server_now = serializers.DateTimeField(read_only=True)


class EnquiryDetailSerializer(EnquirySummarySerializer):
    answers = serializers.JSONField(source="snapshot.answers", read_only=True)
    additional_details = serializers.CharField(
        source="snapshot.additional_details",
        read_only=True,
    )
    budget_min_paise = serializers.IntegerField(
        source="snapshot.budget_min_paise",
        read_only=True,
        allow_null=True,
    )
    budget_max_paise = serializers.IntegerField(
        source="snapshot.budget_max_paise",
        read_only=True,
        allow_null=True,
    )
    #: **The basis every quote on this requirement is compared on.** `_required_tax_basis` forces
    #: each proposal onto whichever basis the first vendor used and refuses a mismatch — against a
    #: vendor the second one cannot see. Blank means nobody has quoted yet and this vendor sets it
    #: (`M2-FE-311`).
    required_tax_basis = serializers.SerializerMethodField()
    #: The quotes this vendor has already submitted against this enquiry, so the composer opens on
    #: the current revision rather than on an empty form.
    proposals = serializers.SerializerMethodField()
    questions = RequirementQuestionSerializer(many=True, read_only=True)
    site_visits = SiteVisitSerializer(many=True, read_only=True)
    #: The one read carrying a hard `responds_by`. Without the server's own clock beside it a
    #: countdown is drawn against a browser clock that may have drifted, on the field that decides
    #: whether the vendor still has a slot.
    server_now = serializers.SerializerMethodField()

    class Meta(EnquirySummarySerializer.Meta):
        fields = (
            *EnquirySummarySerializer.Meta.fields,
            "answers",
            "additional_details",
            "budget_min_paise",
            "budget_max_paise",
            "required_tax_basis",
            "decline_reason_code",
            "proposals",
            "questions",
            "site_visits",
            "server_now",
        )
        read_only_fields = fields

    def get_required_tax_basis(self, obj: VendorInvitation) -> str:
        from apps.requirements.proposals import required_tax_basis  # noqa: PLC0415 - import cycle

        return required_tax_basis(obj.requirement)

    def get_proposals(self, obj: VendorInvitation) -> list[dict[str, Any]]:
        queryset = Proposal.objects.filter(invitation=obj).order_by("-revision")
        return list(ProposalSerializer(queryset, many=True).data)

    def get_server_now(self, _obj: VendorInvitation) -> str:
        return timezone.now().isoformat()


class EnquiryDeclineSerializer(serializers.Serializer[dict[str, Any]]):
    #: Required, and the database agrees: `requirements_decline_needs_reason` refuses a declined
    #: invitation with an empty reason. Declines without reasons make replacement guesswork.
    #: Constrained to `INVITATION_DECLINE_REASONS` since 1.24.0 — an unconstrained slug meant every
    #: app invented its own strings and no Operations report could group them.
    reason_code = serializers.ChoiceField(choices=INVITATION_DECLINE_REASONS)


class ProposalStageSerializer(serializers.Serializer[dict[str, Any]]):
    """One A5 milestone, published so two vendors cannot send two incomparable structures.

    Until 1.24.0 `stages` was an untyped list and the domain read exactly one key, `amount_paise`.
    Everything a Customer needs to *read* a stage — what it delivers, when it ends — was
    client-authored, so the comparison view had nothing stable to render (`M2-FE-309`).

    `title` is required and the rest are not: a stage with a name and an amount is a comparable
    stage, and refusing one because a vendor did not fill in an end date would push them back to
    a single-line quote.
    """

    title = serializers.CharField(max_length=200)
    deliverable = serializers.CharField(
        required=False, allow_blank=True, max_length=2000, default=""
    )
    amount_paise = serializers.IntegerField(min_value=0)
    ends_on = serializers.DateField(required=False, allow_null=True, default=None)

    def to_representation(self, instance: Any) -> dict[str, Any]:
        """Read a stored stage defensively; the column is a `JSONField`, not a table.

        Stages are stored as JSON, so a row written before this shape existed can be missing any
        key — and the declared-field path would raise `KeyError` on the *read*, turning an old
        proposal into a 500 on the screen that compares quotes. Reading through `.get` publishes the
        same four keys for every row and degrades an unknown stage to a blank title rather than an
        error page. `label` is accepted as a `title` alias because `engagements._a5_stages` already
        reads both.
        """
        stage = instance if isinstance(instance, dict) else {}
        return {
            "title": str(stage.get("title") or stage.get("label") or ""),
            "deliverable": str(stage.get("deliverable") or ""),
            "amount_paise": int(stage.get("amount_paise") or 0),
            "ends_on": stage.get("ends_on"),
        }


class ProposalMaterialLineSerializer(serializers.Serializer[dict[str, Any]]):
    """One material line on an A5 estimate — **not** a stage, and that is the whole point.

    Until 1.26.0 the wire carried exactly one money-carrying row type, so a vendor pricing cement
    sent it as a `ProposalStage` with their own title. A stage is a unit of evidence, approval and
    release, so that made a bag of cement a fundable milestone somebody had to *approve as work*.
    `README.md` is explicit that material money is spent rather than earned and therefore cannot be
    recovered like an unearned work stage; a row type that cannot tell the two apart cannot carry
    that rule (`M2-BE-543`).

    `quantity` and `unit` are here because a material line without them is unreadable in a
    comparison — "cement, 1,20,000 paise" against "cement, 40 bags at 3,000" is the difference
    between two quotes a Customer can compare and two they cannot. `unit` is free text on purpose:
    bags, cubic metres, running feet and coils are all real, and a closed vocabulary authored here
    would refuse whichever trade nobody thought of.
    """

    title = serializers.CharField(max_length=200)
    quantity = serializers.IntegerField(min_value=1, required=False, default=1)
    unit = serializers.CharField(max_length=32, required=False, allow_blank=True, default="")
    amount_paise = serializers.IntegerField(min_value=0)

    def to_representation(self, instance: Any) -> dict[str, Any]:
        """Read a stored line defensively; the column is a `JSONField`, not a table.

        The same rule as `ProposalStageSerializer.to_representation` and for the same reason: a row
        written before this shape existed must degrade rather than turn a comparison screen into a
        500.
        """
        line = instance if isinstance(instance, dict) else {}
        return {
            "title": str(line.get("title") or ""),
            "quantity": int(line.get("quantity") or 1),
            "unit": str(line.get("unit") or ""),
            "amount_paise": int(line.get("amount_paise") or 0),
        }


class ProposalSerializer(serializers.ModelSerializer[Proposal]):
    """A vendor's own quote, read back to that vendor."""

    stages = ProposalStageSerializer(many=True, read_only=True)
    material_lines = ProposalMaterialLineSerializer(many=True, read_only=True)

    class Meta:
        model = Proposal
        fields = (
            "id",
            "requirement",
            "invitation",
            "revision",
            "status",
            "usability",
            "rejection_reason",
            #: The completed visit this estimate was priced on. Null for every A3 quote.
            "site_visit",
            #: Set when the Customer asked for a fresh price on an expired quote. The vendor's
            #: answer is a supersession, and it reuses the unlock or plan already paid for.
            "revalidation_requested_at",
            "rate_paise_per_worker_day",
            "minimum_days",
            "worker_count",
            "total_paise",
            "tax_paise",
            "tax_basis",
            "commission_treatment",
            "inclusions",
            "exclusions",
            "stages",
            "material_lines",
            "warranty_terms",
            "valid_until",
            "vendor_confirmed_at",
            "submitted_at",
        )
        read_only_fields = fields


class ProposalPageSerializer(serializers.Serializer[dict[str, Any]]):
    next = serializers.URLField(allow_null=True)
    previous = serializers.URLField(allow_null=True)
    results = ProposalSerializer(many=True)


class ProposalCreateSerializer(serializers.Serializer[dict[str, Any]]):
    """Both composers in one shape; the domain validates which fields the archetype requires.

    Deliberately not two serializers. `proposals.submit_proposal` already runs `_assert_a3_shape`
    or `_assert_a5_shape` against the requirement's own archetype, and a second archetype check
    here would be a copy of that rule which could disagree with it. A vendor sending A5 stages on
    an A3 requirement gets one refusal, from the layer that knows.
    """

    invitation_id = serializers.UUIDField()
    total_paise = serializers.IntegerField(min_value=1)
    tax_basis = serializers.ChoiceField(choices=Proposal.TaxBasis.choices)
    tax_paise = serializers.IntegerField(min_value=0, required=False, default=0)

    rate_paise_per_worker_day = serializers.IntegerField(
        min_value=1, required=False, allow_null=True
    )
    minimum_days = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    worker_count = serializers.IntegerField(min_value=1, required=False, allow_null=True)

    stages = ProposalStageSerializer(many=True, required=False)
    #: A5 only. Refused on an A3 quote — a workforce quote is a rate per worker per day, and a
    #: vendor supplying their own materials on a labour hire is not a shape this platform brokers.
    material_lines = ProposalMaterialLineSerializer(many=True, required=False)
    inclusions = serializers.ListField(child=serializers.CharField(max_length=200), required=False)
    exclusions = serializers.ListField(child=serializers.CharField(max_length=200), required=False)
    warranty_terms = serializers.CharField(required=False, allow_blank=True, max_length=4000)
    valid_until = serializers.DateTimeField(required=False, allow_null=True)
    commission_treatment = serializers.CharField(required=False, allow_blank=True, max_length=24)
    #: **Required for an A5 estimate**, and the field that was missing: `submit_proposal` has always
    #: taken a `site_visit_id` and no serializer published one, so an on-site estimate could not be
    #: submitted over HTTP at all. The domain refuses a visit that is not `COMPLETED` and not this
    #: vendor's, so this is an identifier and never an assertion.
    site_visit_id = serializers.UUIDField(required=False, allow_null=True)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if attrs.get("tax_paise", 0) > attrs["total_paise"]:
            raise serializers.ValidationError(
                {"tax_paise": "Tax cannot be more than the quoted total."}
            )
        return attrs


# ---------------------------------------------------------------------------
# Wave C2: the two front doors, selection and the engagement
#
# Every serializer below obeys the same rule the teaser obeys in the other direction: a payload
# that crosses a paywall carries what the payer bought and nothing else. A visit-plan read goes to
# a Customer who may not have paid yet, so it carries slot times and vendor *presence* — never a
# vendor's contact details, and never another vendor's price.
# ---------------------------------------------------------------------------


class AccessCheckoutSerializer(serializers.Serializer[dict[str, Any]]):
    """What a client needs to hand a charge to the payment provider, and nothing more.

    No provider payload, no key, no signature — `M2-BE-415` asks for payment status without
    leaking provider internals, and the order id plus the amount is the whole of what a checkout
    sheet needs. **The status here is never the grant.** `PROVIDER_PENDING` and `CAPTURED` describe
    the *attempt*; whether the Customer actually has an unlock or a charged plan is the `unlock` or
    `visit_plan` object beside it, and only a verified callback moves that.
    """

    payment_attempt_id = serializers.UUIDField(read_only=True)
    amount_paise = serializers.IntegerField(read_only=True)
    currency = serializers.CharField(read_only=True)
    provider = serializers.CharField(read_only=True)
    provider_order_id = serializers.CharField(read_only=True, allow_blank=True)
    status = serializers.CharField(read_only=True)
    #: When the held visit slot — and therefore this charge — lapses. Null for the A3 unlock, which
    #: holds nothing and expires with nothing.
    expires_at = serializers.DateTimeField(read_only=True, allow_null=True)
    server_now = serializers.DateTimeField(read_only=True)


class QuoteUnlockSerializer(serializers.ModelSerializer[QuoteUnlock]):
    """The A3 purchase. `ACTIVE` is only ever reached from a verified provider callback."""

    class Meta:
        model = QuoteUnlock
        fields = (
            "id",
            "status",
            "price_paise",
            "non_responsive_rejection_count",
            "receipt_series",
            "receipt_sequence",
            "activated_at",
            "consumed_at",
            "refunded_at",
        )
        read_only_fields = fields


class UnlockStateSerializer(serializers.Serializer[dict[str, Any]]):
    """The A3 paywall as one read: what it costs, whether it can be bought, and whether it was."""

    #: Null while nothing has been started. A `null` unlock with `is_available: true` is the state
    #: the buy button exists for.
    unlock = QuoteUnlockSerializer(read_only=True, allow_null=True)
    #: Mirrors the command's own guard so the control can be disabled — never so the client can
    #: decide. `create_unlock_checkout` re-checks under the requirement's row lock.
    is_available = serializers.BooleanField(read_only=True)
    #: Null when Operations has loaded no effective price. The screen says we cannot offer this
    #: yet; it does not invent INR 149.
    price_paise = serializers.IntegerField(read_only=True, allow_null=True)
    usable_quote_count = serializers.IntegerField(read_only=True)
    can_read_full_quotes = serializers.BooleanField(read_only=True)
    server_now = serializers.DateTimeField(read_only=True)


class VisitPlanShareSerializer(serializers.ModelSerializer[VisitPlanShare]):
    """One slot of the plan and the money that follows it.

    The split is published because the Customer is entitled to know what their money bought: a
    vendor visit payout and a Vsolve platform share, in paise, per slot. `REFUNDED` returns both.
    """

    class Meta:
        model = VisitPlanShare
        fields = (
            "id",
            "position",
            "status",
            "amount_paise",
            "vendor_payout_paise",
            "platform_share_paise",
            "settlement_reason_code",
            "committed_at",
            "earned_at",
            "refunded_at",
        )
        read_only_fields = fields


class VisitPlanTierSerializer(serializers.Serializer[dict[str, Any]]):
    """One row of the review screen's chooser. An empty list is the honest unpriced state."""

    plan_size = serializers.IntegerField(read_only=True)
    price_paise = serializers.IntegerField(read_only=True)


class VisitPlanSerializer(serializers.ModelSerializer[VisitPlan]):
    shares = VisitPlanShareSerializer(many=True, read_only=True)

    class Meta:
        model = VisitPlan
        fields = (
            "id",
            "status",
            "plan_size",
            "price_paise",
            #: What the Customer still owes: the tier price less any credit carried over from an
            #: A3 unlock when Operations reclassified the request. `M2-BE-427` — never charge twice.
            "credit_paise",
            "chargeable_paise",
            "shares",
            "receipt_series",
            "receipt_sequence",
            #: When every slot should be filled. Unfilled shares auto-refund past it.
            "fill_due_at",
            "chosen_at",
            "charged_at",
            "settled_at",
        )
        read_only_fields = fields


class VisitPlanStateSerializer(serializers.Serializer[dict[str, Any]]):
    """The A5 front door as one read: the chooser before, the tracker after.

    Deliberately one endpoint for both. Before a plan exists it carries the priced tiers the review
    screen offers; after one exists it carries the plan, its shares and the confirmed visits with
    their times. Two endpoints would have meant the tracker and the chooser could disagree about
    which plan the Customer has.
    """

    plan = VisitPlanSerializer(read_only=True, allow_null=True)
    available_tiers = VisitPlanTierSerializer(many=True, read_only=True)
    #: The confirmed visits, in slot order. This is what `M2-FE-421`'s tracker renders: when each
    #: professional is coming. Vendor identity is disclosed here **only** for a confirmed visit —
    #: somebody entering a home must be nameable — and never for an open slot.
    visits = SiteVisitSerializer(many=True, read_only=True)
    #: Mirrors `create_visit_plan_checkout`'s guard: true once a vendor holds a slot and the plan
    #: has not been paid for. The command re-checks.
    checkout_available = serializers.BooleanField(read_only=True)
    can_read_full_estimates = serializers.BooleanField(read_only=True)
    server_now = serializers.DateTimeField(read_only=True)


class VisitPlanChooseSerializer(serializers.Serializer[dict[str, Any]]):
    #: 1, 2 or 3 professionals. No default: how many people come to a Customer's home is their
    #: decision, and a default would be the platform quietly making it.
    plan_size = serializers.IntegerField(min_value=1, max_value=3)


class VendorCardSerializer(serializers.Serializer[dict[str, Any]]):
    """A responding vendor, as much of one as the Customer has paid to see.

    An explicit field list for the same reason `QuoteTeaserSerializer` is one. Before a visit is
    confirmed this is a badge, a rating and a type — no name, no photo, no contact. After
    confirmation the name is disclosed, because a person is entering the Customer's home and must
    be nameable; contact stays masked until the engagement.
    """

    partner_id = serializers.UUIDField(read_only=True)
    vendor_type = serializers.CharField(read_only=True)
    #: The real badge since 1.26.0: an Operations-approved `PartnerApplication`. It was hardcoded
    #: `True`, which made one of the four signals a Customer weighs meaningless.
    is_verified = serializers.BooleanField(read_only=True)
    #: Present only once this vendor has confirmed a visit slot. Null otherwise, always.
    display_name = serializers.CharField(read_only=True, allow_null=True)
    #: The 5 km band the matcher ranked on, from this invitation's own `ranking_provenance`. Null
    #: when we hold no fresh position for the vendor — published as null rather than filled with
    #: the pool median, because the median is a ranking device and printing it here would tell the
    #: Customer a distance nobody measured.
    distance_band_km = serializers.IntegerField(read_only=True, allow_null=True)


class VendorCardListSerializer(serializers.Serializer[dict[str, Any]]):
    """The A5 responding pool.

    **No rating field, and that is a decision rather than an omission.** `README.md` lists a rating
    among the four pre-confirmation signals and this platform has no review model — `carts`'
    professional card already refuses to publish one for the same reason. A star count invented
    here would be this serializer deciding what a vendor's reputation is. The field arrives when a
    review aggregate does.
    """

    vendor_cards = VendorCardSerializer(many=True, read_only=True)
    server_now = serializers.DateTimeField(read_only=True)


class CustomerProposalSerializer(serializers.ModelSerializer[Proposal]):
    """A full quote or estimate, for a Customer who has paid to read it.

    The entitlement is checked in the view before this serializer is ever constructed. Vendor
    identity is present because it is exactly what the unlock or the visit plan bought; contact
    details are not, because they are released by the engagement and not by the fee.
    """

    vendor = serializers.SerializerMethodField()
    stages = ProposalStageSerializer(many=True, read_only=True)
    material_lines = ProposalMaterialLineSerializer(many=True, read_only=True)
    site_visit = SiteVisitSerializer(read_only=True, allow_null=True)

    class Meta:
        model = Proposal
        fields = (
            "id",
            "status",
            "usability",
            "rejection_reason",
            "revision",
            "revalidation_requested_at",
            "vendor",
            "site_visit",
            "rate_paise_per_worker_day",
            "minimum_days",
            "worker_count",
            "total_paise",
            "tax_paise",
            "tax_basis",
            "commission_treatment",
            "inclusions",
            "exclusions",
            "stages",
            "material_lines",
            "warranty_terms",
            "valid_until",
            "submitted_at",
        )
        read_only_fields = fields

    def get_vendor(self, obj: Proposal) -> dict[str, Any]:
        business = getattr(obj.partner, "business_profile", None)
        return {
            "partner_id": obj.partner_id,
            "vendor_type": business.business_type if business is not None else "INDIVIDUAL",
            "is_verified": True,
            "display_name": (
                business.legal_name if business is not None else obj.partner.display_name
            ),
        }


class CustomerQuoteListSerializer(serializers.Serializer[dict[str, Any]]):
    quotes = CustomerProposalSerializer(many=True, read_only=True)
    #: How many free non-responsive replacements are left. Read from configuration and **null when
    #: the owner has not set the cap** — the screen must not offer a replacement on a policy that
    #: does not exist yet.
    non_responsive_rejections_remaining = serializers.IntegerField(read_only=True, allow_null=True)
    server_now = serializers.DateTimeField(read_only=True)


class ProposalRejectSerializer(serializers.Serializer[dict[str, Any]]):
    reason = serializers.ChoiceField(choices=Proposal.RejectionReason.choices)
    note = serializers.CharField(required=False, allow_blank=True, max_length=2000, default="")


class ProposalSelectionSerializer(serializers.ModelSerializer[ProposalSelection]):
    """Selection is not a booking, and this shape says so.

    `reconfirm_by` is the whole point: the Customer has chosen and the vendor has not yet agreed.
    Null when the area carries no operating windows and no business-hours deadline could be
    computed — which is an unset clock, not an unlimited one.
    """

    engagement_id = serializers.SerializerMethodField()

    class Meta:
        model = ProposalSelection
        fields = (
            "id",
            "requirement",
            "proposal",
            "partner",
            "status",
            "reconfirm_by",
            "decided_at",
            "decline_reason_code",
            "engagement_id",
            "created_at",
        )
        read_only_fields = fields

    def get_engagement_id(self, obj: ProposalSelection) -> str | None:
        engagement = getattr(obj, "engagement", None)
        return str(engagement.id) if engagement is not None else None


class SelectionCreateSerializer(serializers.Serializer[dict[str, Any]]):
    proposal_id = serializers.UUIDField()


class SelectionDeclineSerializer(serializers.Serializer[dict[str, Any]]):
    reason_code = serializers.SlugField(max_length=80)


class StageEvidenceSerializer(serializers.ModelSerializer[StageEvidence]):
    """What the vendor showed, as both parties read it.

    `object_key` is **not** published. It is a storage path, and publishing one turns every
    evidence read into an enumeration surface; a short-lived signed link is issued by the download
    endpoint instead, the same way `vendor_attachments` issues them for a Customer's site photos.
    """

    class Meta:
        model = StageEvidence
        fields = (
            "id",
            "kind",
            "note",
            "content_type",
            "size_bytes",
            "processing_status",
            "failure_reason",
            "created_at",
        )
        read_only_fields = fields


class StageEvidenceUploadRequestSerializer(serializers.Serializer[dict[str, Any]]):
    kind = serializers.ChoiceField(choices=StageEvidence.Kind.choices)
    content_type = serializers.CharField(max_length=120)
    size_bytes = serializers.IntegerField(min_value=1)
    sha256 = serializers.RegexField(r"^[0-9a-f]{64}$")

    def validate_kind(self, value: str) -> str:
        if value == StageEvidence.Kind.NOTE:
            raise serializers.ValidationError("A note carries no file; submit it with the stage.")
        return value


class StageEvidenceUploadGrantSerializer(serializers.Serializer[dict[str, Any]]):
    upload_id = serializers.UUIDField(read_only=True)
    upload_url = serializers.URLField(read_only=True)
    upload_token = serializers.CharField(read_only=True, allow_blank=True)
    expires_at = serializers.DateTimeField(read_only=True)


class StageEvidenceFinalizeSerializer(serializers.Serializer[dict[str, Any]]):
    upload_id = serializers.UUIDField()


class StageEvidenceSubmitSerializer(serializers.Serializer[dict[str, Any]]):
    #: Required. A stage handed over with no account of what was done is a stage nobody can review
    #: and nobody can defend in a dispute.
    note = serializers.CharField(max_length=4000)


class StageCorrectionSerializer(serializers.Serializer[dict[str, Any]]):
    note = serializers.CharField(max_length=2000)


#: Why a Customer disputed a stage. Published on the serializer rather than the column for the
#: reason the decline vocabulary is: the same column is written by system paths too.
STAGE_DISPUTE_REASONS = (
    ("NOT_DONE", "The work was not done"),
    ("PARTIALLY_DONE", "Only part of the work was done"),
    ("POOR_QUALITY", "The work was done badly"),
    ("WRONG_SCOPE", "This is not what was agreed"),
    ("OTHER", "Another reason"),
)

#: What Operations may decide about a disputed stage.
STAGE_DISPUTE_OUTCOMES = (
    ("APPROVE", "Approve the stage as submitted"),
    ("REQUEST_CORRECTION", "Send it back for correction"),
)


class StageDisputeSerializer(serializers.Serializer[dict[str, Any]]):
    reason_code = serializers.ChoiceField(choices=STAGE_DISPUTE_REASONS)
    note = serializers.CharField(max_length=2000, required=False, allow_blank=True, default="")


class StageDisputeDecisionSerializer(serializers.Serializer[dict[str, Any]]):
    outcome = serializers.ChoiceField(choices=STAGE_DISPUTE_OUTCOMES)
    note = serializers.CharField(max_length=2000)


class EngagementStageSerializer(serializers.ModelSerializer[EngagementStage]):
    """One shift-day or one milestone, with its money and its clocks.

    The four money fields are published because they are what the Customer's and the vendor's
    screens are both asking about, and because a client that only ever sees `amount_paise` cannot
    tell a funded stage from an approved one from a paid one.

    Both `*_due_at` fields are nullable and their nulls mean something specific: no review window
    is configured, so this stage will never auto-approve; no payout hold is configured, so its
    payout does not release on a clock. A screen must render nothing there rather than a countdown
    to a deadline nobody set.
    """

    evidence = StageEvidenceSerializer(many=True, read_only=True)

    class Meta:
        model = EngagementStage
        fields = (
            "id",
            "position",
            "label",
            "amount_paise",
            #: `WORK` or `MATERIAL_ADVANCE`. Read it before rendering a stage: a material advance
            #: is money spent on goods, not a milestone somebody performs, and it does not refund
            #: like unearned work.
            "kind",
            "scheduled_on",
            "status",
            "funding_state",
            "funded_paise",
            "approved_amount_paise",
            "released_amount_paise",
            "refunded_amount_paise",
            "correction_note",
            "dispute_reason_code",
            "review_due_at",
            "payout_release_due_at",
            "evidence",
            "funded_at",
            "started_at",
            "evidence_submitted_at",
            "approved_at",
            "released_at",
            "disputed_at",
        )
        read_only_fields = fields


class AccessReceiptSerializer(serializers.Serializer[dict[str, Any]]):
    """The durable reference for the access fee Vsolve actually collected (`M2-BE-415`).

    Not an invoice. `TaxDocument.order` is not nullable and an access fee has no `Order`, so making
    it nullable to fit one would weaken the invariant every M1 invoice depends on; the number comes
    from the same `commerce.DocumentSequence` under an `M2A-` series, which is gapless and is the
    one numbering authority. GST treatment of the unlock and the visit-plan fee is blocking owner
    decision 5, so this is a receipt reference and says so.

    `number` is formatted server-side in the `series-sequence` shape
    `commerce.TaxDocumentSerializer.get_number` already publishes, because the string a Customer
    quotes to support should not be assembled differently by each app that renders it.
    """

    kind = serializers.CharField(read_only=True)
    number = serializers.CharField(read_only=True)
    series = serializers.CharField(read_only=True)
    sequence = serializers.IntegerField(read_only=True)
    amount_paise = serializers.IntegerField(read_only=True)


class EngagementSerializer(serializers.ModelSerializer[Engagement]):
    """The agreement, frozen at reconfirmation.

    `commercial_mode` is the field the UI must read before it promises anything. `LEAD_ONLY` means
    the Customer pays the vendor directly and Vsolve's protection is matching and replacement;
    calling that a protected booking is the promise this platform cannot keep.

    The six money columns are the running total `M2-BE-504` reconciles: `staged_total_paise` always
    equals `total_paise + amendment_delta_paise`, by database constraint, so a client can show
    "agreed, then changed by, now" without doing arithmetic the server has not already checked.
    """

    stages = EngagementStageSerializer(many=True, read_only=True)
    #: The access fee this agreement came out of — the A3 unlock or the A5 visit plan — with its
    #: durable receipt number. `M2-FE-418` asks the agreement screen for a receipt and there was
    #: nothing to link to: `Engagement` published no order id and no document id, so the screen
    #: could only say where the record lives. Null when the fee was never charged, which is real:
    #: a plan whose whole price was covered by a reclassification credit takes no payment.
    access_receipt = serializers.SerializerMethodField()

    class Meta:
        model = Engagement
        fields = (
            "id",
            "requirement",
            "proposal",
            "partner",
            "archetype",
            "commercial_mode",
            "status",
            "total_paise",
            "tax_paise",
            "tax_basis",
            "commission_paise",
            "commission_treatment",
            "staged_total_paise",
            "amendment_delta_paise",
            "funded_total_paise",
            "approved_total_paise",
            "released_total_paise",
            "refunded_total_paise",
            "contact_released_at",
            "work_may_start_at",
            "disputed_at",
            "completed_at",
            "access_receipt",
            "stages",
            "created_at",
        )
        read_only_fields = fields

    @extend_schema_field(AccessReceiptSerializer(allow_null=True))
    def get_access_receipt(self, obj: Engagement) -> dict[str, Any] | None:
        return access_receipt_for(obj)


class EngagementPageSerializer(serializers.Serializer[dict[str, Any]]):
    next = serializers.CharField(read_only=True, allow_null=True)
    previous = serializers.CharField(read_only=True, allow_null=True)
    results = EngagementSerializer(many=True, read_only=True)


class EngagementEventSerializer(serializers.ModelSerializer[EngagementEvent]):
    """One line of the agreement's history.

    `actor_is_system` rather than an actor id: who a Customer or a vendor was is not the other
    party's business, but *whether a person or a clock* moved something is exactly what a timeline
    has to say — "approved by you" and "approved because the review window closed" are different
    sentences.
    """

    actor_is_system = serializers.SerializerMethodField()

    class Meta:
        model = EngagementEvent
        fields = (
            "id",
            "stage",
            "from_status",
            "to_status",
            "reason_code",
            "reason",
            "actor_is_system",
            "occurred_at",
        )
        read_only_fields = fields

    def get_actor_is_system(self, obj: EngagementEvent) -> bool:
        return obj.actor_id is None


class EngagementEventListSerializer(serializers.Serializer[dict[str, Any]]):
    events = EngagementEventSerializer(many=True, read_only=True)
    server_now = serializers.DateTimeField(read_only=True)


class AmendmentLineSerializer(serializers.Serializer[dict[str, Any]]):
    """One line of a change request, priced.

    `amount_paise` is signed on the wire even though the stored column is not: the M1
    `ScopeAmendmentLine` was built for additions only, so it holds an absolute value and the sign
    lives in the line's snapshot. Publishing the signed number is what lets one screen render both
    an addition and a reduction without knowing which table the sign came from.
    """

    position = serializers.IntegerField(read_only=True)
    kind = serializers.CharField(read_only=True)
    #: The line's own description. Named `title` rather than `label` for the reason
    #: `ProposalStageSerializer.title` is: `label` is an attribute of every DRF `Field`, and a
    #: serializer field of that name shadows it.
    title = serializers.CharField(read_only=True)
    quantity = serializers.IntegerField(read_only=True)
    amount_paise = serializers.IntegerField(read_only=True)


class EngagementAmendmentSerializer(serializers.Serializer[dict[str, Any]]):
    """A change request, as both parties read it.

    Flattened across `EngagementAmendment` and the M1 `ScopeAmendment` deliberately. The split is
    a storage fact — one amendment engine, two aggregates — and pushing it onto the wire would ask
    every client to know which half of the row holds the status.
    """

    id = serializers.UUIDField(read_only=True)
    engagement_id = serializers.UUIDField(read_only=True)
    stage_id = serializers.UUIDField(read_only=True, allow_null=True)
    kind = serializers.CharField(read_only=True)
    status = serializers.CharField(read_only=True)
    reason = serializers.CharField(read_only=True)
    #: Signed. Positive is extra work the Customer pays for; negative is scope taken out.
    delta_paise = serializers.IntegerField(read_only=True)
    lines = AmendmentLineSerializer(many=True, read_only=True)
    expires_at = serializers.DateTimeField(read_only=True)
    responded_at = serializers.DateTimeField(read_only=True, allow_null=True)
    applied_at = serializers.DateTimeField(read_only=True, allow_null=True)
    created_at = serializers.DateTimeField(read_only=True)
    server_now = serializers.DateTimeField(read_only=True)


class EngagementAmendmentListSerializer(serializers.Serializer[dict[str, Any]]):
    amendments = EngagementAmendmentSerializer(many=True, read_only=True)
    server_now = serializers.DateTimeField(read_only=True)


class AmendmentLineInputSerializer(serializers.Serializer[dict[str, Any]]):
    title = serializers.CharField(max_length=240)
    quantity = serializers.IntegerField(min_value=1, max_value=999)
    #: A5 change orders only, and signed. Ignored on an A3 time extension, where the server prices
    #: from the rate frozen on the engagement — a vendor who could restate that rate could
    #: re-price a job the Customer has already committed to.
    amount_paise = serializers.IntegerField(required=False, allow_null=True, default=None)


class EngagementAmendmentCreateSerializer(serializers.Serializer[dict[str, Any]]):
    kind = serializers.ChoiceField(choices=EngagementAmendment.Kind.choices)
    reason = serializers.CharField(max_length=240)
    stage_id = serializers.UUIDField(required=False, allow_null=True, default=None)
    lines = AmendmentLineInputSerializer(many=True)

    def validate_lines(self, value: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if not value:
            raise serializers.ValidationError("A change request needs at least one line.")
        return value


class EngagementAmendmentDecisionSerializer(serializers.Serializer[dict[str, Any]]):
    """What an acceptance returned.

    `checkout` is present only when the amendment needs a verified payment before it changes
    anything — a managed (A5) engagement taking on extra work. `null` means it is already
    authorized and applied: an A3 extension, or a reduction that refunded rather than charged.
    """

    amendment = EngagementAmendmentSerializer(read_only=True)
    checkout = AccessCheckoutSerializer(read_only=True, allow_null=True)


# ---------------------------------------------------------------------------
# Partner: A5 visit slots
# ---------------------------------------------------------------------------


class VisitSlotSerializer(serializers.Serializer[dict[str, Any]]):
    """One candidate start, in `booking/windows/` field order and with one field removed.

    `capacity` is deliberately absent. The A1 grid publishes it to a Customer choosing between
    Partners; this grid is scoped to the **one invited vendor**, so a capacity number here would be
    a live readout of that vendor's own diary depth and nothing a slot picker needs.
    """

    id = serializers.CharField(read_only=True)
    starts_at = serializers.DateTimeField(read_only=True)
    ends_at = serializers.DateTimeField(read_only=True)
    is_available = serializers.BooleanField(read_only=True)
    unavailable_reason = serializers.ChoiceField(
        choices=("PAST", "TOO_SOON", "OUTSIDE_OPERATING_WINDOW", "NO_CAPACITY"),
        read_only=True,
        allow_null=True,
    )


class VisitSlotDaySerializer(serializers.Serializer[dict[str, Any]]):
    date = serializers.DateField(read_only=True)
    is_today = serializers.BooleanField(read_only=True)
    slots = VisitSlotSerializer(many=True, read_only=True)


class VisitSlotGridSerializer(serializers.Serializer[dict[str, Any]]):
    """Candidate visit starts for one invited vendor.

    The Partner-side twin of `POST /api/v1/booking/windows/`, drawn from the same
    `carts.availability` snapshot and the same window loop. **The browser never computes
    availability** — it renders these slots and posts back an `id`, which is a signed token bound
    to this invitation and this start.
    """

    server_now = serializers.DateTimeField(read_only=True)
    visit_duration_minutes = serializers.IntegerField(read_only=True)
    availability_is_preliminary = serializers.BooleanField(read_only=True)
    timezone = serializers.CharField(read_only=True)
    days = VisitSlotDaySerializer(many=True, read_only=True)


class VisitSlotConfirmSerializer(serializers.Serializer[dict[str, Any]]):
    #: The opaque `id` of a slot this grid returned. Signed and bound to the invitation, so a
    #: vendor cannot book a competitor's slot or a time the grid never offered.
    slot_id = serializers.CharField(max_length=2000)


class VisitSlotConfirmationSerializer(serializers.Serializer[dict[str, Any]]):
    visit = SiteVisitSerializer(read_only=True)
    share = VisitPlanShareSerializer(read_only=True)
    #: True when this confirmation is the one that opens the Customer's plan checkout. The vendor
    #: sees a held slot rather than a scheduled one until that payment is verified, and the copy
    #: has to say so — the hold lapses harmlessly if the Customer never pays.
    opens_plan_checkout = serializers.BooleanField(read_only=True)
    server_now = serializers.DateTimeField(read_only=True)


class VisitArrivalSerializer(serializers.Serializer[dict[str, Any]]):
    """Arrival on the non-OTP fallback. No body: presence is the assertion, and who made it is
    the session."""


class VisitNoShowSerializer(serializers.Serializer[dict[str, Any]]):
    """Report that a scheduled visit did not happen.

    `party` decides the settlement and `reason_code` decides nothing — see `VISIT_NO_SHOW_REASONS`.
    The reason is still required, because "nobody turned up" without a cause is a row Operations
    cannot act on and a vendor cannot appeal.
    """

    party = serializers.ChoiceField(choices=VISIT_NO_SHOW_PARTIES)
    reason_code = serializers.ChoiceField(choices=VISIT_NO_SHOW_REASONS)


# ---------------------------------------------------------------------------
# Partner: workspace grants
# ---------------------------------------------------------------------------


class WorkspaceGrantSerializer(serializers.Serializer[dict[str, Any]]):
    """`{workspace_key, commercial_mode, actions[]}` and nothing else.

    No routes, no labels, no icons: the backend authorises, the frontend owns presentation. The
    key is opaque — a client that does not recognise one renders nothing rather than a generic
    tab, because a tab whose screens are not in the bundle is an unrecoverable dead end.
    """

    workspace_key = serializers.ChoiceField(
        choices=ServiceVariant.BookingArchetype.choices,
        read_only=True,
    )
    #: Read, never derived. ADR-0007 fixes A3 as LEAD_ONLY and A5 as MANAGED_PAYMENT_REQUIRED,
    #: which makes inferring it from the key tempting and wrong: this is the field that decides
    #: whether the UI promises Vsolve protection or tells a Partner to collect directly, and a
    #: client that computes it keeps promising protection straight through a policy change.
    commercial_mode = serializers.CharField(read_only=True)
    actions = serializers.ListField(child=serializers.CharField(), read_only=True)


class WorkspaceGrantListSerializer(serializers.Serializer[dict[str, Any]]):
    #: An empty list is a real, common state — registered but not yet reviewed — and must reach
    #: the client as `200 {"workspaces": []}` rather than a 403 that renders as an error.
    workspaces = WorkspaceGrantSerializer(many=True, read_only=True)


# ---------------------------------------------------------------------------
# Partner: masked demand preview
# ---------------------------------------------------------------------------


class DemandSummarySerializer(serializers.Serializer[dict[str, Any]]):
    """**This payload goes to a Partner who has completed no KYC.**

    An explicit field list, like `QuoteTeaserSerializer` and for the mirrored reason. Absent by
    requirement, not by omission: customer name, phone, full address, building number, the exact
    budget, and any identifier that resolves to a requirement this Partner was not invited to.

    `id` is a keyed hash rather than the requirement's primary key. An unapproved account holding
    real requirement ids is one lookup away from the record the moment any endpoint accepts one, and
    "no endpoint accepts one today" is not a property that survives the next endpoint.
    """

    id = serializers.CharField(read_only=True)
    headline = serializers.CharField(read_only=True)
    area_label = serializers.CharField(read_only=True)
    starts_on = serializers.DateField(read_only=True, allow_null=True)
    workspace_key = serializers.CharField(read_only=True)
    is_eligible = serializers.BooleanField(read_only=True)
    eligibility_hint = serializers.CharField(read_only=True)


class DemandPreviewSerializer(serializers.Serializer[dict[str, Any]]):
    #: Empty is a real answer. No demand in a Partner's city is `200` with `[]`, never a `404`.
    summaries = DemandSummarySerializer(many=True, read_only=True)
    matched_service_count = serializers.IntegerField(read_only=True)
    server_now = serializers.DateTimeField(read_only=True)


# ---------------------------------------------------------------------------
# Wave C2R / revision 4: the rate-card A3 front door.
#
# One disclosure rule runs through every shape below and it is the mirror of the teaser rule at the
# top of this file: **the Customer's screen never shows the lead's wage split, and the lead's
# screen never shows the Customer's all-inclusive rate.** The Customer is entitled to the whole
# number they pay and to how it divides between "paid to the crew" and "paid to Vsolve"; they are
# not entitled to the supervision margin, which is the mestri's livelihood. The lead is entitled to
# their own number and to nothing that includes this platform's fee, because a vendor shown a
# number they do not receive is a vendor who will argue about it on site.
# ---------------------------------------------------------------------------


class RateCardSerializer(serializers.ModelSerializer[RateCard]):
    """One published card, as Operations reads it back.

    The three components are published **on this surface only**. It is the Operations review
    calendar's read and the wage-floor cross-check happens against the same numbers, so hiding the
    split here would make the monthly review a screen you cannot review from.
    """

    lead_day_receipt_paise = serializers.IntegerField(read_only=True)

    class Meta:
        model = RateCard
        fields = (
            "id",
            "service_area",
            "skill",
            "worker_day_wage_paise",
            "supervision_margin_paise",
            "booking_fee_paise",
            "customer_day_rate_paise",
            "lead_day_receipt_paise",
            "standard_day_hours",
            "overtime_hourly_paise",
            "add_on_rates",
            "inclusions",
            "effective_from",
            "source_reference",
            "created_at",
        )
        read_only_fields = fields


class RateCardPublishSerializer(serializers.Serializer[dict[str, Any]]):
    """Operations publishes a card. Every value is required; none has a default.

    A default on any of these would be this file deciding a price, a shift length or an overtime
    rate. `effective_from` is required for the same reason: "today" is the one value a publisher
    should never get by omission, because it is the value that lands under live bookings.
    """

    service_area_id = serializers.UUIDField()
    skill_id = serializers.UUIDField()
    worker_day_wage_paise = serializers.IntegerField(min_value=1)
    supervision_margin_paise = serializers.IntegerField(min_value=1)
    booking_fee_paise = serializers.IntegerField(min_value=1)
    standard_day_hours = serializers.IntegerField(min_value=1, max_value=24)
    overtime_hourly_paise = serializers.IntegerField(min_value=1)
    #: What the preset's scope includes, in the Customer's words. Printed on the booking screen and
    #: frozen onto every booking made against this card.
    inclusions = serializers.ListField(child=serializers.CharField(max_length=200), min_length=1)
    #: Published add-on rates, keyed by add-on code, in paise. Extras run through the amendment
    #: engine at exactly these numbers.
    add_on_rates = serializers.DictField(child=serializers.IntegerField(min_value=1), default=dict)
    effective_from = serializers.DateField()
    source_reference = serializers.CharField(max_length=200, allow_blank=True, default="")


class RateCardListSerializer(serializers.Serializer[dict[str, Any]]):
    #: Empty is the honest answer while Operations has published nothing, and the reason instant
    #: booking is refused everywhere. Never a 404.
    rate_cards = RateCardSerializer(many=True, read_only=True)
    server_now = serializers.DateTimeField(read_only=True)


class RatePreviewSerializer(serializers.Serializer[dict[str, Any]]):
    """What instant booking would cost, on the screen the Customer reads **before** booking.

    `total_customer_paise = lead_receipt_paise + booking_fee_paise`, server-calculated, so the two
    sentences the screen shows always add to the one number the Customer agrees to. The
    supervision margin is deliberately not here: the split the Customer needs is "to the crew" and
    "to Vsolve", not the lead's own business.
    """

    is_available = serializers.BooleanField(read_only=True)
    rate_card_id = serializers.UUIDField(read_only=True, allow_null=True)
    headcount = serializers.IntegerField(read_only=True, allow_null=True)
    days = serializers.IntegerField(read_only=True, allow_null=True)
    day_rate_paise = serializers.IntegerField(read_only=True, allow_null=True)
    total_customer_paise = serializers.IntegerField(read_only=True, allow_null=True)
    #: Paid directly to the lead at day end. **Vsolve never holds this money** and the screen must
    #: not imply otherwise — an A3 booking is not wage-protected and saying so is the promise this
    #: platform cannot keep.
    lead_receipt_paise = serializers.IntegerField(read_only=True, allow_null=True)
    booking_fee_paise = serializers.IntegerField(read_only=True, allow_null=True)
    standard_day_hours = serializers.IntegerField(read_only=True, allow_null=True)
    overtime_hourly_paise = serializers.IntegerField(read_only=True, allow_null=True)
    add_on_rates = serializers.DictField(
        child=serializers.IntegerField(), read_only=True, allow_null=True
    )
    inclusions = serializers.ListField(
        child=serializers.CharField(), read_only=True, allow_null=True
    )
    #: Why instant booking is unavailable, when it is. `m2_rate_card_unavailable` or
    #: `m2_policy_unavailable` — published as a state on a `200` rather than as an error, because
    #: the Customer can still submit this request; it will simply collect quotes instead.
    unavailable_code = serializers.CharField(read_only=True, allow_null=True)
    unavailable_reason = serializers.CharField(read_only=True, allow_null=True)
    server_now = serializers.DateTimeField(read_only=True)


class RateCardBookSerializer(serializers.Serializer[dict[str, Any]]):
    #: The same explicit override `POST /requirements/{id}/submit/` takes. A Customer who has been
    #: shown a probable duplicate and wants both is making a decision, not an error.
    allow_duplicate = serializers.BooleanField(default=False)


class RateCardBookingSerializer(serializers.ModelSerializer[RateCardBooking]):
    """The Customer's booking, frozen at the rate it was made at."""

    class Meta:
        model = RateCardBooking
        fields = (
            "id",
            "status",
            "headcount",
            "days",
            "day_rate_paise",
            "total_customer_paise",
            "lead_receipt_paise",
            "booking_fee_paise",
            "standard_day_hours",
            "overtime_hourly_paise",
            "add_on_rates",
            "inclusions",
            "wave",
            "hold_expires_at",
            "fallback_reason_code",
            "fell_back_at",
            "confirmed_at",
            "created_at",
        )
        read_only_fields = fields


class BookingFeeSerializer(serializers.ModelSerializer[BookingFee]):
    """The one online charge, and how it was settled.

    The forfeit split is published because the Customer is entitled to know where their money went
    when a booking they missed was settled: a travel-compensation share to the crew that travelled,
    and the remainder to Vsolve. Publishing zero for both on an unsettled fee is not a placeholder
    — it is the true amount so far.
    """

    class Meta:
        model = BookingFee
        fields = (
            "id",
            "status",
            "amount_paise",
            "travel_compensation_paise",
            "platform_share_paise",
            "receipt_series",
            "receipt_sequence",
            "settlement_reason_code",
            "failure_code",
            "activated_at",
            "earned_at",
            "settled_at",
        )
        read_only_fields = fields


class RateCardStateSerializer(serializers.Serializer[dict[str, Any]]):
    """The whole A3 instant path as one read: the price before, the crew and the fee after.

    One endpoint rather than three, for the reason `VisitPlanStateSerializer` gives: the screen
    that offers instant booking and the screen that tracks it are the same screen at two moments,
    and two endpoints would let them disagree about which booking the Customer has.
    """

    preview = RatePreviewSerializer(read_only=True)
    booking = RateCardBookingSerializer(read_only=True, allow_null=True)
    booking_fee = BookingFeeSerializer(read_only=True, allow_null=True)
    #: Mirrors `create_booking_fee_checkout`'s guard so the pay button can be disabled — never so
    #: the client can decide. The command re-checks under the booking's row lock.
    checkout_available = serializers.BooleanField(read_only=True)
    #: The lead holding this job, named only once the fee is verified. Before that the Customer
    #: sees that *a* crew is holding it and not who — vendor identity is released by the
    #: confirmation, not by the hold.
    confirmed_partner_id = serializers.UUIDField(read_only=True, allow_null=True)
    confirmed_partner_name = serializers.CharField(read_only=True, allow_null=True)
    server_now = serializers.DateTimeField(read_only=True)


class CrewOfferSerializer(serializers.Serializer[dict[str, Any]]):
    """One crew offer as the **lead** sees it (`M2-BE-435`).

    An explicit field list, like the teaser, and the omission is the point: there is no
    `total_customer_paise` and no `booking_fee_paise` here at any status. ADR-0009 fixes the offer
    screen as "what they receive per day for the requested crew, paid directly by the customer at
    day end", and a lead shown the Customer's all-inclusive number would reasonably expect to
    receive it.
    """

    invitation_id = serializers.UUIDField(read_only=True)
    requirement_id = serializers.UUIDField(read_only=True)
    status = serializers.CharField(read_only=True)
    headcount = serializers.IntegerField(read_only=True)
    days = serializers.IntegerField(read_only=True)
    #: **Your** number: what you receive per day for the whole requested crew.
    lead_day_receipt_paise = serializers.IntegerField(read_only=True)
    lead_total_receipt_paise = serializers.IntegerField(read_only=True)
    standard_day_hours = serializers.IntegerField(read_only=True)
    overtime_hourly_paise = serializers.IntegerField(read_only=True)
    inclusions = serializers.ListField(child=serializers.CharField(), read_only=True)
    #: Wall-clock, minutes away. A crew offer runs on the M1 dispatch clock, not business hours.
    responds_by = serializers.DateTimeField(read_only=True, allow_null=True)
    #: Your verified roster size, published so the refusal is explainable before it happens rather
    #: than after: an offer you cannot accept should say why on the screen that offers it.
    verified_roster_size = serializers.IntegerField(read_only=True)
    requested_start = serializers.DateTimeField(read_only=True, allow_null=True)
    area_label = serializers.CharField(read_only=True, allow_blank=True)
    server_now = serializers.DateTimeField(read_only=True)


class CrewOfferListSerializer(serializers.Serializer[dict[str, Any]]):
    #: Empty is a real answer — no live offers is the ordinary state — and must be `200 []`.
    offers = CrewOfferSerializer(many=True, read_only=True)
    server_now = serializers.DateTimeField(read_only=True)


#: Why a lead passed on a crew offer. Published as its own vocabulary rather than reusing
#: `INVITATION_DECLINE_REASONS`, because these answers are what the decline-rate alarm reads and
#: the one that matters most has no equivalent on a quote enquiry: **the rate is below the street
#: rate this week.** A vendor who can only say "no capacity" cannot tell Operations their price is
#: wrong, which is the single signal ADR-0009 says the instant product lives or dies on.
CREW_OFFER_DECLINE_REASONS = (
    ("RATE_TOO_LOW", "The published rate is below the going rate"),
    ("NO_CREW_AVAILABLE", "No crew free on those dates"),
    ("TOO_FAR", "Too far to travel"),
    ("SITE_UNSUITABLE", "The site or the work is not something we do"),
    ("OTHER", "Another reason"),
)


class CrewOfferDeclineSerializer(serializers.Serializer[dict[str, Any]]):
    #: Required. A decline with no reason is a data point that cannot distinguish "your price is
    #: wrong" from "I am on holiday", and the alarm depends on telling those apart.
    reason_code = serializers.ChoiceField(choices=CREW_OFFER_DECLINE_REASONS)
    note = serializers.CharField(max_length=500, allow_blank=True, default="")


#: What happened on day one. About the **fact**, never the settlement — `party` decides the money
#: and no dropdown may, which is the rule `VISIT_NO_SHOW_REASONS` established at 1.26.0.
CREW_NO_SHOW_REASONS = (
    ("customer_no_show", "Nobody was at the site"),
    ("gate_locked", "The site was locked"),
    ("vendor_no_show", "The crew did not arrive"),
)


class CrewNoShowSerializer(serializers.Serializer[dict[str, Any]]):
    #: Who was not there. **This field decides the money** — a vendor no-show refunds in full and
    #: re-dispatches free, a customer no-show forfeits and splits — which is why it is a required
    #: choice with no default and why the reason code below cannot move it.
    party = serializers.ChoiceField(choices=VISIT_NO_SHOW_PARTIES)
    reason_code = serializers.ChoiceField(choices=CREW_NO_SHOW_REASONS)
