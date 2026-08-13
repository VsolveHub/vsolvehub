"""M2 capability commands: progressive gates, review, crew identity and workspaces.

A skill supports eligibility; only an approved capability authorises a workspace or an
action. Nothing here derives a lifecycle from a profession or category name, and nothing
returns a frontend route — the frontend owns routes through its own typed registry.

See docs/adr/0007-m2-engagement-spine-and-fee-after-value.md and
Django_Next.js_Plan/M2/07-state-machines-and-permissions.md.
"""

import uuid
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass
from datetime import date, datetime
from typing import TypedDict

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.catalog.models import ServiceVariant
from apps.foundation.services import enqueue_outbox_event
from apps.identity.hashing import keyed_hash
from apps.identity.models import User
from apps.locations.models import ServiceArea
from apps.partners.exceptions import (
    BusinessTypeInvalidError,
    CapabilityAlreadyRequestedError,
    CapabilityNotApprovedError,
    CapabilitySuspendedError,
    CapabilityTransitionError,
    CrewConflictError,
    CrewRosterRequiredError,
    KycRequiredError,
    LifecycleNotSupportedError,
    PartnerDomainError,
    PayoutDetailsRequiredError,
    WageFloorError,
    WageFloorUnsetError,
)
from apps.partners.gates import GATE_BLOCKS, GATE_COPY, GateState
from apps.partners.models import (
    CrewAvailabilityException,
    CrewMember,
    CrewSkill,
    MinimumWageFloor,
    PartnerApplication,
    PartnerAvailabilityException,
    PartnerAvailabilityRule,
    PartnerBusinessProfile,
    PartnerCapability,
    PartnerCapabilityTransition,
    PartnerClusterMembership,
    PartnerCrewMembership,
    PartnerDocument,
    PartnerIdentityCluster,
    PartnerInsuranceDeclaration,
    PartnerLanguage,
    PartnerProfile,
    PartnerServiceArea,
    Skill,
)

M2_ARCHETYPES = (
    ServiceVariant.BookingArchetype.A3_TIME_BLOCK,
    ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT,
)

#: Actions the backend authorises per workspace. The frontend maps these to controls;
#: an action absent from this list is not permitted regardless of what the UI renders.
WORKSPACE_ACTIONS: dict[str, tuple[str, ...]] = {
    ServiceVariant.BookingArchetype.A3_TIME_BLOCK: (
        "enquiry.view",
        "enquiry.accept",
        "enquiry.decline",
        "proposal.submit",
        "crew.manage",
        "crew.assign",
        "attendance.confirm",
        "amendment.propose",
        "incident.report",
    ),
    ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT: (
        "enquiry.view",
        "enquiry.accept",
        "enquiry.decline",
        "proposal.submit",
        "site_visit.request",
        "stage.submit_evidence",
        "amendment.propose",
        "deliverable.hand_over",
    ),
}


class WorkspaceGrant(TypedDict):
    workspace_key: str
    commercial_mode: str
    actions: list[str]


# ---------------------------------------------------------------------------
# Progressive registration gates
#
# Each gate is checked at the moment it becomes necessary, never at registration.
# Supply is the scarce side of this marketplace; a Partner browses masked demand
# before proving anything.
# ---------------------------------------------------------------------------


def assert_kyc_complete(partner: PartnerProfile) -> None:
    """Gate for accepting a first enquiry."""
    application = PartnerApplication.objects.filter(partner=partner).first()
    if application is None or application.status != PartnerApplication.Status.APPROVED:
        raise KycRequiredError()


def assert_payout_details_present(partner: PartnerProfile) -> None:
    """Gate for a first payout. Imported lazily: payouts depends on partners.

    A merely registered account is not enough. M1 makes an account payable only once it is
    verified and past its `effective_from` cooling period, which is the control against
    account takeover; this gate honours that rather than restating a weaker rule.
    """
    from apps.payouts.models import PartnerPayoutAccount  # noqa: PLC0415

    has_payable_account = PartnerPayoutAccount.objects.filter(
        partner=partner,
        status=PartnerPayoutAccount.Status.VERIFIED,
        effective_from__lte=timezone.now(),
    ).exists()
    if not has_payable_account:
        raise PayoutDetailsRequiredError()


