from typing import Any

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.catalog.models import Service, ServiceVariant
from apps.identity.phone import InvalidPhoneNumberError, normalize_phone_number
from apps.listings.models import (
    Application,
    ApplicationAttachment,
    ApplicationReport,
    ApplicationStatusEvent,
    Interview,
    JobSeekerProfile,
    Listing,
    ListingReport,
    VendorSubscription,
    VendorSubscriptionPlan,
)


class PhoneNumberField(serializers.CharField):
    """Accept a local or E.164 number; an optional blank contact stays blank.

    ``apps.identity.phone.normalize_phone_number`` is the one canonical parser, so
    an application phone and a listing contact phone are stored identically.
    """

    def to_internal_value(self, data: Any) -> str:
        value = super().to_internal_value(data)
        if value == "":
            return ""
        try:
            return normalize_phone_number(value)
        except InvalidPhoneNumberError as exc:
            raise serializers.ValidationError(str(exc), code="invalid_phone_number") from exc


#: ``structured_fields`` is a JSON column that every browse response carries, so
#: its shape is bounded: a flat map of a few short, human-sized entries.
MAX_STRUCTURED_FIELD_COUNT = 20
MAX_STRUCTURED_FIELD_NAME_LENGTH = 60
MAX_STRUCTURED_FIELD_VALUE_LENGTH = 300


#: The tap-to-pick job details, shown on every job card and page (see ``apps.listings.jobs``).
JOB_FIELDS: tuple[str, ...] = (
    "role_template",
    "job_category",
    "vacancies",
    "job_type",
    "experience_band",
    "required_skills",
    "preferred_skills",
    "responsibilities",
    "benefits",
    "languages",
    "min_qualification",
    "shift",
    "work_mode",
    "timing_start",
    "timing_end",
    "weekly_off",
    "urgency",
    "city",
    "area",
)


class ListingSummarySerializer(serializers.ModelSerializer[Listing]):
    poster_name = serializers.CharField(source="poster.display_name", read_only=True)
    service_name = serializers.CharField(source="variant.service.name", read_only=True)
    variant_name = serializers.CharField(source="variant.name", read_only=True)
    application_count = serializers.IntegerField(read_only=True, default=0)
    public_state = serializers.CharField(read_only=True)
    salary_display = serializers.SerializerMethodField()

    class Meta:
        model = Listing
        fields: tuple[str, ...] = (
            "id",
            "slug",
            "poster_name",
            "service_name",
            "variant_name",
            "title",
            "structured_fields",
            "salary_min_paise",
            "salary_max_paise",
            "salary_period",
            "salary_display",
            "status",
            "moderation_status",
            "public_state",
            "location_text",
            "is_premium",
            "published_at",
            "expires_at",
            "application_count",
            *JOB_FIELDS,
        )
        read_only_fields: tuple[str, ...] = JOB_FIELDS

    def get_salary_display(self, obj: Listing) -> str:
        if obj.salary_min_paise > 0:
            return ""
        return obj.structured_fields.get("salary_range", obj.structured_fields.get("pay_range", ""))


class ListingDetailSerializer(ListingSummarySerializer):
    contact_masked = serializers.SerializerMethodField()
    listing_type_schema = serializers.SerializerMethodField()
    application_schema = serializers.SerializerMethodField()

    class Meta(ListingSummarySerializer.Meta):
        fields = (
            # The detail page renders the full job description. The public browse
            # list is the payload that must not carry it, so it is opted back in
            # here instead of being inherited by every summary consumer.
            "description",
            *ListingSummarySerializer.Meta.fields,
            "contact_masked",
            "listing_type_schema",
            "application_schema",
        )

    def get_contact_masked(self, obj: Listing) -> dict[str, str]:
        return {
            "phone": obj.contact_phone[:2] + "******" + obj.contact_phone[-2:]
            if obj.contact_phone
            else "",
            "email": obj.contact_email[:2] + "***" if obj.contact_email else "",
        }

    def get_listing_type_schema(self, obj: Listing) -> dict[str, Any]:
        if not hasattr(obj, "variant") or not obj.variant:
            return {}
        cfg = obj.variant.a10_configurations.filter(status="ACTIVE").first()
        return cfg.listing_type_schema if cfg else {}

    def get_application_schema(self, obj: Listing) -> dict[str, Any]:
        if not hasattr(obj, "variant") or not obj.variant:
            return {}
        cfg = obj.variant.a10_configurations.filter(status="ACTIVE").first()
        return cfg.application_schema if cfg else {}


