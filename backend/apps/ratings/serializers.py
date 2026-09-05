from typing import Any

from rest_framework import serializers

from .models import PlatformFeedback, ServiceRating
from .services import (
    RatingContext,
    can_submit_platform_feedback,
    is_rating_ready,
    platform_feedback_for,
    platform_feedback_tag_options,
    ratings_for,
)


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
    """Whether this participant may rate, and what they themselves said.

    ``ratings`` is always empty: the **counterparty's** score and comment are private, and the
    marketplace surfaces read aggregates rather than individual rows.

    ``my_rating`` is the author's own submission, returned to its author and nobody else. Pinning
    it to null as well went one step too far -- it left a rated job indistinguishable from an
    unrated one on the customer's own screen, so somebody who had already rated saw no dialog, no
    confirmation and no record, and reasonably concluded the feature was broken. Withholding a
    person's own words from them protects nobody.
    """

    subject_kind = serializers.ChoiceField(choices=("CATALOG_BOOKING", "ENGAGEMENT"))
    subject_id = serializers.UUIDField()
    can_rate = serializers.BooleanField()
    counterparty_label = serializers.CharField()
    my_rating = ServiceRatingSerializer(
        allow_null=True,
        help_text="The caller's own rating, or null. Never the counterparty's.",
    )
    ratings = ServiceRatingSerializer(
        many=True,
        help_text="Deprecated compatibility field. Always empty; only aggregate ratings display.",
    )


def rating_summary(context: RatingContext) -> dict[str, object]:
    ratings = ratings_for(context)
    mine = next((rating for rating in ratings if rating.rater_id == context.actor.id), None)
    return {
        "subject_kind": context.subject_kind,
        "subject_id": context.subject_id,
        "can_rate": is_rating_ready(context) and mine is None,
        "counterparty_label": context.counterparty_label,
        # The caller's own submission, returned to its author. The counterparty's stays private:
        # the stored records feed aggregate marketplace trust and nothing projects them per job.
        "my_rating": (
            None
            if mine is None
            else ServiceRatingSerializer(mine, context={"actor_id": context.actor.id}).data
        ),
        "ratings": [],
    }


# ---------------------------------------------------------------------------
# Platform feedback: "how was Vsolve", asked separately from "how was your partner"
# ---------------------------------------------------------------------------


class PlatformFeedbackTagOptionSerializer(serializers.Serializer[dict[str, Any]]):
    """One chip, as the server defines it.

    Published so neither app hardcodes the vocabulary. Two clients drifting from one taxonomy
    produce two sets of counts that look like one.
    """

    code = serializers.ChoiceField(choices=PlatformFeedback.Tag.choices)
    #: Shadows DRF's own `Field.label`, exactly as the catalog and cart option shapes already do.
    label = serializers.CharField()  # type: ignore[assignment]
    #: Stated, not inferred. A client should never have to know that `ALL_GOOD` is the special one.
    is_exclusive = serializers.BooleanField()


class PlatformFeedbackSerializer(serializers.Serializer[dict[str, Any]]):
    """One customer's submission, returned only to the customer who wrote it."""

    id = serializers.UUIDField(read_only=True)
    score = serializers.IntegerField(read_only=True, allow_null=True)
    comment = serializers.CharField(read_only=True, allow_blank=True)
    tags = serializers.ListField(child=serializers.CharField(), read_only=True)
    created_at = serializers.DateTimeField(read_only=True)


class PlatformFeedbackCreateSerializer(serializers.Serializer[dict[str, Any]]):
    """Everything optional individually; the command refuses the wholly empty submission.

    `score` is nullable because a customer who taps "Pricing wasn't clear" and closes has told us
    the useful thing, and demanding a star first would lose it.
    """

    score = serializers.IntegerField(min_value=1, max_value=5, required=False, allow_null=True)
    tags = serializers.ListField(
        child=serializers.ChoiceField(choices=PlatformFeedback.Tag.choices),
        required=False,
        default=list,
    )
    comment = serializers.CharField(max_length=280, allow_blank=True, required=False, default="")


