"""Requirement commands: draft, submit, edit, reclassify and close.

Nothing here takes money. A requirement is free to submit and free to match; the unlock in P4 is
the only charge, and it happens after a usable quote exists.

Answers are validated with `carts.item_inputs.validate_scope` against the active
`catalog.M2VariantConfiguration` schema — the same validator the A1 cart uses, so the two cannot
drift on what a valid answer set looks like.
"""

import uuid
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.carts.item_inputs import validate_scope
from apps.catalog.models import M2VariantConfiguration, ServiceVariant
from apps.foundation.services import enqueue_outbox_event
from apps.identity.models import User
from apps.locations.models import Address, ServiceArea
from apps.requirements import metrics
from apps.requirements.exceptions import (
    LifecycleNotSupportedError,
    RequirementDuplicateError,
    RequirementIncompleteError,
    RequirementLockedError,
    RequirementTransitionError,
    VisitPlanRequiredError,
)
from apps.requirements.models import CustomerRequirement, RequirementTransition, VisitPlan
from apps.requirements.sla import ServiceAreaNeverOpenError, quote_deadlines

M2_ARCHETYPES = (
    ServiceVariant.BookingArchetype.A3_TIME_BLOCK,
    ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT,
)

#: How close two requests must be to be treated as probably the same job.
DUPLICATE_WINDOW_DAYS = 3


@dataclass(frozen=True, slots=True)
class DuplicateMatch:
    requirement_id: uuid.UUID
    reason: str


def active_configuration(variant: ServiceVariant) -> M2VariantConfiguration:
    configuration = M2VariantConfiguration.objects.filter(
        variant=variant,
        status=M2VariantConfiguration.Status.ACTIVE,
    ).first()
    if configuration is None:
        raise LifecycleNotSupportedError(
            "This service is not open for workforce or project requests yet.",
        )
    return configuration


def infer_archetype(*, variant: ServiceVariant, answers: dict[str, Any]) -> str:
    """Decide the lifecycle from the answers, never from the category name.

    The variant declares the shape it supports. Where a variant genuinely carries both — a
    construction category selling both day labour and finished outcomes — the answers decide: a
    Customer who named a headcount and a duration is hiring time, and one who named an outcome is
    commissioning a project. An answer set that says both is ambiguous by definition and is left
    on the variant's own archetype for Operations to reclassify.
    """
    declared = variant.booking_archetype
    if declared not in M2_ARCHETYPES:
        raise LifecycleNotSupportedError(
            "This service is not open for workforce or project requests yet.",
        )

    wants_people = bool(answers.get("worker_count")) and bool(answers.get("duration_days"))
    wants_outcome = bool(answers.get("deliverable"))
    if wants_people and not wants_outcome:
        return ServiceVariant.BookingArchetype.A3_TIME_BLOCK
    if wants_outcome and not wants_people:
        return ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT
    return declared


def find_probable_duplicate(
    *,
    customer: User,
    variant: ServiceVariant,
    address: Address | None,
    requested_start: Any,
    exclude_id: uuid.UUID | None = None,
) -> DuplicateMatch | None:
    """An open request for the same work at the same place around the same time.

    Charging nothing means a duplicate costs the Customer nothing directly, but it burns the same
    small vendor pool twice and teaches vendors to ignore invitations.
    """
    if address is None or requested_start is None:
        return None

    window = timedelta(days=DUPLICATE_WINDOW_DAYS)
    candidates = CustomerRequirement.objects.filter(
        customer=customer,
        variant=variant,
        address=address,
        status__in=CustomerRequirement.LIVE_STATUSES,
        requested_start__gte=requested_start - window,
        requested_start__lte=requested_start + window,
    )
    if exclude_id is not None:
        candidates = candidates.exclude(id=exclude_id)

    existing = candidates.order_by("created_at").first()
    if existing is None:
        return None
    return DuplicateMatch(
        requirement_id=existing.id,
        reason="same_service_address_and_dates",
    )


@transaction.atomic
def create_draft(
    *,
    customer: User,
    variant: ServiceVariant,
    answers: dict[str, Any] | None = None,
    language: str = "en-IN",
) -> CustomerRequirement:
    configuration = active_configuration(variant)
    answers = answers or {}
    requirement = CustomerRequirement.objects.create(
        customer=customer,
        variant=variant,
        configuration=configuration,
        archetype=infer_archetype(variant=variant, answers=answers),
        status=CustomerRequirement.Status.DRAFT,
        answers=answers,
        language=language,
    )
    record_transition(
        requirement=requirement,
        from_status="",
        to_status=requirement.status,
        actor=customer,
        reason_code="draft_created",
    )
    return requirement


