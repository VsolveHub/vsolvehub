"""Stable API failures for Rides commands, rendered through the shared error envelope."""

from rest_framework import status
from rest_framework.exceptions import APIException


class RidesApiError(APIException):
    """A domain refusal with a stable ``code`` the apps can branch on."""

    default_code = "rides_error"
    error_code = "rides_error"
    retryable = False

    def __init__(self, *, code: str, message: str) -> None:
        self.error_code = code
        self.default_code = code
        self.safe_message = message
        super().__init__(detail=message, code=code)


class CaptainNotApprovedError(RidesApiError):
    status_code = status.HTTP_403_FORBIDDEN

    def __init__(
        self, message: str = "Your captain application can't be changed right now."
    ) -> None:
        super().__init__(code="captain_not_approved", message=message)


class PassRequiredError(RidesApiError):
    status_code = status.HTTP_403_FORBIDDEN

    def __init__(self) -> None:
        super().__init__(code="pass_required", message="Buy a pass to go on duty.")


class PassAlreadyActiveError(RidesApiError):
    status_code = status.HTTP_409_CONFLICT

    def __init__(self) -> None:
        super().__init__(
            code="pass_already_active",
            message="You already have an active pass. Buy the next one when it ends.",
        )


class PassPurchasePendingError(RidesApiError):
    status_code = status.HTTP_409_CONFLICT

    def __init__(self) -> None:
        super().__init__(
            code="pass_purchase_pending", message="Your last pass payment is still going through."
        )


class AreaNotServedError(RidesApiError):
    status_code = status.HTTP_422_UNPROCESSABLE_ENTITY

    def __init__(self) -> None:
        super().__init__(code="area_not_served", message="Rides aren't available here yet.")


class RoutingUnavailableApiError(RidesApiError):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    retryable = True

    def __init__(self) -> None:
        super().__init__(
            code="routing_unavailable",
            message="We couldn't work out this trip right now. Please try again.",
        )


class NotOnDutyError(RidesApiError):
    """A ping from a captain the server has taken off duty: the app stops and says so."""

    status_code = status.HTTP_409_CONFLICT

    def __init__(self) -> None:
        super().__init__(code="not_on_duty", message="You're off duty. Go on duty to get rides.")


class LocationStaleError(RidesApiError):
    status_code = status.HTTP_422_UNPROCESSABLE_ENTITY

    def __init__(self, message: str = "This location is too old to use.") -> None:
        super().__init__(code="location_stale", message=message)


class LocationUnavailableError(RidesApiError):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    retryable = True

    def __init__(self) -> None:
        super().__init__(
            code="location_unavailable",
            message="We couldn't save your location right now. It will retry.",
        )


class RateCardExistsError(RidesApiError):
    status_code = status.HTTP_409_CONFLICT

    def __init__(self) -> None:
        super().__init__(
            code="rate_card_exists",
            message="This area already has an active card for this vehicle. Edit that card.",
        )


class RateCardInactiveError(RidesApiError):
    status_code = status.HTTP_409_CONFLICT

    def __init__(self) -> None:
        super().__init__(
            code="rate_card_inactive",
            message="Only the active card can be changed. Create a new card instead.",
        )


class QuoteExpiredError(RidesApiError):
    status_code = status.HTTP_422_UNPROCESSABLE_ENTITY

    def __init__(self) -> None:
        super().__init__(
            code="quote_expired", message="This price has expired. Check the fares again."
        )


class QuoteUsedError(RidesApiError):
    status_code = status.HTTP_409_CONFLICT

    def __init__(self) -> None:
        super().__init__(
            code="quote_used", message="This price was already used. Check the fares again."
        )


class VehicleUnavailableError(RidesApiError):
    status_code = status.HTTP_422_UNPROCESSABLE_ENTITY

    def __init__(self) -> None:
        super().__init__(
            code="vehicle_unavailable",
            message="This vehicle type can't be booked here right now.",
        )


class RideAlreadyOpenError(RidesApiError):
    status_code = status.HTTP_409_CONFLICT

    def __init__(self) -> None:
        super().__init__(code="ride_already_open", message="You already have a ride in progress.")


class RideNoLongerAvailableError(RidesApiError):
    status_code = status.HTTP_409_CONFLICT

    def __init__(self) -> None:
        super().__init__(
            code="ride_no_longer_available", message="This ride is no longer available."
        )


class RegistrationAlreadyUsedError(RidesApiError):
    status_code = status.HTTP_409_CONFLICT

    def __init__(self) -> None:
        super().__init__(
            code="registration_already_used",
            message="This registration number is already registered to another captain.",
        )