def assert_crew_roster_present(partner: PartnerProfile) -> None:
    """Gate for a first crew assignment, not for registration."""
    has_crew = PartnerCrewMembership.objects.filter(
        partner=partner,
        status=PartnerCrewMembership.Status.ACTIVE,
    ).exists()
    if not has_crew:
        raise CrewRosterRequiredError()


# ---------------------------------------------------------------------------
# Business identity
#
# `business_type` is stated, never inferred. Not from the capability requested, not from the
# services selected: the three types carry different tax, liability and payout consequences, and a
# platform that guessed which one a Partner is would be guessing who owes the tax.
# ---------------------------------------------------------------------------


@transaction.atomic
def upsert_business_profile(
    *,
    partner: PartnerProfile,
    business_type: str,
    legal_name: str = "",
    registration_number: str = "",
    gst_registered: bool = False,
    gstin: str = "",
    years_in_operation: int = 0,
) -> PartnerBusinessProfile:
    """Create or replace the business profile. A replace, not a merge.

    A `PUT` rather than a `PATCH` because the three business types have genuinely different
    required field sets. A partial update is how a Partner switching from `WORKFORCE_AGENCY` to
    `INDIVIDUAL` keeps a registration number that `partners_individual_has_no_registration_number`
    forbids — the row would be refused by the database, and the Partner would be shown a server
    error for doing something reasonable.
    """
    if business_type == PartnerBusinessProfile.BusinessType.INDIVIDUAL and registration_number:
        raise BusinessTypeInvalidError(
            "An individual Partner has no company registration number.",
            field="registration_number",
        )
    if gstin and not gst_registered:
        raise BusinessTypeInvalidError(
            "Tick GST registered before entering a GSTIN.",
            field="gstin",
        )

    profile, _created = PartnerBusinessProfile.objects.update_or_create(
        partner=partner,
        defaults={
            "business_type": business_type,
            "legal_name": legal_name,
            "registration_number": registration_number,
            "gst_registered": gst_registered,
            "gstin": gstin,
            "years_in_operation": years_in_operation,
        },
    )
    return profile


# ---------------------------------------------------------------------------
# Worker insurance
# ---------------------------------------------------------------------------


@transaction.atomic
def declare_insurance(
    *,
    partner: PartnerProfile,
    insurer_name: str,
    policy_reference: str,
    coverage_paise: int,
    covers_workmen_compensation: bool,
    valid_from: date,
    valid_to: date,
) -> PartnerInsuranceDeclaration:
    """Record a worker-insurance declaration. Declared is not insured.

    `verified_at` is set by Operations and never by this command. The difference between a declared
    policy and a verified one is who carries the liability when a worker is hurt, and a command that
    let the declaring party also mark it verified would erase that difference.

    Whether an approved A3 capability *requires* a verified declaration is owner decision 6 and is
    not enforced anywhere yet — `M2-BE-104` records that, and this command does not pretend
    otherwise by refusing on a rule nobody has set.
    """
    if valid_to <= valid_from:
        raise BusinessTypeInvalidError(
            "The policy end date must be after the start date.",
            field="valid_to",
        )
    if coverage_paise <= 0:
        raise BusinessTypeInvalidError(
            "Enter the amount this policy covers.",
            field="coverage_paise",
        )

    existing = live_insurance_declaration(partner)
    if existing is not None:
        # Replace the Partner's own current declaration rather than accumulating rows nobody can
        # tell apart. Historic declarations for expired policies stay, because a claim is argued
        # against the policy that was live on the day of the work.
        existing.insurer_name = insurer_name
        existing.policy_reference = policy_reference
        existing.coverage_paise = coverage_paise
        existing.covers_workmen_compensation = covers_workmen_compensation
        existing.valid_from = valid_from
        existing.valid_to = valid_to
        existing.declared_at = timezone.now()
        # A changed policy is an unverified policy. Carrying the old `verified_at` across would let
        # a Partner swap a checked policy for an unchecked one and keep the badge.
        existing.verified_at = None
        existing.verified_by = None
        existing.save()
        return existing

    return PartnerInsuranceDeclaration.objects.create(
        partner=partner,
        insurer_name=insurer_name,
        policy_reference=policy_reference,
        coverage_paise=coverage_paise,
        covers_workmen_compensation=covers_workmen_compensation,
        valid_from=valid_from,
        valid_to=valid_to,
    )