class JobCountsSerializer(serializers.Serializer[dict[str, Any]]):
    views = serializers.IntegerField()
    applied = serializers.IntegerField()
    shortlisted = serializers.IntegerField()
    interviews = serializers.IntegerField()
    connected = serializers.IntegerField()


class PartnerListingSerializer(ListingSummarySerializer):
    title = serializers.CharField(min_length=5, max_length=180, trim_whitespace=True)
    description = serializers.CharField(min_length=20, max_length=5000, trim_whitespace=True)
    structured_fields = serializers.DictField(required=False)
    contact_phone = PhoneNumberField(max_length=32, required=False, allow_blank=True)
    contact_email = serializers.EmailField(required=False, allow_blank=True, max_length=254)
    variant = serializers.UUIDField(source="variant_id", required=False)
    service_id = serializers.UUIDField(required=False, write_only=True)
    service_slug = serializers.CharField(required=False, write_only=True)
    is_premium = serializers.BooleanField(required=False, default=False)
    payment_attempt_id = serializers.UUIDField(read_only=True, allow_null=True)
    listing_type_schema = serializers.SerializerMethodField()
    #: Views, applied, shortlisted, interviews, connected: the numbers on the job card.
    counts = serializers.SerializerMethodField()

    class Meta(ListingSummarySerializer.Meta):
        fields = (
            # Partners author the description, so it stays on the read/write path
            # even though the public browse payload no longer carries it.
            "description",
            *ListingSummarySerializer.Meta.fields,
            "variant",
            "service_id",
            "service_slug",
            "contact_phone",
            "contact_email",
            "moderation_reason",
            "closed_at",
            "removed_at",
            "version",
            "created_at",
            "payment_attempt_id",
            "listing_type_schema",
            "counts",
            "view_count",
        )
        read_only_fields = (
            "status",
            "moderation_status",
            "moderation_reason",
            "closed_at",
            "removed_at",
            "version",
            "created_at",
            "payment_attempt_id",
            "listing_type_schema",
            *JOB_FIELDS,
        )

    def get_listing_type_schema(self, obj: Listing) -> dict[str, Any]:
        if not hasattr(obj, "variant") or not obj.variant:
            return {}
        cfg = obj.variant.a10_configurations.filter(status="ACTIVE").first()
        return cfg.listing_type_schema if cfg else {}

    @extend_schema_field(JobCountsSerializer)
    def get_counts(self, obj: Listing) -> dict[str, int]:
        live = obj.applications.exclude(
            status__in=(Application.Status.WITHDRAWN, Application.Status.EXPIRED)
        )
        return {
            "views": obj.view_count,
            "applied": live.count(),
            "shortlisted": live.filter(status=Application.Status.SHORTLISTED).count(),
            "interviews": live.filter(status=Application.Status.INTERVIEW).count(),
            "connected": live.filter(status=Application.Status.CONNECTED).count(),
        }

    def validate_structured_fields(self, value: dict[str, Any]) -> dict[str, Any]:
        """Keep role details to a small, flat, human-sized map.

        The column is JSON, so without this a poster could store a nested object of
        unbounded size that every browse response then carries to every reader.
        """

        if len(value) > MAX_STRUCTURED_FIELD_COUNT:
            raise serializers.ValidationError(
                f"At most {MAX_STRUCTURED_FIELD_COUNT} role details may be provided."
            )
        cleaned: dict[str, Any] = {}
        for key, item in value.items():
            name = str(key).strip()
            if not name:
                raise serializers.ValidationError("Each role detail needs a name.")
            if len(name) > MAX_STRUCTURED_FIELD_NAME_LENGTH:
                raise serializers.ValidationError(
                    f"Role detail names must be {MAX_STRUCTURED_FIELD_NAME_LENGTH} "
                    "characters or fewer."
                )
            if item is None or item == "":
                continue
            if isinstance(item, (dict, list)):
                raise serializers.ValidationError(
                    f"'{name}' must be a single value, not a nested object or list."
                )
            text = str(item).strip()
            if len(text) > MAX_STRUCTURED_FIELD_VALUE_LENGTH:
                raise serializers.ValidationError(
                    f"'{name}' must be {MAX_STRUCTURED_FIELD_VALUE_LENGTH} characters or fewer."
                )
            # Reconcile key aliases
            if name == "pay_range":
                name = "salary_range"
            elif name == "work_mode":
                name = "shift"
            cleaned[name] = text
        return cleaned

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        attrs = super().validate(attrs)
        structured = attrs.get("structured_fields")
        if structured is not None:
            variant = None
            if self.instance and hasattr(self.instance, "variant"):
                variant = self.instance.variant
            variant_id = attrs.get("variant_id")
            if not variant and variant_id:
                variant = ServiceVariant.objects.filter(id=variant_id).first()
            if not variant:
                service_id = attrs.get("service_id")
                service_slug = attrs.get("service_slug")
                if service_id:
                    variant = ServiceVariant.objects.filter(
                        service_id=service_id, booking_archetype="A10_LISTING", is_active=True
                    ).first()
                elif service_slug:
                    variant = ServiceVariant.objects.filter(
                        service__slug=service_slug, booking_archetype="A10_LISTING", is_active=True
                    ).first()

            if variant:
                config = variant.a10_configurations.filter(status="ACTIVE").first()
                if config and config.listing_type_schema:
                    properties = config.listing_type_schema.get("properties", {})
                    if properties:
                        allowed_keys = set(properties.keys())
                        for key, val in structured.items():
                            if key not in allowed_keys:
                                allowed_str = ", ".join(sorted(allowed_keys))
                                raise serializers.ValidationError(
                                    {
                                        "structured_fields": (
                                            f"'{key}' is not an allowed role detail. "
                                            f"Allowed: {allowed_str}."
                                        )
                                    }
                                )
                            prop_enum = properties[key].get("enum")
                            if prop_enum and val not in prop_enum:
                                raise serializers.ValidationError(
                                    {
                                        "structured_fields": (
                                            f"'{val}' is not an allowed choice for '{key}'. "
                                            f"Allowed choices: {', '.join(prop_enum)}."
                                        )
                                    }
                                )

        min_p = attrs.get("salary_min_paise", getattr(self.instance, "salary_min_paise", 0) or 0)
        max_p = attrs.get("salary_max_paise", getattr(self.instance, "salary_max_paise", 0) or 0)
        period = str(attrs.get("salary_period", getattr(self.instance, "salary_period", "")) or "")
        creating = self.instance is None
        if creating or min_p > 0 or max_p > 0 or period:
            if min_p < 1:
                raise serializers.ValidationError(
                    {
                        "salary_min_paise": "Enter a minimum pay in paise. The client sends rupees converted on submit."
                    }
                )
            if max_p < min_p:
                raise serializers.ValidationError(
                    {"salary_max_paise": "Maximum pay cannot be less than minimum pay."}
                )
            if period not in ("MONTHLY", "YEARLY", "HOURLY"):
                raise serializers.ValidationError(
                    {"salary_period": "Pay period must be MONTHLY, YEARLY, or HOURLY."}
                )

        return attrs


