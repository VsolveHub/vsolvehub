"""Identity API errors with stable machine-readable codes."""

from rest_framework import status
from rest_framework.exceptions import APIException, Throttled


class OtpThrottled(Throttled):
    safe_message = "Too many code requests. Try again when the countdown ends."


class OtpUnavailableApiError(APIException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = "OTP delivery is temporarily unavailable."
    default_code = "otp_unavailable"


class StepUpIdentityMismatchApiError(APIException):
    """The confirmation was for a number other than the signed-in person's own.

    Its own code so the console can say so, instead of calling a correct code wrong.
    """

    status_code = status.HTTP_403_FORBIDDEN
    default_detail = (
        "That confirmation was for a different phone number. Confirm with the number you "
        "signed in with."
    )
    default_code = "step_up_identity_mismatch"


class InvalidOtpApiError(APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = "The code is invalid or expired."
    default_code = "invalid_otp"


class AccountBlockedApiError(APIException):
    status_code = status.HTTP_403_FORBIDDEN
    default_detail = "This account is blocked. Contact Vsolve support."
    default_code = "account_blocked"


class AccountDeletionRefusedApiError(APIException):
    """A deletion request that cannot be filed yet, for a reason the person can act on."""

    status_code = status.HTTP_409_CONFLICT
    default_detail = "Your account cannot be deleted yet."
    default_code = "account_deletion_refused"


class AccountDeletionHeldApiError(APIException):
    """Erasure refused while something is unsettled. The detail lists what."""

    status_code = status.HTTP_409_CONFLICT
    default_detail = "This account cannot be erased yet."
    default_code = "account_deletion_held"


class NoAccountForRoleApiError(APIException):
    status_code = status.HTTP_404_NOT_FOUND
    default_detail = "No account with that role exists for this number."
    default_code = "no_account_for_role"