@transaction.atomic
def update_draft(
    *,
    requirement: CustomerRequirement,
    answers: dict[str, Any] | None = None,
    address: Address | None = None,
    service_area: ServiceArea | None = None,
    requested_start: Any = None,
    flexibility_days: int | None = None,
    service_by: date | None = None,
    budget_min_paise: int | None = None,
    budget_max_paise: int | None = None,
    additional_details: str | None = None,
    language: str | None = None,
) -> CustomerRequirement:
    """Edit a draft. Free and versionless while no vendor has seen it."""
    if not requirement.is_editable_freely:
        raise RequirementLockedError(
            "This request has already gone to vendors. Editing it now notifies them.",
        )

    if answers is not None:
        requirement.answers = answers
        requirement.archetype = infer_archetype(variant=requirement.variant, answers=answers)
    for field, value in (
        ("address", address),
        ("service_area", service_area),
        ("requested_start", requested_start),
        ("flexibility_days", flexibility_days),
        ("service_by", service_by),
        ("budget_min_paise", budget_min_paise),
        ("budget_max_paise", budget_max_paise),
        ("additional_details", additional_details),
        ("language", language),
    ):
        if value is not None:
            setattr(requirement, field, value)

    requirement.save()
    return requirement


def _assert_submittable(requirement: CustomerRequirement) -> ServiceArea:
    """Check the requirement is complete and hand back the area the clock runs against.

    Returning the area rather than asserting it later keeps the nullability resolved in one place,
    where the Customer-facing message about what is missing already lives.
    """
    missing: list[str] = []
    if requirement.address is None:
        missing.append("where the work is")
    if requirement.service_area is None:
        missing.append("a serviceable area")
    if requirement.requested_start is None:
        missing.append("when it should start")
    # `service_by` is deliberately absent from this list. It is derived from the start date rather
    # than asked for (`_closing_date`), so a missing one means a missing *start* date — already
    # reported above, and in the Customer's own terms. Listing it here asked them to add a field
    # no screen shows, which is the refusal this note exists to stop coming back.
    if missing:
        raise RequirementIncompleteError("Add " + ", ".join(missing) + ".")

    if requirement.service_by is not None and requirement.service_by < timezone.localdate():
        # Reworded with the field. Now that the closing date *is* the start date, "the date you
        # need this by has already passed" described something the Customer never picked.
        raise RequirementIncompleteError(
            "The day you asked us to start has already passed. Pick a later date.",
        )

    area = requirement.service_area
    if area is None:  # pragma: no cover - the missing-field check above already raised
        raise RequirementIncompleteError("Add a serviceable area.")
    return area


def _assert_visit_plan_chosen(requirement: CustomerRequirement) -> None:
    """An A5 requirement cannot be submitted without a visit plan (`M2-BE-215`).

    The plan bounds the invitation wave, so submitting without one would send an unbounded wave for
    a product the Customer has not chosen the size of. It charges nothing — this is a completeness
    check on the review screen, not a paywall in front of matching.

    Reads `VisitPlan` directly rather than calling `access.assert_visit_plan_chosen`: the access
    module imports `record_transition` from here, and importing it back would close a cycle for the
    sake of three lines.
    """
    if requirement.archetype != ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT:
        return
    plan = VisitPlan.objects.filter(requirement=requirement).first()
    if plan is None or plan.status == VisitPlan.Status.VOID:
        raise VisitPlanRequiredError()


@transaction.atomic
def _closing_date(requirement: CustomerRequirement) -> date | None:
    """When we stop looking, derived rather than asked for.

    ## Why the Customer is no longer asked

    `service_by` used to be a required field on both capture flows, phrased as "pick the date the
    job stops being useful, not your ideal date". It is a genuinely hard question — it asks
    somebody to predict their own patience — and it sat one field below a start date that already
    answers it. Two dates for one intention is friction that loses requests at the last screen.

    A request stops being useful when the day the work was meant to begin passes with nobody
    found: the booking as described can no longer be delivered. So the start date **is** the
    closing date, and the sweep's `service_by__lt` gives the Customer the whole of that day before
    anything closes.

    ## Why the column stays

    This is the only deadline closing depends on. `expired_requirement_ids` sweeps on it,
    `operations.extend_deadline` moves it for a request worth keeping alive, and the vendor-facing
    snapshot publishes it. Dropping the column would leave an unmet request open forever.

    ## Why an explicit value still wins

    Operations can extend a deadline before submission, and a client may legitimately send one.
    Deriving only when it is absent keeps this a default rather than an override — the same
    relationship `quote_deadlines` has to a configured SLA.

    `None` when there is no start date either. An honest gap, not an invented date: the expiry
    sweep already filters `service_by__isnull=False`, so such a request simply never expires on
    this clock, which is what "we were never told when it mattered" should mean.
    """
    if requirement.service_by is not None:
        return requirement.service_by
    if requirement.requested_start is None:
        return None
    return timezone.localtime(requirement.requested_start).date()


