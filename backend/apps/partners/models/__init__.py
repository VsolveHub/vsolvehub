"""Partner onboarding, eligibility, availability, and presence persistence.

Submodule map:

* `onboarding` — profile, application and its transitions, the skill/service/service-area
  eligibility links, consent receipts and published consent documents, uploaded documents.
* `availability` — weekly rules, dated exceptions, Operations schedule-change audit, latest
  location, online session.
* `capabilities` — the M2 capability foundation: business profile, reviewed capability and its
  transitions, insurance declaration, and `commercial_mode_for_archetype`.
* `crew` — global crew member, per-Partner roster membership, crew availability exceptions,
  declared languages, crew skills.
* `standing` — identity clusters and their signal memberships, statutory wage floors, and the
  immutable standing event.
"""

from .availability import (
    PartnerAvailabilityException,
    PartnerAvailabilityRule,
    PartnerLocation,
    PartnerOnlineSession,
    PartnerPushSubscription,
    PartnerScheduleChangeAudit,
    PartnerShift,
)
from .capabilities import (
    PartnerBusinessProfile,
    PartnerCapability,
    PartnerCapabilityTransition,
    PartnerInsuranceDeclaration,
    commercial_mode_for_archetype,
)
from .crew import (
    CrewAvailabilityException,
    CrewDocument,
    CrewMember,
    CrewSkill,
    PartnerCrewMembership,
    PartnerLanguage,
)
from .onboarding import (
    PartnerApplication,
    PartnerApplicationTransition,
    PartnerConsent,
    PartnerConsentDocument,
    PartnerDocument,
    PartnerDocumentUpload,
    PartnerProfile,
    PartnerService,
    PartnerServiceArea,
    PartnerSkill,
    Skill,
)
from .standing import (
    MinimumWageFloor,
    PartnerClusterMembership,
    PartnerIdentityCluster,
    PartnerStandingEvent,
)

__all__ = [
    "CrewAvailabilityException",
    "CrewDocument",
    "CrewMember",
    "CrewSkill",
    "MinimumWageFloor",
    "PartnerApplication",
    "PartnerApplicationTransition",
    "PartnerAvailabilityException",
    "PartnerAvailabilityRule",
    "PartnerBusinessProfile",
    "PartnerCapability",
    "PartnerCapabilityTransition",
    "PartnerClusterMembership",
    "PartnerConsent",
    "PartnerConsentDocument",
    "PartnerCrewMembership",
    "PartnerDocument",
    "PartnerDocumentUpload",
    "PartnerIdentityCluster",
    "PartnerInsuranceDeclaration",
    "PartnerLanguage",
    "PartnerLocation",
    "PartnerOnlineSession",
    "PartnerProfile",
    "PartnerPushSubscription",
    "PartnerScheduleChangeAudit",
    "PartnerService",
    "PartnerServiceArea",
    "PartnerShift",
    "PartnerSkill",
    "PartnerStandingEvent",
    "Skill",
    "commercial_mode_for_archetype",
]
