from rest_framework import status
from rest_framework.exceptions import APIException


class GeocodingUnavailableApiError(APIException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = "Location lookup is temporarily unavailable. Enter the address manually."
    default_code = "geocoding_unavailable"


class AddressArchivedApiError(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "This address has already been removed."
    default_code = "address_archived"
