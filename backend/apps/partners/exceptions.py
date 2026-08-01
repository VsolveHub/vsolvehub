"""Partner domain failures with stable API-facing codes."""

import uuid


class PartnerDomainError(RuntimeError):
    def __init__(
        self,
        *,
        code: str,
        message: str,
        status_code: int,
        retryable: bool = False,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.retryable = retryable


class PartnerApplicationNotFoundError(PartnerDomainError):
    def __init__(self) -> None:
        super().__init__(
            code="partner_application_not_found",
            message="Start your Partner application before using this feature.",
            status_code=404,
        )


class PartnerVersionConflictError(PartnerDomainError):
    def __init__(self) -> None:
        super().__init__(
            code="partner_application_version_conflict",
            message="This application changed in another session. Refresh and try again.",
            status_code=409,
            retryable=True,
        )


class PartnerTransitionError(PartnerDomainError):
    def __init__(self, message: str) -> None:
        super().__init__(
            code="partner_transition_not_allowed",
            message=message,
            status_code=409,
        )


class PartnerApplicationIncompleteError(PartnerDomainError):
    def __init__(self, message: str) -> None:
        super().__init__(
            code="partner_application_incomplete",
            message=message,
            status_code=409,
        )


class PartnerDocumentUploadError(PartnerDomainError):
    def __init__(self, message: str, *, retryable: bool = False) -> None:
        super().__init__(
            code="partner_document_upload_unavailable"
            if retryable
            else "partner_document_upload_invalid",
            message=message,
            status_code=503 if retryable else 409,
            retryable=retryable,
        )


class PartnerReviewOwnershipError(PartnerDomainError):
    def __init__(self, message: str) -> None:
        super().__init__(
            code="partner_review_ownership_conflict",
            message=message,
            status_code=409,
        )


class PartnerSelfReviewError(PartnerDomainError):
    def __init__(self, *, object_type: str, object_id: uuid.UUID) -> None:
        super().__init__(
            code="partner_self_review_forbidden",
            message="You cannot review your own Partner record.",
            status_code=403,
        )
        self.object_type = object_type
        self.object_id = object_id


class PartnerEligibilityError(PartnerDomainError):
    def __init__(self, message: str) -> None:
        super().__init__(
            code="partner_not_operationally_eligible",
            message=message,
            status_code=403,
        )


class PartnerPresenceError(PartnerDomainError):
    def __init__(self, message: str, *, retryable: bool = False) -> None:
        super().__init__(
            code="partner_presence_unavailable" if retryable else "partner_presence_invalid",
            message=message,
            status_code=503 if retryable else 409,
            retryable=retryable,
        )


class PartnerScheduleError(PartnerDomainError):
    def __init__(self, message: str) -> None:
        super().__init__(
            code="partner_schedule_invalid",
            message=message,
            status_code=400,
        )
