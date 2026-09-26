from django.urls import path

from apps.rental import views

urlpatterns = [
    path("rentals", views.RentalBrowseView.as_view(), name="rental-browse"),
    path("rentals/taxonomy", views.RentalTaxonomyView.as_view(), name="rental-taxonomy"),
    path("rentals/book", views.RentalBookView.as_view(), name="rental-book"),
    path("rentals/<uuid:asset_id>", views.RentalDetailView.as_view(), name="rental-detail"),
    path("me/rentals", views.MyRentalsView.as_view(), name="my-rentals"),
    path(
        "partner/rentals/assets",
        views.PartnerAssetCollectionView.as_view(),
        name="partner-rental-assets",
    ),
    path(
        "partner/rentals/assets/<uuid:asset_id>/<slug:action>",
        views.PartnerAssetActionView.as_view(),
        name="partner-rental-asset-action",
    ),
    path(
        "partner/rentals/bookings",
        views.PartnerBookingCollectionView.as_view(),
        name="partner-rental-bookings",
    ),
    path(
        "partner/rentals/bookings/<uuid:booking_id>/<slug:action>",
        views.PartnerBookingActionView.as_view(),
        name="partner-rental-booking-action",
    ),
    path("ops/rentals", views.OpsRentalCollectionView.as_view(), name="ops-rentals"),
    path(
        "ops/rentals/<uuid:asset_id>/moderate",
        views.OpsRentalModerateView.as_view(),
        name="ops-rental-moderate",
    ),
]
