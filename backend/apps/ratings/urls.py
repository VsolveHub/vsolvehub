from django.urls import path

from .views import BookingRatingCollectionView, EngagementRatingCollectionView

urlpatterns = [
    path(
        "bookings/<uuid:booking_id>/ratings/",
        BookingRatingCollectionView.as_view(),
        name="booking-ratings",
    ),
    path(
        "engagements/<uuid:engagement_id>/ratings/",
        EngagementRatingCollectionView.as_view(),
        name="engagement-ratings",
    ),
]
