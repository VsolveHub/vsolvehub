"""Partner management directory.

The Operations screen that answers "who works for us" — a filterable roster and a
per-Partner detail projection — as distinct from the review queue in `onboarding`,
which decides applications.

Carried over from the banner this slice was cut from: it was defined at the end of
the original module because the detail projection composes
`PartnerApplicationTransitionSerializer` and `PartnerDocument`, both declared above.
The composition is unchanged; the transition serializer is now imported explicitly
from `onboarding`, and the arrow stays one-way.
"""

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.partners.models import PartnerApplication, PartnerDocument, PartnerProfile

from .onboarding import PartnerApplicationTransitionSerializer


class PartnerSkillChipSerializer(serializers.Serializer[dict[str, object]]):
    """A code/name pair, for the chips the directory renders."""

    code = serializers.CharField(read_only=True)
    name = serializers.CharField(read_only=True)


class OperationsPartnerDirectoryQuerySerializer(serializers.Serializer[dict[str, object]]):
    """The directory's filters.

    `status` accepts every application status, unlike the review queue's three. A management
    screen that could not show approved, suspended or offboarded Partners would be a screen that
    cannot answer "who works for us".
    """

    status = serializers.ChoiceField(choices=PartnerApplication.Status.choices, required=False)
    #: Repeatable: `?skill=electrical&skill=plumbing`. Read with `getlist` in the view, because
    #: a plain `Serializer` sees only the last value of a repeated query parameter.
    skill = serializers.ListField(
        child=serializers.SlugField(max_length=100), required=False, default=list
    )
    cursor = serializers.CharField(required=False, write_only=True)


class OperationsPartnerDirectoryItemSerializer(serializers.ModelSerializer[PartnerProfile]):
    """One directory row.

    Carries the application's *status* but none of its contents. Deciding on an application is
    the review surface's job, behind its own audit; this row exists so somebody can find a
    Partner.
    """

    application_id = serializers.UUIDField(source="application.id", read_only=True)
    application_status = serializers.CharField(source="application.status", read_only=True)
    submitted_at = serializers.DateTimeField(source="application.submitted_at", read_only=True)
    reviewed_at = serializers.DateTimeField(source="application.reviewed_at", read_only=True)
    skills = serializers.SerializerMethodField()
    service_count = serializers.IntegerField(read_only=True)
    service_area_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = PartnerProfile
        fields = (
            "id",
            "display_name",
            "experience_years",
            "application_id",
            "application_status",
            "submitted_at",
            "reviewed_at",
            "skills",
            "service_count",
            "service_area_count",
            "created_at",
        )
        read_only_fields = fields

    @extend_schema_field(PartnerSkillChipSerializer(many=True))
    def get_skills(self, partner: PartnerProfile) -> list[dict[str, object]]:
        return [
            {"code": link.skill.code, "name": link.skill.name} for link in partner.skill_links.all()
        ]


class OperationsPartnerDirectoryPageSerializer(serializers.Serializer[dict[str, object]]):
    next = serializers.URLField(read_only=True, allow_null=True)
    previous = serializers.URLField(read_only=True, allow_null=True)
    results = OperationsPartnerDirectoryItemSerializer(many=True, read_only=True)


class OperationsPartnerDocumentStateSerializer(serializers.ModelSerializer[PartnerDocument]):
    """A document's existence and verdict — never its contents.

    No URL and no storage key, by design. Revealing a document goes through
    `OperationsPartnerDocumentAccessView`, which mints a short-lived link and records who
    looked; publishing one here would route around that audit.
    """

    class Meta:
        model = PartnerDocument
        fields = ("id", "kind", "status", "reviewed_at", "uploaded_at")
        read_only_fields = fields


class OperationsPartnerDetailSerializer(serializers.ModelSerializer[PartnerProfile]):
    """One Partner, for the management screen."""

    application_id = serializers.UUIDField(source="application.id", read_only=True)
    application_status = serializers.CharField(source="application.status", read_only=True)
    application_version = serializers.IntegerField(source="application.version", read_only=True)
    change_request_message = serializers.CharField(
        source="application.change_request_message", read_only=True
    )
    submitted_at = serializers.DateTimeField(source="application.submitted_at", read_only=True)
    reviewed_at = serializers.DateTimeField(source="application.reviewed_at", read_only=True)
    skills = serializers.SerializerMethodField()
    services = serializers.SerializerMethodField()
    service_areas = serializers.SerializerMethodField()
    documents = serializers.SerializerMethodField()
    transitions = serializers.SerializerMethodField()

    class Meta:
        model = PartnerProfile
        fields = (
            "id",
            "display_name",
            "biography",
            "experience_years",
            "application_id",
            "application_status",
            "application_version",
            "change_request_message",
            "submitted_at",
            "reviewed_at",
            "skills",
            "services",
            "service_areas",
            "documents",
            "transitions",
            "created_at",
        )
        read_only_fields = fields

    @extend_schema_field(PartnerSkillChipSerializer(many=True))
    def get_skills(self, partner: PartnerProfile) -> list[dict[str, object]]:
        return [
            {"code": link.skill.code, "name": link.skill.name} for link in partner.skill_links.all()
        ]

    @extend_schema_field(PartnerSkillChipSerializer(many=True))
    def get_services(self, partner: PartnerProfile) -> list[dict[str, object]]:
        return [
            {
                "code": link.variant.service.slug,
                "name": f"{link.variant.service.name} - {link.variant.name}",
            }
            for link in partner.service_links.all()
        ]

    @extend_schema_field(PartnerSkillChipSerializer(many=True))
    def get_service_areas(self, partner: PartnerProfile) -> list[dict[str, object]]:
        return [
            {"code": link.service_area.slug, "name": link.service_area.name}
            for link in partner.service_area_links.all()
        ]

    @extend_schema_field(OperationsPartnerDocumentStateSerializer(many=True))
    def get_documents(self, partner: PartnerProfile) -> list[dict[str, object]]:
        application = getattr(partner, "application", None)
        if application is None:
            return []
        data = OperationsPartnerDocumentStateSerializer(application.documents.all(), many=True).data
        return list(data)

    @extend_schema_field(PartnerApplicationTransitionSerializer(many=True))
    def get_transitions(self, partner: PartnerProfile) -> list[dict[str, object]]:
        application = getattr(partner, "application", None)
        if application is None:
            return []
        ordered = sorted(application.transitions.all(), key=lambda row: row.occurred_at)
        return list(PartnerApplicationTransitionSerializer(ordered, many=True).data)
