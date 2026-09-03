"""The second question, and the screen Operations reads it on.

`views.py` holds *"how was your partner"*. This holds *"how was Vsolve"* and the per-service
rollup, kept in its own module because the audiences differ: everything here is either written by
a customer about us, or read by Operations about a service. Nothing in it is published to a
Partner.
"""

from dataclasses import asdict
from datetime import datetime, timedelta
from uuid import UUID

from django.db.models import Q
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.models import ServiceVariant
from apps.partners.permissions import IsOperationsUser
from common.errors.serializers import ApiErrorSerializer

from .exceptions import RatingDomainError
from .models import PlatformFeedback, ServiceRating
from .serializers import (
    PlatformFeedbackCreateSerializer,
    PlatformFeedbackSummarySerializer,
    ServiceFeedbackListSerializer,
    ServiceFeedbackNoteListSerializer,
    platform_feedback_summary,
)
from .services import (
    booking_rating_context,
    engagement_rating_context,
    service_feedback,
    service_feedback_notes,
    submit_platform_feedback,
)
from .views import RatingApiException, RatingCollectionView


class PlatformFeedbackCollectionView(RatingCollectionView):
    """Reuses the rating routes' subject resolution and nothing else.

    The same 404-not-403 rule therefore applies without restating it: a job the caller is not part
    of does not exist. What differs is the question asked and who may answer it — the two
    subclasses below serve the two subject kinds, and `can_submit_platform_feedback` refuses a
    Partner outright.
    """

    def get(self, request: Request, subject_id: UUID) -> Response:
        context = self.context_for(request, subject_id)
        return Response(platform_feedback_summary(context))

    def post(self, request: Request, subject_id: UUID) -> Response:
        serializer = PlatformFeedbackCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        context = self.context_for(request, subject_id)
        try:
            _feedback, created = submit_platform_feedback(
                context=context,
                score=serializer.validated_data.get("score"),
                tags=list(serializer.validated_data.get("tags") or []),
                comment=serializer.validated_data["comment"],
            )
        except RatingDomainError as exc:
            raise RatingApiException(exc) from exc
        http_status = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Response(platform_feedback_summary(context), status=http_status)


FEEDBACK_SUBMIT_DESCRIPTION = (
    "Record the customer's verdict on Vsolve for one job.\n\n"
    "Everything is individually optional and the command refuses only the wholly empty "
    "submission — a customer who taps one chip and closes has told us the useful thing, and "
    "demanding a star first would lose it. Selecting **All good** alongside a complaint is "
    "refused rather than silently resolved: either half might be the one they meant.\n\n"
    "Only the customer is asked. A Partner has their own relationship with Vsolve, and the same "
    "question put to them would collect a different thing under the same label."
)


class BookingPlatformFeedbackView(PlatformFeedbackCollectionView):
    resolver = staticmethod(booking_rating_context)
    id_parameter = "booking_id"

    @extend_schema(
        tags=["Ratings"],
        operation_id="booking_platform_feedback_read",
        responses={200: PlatformFeedbackSummarySerializer, 404: ApiErrorSerializer},
    )
    def get(self, request: Request, booking_id: UUID) -> Response:
        return super().get(request, booking_id)

    @extend_schema(
        tags=["Ratings"],
        operation_id="booking_platform_feedback_submit",
        request=PlatformFeedbackCreateSerializer,
        description=FEEDBACK_SUBMIT_DESCRIPTION,
        responses={
            201: PlatformFeedbackSummarySerializer,
            400: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(response=ApiErrorSerializer),
        },
    )
    def post(self, request: Request, booking_id: UUID) -> Response:
        return super().post(request, booking_id)


class EngagementPlatformFeedbackView(PlatformFeedbackCollectionView):
    resolver = staticmethod(engagement_rating_context)
    id_parameter = "engagement_id"

    @extend_schema(
        tags=["Ratings"],
        operation_id="engagement_platform_feedback_read",
        responses={200: PlatformFeedbackSummarySerializer, 404: ApiErrorSerializer},
    )
    def get(self, request: Request, engagement_id: UUID) -> Response:
        return super().get(request, engagement_id)

    @extend_schema(
        tags=["Ratings"],
        operation_id="engagement_platform_feedback_submit",
        request=PlatformFeedbackCreateSerializer,
        description=FEEDBACK_SUBMIT_DESCRIPTION,
        responses={
            201: PlatformFeedbackSummarySerializer,
            400: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(response=ApiErrorSerializer),
        },
    )
    def post(self, request: Request, engagement_id: UUID) -> Response:
        return super().post(request, engagement_id)


