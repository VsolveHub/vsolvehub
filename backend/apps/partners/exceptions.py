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


# ---------------------------------------------------------------------------
# M2 capability failures. Codes are fixed by
# Django_Next.js_Plan/M2/07-state-machines-and-permissions.md section 8.
# ---------------------------------------------------------------------------


class CapabilityNotApprovedError(PartnerDomainError):
    def __init__(self, message: str = "") -> None:
        super().__init__(
            code="m2_capability_not_approved",
            message=message
            or "This work needs an approved capability. Apply for it from your profile.",
            status_code=403,
        )


class CapabilitySuspendedError(PartnerDomainError):
    def __init__(self, message: str = "") -> None:
        super().__init__(
            code="m2_capability_suspended",
            message=message or "This capability is suspended. Support can explain what to fix.",
            status_code=403,
        )


class KycRequiredError(PartnerDomainError):
    def __init__(self) -> None:
        super().__init__(
            code="m2_kyc_required",
            message="Verify your identity and business details before accepting work.",
            status_code=403,
        )


class PayoutDetailsRequiredError(PartnerDomainError):
    def __init__(self) -> None:
        super().__init__(
            code="m2_payout_details_required",
            message="Add your bank details before you can be paid.",
            status_code=403,
        )


class CrewRosterRequiredError(PartnerDomainError):
    def __init__(self) -> None:
        super().__init__(
            code="m2_crew_roster_required",
            message="Add at least one crew member before assigning a team.",
            status_code=403,
        )


class CrewConflictError(PartnerDomainError):
    def __init__(self, message: str) -> None:
        super().__init__(
            code="m2_crew_conflict",
            message=message,
            status_code=409,
        )


class CrewGenderConflictError(PartnerDomainError):
    """Two agencies have recorded different genders for the same person.

    `CrewMember` is one row per person across every agency that has registered them, so this field
    is shared. First write wins and a contradicting write is refused, rather than the second agency
    silently flipping the first one's roster -- which would change who the first agency is eligible
    to be dispatched for, without them touching anything.

    A refusal rather than a merge because there is no version of this the server can decide: one of
    the two agencies is wrong, and only a person can say which.
    """

    def __init__(self, name: str, recorded: str) -> None:
        super().__init__(
            code="m2_crew_gender_conflict",
            message=(
                f"Vsolve already has {name} recorded as {recorded.lower()}, from another agency's "
                "crew list. Contact support if that is wrong."
            ),
            status_code=409,
        )


class LifecycleNotSupportedError(PartnerDomainError):
    def __init__(self, message: str) -> None:
        super().__init__(
            code="m2_lifecycle_not_supported",
            message=message,
            status_code=400,
        )


class WageFloorError(PartnerDomainError):
    def __init__(self, message: str) -> None:
        super().__init__(
            code="m2_proposal_below_wage_floor",
            message=message,
            status_code=400,
        )


class WageFloorUnsetError(PartnerDomainError):
    """No floor is loaded for this state and skill.

    Fails closed rather than guessing. ADR-0007 forbids baking a policy default
    into code while the owner decision is open.
    """

    def __init__(self) -> None:
        super().__init__(
            code="m2_wage_floor_unavailable",
            message="We cannot check the minimum wage for this work yet. Support can help.",
            status_code=409,
        )


class CapabilityTransitionError(PartnerDomainError):
    def __init__(self, message: str) -> None:
        super().__init__(
            code="m2_capability_transition_not_allowed",
            message=message,
            status_code=409,
        )


class CapabilityAlreadyRequestedError(CapabilityTransitionError):
    """A live request already exists for this variant.

    A subclass rather than a sibling: it *is* a refused transition, so anything catching
    `CapabilityTransitionError` keeps working, and the distinct code exists because the recovery is
    different. "Look at the request you already have" and "that move is not allowed" send a Partner
    to two different places, and a generic transition error sends them to neither.
    """

    def __init__(self) -> None:
        PartnerDomainError.__init__(
            self,
            code="m2_capability_already_requested",
            message="You already have a live request for this service. Open it to see its status.",
            status_code=409,
        )


class BusinessTypeInvalidError(PartnerDomainError):
    """A business profile that the model's own check constraints would refuse.

    Caught in the domain rather than left to `IntegrityError` so the Partner is told which field is
    wrong. `partners_individual_has_no_registration_number` and
    `partners_gstin_requires_gst_registered` are the two constraints this fronts.
    """

    def __init__(self, message: str, *, field: str) -> None:
        super().__init__(
            code="m2_business_type_invalid",
            message=message,
            status_code=400,
        )
        self.field = field
