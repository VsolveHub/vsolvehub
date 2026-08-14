export { makeQueryClient, getQueryClient } from "./client";
export { QueryProvider } from "./provider";

export { queryKeys } from "./keys";
export type { QueryKeys } from "./keys";

export { CursorContractError, cursorFromNextUrl } from "./cursor";

export { safeNextPath } from "./next-path";

export {
  STATIC_CONTENT,
  SESSION_STATE,
  VOLATILE_STATE,
  EXPIRING_STATE,
  RECOVERY_POLL_INTERVAL,
} from "./freshness";
export type { FreshnessTier } from "./freshness";

export { boundedPoll, nextPollDelay } from "./polling";
export type { BoundedPollOptions, PollPolicyInput } from "./polling";

export { useServerCountdown, describeCountdown } from "./countdown";
export type { Countdown } from "./countdown";

export { shouldRetryQuery, shouldRetryMutation, queryRetryDelay } from "./retry";

export { describeError, isFieldError, categorizeError, isPendingCategory } from "./error-presentation";
export type {
  ErrorCategory,
  ErrorPresentation,
  OperationKind,
  RecoveryAction,
  StateChange,
} from "./error-presentation";

// M2 (A3 workforce / A5 project). Keys are kept out of `queryKeys` until the
// contract publishes their endpoints — see the header of `m2-keys.ts`.
export { m2QueryKeys, M2_FRESHNESS, M2_INVALIDATION, invalidateForM2Command } from "./m2-keys";
export type { M2Command, M2CommandContext } from "./m2-keys";

export {
  parseWorkspaceGrants,
  findWorkspaceGrant,
  hasWorkspaceAction,
} from "./workspace";
export type { WorkspaceGrant } from "./workspace";

export { createTabChannel, getTabChannel } from "./cross-tab";
export type { TabChannel, TabMessage, TabMessageListener } from "./cross-tab";

export { SessionSync, useTabSync, publishToTabs } from "./use-tab-sync";
export type { TabSyncOptions } from "./use-tab-sync";

export {
  currentSessionQuery,
  sessionDevicesQuery,
  useBootstrapCsrf,
  useCurrentSession,
  useSessionDevices,
  useAuthGuard,
  useRequestOtp,
  useVerifyOtp,
  useLogout,
  useRevokeSession,
  useSwitchRole,
  evaluateAuthGuard,
  hasRole,
  hasAnyRole,
  missingRoles,
} from "./session";
export type {
  AuthGuardDecision,
  AuthGuardInput,
  AuthGuardReason,
  AuthGuardStatus,
  AuthenticatedSession,
  CurrentUser,
  KnownRole,
  OtpIssued,
  OtpRequestInput,
  OtpVerifyInput,
  RevokeSessionInput,
  SessionState,
  UserSession,
} from "./session";

export {
  useOtpFlow,
  describeOtpFailure,
  sanitizeCodeInput,
  sanitizePhoneInput,
} from "./otp-flow";
export type { OtpFailure, OtpFlow, OtpFlowOptions, OtpPhase } from "./otp-flow";

export { AppErrorBoundary } from "./error-boundary";
export type { AppErrorBoundaryProps } from "./error-boundary";

// --- M2 customer surface (session A) ---
export {
  readRequirementList,
  shouldRetryM2Read,
  isFreelyEditable,
  isVendorVisible,
  isRequirementLocked,
  isRequirementDuplicate,
  isLifecycleUnsupported,
  readScanStatus,
  isAttachmentUsable,
  isAttachmentInvalid,
  isAttachmentUnavailable,
} from "./m2-requirement";
export type {
  AttachmentScanStatus,
  AttachmentUploadGrant,
  ProbableDuplicate,
  RequirementAttachment,
  RequirementAttachmentKind,
  RequirementDraft,
  RequirementSubmitted,
  RequirementSummary,
  RequirementTimeline,
  RequirementTimelineEvent,
} from "./m2-requirement";

export {
  m2AccessKeys,
  isAccessPriceUnavailable,
  isPolicyUnavailable,
  isUnlockNotAvailable,
  isUnlockRequired,
  isVisitPlanRequired,
  isVisitPlanNotChargeable,
  isRejectionCapReached,
  isProposalNotSelectable,
  isSelectionConflict,
  isTransitionNotAllowed,
  isSelfReportedNoShow,
  unlockPhase,
  isUnlockSettled,
  canReadFullQuotes,
  visitPlanPhase,
  isVisitPlanSettled,
  canCheckOutVisitPlan,
  canReadFullEstimates,
  shareForVisit,
  isSelectable,
  isExpiredQuote,
  hasRequestedRevalidation,
  isOutOfBudget,
  readVendorIdentity,
  replacementsRemaining,
  canRejectAsNonResponsive,
  isAwaitingVendor,
  isVendorRefused,
  isEngagementOpen,
  blocksNewSelection,
  isNoSelection,
  visitSlotState,
  canConfirmArrival,
  canReportVendorNoShow,
  CUSTOMER_REPORTS_PARTY,
  // The A3 rate-card front door, contract 1.29.0 (revision 4, ADR-0009).
  // Appended rather than interleaved so the diff stays one block.
  m2RateCardKeys,
  isRateCardUnavailable,
  isBookingFeeNotChargeable,
  isRosterInsufficient,
  isRatePublished,
  isPresetIncomplete,
  bookingPhase,
  hasFallenBackToQuotes,
  bookingFeePhase,
  canCheckOutBookingFee,
  isRateCardSettled,
  canCancelBooking,
  canRecordCrewDay,
  CUSTOMER_REPORTS_CREW_PARTY,
  CREW_VENDOR_NO_SHOW_REASON,
} from "./m2-quotes";
export type {
  AccessCheckout,
  CustomerProposal,
  CustomerQuoteList,
  ProposalSelection,
  ProposalSelectionStatus,
  ProposalStage,
  ProposalStatus,
  ProposalTaxBasis,
  ProposalUsability,
  QuoteTeaser,
  QuoteTeaserList,
  QuoteUnlock,
  QuoteUnlockStatus,
  RejectionReason,
  SiteVisit,
  SiteVisitStatus,
  UnlockPhase,
  UnlockState,
  VendorIdentity,
  VisitNoShowParty,
  VisitPlan,
  VisitPlanPhase,
  VisitPlanShare,
  VisitPlanShareStatus,
  VisitPlanState,
  VisitPlanStatus,
  VisitPlanTier,
  VisitSlotState,
  // Revision 4 — see the value block above.
  BookingFee,
  BookingFeePhase,
  BookingFeeStatus,
  CrewNoShowParty,
  CrewNoShowReason,
  RateCardBooking,
  RateCardBookingPhase,
  RateCardBookingStatus,
  RateCardState,
  RatePreview,
} from "./m2-quotes";

