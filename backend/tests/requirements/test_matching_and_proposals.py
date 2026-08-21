"""P3: eligibility, invitation waves, quote slots, proposals, clarification and site visits."""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.catalog.models import (
    Category,
    M2VariantConfiguration,
    Service,
    ServiceVariant,
    Subcategory,
)
from apps.foundation.models import OutboxEvent
from apps.identity.models import User
from apps.locations.models import (
    Address,
    ServiceArea,
    ServiceAreaOperatingWindow,
)
from apps.partners import capabilities
from apps.partners.exceptions import WageFloorError
from apps.partners.models import (
    MinimumWageFloor,
    PartnerCapability,
    PartnerOnlineSession,
    PartnerProfile,
    PartnerServiceArea,
    Skill,
)
from apps.requirements import access, engagements, matching, proposals, services
from apps.requirements.exceptions import (
    InvitationExpiredError,
    InvitationTransitionError,
    ProposalShapeError,
    ProposalWindowClosedError,
    QuoteSlotConflictError,
    QuoteSlotsExhaustedError,
    RequirementTransitionError,
)
from apps.requirements.models import (
    CapacityHold,
    CustomerRequirement,
    M2AccessPrice,
    Proposal,
    QuoteUnlock,
    RequirementSnapshot,
    SiteVisit,
    VendorInvitation,
)

pytestmark = pytest.mark.django_db

THREE_SLOTS = 3
TWO_INVITATIONS = 2
A3_TOTAL_PAISE = 960_000
WAGE_FLOOR_STATE_CODE = "TG"
#: Low enough that every other A3 quote in this file clears it; the wage-floor test supersedes it
#: with a newer effective-dated row rather than fighting the fixture.
BASELINE_WAGE_FLOOR_PAISE = 50_000


def _variant(
    archetype: str = ServiceVariant.BookingArchetype.A3_TIME_BLOCK, *, code: str = "helpers"
) -> ServiceVariant:
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
    variant = ServiceVariant.objects.create(
        service=service,
        code=code,
        name=f"Variant {code}",
        pricing_strategy=ServiceVariant.PricingStrategy.DURATION,
        booking_archetype=archetype,
        required_skill_code="helper",
        tax_category_code="labour",
    )
    M2VariantConfiguration.objects.create(
        variant=variant,
        version=1,
        status=M2VariantConfiguration.Status.ACTIVE,
        question_schema={
            "questions": [
                {"code": "worker_count", "kind": "INTEGER", "minimum": 1},
                {"code": "duration_days", "kind": "INTEGER", "minimum": 1},
                {"code": "deliverable", "kind": "TEXT"},
            ]
        },
        first_quote_sla_hours=8,
        quote_delivery_sla_hours=24,
        max_quotes=THREE_SLOTS,
        # `M2-BE-317`: the wage-floor guard derives its skill from here and its state from the
        # service area, and fails closed when either is unmapped. Without this every A3 quote in
        # this file would be refused with `m2_wage_floor_unavailable` before reaching the rule
        # under test.
        wage_floor_skill=_wage_floor_skill(),
    )
    return variant


def _wage_floor_skill() -> Skill:
    skill, _created = Skill.objects.get_or_create(
        code="wage-floor-helper",
        defaults={"name": "Helper"},
    )
    MinimumWageFloor.objects.get_or_create(
        state_code=WAGE_FLOOR_STATE_CODE,
        skill=skill,
        effective_from=timezone.localdate() - timedelta(days=365),
        defaults={"floor_paise_per_day": BASELINE_WAGE_FLOOR_PAISE},
    )
    return skill


def _area() -> ServiceArea:
    area = ServiceArea.objects.create(
        slug="kukatpally",
        name="Kukatpally",
        state_code=WAGE_FLOOR_STATE_CODE,
    )
    for weekday in range(7):
        ServiceAreaOperatingWindow.objects.create(
            service_area=area, weekday=weekday, opens_at="09:00", closes_at="18:00"
        )
    return area


def _customer(phone: str = "+919812345670") -> User:
    return User.objects.create_user(phone_number=phone, full_name="Priya S")


def _address(customer: User) -> Address:
    return Address.objects.create(
        customer=customer,
        label="Warehouse",
        line1="Plot 14",
        locality="Kukatpally",
        city="Hyderabad",
        state="Telangana",
        postal_code="500072",
        latitude=Decimal("17.494500"),
        longitude=Decimal("78.399200"),
        confirmed_at=timezone.now(),
    )


