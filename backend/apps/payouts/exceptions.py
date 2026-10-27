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


class PayoutAccountsUnavailableApiError(APIException):
    """No payout provider is configured, so a bank account has nowhere to be registered.

    Refused rather than saved locally: the full account number is only ever held by the provider,
    so an account accepted without one could never be paid into and would have to be re-entered.
    """

    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_code = "payout_accounts_unavailable"
    error_code = "payout_accounts_unavailable"
    safe_message = "Bank accounts cannot be added right now. Nothing was saved."
    retryable = False


class PayoutAccountProviderApiError(APIException):
    """The provider did not answer conclusively. Registering again is safe: RazorpayX returns the
    existing contact and fund account for the same details rather than creating duplicates."""

    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_code = "payout_account_provider_unavailable"
    error_code = "payout_account_provider_unavailable"
    safe_message = "We could not reach our payout partner. Nothing was saved. Please try again."
    retryable = True


class PayoutAccountRejectedApiError(APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_code = "payout_account_rejected"
    error_code = "payout_account_rejected"
    safe_message = "These bank details were not accepted. Check the account number and IFSC."
    retryable = False


class PayoutAccountReviewInvalidApiError(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "payout_account_review_invalid"
    error_code = "payout_account_review_invalid"
    retryable = False

    def __init__(self, *, reason: str) -> None:
        super().__init__(detail=reason, code=self.default_code)


class PayoutAccountSelfReviewApiError(APIException):
    """Maker-checker for the account itself: whoever registered it cannot also approve it."""

    status_code = status.HTTP_403_FORBIDDEN
    default_code = "payout_account_self_review"
    error_code = "payout_account_self_review"
    safe_message = (
        "A payout account must be reviewed by someone other than the person who added it."
    )
    retryable = False


class WithdrawalRefusedApiError(APIException):
    """A Withdraw tap the rules do not allow right now.

    One error with a `reason` rather than one class per rule: the Partner app shows the message
    as given, and branches on the reason only to offer the next step (add a bank account, wait).
    """

    status_code = status.HTTP_409_CONFLICT
    default_code = "withdrawal_refused"
    error_code = "withdrawal_refused"
    retryable = False

    def __init__(self, *, reason: str, message: str) -> None:
        super().__init__(detail=message, code=self.default_code)
        self.safe_message = message
        self.api_details: dict[str, object] = {"reason": reason}


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
