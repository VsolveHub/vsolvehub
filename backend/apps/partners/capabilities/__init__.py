"""M2 capability commands: progressive gates, review, crew identity and workspaces.

A skill supports eligibility; only an approved capability authorises a workspace or an
action. Nothing here derives a lifecycle from a profession or category name, and nothing
returns a frontend route — the frontend owns routes through its own typed registry.

See docs/adr/0007-m2-engagement-spine-and-fee-after-value.md and
Django_Next.js_Plan/M2/07-state-machines-and-permissions.md.

The commands are split across this package by what they act on:

* `base` — the archetype list, the workspace action table and the grant shape. No sibling imports.
* `registration` — the three progressive gates, the stated business identity, worker insurance.
* `lifecycle` — the capability state machine: request, submit, review, approve, suspend.
* `eligibility` — the guards and read models that answer whether an approved capability may act.
* `crew` — global person identity, per-Partner roster membership, day availability.
* `vendor_records` — languages, identity clusters and the statutory wage floor.
"""

from .base import M2_ARCHETYPES, WORKSPACE_ACTIONS, WorkspaceGrant
from .crew import (
    CrewRosterChange,
    CrewRosterEntry,
    add_crew_member,
    add_crew_to_roster,
    archive_crew_member,
    assert_crew_available,
    crew_identity_hash,
    crew_roster,
    is_sole_agency_for,
    masked_crew_phone,
    set_crew_availability,
    set_crew_gender,
    unavailable_crew_membership_ids,
    update_crew_member,
)
from .eligibility import (
    assert_capability_active,
    capability_serves_area,
    earliest_required_document_expiry,
    expired_required_document_kinds,
    gate_refusal_detail,
    gate_states,
    is_approved_employer,
    is_approved_stay_host,
    partner_unavailable_on,
    workspace_grants,
)
from .lifecycle import (
    _ALLOWED_TRANSITIONS,
    _record_transition,
    _validate_registration_answers,
    registration_question_schema,
    request_capability,
    submit_capability_for_review,
    suspend_partner_a3_capabilities,
    transition_capability,
)
from .registration import (
    assert_crew_roster_present,
    assert_kyc_complete,
    assert_payout_details_present,
    declare_insurance,
    live_insurance_declaration,
    upsert_business_profile,
    verify_business_tax_profile,
)
from .vendor_records import (
    WageFloorCheck,
    assert_rate_meets_wage_floor,
    cluster_signal_hash,
    clustered_partner_ids,
    language_subtag,
    link_partner_by_signal,
    live_wage_floor,
    partner_language_subtags,
    set_partner_languages,
)

__all__ = [
    "M2_ARCHETYPES",
    "WORKSPACE_ACTIONS",
    "_ALLOWED_TRANSITIONS",
    "CrewRosterChange",
    "CrewRosterEntry",
    "WageFloorCheck",
    "WorkspaceGrant",
    "_record_transition",
    "_validate_registration_answers",
    "add_crew_member",
    "add_crew_to_roster",
    "archive_crew_member",
    "assert_capability_active",
    "assert_crew_available",
    "assert_crew_roster_present",
    "assert_kyc_complete",
    "assert_payout_details_present",
    "assert_rate_meets_wage_floor",
    "capability_serves_area",
    "cluster_signal_hash",
    "clustered_partner_ids",
    "crew_identity_hash",
    "crew_roster",
    "declare_insurance",
    "earliest_required_document_expiry",
    "expired_required_document_kinds",
    "gate_refusal_detail",
    "gate_states",
    "is_approved_employer",
    "is_approved_stay_host",
    "is_sole_agency_for",
    "language_subtag",
    "link_partner_by_signal",
    "live_insurance_declaration",
    "live_wage_floor",
    "masked_crew_phone",
    "partner_language_subtags",
    "partner_unavailable_on",
    "registration_question_schema",
    "request_capability",
    "set_crew_availability",
    "set_crew_gender",
    "set_partner_languages",
    "submit_capability_for_review",
    "suspend_partner_a3_capabilities",
    "transition_capability",
    "unavailable_crew_membership_ids",
    "update_crew_member",
    "upsert_business_profile",
    "verify_business_tax_profile",
    "workspace_grants",
]
