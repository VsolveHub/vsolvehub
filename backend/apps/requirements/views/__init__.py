"""HTTP surface for M2 requirements, enquiries and proposals.

Thin by policy. Every state change here delegates to a command in `services`, `matching` or
`proposals`; the only work these views do is authorise the actor, resolve records the caller is
allowed to see, and translate a domain refusal into the standard error envelope. If a rule appears
in this file that is not also in the domain, it is in the wrong place.

Object-level authorization is per record, not per route. A requirement that belongs to another
Customer answers `404`, never `403` — existence is itself private, and a `403` confirms there is a
record there to find.

Where to look, one line per submodule:

* `base` — error translation, request helpers and the four cursor paginators; imports no sibling.
* `requirements` — Customer: requirement capture, submission, timeline and pre-purchase teasers.
* `clarifications` — the same capture section's attachments and its two-way question routes.
* `enquiries` — Partner: the enquiry inbox, plus the site-visit routes both roles share.
* `proposals` — Partner: submitting, listing, reading and withdrawing quotes.
* `quote_access` — Wave C2: the A3 unlock, the A5 visit plan, and reading or rejecting quotes.
* `selection` — Wave C2: selection, reconfirmation, the engagement and A5 stage funding.
* `visit_slots` — Wave C2: the A5 slot grid and its confirmation, arrivals, no-shows, workspaces.
* `stages` — Wave C3: the engagement stage spine, one set of routes for both archetypes.
* `amendments` — Wave C3: scope amendments, routed through the M1 engine.
* `rate_card` — Wave C2R: the rate-card A3 front door, its booking fee and day-one outcomes.
* `crew_offers` — Partner: crew offers, and Operations publishing the cards they are priced from.
* `shift_days` — Wave C4: the shift-day surface, none of which moves wage money.
* `safety` — Wave C4's tail: safety incidents and the cash-demand report.
* `projects` — Wave C5: the A5 project surface, from delay claims to early termination.
* `cancellations` — Wave C6: calling a job off, and the counterparty's answer.
* `cases` — Wave C6: cases as a party reads them, warranty claims, evidence and appeals.
* `operations_requests` — Wave C6: Operations acting on one request, including assisted capture.
* `operations_workspace` — Wave C6: the queues, verification, unit economics and reconciliation.
"""

