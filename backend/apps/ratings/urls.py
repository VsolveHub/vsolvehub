from django.urls import path

from .feedback_views import (
    BookingPlatformFeedbackView,
    EngagementPlatformFeedbackView,
    OperationsServiceFeedbackNotesView,
    OperationsServiceFeedbackView,
    OperationsUnattributedFeedbackNotesView,
)
from .views import BookingRatingCollectionView, EngagementRatingCollectionView

urlpatterns = [
    path(
        "bookings/<uuid:booking_id>/ratings/",
        BookingRatingCollectionView.as_view(),
        name="booking-ratings",
    ),
    path(
        "bookings/<uuid:booking_id>/platform-feedback/",
        BookingPlatformFeedbackView.as_view(),
        name="booking-platform-feedback",
    ),
    path(
        "engagements/<uuid:engagement_id>/ratings/",
        EngagementRatingCollectionView.as_view(),
        name="engagement-ratings",
    ),
    path(
        "engagements/<uuid:engagement_id>/platform-feedback/",
        EngagementPlatformFeedbackView.as_view(),
        name="engagement-platform-feedback",
    ),
    path(
        "operations/service-feedback/",
        OperationsServiceFeedbackView.as_view(),
        name="operations-service-feedback",
    ),
    # The unattributed bucket has no id, so it gets its own path rather than a sentinel in the
    # variant one. `.../none/notes/` would be a UUID route that quietly accepts a magic word.
    path(
        "operations/service-feedback/unattributed/notes/",
        OperationsUnattributedFeedbackNotesView.as_view(),
        name="operations-service-feedback-unattributed-notes",
    ),
    path(
        "operations/service-feedback/<uuid:variant_id>/notes/",
        OperationsServiceFeedbackNotesView.as_view(),
        name="operations-service-feedback-notes",
    ),
]
