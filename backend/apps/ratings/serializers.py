from typing import Any

from rest_framework import serializers

from .models import ServiceRating
from .services import RatingContext, is_rating_ready, ratings_for


class RatingCreateSerializer(serializers.Serializer[dict[str, Any]]):
    score = serializers.IntegerField(min_value=1, max_value=5)
    comment = serializers.CharField(max_length=280, allow_blank=True, required=False, default="")


class ServiceRatingSerializer(serializers.ModelSerializer[ServiceRating]):
    is_mine = serializers.SerializerMethodField()

    class Meta:
        model = ServiceRating
        fields = ("id", "rater_role", "score", "comment", "created_at", "is_mine")
        read_only_fields = fields

    def get_is_mine(self, obj: ServiceRating) -> bool:
        return bool(obj.rater_id == self.context["actor_id"])


class RatingSummarySerializer(serializers.Serializer[dict[str, Any]]):
    subject_kind = serializers.ChoiceField(choices=("CATALOG_BOOKING", "ENGAGEMENT"))
    subject_id = serializers.UUIDField()
    can_rate = serializers.BooleanField()
    counterparty_label = serializers.CharField()
    my_rating = ServiceRatingSerializer(allow_null=True)
    ratings = ServiceRatingSerializer(many=True)


def rating_summary(context: RatingContext) -> dict[str, object]:
    ratings = ratings_for(context)
    mine = next((rating for rating in ratings if rating.rater_id == context.actor.id), None)
    serializer_context = {"actor_id": context.actor.id}
    return {
        "subject_kind": context.subject_kind,
        "subject_id": context.subject_id,
        "can_rate": is_rating_ready(context) and mine is None,
        "counterparty_label": context.counterparty_label,
        "my_rating": (
            None if mine is None else ServiceRatingSerializer(mine, context=serializer_context).data
        ),
        "ratings": ServiceRatingSerializer(
            ratings,
            many=True,
            context=serializer_context,
        ).data,
    }