def _vendor(
    *,
    area: ServiceArea,
    variant: ServiceVariant,
    phone: str,
    name: str,
    crew: int = 4,
    approved: bool = True,
    recently_active: bool = True,
) -> PartnerProfile:
    user = User.objects.create_user(phone_number=phone, full_name=name)
    partner = PartnerProfile.objects.create(user=user, display_name=name)
    PartnerServiceArea.objects.create(partner=partner, service_area=area)
    if approved:
        capability = capabilities.request_capability(partner=partner, variant=variant)
        capabilities.transition_capability(
            capability_id=capability.id,
            to_status=PartnerCapability.Status.UNDER_REVIEW,
            actor=None,
            reason_code="queued",
        )
        capabilities.transition_capability(
            capability_id=capability.id,
            to_status=PartnerCapability.Status.APPROVED,
            actor=None,
            reason_code="ok",
        )
    if recently_active:
        PartnerOnlineSession.objects.create(
            partner=partner, service_area=area, started_at=timezone.now()
        )
    for index in range(crew):
        capabilities.add_crew_member(
            partner=partner,
            display_name=f"{name} worker {index}",
            phone_e164=f"+9199{phone[-6:]}{index:02d}",
        )
    return partner


def _matching_requirement(
    *,
    variant: ServiceVariant,
    area: ServiceArea,
    customer: User,
    worker_count: int = 4,
    budget_max_paise: int | None = None,
    archetype: str = ServiceVariant.BookingArchetype.A3_TIME_BLOCK,
) -> CustomerRequirement:
    # A project request describes an outcome; a workforce request describes headcount and days.
    # Inference reads the answers, so the answers have to match the lifecycle under test.
    answers = (
        {"deliverable": "Full-day shoot with 300 edited photos"}
        if archetype == ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT
        else {"worker_count": worker_count, "duration_days": 3}
    )
    requirement = services.create_draft(
        customer=customer,
        variant=variant,
        answers=answers,
    )
    services.update_draft(
        requirement=requirement,
        address=_address(customer),
        service_area=area,
        requested_start=timezone.now() + timedelta(days=10),
        service_by=timezone.localdate() + timedelta(days=20),
        budget_max_paise=budget_max_paise,
    )
    return services.submit_requirement(requirement=requirement, actor=customer)


# ---------------------------------------------------------------------------
# Eligibility (M2-BE-301, M2-BE-302)
# ---------------------------------------------------------------------------


def test_every_passed_over_partner_gets_a_named_reason() -> None:
    variant = _variant()
    area = _area()
    customer = _customer()
    eligible = _vendor(area=area, variant=variant, phone="+919000000001", name="Rapid")
    unapproved = _vendor(
        area=area, variant=variant, phone="+919000000002", name="NoCap", approved=False
    )
    requirement = _matching_requirement(variant=variant, area=area, customer=customer)

    result = matching.evaluate_candidates(requirement=requirement)
    by_partner = {item.partner.id: item for item in result.evaluations}

    assert by_partner[eligible.id].included
    assert matching.ExclusionReason.CAPABILITY_NOT_APPROVED in by_partner[unapproved.id].exclusions
    # No Partner is silently absent.
    assert len(result.evaluations) == TWO_INVITATIONS


def test_a_dormant_vendor_is_not_invited() -> None:
    variant = _variant()
    area = _area()
    customer = _customer()
    dormant = _vendor(
        area=area,
        variant=variant,
        phone="+919000000003",
        name="Dormant",
        recently_active=False,
    )
    requirement = _matching_requirement(variant=variant, area=area, customer=customer)

    result = matching.evaluate_candidates(requirement=requirement)
    evaluation = next(i for i in result.evaluations if i.partner.id == dormant.id)

    assert matching.ExclusionReason.UNRESPONSIVE in evaluation.exclusions


def test_a_roster_smaller_than_the_headcount_is_excluded() -> None:
    variant = _variant()
    area = _area()
    customer = _customer()
    small = _vendor(area=area, variant=variant, phone="+919000000004", name="Small", crew=2)
    requirement = _matching_requirement(
        variant=variant, area=area, customer=customer, worker_count=4
    )

    result = matching.evaluate_candidates(requirement=requirement)
    evaluation = next(i for i in result.evaluations if i.partner.id == small.id)

    assert matching.ExclusionReason.CREW_TOO_SMALL in evaluation.exclusions


