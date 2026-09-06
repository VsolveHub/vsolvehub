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
    #: Count of ACTIVE services filed under this tile, annotated by `public_categories()`.
    #: A merchandising number for the tile grid — it deliberately does not re-run the
    #: stricter offerability gate, which needs per-variant rate and configuration joins.
    service_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Subcategory
        fields = ("id", "slug", "name", "description", "icon_key", "image_url", "service_count")
        read_only_fields = fields


class CategorySerializer(serializers.ModelSerializer[Category]):
    subcategories = SubcategorySerializer(many=True, read_only=True)

    class Meta:
        model = Category
        fields = (
            "id",
            "slug",
            "name",
            "description",
            "icon_key",
            "image_url",
            "subcategories",
        )
        read_only_fields = fields


class ServiceIndexItemSerializer(serializers.ModelSerializer[Service]):
    """The complete icon catalogue's intentionally small row contract."""

    category_id = serializers.UUIDField(source="subcategory.category.id", read_only=True)
    category_slug = serializers.CharField(source="subcategory.category.slug", read_only=True)
    category_name = serializers.CharField(source="subcategory.category.name", read_only=True)
    category_display_order = serializers.IntegerField(
        source="subcategory.category.display_order",
        read_only=True,
    )
    subcategory_id = serializers.UUIDField(source="subcategory.id", read_only=True)
    subcategory_slug = serializers.CharField(source="subcategory.slug", read_only=True)
    subcategory_name = serializers.CharField(source="subcategory.name", read_only=True)
    subcategory_display_order = serializers.IntegerField(
        source="subcategory.display_order",
        read_only=True,
    )

    class Meta:
        model = Service
        fields = (
            "id",
            "slug",
            "name",
            "icon_key",
            "display_order",
            "category_id",
            "category_slug",
            "category_name",
            "category_display_order",
            "subcategory_id",
            "subcategory_slug",
            "subcategory_name",
            "subcategory_display_order",
        )
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
            "image_url",
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
    bookable_variant_id = serializers.SerializerMethodField()
    request_archetypes = serializers.SerializerMethodField()

    class Meta:
        model = Service
        fields: tuple[str, ...] = (
            "id",
            "slug",
            "name",
            "icon_key",
            "short_description",
            "category_slug",
            "subcategory_slug",
            "starting_price",
            "bookable_variant_id",
            #: Which guided-requirement lifecycles this service accepts. Empty for ordinary A1
            #: work. This is the field that decides the card's action — "Check price and
            #: availability" against "Tell us what you need" — and it exists because a client
            #: could not tell the two apart: `bookable_variant_id` is the A1 path and there was
            #: nothing for the other. `M2-FE-201`.
            "request_archetypes",
            "cover",
        )
        read_only_fields = fields

    @staticmethod
    @extend_schema_field(
        serializers.ListField(child=serializers.CharField(), allow_empty=True),
    )
    def get_request_archetypes(service: Service) -> list[str]:
        variants = getattr(service, "requirement_variants", [])
        # Ordered rather than a set, so the same service publishes the same list every read.
        return sorted({variant.booking_archetype for variant in variants})

    @staticmethod
    @extend_schema_field(serializers.UUIDField(allow_null=True))
    def get_bookable_variant_id(service: Service) -> str | None:
        """The variant to add when there is only one, and `None` when there is a choice.

        What makes a one-tap Add honest. With a single active variant there is nothing to
        decide — the scope is a quantity that defaults to one — so adding it invents nothing.
        With several, picking on the customer's behalf would put a price on screen for a job
        they never described: a 32-amp replacement when they meant a repair, a villa clean when
        they meant a 1 BHK. Published as null in that case so the client sends them to choose
        rather than guessing here or, worse, guessing in the browser.
        """

        variants = _public_variants(service)
        if len(variants) != 1:
            return None
        return str(variants[0].id)

    @staticmethod
    @extend_schema_field(MoneySerializer(allow_null=True))
    def get_starting_price(service: Service) -> dict[str, object] | None:
        """The lowest price this service can start at, or `null` when it has none.

        **`null` is the honest answer for an M2 service, not a missing value.** An A3 or A5
        service carries no `ServiceRate` because its price is the vendor's quote — so there is no
        number to show, and "starts at ₹X" would be one this platform invented. The client renders
        the requirement action from `request_archetypes` instead.

        The empty guard is also a real crash fix: this used to call `min()` over the priced
        variants unconditionally, which raises `ValueError` on an empty sequence. It could not fire
        while the catalog gate required a rate; widening that gate to admit M2 services is what
        made an unpriced service reachable here.
        """
        priced = _public_variants(service)
        if not priced:
            return None
        variant = min(
            priced,
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


class RequirementVariantSerializer(serializers.ModelSerializer[ServiceVariant]):
    """An A3/A5 variant, as the guided-requirement flow needs it.

    **Deliberately not `ServiceVariantConfigurationSerializer`.** That one publishes
    `starting_price`, `minimum_service_subtotal` and `task_lines`, all read from annotations only
    `_public_variants` adds — so serializing an M2 variant through it raises `AttributeError`. It
    would also be the wrong shape if it worked: an A3 or A5 variant has no rate, because its price
    is the vendor's quote, and a money field here would be a number this platform invented.

    `questions` is the load-bearing field. Screen 1 of the four-screen flow renders exactly these
    rows, and `services.submit_requirement` validates the answers against the *same* authored
    schema — so a variant published without them is a flow whose first screen has nothing to ask.
    """

    fulfilment_archetype = serializers.CharField(source="booking_archetype", read_only=True)
    questions = ServiceQuestionSerializer(many=True, read_only=True)

    class Meta:
        model = ServiceVariant
        fields = (
            "id",
            "code",
            "name",
            "description",
            "image_url",
            "fulfilment_archetype",
            "required_skill_code",
            "questions",
        )
        read_only_fields = fields


class ServiceDetailSerializer(ServiceCardSerializer):
    variants = serializers.SerializerMethodField()
    requirement_variants = serializers.SerializerMethodField()
    policies = ServicePolicySerializer(many=True, read_only=True)
    media = ServiceMediaSerializer(many=True, read_only=True)

    class Meta(ServiceCardSerializer.Meta):
        fields = (
            *ServiceCardSerializer.Meta.fields,
            "description",
            "variants",
            #: The A3/A5 half of the same service. Separate from `variants` because that list is
            #: the A1 *task* list — the booking workspace turns each row into a priced task line —
            #: and an M2 variant has no price to put there. Empty for ordinary A1 work.
            "requirement_variants",
            "policies",
            "media",
        )

    @staticmethod
    @extend_schema_field(ServiceVariantConfigurationSerializer(many=True))
    def get_variants(service: Service) -> list[dict[str, object]]:
        serializer = ServiceVariantConfigurationSerializer(_public_variants(service), many=True)
        return list(serializer.data)

    @staticmethod
    @extend_schema_field(RequirementVariantSerializer(many=True))
    def get_requirement_variants(service: Service) -> list[dict[str, object]]:
        variants = getattr(service, "requirement_variants", [])
        return list(RequirementVariantSerializer(variants, many=True).data)
