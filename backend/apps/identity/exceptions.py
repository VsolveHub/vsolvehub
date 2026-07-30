"""Identity API errors with stable machine-readable codes."""

from rest_framework import status
from rest_framework.exceptions import APIException


class OtpUnavailableApiError(APIException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = "OTP delivery is temporarily unavailable."
    default_code = "otp_unavailable"


class InvalidOtpApiError(APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = "The code is invalid or expired."
    default_code = "invalid_otp"
