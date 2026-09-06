"""Rental domain exceptions."""


class RentalError(Exception):
    """Base exception for rental operations."""

    pass


class AssetUnavailableError(RentalError):
    """Raised when an asset is already booked, under maintenance, or pool capacity exhausted."""

    pass


class InvalidRentalStateTransitionError(RentalError):
    """Raised when attempting an invalid status transition on a booking or deposit."""

    pass


class RentalAuthorizationError(RentalError):
    """Raised when an actor is not authorized to act on an asset or booking."""

    pass