def live_insurance_declaration(
    partner: PartnerProfile,
    *,
    on_day: date | None = None,
) -> PartnerInsuranceDeclaration | None:
    """The declaration in force today, or nothing. Nothing is the ordinary state, not an error."""
    day = on_day or timezone.localdate()
    return (
        PartnerInsuranceDeclaration.objects.filter(
            partner=partner,
            valid_from__lte=day,
            valid_to__gte=day,
        )
        .order_by("-valid_to")
        .first()
    )


# ---------------------------------------------------------------------------
# Capability lifecycle
# ---------------------------------------------------------------------------


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
    if variant.booking_archetype not in M2_ARCHETYPES:
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


def expired_required_document_kinds(
    partner: PartnerProfile,
    *,
    on_day: date | None = None,
) -> list[str]:
    """Required document kinds this Partner holds whose recorded expiry has passed.

    Reads `settings.PARTNER_REQUIRED_DOCUMENT_KINDS`, which M1 already owns, rather than adding a
    second list of what a Partner must hold. Which kinds each *capability* requires beyond that is
    owner decision 7 and is not guessed at here.

    A document with no `expires_on` never appears: absence of an expiry is not staleness, and
    treating it as staleness would refuse every M1 Partner on the day this shipped.
    """
    day = on_day or timezone.localdate()
    kinds = tuple(settings.PARTNER_REQUIRED_DOCUMENT_KINDS)
    if not kinds:
        return []
    expired = (
        PartnerDocument.objects.filter(
            application__partner=partner,
            kind__in=kinds,
            expires_on__isnull=False,
            expires_on__lt=day,
        )
        .exclude(status=PartnerDocument.Status.SUPERSEDED)
        .values_list("kind", flat=True)
    )
    return sorted(set(expired))


def earliest_required_document_expiry(
    partner: PartnerProfile,
    *,
    on_day: date | None = None,
) -> date | None:
    """The next required document to expire, or nothing. Advisory: the client warns from it."""
    day = on_day or timezone.localdate()
    kinds = tuple(settings.PARTNER_REQUIRED_DOCUMENT_KINDS)
    if not kinds:
        return None
    row = (
        PartnerDocument.objects.filter(
            application__partner=partner,
            kind__in=kinds,
            expires_on__isnull=False,
            expires_on__gte=day,
        )
        .exclude(status=PartnerDocument.Status.SUPERSEDED)
        .order_by("expires_on")
        .values_list("expires_on", flat=True)
        .first()
    )
    return row


def capability_serves_area(
    capability: PartnerCapability,
    service_area: ServiceArea,
) -> bool:
    """Whether this capability is approved to operate in one area.

    An empty `service_areas` set means "everywhere this Partner works", which is the common case;
    the M1 `PartnerServiceArea` link is still the coverage record and is checked separately. This
    only ever narrows.
    """
    scoped = list(capability.service_areas.values_list("id", flat=True))
    if not scoped:
        return True
    return service_area.id in scoped


def partner_unavailable_on(
    *,
    partner: PartnerProfile,
    service_area: ServiceArea,
    on_day: date,
) -> bool:
    """Whether this Partner has *said* they cannot work a day in an area.

    Deliberately narrower than `selectors.partner_available_during`, which answers "does the
    published schedule cover this half-hour" and treats an empty schedule as unavailable. That rule
    is right for the A1 slot grid, where the Customer is picking a time; it is wrong for A3 and A5,
    where the unit is a day and most workforce vendors publish no hourly calendar at all. Applying
    it here would exclude every existing vendor the day it shipped.

    So: a dated exception saying `is_available=False` is a refusal, and so is a weekday no
    published rule covers **when the Partner has published rules for that area at all**. A Partner
    with no rules has made no statement, and no statement is not a refusal.
    """
    exception = PartnerAvailabilityException.objects.filter(
        partner=partner,
        service_area=service_area,
        date=on_day,
    ).first()
    if exception is not None:
        return not exception.is_available

    rules = PartnerAvailabilityRule.objects.filter(
        partner=partner,
        service_area=service_area,
        is_active=True,
    )
    weekdays = set(rules.values_list("weekday", flat=True))
    if not weekdays:
        return False
    return on_day.weekday() not in weekdays


