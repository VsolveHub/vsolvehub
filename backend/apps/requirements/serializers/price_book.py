"""Phase A: the vendor price book — Operations catalog/policy management, and the Partner's own
rate card.

Split from `enquiries.py` on purpose: that file is the estimate composer's wire shapes, this file
is everything that *feeds* it — the catalog Operations curates, the policy Operations tunes, and
the rate book each Partner maintains against both.
"""

from typing import Any

from rest_framework import serializers

from apps.requirements.models import (
    CustomWorkItemReview,
    PartnerRateItem,
    QuoteGuardrailPolicy,
    WorkItem,
    WorkItemRate,
)

# ---------------------------------------------------------------------------
# Operations: the catalog
# ---------------------------------------------------------------------------


class WorkItemSerializer(serializers.ModelSerializer[WorkItem]):
    class Meta:
        model = WorkItem
        fields = (
            "id",
            "skill",
            "name",
            "unit",
            "description",
            "status",
            "sort_order",
            "band_below_bps",
            "band_above_bps",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")


class WorkItemCreateSerializer(serializers.Serializer[dict[str, Any]]):
    skill_id = serializers.UUIDField()
    name = serializers.CharField(max_length=120)
    unit = serializers.CharField(max_length=16)
    description = serializers.CharField(required=False, allow_blank=True, default="")
    sort_order = serializers.IntegerField(required=False, default=0)


class WorkItemUpdateSerializer(serializers.Serializer[dict[str, Any]]):
    """A partial edit. Every field optional — Operations edits one thing at a time."""

    name = serializers.CharField(max_length=120, required=False)
    description = serializers.CharField(required=False, allow_blank=True)
    status = serializers.ChoiceField(choices=WorkItem.Status.choices, required=False)
    sort_order = serializers.IntegerField(required=False)
    #: Both or neither, matching the model's own `CheckConstraint`. `null` clears the override
    #: and falls back through the per-skill/default layers again.
    band_below_bps = serializers.IntegerField(
        min_value=0, max_value=10_000, required=False, allow_null=True
    )
    band_above_bps = serializers.IntegerField(
        min_value=0, max_value=10_000, required=False, allow_null=True
    )

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if "band_below_bps" in attrs or "band_above_bps" in attrs:
            below = attrs.get("band_below_bps")
            above = attrs.get("band_above_bps")
            if (below is None) != (above is None):
                raise serializers.ValidationError(
                    "Set both band_below_bps and band_above_bps, or clear both."
                )
        return attrs


class WorkItemRateSerializer(serializers.ModelSerializer[WorkItemRate]):
    class Meta:
        model = WorkItemRate
        fields = (
            "id",
            "work_item",
            "service_area",
            "version",
            "reference_rate_paise",
            "status",
            "published_at",
        )
        read_only_fields = fields


class WorkItemRatePublishSerializer(serializers.Serializer[dict[str, Any]]):
    service_area_id = serializers.UUIDField()
    reference_rate_paise = serializers.IntegerField(min_value=1)


class WorkItemBandSerializer(serializers.Serializer[dict[str, Any]]):
    """The resolved band for one item in one city, as the rate-card screen and composer read it."""

    work_item_id = serializers.UUIDField()
    reference_rate_paise = serializers.IntegerField(allow_null=True)
    rate_version = serializers.IntegerField(allow_null=True)
    below_bps = serializers.IntegerField(allow_null=True)
    above_bps = serializers.IntegerField(allow_null=True)
    floor_paise = serializers.IntegerField(allow_null=True)
    ceiling_paise = serializers.IntegerField(allow_null=True)


# ---------------------------------------------------------------------------
# Operations: the guardrail policy
# ---------------------------------------------------------------------------


class SkillBandSerializer(serializers.Serializer[dict[str, Any]]):
    below_bps = serializers.IntegerField(min_value=0, max_value=10_000)
    above_bps = serializers.IntegerField(min_value=0, max_value=10_000)


class QuoteGuardrailPolicySerializer(serializers.ModelSerializer[QuoteGuardrailPolicy]):
    class Meta:
        model = QuoteGuardrailPolicy
        fields = (
            "id",
            "version",
            "status",
            "approval_reference",
            "approved_at",
            "effective_from",
            "default_band_below_bps",
            "default_band_above_bps",
            "misc_cap_bps",
            "margin_cap_bps",
            "custom_share_cap_bps",
            "per_skill_bands",
        )
        read_only_fields = fields


class QuoteGuardrailPolicyActivateSerializer(serializers.Serializer[dict[str, Any]]):
    """Every value required, none defaulted — the same rule `CommercialPolicyActivateSerializer`
    keeps, for the same reason: a default here would be this file setting a commercial term."""

    version = serializers.IntegerField(min_value=1)
    approval_reference = serializers.CharField(max_length=120)
    effective_from = serializers.DateTimeField()
    default_band_below_bps = serializers.IntegerField(min_value=0, max_value=10_000)
    default_band_above_bps = serializers.IntegerField(min_value=0, max_value=10_000)
    misc_cap_bps = serializers.IntegerField(min_value=0, max_value=10_000)
    margin_cap_bps = serializers.IntegerField(min_value=0, max_value=10_000)
    custom_share_cap_bps = serializers.IntegerField(min_value=0, max_value=10_000)
    per_skill_bands = serializers.DictField(
        child=SkillBandSerializer(), required=False, default=dict
    )


# ---------------------------------------------------------------------------
# Partner: the rate book
# ---------------------------------------------------------------------------


class PriceBookEntrySerializer(serializers.Serializer[dict[str, Any]]):
    """One catalog item, with its band context and this Partner's own saved rate, if any."""

    work_item = WorkItemSerializer()
    reference_rate_paise = serializers.IntegerField(allow_null=True)
    rate_version = serializers.IntegerField(allow_null=True)
    floor_paise = serializers.IntegerField(allow_null=True)
    ceiling_paise = serializers.IntegerField(allow_null=True)
    partner_rate_paise = serializers.IntegerField(allow_null=True)
    partner_is_active = serializers.BooleanField()


class PriceBookListSerializer(serializers.Serializer[dict[str, Any]]):
    items = PriceBookEntrySerializer(many=True)


class PartnerRateItemSerializer(serializers.ModelSerializer[PartnerRateItem]):
    class Meta:
        model = PartnerRateItem
        fields = ("id", "work_item", "rate_paise", "is_active", "updated_at")
        read_only_fields = fields


class PartnerRateItemSetSerializer(serializers.Serializer[dict[str, Any]]):
    rate_paise = serializers.IntegerField(min_value=1)
    is_active = serializers.BooleanField(required=False, default=True)


# ---------------------------------------------------------------------------
# Operations: the custom-item review queue
# ---------------------------------------------------------------------------


class CustomWorkItemReviewSerializer(serializers.ModelSerializer[CustomWorkItemReview]):
    partner_business_name = serializers.SerializerMethodField()

    class Meta:
        model = CustomWorkItemReview
        fields = (
            "id",
            "partner",
            "partner_business_name",
            "proposal",
            "title",
            "unit",
            "rate_paise",
            "status",
            "resolved_by",
            "resolved_at",
            "promoted_work_item",
            "created_at",
        )
        read_only_fields = fields

    def get_partner_business_name(self, obj: CustomWorkItemReview) -> str:
        business = getattr(obj.partner, "business_profile", None)
        return business.legal_name if business is not None else ""


class CustomWorkItemReviewListSerializer(serializers.Serializer[dict[str, Any]]):
    reviews = CustomWorkItemReviewSerializer(many=True)


class CustomWorkItemReviewResolveSerializer(serializers.Serializer[dict[str, Any]]):
    approve = serializers.BooleanField()
    #: Required only when approving — the promoted `WorkItem` needs a skill, and this review's
    #: originating quote does not carry one to infer it from.
    skill_id = serializers.UUIDField(required=False, allow_null=True, default=None)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if attrs.get("approve") and attrs.get("skill_id") is None:
            raise serializers.ValidationError(
                {"skill_id": "Choose a skill before approving this item into the catalog."}
            )
        return attrs
