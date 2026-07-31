from django.urls import path

from apps.partners.views import (
    OperationsPartnerApplicationTransitionView,
    OperationsPartnerDocumentReviewView,
    OperationsPartnerScheduleView,
    PartnerApplicationSubmitView,
    PartnerApplicationView,
    PartnerDocumentCreateView,
    PartnerMeView,
    PartnerPresenceHeartbeatView,
    PartnerPresenceOfflineView,
    PartnerPresenceOnlineView,
    PartnerScheduleView,
)

urlpatterns = [
    path("partner/me/", PartnerMeView.as_view(), name="partner-me"),
    path("partner/application/", PartnerApplicationView.as_view(), name="partner-application"),
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
    path(
        "operations/partner-applications/<uuid:application_id>/transition/",
        OperationsPartnerApplicationTransitionView.as_view(),
        name="operations-partner-application-transition",
    ),
    path(
        "operations/partner-documents/<uuid:document_id>/review/",
        OperationsPartnerDocumentReviewView.as_view(),
        name="operations-partner-document-review",
    ),
    path(
        "operations/partners/<uuid:partner_id>/availability/",
        OperationsPartnerScheduleView.as_view(),
        name="operations-partner-schedule",
    ),
]
