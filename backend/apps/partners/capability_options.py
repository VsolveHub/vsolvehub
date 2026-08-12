"""Server-authored registration copy and the capability-options read model.

Every sentence a Partner reads while deciding what to register as lives here rather than in the
Partner app. Not for tidiness: `business_type` and the lifecycle it implies decide who owes the tax,
who carries the liability if a worker is hurt, and whether Vsolve holds the money or the Customer
pays the vendor directly. A client-side copy table would drift from the rule it describes, and the
first drift would be a Partner agreeing to something else.

`asks_for` is the other half of the same idea. A3 needs a maximum crew size and A5 a maximum project
value, and naming the fields here is what lets one form serve both archetypes. A client-side
`if archetype === "A3"` is the per-archetype branch `SIM-09` rejects; this field exists to make it
unnecessary.
"""

import uuid
from dataclasses import dataclass
from datetime import date, datetime
from typing import Final

from apps.catalog.models import M2VariantConfiguration, ServiceVariant
from apps.partners.models import (
    PartnerBusinessProfile,
    PartnerCapability,
    PartnerProfile,
    commercial_mode_for_archetype,
)

M2_ARCHETYPES: Final = (
    ServiceVariant.BookingArchetype.A3_TIME_BLOCK,
    ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT,
)

#: The three business types, in the words a Partner reads, with the consequence stated. The
#: consequence is the useful half: "I supply a team" means nothing on its own, and "the customer
#: pays you directly" is the sentence that decides whether somebody picks it.
BUSINESS_TYPE_OPTIONS: Final[tuple[tuple[str, str, str], ...]] = (
    (
        PartnerBusinessProfile.BusinessType.INDIVIDUAL,
        "Just me",
        "You take work yourself. No GST or registration number needed.",
    ),
    (
        PartnerBusinessProfile.BusinessType.WORKFORCE_AGENCY,
        "I supply a team",
        "You send workers to a customer's site and the customer pays you directly.",
    ),
    (
        PartnerBusinessProfile.BusinessType.PROJECT_VENDOR,
        "I take on whole jobs",
        "You quote for a finished outcome. Vsolve holds each stage until it is approved.",
    ),
)

#: What a Partner is signing up to, per lifecycle. The Customer-facing equivalent lives in
#: `requirements.selectors.LIFECYCLE_EXPLANATIONS` and says something different on purpose — the two
#: sides of one archetype have different consequences, and one shared sentence would soften both.
LIFECYCLE_EXPLANATIONS: Final[dict[str, str]] = {
    ServiceVariant.BookingArchetype.A3_TIME_BLOCK: (
        "You supply people for a period of time. The customer pays you directly."
    ),
    ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT: (
        "You quote for a finished result. Vsolve funds each stage and releases it when the "
        "customer approves that stage."
    ),
}

#: The capability-request fields each archetype needs, named by the server.
CAPABILITY_ASKS_FOR: Final[dict[str, tuple[str, ...]]] = {
    ServiceVariant.BookingArchetype.A3_TIME_BLOCK: ("max_crew_size",),
    ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT: ("max_project_value_paise",),
}


def requires_insurance_for(variant: ServiceVariant) -> bool:
    """Whether a capability on this variant needs a worker-insurance declaration.

    One function, so the options read, the capability record and `request_capability` cannot
    disagree, and so the client never derives it. Today it is "A3 requires it", which is the rule
    `request_capability` already applies.

    **A per-variant override is not built**, and that is why proposal 0013's acceptance
    criterion 12 is only half met: the value is server-authored and never inferred client-side, but
    no variant can currently be configured to `False` on an A3 archetype. Which capabilities require
    insurance is owner decision 6, and adding the column before the decision would be picking a
    default for it.
    """
    return variant.booking_archetype == ServiceVariant.BookingArchetype.A3_TIME_BLOCK


@dataclass(frozen=True, slots=True)
class CapabilityOption:
    variant_id: uuid.UUID
    variant_name: str
    category_name: str
    workspace_key: str
    commercial_mode: str
    lifecycle_explanation: str
    requires_insurance: bool
    asks_for: tuple[str, ...]
    #: Mirrors `partners_unique_live_capability_per_variant` so the control is disabled before the
    #: refusal rather than after it.
    already_requested: bool


