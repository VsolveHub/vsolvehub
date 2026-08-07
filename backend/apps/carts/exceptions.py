"""Stable API failures for Customer booking decisions."""

from typing import Any

from rest_framework import status
from rest_framework.exceptions import APIException


class CartItemLimitReachedApiError(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "cart_item_limit_reached"
    error_code = "cart_item_limit_reached"
    safe_message = "Your booking already contains a different service."

    def __init__(self, *, existing_item: dict[str, Any]) -> None:
        self.api_details = {
            "existing_item": existing_item,
            "confirmation_required": "replace_existing",
        }
        super().__init__(
            detail=self.safe_message,
            code=self.default_code,
        )


class WindowNoLongerAvailableApiError(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "window_no_longer_available"
    error_code = "window_no_longer_available"
    safe_message = (
        "That arrival window is no longer available. Refresh the windows and choose again."
    )


class QuoteExpiredApiError(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "quote_expired"
    error_code = "quote_expired"
    safe_message = "This quote expired. Review a fresh quote before continuing."


class CartVersionConflictApiError(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "cart_version_conflict"
    error_code = "cart_version_conflict"
    safe_message = "Your cart changed. Review the latest cart before trying again."

    def __init__(self, *, current_version: int, conflicting_field: str | None = None) -> None:
        # The recovery for both optimistic guards is the same refetch, so they share one
        # code.  `conflicting_field` still names which expectation moved, so a surface
        # can say whether the cart or that one row changed instead of guessing.
        self.api_details = {
            "current_version": current_version,
            "conflicting_field": conflicting_field,
        }
        super().__init__(detail=self.safe_message, code=self.default_code)


class CartItemNotFoundApiError(APIException):
    """The addressed cart row is not an active row of the caller's own cart.

    Removed, never-existing and someone else's item ids answer identically on
    purpose.  Distinguishing them would turn the removal command into an oracle
    for whether an id exists in another Customer's cart, and the caller's
    recovery — refetch the cart and show the service as already gone — is the
    same in every case.  It is a 409 rather than a 404 because the caller sent an
    `expected_item_version` that no live row can satisfy.
    """

    status_code = status.HTTP_409_CONFLICT
    default_code = "cart_item_not_found"
    error_code = "cart_item_not_found"
    safe_message = "That service is no longer in your booking."
    retryable = False


class DuplicateCartItemApiError(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "duplicate_cart_item"
    error_code = "duplicate_cart_item"
    safe_message = "That exact service request is already in your cart."

    def __init__(self, *, existing_item_id: str, current_version: int) -> None:
        self.api_details = {
            "existing_item_id": existing_item_id,
            "current_version": current_version,
            "recovery": "update_existing_item",
        }
        super().__init__(detail=self.safe_message, code=self.default_code)


class CartMergeConflictApiError(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "cart_merge_conflict"
    error_code = "cart_merge_conflict"
    safe_message = "Review the overlapping service requests before merging your carts."

    def __init__(
        self,
        *,
        customer_cart_version: int,
        session_cart_version: int,
        conflicts: list[dict[str, object]],
    ) -> None:
        self.api_details = {
            "customer_cart_version": customer_cart_version,
            "session_cart_version": session_cart_version,
            "conflicts": conflicts,
            "allowed_actions": ["KEEP_CUSTOMER", "KEEP_SESSION", "KEEP_BOTH"],
        }
        super().__init__(detail=self.safe_message, code=self.default_code)


class FulfilmentPlanStaleApiError(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "fulfilment_plan_stale"
    error_code = "fulfilment_plan_stale"
    safe_message = (
        "This fulfilment plan is no longer current. Review new options before continuing."
    )


class BookingWindowGroupRequiredApiError(APIException):
    """The cart makes more than one visit, so a single ungrouped grid is ambiguous.

    Refused rather than defaulting to the first visit — that is the exact bug this
    endpoint exists to fix (spec 2026-08-07-work-based-slot-booking-design.md §9):
    a multi-visit cart silently reusing one visit's duration and skill set for
    every visit's grid.
    """

    status_code = status.HTTP_400_BAD_REQUEST
    default_code = "booking_window_group_required"
    error_code = "booking_window_group_required"
    safe_message = (
        "This booking has more than one visit. Choose which visit's arrival windows to show."
    )

    def __init__(self, *, group_keys: list[str]) -> None:
        self.api_details = {"group_keys": group_keys}
        super().__init__(detail=self.safe_message, code=self.default_code)


class SchedulingGroupsChangedApiError(APIException):
    """The visits the Customer picked times for are not the visits this cart makes now.

    Refused rather than repaired. Re-deriving the grouping and reassigning the
    chosen times would move a visit to a slot the Customer never agreed to — the
    two services they scheduled separately could silently become one, or a time
    picked for the electrician could land on the salon. Asking again is the only
    honest recovery, and the client refetches the grouping to do it.
    """

    status_code = status.HTTP_409_CONFLICT
    default_code = "scheduling_groups_changed"
    error_code = "scheduling_groups_changed"
    safe_message = (
        "Your cart changed, so the visits you picked times for no longer match. "
        "Nothing has been booked. Choose your times again."
    )


class FulfilmentPlanUnavailableApiError(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "fulfilment_plan_unavailable"
    error_code = "fulfilment_plan_unavailable"
    safe_message = "No safe fulfilment plan is currently available for every cart item."

    def __init__(self, *, reasons: list[dict[str, object]]) -> None:
        self.api_details = {"item_failures": reasons}
        super().__init__(detail=self.safe_message, code=self.default_code)


class CompatibilityRuleConflictApiError(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "compatibility_rule_conflict"
    error_code = "compatibility_rule_conflict"
    safe_message = "The compatibility rule changed. Review the latest rule before continuing."

    def __init__(self, *, reason: str, current_version: int | None = None) -> None:
        self.api_details = {"reason": reason, "current_version": current_version}
        super().__init__(detail=self.safe_message, code=self.default_code)


class CompatibilityRuleActivationApiError(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "compatibility_rule_activation_invalid"
    error_code = "compatibility_rule_activation_invalid"
    safe_message = "This compatibility rule cannot be activated safely."

    def __init__(self, *, reason: str) -> None:
        self.api_details = {"reason": reason}
        super().__init__(detail=self.safe_message, code=self.default_code)


class BookingGroupConflictApiError(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "booking_group_conflict"
    error_code = "booking_group_conflict"
    safe_message = "The Booking Group changed. Review its current state before continuing."

    def __init__(self, *, reason: str, current_version: int) -> None:
        self.api_details = {"reason": reason, "current_version": current_version}
        super().__init__(detail=self.safe_message, code=self.default_code)