def assert_capability_active(
    *,
    partner: PartnerProfile,
    variant: ServiceVariant,
    service_area: ServiceArea | None = None,
    on_day: date | None = None,
) -> PartnerCapability:
    """The single eligibility guard. Invitations and assignments both call it.

    `service_area` and `on_day` are optional because not every caller has them — a workspace read
    is about the capability, not about a job. When they are supplied the guard also checks
    coverage (`M2-BE-102`) and the Partner's own published availability (`M2-BE-115`); when they
    are not, it checks what it can and says so by omission rather than by silently passing a check
    it never ran.

    **Insurance is still not enforced here**, and that is a policy gap rather than an oversight:
    whether an approved A3 capability requires a *verified* declaration is owner decision 6, and
    `PartnerCapability.requires_insurance` currently records a default nobody approved. Enforcing
    it now would refuse real vendors on a rule the owner has not set. Recorded against
    `M2-BE-104`/`M2-BE-115`.
    """
    capability = (
        PartnerCapability.objects.filter(
            partner=partner,
            variant=variant,
        )
        .exclude(
            status__in=(
                PartnerCapability.Status.WITHDRAWN,
                PartnerCapability.Status.REJECTED,
            )
        )
        .first()
    )

    if capability is None:
        raise CapabilityNotApprovedError()
    if capability.status == PartnerCapability.Status.SUSPENDED:
        raise CapabilitySuspendedError()
    if capability.status != PartnerCapability.Status.APPROVED:
        raise CapabilityNotApprovedError()

    moment = timezone.now()
    if capability.expires_at is not None and capability.expires_at <= moment:
        raise CapabilityNotApprovedError()

    if service_area is not None:
        serves_area = PartnerServiceArea.objects.filter(
            partner=partner,
            service_area=service_area,
            is_active=True,
        ).exists()
        if not serves_area or not capability_serves_area(capability, service_area):
            # `m2_capability_not_approved` rather than a new code, for the same reason document
            # expiry reuses it: `07-state-machines-and-permissions.md` §8 is the authority on
            # codes and lists none for coverage. The *message* is what tells the vendor which of
            # the several things this code covers went wrong.
            raise CapabilityNotApprovedError(
                f"You are not approved to work in {service_area.name} for this service.",
            )

    if (
        service_area is not None
        and on_day is not None
        and partner_unavailable_on(partner=partner, service_area=service_area, on_day=on_day)
    ):
        raise CapabilityNotApprovedError(
            f"Your calendar says you are not working on {on_day.isoformat()}.",
        )

    # An expired required document is not a policy judgement — it is what "expired" means. The
    # refusal reuses `m2_capability_not_approved`, the code this function already raises for an
    # expired capability: `07-state-machines-and-permissions.md` §8 is the authority on codes and
    # lists no document-expiry code, and inventing one to save a client a string comparison would
    # put a code on the wire the design document does not know about. The distinguishable *state*
    # is published on the capability read instead, which is where a state belongs.
    expired_kinds = expired_required_document_kinds(partner)
    if expired_kinds:
        raise CapabilityNotApprovedError(
            "Renew your "
            + ", ".join(kind.replace("_", " ").lower() for kind in expired_kinds)
            + " before taking new work.",
        )
    return capability