export {
  isLeadOnly,
  isManagedPayment,
  isKnownCommercialMode,
  orderedStages,
  nextFundableStage,
  hasFundingInFlight,
  isEngagementSettled,
  stageKind,
  isMaterialAdvance,
  stageAwaitingReview,
  stagesAwaitingReview,
  disputedStages,
  activeStage,
  stageProgress,
  reviewClock,
  autoApprovalDeadline,
  payoutReleaseDeadline,
  canApproveStage,
  canRequestCorrection,
  canDisputeStage,
  hasEvidence,
  isEvidenceReadable,
  isEngagementDisputed,
  canAcceptCompletion,
  isEngagementFinished,
  nextCustomerAction,
  isAmendmentDecidable,
  isAmendmentApplied,
  isAmendmentAwaitingPayment,
  isKnownAmendmentStatus,
  isKnownAmendmentKind,
  amendmentDirection,
  amendmentNeedsPayment,
  isAmendmentListSettled,
  amendmentsNewestFirst,
  appliedAmendments,
  eventsOldestFirst,
  isStageNotFundable,
  isStageDisputed,
  isStageTransitionNotAllowed,
  isAmendmentNotActionable,
  isAmendmentRequired,
  isEngagementNotFound,
} from "./m2-engagement-customer";
export type {
  AmendmentDirection,
  AmendmentLine,
  AmendmentStatus,
  CustomerNextAction,
  Engagement,
  EngagementAmendment,
  EngagementAmendmentDecision,
  EngagementAmendmentKind,
  EngagementAmendmentList,
  EngagementCommercialMode,
  EngagementEvent,
  EngagementEventList,
  EngagementPage,
  EngagementStage,
  EngagementStageFundingState,
  EngagementStageKind,
  EngagementStageStatus,
  EngagementStatus,
  ReviewClock,
  StageKind,
  StageDisputeReason,
  StageEvidence,
  StageEvidenceKind,
  StageEvidenceScanStatus,
} from "./m2-engagement-customer";

// --- M2 partner + operations surface (session B) ---
//
// Only what is uniquely the vendor's. Everything both parties read the same way
// — the type aliases, `orderedStages`, `activeStage`, `disputedStages`,
// `reviewClock`, `payoutReleaseDeadline`, `isEvidenceReadable` and the five
// shared refusal predicates — is exported above from `m2-engagement-customer`
// and is deliberately not re-exported here. One name, one home.
export {
  WORKFORCE_BUCKETS,
  PROJECT_BUCKETS,
  EVIDENCE_UPLOAD_KINDS,
  ACCEPTED_EVIDENCE_MEDIA_TYPES,
  MAXIMUM_EVIDENCE_SIZE_BYTES,
  MAXIMUM_EVIDENCE_PER_STAGE,
  MAXIMUM_AMENDMENT_LINES,
  MAXIMUM_EXTENSION_DAYS,
  workforceBucketFor,
  projectBucketFor,
  awaitingFunding,
  groupEngagements,
  isEngagementClosed,
  vendorStageCommands,
  stageIsWaitingOnFunding,
  workMayStart,
  isAwaitingCustomer,
  correctionRequested,
  submissionCount,
  stagePayoutState,
  payoutSummary,
  isEvidenceUploadKind,
  evidenceKindForFile,
  rejectEvidenceFile,
  evidenceNotes,
  evidenceFiles,
  isEvidenceRejectedByScan,
  amendmentShapeFor,
  acceptsAmendments,
  liveAmendment,
  isAmendmentLive,
  validateAmendmentDraft,
  amendmentDeltaPaise,
  toAmendmentLineRequests,
  agreedTotals,
  isEvidenceRejected,
  isEvidenceStorageUnavailable,
  isPayoutDetailsRequired,
} from "./m2-engagement-partner";
export type {
  AgreedTotals,
  AmendmentDraft,
  AmendmentDraftLine,
  AmendmentPricingAuthority,
  AmendmentProblem,
  AmendmentProblemField,
  AmendmentShape,
  BucketedEngagements,
  EngagementBucket,
  EngagementGrouping,
  EvidenceRejection,
  EvidenceUploadKind,
  PayoutSummary,
  ProjectBucketKey,
  StagePayoutState,
  VendorStageCommand,
  WorkforceBucketKey,
} from "./m2-engagement-partner";