class ApplicationAttachmentSerializer(serializers.ModelSerializer[ApplicationAttachment]):
    class Meta:
        model = ApplicationAttachment
        fields = ("id", "file_url", "file_name", "created_at")


class ApplicationStatusEventSerializer(serializers.ModelSerializer[ApplicationStatusEvent]):
    class Meta:
        model = ApplicationStatusEvent
        fields = ("id", "from_status", "to_status", "kind", "note", "created_at")


class InterviewSerializer(serializers.ModelSerializer[Any]):
    mode_label = serializers.CharField(source="get_mode_display", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = Interview
        fields = (
            "id",
            "scheduled_date",
            "start_time",
            "mode",
            "mode_label",
            "location_text",
            "note",
            "status",
            "status_label",
            "candidate_note",
            "responded_at",
            "created_at",
        )


class ApplicationSerializer(serializers.ModelSerializer[Application]):
    listing_title = serializers.CharField(source="listing.title", read_only=True)
    #: For the "view listing" link: /listings/<listing_slug>.
    listing_slug = serializers.CharField(source="listing.slug", read_only=True)
    applicant_name = serializers.SerializerMethodField()
    applicant_phone = serializers.SerializerMethodField()
    applicant_email = serializers.SerializerMethodField()
    attachments = ApplicationAttachmentSerializer(many=True, read_only=True)
    status_events = ApplicationStatusEventSerializer(many=True, read_only=True)
    #: The latest interview, if any.
    interview = serializers.SerializerMethodField()
    employer_name = serializers.CharField(source="listing.poster.display_name", read_only=True)
    #: Shown to the candidate once an interview is accepted or they are connected.
    employer_phone = serializers.SerializerMethodField()

    class Meta:
        model = Application
        fields = (
            "interview",
            "employer_name",
            "employer_phone",
            "id",
            "listing",
            "listing_title",
            "listing_slug",
            "status",
            "applicant_snapshot",
            "applicant_name",
            "applicant_phone",
            "applicant_email",
            "cover_note",
            "resume_url",
            "attachments",
            "status_events",
            "contact_revealed_at",
            "duplicate_of",
            "withdrawn_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "status",
            "contact_revealed_at",
            "duplicate_of",
            "withdrawn_at",
            "created_at",
            "updated_at",
        )

    @extend_schema_field(InterviewSerializer(allow_null=True))
    def get_interview(self, obj: Application) -> dict[str, Any] | None:
        latest = obj.interviews.order_by("-created_at").first()
        return dict(InterviewSerializer(latest).data) if latest else None

    def get_employer_phone(self, obj: Application) -> str:
        from apps.listings.interviews import employer_contact  # noqa: PLC0415

        return employer_contact(obj)

    def _snapshot_value(self, obj: Application, key: str) -> str:
        if obj.contact_revealed_at is None and key in ("phone", "email"):
            return ""
        return str(obj.applicant_snapshot.get(key, ""))

    def get_applicant_name(self, obj: Application) -> str:
        return str(obj.applicant_snapshot.get("name", "Applicant"))

    def get_applicant_phone(self, obj: Application) -> str:
        return self._snapshot_value(obj, "phone")

    def get_applicant_email(self, obj: Application) -> str:
        return self._snapshot_value(obj, "email")


class SubmitApplicationSerializer(serializers.Serializer[dict[str, Any]]):
    """Customer application. The server is the authority; the form mirrors these rules."""

    name = serializers.CharField(min_length=2, max_length=120, trim_whitespace=True)
    phone = PhoneNumberField(max_length=32, trim_whitespace=True)
    email = serializers.EmailField(required=False, allow_blank=True, max_length=254)
    experience = serializers.CharField(
        max_length=120, required=False, allow_blank=True, trim_whitespace=True
    )
    cover_note = serializers.CharField(
        max_length=2000, required=False, allow_blank=True, trim_whitespace=True
    )
    resume_url = serializers.URLField(max_length=500, required=False, allow_blank=True)

    def validate_name(self, value: str) -> str:
        if not any(character.isalpha() for character in value):
            raise serializers.ValidationError("Enter your full name.", code="invalid_name")
        return value


class ActionReasonSerializer(serializers.Serializer[dict[str, Any]]):
    reason = serializers.CharField(
        max_length=480, required=False, allow_blank=True, trim_whitespace=True
    )


class ModerationSerializer(serializers.Serializer[dict[str, Any]]):
    approved = serializers.BooleanField()
    reason = serializers.CharField(required=False, allow_blank=True)


class ApplicationStatusSerializer(serializers.Serializer[dict[str, Any]]):
    status = serializers.ChoiceField(choices=Application.Status.choices)


class ReportSerializer(serializers.Serializer[dict[str, Any]]):
    reason = serializers.CharField(max_length=80, trim_whitespace=True)
    detail = serializers.CharField(
        max_length=2000, required=False, allow_blank=True, trim_whitespace=True
    )


class ListingReportSerializer(serializers.ModelSerializer[ListingReport]):
    class Meta:
        model = ListingReport
        fields = ("id", "listing", "reason", "detail", "status", "operations_case", "created_at")


class ApplicationReportSerializer(serializers.ModelSerializer[ApplicationReport]):
    class Meta:
        model = ApplicationReport
        fields = (
            "id",
            "application",
            "reason",
            "detail",
            "status",
            "operations_case",
            "created_at",
        )


class VendorSubscriptionPlanSerializer(serializers.ModelSerializer[VendorSubscriptionPlan]):
    service_name = serializers.CharField(source="service.name", read_only=True, allow_null=True)
    service_slug = serializers.CharField(source="service.slug", read_only=True, allow_null=True)

    class Meta:
        model = VendorSubscriptionPlan
        fields = (
            "id",
            "service",
            "service_name",
            "service_slug",
            "code",
            "name",
            "price_paise",
            "duration_days",
            "max_active_listings",
            "premium_capabilities",
            "premium_price_paise",
            "details",
            "is_active",
        )


class OpsVendorPlanServiceOptionSerializer(serializers.Serializer[dict[str, object]]):
    id = serializers.UUIDField()
    name = serializers.CharField()
    slug = serializers.CharField()
    subcategory_name = serializers.CharField()


class OpsVendorSubscriptionPlanCatalogSerializer(serializers.Serializer[dict[str, object]]):
    plans = VendorSubscriptionPlanSerializer(many=True)
    services = OpsVendorPlanServiceOptionSerializer(many=True)


class VendorSubscriptionSerializer(serializers.ModelSerializer[VendorSubscription]):
    plan = VendorSubscriptionPlanSerializer(read_only=True)
    payment_attempt_id = serializers.UUIDField(source="payment_attempt.id", read_only=True)

    class Meta:
        model = VendorSubscription
        fields = (
            "id",
            "plan",
            "payment_attempt_id",
            "status",
            "starts_at",
            "ends_at",
            "created_at",
        )


class ListingCategoryOptionSerializer(serializers.Serializer[dict[str, str]]):
    label = serializers.CharField()  # type: ignore[assignment]
    value = serializers.CharField(allow_blank=True)


class ListingFiltersTaxonomySerializer(serializers.Serializer[dict[str, Any]]):
    categories = ListingCategoryOptionSerializer(many=True)


class OpsCreateVendorSubscriptionPlanSerializer(
    serializers.ModelSerializer[VendorSubscriptionPlan]
):
    service = serializers.PrimaryKeyRelatedField(
        queryset=Service.objects.all(), allow_null=True, required=False
    )

    class Meta:
        model = VendorSubscriptionPlan
        fields = (
            "service",
            "code",
            "name",
            "price_paise",
            "duration_days",
            "max_active_listings",
            "premium_capabilities",
            "premium_price_paise",
            "details",
            "is_active",
        )


class OpsUpdateVendorSubscriptionPlanSerializer(
    serializers.ModelSerializer[VendorSubscriptionPlan]
):
    service = serializers.PrimaryKeyRelatedField(
        queryset=Service.objects.all(), allow_null=True, required=False
    )

    class Meta:
        model = VendorSubscriptionPlan
        fields = (
            "service",
            "name",
            "price_paise",
            "duration_days",
            "max_active_listings",
            "premium_capabilities",
            "premium_price_paise",
            "details",
            "is_active",
        )


# --- jobs: the quick, tap-to-pick post ------------------------------------------------------


def _short_list() -> serializers.ListField:
    return serializers.ListField(
        child=serializers.CharField(max_length=60), required=False, max_length=15
    )


class JobWriteSerializer(serializers.Serializer[dict[str, Any]]):
    """A job as the 4-step form sends it. Values are checked against ``jobs`` option lists in
    the service; free text is limited to skills, duties, benefits, title, city and area."""

    role_template_id = serializers.UUIDField(required=False, allow_null=True)
    title = serializers.CharField(max_length=180, required=False)
    job_category = serializers.CharField(max_length=80, required=False, allow_blank=True)
    vacancies = serializers.IntegerField(min_value=1, max_value=500, required=False)
    job_type = serializers.CharField(max_length=20, required=False, allow_blank=True)
    experience_band = serializers.CharField(max_length=12, required=False, allow_blank=True)
    required_skills = _short_list()
    preferred_skills = _short_list()
    responsibilities = _short_list()
    benefits = _short_list()
    languages = serializers.ListField(
        child=serializers.CharField(max_length=20), required=False, max_length=10
    )
    min_qualification = serializers.CharField(max_length=20, required=False, allow_blank=True)
    shift = serializers.CharField(max_length=12, required=False, allow_blank=True)
    work_mode = serializers.CharField(max_length=16, required=False, allow_blank=True)
    timing_start = serializers.TimeField(required=False, allow_null=True)
    timing_end = serializers.TimeField(required=False, allow_null=True)
    weekly_off = serializers.CharField(max_length=12, required=False, allow_blank=True)
    urgency = serializers.CharField(max_length=12, required=False, allow_blank=True)
    city = serializers.CharField(max_length=80, required=False, allow_blank=True)
    area = serializers.CharField(max_length=120, required=False, allow_blank=True)
    salary_min_paise = serializers.IntegerField(min_value=0, required=False)
    salary_max_paise = serializers.IntegerField(min_value=0, required=False)
    salary_period = serializers.CharField(max_length=16, required=False, allow_blank=True)
    #: Leave blank and the job writes its own description from the picked options.
    description = serializers.CharField(max_length=5000, required=False, allow_blank=True)
    contact_phone = PhoneNumberField(max_length=32, required=False, allow_blank=True)
    contact_email = serializers.EmailField(required=False, allow_blank=True, max_length=254)


class JobCreateSerializer(JobWriteSerializer):
    title = serializers.CharField(max_length=180)
    #: True (default) puts the job live at once; False keeps it as a draft.
    publish = serializers.BooleanField(required=False, default=True)


class JobUpdateSerializer(JobWriteSerializer):
    #: Rewrite the description from the current options.
    regenerate_description = serializers.BooleanField(required=False, default=False)


class JobOptionSerializer(serializers.Serializer[dict[str, Any]]):
    value = serializers.CharField()
    label = serializers.CharField()  # type: ignore[assignment]


class JobRoleTemplateSerializer(serializers.Serializer[dict[str, Any]]):
    id = serializers.UUIDField()
    name = serializers.CharField()
    skills = serializers.ListField(child=serializers.CharField())
    responsibilities = serializers.ListField(child=serializers.CharField())
    job_type = serializers.CharField()
    shift = serializers.CharField()
    work_mode = serializers.CharField()
    salary_min_rupees = serializers.IntegerField()
    salary_max_rupees = serializers.IntegerField()


class JobCategorySerializer(serializers.Serializer[dict[str, Any]]):
    name = serializers.CharField()
    roles = JobRoleTemplateSerializer(many=True)


class SalaryBandSerializer(serializers.Serializer[dict[str, Any]]):
    min_rupees = serializers.IntegerField()
    #: 0 means "and above".
    max_rupees = serializers.IntegerField()


class JobOptionsSerializer(serializers.Serializer[dict[str, Any]]):
    categories = JobCategorySerializer(many=True)
    job_types = JobOptionSerializer(many=True)
    experience_bands = JobOptionSerializer(many=True)
    qualifications = JobOptionSerializer(many=True)
    languages = JobOptionSerializer(many=True)
    benefits = serializers.ListField(child=serializers.CharField())
    shifts = JobOptionSerializer(many=True)
    work_modes = JobOptionSerializer(many=True)
    weekly_offs = JobOptionSerializer(many=True)
    urgencies = JobOptionSerializer(many=True)
    salary_periods = JobOptionSerializer(many=True)
    salary_bands = SalaryBandSerializer(many=True)
    cities = serializers.ListField(child=serializers.CharField())


# --- job seekers ----------------------------------------------------------------------------


class JobSeekerProfileSerializer(serializers.ModelSerializer[JobSeekerProfile]):
    has_resume = serializers.SerializerMethodField()
    phone = serializers.CharField(source="user.phone_number", read_only=True)

    class Meta:
        model = JobSeekerProfile
        fields = (
            "id",
            "full_name",
            "phone",
            "roles",
            "skills",
            "experience_band",
            "qualification",
            "languages",
            "city",
            "area",
            "expected_salary_rupees",
            "job_types",
            "available_from",
            "visibility",
            "resume_name",
            "has_resume",
            "updated_at",
        )
        read_only_fields = ("id", "phone", "resume_name", "has_resume", "updated_at")

    def get_has_resume(self, obj: JobSeekerProfile) -> bool:
        return bool(obj.resume_file)


class JobSeekerProfileWriteSerializer(serializers.Serializer[dict[str, Any]]):
    full_name = serializers.CharField(max_length=120, required=False, allow_blank=True)
    roles = serializers.ListField(child=serializers.CharField(max_length=60), required=False)
    skills = serializers.ListField(child=serializers.CharField(max_length=60), required=False)
    experience_band = serializers.CharField(max_length=12, required=False, allow_blank=True)
    qualification = serializers.CharField(max_length=20, required=False, allow_blank=True)
    languages = serializers.ListField(child=serializers.CharField(max_length=20), required=False)
    city = serializers.CharField(max_length=80, required=False, allow_blank=True)
    area = serializers.CharField(max_length=120, required=False, allow_blank=True)
    expected_salary_rupees = serializers.IntegerField(
        min_value=0, max_value=10_000_000, required=False
    )
    job_types = serializers.ListField(child=serializers.CharField(max_length=20), required=False)
    available_from = serializers.CharField(max_length=12, required=False, allow_blank=True)
    visibility = serializers.CharField(max_length=16, required=False)


class MatchSerializer(serializers.Serializer[dict[str, Any]]):
    score = serializers.IntegerField()
    #: STRONG, GOOD or OTHER.
    level = serializers.CharField()
    matched = serializers.ListField(child=serializers.CharField())
    missing = serializers.ListField(child=serializers.CharField())


class JobForYouSerializer(serializers.Serializer[dict[str, Any]]):
    listing = ListingSummarySerializer()
    match = MatchSerializer()


class QuickApplySerializer(serializers.Serializer[dict[str, Any]]):
    note = serializers.CharField(max_length=2000, required=False, allow_blank=True, default="")


class CandidateMatchSerializer(serializers.Serializer[dict[str, Any]]):
    """A candidate for one job, as the employer sees them. No phone number here: that comes
    with an application, or after an accepted interview."""

    profile_id = serializers.UUIDField()
    display_name = serializers.CharField()
    roles = serializers.ListField(child=serializers.CharField())
    skills = serializers.ListField(child=serializers.CharField())
    experience_band = serializers.CharField()
    qualification = serializers.CharField()
    languages = serializers.ListField(child=serializers.CharField())
    city = serializers.CharField()
    area = serializers.CharField()
    expected_salary_rupees = serializers.IntegerField()
    available_from = serializers.CharField()
    applied = serializers.BooleanField()
    application_id = serializers.UUIDField(allow_null=True)
    application_status = serializers.CharField(allow_blank=True)
    match = MatchSerializer()


class ProposeInterviewSerializer(serializers.Serializer[dict[str, Any]]):
    scheduled_date = serializers.DateField()
    start_time = serializers.TimeField()
    #: IN_PERSON, PHONE or VIDEO.
    mode = serializers.ChoiceField(choices=Interview.Mode.choices)
    location_text = serializers.CharField(max_length=240, required=False, allow_blank=True)
    note = serializers.CharField(max_length=480, required=False, allow_blank=True)


class InterviewAnswerSerializer(serializers.Serializer[dict[str, Any]]):
    note = serializers.CharField(max_length=480, required=False, allow_blank=True, default="")
