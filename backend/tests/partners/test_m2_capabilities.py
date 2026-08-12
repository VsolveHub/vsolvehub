"""M2 capability foundation: progressive gates, review, crew identity and clustering."""

from datetime import date, timedelta
from http import HTTPStatus

import pytest
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.catalog.models import Category, Service, ServiceVariant, Subcategory
from apps.identity.models import User
from apps.partners import capabilities
from apps.partners.exceptions import (
    CapabilityNotApprovedError,
    CapabilitySuspendedError,
    CapabilityTransitionError,
    CrewConflictError,
    CrewRosterRequiredError,
    KycRequiredError,
    LifecycleNotSupportedError,
    WageFloorError,
    WageFloorUnsetError,
)
from apps.partners.models import (
    CrewMember,
    MinimumWageFloor,
    PartnerApplication,
    PartnerCapability,
    PartnerCapabilityTransition,
    PartnerClusterMembership,
    PartnerCrewMembership,
    PartnerProfile,
    Skill,
)

pytestmark = pytest.mark.django_db

SHA256_HEX_LENGTH = 64
TWO_AGENCIES = 2


def _variant(archetype: str, *, code: str = "crew") -> ServiceVariant:
    category = Category.objects.create(slug=f"cat-{code}", name=f"Cat {code}")
    subcategory = Subcategory.objects.create(
        category=category, slug=f"sub-{code}", name=f"Sub {code}"
    )
    service = Service.objects.create(
        subcategory=subcategory,
        slug=f"svc-{code}",
        name=f"Service {code}",
        short_description="Test service.",
        status=Service.Status.ACTIVE,
    )
    return ServiceVariant.objects.create(
        service=service,
        code=code,
        name=f"Variant {code}",
        pricing_strategy=ServiceVariant.PricingStrategy.DURATION,
        booking_archetype=archetype,
        required_skill_code="helper",
        tax_category_code="labour",
    )


def _partner(phone: str = "+919000000001", name: str = "Rapid Labour") -> PartnerProfile:
    user = User.objects.create_user(phone_number=phone, full_name=name)
    return PartnerProfile.objects.create(user=user, display_name=name)


def _approved_capability(partner: PartnerProfile, variant: ServiceVariant) -> PartnerCapability:
    capability = capabilities.request_capability(partner=partner, variant=variant)
    capabilities.transition_capability(
        capability_id=capability.id,
        to_status=PartnerCapability.Status.UNDER_REVIEW,
        actor=None,
        reason_code="queued",
    )
    return capabilities.transition_capability(
        capability_id=capability.id,
        to_status=PartnerCapability.Status.APPROVED,
        actor=None,
        reason_code="checks_passed",
    )


# ---------------------------------------------------------------------------
# Progressive gates (M2-BE-109)
# ---------------------------------------------------------------------------


def test_kyc_gate_blocks_until_application_approved() -> None:
    partner = _partner()
    with pytest.raises(KycRequiredError) as excinfo:
        capabilities.assert_kyc_complete(partner)
    assert excinfo.value.code == "m2_kyc_required"
    assert excinfo.value.status_code == HTTPStatus.FORBIDDEN

    application = PartnerApplication.objects.create(partner=partner)
    application.status = PartnerApplication.Status.APPROVED
    application.save(update_fields=("status",))

    capabilities.assert_kyc_complete(partner)


def test_crew_roster_gate_blocks_until_a_member_exists() -> None:
    partner = _partner()
    with pytest.raises(CrewRosterRequiredError):
        capabilities.assert_crew_roster_present(partner)

    capabilities.add_crew_member(partner=partner, display_name="Kiran", phone_e164="+919111111111")
    capabilities.assert_crew_roster_present(partner)


def test_archived_crew_does_not_satisfy_the_roster_gate() -> None:
    partner = _partner()
    membership = capabilities.add_crew_member(
        partner=partner, display_name="Kiran", phone_e164="+919111111111"
    )
    capabilities.archive_crew_member(membership=membership)

    with pytest.raises(CrewRosterRequiredError):
        capabilities.assert_crew_roster_present(partner)


# ---------------------------------------------------------------------------
# Capability lifecycle (M2-BE-102, M2-BE-112)
# ---------------------------------------------------------------------------


def test_a1_variant_cannot_be_requested_as_an_m2_capability() -> None:
    partner = _partner()
    variant = _variant(ServiceVariant.BookingArchetype.A1_TASK_VISIT, code="a1")

    with pytest.raises(LifecycleNotSupportedError):
        capabilities.request_capability(partner=partner, variant=variant)