def test_a_suspended_capability_is_excluded_with_its_own_reason() -> None:
    variant = _variant()
    area = _area()
    customer = _customer()
    vendor = _vendor(area=area, variant=variant, phone="+919000000005", name="Suspended")
    capability = PartnerCapability.objects.get(partner=vendor, variant=variant)
    capabilities.transition_capability(
        capability_id=capability.id,
        to_status=PartnerCapability.Status.SUSPENDED,
        actor=None,
        reason_code="under_review",
    )
    requirement = _matching_requirement(variant=variant, area=area, customer=customer)

    result = matching.evaluate_candidates(requirement=requirement)
    evaluation = next(i for i in result.evaluations if i.partner.id == vendor.id)

    assert matching.ExclusionReason.CAPABILITY_SUSPENDED in evaluation.exclusions


def test_the_decision_is_recorded_so_operations_can_explain_it() -> None:
    variant = _variant()
    area = _area()
    customer = _customer()
    _vendor(area=area, variant=variant, phone="+919000000006", name="Rapid")
    requirement = _matching_requirement(variant=variant, area=area, customer=customer)

    invitations = matching.invite_wave(requirement_id=requirement.id)
    provenance = invitations[0].ranking_provenance

    assert provenance["policy"] == matching.MATCHING_POLICY
    assert provenance["policy_version"] == matching.MATCHING_POLICY_VERSION
    assert provenance["pool"]["considered"] >= 1
    assert "ranked" in provenance
    assert "excluded" in provenance


def test_an_invitation_emits_the_partner_notification_event() -> None:
    variant = _variant(ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT, code="project")
    area = _area()
    customer = _customer()
    _vendor(area=area, variant=variant, phone="+919000000010", name="Projects Co")
    requirement = _matching_requirement(
        variant=variant,
        area=area,
        customer=customer,
        archetype=ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT,
    )

    [invitation] = matching.invite_wave(requirement_id=requirement.id)

    event = OutboxEvent.objects.get(event_type="m2.invitation.received")
    assert event.aggregate_type == "vendor_invitation"
    assert event.aggregate_id == invitation.id
    assert event.idempotency_key == f"m2-invitation-received:{invitation.id}"
    assert event.payload["requirement_id"] == str(requirement.id)
    assert event.payload["vendor_invitation_id"] == str(invitation.id)
    assert event.payload["archetype"] == ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT


# ---------------------------------------------------------------------------
# Snapshots (M2-BE-305)
# ---------------------------------------------------------------------------


def test_an_invitation_freezes_what_the_vendor_was_shown() -> None:
    variant = _variant()
    area = _area()
    customer = _customer()
    _vendor(area=area, variant=variant, phone="+919000000007", name="Rapid")
    requirement = _matching_requirement(variant=variant, area=area, customer=customer)

    invitation = matching.invite_wave(requirement_id=requirement.id)[0]

    assert invitation.snapshot.answers == requirement.answers
    assert invitation.snapshot.content_hash


def test_two_vendors_invited_against_unchanged_content_share_one_snapshot() -> None:
    variant = _variant()
    area = _area()
    customer = _customer()
    _vendor(area=area, variant=variant, phone="+919000000008", name="A")
    _vendor(area=area, variant=variant, phone="+919000000009", name="B")
    requirement = _matching_requirement(variant=variant, area=area, customer=customer)

    invitations = matching.invite_wave(requirement_id=requirement.id, size=2)

    assert len({i.snapshot_id for i in invitations}) == 1
    assert RequirementSnapshot.objects.filter(requirement=requirement).count() == 1


# ---------------------------------------------------------------------------
# Slots and capacity (M2-BE-303, M2-BE-306, M2-BE-307)
# ---------------------------------------------------------------------------


def test_a_wave_never_exceeds_the_free_quote_slots() -> None:
    variant = _variant()
    area = _area()
    customer = _customer()
    for index in range(5):
        _vendor(area=area, variant=variant, phone=f"+91900000101{index}", name=f"Vendor {index}")
    requirement = _matching_requirement(variant=variant, area=area, customer=customer)

    invitations = matching.invite_wave(requirement_id=requirement.id, size=10)

    assert len(invitations) == THREE_SLOTS


