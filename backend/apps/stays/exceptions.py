"""Stay domain exceptions."""


class StayError(Exception):
    """Base exception for stay operations."""


class UnitUnavailableError(StayError):
    """Raised when no room/unit is vacant for the requested date range."""


class InvalidStayStateTransitionError(StayError):
    """Raised when attempting an invalid status transition on a stay reservation or deposit."""


class StayAuthorizationError(StayError):
    """Raised when an actor lacks permission to act on a property or reservation."""


class GuestPolicyViolationError(StayError):
    """Raised when booking violates max guest limits or mandatory ID rules."""