def workspace_grants(partner: PartnerProfile) -> list[WorkspaceGrant]:
    """The Partner read model: stable machine values only, never routes or labels.

    An archetype with no action list is omitted rather than guessed at, so a frontend
    that does not know a key renders nothing instead of falling back to a generic view.
    """
    grants: list[WorkspaceGrant] = []
    seen: set[str] = set()
    approved = PartnerCapability.objects.filter(
        partner=partner,
        status=PartnerCapability.Status.APPROVED,
    ).order_by("archetype")

    for capability in approved:
        key = capability.workspace_key
        if key in seen:
            continue
        actions = WORKSPACE_ACTIONS.get(key)
        if actions is None:
            continue
        seen.add(key)
        grants.append(
            WorkspaceGrant(
                workspace_key=key,
                commercial_mode=capability.commercial_mode,
                actions=list(actions),
            )
        )
    return grants


def gate_states(partner: PartnerProfile) -> list[GateState]:
    """Project the three `assert_*` guards for the UI that explains them.

    **Advisory, and the contract says so.** The guards below are the enforcement, at the moment of
    the command; this read only decides what the UI explains beforehand. A client that treated it as
    authoritative would block somebody whose KYC completed thirty seconds ago and admit somebody
    suspended thirty seconds ago.

    The reason and next action come out of `gates.GATE_COPY`, keyed on the error code the guard
    raises, so this read and that refusal cannot present different sentences for one rule.
    """
    guards: tuple[tuple[str, Callable[[PartnerProfile], None]], ...] = (
        ("m2_kyc_required", assert_kyc_complete),
        ("m2_payout_details_required", assert_payout_details_present),
        ("m2_crew_roster_required", assert_crew_roster_present),
    )

    states: list[GateState] = []
    for code, guard in guards:
        gate, reason, next_action = GATE_COPY[code]
        try:
            guard(partner)
        except PartnerDomainError:
            satisfied = False
        else:
            satisfied = True
        states.append(
            GateState(
                gate=gate,
                is_satisfied=satisfied,
                blocks=GATE_BLOCKS[gate],
                # A satisfied gate carries no reason and no next action: there is nothing to
                # explain and nowhere to send anybody, and publishing copy for it invites a UI
                # that renders a resolved warning.
                reason="" if satisfied else reason,
                next_action=None if satisfied else next_action,
            )
        )
    return states


def gate_refusal_detail(code: str) -> tuple[str, str | None]:
    """The `reason` and `next_action` a gate refusal carries, for the error body.

    Acceptance criterion 7 of proposal 0013 in one function: the strings a `403` carries are the
    strings `gate_states` published, read from the same table.
    """
    entry = GATE_COPY.get(code)
    if entry is None:
        return "", None
    _gate, reason, next_action = entry
    return reason, next_action


# ---------------------------------------------------------------------------
# Crew: global person identity, per-Partner roster membership
# ---------------------------------------------------------------------------


def crew_identity_hash(*, phone_e164: str) -> str:
    return keyed_hash(f"crew:{phone_e164}")


@dataclass(frozen=True, slots=True)
class CrewRosterChange:
    """What actually happened, because three outcomes look identical from the outside.

    A new person, a returning person un-archived, and a person already on the roster are all a
    `200`-shaped success, and the Partner needs to be told which. "We put Ramesh back on your
    roster" is the one that matters: it answers a name the Partner thought was gone, and a silent
    success there reads as a duplicate that never appeared.
    """

    membership: PartnerCrewMembership
    was_created: bool
    was_reinstated: bool