def test_commercial_mode_is_fixed_by_archetype_not_configured() -> None:
    partner = _partner()
    a3 = _approved_capability(partner, _variant(ServiceVariant.BookingArchetype.A3_TIME_BLOCK))
    a5 = _approved_capability(
        partner, _variant(ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT, code="proj")
    )

    assert a3.commercial_mode == PartnerCapability.CommercialMode.LEAD_ONLY
    assert a5.commercial_mode == PartnerCapability.CommercialMode.MANAGED_PAYMENT_REQUIRED
    assert not hasattr(a3, "commercial_mode_override")


def test_second_live_request_for_one_variant_is_rejected() -> None:
    partner = _partner()
    variant = _variant(ServiceVariant.BookingArchetype.A3_TIME_BLOCK)
    capabilities.request_capability(partner=partner, variant=variant)

    with pytest.raises(CapabilityTransitionError):
        capabilities.request_capability(partner=partner, variant=variant)


def test_live_capability_uniqueness_is_enforced_by_the_database() -> None:
    partner = _partner()
    variant = _variant(ServiceVariant.BookingArchetype.A3_TIME_BLOCK)
    PartnerCapability.objects.create(
        partner=partner,
        variant=variant,
        archetype=variant.booking_archetype,
        status=PartnerCapability.Status.APPROVED,
    )

    with pytest.raises(IntegrityError), transaction.atomic():
        PartnerCapability.objects.create(
            partner=partner,
            variant=variant,
            archetype=variant.booking_archetype,
            status=PartnerCapability.Status.REQUESTED,
        )


def test_illegal_transition_is_refused() -> None:
    partner = _partner()
    variant = _variant(ServiceVariant.BookingArchetype.A3_TIME_BLOCK)
    capability = capabilities.request_capability(partner=partner, variant=variant)

    with pytest.raises(CapabilityTransitionError):
        capabilities.transition_capability(
            capability_id=capability.id,
            to_status=PartnerCapability.Status.APPROVED,
            actor=None,
            reason_code="skipping_review",
        )


def test_suspension_requires_a_reason_code() -> None:
    partner = _partner()
    capability = _approved_capability(
        partner, _variant(ServiceVariant.BookingArchetype.A3_TIME_BLOCK)
    )

    with pytest.raises(CapabilityTransitionError):
        capabilities.transition_capability(
            capability_id=capability.id,
            to_status=PartnerCapability.Status.SUSPENDED,
            actor=None,
            reason_code="",
        )


def test_every_review_decision_is_audited() -> None:
    partner = _partner()
    capability = _approved_capability(
        partner, _variant(ServiceVariant.BookingArchetype.A3_TIME_BLOCK)
    )

    transitions = list(
        PartnerCapabilityTransition.objects.filter(capability=capability).order_by("occurred_at")
    )
    assert [t.to_status for t in transitions] == [
        PartnerCapability.Status.REQUESTED,
        PartnerCapability.Status.UNDER_REVIEW,
        PartnerCapability.Status.APPROVED,
    ]
    assert all(t.reason_code for t in transitions)


# ---------------------------------------------------------------------------
# Eligibility guard (M2-BE-115)
# ---------------------------------------------------------------------------


def test_eligibility_guard_rejects_unapproved_suspended_and_expired() -> None:
    partner = _partner()
    variant = _variant(ServiceVariant.BookingArchetype.A3_TIME_BLOCK)

    with pytest.raises(CapabilityNotApprovedError):
        capabilities.assert_capability_active(partner=partner, variant=variant)

    capability = _approved_capability(partner, variant)
    assert capabilities.assert_capability_active(partner=partner, variant=variant) == capability

    capabilities.transition_capability(
        capability_id=capability.id,
        to_status=PartnerCapability.Status.SUSPENDED,
        actor=None,
        reason_code="document_expired",
    )
    with pytest.raises(CapabilitySuspendedError):
        capabilities.assert_capability_active(partner=partner, variant=variant)

    capabilities.transition_capability(
        capability_id=capability.id,
        to_status=PartnerCapability.Status.APPROVED,
        actor=None,
        reason_code="document_renewed",
    )
    capability.refresh_from_db()
    capability.expires_at = timezone.now() - timedelta(minutes=1)
    capability.save(update_fields=("expires_at",))

    with pytest.raises(CapabilityNotApprovedError):
        capabilities.assert_capability_active(partner=partner, variant=variant)


def test_a_skill_alone_grants_no_capability() -> None:
    partner = _partner()
    variant = _variant(ServiceVariant.BookingArchetype.A3_TIME_BLOCK)
    Skill.objects.create(code="helper", name="Helper")

    with pytest.raises(CapabilityNotApprovedError):
        capabilities.assert_capability_active(partner=partner, variant=variant)
    assert capabilities.workspace_grants(partner) == []


