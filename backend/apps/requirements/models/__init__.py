"""Customer requirements for M2 workforce and project work.

A requirement is free to submit and free to match. Nothing here charges anybody: the money
moment is the quote unlock in P4, after a usable quote exists. See
docs/adr/0007-m2-engagement-spine-and-fee-after-value.md.

The tables are split across this package by the wave and the audience that own them:

* `capture` — the request, its attachments and its status log.
* `matching` — snapshots, invitations, capacity holds, proposals and clarifications.
* `access` — the access price table, the A3 unlock, the A5 visit plan, visits and selection.
* `engagements` — the agreement and its stages, with the money envelope as columns.
* `evidence` — engagement events, stage evidence and the M2 half of a scope amendment.
* `projects` — the A5 project's delay claims, deliverables and vendor transfers.
* `rate_cards` — the published day rate, its acceptances, the booking and the booking fee.
* `workforce` — the shift-day: crew, attendance, day settlement, safety and cash demands.
* `operations` — the cancellation evaluation and the Operations touch counter.
"""

from .access import (
    QUOTE_UNLOCK_READABLE_STATUSES,
    VISIT_PLAN_CHARGED_STATUSES,
    M2AccessPrice,
    ProposalSelection,
    QuoteUnlock,
    SiteVisit,
    SiteVisitArrivalOtp,
    VisitPlan,
    VisitPlanShare,
)
from .capture import (
    REQUIREMENT_CLOSED_STATUSES,
    CustomerRequirement,
    RequirementAttachment,
    RequirementAttachmentUpload,
    RequirementTransition,
)
from .engagements import Engagement, EngagementStage, ProjectCompletionOtp
from .evidence import (
    EngagementAmendment,
    EngagementEvent,
    StageEvidence,
    StageEvidenceUpload,
)
from .matching import (
    CapacityHold,
    Proposal,
    RequirementQuestion,
    RequirementSnapshot,
    VendorInvitation,
)
from .operations import (
    CANCELLATION_LIVE_STATUSES,
    OperationsTouch,
    RequirementCancellation,
)
from .projects import (
    DELAY_CLAIM_UNDECIDED_STATUSES,
    PROJECT_TRANSFER_UNDECIDED_STATUSES,
    ProjectDelayClaim,
    ProjectDeliverable,
    ProjectTransfer,
)
from .rate_cards import (
    BOOKING_FEE_NON_BLOCKING_STATUSES,
    BookingFee,
    RateCard,
    RateCardAcceptance,
    RateCardBooking,
)
from .workforce import (
    CashDemandReport,
    DaySettlement,
    SafetyIncident,
    ShiftAttendance,
    StageCrewAssignment,
)

__all__ = [
    "BOOKING_FEE_NON_BLOCKING_STATUSES",
    "CANCELLATION_LIVE_STATUSES",
    "DELAY_CLAIM_UNDECIDED_STATUSES",
    "PROJECT_TRANSFER_UNDECIDED_STATUSES",
    "QUOTE_UNLOCK_READABLE_STATUSES",
    "REQUIREMENT_CLOSED_STATUSES",
    "VISIT_PLAN_CHARGED_STATUSES",
    "BookingFee",
    "CapacityHold",
    "CashDemandReport",
    "CustomerRequirement",
    "DaySettlement",
    "Engagement",
    "EngagementAmendment",
    "EngagementEvent",
    "EngagementStage",
    "M2AccessPrice",
    "OperationsTouch",
    "ProjectCompletionOtp",
    "ProjectDelayClaim",
    "ProjectDeliverable",
    "ProjectTransfer",
    "Proposal",
    "ProposalSelection",
    "QuoteUnlock",
    "RateCard",
    "RateCardAcceptance",
    "RateCardBooking",
    "RequirementAttachment",
    "RequirementAttachmentUpload",
    "RequirementCancellation",
    "RequirementQuestion",
    "RequirementSnapshot",
    "RequirementTransition",
    "SafetyIncident",
    "ShiftAttendance",
    "SiteVisit",
    "SiteVisitArrivalOtp",
    "StageCrewAssignment",
    "StageEvidence",
    "StageEvidenceUpload",
    "VendorInvitation",
    "VisitPlan",
    "VisitPlanShare",
]
