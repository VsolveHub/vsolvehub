"""Stable API failures for the Careers/Jobs listing engine.

The listings surface answered domain refusals with a bare ``{"detail": ...}``
body. That is not the platform error envelope, so the browser client's
``parseErrorEnvelope`` rejected it and raised ``ApiContractError`` — "The server
returned an unexpected response (HTTP 400)" — which hides a clear, recoverable
refusal such as an already-submitted application.

Raising these instead lets ``common.errors.handler`` render the standard
envelope with a stable machine code and a safe, user-facing message.
"""

from rest_framework import status
from rest_framework.exceptions import APIException


class ListingApiError(APIException):
    """Base for listing refusals that must render the shared error envelope.

    DRF's ``APIException`` defaults ``detail`` to "A server error occurred.",
    which would put an alarming string in ``details.message``. Wiring ``detail``
    to ``safe_message`` keeps ``message`` and ``details.message`` consistent.
    """

    retryable = False
    safe_message = "Request failed."

    def __init__(self) -> None:
        super().__init__(detail=self.safe_message, code=self.default_code)


class ListingCapabilityRequiredApiError(ListingApiError):
    """The partner has no approved ``A10_LISTING`` capability (fail closed)."""

    status_code = status.HTTP_403_FORBIDDEN
    default_code = "listing_capability_required"
    error_code = "listing_capability_required"
    safe_message = "Your account is not approved to post or manage listings in this category."


class ListingIdempotencyKeyRequiredApiError(ListingApiError):
    status_code = status.HTTP_400_BAD_REQUEST
    default_code = "idempotency_key_required"
    error_code = "idempotency_key_required"
    safe_message = "This request must carry an Idempotency-Key header."


class ListingVariantRequiredApiError(ListingApiError):
    status_code = status.HTTP_400_BAD_REQUEST
    default_code = "listing_variant_required"
    error_code = "listing_variant_required"
    safe_message = "Choose a valid job category before creating a listing."


class ApplicationDuplicateApiError(ListingApiError):
    """One active application per applicant per listing (scenario M3-A10-05)."""

    status_code = status.HTTP_409_CONFLICT
    default_code = "application_duplicate"
    error_code = "application_duplicate"
    safe_message = "You have already applied to this listing. Track it under My Applications."


class ListingNotAcceptingApplicationsApiError(ListingApiError):
    status_code = status.HTTP_409_CONFLICT
    default_code = "listing_not_accepting_applications"
    error_code = "listing_not_accepting_applications"
    safe_message = "This listing is no longer accepting applications."


class ApplicationRateLimitApiError(ListingApiError):
    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    default_code = "application_rate_limited"
    error_code = "application_rate_limited"
    safe_message = "You have reached the application limit for now. Try again later."
    retryable = True


class ListingStateConflictApiError(ListingApiError):
    """A command refused because the listing is not in a state that allows it."""

    status_code = status.HTTP_409_CONFLICT
    default_code = "listing_state_conflict"
    error_code = "listing_state_conflict"

    def __init__(self, message: str) -> None:
        self.safe_message = message
        super().__init__()


class UnsupportedListingActionApiError(ListingApiError):
    status_code = status.HTTP_404_NOT_FOUND
    default_code = "unsupported_listing_action"
    error_code = "unsupported_listing_action"
    safe_message = "That action is not supported."


class ListingPlanCapApiError(ListingApiError):
    status_code = status.HTTP_409_CONFLICT
    default_code = "listing_plan_cap"
    error_code = "listing_plan_cap"
    safe_message = (
        "Active listing limit reached for the current plan. Please upgrade to publish more."
    )
