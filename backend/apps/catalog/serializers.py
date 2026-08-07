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
from apps.pricing.models import TaskRate
from common.serializers import MoneySerializer


class _RatedVariant(Protocol):
    current_rate_amount_paise: int
    current_rate_currency: str
    minimum_service_subtotal_paise: int


class _A1Variant(_RatedVariant, Protocol):
    current_task_rates: list[TaskRate]


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


class A1TaskLineSerializer(serializers.Serializer[dict[str, object]]):
    code = serializers.SlugField(read_only=True)
    label = serializers.CharField(read_only=True)  # type: ignore[assignment]
    unit_price = MoneySerializer(read_only=True)
    marginal_duration_minutes = serializers.IntegerField(read_only=True)


class ServiceMediaSerializer(serializers.ModelSerializer[ServiceMedia]):
    class Meta:
        model = ServiceMedia
        fields = ("id", "kind", "url", "alt_text")
        read_only_fields = fields


class ServiceVariantSummarySerializer(serializers.ModelSerializer[ServiceVariant]):
    starting_price = serializers.SerializerMethodField()
    fulfilment_archetype = serializers.CharField(source="booking_archetype", read_only=True)
    minimum_service_subtotal = serializers.SerializerMethodField()
    task_lines = serializers.SerializerMethodField()

    class Meta:
        model = ServiceVariant
        fields: tuple[str, ...] = (
            "id",
            "code",
            "name",
            "description",
            "fulfilment_archetype",
            "starting_price",
            "minimum_service_subtotal",
            "task_lines",
        )
        read_only_fields = fields

    @staticmethod
    @extend_schema_field(MoneySerializer)
    def get_starting_price(variant: ServiceVariant) -> dict[str, object]:
        rated = cast(_RatedVariant, cast(object, variant))
        return {
            "amount_paise": max(
                rated.current_rate_amount_paise,
                rated.minimum_service_subtotal_paise,
            ),
            "currency": rated.current_rate_currency,
        }

    @staticmethod
    @extend_schema_field(MoneySerializer)
    def get_minimum_service_subtotal(variant: ServiceVariant) -> dict[str, object]:
        rated = cast(_RatedVariant, cast(object, variant))
        return {
            "amount_paise": rated.minimum_service_subtotal_paise,
            "currency": rated.current_rate_currency,
        }

    @staticmethod
    @extend_schema_field(A1TaskLineSerializer(many=True))
    def get_task_lines(variant: ServiceVariant) -> list[dict[str, object]]:
        rated = cast(_A1Variant, cast(object, variant))
        return [
            {
                "code": rate.task_code,
                "label": variant.service.name,
                "unit_price": {
                    "amount_paise": rate.unit_price_paise,
                    "currency": rate.currency,
                },
                "marginal_duration_minutes": rate.marginal_duration_minutes,
            }
            for rate in rated.current_task_rates
        ]


class ServiceCardSerializer(serializers.ModelSerializer[Service]):
    category_slug = serializers.CharField(source="subcategory.category.slug", read_only=True)
    subcategory_slug = serializers.CharField(source="subcategory.slug", read_only=True)
    starting_price = serializers.SerializerMethodField()
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
            "cover",
        )
        read_only_fields = fields

    @staticmethod
    @extend_schema_field(MoneySerializer)
    def get_starting_price(service: Service) -> dict[str, object]:
        variant = min(
            _public_variants(service),
            key=lambda item: max(
                cast(_RatedVariant, cast(object, item)).current_rate_amount_paise,
                cast(_RatedVariant, cast(object, item)).minimum_service_subtotal_paise,
            ),
        )
        rated = cast(_RatedVariant, cast(object, variant))
        return {
            "amount_paise": max(
                rated.current_rate_amount_paise,
                rated.minimum_service_subtotal_paise,
            ),
            "currency": rated.current_rate_currency,
        }

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
        # `display_order` is published because PROCESS steps are numbered on screen, and a
        # client re-deriving that from array position would renumber the list the first time
        # one step was switched off.
        fields = ("id", "kind", "title", "text", "display_order")
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