@transaction.atomic
def add_crew_to_roster(
    *,
    partner: PartnerProfile,
    display_name: str,
    phone_e164: str,
    skills: Sequence[Skill] = (),
    is_supervisor: bool = False,
) -> CrewRosterChange:
    """Add a worker to one roster, resolving them to a single global person."""
    identity = crew_identity_hash(phone_e164=phone_e164)
    crew_member, _ = CrewMember.objects.get_or_create(
        identity_hash=identity,
        defaults={"display_name": display_name, "phone_suffix": phone_e164[-4:]},
    )
    if not crew_member.phone_suffix:
        # Backfill for a person first registered before the suffix existed. Derived from the number
        # the caller just supplied, which resolved to this same identity hash, so it cannot be
        # somebody else's digits.
        crew_member.phone_suffix = phone_e164[-4:]
        crew_member.save(update_fields=("phone_suffix", "updated_at"))

    membership, created = PartnerCrewMembership.objects.get_or_create(
        partner=partner,
        crew_member=crew_member,
        defaults={"is_supervisor": is_supervisor},
    )
    reinstated = False
    if not created and membership.status == PartnerCrewMembership.Status.ARCHIVED:
        membership.status = PartnerCrewMembership.Status.ACTIVE
        membership.archived_at = None
        membership.is_supervisor = is_supervisor
        membership.save(update_fields=("status", "archived_at", "is_supervisor"))
        reinstated = True

    for skill in skills:
        CrewSkill.objects.get_or_create(membership=membership, skill=skill)
    return CrewRosterChange(
        membership=membership,
        was_created=created,
        was_reinstated=reinstated,
    )


def add_crew_member(
    *,
    partner: PartnerProfile,
    display_name: str,
    phone_e164: str,
    skills: Sequence[Skill] = (),
    is_supervisor: bool = False,
) -> PartnerCrewMembership:
    """`add_crew_to_roster` for callers that only need the membership."""
    return add_crew_to_roster(
        partner=partner,
        display_name=display_name,
        phone_e164=phone_e164,
        skills=skills,
        is_supervisor=is_supervisor,
    ).membership


@transaction.atomic
def update_crew_member(
    *,
    membership: PartnerCrewMembership,
    skills: Sequence[Skill] | None = None,
    is_supervisor: bool | None = None,
) -> PartnerCrewMembership:
    """Skills and the supervisor flag, and deliberately not the display name.

    The name belongs to the global `CrewMember`, which several agencies may share. One agency
    renaming a person would rename them on every other roster, so it is published read-only rather
    than published editable and then scoped in a way a later caller can forget.
    """
    if is_supervisor is not None and membership.is_supervisor != is_supervisor:
        membership.is_supervisor = is_supervisor
        membership.save(update_fields=("is_supervisor",))

    if skills is not None:
        wanted = {skill.id: skill for skill in skills}
        CrewSkill.objects.filter(membership=membership).exclude(skill_id__in=list(wanted)).delete()
        for skill in wanted.values():
            CrewSkill.objects.get_or_create(membership=membership, skill=skill)
    return membership


@transaction.atomic
def archive_crew_member(*, membership: PartnerCrewMembership) -> PartnerCrewMembership:
    """Take a worker off one roster.

    **Does not yet refuse when the worker holds a future assignment.** Proposal 0013's acceptance
    criterion 9 asks for `409 m2_crew_conflict` naming the shift, and there is nothing to read: crew
    assignment is per *stage* and the stage model arrives with `M2-BE-522` in Wave C4. Adding a
    guard against a table that does not exist would be a check that always passes, which is worse
    than a recorded gap. Recorded in `02-backend-tasks.md` under `M2-BE-111`.
    """
    membership.status = PartnerCrewMembership.Status.ARCHIVED
    membership.archived_at = timezone.now()
    membership.save(update_fields=("status", "archived_at"))
    return membership


@dataclass(frozen=True, slots=True)
class CrewRosterEntry:
    membership_id: uuid.UUID
    display_name: str
    #: The last four digits only. The Partner supplied the number and already has it; the roster is
    #: read on a shared site phone, and an unmasked list is a contact export waiting to happen.
    phone_masked: str
    status: str
    is_supervisor: bool
    skill_codes: tuple[str, ...]
    documents_verified_at: datetime | None
    added_at: datetime


def _masked_phone(suffix: str) -> str:
    """`•••••• 4821`, or an all-mask string for a person registered before the suffix existed."""
    return f"•••••• {suffix}" if suffix else "••••••"


