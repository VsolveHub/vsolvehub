"""Customer: requirement capture, and the teaser read that follows it.

The four-screen capture flow — draft, attachments, submit, `My requests` — plus the duplicate
check and the requirement timeline, and then the pre-unlock teaser list. The boundary is the
paywall: everything here is free to the Customer, and `QuoteTeaserSerializer` is the last shape
before one is asked for money. Clarification and the site-visit shapes both roles read live in
`enquiries`; everything a vendor sees lives there too.
"""

from datetime import datetime
from typing import Any

from rest_framework import serializers

from apps.requirements.models import CustomerRequirement, RequirementAttachment
from apps.requirements.selectors import (
    closure_reason,
    confirmed_teaser_count,
    lifecycle_explanation,
    missing_answer_codes,
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
