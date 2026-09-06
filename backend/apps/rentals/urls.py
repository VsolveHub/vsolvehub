"""URL routes for Rental Services."""

from django.urls import path

from apps.rentals.views import (
    OpsReassignAssetView,
    OpsRentalBookingsView,
    OpsResolveDisputeView,
    PartnerApproveExtensionView,
    PartnerAssetMaintenanceView,
    PartnerAssetMediaView,
    PartnerInitiateReturnView,
    PartnerRecordHandoverView,
    PartnerRecordInspectionView,
    PartnerRejectExtensionView,
    PartnerRentalAssetDetailView,
    PartnerRentalAssetsView,
    PartnerRentalBookingsView,
    PartnerRentalVariantsView,
    RentalBookingDetailView,
    RentalBrowseView,
    RentalCancelView,
    RentalConfirmView,
    RentalCustomerBookingsView,
    RentalDisputeView,
    RentalExtensionPayView,
    RentalExtensionRequestView,
    RentalHoldCreateView,
    RentalPaymentStartView,
)

urlpatterns = [
    # Customer browse & checkout
    path("browse/", RentalBrowseView.as_view(), name="rentals-browse"),
    path("holds/", RentalHoldCreateView.as_view(), name="rentals-hold-create"),
    path(
        "bookings/<uuid:booking_id>/",
        RentalBookingDetailView.as_view(),
        name="rentals-booking-detail",
    ),
    path(
        "bookings/<uuid:booking_id>/confirm/",
        RentalConfirmView.as_view(),
        name="rentals-booking-confirm",
    ),
    path(
        "bookings/<uuid:booking_id>/payment/",
        RentalPaymentStartView.as_view(),
        name="rentals-booking-payment",
    ),
    path(
        "bookings/<uuid:booking_id>/cancel/",
        RentalCancelView.as_view(),
        name="rentals-booking-cancel",
    ),
    path(
        "bookings/<uuid:booking_id>/extend/",
        RentalExtensionRequestView.as_view(),
        name="rentals-booking-extend",
    ),
    path(
        "extensions/<uuid:extension_id>/pay/",
        RentalExtensionPayView.as_view(),
        name="rentals-extension-pay",
    ),
    path(
        "bookings/<uuid:booking_id>/dispute/",
        RentalDisputeView.as_view(),
        name="rentals-booking-dispute",
    ),
    path("my-bookings/", RentalCustomerBookingsView.as_view(), name="rentals-my-bookings"),
    # Partner management
    path("partner/variants/", PartnerRentalVariantsView.as_view(), name="rentals-partner-variants"),
    path("partner/assets/", PartnerRentalAssetsView.as_view(), name="rentals-partner-assets"),
    path(
        "partner/assets/<uuid:pk>/",
        PartnerRentalAssetDetailView.as_view(),
        name="rentals-partner-asset-detail",
    ),
    path(
        "partner/assets/<uuid:pk>/maintenance/",
        PartnerAssetMaintenanceView.as_view(),
        name="rentals-partner-asset-maintenance",
    ),
    path(
        "partner/assets/<uuid:pk>/media/",
        PartnerAssetMediaView.as_view(),
        name="rentals-partner-asset-media",
    ),
    path("partner/bookings/", PartnerRentalBookingsView.as_view(), name="rentals-partner-bookings"),
    path(
        "partner/bookings/<uuid:booking_id>/handover/",
        PartnerRecordHandoverView.as_view(),
        name="rentals-partner-handover",
    ),
    path(
        "partner/bookings/<uuid:booking_id>/initiate-return/",
        PartnerInitiateReturnView.as_view(),
        name="rentals-partner-initiate-return",
    ),
    path(
        "partner/bookings/<uuid:booking_id>/return-inspection/",
        PartnerRecordInspectionView.as_view(),
        name="rentals-partner-return-inspection",
    ),
    path(
        "partner/extensions/<uuid:extension_id>/approve/",
        PartnerApproveExtensionView.as_view(),
        name="rentals-partner-extension-approve",
    ),
    path(
        "partner/extensions/<uuid:extension_id>/reject/",
        PartnerRejectExtensionView.as_view(),
        name="rentals-partner-extension-reject",
    ),
    # Operations recovery & disputes
    path("ops/bookings/", OpsRentalBookingsView.as_view(), name="rentals-ops-bookings"),
    path(
        "ops/bookings/<uuid:booking_id>/reassign/",
        OpsReassignAssetView.as_view(),
        name="rentals-ops-reassign",
    ),
    path(
        "ops/cases/<uuid:case_id>/resolve/",
        OpsResolveDisputeView.as_view(),
        name="rentals-ops-resolve-dispute",
    ),
]