def submit_requirement(
    *,
    requirement: CustomerRequirement,
    actor: User,
    allow_duplicate: bool = False,
) -> CustomerRequirement:
    """Send a free requirement to matching.

    Wrap this in `apps.foundation.services.execute_idempotent` at the view boundary; the outbox
    event is keyed on the requirement so a replay cannot start matching twice.
    """
    requirement = CustomerRequirement.objects.select_for_update().get(pk=requirement.pk)
    if requirement.status != CustomerRequirement.Status.DRAFT:
        raise RequirementTransitionError("This request has already been sent to vendors.")

    # Derived first, so the completeness check and the past-date check below both read the value
    # that will actually be stored. Deriving after them would leave `_assert_submittable` judging a
    # requirement by a field the Customer was never shown and the server had not filled in yet.
    requirement.service_by = _closing_date(requirement)
    service_area = _assert_submittable(requirement)
    _assert_visit_plan_chosen(requirement)
    configuration = requirement.configuration or active_configuration(requirement.variant)
    try:
        validate_scope(schema=configuration.question_schema, scope=requirement.answers)
    except ValueError as exc:
        # The shared validator signals with ValueError. Left unwrapped it would leave the domain
        # as a 500; a Customer with an unanswered question deserves to be told which one.
        raise RequirementIncompleteError(str(exc)) from exc

    if not allow_duplicate:
        duplicate = find_probable_duplicate(
            customer=requirement.customer,
            variant=requirement.variant,
            address=requirement.address,
            requested_start=requirement.requested_start,
            exclude_id=requirement.id,
        )
        if duplicate is not None:
            raise RequirementDuplicateError(existing_id=duplicate.requirement_id)

    submitted_at = timezone.now()
    try:
        first_due, all_due = quote_deadlines(
            area=service_area,
            submitted_at=submitted_at,
            first_quote_sla_hours=configuration.first_quote_sla_hours,
            quote_delivery_sla_hours=configuration.quote_delivery_sla_hours,
        )
    except ServiceAreaNeverOpenError:
        # An area with no open hours cannot carry a delivery promise. Submit without one rather
        # than inventing a deadline, and let the Operations queue surface it.
        first_due, all_due = None, None

    requirement.status = CustomerRequirement.Status.MATCHING
    requirement.configuration = configuration
    requirement.submitted_at = submitted_at
    requirement.first_quote_due_at = first_due
    requirement.quotes_due_at = all_due
    requirement.save(
        update_fields=(
            "status",
            "configuration",
            "submitted_at",
            "first_quote_due_at",
            "quotes_due_at",
            "service_by",
            "updated_at",
        )
    )
    record_transition(
        requirement=requirement,
        from_status=CustomerRequirement.Status.DRAFT,
        to_status=requirement.status,
        actor=actor,
        reason_code="submitted",
    )
    enqueue_outbox_event(
        aggregate_type="requirement",
        aggregate_id=requirement.id,
        event_type="m2.requirement.submitted",
        idempotency_key=f"requirement-submitted:{requirement.id}",
        payload={
            "requirement_id": str(requirement.id),
            "archetype": requirement.archetype,
            "service_area_id": str(requirement.service_area_id),
            "language": requirement.language,
        },
    )
    return requirement


@transaction.atomic
def reclassify_requirement(
    *,
    requirement_id: uuid.UUID,
    to_archetype: str,
    actor: User,
    reason: str,
) -> CustomerRequirement:
    """Operations moves an ambiguous request to the other lifecycle.

    Any unlock the Customer already paid for is preserved and matching restarts against the
    correct pool. Voiding open invitations belongs to the matching module and happens in P3 when
    it consumes the event emitted here.
    """
    requirement = CustomerRequirement.objects.select_for_update().get(pk=requirement_id)
    if to_archetype not in M2_ARCHETYPES:
        raise LifecycleNotSupportedError("That is not a workforce or project lifecycle.")
    if requirement.status in CustomerRequirement.CLOSED_STATUSES:
        raise RequirementTransitionError("This request is closed.")
    if requirement.archetype == to_archetype:
        return requirement

    from_archetype = requirement.archetype
    requirement.archetype = to_archetype
    requirement.save(update_fields=("archetype", "updated_at"))
    record_transition(
        requirement=requirement,
        from_status=requirement.status,
        to_status=requirement.status,
        actor=actor,
        reason_code="reclassified",
        reason=f"{from_archetype} -> {to_archetype}: {reason}",
    )
    enqueue_outbox_event(
        aggregate_type="requirement",
        aggregate_id=requirement.id,
        event_type="m2.requirement.reclassified",
        idempotency_key=f"requirement-reclassified:{requirement.id}:{to_archetype}",
        payload={
            "requirement_id": str(requirement.id),
            "from_archetype": from_archetype,
            "to_archetype": to_archetype,
        },
    )
    return requirement