def test_accepting_takes_a_soft_capacity_hold() -> None:
    variant = _variant()
    area = _area()
    customer = _customer()
    _vendor(area=area, variant=variant, phone="+919000000011", name="Rapid")
    requirement = _matching_requirement(variant=variant, area=area, customer=customer)
    invitation = matching.invite_wave(requirement_id=requirement.id)[0]

    matching.accept_invitation(invitation_id=invitation.id)

    hold = CapacityHold.objects.get(invitation=invitation)
    assert hold.strength == CapacityHold.Strength.SOFT
    assert hold.status == CapacityHold.Status.ACTIVE


def test_a_vendor_already_committed_for_those_dates_is_not_invited_again() -> None:
    variant = _variant()
    area = _area()
    vendor = _vendor(area=area, variant=variant, phone="+919000000012", name="Busy")
    first = _matching_requirement(variant=variant, area=area, customer=_customer("+919812345671"))
    invitation = matching.invite_wave(requirement_id=first.id)[0]
    matching.accept_invitation(invitation_id=invitation.id)

    second = _matching_requirement(variant=variant, area=area, customer=_customer("+919812345672"))
    result = matching.evaluate_candidates(requirement=second)
    evaluation = next(i for i in result.evaluations if i.partner.id == vendor.id)

    assert matching.ExclusionReason.CAPACITY_COMMITTED in evaluation.exclusions


def test_declining_releases_the_slot_and_the_hold() -> None:
    variant = _variant()
    area = _area()
    customer = _customer()
    _vendor(area=area, variant=variant, phone="+919000000013", name="Rapid")
    requirement = _matching_requirement(variant=variant, area=area, customer=customer)
    invitation = matching.invite_wave(requirement_id=requirement.id)[0]
    matching.accept_invitation(invitation_id=invitation.id)

    matching.decline_invitation(invitation_id=invitation.id, reason_code="too_far")

    assert matching.live_slot_count(requirement) == 0
    assert CapacityHold.objects.get(invitation=invitation).status == CapacityHold.Status.RELEASED


def test_declining_without_a_reason_is_refused() -> None:
    variant = _variant()
    area = _area()
    customer = _customer()
    _vendor(area=area, variant=variant, phone="+919000000014", name="Rapid")
    requirement = _matching_requirement(variant=variant, area=area, customer=customer)
    invitation = matching.invite_wave(requirement_id=requirement.id)[0]

    with pytest.raises(InvitationTransitionError):
        matching.decline_invitation(invitation_id=invitation.id, reason_code="")


def test_accepting_after_the_deadline_is_refused() -> None:
    variant = _variant()
    area = _area()
    customer = _customer()
    _vendor(area=area, variant=variant, phone="+919000000015", name="Rapid")
    requirement = _matching_requirement(variant=variant, area=area, customer=customer)
    invitation = matching.invite_wave(requirement_id=requirement.id)[0]
    invitation.responds_by = timezone.now() - timedelta(minutes=1)
    invitation.save(update_fields=("responds_by",))

    with pytest.raises(InvitationExpiredError):
        matching.accept_invitation(invitation_id=invitation.id)


def test_accepting_twice_is_idempotent() -> None:
    variant = _variant()
    area = _area()
    customer = _customer()
    _vendor(area=area, variant=variant, phone="+919000000016", name="Rapid")
    requirement = _matching_requirement(variant=variant, area=area, customer=customer)
    invitation = matching.invite_wave(requirement_id=requirement.id)[0]

    matching.accept_invitation(invitation_id=invitation.id)
    matching.accept_invitation(invitation_id=invitation.id)

    assert CapacityHold.objects.filter(invitation=invitation).count() == 1


def test_acceptance_cannot_exceed_the_paid_slot_count() -> None:
    variant = _variant()
    area = _area()
    customer = _customer()
    for index in range(4):
        _vendor(area=area, variant=variant, phone=f"+91900000201{index}", name=f"Vendor {index}")
    requirement = _matching_requirement(variant=variant, area=area, customer=customer)
    invitations = matching.invite_wave(requirement_id=requirement.id, size=3)
    for invitation in invitations:
        matching.accept_invitation(invitation_id=invitation.id)

    # A fourth invitation issued out of band cannot squeeze past the slot ceiling.
    extra_partner = PartnerProfile.objects.exclude(
        id__in=[i.partner_id for i in invitations]
    ).first()
    extra = VendorInvitation.objects.create(
        requirement=requirement,
        partner=extra_partner,
        snapshot=invitations[0].snapshot,
        cluster_key="",
    )

    with pytest.raises(QuoteSlotsExhaustedError):
        matching.accept_invitation(invitation_id=extra.id)