def crew_roster(partner: PartnerProfile) -> list[CrewRosterEntry]:
    """One Partner's roster, active first.

    Publishes no `crew_member_id`. Identity is global, and handing the global id to one agency would
    let two agencies compare rosters and work out that a worker is on both — which is a fact about a
    person that neither agency is entitled to learn from us.

    The phone is four digits behind a mask, and that is not a redaction of something we hold — it is
    all we hold. `CrewMember` stores an `identity_hash` and a suffix, never the number, so a dump of
    that table is not a contact list. Four digits are what let a Partner tell two people called
    Ramesh apart, which is the only job this field has.
    """
    memberships = (
        PartnerCrewMembership.objects.filter(partner=partner)
        .select_related("crew_member")
        .prefetch_related("skills__skill")
        .order_by("status", "-added_at")
    )
    return [
        CrewRosterEntry(
            membership_id=membership.id,
            display_name=membership.crew_member.display_name,
            phone_masked=_masked_phone(membership.crew_member.phone_suffix),
            status=membership.status,
            is_supervisor=membership.is_supervisor,
            skill_codes=tuple(sorted(link.skill.code for link in membership.skills.all())),
            documents_verified_at=membership.documents_verified_at,
            added_at=membership.added_at,
        )
        for membership in memberships
    ]


@transaction.atomic
def set_crew_availability(
    *,
    membership: PartnerCrewMembership,
    on_day: date,
    is_available: bool,
    reason: str = "",
) -> CrewAvailabilityException:
    """Record that one worker is, or is not, available on one day (`M2-BE-107`).

    Upsert rather than append: the Partner is stating today's truth about a date, and two
    contradictory rows for one date would leave `assert_crew_available` to pick one.
    """
    record, _created = CrewAvailabilityException.objects.update_or_create(
        membership=membership,
        date=on_day,
        defaults={"is_available": is_available, "reason": reason},
    )
    return record


def unavailable_crew_membership_ids(
    *,
    memberships: Iterable[PartnerCrewMembership],
    on_day: date,
) -> set[uuid.UUID]:
    """Which of these memberships have declared themselves off on a day."""
    ids = [membership.id for membership in memberships]
    if not ids:
        return set()
    return set(
        CrewAvailabilityException.objects.filter(
            membership_id__in=ids,
            date=on_day,
            is_available=False,
        ).values_list("membership_id", flat=True)
    )


def assert_crew_available(
    *,
    partner: PartnerProfile,
    memberships: Iterable[PartnerCrewMembership],
    on_day: date,
    busy_crew_member_ids: Iterable[uuid.UUID] = (),
) -> None:
    """Reject a same-day double-booking, including one made through another agency.

    `busy_crew_member_ids` is supplied by the engagement module, which owns
    assignments. Identity is global, so a person on two rosters is still one person.

    A declared day off is refused here too (`M2-BE-107`), and it reads as a conflict rather than a
    silent omission for the same reason every other exclusion in M2 is named: the supervisor
    assigning the shift needs to be told which person and why, not handed a shorter list.
    """
    busy = set(busy_crew_member_ids)
    memberships = list(memberships)
    off_today = unavailable_crew_membership_ids(memberships=memberships, on_day=on_day)
    for membership in memberships:
        if membership.partner_id != partner.id:
            raise CrewConflictError("That crew member is not on your roster.")
        if membership.status != PartnerCrewMembership.Status.ACTIVE:
            raise CrewConflictError(f"{membership.crew_member.display_name} is archived.")
        if membership.id in off_today:
            raise CrewConflictError(
                f"{membership.crew_member.display_name} is marked unavailable on "
                f"{on_day.isoformat()}.",
            )
        if membership.crew_member_id in busy:
            raise CrewConflictError(
                f"{membership.crew_member.display_name} is already booked on "
                f"{on_day.isoformat()}, including through another agency.",
            )


# ---------------------------------------------------------------------------
# Languages a vendor can work in
# ---------------------------------------------------------------------------


def language_subtag(tag: str) -> str:
    """`te-IN` and `te` are one language. Case-folded so `TE` is too."""
    return tag.strip().split("-", 1)[0].casefold()


