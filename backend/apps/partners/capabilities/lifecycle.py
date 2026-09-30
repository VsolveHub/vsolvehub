"""The capability state machine: request, review, approve, suspend — and the audit row for each.

The write half of the original `Capability lifecycle` section. Everything here moves a
`PartnerCapability` from one status to another, records the move, and emits whatever the rest of
the platform has to hear about it; the guards and read models that ask whether an *already
approved* capability may act on a given day live next door in `eligibility`.

The registration-answer validation sits here rather than with the guards because it only ever runs
on the two commands that accept answers.
"""

import uuid
from collections.abc import Sequence

from django.db import transaction
from django.utils import timezone

from apps.catalog.models import ServiceVariant
from apps.foundation.services import enqueue_outbox_event
from apps.identity.models import User
from apps.locations.models import ServiceArea
from apps.partners.exceptions import (
    BusinessTypeInvalidError,
    CapabilityAlreadyRequestedError,
    CapabilityTransitionError,
    LifecycleNotSupportedError,
)
from apps.partners.models import (
    PartnerCapability,
    PartnerCapabilityTransition,
    PartnerProfile,
    PartnerServiceArea,
)

from .base import M2_ARCHETYPES

#: Archetypes a Partner can ask to be considered for. A9 stays joined the M2 pair once property
#: hosting shipped: `capability_options` already offered stay variants, and refusing them here left
#: every would-be host at a dead end. The approval handler acts on A3 only, so nothing else changes.
REQUESTABLE_ARCHETYPES = (*M2_ARCHETYPES, ServiceVariant.BookingArchetype.A9_STAY)

#: `REJECTED` is Operations' refusal and is reachable only from a state a reviewer is actually in.
#: `WITHDRAWN` is the Partner's own exit and is reachable from everywhere. Keeping them apart is
#: the answer to proposal 0013's first open question: until 12 August both landed on `WITHDRAWN`,
#: so the Partner app could not tell "we said no" from "you closed this" and honestly said neither.
_ALLOWED_TRANSITIONS: dict[str, frozenset[str]] = {
    PartnerCapability.Status.REQUESTED: frozenset(
        {
            PartnerCapability.Status.UNDER_REVIEW,
            PartnerCapability.Status.WITHDRAWN,
        }
    ),
    PartnerCapability.Status.UNDER_REVIEW: frozenset(
        {
            PartnerCapability.Status.APPROVED,
            PartnerCapability.Status.CHANGES_REQUIRED,
            PartnerCapability.Status.REJECTED,
            PartnerCapability.Status.WITHDRAWN,
        }
    ),
    PartnerCapability.Status.CHANGES_REQUIRED: frozenset(
        {
            PartnerCapability.Status.UNDER_REVIEW,
            PartnerCapability.Status.REJECTED,
            PartnerCapability.Status.WITHDRAWN,
        }
    ),
    PartnerCapability.Status.APPROVED: frozenset(
        {
            PartnerCapability.Status.SUSPENDED,
            PartnerCapability.Status.WITHDRAWN,
        }
    ),
    PartnerCapability.Status.SUSPENDED: frozenset(
        {
            PartnerCapability.Status.APPROVED,
            PartnerCapability.Status.WITHDRAWN,
        }
    ),
    #: Both terminal, and neither is in `ACTIVE_STATUSES` — so a Partner whose request was refused
    #: or who withdrew may ask again, and the new request gets its own row and its own review.
    #: A terminal state that blocked re-application would be a permanent ban dressed as a status.
    PartnerCapability.Status.REJECTED: frozenset(),
    PartnerCapability.Status.WITHDRAWN: frozenset(),
}


def registration_question_schema(variant: ServiceVariant) -> dict[str, object]:
    """The vendor-facing registration questions for this variant's active configuration.

    Empty when Operations has published none, which is the ordinary state and not an error: a
    variant with no extra questions asks none. `M2-BE-106` is explicit that this reuses the
    **versioned** schema M1 already has rather than starting a second question subsystem, so the
    schema is read from the same `ACTIVE` `M2VariantConfiguration` row the Customer's answers are
    validated against and shares its version.
    """
    from apps.catalog.models import M2VariantConfiguration  # noqa: PLC0415

    configuration = M2VariantConfiguration.objects.filter(
        variant=variant,
        status=M2VariantConfiguration.Status.ACTIVE,
    ).first()
    if configuration is None:
        return {}
    schema = configuration.registration_question_schema
    return schema if isinstance(schema, dict) else {}


