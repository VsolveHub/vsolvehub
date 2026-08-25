"""Partner and Operations application APIs.

The surface outgrew one file and is split along the seams it already had. Every name is re-exported
here, so `apps.partners.views.Anything` — including the private helpers a sibling module or a test
reaches for — still resolves:

* `base` — the shared spine: `PartnerApiException`, the domain-error translator, the self-review
  audit hook, profile resolution, the idempotency-key reader, and the Operations paginators.
* `partner_application` — the Partner's own application, profile, documents, schedule and presence.
* `operations` — the review queue, the directory, detail reads, the claim, the document reveal and
  the Operations-side transitions.
* `m2_registration` — M2 proposal 0013: business profile, capabilities, insurance, gates, languages.
* `m2_crew` — M2 proposal 0013: the crew roster and per-day crew availability.
"""

from .base import (
    OperationsApplicationCursorPagination,
    OperationsPartnerDirectoryCursorPagination,
    PartnerApiException,
    _application_response,
    _audit_self_review_denial,
    _idempotency_key,
    _partner_profile_or_404,
    _partner_profile_or_none,
    _raise_api_error,
    _request_ip,
)
from .m2_crew import (
    PartnerCrewArchiveView,
    PartnerCrewAvailabilityView,
    PartnerCrewCollectionView,
    PartnerCrewDetailView,
    _crew_entry,
    _crew_membership_or_404,
)
from .m2_registration import (
    PartnerBusinessProfileView,
    PartnerCapabilityCollectionView,
    PartnerCapabilityOptionListView,
    PartnerCapabilitySubmitView,
    PartnerCapabilityWithdrawView,
    PartnerGateListView,
    PartnerInsuranceView,
    PartnerLanguageView,
    _capability_record,
    _unmet_gates,
)
from .operations import (
    OperationsPartnerApplicationClaimView,
    OperationsPartnerApplicationDetailView,
    OperationsPartnerApplicationQueueView,
    OperationsPartnerApplicationTransitionView,
    OperationsPartnerDetailView,
    OperationsPartnerDirectoryView,
    OperationsPartnerDocumentAccessView,
    OperationsPartnerDocumentReviewView,
    OperationsPartnerScheduleView,
    OperationsPartnerTaxProfileVerificationView,
)
from .partner_application import (
    ApplicantServiceAreaListView,
    PartnerApplicationSubmitView,
    PartnerApplicationView,
    PartnerDocumentCreateView,
    PartnerDocumentUploadView,
    PartnerMeView,
    PartnerPresenceHeartbeatView,
    PartnerPresenceOfflineView,
    PartnerPresenceOnlineView,
    PartnerScheduleView,
    PartnerSkillListView,
    RequiredPartnerConsentListView,
)

__all__ = [
    "ApplicantServiceAreaListView",
    "OperationsApplicationCursorPagination",
    "OperationsPartnerApplicationClaimView",
    "OperationsPartnerApplicationDetailView",
    "OperationsPartnerApplicationQueueView",
    "OperationsPartnerApplicationTransitionView",
    "OperationsPartnerDetailView",
    "OperationsPartnerDirectoryCursorPagination",
    "OperationsPartnerDirectoryView",
    "OperationsPartnerDocumentAccessView",
    "OperationsPartnerDocumentReviewView",
    "OperationsPartnerScheduleView",
    "OperationsPartnerTaxProfileVerificationView",
    "PartnerApiException",
    "PartnerApplicationSubmitView",
    "PartnerApplicationView",
    "PartnerBusinessProfileView",
    "PartnerCapabilityCollectionView",
    "PartnerCapabilityOptionListView",
    "PartnerCapabilitySubmitView",
    "PartnerCapabilityWithdrawView",
    "PartnerCrewArchiveView",
    "PartnerCrewAvailabilityView",
    "PartnerCrewCollectionView",
    "PartnerCrewDetailView",
    "PartnerDocumentCreateView",
    "PartnerDocumentUploadView",
    "PartnerGateListView",
    "PartnerInsuranceView",
    "PartnerLanguageView",
    "PartnerMeView",
    "PartnerPresenceHeartbeatView",
    "PartnerPresenceOfflineView",
    "PartnerPresenceOnlineView",
    "PartnerScheduleView",
    "PartnerSkillListView",
    "RequiredPartnerConsentListView",
    "_application_response",
    "_audit_self_review_denial",
    "_capability_record",
    "_crew_entry",
    "_crew_membership_or_404",
    "_idempotency_key",
    "_partner_profile_or_404",
    "_partner_profile_or_none",
    "_raise_api_error",
    "_request_ip",
    "_unmet_gates",
]
