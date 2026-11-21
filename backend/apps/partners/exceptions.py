"""Partner domain failures with stable API-facing codes."""

import uuid
from collections.abc import Mapping, Sequence
from typing import Any


class PartnerDomainError(RuntimeError):
    def __init__(
        self,
        *,
        code: str,
        message: str,
        status_code: int,
        retryable: bool = False,
        api_details: Mapping[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.retryable = retryable
        self.api_details = api_details


class PartnerServiceAreasUnavailableError(PartnerDomainError):
    def __init__(self, unavailable_area_ids: Sequence[uuid.UUID | str]) -> None:
        super().__init__(
            code="partner_service_areas_unavailable",
            message="One or more selected service areas are unavailable.",
            status_code=409,
            api_details={
                "unavailable_service_area_ids": [str(uid) for uid in unavailable_area_ids],
            },
        )


class PostalCodeInOtherAreaError(PartnerDomainError):
    def __init__(self, postal_code: str, area_id: uuid.UUID | str, area_name: str) -> None:
        super().__init__(
            code="postal_code_in_other_area",
            message=f"PIN {postal_code} is already assigned to {area_name}.",
            status_code=409,
            api_details={
                "postal_code": postal_code,
                "area_id": str(area_id),
                "area_name": area_name,
            },
        )


class PostalCodeNotFoundError(PartnerDomainError):
    def __init__(self, postal_code: str) -> None:
        super().__init__(
            code="postal_code_not_found",
            message=f"PIN {postal_code} not found. City and state are required.",
            status_code=400,
            api_details={"postal_code": postal_code},
        )


class ServiceAreaNotFoundError(PartnerDomainError):
    def __init__(self) -> None:
        super().__init__(
            code="service_area_not_found",
            message="Service area not found.",
            status_code=404,
        )


class PartnerNoScheduleToCopyError(PartnerDomainError):
    def __init__(self) -> None:
        super().__init__(
            code="partner_no_schedule_to_copy",
            message="Partner has no existing schedule rules to copy.",
            status_code=400,
        )


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


class EmployerTrackRequiredError(PartnerDomainError):
    def __init__(self) -> None:
        super().__init__(
            code="employer_track_required",
            message="Employer details can only be saved on a hire-staff application.",
            status_code=409,
        )


class EmployerDetailError(PartnerDomainError):
    """An employer detail that cannot be saved, naming the field it belongs to."""

    def __init__(self, message: str, *, field: str, code: str) -> None:
        super().__init__(code=code, message=message, status_code=400)
        self.field = field


class EmployerCheckError(PartnerDomainError):
    def __init__(self, message: str, *, code: str) -> None:
        super().__init__(code=code, message=message, status_code=400)


class EmployerChecksIncompleteError(PartnerDomainError):
    """Approval refused: an employer's review checklist is not fully passed."""

    def __init__(self, missing_codes: Sequence[str]) -> None:
        super().__init__(
            code="employer_checks_incomplete",
            message="Finish the checklist first.",
            status_code=409,
        )
        self.api_details = {"missing_codes": list(missing_codes)}


class PartnerDocumentUploadError(PartnerDomainError):
    def __init__(self, message: str, *, retryable: bool = False, code: str = "") -> None:
        super().__init__(
            code=code
            or (
                "partner_document_upload_unavailable"
                if retryable
                else "partner_document_upload_invalid"
            ),
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


class CrewDocumentError(PartnerDomainError):
    """A crew identity document could not be accepted, reviewed, or replaced.

    `400` rather than `409`: every case here is something the Partner or reviewer can fix by
    sending a different request — a wrong media type, an expired signed upload, a file that did
    not match what was declared, a rejection with no reason. Nothing in it is a race with another
    actor, which is what a `409` would claim.
    """

    def __init__(self, message: str) -> None:
        super().__init__(
            code="m2_crew_document_rejected",
            message=message,
            status_code=400,
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


class PartnerAccessDeniedError(PartnerDomainError):
    def __init__(self, message: str = "Access denied.") -> None:
        super().__init__(
            code="partner_access_denied",
            message=message,
            status_code=403,
        )


class PartnerPushSubscriptionConflictError(PartnerDomainError):
    def __init__(self, message: str = "Subscription conflict.") -> None:
        super().__init__(
            code="partner_push_subscription_conflict",
            message=message,
            status_code=409,
        )