def _validate_registration_answers(
    *,
    variant: ServiceVariant,
    answers: dict[str, object],
) -> dict[str, object]:
    """Check a vendor's registration answers against the versioned schema.

    Imported lazily for the same reason `assert_payout_details_present` imports payouts lazily:
    `apps.carts` reads `apps.partners`, and a module-level import here would close the loop. The
    validator itself is the one `carts.item_inputs` already owns — a second copy is exactly the
    duplication `02-backend-tasks.md` §"Reuse before building" names.
    """
    from apps.carts.item_inputs import validate_scope  # noqa: PLC0415

    schema = registration_question_schema(variant)
    if not schema:
        # Nothing published to validate against. An answer set sent anyway is refused rather than
        # stored unvalidated, because a stored answer nobody checked reads as a checked one.
        if answers:
            raise BusinessTypeInvalidError(
                "This service does not ask registration questions yet.",
                field="registration_answers",
            )
        return {}

    try:
        validate_scope(schema=schema, scope=answers)
    except ValueError as exc:
        raise BusinessTypeInvalidError(str(exc), field="registration_answers") from exc
    return answers


@transaction.atomic
def request_capability(
    *,
    partner: PartnerProfile,
    variant: ServiceVariant,
    max_crew_size: int | None = None,
    max_project_value_paise: int | None = None,
    service_areas: Sequence[ServiceArea] = (),
    registration_answers: dict[str, object] | None = None,
) -> PartnerCapability:
    """Partner asks to be considered for one lifecycle capability."""
    if variant.booking_archetype not in REQUESTABLE_ARCHETYPES:
        raise LifecycleNotSupportedError(
            "This service is not open for workforce or project vendors yet.",
        )

    existing = (
        PartnerCapability.objects.select_for_update()
        .filter(
            partner=partner,
            variant=variant,
            status__in=PartnerCapability.ACTIVE_STATUSES,
        )
        .first()
    )
    if existing is not None:
        raise CapabilityAlreadyRequestedError()

    answers = _validate_registration_answers(
        variant=variant,
        answers=registration_answers or {},
    )

    # A capability cannot be scoped to an area the Partner does not serve at all: the narrowing is
    # a subtraction from `PartnerServiceArea`, never an addition to it, and letting it add would
    # make the capability a second, quietly disagreeing coverage record.
    served = set(
        PartnerServiceArea.objects.filter(partner=partner, is_active=True).values_list(
            "service_area_id", flat=True
        )
    )
    unserved = [area for area in service_areas if area.id not in served]
    if unserved:
        raise BusinessTypeInvalidError(
            "Add "
            + ", ".join(sorted(area.name for area in unserved))
            + " to the areas you work in before asking for this capability there.",
            field="service_area_ids",
        )

    capability = PartnerCapability.objects.create(
        partner=partner,
        variant=variant,
        archetype=variant.booking_archetype,
        status=PartnerCapability.Status.REQUESTED,
        max_crew_size=max_crew_size,
        max_project_value_paise=max_project_value_paise,
        registration_answers=answers,
        requires_insurance=(
            variant.booking_archetype == ServiceVariant.BookingArchetype.A3_TIME_BLOCK
        ),
    )
    if service_areas:
        capability.service_areas.set(service_areas)
    _record_transition(
        capability=capability,
        from_status="",
        to_status=capability.status,
        actor=None,
        reason_code="partner_requested",
    )
    return capability