@transaction.atomic
def set_partner_languages(
    *,
    partner: PartnerProfile,
    language_tags: Sequence[str],
) -> list[PartnerLanguage]:
    """Replace the languages this vendor works in (`M2-BE-301`).

    A replace rather than a merge: the screen shows the whole set, so what the vendor submits is
    the whole set, and a merge would make removing a language impossible from the only UI that
    edits it. Rows are deactivated rather than deleted so a matching decision made last week can
    still be explained.
    """
    wanted = {language_subtag(tag): tag.strip() for tag in language_tags if tag.strip()}
    existing = {
        language_subtag(row.language_tag): row
        for row in PartnerLanguage.objects.filter(partner=partner)
    }

    kept: list[PartnerLanguage] = []
    for subtag, row in existing.items():
        should_be_active = subtag in wanted
        if row.is_active != should_be_active:
            row.is_active = should_be_active
            row.save(update_fields=("is_active",))
        if should_be_active:
            kept.append(row)

    for subtag, tag in wanted.items():
        if subtag not in existing:
            kept.append(PartnerLanguage.objects.create(partner=partner, language_tag=tag))
    return sorted(kept, key=lambda row: row.language_tag)


def partner_language_subtags(partner: PartnerProfile) -> set[str]:
    """The languages this vendor declared, normalised. Empty means "they never said"."""
    return {
        language_subtag(tag)
        for tag in PartnerLanguage.objects.filter(partner=partner, is_active=True).values_list(
            "language_tag", flat=True
        )
    }


# ---------------------------------------------------------------------------
# Identity clustering: one beneficial owner is one Partner for slot purposes
# ---------------------------------------------------------------------------


def cluster_signal_hash(*, signal: str, value: str) -> str:
    return keyed_hash(f"cluster:{signal}:{value}")


@transaction.atomic
def link_partner_by_signal(
    *,
    partner: PartnerProfile,
    signal: str,
    value: str,
) -> PartnerIdentityCluster:
    """Attach a Partner to the cluster that shares this signal, creating one if needed."""
    signal_hash = cluster_signal_hash(signal=signal, value=value)
    existing = (
        PartnerClusterMembership.objects.select_related("cluster")
        .filter(signal=signal, signal_hash=signal_hash)
        .first()
    )
    cluster = existing.cluster if existing else PartnerIdentityCluster.objects.create()

    PartnerClusterMembership.objects.get_or_create(
        cluster=cluster,
        partner=partner,
        defaults={"signal": signal, "signal_hash": signal_hash},
    )
    return cluster


def clustered_partner_ids(partner: PartnerProfile) -> set[uuid.UUID]:
    """Every Partner sharing a real-world identity with this one, including itself."""
    cluster_ids = PartnerClusterMembership.objects.filter(partner=partner).values_list(
        "cluster_id", flat=True
    )
    if not cluster_ids:
        return {partner.id}
    linked = PartnerClusterMembership.objects.filter(cluster_id__in=list(cluster_ids)).values_list(
        "partner_id", flat=True
    )
    return {partner.id, *linked}


# ---------------------------------------------------------------------------
# Minimum wage floor
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class WageFloorCheck:
    floor_paise_per_day: int
    source_reference: str


def live_wage_floor(*, state_code: str, skill: Skill, on_day: date) -> WageFloorCheck:
    """The floor in force on a day. Fails closed when the owner has loaded none."""
    floor = (
        MinimumWageFloor.objects.filter(
            state_code=state_code,
            skill=skill,
            effective_from__lte=on_day,
        )
        .order_by("-effective_from")
        .first()
    )
    if floor is None:
        raise WageFloorUnsetError()
    return WageFloorCheck(
        floor_paise_per_day=floor.floor_paise_per_day,
        source_reference=floor.source_reference,
    )


def assert_rate_meets_wage_floor(
    *,
    state_code: str,
    skill: Skill,
    on_day: date,
    rate_paise_per_day: int,
) -> None:
    """Reject an A3 rate below the statutory floor at submission, not after the work."""
    check = live_wage_floor(state_code=state_code, skill=skill, on_day=on_day)
    if rate_paise_per_day < check.floor_paise_per_day:
        minimum = check.floor_paise_per_day // 100
        raise WageFloorError(
            f"The daily rate must be at least ₹{minimum} for this work in {state_code}.",
        )
