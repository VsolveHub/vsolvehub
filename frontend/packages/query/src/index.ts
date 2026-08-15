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
  // The A3 shift-day, contract 1.30.0 (`M2-FE-510`, `514`, `515`). Appended
  // rather than interleaved so the diff stays one block.
  SHORTFALL_CHOICES,
  MAXIMUM_DISPUTED_WORKERS,
  attendancePhase,
  canRespondToAttendance,
  attendanceShortfall,
  requiresShortfallChoice,
  canSubmitAttendanceDispute,
  settlementPhase,
  canConfirmDaySettled,
  hasCustomerConfirmedSettlement,
  isSettlementUnproven,
  canReportCashDemand,
  isNotAShiftDay,
  // Folded at the Gate 3 integration. Both sessions wrote these two in the same
  // wave — Session A here, Session B as byte-equivalent twins in
  // `m2-engagement-partner.ts` — and two exports of one name is a `tsc` failure
  // rather than a style question. This file's own rule below decides the
  // direction: both parties read a settlement the same way, so the home is
  // `m2-engagement-customer` and the partner block does not re-export them. The
  // partner twins are deleted; the vendor's settlement panel imports these from
  // `@vsolve/query` and needed no change.
  settlementAmountPaise,
  settlementPaymentLink,
  // The A5 project, contract 1.31.0 (`M2-FE-611`, `612`). Appended rather than
  // interleaved so the diff stays one block, on the revision-4 precedent above.
  // `isNotAProject` sits beside `isNotAShiftDay` deliberately: both read
  // `m2_stage_transition_not_allowed` and they mean opposite things about which
  // screen should not have mounted.
  MATERIAL_ADVANCE_LEFT_WITH_VENDOR,
  milestonesInOrder,
  milestoneKind,
  isMilestoneCancelled,
  isMaterialAdvanceLeftWithVendor,
  hasOriginalTerms,
  milestoneRepriced,
  milestoneScheduleShiftDays,
  stageOwesWork,
  openStages,
  completionBlocker,
  retentionPhase,
  isWarrantyRunning,
  handoverPhase,
  canAcceptHandover,
  handoverBlocksCompletion,
  deliverableLink,
  isKnownTransferStatus,
  isTransferDecidable,
  isTransferApplied,
  transferDirection,
  transferStagePrices,
  hasOutstandingMaterialAdvance,
  isNotAProject,
  // The Customer's delay-claim decision, contract 1.31.0 (`M2-FE-614`). Appended
  // rather than interleaved so the diff stays one block, on the precedent above.
  // It is the plan gap Wave A5P logged in §7 rather than a new task row: the
  // command and the read were both published to the Customer and no wave owned
  // the surface, so a `SUBMITTED` claim shifted every later milestone on
  // acceptance and expired on silence with nothing on screen to answer it.
  isKnownDelayClaimStatus,
  isDelayClaimDecidable,
  isDelayClaimApplied,
  delayClaimsNewestFirst,
  liveDelayClaim,
  decidableDelayClaims,
  settledDelayClaims,
  isDelayClaimNotActionable,
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
  // The A3 shift-day — see the value block above.
  AttendancePhase,
  AttendanceResponse,
  CashDemandReport,
  DaySettlement,
  DaySettlementStatus,
  DisputedWorker,
  SettlementPhase,
  ShiftAttendance,
  ShiftAttendanceStatus,
  ShiftCrewMember,
  ShiftDay,
  ShortfallChoice,
  // The A5 project — see the value block above.
  CompletionBlocker,
  HandoverPhase,
  ProjectDelayClaim,
  ProjectDelayClaimStatus,
  ProjectDeliverable,
  ProjectDeliverableKind,
  ProjectHandover,
  ProjectMilestone,
  ProjectPlan,
  ProjectTransfer,
  ProjectTransferStatus,
  RetentionPhase,
  TransferDirection,
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
  // The A3 shift-day, contract 1.30.0 (Wave B3's workforce half). Appended
  // rather than interleaved so the diff stays one block, on the revision-4
  // precedent above. Every name is prefixed on purpose: Session A is building
  // the Customer's half of the same shift-day into `m2-engagement-customer.ts`
  // and both land in this barrel — a bare `ShiftDay` exported twice is a
  // duplicate-export failure, and the wire types are deliberately kept private
  // to each module for that reason.
  shiftDayPhase,
  isShiftDayClosed,
  supervisorShiftCommands,
  bookedHeadcount,
  assignableCrew,
  crewSelectionProblem,
  assignedMembershipIds,
  crewIsUnchanged,
  CREW_RELEASE_REASONS,
  attendanceCeiling,
  checkoutIsMissing,
  attendanceIsDisputed,
  shiftOvertime,
  shiftAddOns,
  overtimeIsRetroactive,
  SUPERVISOR_SETTLEMENT_PARTY,
  shiftSettlementClaim,
  // `settlementAmountPaise` / `settlementPaymentLink` deliberately absent — see
  // the fold note in the session A block above, and "One name, one home".
  SHIFT_SAFETY_SEVERITIES,
  SHIFT_SAFETY_CATEGORIES,
  isCrewConflict,
  isCrewRosterRequired,
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
  // The A3 shift-day — see the value block above for why every name is
  // prefixed and why no wire type is republished here.
  AssignableCrew,
  CrewIneligibility,
  CrewReleaseReason,
  CrewSelectionProblem,
  ShiftAddOn,
  ShiftDayPhase,
  ShiftOvertimeTerms,
  ShiftSafetyCategory,
  ShiftSafetySeverity,
  ShiftSettlementClaim,
  SupervisorShiftCommand,
} from "./m2-engagement-partner";

