from django.urls import path

from apps.partners.views import (
    ApplicantServiceAreaListView,
    OperationsPartnerApplicationClaimView,
    OperationsPartnerApplicationDetailView,
    OperationsPartnerApplicationQueueView,
    OperationsPartnerApplicationReleaseView,
    OperationsPartnerApplicationTransitionView,
    OperationsPartnerDetailView,
    OperationsPartnerDirectoryView,
    OperationsPartnerDocumentAccessView,
    OperationsPartnerDocumentReviewView,
    OperationsPartnerScheduleView,
    OperationsPartnerTaxProfileVerificationView,
    PartnerApplicationSubmitView,
    PartnerApplicationView,
    PartnerBusinessProfileView,
    PartnerCapabilityCollectionView,
    PartnerCapabilityOptionListView,
    PartnerCapabilitySubmitView,
    PartnerCapabilityWithdrawView,
    PartnerCrewArchiveView,
    PartnerCrewAvailabilityView,
    PartnerCrewCollectionView,
    PartnerCrewDetailView,
    PartnerCrewDocumentView,
    PartnerDocumentCreateView,
    PartnerDocumentUploadView,
    PartnerGateListView,
    PartnerInsuranceView,
    PartnerLanguageView,
    PartnerMeView,
    PartnerPresenceHeartbeatView,
    PartnerPresenceOfflineView,
    PartnerPresenceOnlineView,
    PartnerScheduleView,
    PartnerSkillListView,
    RequiredPartnerConsentListView,
)
from apps.partners.views.operations import PartnerImportView

urlpatterns = [
    path("service-areas/", ApplicantServiceAreaListView.as_view(), name="partner-service-areas"),
    path("partner/me/", PartnerMeView.as_view(), name="partner-me"),
    path("partner/skills/", PartnerSkillListView.as_view(), name="partner-skills"),
    path(
        "partner/required-consents/",
        RequiredPartnerConsentListView.as_view(),
        name="partner-required-consents",
    ),
    path("partner/application/", PartnerApplicationView.as_view(), name="partner-application"),
    path(
        "partner/application/documents/uploads/",
        PartnerDocumentUploadView.as_view(),
        name="partner-application-document-upload",
    ),
    path(
        "partner/application/documents/",
        PartnerDocumentCreateView.as_view(),
        name="partner-application-document",
    ),
    path(
        "partner/application/submit/",
        PartnerApplicationSubmitView.as_view(),
        name="partner-application-submit",
    ),
    path("partner/availability/", PartnerScheduleView.as_view(), name="partner-availability"),
    path(
        "partner/presence/online/",
        PartnerPresenceOnlineView.as_view(),
        name="partner-presence-online",
    ),
    path(
        "partner/presence/heartbeat/",
        PartnerPresenceHeartbeatView.as_view(),
        name="partner-presence-heartbeat",
    ),
    path(
        "partner/presence/offline/",
        PartnerPresenceOfflineView.as_view(),
        name="partner-presence-offline",
    ),
    # M2 (proposal 0013): the registration surface.
    path(
        "partner/business-profile/",
        PartnerBusinessProfileView.as_view(),
        name="m2-partner-business-profile",
    ),
    path(
        "partner/capability-options/",
        PartnerCapabilityOptionListView.as_view(),
        name="m2-partner-capability-options",
    ),
    path(
        "partner/capabilities/",
        PartnerCapabilityCollectionView.as_view(),
        name="m2-partner-capabilities",
    ),
    path(
        "partner/capabilities/<uuid:capability_id>/submit/",
        PartnerCapabilitySubmitView.as_view(),
        name="m2-partner-capability-submit",
    ),
    path(
        "partner/capabilities/<uuid:capability_id>/withdraw/",
        PartnerCapabilityWithdrawView.as_view(),
        name="m2-partner-capability-withdraw",
    ),
    path("partner/languages/", PartnerLanguageView.as_view(), name="m2-partner-languages"),
    path("partner/insurance/", PartnerInsuranceView.as_view(), name="m2-partner-insurance"),
    path("partner/gates/", PartnerGateListView.as_view(), name="m2-partner-gates"),
    path("partner/crew/", PartnerCrewCollectionView.as_view(), name="m2-partner-crew"),
    path(
        "partner/crew/<uuid:membership_id>/",
        PartnerCrewDetailView.as_view(),
        name="m2-partner-crew-detail",
    ),
    path(
        "partner/crew/<uuid:membership_id>/documents/",
        PartnerCrewDocumentView.as_view(),
        name="m2-partner-crew-documents",
    ),
    path(
        "partner/crew/<uuid:membership_id>/archive/",
        PartnerCrewArchiveView.as_view(),
        name="m2-partner-crew-archive",
    ),
    path(
        "partner/crew/<uuid:membership_id>/availability/",
        PartnerCrewAvailabilityView.as_view(),
        name="m2-partner-crew-availability",
    ),
    path(
        "operations/partner-applications/",
        OperationsPartnerApplicationQueueView.as_view(),
        name="operations-partner-application-queue",
    ),
    path(
        "operations/partner-applications/<uuid:application_id>/",
        OperationsPartnerApplicationDetailView.as_view(),
        name="operations-partner-application-detail",
    ),
    path(
        "operations/partner-applications/<uuid:application_id>/claim/",
        OperationsPartnerApplicationClaimView.as_view(),
        name="operations-partner-application-claim",
    ),
    path(
        "operations/partner-applications/<uuid:application_id>/release/",
        OperationsPartnerApplicationReleaseView.as_view(),
        name="operations-partner-application-release",
    ),
    path(
        "operations/partner-applications/<uuid:application_id>/transition/",
        OperationsPartnerApplicationTransitionView.as_view(),
        name="operations-partner-application-transition",
    ),
    path(
        "operations/partner-documents/<uuid:document_id>/access/",
        OperationsPartnerDocumentAccessView.as_view(),
        name="operations-partner-document-access",
    ),
    path(
        "operations/partner-documents/<uuid:document_id>/review/",
        OperationsPartnerDocumentReviewView.as_view(),
        name="operations-partner-document-review",
    ),
    path(
        "operations/partners/",
        OperationsPartnerDirectoryView.as_view(),
        name="operations-partner-directory",
    ),
    path(
        "operations/partners/<uuid:partner_id>/",
        OperationsPartnerDetailView.as_view(),
        name="operations-partner-detail",
    ),
    path(
        "operations/partners/<uuid:partner_id>/availability/",
        OperationsPartnerScheduleView.as_view(),
        name="operations-partner-schedule",
    ),
    path(
        "operations/partners/<uuid:partner_id>/tax-profile/verify/",
        OperationsPartnerTaxProfileVerificationView.as_view(),
        name="operations-partner-tax-profile-verify",
    ),
]

urlpatterns += [
    path(
        "operations/partners/import/", PartnerImportView.as_view(), name="operations_partner_import"
    ),
]
