"""M2 routes: Customer requirements, Partner enquiries and proposals.

Mounted under `/api/v1/` by `config.urls`. Customer paths sit at `requirements/**` and Partner paths
under `partner/**`, matching the split `apps.partners.urls` already established — the prefix is what
tells a reader which role a route belongs to before they open the view.
"""

from django.urls import path

from apps.requirements.views import (
    PartnerDemandPreviewView,
    PartnerEnquiryAcceptView,
    PartnerEnquiryCollectionView,
    PartnerEnquiryDeclineView,
    PartnerEnquiryDetailView,
    PartnerEnquiryQuestionView,
    PartnerEnquirySiteVisitView,
    PartnerProposalCollectionView,
    PartnerProposalDetailView,
    PartnerProposalWithdrawView,
    PartnerWorkspaceListView,
    RequirementAttachmentCollectionView,
    RequirementAttachmentDetailView,
    RequirementAttachmentFinalizeView,
    RequirementCollectionView,
    RequirementDetailView,
    RequirementDuplicateCheckView,
    RequirementQuestionAnswerView,
    RequirementSubmitView,
    RequirementTeaserListView,
    RequirementTimelineView,
    SiteVisitCompleteView,
    SiteVisitScheduleView,
)

urlpatterns = [
    # Customer
    path("requirements/", RequirementCollectionView.as_view(), name="m2-requirement-list"),
    path(
        "requirements/duplicate-check/",
        RequirementDuplicateCheckView.as_view(),
        name="m2-requirement-duplicate-check",
    ),
    path(
        "requirements/<uuid:requirement_id>/",
        RequirementDetailView.as_view(),
        name="m2-requirement-detail",
    ),
    path(
        "requirements/<uuid:requirement_id>/submit/",
        RequirementSubmitView.as_view(),
        name="m2-requirement-submit",
    ),
    path(
        "requirements/<uuid:requirement_id>/timeline/",
        RequirementTimelineView.as_view(),
        name="m2-requirement-timeline",
    ),
    path(
        "requirements/<uuid:requirement_id>/quotes/teasers/",
        RequirementTeaserListView.as_view(),
        name="m2-requirement-quote-teasers",
    ),
    path(
        "requirements/questions/<uuid:question_id>/answer/",
        RequirementQuestionAnswerView.as_view(),
        name="m2-requirement-question-answer",
    ),
    path(
        "requirements/<uuid:requirement_id>/attachments/uploads/",
        RequirementAttachmentCollectionView.as_view(),
        name="m2-requirement-attachment-upload",
    ),
    path(
        "requirements/<uuid:requirement_id>/attachments/",
        RequirementAttachmentFinalizeView.as_view(),
        name="m2-requirement-attachment-finalize",
    ),
    path(
        "requirements/<uuid:requirement_id>/attachments/<uuid:attachment_id>/",
        RequirementAttachmentDetailView.as_view(),
        name="m2-requirement-attachment-detail",
    ),
    # Site visits: both parties, so neither prefix fits.
    path(
        "site-visits/<uuid:site_visit_id>/schedule/",
        SiteVisitScheduleView.as_view(),
        name="m2-site-visit-schedule",
    ),
    path(
        "site-visits/<uuid:site_visit_id>/complete/",
        SiteVisitCompleteView.as_view(),
        name="m2-site-visit-complete",
    ),
    # Partner
    path(
        "partner/workspaces/",
        PartnerWorkspaceListView.as_view(),
        name="m2-partner-workspaces",
    ),
    path(
        "partner/demand-preview/",
        PartnerDemandPreviewView.as_view(),
        name="m2-partner-demand-preview",
    ),
    path(
        "partner/enquiries/",
        PartnerEnquiryCollectionView.as_view(),
        name="m2-partner-enquiry-list",
    ),
    path(
        "partner/enquiries/<uuid:invitation_id>/",
        PartnerEnquiryDetailView.as_view(),
        name="m2-partner-enquiry-detail",
    ),
    path(
        "partner/enquiries/<uuid:invitation_id>/accept/",
        PartnerEnquiryAcceptView.as_view(),
        name="m2-partner-enquiry-accept",
    ),
    path(
        "partner/enquiries/<uuid:invitation_id>/decline/",
        PartnerEnquiryDeclineView.as_view(),
        name="m2-partner-enquiry-decline",
    ),
    path(
        "partner/enquiries/<uuid:invitation_id>/questions/",
        PartnerEnquiryQuestionView.as_view(),
        name="m2-partner-enquiry-question",
    ),
    path(
        "partner/enquiries/<uuid:invitation_id>/site-visits/",
        PartnerEnquirySiteVisitView.as_view(),
        name="m2-partner-enquiry-site-visit",
    ),
    path("proposals/", PartnerProposalCollectionView.as_view(), name="m2-proposal-create"),
    path(
        "proposals/<uuid:proposal_id>/",
        PartnerProposalDetailView.as_view(),
        name="m2-proposal-detail",
    ),
    path(
        "proposals/<uuid:proposal_id>/withdraw/",
        PartnerProposalWithdrawView.as_view(),
        name="m2-proposal-withdraw",
    ),
]