def test_two_accounts_of_one_owner_cannot_both_hold_a_slot() -> None:
    variant = _variant()
    area = _area()
    customer = _customer()
    first = _vendor(area=area, variant=variant, phone="+919000000021", name="Alpha")
    second = _vendor(area=area, variant=variant, phone="+919000000022", name="Beta")
    for partner in (first, second):
        capabilities.link_partner_by_signal(
            partner=partner, signal="BANK_ACCOUNT", value="HDFC-999"
        )
    requirement = _matching_requirement(variant=variant, area=area, customer=customer)

    snapshot = matching.snapshot_requirement(requirement)
    cluster_key = matching._cluster_key(first)
    assert cluster_key == matching._cluster_key(second)

    invitation = VendorInvitation.objects.create(
        requirement=requirement,
        partner=first,
        snapshot=snapshot,
        cluster_key=cluster_key,
    )
    matching.accept_invitation(invitation_id=invitation.id)

    sibling = VendorInvitation.objects.create(
        requirement=requirement,
        partner=second,
        snapshot=snapshot,
        cluster_key=cluster_key,
    )

    with pytest.raises(QuoteSlotConflictError):
        matching.accept_invitation(invitation_id=sibling.id)


def test_a_wave_invites_only_one_account_per_owner() -> None:
    variant = _variant()
    area = _area()
    customer = _customer()
    first = _vendor(area=area, variant=variant, phone="+919000000023", name="Alpha")
    second = _vendor(area=area, variant=variant, phone="+919000000024", name="Beta")
    for partner in (first, second):
        capabilities.link_partner_by_signal(partner=partner, signal="PAN", value="AAAPA1111A")
    requirement = _matching_requirement(variant=variant, area=area, customer=customer)

    invitations = matching.invite_wave(requirement_id=requirement.id, size=3)

    assert len(invitations) == 1


def test_an_expired_invitation_is_sweepable() -> None:
    variant = _variant()
    area = _area()
    customer = _customer()
    _vendor(area=area, variant=variant, phone="+919000000017", name="Rapid")
    requirement = _matching_requirement(variant=variant, area=area, customer=customer)
    invitation = matching.invite_wave(requirement_id=requirement.id)[0]
    invitation.responds_by = timezone.now() - timedelta(hours=1)
    invitation.save(update_fields=("responds_by",))

    assert invitation.id in matching.expired_invitation_ids()
    matching.expire_invitation(invitation_id=invitation.id)
    invitation.refresh_from_db()
    assert invitation.status == VendorInvitation.Status.EXPIRED


# ---------------------------------------------------------------------------
# Proposals (M2-BE-315 to M2-BE-321)
# ---------------------------------------------------------------------------


def _accepted_invitation(
    *, archetype: str = ServiceVariant.BookingArchetype.A3_TIME_BLOCK, budget: int | None = None
) -> VendorInvitation:
    variant = _variant(archetype)
    area = _area()
    customer = _customer()
    _vendor(area=area, variant=variant, phone="+919000000031", name="Rapid")
    requirement = _matching_requirement(
        variant=variant,
        area=area,
        customer=customer,
        budget_max_paise=budget,
        archetype=archetype,
    )
    invitation = matching.invite_wave(requirement_id=requirement.id)[0]
    return matching.accept_invitation(invitation_id=invitation.id)


def test_a_workforce_quote_needs_rate_days_and_headcount() -> None:
    invitation = _accepted_invitation()

    with pytest.raises(ProposalShapeError):
        proposals.submit_proposal(
            invitation_id=invitation.id,
            total_paise=960_000,
            tax_basis=Proposal.TaxBasis.INCLUSIVE,
        )


def test_a_project_quote_stage_amounts_must_add_up() -> None:
    invitation = _accepted_invitation(archetype=ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT)

    with pytest.raises(ProposalShapeError):
        proposals.submit_proposal(
            invitation_id=invitation.id,
            total_paise=4_500_000,
            tax_basis=Proposal.TaxBasis.INCLUSIVE,
            stages=[{"name": "Shoot", "amount_paise": 1_800_000}],
        )