from .amendments import (
    EngagementAmendmentCollectionView,
    EngagementAmendmentDecisionView,
    EngagementAmendmentDeclineView,
    _amendment_payload,
)
from .base import (
    DomainError,
    EngagementCursorPagination,
    EnquiryCursorPagination,
    M2ApiException,
    ProposalCursorPagination,
    RequirementCursorPagination,
    _checkout_payload,
    _draft_response,
    _idempotency_key,
    _optional_policy,
    _partner_profile,
    _proposal_for_customer,
    _raise_api_error,
)
from .cancellations import (
    CancellationDecisionView,
    RequirementCancellationView,
    _actor_role_for,
    _requirement_for_party,
)
from .cases import (
    CaseAppealView,
    CaseEvidenceView,
    EngagementCaseListView,
    EngagementWarrantyClaimView,
)
from .clarifications import (
    PartnerQuestionAnswerView,
    RequirementAttachmentCollectionView,
    RequirementAttachmentDetailView,
    RequirementAttachmentFinalizeView,
    RequirementQuestionAnswerView,
    RequirementQuoteQuestionView,
)
from .crew_offers import (
    OperationsDeclineAlarmView,
    OperationsRateCardView,
    PartnerCrewOfferAcceptView,
    PartnerCrewOfferDeclineView,
    PartnerCrewOfferListView,
    _crew_offer_payload,
)
from .enquiries import (
    PartnerEnquiryAcceptView,
    PartnerEnquiryAttachmentListView,
    PartnerEnquiryCollectionView,
    PartnerEnquiryDeclineView,
    PartnerEnquiryDetailView,
    PartnerEnquiryQuestionView,
    PartnerEnquirySiteVisitView,
    SiteVisitCompleteView,
    SiteVisitScheduleView,
)
from .operations_requests import (
    OperationsAssistedClarificationView,
    OperationsAssistedProposalView,
    OperationsDeadlineView,
    OperationsReclassificationView,
    OperationsRefundReviewView,
    OperationsRematchView,
    OperationsRequestTimelineView,
)
from .operations_workspace import (
    OperationsChargebackView,
    OperationsCrewVerificationQueueView,
    OperationsCrewVerificationView,
    OperationsQueueView,
    OperationsReconciliationView,
    OperationsTouchMetricView,
    OperationsTouchRollupView,
)
from .projects import (
    EngagementHandoverAcceptanceView,
    EngagementHandoverView,
    EngagementProjectTransferView,
    EngagementProjectView,
    EngagementStageDelayClaimView,
    EngagementTerminationView,
    ProjectDelayClaimDecisionView,
    ProjectTransferDecisionView,
    _project_engagement_for_participant,
    _project_payload_response,
)
from .proposals import (
    PartnerProposalCollectionView,
    PartnerProposalDetailView,
    PartnerProposalWithdrawView,
)
from .quote_access import (
    RequirementQuoteListView,
    RequirementQuoteRejectView,
    RequirementQuoteRevalidateView,
    RequirementUnlockView,
    RequirementVisitPlanCheckoutView,
    RequirementVisitPlanView,
)
from .rate_card import (
    RequirementBookingFeeCancelView,
    RequirementBookingFeeCheckoutView,
    RequirementCrewArrivalView,
    RequirementCrewNoShowView,
    RequirementRateCardBookView,
    RequirementRateCardView,
    _rate_card_participant,
    _rate_card_preview_payload,
    _rate_card_state_payload,
)
from .requirements import (
    RequirementCollectionView,
    RequirementDetailView,
    RequirementDuplicateCheckView,
    RequirementSubmitView,
    RequirementTeaserListView,
    RequirementTimelineView,
    RequirementVendorCardListView,
)
from .safety import (
    EngagementCashDemandView,
    EngagementSafetyIncidentView,
    OperationsSafetyIncidentDecisionView,
)
from .selection import (
    EngagementDetailView,
    EngagementStageFundingView,
    RequirementSelectionView,
    SelectionDeclineView,
    SelectionReconfirmView,
)
from .shift_days import (
    EngagementStageArrivalView,
    EngagementStageAttendanceResponseView,
    EngagementStageAttendanceView,
    EngagementStageCrewView,
    EngagementStageExtraView,
    EngagementStageSettlementView,
    EngagementStageShiftView,
    _is_partner_side,
    _shift_stage_for_participant,
)
from .stages import (
    EngagementCollectionView,
    EngagementCompletionView,
    EngagementEventListView,
    EngagementStageApprovalView,
    EngagementStageCorrectionView,
    EngagementStageDetailView,
    EngagementStageDisputeDecisionView,
    EngagementStageDisputeView,
    EngagementStageEvidenceUploadView,
    EngagementStageEvidenceView,
    EngagementStageStartView,
    EngagementStageSubmitView,
    _customer_stage_command,
)
from .visit_slots import (
    PartnerDemandPreviewView,
    PartnerEnquiryVisitSlotView,
    PartnerWorkspaceListView,
    SiteVisitArrivalView,
    SiteVisitNoShowView,
)