def capability_options(partner: PartnerProfile) -> list[CapabilityOption]:
    """What this Partner may ask to be considered for.

    A catalog read scoped to eligibility, **not a gate**: it answers for an account with no
    application, no documents and no capability, because that is the account the screen exists for.

    Scoped to variants the platform has actually opened for M2 — an A3/A5 archetype *and* an active
    `M2VariantConfiguration`. A variant with an archetype but no configuration cannot carry a
    requirement, so offering a capability on it would be offering work that cannot arrive.
    """
    open_variant_ids = set(
        M2VariantConfiguration.objects.filter(
            status=M2VariantConfiguration.Status.ACTIVE,
        ).values_list("variant_id", flat=True)
    )
    if not open_variant_ids:
        return []

    live = set(
        PartnerCapability.objects.filter(
            partner=partner,
            status__in=PartnerCapability.ACTIVE_STATUSES,
        ).values_list("variant_id", flat=True)
    )

    variants = (
        ServiceVariant.objects.filter(
            id__in=open_variant_ids,
            is_active=True,
            booking_archetype__in=M2_ARCHETYPES,
        )
        .select_related("service__subcategory__category")
        .order_by("service__name", "name")
    )

    options = [
        CapabilityOption(
            variant_id=variant.id,
            variant_name=f"{variant.service.name} - {variant.name}",
            category_name=variant.service.subcategory.category.name,
            workspace_key=variant.booking_archetype,
            commercial_mode=commercial_mode_for_archetype(variant.booking_archetype),
            lifecycle_explanation=LIFECYCLE_EXPLANATIONS.get(variant.booking_archetype, ""),
            requires_insurance=requires_insurance_for(variant),
            asks_for=CAPABILITY_ASKS_FOR.get(variant.booking_archetype, ()),
            already_requested=variant.id in live,
        )
        for variant in variants
    ]
    return options


@dataclass(frozen=True, slots=True)
class CapabilityRecord:
    """One capability as the Partner app reads it, with the document state folded in."""

    id: uuid.UUID
    variant_id: uuid.UUID
    variant_name: str
    workspace_key: str
    commercial_mode: str
    status: str
    review_notes: str
    suspension_reason_code: str
    requires_insurance: bool
    max_crew_size: int | None
    max_project_value_paise: int | None
    expires_at: datetime | None
    expired_document_kinds: tuple[str, ...]
    documents_expiring_on: date | None
    last_transition: dict[str, object] | None
    reviewed_at: datetime | None
    updated_at: datetime


def capability_records(partner: PartnerProfile) -> list[CapabilityRecord]:
    """Every capability this Partner holds, in any status.

    The document-expiry fields are computed once per Partner rather than per capability: they are a
    property of the Partner's documents, and every capability they hold reads the same answer. A
    per-capability document requirement is owner decision 7 and would change that.
    """
    from apps.partners.capabilities import (  # noqa: PLC0415 - avoids a module import cycle
        earliest_required_document_expiry,
        expired_required_document_kinds,
    )

    expired = tuple(expired_required_document_kinds(partner))
    expiring_on = earliest_required_document_expiry(partner)

    capabilities = (
        PartnerCapability.objects.filter(partner=partner)
        .select_related("variant__service")
        .prefetch_related("transitions")
        .order_by("-updated_at", "id")
    )

    records: list[CapabilityRecord] = []
    for capability in capabilities:
        transitions = sorted(capability.transitions.all(), key=lambda row: row.occurred_at)
        latest = transitions[-1] if transitions else None
        records.append(
            CapabilityRecord(
                id=capability.id,
                variant_id=capability.variant_id,
                variant_name=(f"{capability.variant.service.name} - {capability.variant.name}"),
                workspace_key=capability.workspace_key,
                commercial_mode=capability.commercial_mode,
                status=capability.status,
                review_notes=capability.review_notes,
                suspension_reason_code=capability.suspension_reason_code,
                requires_insurance=capability.requires_insurance,
                max_crew_size=capability.max_crew_size,
                max_project_value_paise=capability.max_project_value_paise,
                expires_at=capability.expires_at,
                # Only meaningful while the capability could otherwise authorise work. Publishing
                # an expired document against a withdrawn capability would be a warning about a
                # record nobody can act on.
                expired_document_kinds=(
                    expired if capability.status == PartnerCapability.Status.APPROVED else ()
                ),
                documents_expiring_on=(
                    expiring_on if capability.status == PartnerCapability.Status.APPROVED else None
                ),
                last_transition=(
                    None
                    if latest is None
                    else {
                        "to_status": latest.to_status,
                        "reason_code": latest.reason_code,
                        "reason": latest.reason,
                        "occurred_at": latest.occurred_at,
                    }
                ),
                reviewed_at=capability.reviewed_at,
                updated_at=capability.updated_at,
            )
        )
    return records