def test_submitting_a_valid_workforce_quote_moves_the_request_to_quotes_ready() -> None:
    invitation = _accepted_invitation()

    proposal = proposals.submit_proposal(
        invitation_id=invitation.id,
        total_paise=960_000,
        tax_basis=Proposal.TaxBasis.INCLUSIVE,
        rate_paise_per_worker_day=80_000,
        minimum_days=3,
        worker_count=4,
    )

    invitation.requirement.refresh_from_db()
    assert proposal.status == Proposal.Status.SUBMITTED
    assert proposal.usability == Proposal.Usability.USABLE
    assert invitation.requirement.status == CustomerRequirement.Status.QUOTES_READY


def test_a_revision_supersedes_rather_than_edits() -> None:
    invitation = _accepted_invitation()
    first = proposals.submit_proposal(
        invitation_id=invitation.id,
        total_paise=960_000,
        tax_basis=Proposal.TaxBasis.INCLUSIVE,
        rate_paise_per_worker_day=80_000,
        minimum_days=3,
        worker_count=4,
    )

    second = proposals.submit_proposal(
        invitation_id=invitation.id,
        total_paise=900_000,
        tax_basis=Proposal.TaxBasis.INCLUSIVE,
        rate_paise_per_worker_day=75_000,
        minimum_days=3,
        worker_count=4,
    )

    first.refresh_from_db()
    assert first.status == Proposal.Status.SUPERSEDED
    assert first.total_paise == A3_TOTAL_PAISE  # the original offer is still readable
    assert second.revision == TWO_INVITATIONS
    assert second.supersedes_id == first.id


def test_competing_quotes_are_forced_onto_one_tax_basis() -> None:
    variant = _variant()
    area = _area()
    customer = _customer()
    _vendor(area=area, variant=variant, phone="+919000000041", name="A")
    _vendor(area=area, variant=variant, phone="+919000000042", name="B")
    requirement = _matching_requirement(variant=variant, area=area, customer=customer)
    first, second = matching.invite_wave(requirement_id=requirement.id, size=2)
    matching.accept_invitation(invitation_id=first.id)
    matching.accept_invitation(invitation_id=second.id)

    proposals.submit_proposal(
        invitation_id=first.id,
        total_paise=960_000,
        tax_basis=Proposal.TaxBasis.INCLUSIVE,
        rate_paise_per_worker_day=80_000,
        minimum_days=3,
        worker_count=4,
    )

    with pytest.raises(ProposalShapeError) as excinfo:
        proposals.submit_proposal(
            invitation_id=second.id,
            total_paise=900_000,
            tax_basis=Proposal.TaxBasis.EXCLUSIVE,
            rate_paise_per_worker_day=75_000,
            minimum_days=3,
            worker_count=4,
        )
    assert "compared" in str(excinfo.value)


def test_a_rate_below_the_wage_floor_is_refused_at_submission() -> None:
    """The state and the skill are derived from the requirement, never sent by the vendor.

    A newer effective-dated floor supersedes the fixture's baseline, which is how Operations
    actually raises a floor: a new row, not an edit.
    """
    invitation = _accepted_invitation()
    MinimumWageFloor.objects.create(
        state_code=WAGE_FLOOR_STATE_CODE,
        skill=_wage_floor_skill(),
        floor_paise_per_day=71_000,
        effective_from=timezone.localdate() - timedelta(days=30),
    )

    with pytest.raises(WageFloorError):
        proposals.submit_proposal(
            invitation_id=invitation.id,
            total_paise=720_000,
            tax_basis=Proposal.TaxBasis.INCLUSIVE,
            rate_paise_per_worker_day=60_000,
            minimum_days=3,
            worker_count=4,
        )


def test_a_quote_over_the_stated_budget_is_labelled_not_hidden() -> None:
    invitation = _accepted_invitation(budget=1_000_000)

    proposal = proposals.submit_proposal(
        invitation_id=invitation.id,
        total_paise=1_800_000,
        tax_basis=Proposal.TaxBasis.INCLUSIVE,
        rate_paise_per_worker_day=150_000,
        minimum_days=3,
        worker_count=4,
    )

    assert proposal.usability == Proposal.Usability.OUT_OF_BUDGET
    assert not proposal.is_selectable
    # Still visible to the Customer rather than silently dropped.
    assert Proposal.objects.filter(requirement=invitation.requirement).count() == 1