// The M2 Operations surface, contract 1.32.0 (`M2-FE-701..705`, `712`, `713`).
// Appended rather than interleaved so the diff stays one block, on the
// revision-4 precedent above. Read by `apps/admin` only; the hooks live there,
// and only the pure domain is published here.
export {
  m2OpsKeys,
  M2_OPS_FRESHNESS,
  TIMELINE_DESCRIPTORS,
  queueRecoveryAction,
  queueIsEmpty,
  searchQueues,
  queuesByUrgency,
  describeTimelineEvent,
  timelineEntries,
  timelineSources,
  bookingFeeStatement,
  touchVerdict,
  rateCardComponents,
  rateCardTotals,
  rateCardAddOns,
  rateCardInclusions,
  rateCardGroupKey,
  rateCardHistories,
  daysEffective,
  publishRefusalFor,
  declineAlarmState,
  declineAlarmsByUrgency,
  declineAlarmVerdict,
  basisPointsPercent,
  invitedVendors,
  requestSiteVisits,
  captureAttribution,
  isAssistedQuestion,
  composeWorkforceTotalPaise,
  composeProjectTotalPaise,
  composerFor,
} from "./m2-ops";
export type {
  BookingFeeStatement,
  CaptureAttribution,
  CapturedProposal,
  CapturedQuestion,
  ComposableArchetype,
  CrewVerificationRow,
  DeclineAlarmBoard,
  DeclineAlarmReading,
  DeclineAlarmState,
  DeclineAlarmVerdict,
  InvitedVendor,
  OperationsRateCard,
  OperationsRateCardList,
  OperationsTouch,
  // `ProposalTaxBasis` deliberately absent — it is Session A's, exported from
  // `m2-quotes` above, and both blocks publishing one name is a `tsc` failure
  // rather than a style question. Same fold as `settlementAmountPaise`: one
  // name, one home. The alias survives inside `m2-ops.ts` for local use.
  PublishRefusal,
  RateCardComponent,
  RateCardHistory,
  RateCardPublish,
  ReclassificationTarget,
  ReconciliationSummary,
  RefundReviewDecision,
  RequestSiteVisit,
  RequestTimeline,
  RequestTimelineEvent,
  ServiceAreaOption,
  StuckQueue,
  StuckQueueList,
  TimelineActor,
  TimelineDescriptor,
  TimelineEntry,
  TimelineSource,
  TouchMetric,
  TouchRollup,
  TouchVerdict,
} from "./m2-ops";