@transaction.atomic
def submit_capability_for_review(
    *,
    capability_id: uuid.UUID,
    actor: User | None = None,
    registration_answers: dict[str, object] | None = None,
) -> PartnerCapability:
    """The Partner's own submit and resubmit (`M2-BE-110`).

    One command for both because they are the same act from the Partner's side: "I have said what
    I can say, please look at it." `REQUESTED → UNDER_REVIEW` is the first submit;
    `CHANGES_REQUIRED → UNDER_REVIEW` is the resubmit after a correction, and it is the one that
    was missing — until now the only way out of `CHANGES_REQUIRED` was for Operations to move the
    row themselves, so a Partner who fixed what was asked had no button.

    Resubmitting **clears the correction note**, because a request that has been answered should
    not still be displayed as outstanding; the transition record keeps what was asked for.
    Idempotent by state: a capability already `UNDER_REVIEW` is returned untouched rather than
    queued twice.

    Deliberately not routed through `transition_capability`. That command stamps `reviewed_by` and
    `reviewed_at` from its actor, which is right for Operations and wrong here — it would record
    the Partner as the reviewer of their own capability, in the audit trail that exists to prove
    who decided what.
    """
    capability = (
        PartnerCapability.objects.select_for_update()
        .select_related("variant")
        .get(pk=capability_id)
    )
    if capability.status == PartnerCapability.Status.UNDER_REVIEW:
        return capability
    if capability.status not in (
        PartnerCapability.Status.REQUESTED,
        PartnerCapability.Status.CHANGES_REQUIRED,
    ):
        raise CapabilityTransitionError(
            f"A {capability.status} capability cannot be sent for review.",
        )

    if registration_answers is not None:
        capability.registration_answers = _validate_registration_answers(
            variant=capability.variant,
            answers=registration_answers,
        )

    from_status = capability.status
    capability.status = PartnerCapability.Status.UNDER_REVIEW
    capability.review_notes = ""
    capability.save(
        update_fields=("status", "review_notes", "registration_answers", "updated_at"),
    )
    _record_transition(
        capability=capability,
        from_status=from_status,
        to_status=capability.status,
        actor=actor,
        reason_code=(
            "partner_resubmitted"
            if from_status == PartnerCapability.Status.CHANGES_REQUIRED
            else "partner_submitted"
        ),
    )
    return capability


@transaction.atomic
def transition_capability(
    *,
    capability_id: uuid.UUID,
    to_status: str,
    actor: User | None,
    reason_code: str,
    reason: str = "",
) -> PartnerCapability:
    """Move a capability through review. Every move is audited.

    **Suspension routes committed work as well as blocking new work (`M2-BE-113`).** It emits
    `m2.capability.suspended`, which `apps.requirements.handlers` consumes to refund unstarted
    funded stages and flag the rest for replacement. Through the outbox rather than by calling the
    engagement module directly, for two reasons: `apps.requirements` already imports
    `apps.partners`, so the reverse call would close an import cycle; and a review decision must
    be recorded even if the routing fails, which is precisely the separation the outbox exists to
    make. A worker retries the routing; the suspension itself is already durable.
    """
    capability = PartnerCapability.objects.select_for_update().get(pk=capability_id)
    allowed = _ALLOWED_TRANSITIONS.get(capability.status, frozenset())
    if to_status not in allowed:
        raise CapabilityTransitionError(
            f"A {capability.status} capability cannot become {to_status}.",
        )
    if to_status == PartnerCapability.Status.SUSPENDED and not reason_code:
        raise CapabilityTransitionError("Suspension needs a reason code.")
    # `CHANGES_REQUIRED` and `REJECTED` both leave the Partner with one next action: fix something
    # or ask why. Reaching either without saying what is wrong is the copy that sends somebody back
    # to re-upload the document that was already correct, so it is refused here *and* by
    # `partners_capability_review_state_needs_notes` — the guard for the message, the constraint for
    # the rows no command wrote.
    # A stale note from a previous correction cycle does not satisfy this: the reason must arrive
    # with the decision, or the Partner reads last month's problem as this month's.
    if to_status in PartnerCapability.REVIEW_STATUSES_NEEDING_NOTES and not reason:
        raise CapabilityTransitionError(
            f"Moving a capability to {to_status} needs a note saying what is wrong.",
        )

    from_status = capability.status
    capability.status = to_status
    capability.reviewed_by = actor
    capability.reviewed_at = timezone.now()
    if reason:
        capability.review_notes = reason
    elif to_status == PartnerCapability.Status.APPROVED:
        # An approved capability still carrying the correction note that preceded it publishes a
        # problem that has been fixed. The transition record keeps the history; the live record
        # should not. An approval that *does* carry a note keeps it — that is a condition, not
        # a leftover.
        capability.review_notes = ""
    if to_status == PartnerCapability.Status.SUSPENDED:
        capability.suspension_reason_code = reason_code
    if to_status == PartnerCapability.Status.APPROVED:
        capability.suspension_reason_code = ""
    capability.save(
        update_fields=(
            "status",
            "reviewed_by",
            "reviewed_at",
            "review_notes",
            "suspension_reason_code",
            "updated_at",
        )
    )
    _record_transition(
        capability=capability,
        from_status=from_status,
        to_status=to_status,
        actor=actor,
        reason_code=reason_code,
        reason=reason,
    )
    if to_status == PartnerCapability.Status.SUSPENDED:
        enqueue_outbox_event(
            aggregate_type="partner_capability",
            aggregate_id=capability.id,
            event_type="m2.capability.suspended",
            # Keyed on the transition rather than on the capability: a capability can be suspended,
            # reinstated and suspended again, and each suspension has its own committed work to
            # route. Keying on the capability alone would silently drop the second one.
            idempotency_key=f"capability-suspended:{capability.id}:{timezone.now().isoformat()}",
            payload={
                "partner_capability_id": str(capability.id),
                "partner_id": str(capability.partner_id),
                "variant_id": str(capability.variant_id),
                "reason_code": reason_code,
            },
        )
    if to_status == PartnerCapability.Status.APPROVED:
        # Revision 4 (`M2-BE-435`): accepting the published rate card is part of A3 capability
        # approval, and the acceptance has to be auditable. Emitted through the outbox for exactly
        # the reasons the suspension event is: `apps.requirements` imports this module, so the
        # direct call would close an import cycle — and an approval must be recorded even if
        # writing the acceptance rows fails.
        #
        # Keyed on the capability *and the moment*, like the suspension above: a capability can be
        # approved, suspended and reinstated, and each approval agrees to whatever card is live
        # then.
        enqueue_outbox_event(
            aggregate_type="partner_capability",
            aggregate_id=capability.id,
            event_type="m2.capability.approved",
            idempotency_key=f"capability-approved:{capability.id}:{timezone.now().isoformat()}",
            payload={
                "partner_capability_id": str(capability.id),
                "partner_id": str(capability.partner_id),
                "variant_id": str(capability.variant_id),
                "archetype": capability.archetype,
            },
        )
    return capability