def test_an_out_of_budget_quote_alone_does_not_promise_quotes_ready() -> None:
    invitation = _accepted_invitation(budget=1_000_000)

    proposals.submit_proposal(
        invitation_id=invitation.id,
        total_paise=1_800_000,
        tax_basis=Proposal.TaxBasis.INCLUSIVE,
        rate_paise_per_worker_day=150_000,
        minimum_days=3,
        worker_count=4,
    )

    invitation.requirement.refresh_from_db()
    assert invitation.requirement.status == CustomerRequirement.Status.MATCHING


def test_quoting_without_accepting_is_refused() -> None:
    variant = _variant()
    area = _area()
    customer = _customer()
    _vendor(area=area, variant=variant, phone="+919000000051", name="Rapid")
    requirement = _matching_requirement(variant=variant, area=area, customer=customer)
    invitation = matching.invite_wave(requirement_id=requirement.id)[0]

    with pytest.raises(RequirementTransitionError):
        proposals.submit_proposal(
            invitation_id=invitation.id,
            total_paise=960_000,
            tax_basis=Proposal.TaxBasis.INCLUSIVE,
            rate_paise_per_worker_day=80_000,
            minimum_days=3,
            worker_count=4,
        )


def test_selecting_one_quote_closes_competing_quotes_and_their_stale_composers() -> None:
    variant = _variant(code="selection-outcome")
    area = _area()
    customer = _customer()
    _vendor(
        area=area,
        variant=variant,
        phone="+919000000061",
        name="Chosen vendor",
    )
    _vendor(
        area=area,
        variant=variant,
        phone="+919000000062",
        name="Other vendor",
    )
    requirement = _matching_requirement(variant=variant, area=area, customer=customer)
    first_invitation, second_invitation = matching.invite_wave(
        requirement_id=requirement.id,
        size=TWO_INVITATIONS,
    )
    matching.accept_invitation(invitation_id=first_invitation.id)
    matching.accept_invitation(invitation_id=second_invitation.id)
    chosen = proposals.submit_proposal(
        invitation_id=first_invitation.id,
        total_paise=A3_TOTAL_PAISE,
        tax_basis=Proposal.TaxBasis.INCLUSIVE,
        rate_paise_per_worker_day=80_000,
        minimum_days=3,
        worker_count=4,
    )
    not_chosen = proposals.submit_proposal(
        invitation_id=second_invitation.id,
        total_paise=900_000,
        tax_basis=Proposal.TaxBasis.INCLUSIVE,
        rate_paise_per_worker_day=75_000,
        minimum_days=3,
        worker_count=4,
    )
    price = M2AccessPrice.objects.create(
        kind=M2AccessPrice.Kind.A3_QUOTE_UNLOCK,
        plan_size=0,
        amount_paise=19_900,
        effective_from=timezone.localdate(),
        source_reference="selection outcome regression",
    )
    QuoteUnlock.objects.create(
        requirement=requirement,
        price=price,
        price_paise=price.amount_paise,
        status=QuoteUnlock.Status.ACTIVE,
        activated_at=timezone.now(),
        unlocked_proposal_ids=[str(chosen.id), str(not_chosen.id)],
    )

    selection = engagements.select_proposal(
        requirement_id=requirement.id,
        proposal_id=chosen.id,
        actor=customer,
    )

    chosen.refresh_from_db()
    not_chosen.refresh_from_db()
    assert selection.proposal_id == chosen.id
    assert chosen.status == Proposal.Status.ACCEPTED
    assert not_chosen.status == Proposal.Status.REJECTED
    assert not_chosen.rejection_reason == Proposal.RejectionReason.NOT_CHOSEN

    with pytest.raises(ProposalWindowClosedError):
        proposals.submit_proposal(
            invitation_id=second_invitation.id,
            total_paise=840_000,
            tax_basis=Proposal.TaxBasis.INCLUSIVE,
            rate_paise_per_worker_day=70_000,
            minimum_days=3,
            worker_count=4,
        )

    assert Proposal.objects.filter(invitation=second_invitation).count() == 1


# ---------------------------------------------------------------------------
# Assisted capture (M2-BE-322)
# ---------------------------------------------------------------------------


