"""The HTTP surface for booking fulfilment: arrival through completion, per Fulfilment Unit.

`apps/fulfilment` was a complete, tested domain layer behind no door for one release. This module
is the door, and it is deliberately thin: every view validates, authorizes, delegates to the
service that already owns the rule, and projects. No business logic lives here.

## Four properties every state-changing view has

**An `expected_version`.** Required, never defaulted. The domain layer raises
`BookingVersionConflictApiError` and the client refetches — it never retries blindly.

**A required `Idempotency-Key`,** routed through `execute_idempotent`, the same helper proposal
0009 proved for Partner offer commands and 1.15.0 reused for dispatch recovery. There is one way
to do this in the repo and this is it. A replay answers with *current* truth rather than the
frozen body, because every projection here carries `server_now` and live deadlines; republishing
a stored body would hand a device a stale clock.

**An actor check that is part of the command, not the view.** `mark_en_route` takes a
`partner_id` and refuses another Partner's Booking itself. The view supplies identity; it does
not decide access. That way a future caller — a management command, a Celery task, a second
view — cannot accidentally bypass a check that only existed in a serializer.

**A projection scoped to the actor.** Three serializers over one `Booking`, so a Partner cannot
be handed a sibling unit or a Customer's address by a conditional that was got wrong.

## Why `PermissionError` is translated here

The domain layer raises plain `PermissionError` for "this Booking belongs to someone else",
because it is not an HTTP layer and should not import DRF exceptions. `_forbidden` turns that
into a `403` with safe copy at the boundary. The alternative — letting it escape as a 500 —
would leak the difference between "not yours" and "does not exist" through the error type.

## Where to look

The views are split by the audience each one answers to — the same seam `urls.py` cuts its three
route prefixes along. Every name below is re-exported here, so `apps.fulfilment.views.Anything`
still resolves and `urls.py` needs no edit:

* `base` — the shared spine: the tag and 4xx response map, the idempotency-key and actor
  resolution helpers, `_forbidden`, the three actor-scoped projections and `_PartnerCommandView`.
  Imports no sibling.
* `customer` — the Customer's own visit (read, cancel, reschedule, start OTP, amendment
  decisions, completion confirm/dispute, quality dispute) and the group-wide commands.
* `partner` — the Partner's physical work: the work shelf and its pagination, the detail read,
  the six state commands, propose amendment, submit completion, contact attempts and evidence.
* `operations` — the three `Operations`-tagged views, including the step-up-gated assisted start.
"""

from .base import (
    _ERRORS_4XX,
    FULFILMENT_TAG,
    _amendment_projection,
    _booking_queryset,
    _customer_booking,
    _customer_projection,
    _forbidden,
    _operations_projection,
    _partner_booking,
    _partner_profile,
    _partner_projection,
    _PartnerCommandView,
    _replayable,
    _required_key,
)
from .customer import (
    BookedGroupAddressChangeView,
    BookedGroupCancelView,
    BookedGroupRescheduleView,
    CustomerAmendmentApproveView,
    CustomerAmendmentDecisionView,
    CustomerAmendmentDeclineView,
    CustomerBookingCancelView,
    CustomerBookingDetailView,
    CustomerBookingRescheduleView,
    CustomerBookingRescheduleWindowsView,
    CustomerCompletionConfirmView,
    CustomerCompletionDisputeView,
    CustomerQualityDisputeView,
    CustomerStartOtpView,
    _owned_group,
)
from .operations import (
    OperationsAssistedStartView,
    OperationsBookingDetailView,
    OperationsRecoverBookingView,
)
from .partner import (
    _ACTIVE_HORIZON_DAYS,
    _PARTNER_BUCKETS,
    _PARTNER_TERMINAL_STATUSES,
    PartnerAbortView,
    PartnerActiveBookingCursorPagination,
    PartnerArrivedView,
    PartnerBookingCollectionView,
    PartnerBookingCursorPagination,
    PartnerBookingDetailView,
    PartnerContactAttemptView,
    PartnerCustomerUnavailableView,
    PartnerEnRouteView,
    PartnerEvidenceFinalizeView,
    PartnerEvidenceUploadView,
    PartnerProposeAmendmentView,
    PartnerReleaseView,
    PartnerStartOtpVerifyView,
    PartnerSubmitCompletionView,
)

__all__ = [
    "FULFILMENT_TAG",
    "_ACTIVE_HORIZON_DAYS",
    "_ERRORS_4XX",
    "_PARTNER_BUCKETS",
    "_PARTNER_TERMINAL_STATUSES",
    "BookedGroupAddressChangeView",
    "BookedGroupCancelView",
    "BookedGroupRescheduleView",
    "CustomerAmendmentApproveView",
    "CustomerAmendmentDecisionView",
    "CustomerAmendmentDeclineView",
    "CustomerBookingCancelView",
    "CustomerBookingDetailView",
    "CustomerBookingRescheduleView",
    "CustomerBookingRescheduleWindowsView",
    "CustomerCompletionConfirmView",
    "CustomerCompletionDisputeView",
    "CustomerQualityDisputeView",
    "CustomerStartOtpView",
    "OperationsAssistedStartView",
    "OperationsBookingDetailView",
    "OperationsRecoverBookingView",
    "PartnerAbortView",
    "PartnerActiveBookingCursorPagination",
    "PartnerArrivedView",
    "PartnerBookingCollectionView",
    "PartnerBookingCursorPagination",
    "PartnerBookingDetailView",
    "PartnerContactAttemptView",
    "PartnerCustomerUnavailableView",
    "PartnerEnRouteView",
    "PartnerEvidenceFinalizeView",
    "PartnerEvidenceUploadView",
    "PartnerProposeAmendmentView",
    "PartnerReleaseView",
    "PartnerStartOtpVerifyView",
    "PartnerSubmitCompletionView",
    "_PartnerCommandView",
    "_amendment_projection",
    "_booking_queryset",
    "_customer_booking",
    "_customer_projection",
    "_forbidden",
    "_operations_projection",
    "_owned_group",
    "_partner_booking",
    "_partner_profile",
    "_partner_projection",
    "_replayable",
    "_required_key",
]