@transaction.atomic
def suspend_partner_a3_capabilities(
    *,
    partner: PartnerProfile,
    reason_code: str,
    actor: User | None = None,
) -> list[PartnerCapability]:
    """Remove a lead from the A3 market, through the command Operations already uses.

    ADR-0009's "removes the vendor on a pattern" (`M2-BE-539`), and deliberately **not** a second
    suspension mechanism: every one of these goes through `transition_capability`, so the audit
    row, the `m2.capability.suspended` outbox event and the engagement routing
    (`M2-BE-113`) all happen exactly as they do when a human suspends somebody. A silent flag
    would take a vendor's livelihood without any of the three.

    Scoped to `A3_TIME_BLOCK` and to `APPROVED` rows. A cash-demand pattern on shifting work says
    nothing about the same firm's project capability, and suspending it too would be punishing
    a business for a fact about one of its trades.

    Returns what it suspended, which is empty when there was nothing approved to suspend — this is
    reached from a report a Customer filed, and a vendor whose capability already lapsed is not an
    error to raise at them.
    """
    capabilities = list(
        PartnerCapability.objects.select_for_update()
        .filter(
            partner=partner,
            archetype=ServiceVariant.BookingArchetype.A3_TIME_BLOCK,
            status=PartnerCapability.Status.APPROVED,
        )
        .order_by("id")
    )
    return [
        transition_capability(
            capability_id=capability.id,
            to_status=PartnerCapability.Status.SUSPENDED,
            actor=actor,
            reason_code=reason_code,
            reason="Suspended automatically on a reported pattern. Operations reviews the reports.",
        )
        for capability in capabilities
    ]


def _record_transition(
    *,
    capability: PartnerCapability,
    from_status: str,
    to_status: str,
    actor: User | None,
    reason_code: str,
    reason: str = "",
) -> None:
    PartnerCapabilityTransition.objects.create(
        capability=capability,
        from_status=from_status,
        to_status=to_status,
        actor=actor,
        reason_code=reason_code,
        reason=reason,
    )
