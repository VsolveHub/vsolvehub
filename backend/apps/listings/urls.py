from django.urls import path

from apps.listings import money, views

urlpatterns = [
    path("jobs/options", views.JobOptionsView.as_view(), name="job-options"),
    path("jobs/for-you", views.JobsForYouView.as_view(), name="jobs-for-you"),
    path(
        "partner/listing-applications/<uuid:application_id>/interview",
        views.PartnerProposeInterviewView.as_view(),
        name="partner-application-interview",
    ),
    path(
        "my/interviews/<uuid:interview_id>/<slug:action>",
        views.MyInterviewAnswerView.as_view(),
        name="my-interview-answer",
    ),
    path("me/job-profile", views.MyJobProfileView.as_view(), name="my-job-profile"),
    path(
        "me/job-profile/resume",
        views.MyJobProfileResumeView.as_view(),
        name="my-job-profile-resume",
    ),
    path(
        "job-profile-resumes/<str:token>",
        views.JobProfileResumeFileView.as_view(),
        name="job-profile-resume",
    ),
    path("me/saved-jobs", views.MySavedJobsView.as_view(), name="my-saved-jobs"),
    path(
        "listings/<uuid:listing_id>/quick-apply",
        views.QuickApplyView.as_view(),
        name="listing-quick-apply",
    ),
    path("listings/<uuid:listing_id>/save", views.SaveJobView.as_view(), name="listing-save"),
    path(
        "listings/<uuid:listing_id>/my-match",
        views.MyJobMatchView.as_view(),
        name="listing-my-match",
    ),
    path(
        "partner/jobs/<uuid:listing_id>/matches",
        views.PartnerJobMatchesView.as_view(),
        name="partner-job-matches",
    ),
    path(
        "partner/jobs/<uuid:listing_id>/invite/<uuid:profile_id>",
        views.PartnerJobInviteView.as_view(),
        name="partner-job-invite",
    ),
    path("partner/jobs", views.PartnerJobCreateView.as_view(), name="partner-job-create"),
    path(
        "partner/jobs/<uuid:listing_id>",
        views.PartnerJobDetailView.as_view(),
        name="partner-job-detail",
    ),
    path(
        "partner/jobs/<uuid:listing_id>/publish",
        views.PartnerJobPublishView.as_view(),
        name="partner-job-publish",
    ),
    path(
        "partner/jobs/<uuid:listing_id>/duplicate",
        views.PartnerJobDuplicateView.as_view(),
        name="partner-job-duplicate",
    ),
    path("listings", views.ListingBrowseView.as_view(), name="listing-browse"),
    path("listings/filters", views.ListingFiltersView.as_view(), name="listing-filters"),
    path(
        "listings/resume-files/<str:token>",
        views.ListingResumeFileView.as_view(),
        name="listing-resume-file",
    ),
    path(
        "listings/<uuid:listing_id>/resume-uploads",
        views.ListingResumeUploadView.as_view(),
        name="listing-resume-upload",
    ),
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
    path("ops/listings/money", money.MoneySummaryView.as_view(), name="ops-listings-money"),
    path(
        "ops/listings/money/payments",
        money.MoneyPaymentsView.as_view(),
        name="ops-listings-money-payments",
    ),
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
    path(
        "ops/vendor-subscription-plans",
        views.OpsVendorSubscriptionPlanCollectionView.as_view(),
        name="ops-vendor-subscription-plans",
    ),
    path(
        "ops/vendor-subscription-plans/<uuid:plan_id>",
        views.OpsVendorSubscriptionPlanDetailView.as_view(),
        name="ops-vendor-subscription-plan-detail",
    ),
    # Last: "listings/<key>" would otherwise swallow fixed addresses such as "listings/filters".
    path("listings/<str:key>", views.ListingDetailView.as_view(), name="listing-detail"),
]
