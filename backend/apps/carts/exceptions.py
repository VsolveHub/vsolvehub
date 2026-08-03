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

    def __init__(self, *, current_version: int) -> None:
        self.api_details = {"current_version": current_version}
        super().__init__(detail=self.safe_message, code=self.default_code)


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
