"""Requirement domain failures.

Codes are fixed by Django_Next.js_Plan/M2/07-state-machines-and-permissions.md section 8 and use
the same shape as `apps.partners.exceptions.PartnerDomainError`, so `common/errors/handler.py`
renders them without a second envelope.
"""


class RequirementDomainError(RuntimeError):
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


class RequirementNotFoundError(RequirementDomainError):
    def __init__(self) -> None:
        super().__init__(
            code="m2_requirement_not_found",
            message="We could not find that request.",
            status_code=404,
        )


class RequirementExpiredError(RequirementDomainError):
    def __init__(self) -> None:
        super().__init__(
            code="m2_requirement_expired",
            message="The date you needed this by has passed, so we closed the request.",
            status_code=409,
        )


class RequirementLockedError(RequirementDomainError):
    def __init__(self, message: str) -> None:
        super().__init__(
            code="m2_requirement_locked",
            message=message,
            status_code=409,
        )


class RequirementDuplicateError(RequirementDomainError):
    def __init__(self, *, existing_id: object) -> None:
        super().__init__(
            code="m2_requirement_duplicate",
            message="You already have an open request for this work. Open it or merge them.",
            status_code=409,
        )
        self.existing_id = existing_id


class RequirementIncompleteError(RequirementDomainError):
    def __init__(self, message: str) -> None:
        super().__init__(
            code="m2_requirement_incomplete",
            message=message,
            status_code=400,
        )


class LifecycleNotSupportedError(RequirementDomainError):
    def __init__(self, message: str) -> None:
        super().__init__(
            code="m2_lifecycle_not_supported",
            message=message,
            status_code=400,
        )


class RequirementTransitionError(RequirementDomainError):
    def __init__(self, message: str) -> None:
        super().__init__(
            code="m2_requirement_transition_not_allowed",
            message=message,
            status_code=409,
        )


class InvitationExpiredError(RequirementDomainError):
    def __init__(self) -> None:
        super().__init__(
            code="m2_invitation_expired",
            message="The time to respond to this enquiry has passed.",
            status_code=409,
        )


class InvitationTransitionError(RequirementDomainError):
    def __init__(self, message: str) -> None:
        super().__init__(
            code="m2_invitation_transition_not_allowed",
            message=message,
            status_code=409,
        )


class QuoteSlotsExhaustedError(RequirementDomainError):
    def __init__(self) -> None:
        super().__init__(
            code="m2_invitation_slots_exhausted",
            message="Another vendor took the last quote slot for this request.",
            status_code=409,
        )


class QuoteSlotConflictError(RequirementDomainError):
    def __init__(self) -> None:
        super().__init__(
            code="m2_proposal_slot_conflict",
            message="A linked account already holds a quote slot for this request.",
            status_code=409,
        )


class ProposalShapeError(RequirementDomainError):
    def __init__(self, message: str) -> None:
        super().__init__(
            code="m2_proposal_invalid_shape",
            message=message,
            status_code=400,
        )


class ProposalNotSelectableError(RequirementDomainError):
    def __init__(self, message: str) -> None:
        super().__init__(
            code="m2_proposal_not_selectable",
            message=message,
            status_code=409,
        )


class AttachmentRejectedError(RequirementDomainError):
    def __init__(self, message: str, *, retryable: bool = False) -> None:
        super().__init__(
            code="m2_attachment_unavailable" if retryable else "m2_attachment_invalid",
            message=message,
            status_code=503 if retryable else 400,
            retryable=retryable,
        )
