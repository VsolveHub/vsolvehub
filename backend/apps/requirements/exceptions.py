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


class CapacityUnavailableError(RequirementDomainError):
    """The vendor is already spoken for on the requested dates.

    Raised at acceptance rather than only at wave time, because the vendor's diary moves between
    the two. It covers both records that can hold them: M2's own `CapacityHold` from another
    enquiry, and the M1 `assignments.Reservation` an A1 booking sits on.
    """

    def __init__(self) -> None:
        super().__init__(
            code="m2_capacity_unavailable",
            message="You already have work booked on these dates.",
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


class UnsupportedChargeError(RequirementDomainError):
    def __init__(self, message: str = "") -> None:
        super().__init__(
            code="m2_unsupported_charge",
            message=message or "That charge is not supported.",
            status_code=400,
        )


class InstallmentMismatchError(RequirementDomainError):
    def __init__(self, message: str = "") -> None:
        super().__init__(
            code="m2_installment_mismatch",
            message=message or "The installments do not match the estimate amount.",
            status_code=400,
        )


class FinancialPolicyUnavailableError(RequirementDomainError):
    def __init__(self, message: str = "") -> None:
        super().__init__(
            code="m2_financial_policy_unavailable",
            message=message or "This estimate cannot be priced until Finance approves a policy.",
            status_code=409,
        )


class ProposalNotSelectableError(RequirementDomainError):
    def __init__(self, message: str) -> None:
        super().__init__(
            code="m2_proposal_not_selectable",
            message=message,
            status_code=409,
        )


class ProposalWindowClosedError(RequirementDomainError):
    """The Customer has already committed this request to another professional."""

    def __init__(self) -> None:
        super().__init__(
            code="m2_proposal_window_closed",
            message=(
                "The customer has already continued with another professional. "
                "Your proposal was not sent."
            ),
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


# ---------------------------------------------------------------------------
# P4 / revision 3: access, visits, selection and engagement.
#
# Two of these codes are not in `07-state-machines-and-permissions.md` §8 and are new here:
# `m2_access_price_unavailable` and `m2_policy_unavailable`. §9 of that document requires every
# owner-blocked value to be read from configuration and to **fail closed when unset**, and gives
# no code to fail closed with; these are it. They are deliberately two codes rather than one,
# because the recoveries differ — the first says Operations has not loaded a price, the second
# says a policy clock or rule was never decided — and because keeping money separate from process
# is what lets an alert on the first mean "we cannot sell anything".
# ---------------------------------------------------------------------------


class AccessPriceUnavailableError(RequirementDomainError):
    """No effective price is loaded for this access product.

    Fails closed rather than guessing. The A3 unlock price and the A5 tier prices, together with
    the per-slot split, are blocking owner decision 1; a code default would be a price nobody
    approved, charged to a real Customer, and indistinguishable afterwards from an approved one.
    """

    def __init__(self) -> None:
        super().__init__(
            code="m2_access_price_unavailable",
            message="We cannot price this yet. Support can help.",
            status_code=409,
        )


class PolicyUnavailableError(RequirementDomainError):
    """An owner-blocked policy value this action depends on has not been configured."""

    def __init__(self, message: str = "") -> None:
        super().__init__(
            code="m2_policy_unavailable",
            message=message or "We cannot complete this yet because a policy is not set.",
            status_code=409,
        )


class UnlockNotAvailableError(RequirementDomainError):
    def __init__(self, message: str = "") -> None:
        super().__init__(
            code="m2_unlock_not_available",
            message=message or "There is no quote to unlock yet.",
            status_code=409,
        )


class UnlockRequiredError(RequirementDomainError):
    def __init__(self) -> None:
        super().__init__(
            code="m2_unlock_required",
            message="Unlock the quotes to read and compare them.",
            status_code=403,
        )


class UnlockPaymentPendingError(RequirementDomainError):
    """The provider has not confirmed yet.

    A `409`, not the `202` the plan's first draft carried: proposal 0012's review settled that a
    refusal is always `>=400` and `202` is reserved for genuine acceptance carrying a projection.
    Retryable, because the answer really does change on its own.
    """

    def __init__(self) -> None:
        super().__init__(
            code="m2_unlock_payment_pending",
            message="We are waiting for your bank to confirm. This page updates itself.",
            status_code=409,
            retryable=True,
        )


class VisitPlanRequiredError(RequirementDomainError):
    def __init__(self, message: str = "") -> None:
        super().__init__(
            code="m2_visit_plan_required",
            message=message
            or "Choose how many professionals should visit before sending this request.",
            status_code=409,
        )


class VisitSlotTakenError(RequirementDomainError):
    def __init__(self) -> None:
        super().__init__(
            code="slot_taken",
            message="This visit was taken by another professional.",
            status_code=409,
        )


class VisitSlotExpiredError(RequirementDomainError):
    def __init__(self) -> None:
        super().__init__(
            code="slot_expired",
            message="That visit time expired. Refresh and choose again.",
            status_code=409,
        )


class NoProfessionalFoundError(RequirementDomainError):
    def __init__(self) -> None:
        super().__init__(
            code="no_professional_found",
            message="No professional is available for this slot. Nothing has been charged.",
            status_code=409,
        )


class VisitPlanNotChargeableError(RequirementDomainError):
    def __init__(self, message: str = "") -> None:
        super().__init__(
            code="m2_visit_plan_not_chargeable",
            message=message
            or "No vendor has confirmed a visit slot yet, so there is nothing to pay for.",
            status_code=409,
        )


class VisitPlanPaymentPendingError(RequirementDomainError):
    def __init__(self) -> None:
        super().__init__(
            code="m2_visit_plan_payment_pending",
            message="We are waiting for your bank to confirm your visit plan.",
            status_code=409,
            retryable=True,
        )


class VisitSlotUnavailableError(RequirementDomainError):
    """The grid slot is gone.

    Raised from the same availability grid the A1 checkout reads, which is what makes a visit and
    an A1 booking mutually exclusive rather than merely unlikely.
    """

    def __init__(self, message: str = "") -> None:
        super().__init__(
            code="m2_visit_slot_unavailable",
            message=message or "That time is no longer free. Pick another.",
            status_code=409,
        )


class VisitNotCompletedError(RequirementDomainError):
    def __init__(self, message: str = "") -> None:
        super().__init__(
            code="m2_visit_not_completed",
            message=message or "Complete the site visit before submitting an estimate.",
            status_code=409,
        )


class RejectionCapReachedError(RequirementDomainError):
    def __init__(self) -> None:
        super().__init__(
            code="m2_rejection_cap_reached",
            message="You have used every free replacement for this request. Support can help.",
            status_code=409,
        )


class SelectionConflictError(RequirementDomainError):
    def __init__(self, message: str = "") -> None:
        super().__init__(
            code="m2_selection_conflict",
            message=message or "This request already has a chosen vendor.",
            status_code=409,
            retryable=True,
        )


class ReconfirmationExpiredError(RequirementDomainError):
    def __init__(self) -> None:
        super().__init__(
            code="m2_reconfirmation_expired",
            message="The time to reconfirm this job has passed.",
            status_code=409,
        )


class StageNotFundedError(RequirementDomainError):
    def __init__(self, message: str = "") -> None:
        super().__init__(
            code="m2_stage_not_funded",
            message=message or "This stage has to be funded before work can start.",
            status_code=409,
        )


# ---------------------------------------------------------------------------
# Wave C3: the engagement spine.
#
# `m2_stage_disputed` and `m2_amendment_required` are §8 codes. The other two are new here and
# follow the rule the two C2 additions established: a refusal whose recovery is genuinely
# different from every published code gets its own, and the reason it exists is written down
# rather than discovered later.
#
# * `m2_stage_transition_not_allowed` — the stage command spine's own "not from here". Distinct
#   from `m2_requirement_transition_not_allowed` because a Partner reading "this request cannot
#   do that" about a shift-day is told about the wrong object entirely.
# * `m2_amendment_not_actionable` — an amendment that is expired, already decided, or awaiting a
#   payment. Distinct from `m2_amendment_required`, which says the *opposite* thing: that no
#   amendment exists and one is needed.
# ---------------------------------------------------------------------------


class StageTransitionError(RequirementDomainError):
    def __init__(self, message: str) -> None:
        super().__init__(
            code="m2_stage_transition_not_allowed",
            message=message,
            status_code=409,
        )


class StageDisputedError(RequirementDomainError):
    """A disputed stage does not move on a clock.

    `07-state-machines-and-permissions.md` §5 permits `AWAITING_REVIEW → APPROVED` on review
    timeout **except** while the stage is `DISPUTED`. Auto-approving a stage somebody has
    formally objected to would settle the objection by ignoring it.
    """

    def __init__(self, message: str = "") -> None:
        super().__init__(
            code="m2_stage_disputed",
            message=message or "This stage is disputed and is waiting on a decision.",
            status_code=409,
        )


class AmendmentRequiredError(RequirementDomainError):
    """`M2-BE-508`: scope, amount and completion move only through an accepted amendment."""

    def __init__(self, message: str = "") -> None:
        super().__init__(
            code="m2_amendment_required",
            message=message or "Changing the agreed work needs a change request both sides accept.",
            status_code=409,
        )


class AmendmentNotActionableError(RequirementDomainError):
    def __init__(self, message: str = "") -> None:
        super().__init__(
            code="m2_amendment_not_actionable",
            message=message or "This change request has already been decided.",
            status_code=409,
        )


# ---------------------------------------------------------------------------
# Wave C2R (revision 4, ADR-0009): the rate-card A3 front door.
#
# All four codes are `07-state-machines-and-permissions.md` §8 codes and are published exactly as
# named there. One status differs from §8's table and the divergence is deliberate:
# `m2_booking_fee_payment_pending` is a **409 retryable**, not a `202`.
#
# Proposal 0012's review settled that a refusal is always `>=400` and that `202` is reserved for
# genuine acceptance carrying a projection; `m2_unlock_payment_pending` was moved from `202` to
# `409` on that decision at 1.21.0 and `m2_visit_plan_payment_pending` was built as a `409` at
# 1.24.0. Publishing the third member of the same family as a `202` would make one of three
# identical "your bank has not confirmed yet" refusals arrive as a success to every generated
# client. Logged as a contract note rather than silently diverging.
# ---------------------------------------------------------------------------


class RateCardUnavailableError(RequirementDomainError):
    """No published rate card covers this city and skill, so nothing can be booked instantly.

    Fails closed to the quote flow rather than guessing a price. A rate card is Operations'
    published number for a city and a statutory skill; inventing one would make the platform quote
    a street rate it has never surveyed, and a customer cannot tell an invented price from an
    approved one once they have been charged against it.
    """

    def __init__(self, message: str = "") -> None:
        super().__init__(
            code="m2_rate_card_unavailable",
            message=message
            or "We have not published a day rate for this work here yet, so we will collect "
            "quotes for you instead.",
            status_code=409,
        )


class RosterInsufficientError(RequirementDomainError):
    """The lead's verified roster is smaller than the headcount they are accepting.

    Checked against **verified** memberships rather than the roster's raw size: an unverified
    worker is a name, and dispatching a crew on names is how the same person gets promised through
    two agencies.
    """

    def __init__(self, message: str = "") -> None:
        super().__init__(
            code="m2_roster_insufficient",
            message=message or "Your verified roster is smaller than the crew this job needs.",
            status_code=409,
        )


class CrewMixUnmetError(RequirementDomainError):
    """The lead's verified roster cannot field the men/women mix the Customer booked.

    Separate from `RosterInsufficientError` because they are different problems with different
    remedies: one lead needs more people, the other needs different people, and telling somebody
    with eight verified workers that their "roster is too small" for a five-person job sends them
    to the wrong screen.

    Raised only at accept and beyond. Dispatch is deliberately more forgiving -- see
    `crew_mix` on why a roster with no gender recorded is invited rather than excluded.
    """

    def __init__(self, shortfall: str = "") -> None:
        super().__init__(
            code="m2_crew_mix_unmet",
            message=(
                f"This job needs {shortfall} than your verified crew list has."
                if shortfall
                else "Your verified crew list cannot cover the men and women this job needs."
            ),
            status_code=409,
        )


class BookingFeeNotChargeableError(RequirementDomainError):
    """A booking-fee checkout was attempted with no held accepted offer behind it.

    The A3 twin of `m2_visit_plan_not_chargeable` and `m2_unlock_not_available`: all three make
    "paid but nothing happened" unreachable rather than merely unlikely, because the guard runs
    under the requirement's own row lock in the transaction that creates the attempt.
    """

    def __init__(self, message: str = "") -> None:
        super().__init__(
            code="m2_booking_fee_not_chargeable",
            message=message or "No crew is holding this job yet, so there is nothing to confirm.",
            status_code=409,
        )


class BookingFeePaymentPendingError(RequirementDomainError):
    def __init__(self) -> None:
        super().__init__(
            code="m2_booking_fee_payment_pending",
            message="We are waiting for your bank to confirm. Your crew is held until it does.",
            status_code=409,
            retryable=True,
        )


# ---------------------------------------------------------------------------
# Wave C7: security, observability and release readiness.
# ---------------------------------------------------------------------------


class PurchasesPausedError(RequirementDomainError):
    """Operations has paused **new** M2 purchases (`M2-BE-810`).

    Deliberately its own code rather than `m2_policy_unavailable`. The two say opposite things to
    the person reading them: `m2_policy_unavailable` means "nobody has decided this yet, and the
    recovery is an owner decision", while this means "we have decided, and we have deliberately
    stopped selling for now". Support cannot help with the first; time can help with the second,
    which is why this one is **retryable** and the other is not.

    Raised only on paths that would take a *new* commercial commitment. Nothing that continues,
    settles or refunds work already in flight consults the gate — see
    `apps.requirements.purchase_gates` for the list and the reasoning.
    """

    def __init__(self, message: str = "") -> None:
        super().__init__(
            code="m2_purchases_paused",
            message=message
            or "We have paused new bookings for this service for a moment. Anything already "
            "under way is unaffected. Try again shortly.",
            status_code=409,
            retryable=True,
        )


# ---------------------------------------------------------------------------
# The vendor price book (`price_book.py`). Every rule is enforced at quote submission against
# the live catalogue and the live policy — never trusted from a composer.
# ---------------------------------------------------------------------------


class GuardrailPolicyUnavailableError(RequirementDomainError):
    def __init__(self, message: str = "") -> None:
        super().__init__(
            code="m2_guardrail_policy_unavailable",
            message=message
            or "Rate-card pricing is not set up for your city yet. Nothing has been sent.",
            status_code=409,
        )


class WorkItemRateUnavailableError(RequirementDomainError):
    def __init__(self, message: str = "") -> None:
        super().__init__(
            code="m2_work_item_rate_unavailable",
            message=message or "This item has no published rate in your service area yet.",
            status_code=409,
        )


class RateOutsideBandError(RequirementDomainError):
    def __init__(self, message: str = "") -> None:
        super().__init__(
            code="rate_outside_band",
            message=message or "That rate is outside the allowed range for this item.",
            status_code=400,
        )


class CustomTitleScreenedError(RequirementDomainError):
    def __init__(self, message: str = "") -> None:
        super().__init__(
            code="custom_title_screened",
            message=message or "An item name cannot carry a phone number, email address or link.",
            status_code=400,
        )
