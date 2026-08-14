"""M2 routes: Customer requirements, Partner enquiries and proposals.

Mounted under `/api/v1/` by `config.urls`. Customer paths sit at `requirements/**` and Partner paths
under `partner/**`, matching the split `apps.partners.urls` already established — the prefix is what
tells a reader which role a route belongs to before they open the view.
"""

from django.urls import path

from apps.requirements.views import (
    EngagementAmendmentCollectionView,
    EngagementAmendmentDecisionView,
    EngagementAmendmentDeclineView,
    EngagementCashDemandView,
    EngagementCollectionView,
    EngagementCompletionView,
    EngagementDetailView,
    EngagementEventListView,
    EngagementSafetyIncidentView,
    EngagementStageApprovalView,
    EngagementStageArrivalView,
    EngagementStageAttendanceResponseView,
    EngagementStageAttendanceView,
    EngagementStageCorrectionView,
    EngagementStageCrewView,
    EngagementStageDetailView,
    EngagementStageDisputeDecisionView,
    EngagementStageDisputeView,
    EngagementStageEvidenceUploadView,
    EngagementStageEvidenceView,
    EngagementStageExtraView,
    EngagementStageFundingView,
    EngagementStageSettlementView,
    EngagementStageShiftView,
    EngagementStageStartView,
    EngagementStageSubmitView,
    OperationsRateCardView,
    OperationsSafetyIncidentDecisionView,
    PartnerCrewOfferAcceptView,
    PartnerCrewOfferDeclineView,
    PartnerCrewOfferListView,
    PartnerDemandPreviewView,
    PartnerEnquiryAcceptView,
    PartnerEnquiryAttachmentListView,
    PartnerEnquiryCollectionView,
    PartnerEnquiryDeclineView,
    PartnerEnquiryDetailView,
    PartnerEnquiryQuestionView,
    PartnerEnquirySiteVisitView,
    PartnerEnquiryVisitSlotView,
    PartnerProposalCollectionView,
    PartnerProposalDetailView,
    PartnerProposalWithdrawView,
    PartnerQuestionAnswerView,
    PartnerWorkspaceListView,
    RequirementAttachmentCollectionView,
    RequirementAttachmentDetailView,
    RequirementAttachmentFinalizeView,
    RequirementBookingFeeCancelView,
    RequirementBookingFeeCheckoutView,
    RequirementCollectionView,
    RequirementCrewArrivalView,
    RequirementCrewNoShowView,
    RequirementDetailView,
    RequirementDuplicateCheckView,
    RequirementQuestionAnswerView,
    RequirementQuoteListView,
    RequirementQuoteQuestionView,
    RequirementQuoteRejectView,
    RequirementQuoteRevalidateView,
    RequirementRateCardBookView,
    RequirementRateCardView,
    RequirementSelectionView,
    RequirementSubmitView,
    RequirementTeaserListView,
    RequirementTimelineView,
    RequirementUnlockView,
    RequirementVendorCardListView,
    RequirementVisitPlanCheckoutView,
    RequirementVisitPlanView,
    SelectionDeclineView,
    SelectionReconfirmView,
    SiteVisitArrivalView,
    SiteVisitCompleteView,
    SiteVisitNoShowView,
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
    # The A5 responding pool, on the disclosure ladder. Sits beside `visit-plan/` rather than under
    # it because a card exists from the first vendor response, which is before any plan is charged.
    path(
        "requirements/<uuid:requirement_id>/vendor-cards/",
        RequirementVendorCardListView.as_view(),
        name="m2-requirement-vendor-cards",
    ),
    # Wave C2 — the two front doors. `unlock/` is A3-only and `visit-plan/` is A5-only; each
    # refuses on the other archetype rather than quietly doing nothing, so a client that mounted
    # the wrong one finds out immediately.
    path(
        "requirements/<uuid:requirement_id>/unlock/",
        RequirementUnlockView.as_view(),
        name="m2-requirement-unlock",
    ),
    path(
        "requirements/<uuid:requirement_id>/visit-plan/",
        RequirementVisitPlanView.as_view(),
        name="m2-requirement-visit-plan",
    ),
    path(
        "requirements/<uuid:requirement_id>/visit-plan/checkout/",
        RequirementVisitPlanCheckoutView.as_view(),
        name="m2-requirement-visit-plan-checkout",
    ),
    path(
        "requirements/<uuid:requirement_id>/quotes/",
        RequirementQuoteListView.as_view(),
        name="m2-requirement-quotes",
    ),
    # The Customer's half of clarification. Nested under the quote because a question is addressed
    # to the vendor who wrote that quote — a question aimed at the pool is a broadcast nobody owns.
    path(
        "requirements/<uuid:requirement_id>/quotes/<uuid:proposal_id>/questions/",
        RequirementQuoteQuestionView.as_view(),
        name="m2-requirement-quote-question",
    ),
    path(
        "requirements/<uuid:requirement_id>/quotes/<uuid:proposal_id>/reject/",
        RequirementQuoteRejectView.as_view(),
        name="m2-requirement-quote-reject",
    ),
    path(
        "requirements/<uuid:requirement_id>/quotes/<uuid:proposal_id>/revalidate/",
        RequirementQuoteRevalidateView.as_view(),
        name="m2-requirement-quote-revalidate",
    ),
    path(
        "requirements/<uuid:requirement_id>/selection/",
        RequirementSelectionView.as_view(),
        name="m2-requirement-selection",
    ),
    # Selection and engagement: the vendor's half, and a read either party may make.
    path(
        "selections/<uuid:selection_id>/reconfirm/",
        SelectionReconfirmView.as_view(),
        name="m2-selection-reconfirm",
    ),
    path(
        "selections/<uuid:selection_id>/decline/",
        SelectionDeclineView.as_view(),
        name="m2-selection-decline",
    ),
    path("engagements/", EngagementCollectionView.as_view(), name="m2-engagement-list"),
    path(
        "engagements/<uuid:engagement_id>/",
        EngagementDetailView.as_view(),
        name="m2-engagement-detail",
    ),
    path(
        "engagements/<uuid:engagement_id>/events/",
        EngagementEventListView.as_view(),
        name="m2-engagement-events",
    ),
    path(
        "engagements/<uuid:engagement_id>/completion/",
        EngagementCompletionView.as_view(),
        name="m2-engagement-completion",
    ),
    # Wave C3 — scope amendments. `POST` on the collection proposes (vendor); the decision routes
    # belong to the Customer. Both go through the M1 amendment engine.
    path(
        "engagements/<uuid:engagement_id>/amendments/",
        EngagementAmendmentCollectionView.as_view(),
        name="m2-engagement-amendments",
    ),
    path(
        "engagement-amendments/<uuid:engagement_amendment_id>/accept/",
        EngagementAmendmentDecisionView.as_view(),
        name="m2-engagement-amendment-accept",
    ),
    path(
        "engagement-amendments/<uuid:engagement_amendment_id>/decline/",
        EngagementAmendmentDeclineView.as_view(),
        name="m2-engagement-amendment-decline",
    ),
    # Wave C3 — the stage spine. One set of routes for both archetypes: a shift-day and a
    # milestone take the same commands, and the archetype only changes what they refuse.
    path(
        "engagement-stages/<uuid:stage_id>/",
        EngagementStageDetailView.as_view(),
        name="m2-engagement-stage-detail",
    ),
    path(
        "engagement-stages/<uuid:stage_id>/funding/",
        EngagementStageFundingView.as_view(),
        name="m2-engagement-stage-funding",
    ),
    path(
        "engagement-stages/<uuid:stage_id>/start/",
        EngagementStageStartView.as_view(),
        name="m2-engagement-stage-start",
    ),
    path(
        "engagement-stages/<uuid:stage_id>/evidence/uploads/",
        EngagementStageEvidenceUploadView.as_view(),
        name="m2-engagement-stage-evidence-upload",
    ),
    path(
        "engagement-stages/<uuid:stage_id>/evidence/",
        EngagementStageEvidenceView.as_view(),
        name="m2-engagement-stage-evidence",
    ),
    path(
        "engagement-stages/<uuid:stage_id>/submit/",
        EngagementStageSubmitView.as_view(),
        name="m2-engagement-stage-submit",
    ),
    path(
        "engagement-stages/<uuid:stage_id>/approve/",
        EngagementStageApprovalView.as_view(),
        name="m2-engagement-stage-approve",
    ),
    path(
        "engagement-stages/<uuid:stage_id>/correction/",
        EngagementStageCorrectionView.as_view(),
        name="m2-engagement-stage-correction",
    ),
    path(
        "engagement-stages/<uuid:stage_id>/dispute/",
        EngagementStageDisputeView.as_view(),
        name="m2-engagement-stage-dispute",
    ),
    path(
        "engagement-stages/<uuid:stage_id>/dispute/decision/",
        EngagementStageDisputeDecisionView.as_view(),
        name="m2-engagement-stage-dispute-decision",
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
    path(
        "site-visits/<uuid:site_visit_id>/arrival/",
        SiteVisitArrivalView.as_view(),
        name="m2-site-visit-arrival",
    ),
    path(
        "site-visits/<uuid:site_visit_id>/no-show/",
        SiteVisitNoShowView.as_view(),
        name="m2-site-visit-no-show",
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
        "partner/enquiries/<uuid:invitation_id>/attachments/",
        PartnerEnquiryAttachmentListView.as_view(),
        name="m2-partner-enquiry-attachments",
    ),
    path(
        "partner/enquiries/<uuid:invitation_id>/site-visits/",
        PartnerEnquirySiteVisitView.as_view(),
        name="m2-partner-enquiry-site-visit",
    ),
    # The A5 slot picker, read and write on one path. `GET` draws the grid the browser renders;
    # `POST` redeems a signed slot id from it. Publishing the write alone would have left the
    # picker with nothing to draw — the browser must never compute availability.
    path(
        "partner/enquiries/<uuid:invitation_id>/visit-slots/",
        PartnerEnquiryVisitSlotView.as_view(),
        name="m2-partner-enquiry-visit-slots",
    ),
    path(
        "partner/questions/<uuid:question_id>/answer/",
        PartnerQuestionAnswerView.as_view(),
        name="m2-partner-question-answer",
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
    # Wave C2R — the A3 rate-card front door (revision 4, ADR-0009). `rate-card/` is the read the
    # booking screen draws *and* the tracker afterwards; the C2 `unlock/` path above is untouched
    # and is now the thin-supply fallback rather than the product.
    path(
        "requirements/<uuid:requirement_id>/rate-card/",
        RequirementRateCardView.as_view(),
        name="m2-requirement-rate-card",
    ),
    path(
        "requirements/<uuid:requirement_id>/rate-card/book/",
        RequirementRateCardBookView.as_view(),
        name="m2-requirement-rate-card-book",
    ),
    path(
        "requirements/<uuid:requirement_id>/booking-fee/checkout/",
        RequirementBookingFeeCheckoutView.as_view(),
        name="m2-requirement-booking-fee-checkout",
    ),
    path(
        "requirements/<uuid:requirement_id>/booking-fee/cancel/",
        RequirementBookingFeeCancelView.as_view(),
        name="m2-requirement-booking-fee-cancel",
    ),
    # Day one. Both resolve by participation — either party was at the site and either can say
    # what happened — and both are money-moving, which is why `party` on the no-show is a required
    # choice rather than a default.
    path(
        "requirements/<uuid:requirement_id>/crew/arrival/",
        RequirementCrewArrivalView.as_view(),
        name="m2-requirement-crew-arrival",
    ),
    path(
        "requirements/<uuid:requirement_id>/crew/no-show/",
        RequirementCrewNoShowView.as_view(),
        name="m2-requirement-crew-no-show",
    ),
    # The lead's side. Deliberately its own collection rather than a filter on `partner/enquiries/`:
    # a crew offer runs on a wall-clock deadline and is answered with one tap, and mixing it into
    # the quote inbox would put two different clocks in one list.
    path(
        "partner/crew-offers/",
        PartnerCrewOfferListView.as_view(),
        name="m2-partner-crew-offers",
    ),
    path(
        "partner/crew-offers/<uuid:invitation_id>/accept/",
        PartnerCrewOfferAcceptView.as_view(),
        name="m2-partner-crew-offer-accept",
    ),
    path(
        "partner/crew-offers/<uuid:invitation_id>/decline/",
        PartnerCrewOfferDeclineView.as_view(),
        name="m2-partner-crew-offer-decline",
    ),
    # Wave C4 - the A3 shift-day (`M2-BE-521..539`). Every one of these hangs off a *stage*
    # rather than off the engagement, because an A3 stage **is** a shift-day: the crew that comes
    # on Thursday is legitimately not Monday's crew, and a per-engagement route could not say so.
    #
    # Nothing here moves wage money. The settlement route records two taps against a published
    # figure and hands back a UPI deep link into the Customer's own app; there is no checkout on
    # this path and none may be added.
    path(
        "engagement-stages/<uuid:stage_id>/shift/",
        EngagementStageShiftView.as_view(),
        name="m2-engagement-stage-shift",
    ),
    path(
        "engagement-stages/<uuid:stage_id>/crew/",
        EngagementStageCrewView.as_view(),
        name="m2-engagement-stage-crew",
    ),
    # Deliberately its own route rather than a flag on the stage `start/`: arrival is the
    # non-OTP fact that a crew is standing at a site, either party may record it, and on day one
    # it is what earns the booking fee.
    path(
        "engagement-stages/<uuid:stage_id>/arrival/",
        EngagementStageArrivalView.as_view(),
        name="m2-engagement-stage-arrival",
    ),
    path(
        "engagement-stages/<uuid:stage_id>/attendance/",
        EngagementStageAttendanceView.as_view(),
        name="m2-engagement-stage-attendance",
    ),
    path(
        "engagement-stages/<uuid:stage_id>/attendance/response/",
        EngagementStageAttendanceResponseView.as_view(),
        name="m2-engagement-stage-attendance-response",
    ),
    path(
        "engagement-stages/<uuid:stage_id>/settlement/",
        EngagementStageSettlementView.as_view(),
        name="m2-engagement-stage-settlement",
    ),
    path(
        "engagement-stages/<uuid:stage_id>/extras/",
        EngagementStageExtraView.as_view(),
        name="m2-engagement-stage-extras",
    ),
    # Safety and cash demands sit on the **engagement**, not the stage: an incident can be about
    # the job as a whole or be reported after the day it belongs to has closed, and a report that
    # needed a live shift-day to attach to would be one nobody could file the next morning.
    path(
        "engagements/<uuid:engagement_id>/safety-incidents/",
        EngagementSafetyIncidentView.as_view(),
        name="m2-engagement-safety-incidents",
    ),
    path(
        "engagements/<uuid:engagement_id>/cash-demand/",
        EngagementCashDemandView.as_view(),
        name="m2-engagement-cash-demand",
    ),
    path(
        "operations/safety-incidents/<uuid:safety_incident_id>/decision/",
        OperationsSafetyIncidentDecisionView.as_view(),
        name="m2-operations-safety-incident-decision",
    ),
    path(
        "operations/rate-cards/",
        OperationsRateCardView.as_view(),
        name="m2-operations-rate-cards",
    ),
]