class PlatformFeedbackSummarySerializer(serializers.Serializer[dict[str, Any]]):
    subject_kind = serializers.ChoiceField(choices=("CATALOG_BOOKING", "ENGAGEMENT"))
    subject_id = serializers.UUIDField()
    #: False once submitted, and false for a Partner: this question is only put to the customer.
    can_submit = serializers.BooleanField()
    my_feedback = PlatformFeedbackSerializer(allow_null=True)
    available_tags = PlatformFeedbackTagOptionSerializer(many=True)


def platform_feedback_summary(context: RatingContext) -> dict[str, object]:
    mine = platform_feedback_for(context)
    return {
        "subject_kind": context.subject_kind,
        "subject_id": context.subject_id,
        "can_submit": can_submit_platform_feedback(context),
        "my_feedback": None if mine is None else _feedback_payload(mine),
        "available_tags": platform_feedback_tag_options(),
    }


def _feedback_payload(feedback: PlatformFeedback) -> dict[str, object]:
    return {
        "id": feedback.id,
        "score": feedback.score,
        "comment": feedback.comment,
        "tags": sorted(tag.code for tag in feedback.tags.all()),
        "created_at": feedback.created_at,
    }


# ---------------------------------------------------------------------------
# The Operations read
# ---------------------------------------------------------------------------


class ServiceFeedbackTagCountSerializer(serializers.Serializer[dict[str, Any]]):
    code = serializers.CharField()
    label = serializers.CharField()  # type: ignore[assignment]
    count = serializers.IntegerField()


class ServiceFeedbackRowSerializer(serializers.Serializer[dict[str, Any]]):
    """One service, with both verdicts side by side.

    `variant_id` is null on exactly one row: the bucket for feedback whose booking covered more
    than one service. Published rather than dropped, because an operator reading these averages
    needs to know how much was left out of them.
    """

    variant_id = serializers.UUIDField(allow_null=True)
    variant_name = serializers.CharField()
    service_name = serializers.CharField(allow_blank=True)
    category_name = serializers.CharField(allow_blank=True)
    #: Nullable because "nobody has answered" is not zero stars. A screen that rendered silence as
    #: 0.0 would sort untouched services to the top of a worst-first list.
    partner_score = serializers.FloatField(allow_null=True)
    partner_count = serializers.IntegerField()
    platform_score = serializers.FloatField(allow_null=True)
    platform_count = serializers.IntegerField()
    tags = ServiceFeedbackTagCountSerializer(many=True)
    note_count = serializers.IntegerField()


class ServiceFeedbackListSerializer(serializers.Serializer[dict[str, Any]]):
    services = ServiceFeedbackRowSerializer(many=True)
    server_now = serializers.DateTimeField()


class ServiceFeedbackNoteSerializer(serializers.Serializer[dict[str, Any]]):
    """One written note, with the partner rating from the same job beside it."""

    feedback_id = serializers.UUIDField()
    score = serializers.IntegerField(allow_null=True)
    comment = serializers.CharField()
    tags = ServiceFeedbackTagCountSerializer(many=True)
    partner_name = serializers.CharField(allow_blank=True)
    #: The same customer's rating of the partner on this job. `platform 2 / partner 5` is the
    #: pattern worth acting on and it is invisible when the two are read on separate screens.
    partner_score = serializers.IntegerField(allow_null=True)
    subject_kind = serializers.CharField()
    subject_id = serializers.UUIDField()
    created_at = serializers.DateTimeField()


class ServiceFeedbackNoteListSerializer(serializers.Serializer[dict[str, Any]]):
    variant_id = serializers.UUIDField(allow_null=True)
    variant_name = serializers.CharField()
    notes = ServiceFeedbackNoteSerializer(many=True)
    server_now = serializers.DateTimeField()
