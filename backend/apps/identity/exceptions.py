"""Identity API errors with stable machine-readable codes."""

from rest_framework import status
from rest_framework.exceptions import APIException, Throttled


class OtpThrottled(Throttled):
    safe_message = "Too many code requests. Try again when the countdown ends."


class OtpUnavailableApiError(APIException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = "OTP delivery is temporarily unavailable."
    default_code = "otp_unavailable"


class InvalidOtpApiError(APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = "The code is invalid or expired."
    default_code = "invalid_otp"


class NoAccountForRoleApiError(APIException):
    status_code = status.HTTP_404_NOT_FOUND
    default_detail = "No account with that role exists for this number."
    default_code = "no_account_for_role"