class OperationsServiceFeedbackView(APIView):
    """Both verdicts, per catalogue service."""

    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["Ratings"],
        operation_id="operations_service_feedback",
        parameters=[
            OpenApiParameter(
                name="days",
                type=OpenApiTypes.INT,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Window in days. Omitted means everything ever recorded.",
            )
        ],
        description=(
            "Every service anybody has left feedback on, worst platform score first.\n\n"
            "**The partner score and the platform score are published separately and never "
            "blended.** A service rated 4.6 for its partners and 3.1 for the experience of "
            "booking it is the finding: the people are fine and the product is not. One combined "
            "number averages exactly that away.\n\n"
            "A service nobody has rated sorts **last**, not first — silence is not a bad score. "
            "One row may carry a null `variant_id`: feedback on a visit that covered more than "
            "one service, counted honestly rather than attributed to whichever line came first."
        ),
        responses={200: ServiceFeedbackListSerializer, 403: ApiErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        rows = [asdict(row) for row in service_feedback(since=_window_start(request))]
        return Response(
            ServiceFeedbackListSerializer({"services": rows, "server_now": timezone.now()}).data
        )


class OperationsServiceFeedbackNotesView(APIView):
    """The written notes behind one service's numbers."""

    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["Ratings"],
        operation_id="operations_service_feedback_notes",
        parameters=[
            OpenApiParameter(
                name="days",
                type=OpenApiTypes.INT,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Window in days. Omitted means everything ever recorded.",
            )
        ],
        description=(
            "Written platform-feedback notes for one service, newest first.\n\n"
            "Each note carries the same customer's rating of the **partner** on that job, because "
            "`platform 2 / partner 5` is the pattern worth acting on and it is invisible when the "
            "two are read on separate screens.\n\n"
            "The route without a `variant_id` returns the notes attached to feedback that could "
            "not be attributed to a single service."
        ),
        responses={200: ServiceFeedbackNoteListSerializer, 403: ApiErrorSerializer},
    )
    def get(self, request: Request, variant_id: UUID | None = None) -> Response:
        return self._notes(request, variant_id)

    def _notes(self, request: Request, variant_id: UUID | None) -> Response:
        notes = service_feedback_notes(variant_id=variant_id, since=_window_start(request))
        variant = (
            ServiceVariant.objects.filter(id=variant_id).first() if variant_id is not None else None
        )
        labels = dict(PlatformFeedback.Tag.choices)
        partner_scores = _partner_scores_for(notes)
        return Response(
            ServiceFeedbackNoteListSerializer(
                {
                    "variant_id": variant_id,
                    "variant_name": (variant.name if variant else "Not attributed to a service"),
                    "notes": [
                        {
                            "feedback_id": note.id,
                            "score": note.score,
                            "comment": note.comment,
                            "tags": [
                                {
                                    "code": tag.code,
                                    "label": str(labels.get(tag.code, tag.code)),
                                    "count": 1,
                                }
                                for tag in note.tags.all()
                            ],
                            "partner_name": _partner_name(note),
                            "partner_score": partner_scores.get(note.id),
                            "subject_kind": (
                                "ENGAGEMENT" if note.engagement_id else "CATALOG_BOOKING"
                            ),
                            "subject_id": note.engagement_id or note.booking_id,
                            "created_at": note.created_at,
                        }
                        for note in notes
                    ],
                    "server_now": timezone.now(),
                }
            ).data
        )


def _window_start(request: Request) -> datetime | None:
    """`days` as a window, or nothing.

    An unparseable value is refused rather than silently ignored: a filter that quietly falls back
    to "everything" shows an operator numbers for the wrong period under the label they chose.
    """
    raw = request.query_params.get("days")
    if not raw:
        return None
    try:
        days = int(raw)
    except ValueError as exc:
        raise ValidationError({"days": "Must be a whole number of days."}) from exc
    if days <= 0:
        raise ValidationError({"days": "Must be a positive number of days."})
    return timezone.now() - timedelta(days=days)


def _partner_name(note: PlatformFeedback) -> str:
    """Whichever subject owns this note. A model constraint guarantees exactly one does."""
    if note.engagement is not None:
        return note.engagement.partner.display_name
    if note.booking is not None:
        return note.booking.partner.display_name
    return ""


def _partner_scores_for(notes: list[PlatformFeedback]) -> dict[UUID, int]:
    """Every note's companion partner rating, in one query, keyed by note.

    Matched on the same customer **and** the same job. Matching on the job alone would attach a
    different customer's rating to this person's note on a job with two raters.
    """
    if not notes:
        return {}
    engagement_ids = [note.engagement_id for note in notes if note.engagement_id]
    booking_ids = [note.booking_id for note in notes if note.booking_id]
    ratings = ServiceRating.objects.filter(
        rater_role=ServiceRating.RaterRole.CUSTOMER,
        rater_id__in={note.customer_id for note in notes},
    ).filter(Q(engagement_id__in=engagement_ids) | Q(booking_id__in=booking_ids))
    by_subject = {
        (rating.rater_id, rating.engagement_id or rating.booking_id): rating.score
        for rating in ratings
    }
    resolved: dict[UUID, int] = {}
    for note in notes:
        score = by_subject.get((note.customer_id, note.engagement_id or note.booking_id))
        if score is not None:
            resolved[note.id] = score
    return resolved


class OperationsUnattributedFeedbackNotesView(OperationsServiceFeedbackNotesView):
    """Notes on feedback that could not be pinned to one service.

    Its own view, and its own `operationId`, because two routes sharing one makes the generator
    disambiguate them with numeral suffixes — positional names that rename themselves the moment
    route order changes, in a file both frontends import.
    """

    @extend_schema(
        tags=["Ratings"],
        operation_id="operations_unattributed_feedback_notes",
        parameters=[
            OpenApiParameter(
                name="days",
                type=OpenApiTypes.INT,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Window in days. Omitted means everything ever recorded.",
            )
        ],
        description=(
            "Written notes left on jobs whose visit covered more than one service.\n\n"
            "Kept reachable rather than hidden: an operator reading per-service averages needs to "
            "know what those averages left out."
        ),
        responses={200: ServiceFeedbackNoteListSerializer, 403: ApiErrorSerializer},
    )
    def get(self, request: Request, variant_id: UUID | None = None) -> Response:
        # This route carries no variant in its path, and the parameter exists only to keep the
        # override compatible with the base signature. Discarded explicitly so nobody later
        # "fixes" it by passing it through and quietly turns this into the attributed route.
        del variant_id
        return self._notes(request, None)
