from django.urls import path

from apps.listings import views

urlpatterns = [
    path("listings", views.ListingBrowseView.as_view(), name="listing-browse"),
    path("listings/filters", views.ListingFiltersView.as_view(), name="listing-filters"),
    path("listings/<uuid:listing_id>", views.ListingDetailView.as_view(), name="listing-detail"),
    path(
        "listings/<uuid:listing_id>/applications",
        views.ListingApplicationView.as_view(),
        name="listing-apply",
    ),
    path(
        "listings/<uuid:listing_id>/reports",
        views.ListingReportView.as_view(),
        name="listing-report",
    ),
    path(
        "applications/<uuid:application_id>/reports",
        views.ApplicationReportView.as_view(),
        name="application-report",
    ),
    path(
        "my/listing-applications",
        views.MyApplicationsView.as_view(),
        name="my-listing-applications",
    ),
    path(
        "my/listing-applications/<uuid:application_id>/withdraw",
        views.MyApplicationWithdrawView.as_view(),
        name="my-listing-application-withdraw",
    ),
    path(
        "partner/listings/home", views.PartnerListingHomeView.as_view(), name="partner-listing-home"
    ),
    path(
        "partner/listings/roles",
        views.PartnerListingRoleCatalogView.as_view(),
        name="partner-listing-roles",
    ),
    path(
        "partner/listings",
        views.PartnerListingCollectionView.as_view(),
        name="partner-listing-collection",
    ),
    path(
        "partner/listings/<uuid:listing_id>",
        views.PartnerListingDetailView.as_view(),
        name="partner-listing-detail",
    ),
    path(
        "partner/listings/<uuid:listing_id>/applications",
        views.PartnerListingApplicationsView.as_view(),
        name="partner-listing-applications",
    ),
    # Keep the catch-all action route LAST. Registered before "applications" it
    # captured that literal segment as `action` and answered GET with 405, so the
    # partner leads list could never load.
    path(
        "partner/listings/<uuid:listing_id>/<slug:action>",
        views.PartnerListingActionView.as_view(),
        name="partner-listing-action",
    ),
    path(
        "partner/listing-applications/<uuid:application_id>/<slug:action>",
        views.PartnerApplicationActionView.as_view(),
        name="partner-listing-application-action",
    ),
    path(
        "partner/listing-subscription-plans",
        views.VendorSubscriptionPlanView.as_view(),
        name="listing-subscription-plans",
    ),
    path(
        "partner/listing-subscription-plans/<uuid:plan_id>/purchase",
        views.VendorSubscriptionPurchaseView.as_view(),
        name="listing-subscription-purchase",
    ),
    path("ops/listings", views.OpsListingCollectionView.as_view(), name="ops-listings"),
    path(
        "ops/listings/<uuid:listing_id>/moderate",
        views.OpsListingModerateView.as_view(),
        name="ops-listing-moderate",
    ),
    path(
        "ops/listings/<uuid:listing_id>/remove",
        views.OpsListingRemoveView.as_view(),
        name="ops-listing-remove",
    ),
    path(
        "ops/listings/<uuid:listing_id>/reinstate",
        views.OpsListingReinstateView.as_view(),
        name="ops-listing-reinstate",
    ),
]
