"""Public catalog response contracts."""

from typing import Protocol, cast

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.catalog.models import (
    Category,
    Service,
    ServiceMedia,
    ServicePolicy,
    ServiceQuestion,
    ServiceQuestionOption,
    ServiceVariant,
    Subcategory,
)


class _RatedVariant(Protocol):
    current_rate_amount_paise: int
    current_rate_currency: str


class _PublicService(Protocol):
    public_variants: list[ServiceVariant]


def _public_variants(service: Service) -> list[ServiceVariant]:
    return cast(_PublicService, cast(object, service)).public_variants


class SubcategorySerializer(serializers.ModelSerializer[Subcategory]):
    class Meta:
        model = Subcategory
        fields = ("id", "slug", "name", "description")
        read_only_fields = fields


class CategorySerializer(serializers.ModelSerializer[Category]):
    subcategories = SubcategorySerializer(many=True, read_only=True)

    class Meta:
        model = Category
        fields = ("id", "slug", "name", "description", "icon_key", "subcategories")
        read_only_fields = fields


class MoneySerializer(serializers.Serializer[dict[str, object]]):
    amount_paise = serializers.IntegerField(read_only=True)
    currency = serializers.CharField(read_only=True)


class ServiceMediaSerializer(serializers.ModelSerializer[ServiceMedia]):
    class Meta:
        model = ServiceMedia
        fields = ("id", "kind", "url", "alt_text")
        read_only_fields = fields


class ServiceVariantSummarySerializer(serializers.ModelSerializer[ServiceVariant]):
    starting_price = serializers.SerializerMethodField()

    class Meta:
        model = ServiceVariant
        fields: tuple[str, ...] = (
            "id",
            "code",
            "name",
            "description",
            "pricing_strategy",
            "starting_price",
            "minimum_duration_minutes",
            "recommended_duration_minutes",
            "duration_increment_minutes",
            "maximum_duration_minutes",
        )
        read_only_fields = fields

    @staticmethod
    @extend_schema_field(MoneySerializer)
    def get_starting_price(variant: ServiceVariant) -> dict[str, object]:
        rated = cast(_RatedVariant, cast(object, variant))
        return {
            "amount_paise": rated.current_rate_amount_paise,
            "currency": rated.current_rate_currency,
        }


class ServiceCardSerializer(serializers.ModelSerializer[Service]):
    category_slug = serializers.CharField(source="subcategory.category.slug", read_only=True)
    subcategory_slug = serializers.CharField(source="subcategory.slug", read_only=True)
    starting_price = serializers.SerializerMethodField()
    recommended_duration_minutes = serializers.SerializerMethodField()
    cover = serializers.SerializerMethodField()

    class Meta:
        model = Service
        fields: tuple[str, ...] = (
            "id",
            "slug",
            "name",
            "short_description",
            "category_slug",
            "subcategory_slug",
            "starting_price",
            "recommended_duration_minutes",
            "cover",
        )
        read_only_fields = fields

    @staticmethod
    @extend_schema_field(MoneySerializer)
    def get_starting_price(service: Service) -> dict[str, object]:
        variant = min(
            _public_variants(service),
            key=lambda item: (
                cast(
                    _RatedVariant,
                    cast(object, item),
                ).current_rate_amount_paise
            ),
        )
        rated = cast(_RatedVariant, cast(object, variant))
        return {
            "amount_paise": rated.current_rate_amount_paise,
            "currency": rated.current_rate_currency,
        }

    @staticmethod
    def get_recommended_duration_minutes(service: Service) -> int:
        return _public_variants(service)[0].recommended_duration_minutes

    @staticmethod
    @extend_schema_field(ServiceMediaSerializer(allow_null=True))
    def get_cover(service: Service) -> dict[str, object] | None:
        for media in service.media.all():
            if media.kind == ServiceMedia.Kind.COVER:
                return ServiceMediaSerializer(media).data
        return None


class ServicePolicySerializer(serializers.ModelSerializer[ServicePolicy]):
    class Meta:
        model = ServicePolicy
        fields = ("id", "kind", "text")
        read_only_fields = fields


class ServiceQuestionOptionSerializer(serializers.ModelSerializer[ServiceQuestionOption]):
    class Meta:
        model = ServiceQuestionOption
        fields = ("id", "code", "label", "description")
        read_only_fields = fields


class ServiceQuestionSerializer(serializers.ModelSerializer[ServiceQuestion]):
    options = ServiceQuestionOptionSerializer(many=True, read_only=True)

    class Meta:
        model = ServiceQuestion
        fields = (
            "id",
            "code",
            "prompt",
            "help_text",
            "kind",
            "is_required",
            "validation_rules",
            "options",
        )
        read_only_fields = fields


class ServiceVariantConfigurationSerializer(ServiceVariantSummarySerializer):
    questions = ServiceQuestionSerializer(many=True, read_only=True)

    class Meta(ServiceVariantSummarySerializer.Meta):
        fields = (*ServiceVariantSummarySerializer.Meta.fields, "required_skill_code", "questions")


class ServiceDetailSerializer(ServiceCardSerializer):
    variants = serializers.SerializerMethodField()
    policies = ServicePolicySerializer(many=True, read_only=True)
    media = ServiceMediaSerializer(many=True, read_only=True)

    class Meta(ServiceCardSerializer.Meta):
        fields = (
            *ServiceCardSerializer.Meta.fields,
            "description",
            "variants",
            "policies",
            "media",
        )

    @staticmethod
    @extend_schema_field(ServiceVariantConfigurationSerializer(many=True))
    def get_variants(service: Service) -> list[dict[str, object]]:
        serializer = ServiceVariantConfigurationSerializer(_public_variants(service), many=True)
        return list(serializer.data)