__all__ = [
    "CancellationDecisionView",
    "CaseAppealView",
    "CaseEvidenceView",
    "DomainError",
    "EngagementAmendmentCollectionView",
    "EngagementAmendmentDecisionView",
    "EngagementAmendmentDeclineView",
    "EngagementCaseListView",
    "EngagementCashDemandView",
    "EngagementCollectionView",
    "EngagementCompletionView",
    "EngagementCursorPagination",
    "EngagementDetailView",
    "EngagementEventListView",
    "EngagementHandoverAcceptanceView",
    "EngagementHandoverView",
    "EngagementProjectTransferView",
    "EngagementProjectView",
    "EngagementSafetyIncidentView",
    "EngagementStageApprovalView",
    "EngagementStageArrivalView",
    "EngagementStageAttendanceResponseView",
    "EngagementStageAttendanceView",
    "EngagementStageCorrectionView",
    "EngagementStageCrewView",
    "EngagementStageDelayClaimView",
    "EngagementStageDetailView",
    "EngagementStageDisputeDecisionView",
    "EngagementStageDisputeView",
    "EngagementStageEvidenceUploadView",
    "EngagementStageEvidenceView",
    "EngagementStageExtraView",
    "EngagementStageFundingView",
    "EngagementStageSettlementView",
    "EngagementStageShiftView",
    "EngagementStageStartView",
    "EngagementStageSubmitView",
    "EngagementTerminationView",
    "EngagementWarrantyClaimView",
    "EnquiryCursorPagination",
    "M2ApiException",
    "OperationsAssistedClarificationView",
    "OperationsAssistedProposalView",
    "OperationsChargebackView",
    "OperationsCrewVerificationQueueView",
    "OperationsCrewVerificationView",
    "OperationsDeadlineView",
    "OperationsDeclineAlarmView",
    "OperationsQueueView",
    "OperationsRateCardView",
    "OperationsReclassificationView",
    "OperationsReconciliationView",
    "OperationsRefundReviewView",
    "OperationsRematchView",
    "OperationsRequestTimelineView",
    "OperationsSafetyIncidentDecisionView",
    "OperationsTouchMetricView",
    "OperationsTouchRollupView",
    "PartnerCrewOfferAcceptView",
    "PartnerCrewOfferDeclineView",
    "PartnerCrewOfferListView",
    "PartnerDemandPreviewView",
    "PartnerEnquiryAcceptView",
    "PartnerEnquiryAttachmentListView",
    "PartnerEnquiryCollectionView",
    "PartnerEnquiryDeclineView",
    "PartnerEnquiryDetailView",
    "PartnerEnquiryQuestionView",
    "PartnerEnquirySiteVisitView",
    "PartnerEnquiryVisitSlotView",
    "PartnerProposalCollectionView",
    "PartnerProposalDetailView",
    "PartnerProposalWithdrawView",
    "PartnerQuestionAnswerView",
    "PartnerWorkspaceListView",
    "ProjectDelayClaimDecisionView",
    "ProjectTransferDecisionView",
    "ProposalCursorPagination",
    "RequirementAttachmentCollectionView",
    "RequirementAttachmentDetailView",
    "RequirementAttachmentFinalizeView",
    "RequirementBookingFeeCancelView",
    "RequirementBookingFeeCheckoutView",
    "RequirementCancellationView",
    "RequirementCollectionView",
    "RequirementCrewArrivalView",
    "RequirementCrewNoShowView",
    "RequirementCursorPagination",
    "RequirementDetailView",
    "RequirementDuplicateCheckView",
    "RequirementQuestionAnswerView",
    "RequirementQuoteListView",
    "RequirementQuoteQuestionView",
    "RequirementQuoteRejectView",
    "RequirementQuoteRevalidateView",
    "RequirementRateCardBookView",
    "RequirementRateCardView",
    "RequirementSelectionView",
    "RequirementSubmitView",
    "RequirementTeaserListView",
    "RequirementTimelineView",
    "RequirementUnlockView",
    "RequirementVendorCardListView",
    "RequirementVisitPlanCheckoutView",
    "RequirementVisitPlanView",
    "SelectionDeclineView",
    "SelectionReconfirmView",
    "SiteVisitArrivalView",
    "SiteVisitCompleteView",
    "SiteVisitNoShowView",
    "SiteVisitScheduleView",
    "_actor_role_for",
    "_amendment_payload",
    "_checkout_payload",
    "_crew_offer_payload",
    "_customer_stage_command",
    "_draft_response",
    "_idempotency_key",
    "_is_partner_side",
    "_optional_policy",
    "_partner_profile",
    "_project_engagement_for_participant",
    "_project_payload_response",
    "_proposal_for_customer",
    "_raise_api_error",
    "_rate_card_participant",
    "_rate_card_preview_payload",
    "_rate_card_state_payload",
    "_requirement_for_party",
    "_shift_stage_for_participant",
]
