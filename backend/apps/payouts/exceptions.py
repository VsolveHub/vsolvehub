"""Stable API failures for ledger and payout commands."""

from rest_framework import status
from rest_framework.exceptions import APIException


class PayoutBatchInvalidApiError(APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_code = "payout_batch_invalid"
    error_code = "payout_batch_invalid"
    retryable = False

    def __init__(self, *, reason: str) -> None:
        super().__init__(detail=reason, code=self.default_code)


class PayoutBatchConflictApiError(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "payout_batch_version_conflict"
    error_code = "payout_batch_version_conflict"
    safe_message = "This payout batch changed since it was read. Refresh and try again."
    retryable = True

    def __init__(self, *, current_version: int) -> None:
        super().__init__(detail=self.safe_message, code=self.default_code)
        self.api_details: dict[str, object] = {"current_version": current_version}


class SelfApprovalDeniedApiError(APIException):
    """Maker-checker, refused at the boundary.

    Distinct from a generic 403 because the caller is authorized — they simply may not be both
    parties. Telling them that is what lets them route it to a colleague instead of filing a
    permissions bug.
    """

    status_code = status.HTTP_403_FORBIDDEN
    default_code = "self_approval_denied"
    error_code = "self_approval_denied"
    safe_message = (
        "A payout batch must be approved by someone other than the person who proposed it."
    )
    retryable = False


class LedgerEntryNotPayableApiError(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "ledger_entry_not_payable"
    error_code = "ledger_entry_not_payable"
    safe_message = "This ledger entry cannot be paid right now."
    retryable = False

    def __init__(self, *, current_status: str) -> None:
        super().__init__(detail=self.safe_message, code=self.default_code)
        self.api_details: dict[str, object] = {"current_status": current_status}


class CaseInvalidApiError(APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_code = "operations_case_invalid"
    error_code = "operations_case_invalid"
    retryable = False

    def __init__(self, *, reason: str) -> None:
        super().__init__(detail=reason, code=self.default_code)


class CaseConflictApiError(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "operations_case_version_conflict"
    error_code = "operations_case_version_conflict"
    safe_message = "This case changed since it was read. Refresh and try again."
    retryable = True

    def __init__(self, *, current_version: int) -> None:
        super().__init__(detail=self.safe_message, code=self.default_code)
        self.api_details: dict[str, object] = {"current_version": current_version}
