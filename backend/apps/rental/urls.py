from django.urls import path

from apps.rental import views

urlpatterns = [
    path("rentals", views.RentalBrowseView.as_view(), name="rental-browse"),
    path("rentals/taxonomy", views.RentalTaxonomyView.as_view(), name="rental-taxonomy"),
    path("rentals/book", views.RentalBookView.as_view(), name="rental-book"),
    path("me/rentals", views.MyRentalsView.as_view(), name="my-rentals"),
    path(
        "me/rentals/<uuid:booking_id>/cancel",
        views.MyRentalCancelView.as_view(),
        name="my-rental-cancel",
    ),
    path(
        "partner/rentals/photos",
        views.PartnerRentalPhotoUploadView.as_view(),
        name="partner-rental-photos",
    ),
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
    path(
        "ops/rentals/bookings/<uuid:booking_id>/cancel",
        views.OpsRentalBookingCancelView.as_view(),
        name="ops-rental-booking-cancel",
    ),
    # Last: "rentals/<key>" would otherwise swallow fixed addresses such as "rentals/book".
    path("rentals/<str:key>", views.RentalDetailView.as_view(), name="rental-detail"),
]