# ---------------------------------------------------------------------------
# Workspace read model (M2-BE-114)
# ---------------------------------------------------------------------------


def test_workspace_grants_return_machine_values_not_routes() -> None:
    partner = _partner()
    _approved_capability(partner, _variant(ServiceVariant.BookingArchetype.A3_TIME_BLOCK))

    grants = capabilities.workspace_grants(partner)

    assert len(grants) == 1
    grant = grants[0]
    assert grant["workspace_key"] == ServiceVariant.BookingArchetype.A3_TIME_BLOCK
    assert grant["commercial_mode"] == PartnerCapability.CommercialMode.LEAD_ONLY
    assert "crew.assign" in grant["actions"]
    assert "attendance.confirm" in grant["actions"]
    # No route, label or icon may cross the boundary.
    assert not any(key in grant for key in ("route", "label", "icon", "path"))


def test_multi_capability_partner_gets_both_workspaces_without_mixing() -> None:
    partner = _partner()
    _approved_capability(partner, _variant(ServiceVariant.BookingArchetype.A3_TIME_BLOCK))
    _approved_capability(
        partner, _variant(ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT, code="proj")
    )

    grants = capabilities.workspace_grants(partner)
    keys = {grant["workspace_key"] for grant in grants}

    assert keys == {
        ServiceVariant.BookingArchetype.A3_TIME_BLOCK,
        ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT,
    }
    a3 = next(g for g in grants if g["workspace_key"] == "A3_TIME_BLOCK")
    a5 = next(g for g in grants if g["workspace_key"] == "A5_CUSTOM_PROJECT")
    assert "crew.assign" in a3["actions"]
    assert "crew.assign" not in a5["actions"]
    assert "deliverable.hand_over" in a5["actions"]


def test_suspended_capability_disappears_from_the_workspace_read_model() -> None:
    partner = _partner()
    capability = _approved_capability(
        partner, _variant(ServiceVariant.BookingArchetype.A3_TIME_BLOCK)
    )
    capabilities.transition_capability(
        capability_id=capability.id,
        to_status=PartnerCapability.Status.SUSPENDED,
        actor=None,
        reason_code="under_investigation",
    )

    assert capabilities.workspace_grants(partner) == []


def test_unknown_archetype_yields_no_grant_rather_than_a_fallback() -> None:
    partner = _partner()
    variant = _variant(ServiceVariant.BookingArchetype.A3_TIME_BLOCK)
    capability = _approved_capability(partner, variant)
    capability.archetype = "A9_STAY"
    capability.save(update_fields=("archetype",))

    assert capabilities.workspace_grants(partner) == []


# ---------------------------------------------------------------------------
# Crew: global identity (M2-BE-103, GAP-027)
# ---------------------------------------------------------------------------


def test_one_person_on_two_rosters_is_one_global_crew_member() -> None:
    agency_a = _partner(phone="+919000000001", name="Agency A")
    agency_b = _partner(phone="+919000000002", name="Agency B")

    capabilities.add_crew_member(
        partner=agency_a, display_name="Suresh", phone_e164="+919222222222"
    )
    capabilities.add_crew_member(
        partner=agency_b, display_name="Suresh", phone_e164="+919222222222"
    )

    assert CrewMember.objects.count() == 1
    assert PartnerCrewMembership.objects.count() == TWO_AGENCIES


def test_crew_member_cannot_be_double_booked_through_another_agency() -> None:
    agency_a = _partner(phone="+919000000001", name="Agency A")
    agency_b = _partner(phone="+919000000002", name="Agency B")
    membership_a = capabilities.add_crew_member(
        partner=agency_a, display_name="Suresh", phone_e164="+919222222222"
    )
    capabilities.add_crew_member(
        partner=agency_b, display_name="Suresh", phone_e164="+919222222222"
    )

    # Agency B booked him for the day; agency A now tries the same day.
    with pytest.raises(CrewConflictError) as excinfo:
        capabilities.assert_crew_available(
            partner=agency_a,
            memberships=[membership_a],
            on_day=date(2026, 8, 24),
            busy_crew_member_ids=[membership_a.crew_member_id],
        )
    assert "another agency" in str(excinfo.value)


def test_a_partner_cannot_assign_crew_from_another_roster() -> None:
    agency_a = _partner(phone="+919000000001", name="Agency A")
    agency_b = _partner(phone="+919000000002", name="Agency B")
    membership_b = capabilities.add_crew_member(
        partner=agency_b, display_name="Ajay", phone_e164="+919333333333"
    )

    with pytest.raises(CrewConflictError):
        capabilities.assert_crew_available(
            partner=agency_a,
            memberships=[membership_b],
            on_day=date(2026, 8, 24),
        )