def test_an_operations_captured_quote_is_hidden_until_the_vendor_confirms() -> None:
    invitation = _accepted_invitation()
    operator = User.objects.create_user(phone_number="+919900000099", full_name="Ops")

    proposal = proposals.submit_proposal(
        invitation_id=invitation.id,
        total_paise=960_000,
        tax_basis=Proposal.TaxBasis.INCLUSIVE,
        rate_paise_per_worker_day=80_000,
        minimum_days=3,
        worker_count=4,
        captured_by=operator,
    )

    invitation.requirement.refresh_from_db()
    assert proposal.vendor_confirmed_at is None
    assert invitation.requirement.status == CustomerRequirement.Status.MATCHING
    assert proposals.teasers_for(invitation.requirement) == []

    proposals.confirm_captured_proposal(proposal_id=proposal.id)

    invitation.requirement.refresh_from_db()
    assert invitation.requirement.status == CustomerRequirement.Status.QUOTES_READY


# ---------------------------------------------------------------------------
# Teasers (FLOW-01)
# ---------------------------------------------------------------------------


def test_a_teaser_shows_a_band_and_never_the_scope_or_the_vendor() -> None:
    invitation = _accepted_invitation()
    proposals.submit_proposal(
        invitation_id=invitation.id,
        total_paise=960_000,
        tax_basis=Proposal.TaxBasis.INCLUSIVE,
        rate_paise_per_worker_day=80_000,
        minimum_days=3,
        worker_count=4,
        inclusions=["Transport", "Supervisor"],
    )

    teasers = proposals.teasers_for(invitation.requirement)

    assert len(teasers) == 1
    teaser = teasers[0]
    assert teaser.price_band_low_paise < A3_TOTAL_PAISE < teaser.price_band_high_paise
    for hidden in ("partner_id", "partner_name", "inclusions", "total_paise", "phone"):
        assert not hasattr(teaser, hidden)


# ---------------------------------------------------------------------------
# Clarification and site visits (M2-BE-311, M2-BE-313, M2-BE-314)
# ---------------------------------------------------------------------------


def test_a_question_is_answered_once_and_lands_on_the_timeline() -> None:
    invitation = _accepted_invitation()
    vendor_user = invitation.partner.user

    question = proposals.ask_question(
        invitation_id=invitation.id, asked_by=vendor_user, question="Is there a lift?"
    )
    answered = proposals.answer_question(
        question_id=question.id,
        answered_by=invitation.requirement.customer,
        answer="No, two floors on foot.",
    )

    assert answered.answered_at is not None
    with pytest.raises(RequirementTransitionError):
        proposals.answer_question(
            question_id=question.id,
            answered_by=invitation.requirement.customer,
            answer="again",
        )


def test_a_phone_number_in_a_question_raises_a_review_signal_not_a_ban() -> None:
    invitation = _accepted_invitation()

    question = proposals.ask_question(
        invitation_id=invitation.id,
        asked_by=invitation.partner.user,
        question="Call me on 9876543210 to discuss",
    )

    assert question.contact_sharing_flagged
    # A signal only: the question is still recorded and answerable.
    assert question.question


def test_ordinary_text_is_not_flagged() -> None:
    invitation = _accepted_invitation()

    question = proposals.ask_question(
        invitation_id=invitation.id,
        asked_by=invitation.partner.user,
        question="How many floors are there?",
    )

    assert not question.contact_sharing_flagged


def test_a_site_visit_must_carry_a_fee() -> None:
    invitation = _accepted_invitation()

    with pytest.raises(ProposalShapeError):
        proposals.request_site_visit(invitation_id=invitation.id, fee_paise=0)


def test_a_site_visit_schedules_and_completes() -> None:
    invitation = _accepted_invitation()
    visit = proposals.request_site_visit(invitation_id=invitation.id, fee_paise=30_000)

    proposals.schedule_site_visit(
        site_visit_id=visit.id, scheduled_for=timezone.now() + timedelta(days=2)
    )
    arrival_code = access.issue_visit_arrival_code(
        site_visit_id=visit.id,
        customer=invitation.requirement.customer,
    )
    access.confirm_visit_arrival_with_code(
        site_visit_id=visit.id,
        vendor_user=invitation.partner.user,
        code=arrival_code.digits or "",
    )
    completed = proposals.complete_site_visit(
        site_visit_id=visit.id, outcome_notes="Measured the site."
    )

    assert completed.status == SiteVisit.Status.COMPLETED
    assert completed.completed_at is not None
    assert completed.adjusts_against_final_price