@transaction.atomic
def close_requirement(
    *,
    requirement_id: uuid.UUID,
    status: str,
    reason_code: str,
    actor: User | None = None,
) -> CustomerRequirement:
    """Close a requirement and say why. Refunding any unlock is the P4 module's job."""
    if status not in CustomerRequirement.CLOSED_STATUSES:
        raise RequirementTransitionError(f"{status} is not a closed status.")

    requirement = CustomerRequirement.objects.select_for_update().get(pk=requirement_id)
    if requirement.status in CustomerRequirement.CLOSED_STATUSES:
        return requirement

    from_status = requirement.status
    requirement.status = status
    requirement.closed_at = timezone.now()
    requirement.closed_reason_code = reason_code
    requirement.save(update_fields=("status", "closed_at", "closed_reason_code", "updated_at"))
    record_transition(
        requirement=requirement,
        from_status=from_status,
        to_status=status,
        actor=actor,
        reason_code=reason_code,
    )
    enqueue_outbox_event(
        aggregate_type="requirement",
        aggregate_id=requirement.id,
        event_type="m2.requirement.closed",
        idempotency_key=f"requirement-closed:{requirement.id}",
        payload={
            "requirement_id": str(requirement.id),
            "status": status,
            "reason_code": reason_code,
        },
    )
    return requirement


def expired_requirement_ids(*, on_day: date | None = None) -> list[uuid.UUID]:
    """Live requirements whose needed-by date has passed.

    Read by the sweep, which closes each one and releases any unlock for refund. The date outranks
    every other clock: a quote delivered after the work date is worthless.
    """
    day = on_day or timezone.localdate()
    return list(
        CustomerRequirement.objects.filter(
            status__in=CustomerRequirement.LIVE_STATUSES,
            service_by__lt=day,
        ).values_list("id", flat=True)
    )


def sla_breached_requirement_ids(*, at: Any = None) -> list[uuid.UUID]:
    """Requirements still matching past their delivery promise, with no quote yet.

    Nothing was charged, so this closes with an explanation rather than a refund.
    """
    moment = at or timezone.now()
    return list(
        CustomerRequirement.objects.filter(
            Q(status=CustomerRequirement.Status.MATCHING),
            quotes_due_at__isnull=False,
            quotes_due_at__lt=moment,
        ).values_list("id", flat=True)
    )


def record_transition(
    *,
    requirement: CustomerRequirement,
    from_status: str,
    to_status: str,
    actor: User | None,
    reason_code: str,
    reason: str = "",
) -> None:
    """Append one immutable row to a requirement's audit trail.

    Public since Wave C2, and the rename is the point rather than a tidy-up. Every command that
    takes an `actor` has to be able to say *who did this* somewhere durable; the access and
    engagement commands took one and recorded nothing, so the money-moving half of M2 had no audit
    trail at all. A private helper in this module was the reason — the only way to record a
    transition was to be `services.py`.

    A row where `from_status == to_status` is deliberate and already established by
    `reclassify_requirement`: not every auditable act is a state change, and "this Customer started
    the unlock checkout at this moment" is exactly the fact a payment dispute asks for.
    """
    RequirementTransition.objects.create(
        requirement=requirement,
        from_status=from_status,
        to_status=to_status,
        actor=actor,
        reason_code=reason_code,
        reason=reason,
    )
    # `M2-BE-806`. The whole M2 funnel is emitted from here and nowhere else, because this is the
    # one write every M2 command already makes: a counter emitted beside the audit row it counts
    # cannot drift from it, and a command that starts recording a new `reason_code` is measured the
    # day it ships. `reason` is deliberately **not** a label — it carries free text (`"visit_plan:…
    # for 4900 paise"`, an operator's note) and a metric label is a log line.
    metrics.record_transition(
        requirement=requirement,
        from_status=from_status,
        to_status=to_status,
        reason_code=reason_code,
    )