def test_re_adding_an_archived_crew_member_reactivates_one_membership() -> None:
    partner = _partner()
    membership = capabilities.add_crew_member(
        partner=partner, display_name="Kiran", phone_e164="+919111111111"
    )
    capabilities.archive_crew_member(membership=membership)

    reactivated = capabilities.add_crew_member(
        partner=partner, display_name="Kiran", phone_e164="+919111111111"
    )

    assert reactivated.id == membership.id
    assert reactivated.status == PartnerCrewMembership.Status.ACTIVE
    assert PartnerCrewMembership.objects.filter(partner=partner).count() == 1


# ---------------------------------------------------------------------------
# Identity clustering (M2-BE-105, GAP-011)
# ---------------------------------------------------------------------------


def test_partners_sharing_a_bank_account_resolve_to_one_cluster() -> None:
    partner_a = _partner(phone="+919000000001", name="Alpha Labour")
    partner_b = _partner(phone="+919000000002", name="Beta Labour")

    capabilities.link_partner_by_signal(
        partner=partner_a, signal="BANK_ACCOUNT", value="HDFC0001-99887766"
    )
    capabilities.link_partner_by_signal(
        partner=partner_b, signal="BANK_ACCOUNT", value="HDFC0001-99887766"
    )

    assert capabilities.clustered_partner_ids(partner_a) == {partner_a.id, partner_b.id}
    assert capabilities.clustered_partner_ids(partner_b) == {partner_a.id, partner_b.id}


def test_unrelated_partners_are_their_own_cluster() -> None:
    partner_a = _partner(phone="+919000000001", name="Alpha Labour")
    partner_b = _partner(phone="+919000000002", name="Beta Labour")
    capabilities.link_partner_by_signal(partner=partner_a, signal="PAN", value="AAAPA1111A")
    capabilities.link_partner_by_signal(partner=partner_b, signal="PAN", value="BBBPB2222B")

    assert capabilities.clustered_partner_ids(partner_a) == {partner_a.id}


def test_cluster_signal_value_is_hashed_not_stored_raw() -> None:
    partner = _partner()
    capabilities.link_partner_by_signal(partner=partner, signal="PAN", value="AAAPA1111A")

    membership = PartnerClusterMembership.objects.get(partner=partner)
    assert membership.signal_hash != "AAAPA1111A"
    assert len(membership.signal_hash) == SHA256_HEX_LENGTH


# ---------------------------------------------------------------------------
# Minimum wage floor (M2-BE-108, GAP-023)
# ---------------------------------------------------------------------------


def test_wage_floor_fails_closed_when_the_owner_has_loaded_none() -> None:
    skill = Skill.objects.create(code="helper", name="Helper")

    with pytest.raises(WageFloorUnsetError):
        capabilities.assert_rate_meets_wage_floor(
            state_code="TG",
            skill=skill,
            on_day=date(2026, 8, 24),
            rate_paise_per_day=80_000,
        )


def test_rate_below_the_live_floor_is_rejected_with_the_floor_named() -> None:
    skill = Skill.objects.create(code="helper", name="Helper")
    MinimumWageFloor.objects.create(
        state_code="TG",
        skill=skill,
        floor_paise_per_day=71_000,
        effective_from=date(2026, 4, 1),
    )

    with pytest.raises(WageFloorError) as excinfo:
        capabilities.assert_rate_meets_wage_floor(
            state_code="TG",
            skill=skill,
            on_day=date(2026, 8, 24),
            rate_paise_per_day=60_000,
        )
    assert "710" in str(excinfo.value)

    capabilities.assert_rate_meets_wage_floor(
        state_code="TG",
        skill=skill,
        on_day=date(2026, 8, 24),
        rate_paise_per_day=80_000,
    )


def test_the_floor_in_force_on_the_day_is_used_not_the_newest() -> None:
    skill = Skill.objects.create(code="helper", name="Helper")
    MinimumWageFloor.objects.create(
        state_code="TG", skill=skill, floor_paise_per_day=71_000, effective_from=date(2026, 4, 1)
    )
    MinimumWageFloor.objects.create(
        state_code="TG", skill=skill, floor_paise_per_day=90_000, effective_from=date(2026, 10, 1)
    )

    # A shift in August is governed by the April floor, not the October one.
    capabilities.assert_rate_meets_wage_floor(
        state_code="TG",
        skill=skill,
        on_day=date(2026, 8, 24),
        rate_paise_per_day=75_000,
    )
    with pytest.raises(WageFloorError):
        capabilities.assert_rate_meets_wage_floor(
            state_code="TG",
            skill=skill,
            on_day=date(2026, 10, 15),
            rate_paise_per_day=75_000,
        )
