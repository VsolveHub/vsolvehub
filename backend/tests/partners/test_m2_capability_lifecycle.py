"""The two proposal 0013 design decisions, at the domain layer.

Both were open questions until 12 August 2026 and both are answered in
`contracts/proposals/0013-m2-partner-capability-crew-and-gates.md` §Answered:

* a capability **rejection is its own state**, because `_ALLOWED_TRANSITIONS` used to send both
  Operations' refusal and the Partner's own exit to `WITHDRAWN`;
* **document validity lives on a nullable `PartnerDocument.expires_on`**, because the
  expired-document state the Partner app models had nothing to read.

The HTTP half of proposal 0013 is tested in `tests/requirements/test_m2_registration_surface.py`,
next to the rest of the M2 surface — `apps/requirements/urls.py` already hosts the Partner-facing M2
routes, so that is where the M2 HTTP fixtures live.
"""

from datetime import timedelta

import pytest
from django.db import IntegrityError, transaction
from django.test import override_settings
from django.utils import timezone

from apps.catalog.models import Category, Service, ServiceVariant, Subcategory
from apps.identity.models import User
from apps.partners import capabilities
from apps.partners.exceptions import (
    BusinessTypeInvalidError,
    CapabilityAlreadyRequestedError,
    CapabilityNotApprovedError,
    CapabilityTransitionError,
)
from apps.partners.gates import GATE_COPY, ProgressiveGate
from apps.partners.models import (
    PartnerApplication,
    PartnerBusinessProfile,
    PartnerCapability,
    PartnerCrewMembership,
    PartnerDocument,
    PartnerProfile,
    Skill,
)

pytestmark = pytest.mark.django_db

COVERAGE_PAISE = 50_000_000
EXPECTED_GATE_COUNT = 3
#: The refused request plus the fresh one a Partner is allowed to make afterwards.
TWO_CAPABILITY_ROWS = 2


def _variant(
    archetype: str = ServiceVariant.BookingArchetype.A3_TIME_BLOCK,
    *,
    code: str = "housekeeping",
) -> ServiceVariant:
    category = Category.objects.create(slug=f"cat-{code}", name=f"Cat {code}")
    subcategory = Subcategory.objects.create(
        category=category,
        slug=f"sub-{code}",
        name=f"Sub {code}",
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


def _partner(phone: str = "+919700000001") -> PartnerProfile:
    user = User.objects.create_user(phone_number=phone, full_name="Agency Owner")
    return PartnerProfile.objects.create(user=user, display_name="Agency")


def _under_review(partner: PartnerProfile, variant: ServiceVariant) -> PartnerCapability:
    capability = capabilities.request_capability(partner=partner, variant=variant)
    return capabilities.transition_capability(
        capability_id=capability.id,
        to_status=PartnerCapability.Status.UNDER_REVIEW,
        actor=None,
        reason_code="queued",
    )


def _approved(partner: PartnerProfile, variant: ServiceVariant) -> PartnerCapability:
    capability = _under_review(partner, variant)
    return capabilities.transition_capability(
        capability_id=capability.id,
        to_status=PartnerCapability.Status.APPROVED,
        actor=None,
        reason_code="ok",
    )


# ---------------------------------------------------------------------------
# Decision 1: a rejection is its own state
# ---------------------------------------------------------------------------


def test_operations_can_reject_a_capability_under_review() -> None:
    partner = _partner()
    capability = _under_review(partner, _variant())

    rejected = capabilities.transition_capability(
        capability_id=capability.id,
        to_status=PartnerCapability.Status.REJECTED,
        actor=None,
        reason_code="not_eligible",
        reason="Your registration covers a different state.",
    )

    assert rejected.status == PartnerCapability.Status.REJECTED
    assert rejected.review_notes == "Your registration covers a different state."


def test_a_rejection_is_distinguishable_from_a_withdrawal() -> None:
    """The whole point of the decision.

    Before 12 August both landed on `WITHDRAWN`, so the Partner app could not tell "we said no" from
    "you closed this" and honestly said neither. Two states, two next actions.
    """
    refused_partner = _partner("+919700000002")
    quit_partner = _partner("+919700000003")
    variant = _variant()
    other_variant = _variant(code="cleaning")

    refused = capabilities.transition_capability(
        capability_id=_under_review(refused_partner, variant).id,
        to_status=PartnerCapability.Status.REJECTED,
        actor=None,
        reason_code="not_eligible",
        reason="Not eligible for this service.",
    )
    quit_capability = capabilities.transition_capability(
        capability_id=_under_review(quit_partner, other_variant).id,
        to_status=PartnerCapability.Status.WITHDRAWN,
        actor=None,
        reason_code="partner_withdrew",
    )

    assert refused.status != quit_capability.status
    assert refused.review_notes
    assert quit_capability.review_notes == ""


def test_rejecting_without_a_reason_is_refused() -> None:
    """A refusal with no reason sends somebody back to re-upload a document that was already right.

    Refused in the domain *and* by `partners_capability_review_state_needs_notes`: the guard for
    the message, the constraint for rows no command wrote.
    """
    partner = _partner()
    capability = _under_review(partner, _variant())

    with pytest.raises(CapabilityTransitionError):
        capabilities.transition_capability(
            capability_id=capability.id,
            to_status=PartnerCapability.Status.REJECTED,
            actor=None,
            reason_code="not_eligible",
        )


def test_requesting_a_correction_without_a_reason_is_refused() -> None:
    partner = _partner()
    capability = _under_review(partner, _variant())

    with pytest.raises(CapabilityTransitionError):
        capabilities.transition_capability(
            capability_id=capability.id,
            to_status=PartnerCapability.Status.CHANGES_REQUIRED,
            actor=None,
            reason_code="documents_unclear",
        )


def test_a_stale_note_does_not_satisfy_a_new_decision() -> None:
    """The reason must arrive with the decision.

    Otherwise a Partner reads last month's problem as this month's, which is worse than no note: it
    sends them to fix something that is already fixed.
    """
    partner = _partner()
    capability = _under_review(partner, _variant())
    capabilities.transition_capability(
        capability_id=capability.id,
        to_status=PartnerCapability.Status.CHANGES_REQUIRED,
        actor=None,
        reason_code="documents_unclear",
        reason="The ID photograph is cropped.",
    )
    capabilities.transition_capability(
        capability_id=capability.id,
        to_status=PartnerCapability.Status.UNDER_REVIEW,
        actor=None,
        reason_code="resubmitted",
    )

    with pytest.raises(CapabilityTransitionError):
        capabilities.transition_capability(
            capability_id=capability.id,
            to_status=PartnerCapability.Status.REJECTED,
            actor=None,
            reason_code="not_eligible",
        )


def test_the_database_refuses_a_correction_state_with_no_note() -> None:
    partner = _partner()
    variant = _variant()

    with pytest.raises(IntegrityError), transaction.atomic():
        PartnerCapability.objects.create(
            partner=partner,
            variant=variant,
            archetype=variant.booking_archetype,
            status=PartnerCapability.Status.CHANGES_REQUIRED,
            review_notes="",
        )


def test_approving_clears_a_correction_note_that_has_been_addressed() -> None:
    """An approved capability publishing the problem that preceded it is a warning about nothing.

    The transition record keeps the history; the live record should not.
    """
    partner = _partner()
    capability = _under_review(partner, _variant())
    capabilities.transition_capability(
        capability_id=capability.id,
        to_status=PartnerCapability.Status.CHANGES_REQUIRED,
        actor=None,
        reason_code="documents_unclear",
        reason="The ID photograph is cropped.",
    )
    capabilities.transition_capability(
        capability_id=capability.id,
        to_status=PartnerCapability.Status.UNDER_REVIEW,
        actor=None,
        reason_code="resubmitted",
    )

    approved = capabilities.transition_capability(
        capability_id=capability.id,
        to_status=PartnerCapability.Status.APPROVED,
        actor=None,
        reason_code="ok",
    )

    assert approved.review_notes == ""


def test_an_approval_that_carries_a_note_keeps_it() -> None:
    """A condition is not a leftover, so an explicit approval note survives."""
    partner = _partner()
    capability = _under_review(partner, _variant())

    approved = capabilities.transition_capability(
        capability_id=capability.id,
        to_status=PartnerCapability.Status.APPROVED,
        actor=None,
        reason_code="ok",
        reason="Approved for up to eight workers pending an insurance check.",
    )

    assert "eight workers" in approved.review_notes


def test_a_rejected_capability_is_terminal() -> None:
    partner = _partner()
    capability = _under_review(partner, _variant())
    capabilities.transition_capability(
        capability_id=capability.id,
        to_status=PartnerCapability.Status.REJECTED,
        actor=None,
        reason_code="not_eligible",
        reason="Not eligible.",
    )

    with pytest.raises(CapabilityTransitionError):
        capabilities.transition_capability(
            capability_id=capability.id,
            to_status=PartnerCapability.Status.APPROVED,
            actor=None,
            reason_code="changed_our_mind",
        )


def test_a_rejection_does_not_ban_the_partner_from_asking_again() -> None:
    """A terminal state that blocked re-application would be a permanent ban dressed as a status.

    `REJECTED` is not in `ACTIVE_STATUSES`, so the new request gets its own row and its own review.
    """
    partner = _partner()
    variant = _variant()
    capabilities.transition_capability(
        capability_id=_under_review(partner, variant).id,
        to_status=PartnerCapability.Status.REJECTED,
        actor=None,
        reason_code="not_eligible",
        reason="Not eligible.",
    )

    fresh = capabilities.request_capability(partner=partner, variant=variant)

    assert fresh.status == PartnerCapability.Status.REQUESTED
    assert (
        PartnerCapability.objects.filter(partner=partner, variant=variant).count()
        == TWO_CAPABILITY_ROWS
    )


def test_a_duplicate_request_raises_the_distinct_code() -> None:
    """`m2_capability_already_requested`, not a generic transition error.

    "Look at the one you already have" and "that move is not allowed" send a Partner to two
    different places. A subclass, so anything catching `CapabilityTransitionError` still works.
    """
    partner = _partner()
    variant = _variant()
    capabilities.request_capability(partner=partner, variant=variant)

    with pytest.raises(CapabilityAlreadyRequestedError) as raised:
        capabilities.request_capability(partner=partner, variant=variant)

    assert raised.value.code == "m2_capability_already_requested"
    assert isinstance(raised.value, CapabilityTransitionError)


def test_a_rejected_capability_does_not_authorise_work() -> None:
    partner = _partner()
    variant = _variant()
    capabilities.transition_capability(
        capability_id=_under_review(partner, variant).id,
        to_status=PartnerCapability.Status.REJECTED,
        actor=None,
        reason_code="not_eligible",
        reason="Not eligible.",
    )

    with pytest.raises(CapabilityNotApprovedError):
        capabilities.assert_capability_active(partner=partner, variant=variant)


# ---------------------------------------------------------------------------
# Decision 2: document validity
# ---------------------------------------------------------------------------


def _document(
    partner: PartnerProfile,
    *,
    kind: str = PartnerDocument.Kind.GOVERNMENT_ID,
    expires_on: object = None,
) -> PartnerDocument:
    application, _created = PartnerApplication.objects.get_or_create(
        partner=partner,
        defaults={"status": PartnerApplication.Status.APPROVED},
    )
    return PartnerDocument.objects.create(
        application=application,
        kind=kind,
        version=1,
        object_key=f"partners/{partner.id}/{kind.lower()}/x.jpg",
        content_type="image/jpeg",
        size_bytes=1024,
        sha256="a" * 64,
        status=PartnerDocument.Status.APPROVED,
        expires_on=expires_on,
    )


def test_a_document_with_no_expiry_never_expires() -> None:
    """Nullable is the answer, not an omission.

    A photograph of a government ID has no platform-tracked expiry, and treating absence as
    staleness would have refused every existing M1 Partner on the day this shipped.
    """
    partner = _partner()
    variant = _variant()
    _approved(partner, variant)
    document = _document(partner)

    assert document.expires_on is None
    assert document.is_expired_on(timezone.localdate()) is False
    assert capabilities.expired_required_document_kinds(partner) == []
    capabilities.assert_capability_active(partner=partner, variant=variant)


def test_an_expired_required_document_blocks_new_work() -> None:
    """Not a policy guess. A required document that has expired is objectively expired.

    The refusal reuses `m2_capability_not_approved` because
    `07-state-machines-and-permissions.md` §8 lists no document-expiry code, and inventing one to
    save a client a string comparison would put a code on the wire that document does not know.
    """
    partner = _partner()
    variant = _variant()
    _approved(partner, variant)
    _document(partner, expires_on=timezone.localdate() - timedelta(days=1))

    with pytest.raises(CapabilityNotApprovedError) as raised:
        capabilities.assert_capability_active(partner=partner, variant=variant)

    assert raised.value.code == "m2_capability_not_approved"
    assert "government id" in raised.value.message.lower()


def test_a_document_expiring_tomorrow_still_authorises_work() -> None:
    partner = _partner()
    variant = _variant()
    _approved(partner, variant)
    tomorrow = timezone.localdate() + timedelta(days=1)
    _document(partner, expires_on=tomorrow)

    capabilities.assert_capability_active(partner=partner, variant=variant)

    assert capabilities.expired_required_document_kinds(partner) == []
    assert capabilities.earliest_required_document_expiry(partner) == tomorrow


def test_a_non_required_document_kind_does_not_block_work() -> None:
    """Which kinds each capability requires beyond the M1 list is owner decision 7.

    Reading `PARTNER_REQUIRED_DOCUMENT_KINDS` rather than inventing a second list is what keeps this
    from guessing at that decision.
    """
    partner = _partner()
    variant = _variant()
    _approved(partner, variant)
    _document(
        partner,
        kind=PartnerDocument.Kind.BACKGROUND_CHECK,
        expires_on=timezone.localdate() - timedelta(days=30),
    )

    capabilities.assert_capability_active(partner=partner, variant=variant)

    assert capabilities.expired_required_document_kinds(partner) == []


@override_settings(PARTNER_REQUIRED_DOCUMENT_KINDS=("GOVERNMENT_ID", "BACKGROUND_CHECK"))
def test_the_required_kinds_come_from_configuration_not_from_code() -> None:
    partner = _partner()
    variant = _variant()
    _approved(partner, variant)
    _document(
        partner,
        kind=PartnerDocument.Kind.BACKGROUND_CHECK,
        expires_on=timezone.localdate() - timedelta(days=30),
    )

    with pytest.raises(CapabilityNotApprovedError):
        capabilities.assert_capability_active(partner=partner, variant=variant)


def test_a_superseded_document_does_not_block_work() -> None:
    """A replaced document is not the live one, and its expiry is history."""
    partner = _partner()
    variant = _variant()
    _approved(partner, variant)
    document = _document(partner, expires_on=timezone.localdate() - timedelta(days=1))
    PartnerDocument.objects.filter(id=document.id).update(
        status=PartnerDocument.Status.SUPERSEDED,
    )

    capabilities.assert_capability_active(partner=partner, variant=variant)


# ---------------------------------------------------------------------------
# Business identity
# ---------------------------------------------------------------------------


def test_an_individual_cannot_carry_a_registration_number() -> None:
    """Fronting `partners_individual_has_no_registration_number` so the field is named.

    Left to the database, a Partner switching from agency to individual would be shown a server
    error for doing something reasonable.
    """
    partner = _partner()

    with pytest.raises(BusinessTypeInvalidError) as raised:
        capabilities.upsert_business_profile(
            partner=partner,
            business_type=PartnerBusinessProfile.BusinessType.INDIVIDUAL,
            registration_number="AP/2019/0042",
        )

    assert raised.value.field == "registration_number"
    assert raised.value.code == "m2_business_type_invalid"


def test_a_gstin_without_gst_registration_is_refused() -> None:
    partner = _partner()

    with pytest.raises(BusinessTypeInvalidError) as raised:
        capabilities.upsert_business_profile(
            partner=partner,
            business_type=PartnerBusinessProfile.BusinessType.WORKFORCE_AGENCY,
            gstin="37ABCDE1234F1Z5",
        )

    assert raised.value.field == "gstin"


def test_switching_business_type_replaces_rather_than_merges() -> None:
    """The reason it is a `PUT`.

    A partial update is how a Partner becomes an `INDIVIDUAL` while keeping the registration number
    the model forbids.
    """
    partner = _partner()
    capabilities.upsert_business_profile(
        partner=partner,
        business_type=PartnerBusinessProfile.BusinessType.WORKFORCE_AGENCY,
        legal_name="Sri Sai Facility Services",
        registration_number="AP/2019/0042",
    )

    switched = capabilities.upsert_business_profile(
        partner=partner,
        business_type=PartnerBusinessProfile.BusinessType.INDIVIDUAL,
        legal_name="Ravi Kumar",
    )

    assert switched.registration_number == ""
    assert switched.business_type == PartnerBusinessProfile.BusinessType.INDIVIDUAL
    assert PartnerBusinessProfile.objects.filter(partner=partner).count() == 1


def test_business_type_is_never_derived_from_a_requested_capability() -> None:
    """Acceptance criterion 12, first half.

    Requesting an A3 capability must not make somebody a `WORKFORCE_AGENCY`: the three types carry
    different tax and liability consequences and the Partner states which one they are.
    """
    partner = _partner()
    capabilities.request_capability(partner=partner, variant=_variant())

    assert not PartnerBusinessProfile.objects.filter(partner=partner).exists()


# ---------------------------------------------------------------------------
# Worker insurance
# ---------------------------------------------------------------------------


def test_declaring_insurance_never_marks_it_verified() -> None:
    """Declared is not insured, and the difference is who pays if a worker is hurt."""
    partner = _partner()

    declaration = capabilities.declare_insurance(
        partner=partner,
        insurer_name="New India Assurance",
        policy_reference="WC/2026/88213",
        coverage_paise=COVERAGE_PAISE,
        covers_workmen_compensation=True,
        valid_from=timezone.localdate(),
        valid_to=timezone.localdate() + timedelta(days=365),
    )

    assert declaration.verified_at is None
    assert declaration.verified_by is None


def test_replacing_a_policy_clears_its_verification() -> None:
    """Swapping a checked policy for an unchecked one must not keep the badge."""
    partner = _partner()
    declaration = capabilities.declare_insurance(
        partner=partner,
        insurer_name="New India Assurance",
        policy_reference="WC/2026/88213",
        coverage_paise=COVERAGE_PAISE,
        covers_workmen_compensation=True,
        valid_from=timezone.localdate(),
        valid_to=timezone.localdate() + timedelta(days=365),
    )
    declaration.verified_at = timezone.now()
    declaration.save(update_fields=("verified_at",))

    replaced = capabilities.declare_insurance(
        partner=partner,
        insurer_name="Oriental Insurance",
        policy_reference="WC/2026/99001",
        coverage_paise=COVERAGE_PAISE,
        covers_workmen_compensation=True,
        valid_from=timezone.localdate(),
        valid_to=timezone.localdate() + timedelta(days=365),
    )

    assert replaced.id == declaration.id
    assert replaced.verified_at is None
    assert replaced.insurer_name == "Oriental Insurance"


def test_an_expired_policy_is_not_the_live_declaration() -> None:
    """A claim is argued against the policy that was live on the day of the work, so both rows stay.

    The read returns nothing rather than the stale one.
    """
    partner = _partner()
    capabilities.declare_insurance(
        partner=partner,
        insurer_name="New India Assurance",
        policy_reference="WC/2025/1",
        coverage_paise=COVERAGE_PAISE,
        covers_workmen_compensation=True,
        valid_from=timezone.localdate() - timedelta(days=400),
        valid_to=timezone.localdate() - timedelta(days=35),
    )

    assert capabilities.live_insurance_declaration(partner) is None


def test_a_zero_coverage_policy_is_refused() -> None:
    partner = _partner()

    with pytest.raises(BusinessTypeInvalidError) as raised:
        capabilities.declare_insurance(
            partner=partner,
            insurer_name="New India Assurance",
            policy_reference="WC/2026/1",
            coverage_paise=0,
            covers_workmen_compensation=True,
            valid_from=timezone.localdate(),
            valid_to=timezone.localdate() + timedelta(days=365),
        )

    assert raised.value.field == "coverage_paise"


# ---------------------------------------------------------------------------
# Progressive gates
# ---------------------------------------------------------------------------


def test_the_gate_read_reports_exactly_three_gates_with_copy_when_unsatisfied() -> None:
    """Acceptance criterion 6 of proposal 0013."""
    partner = _partner()

    states = capabilities.gate_states(partner)

    assert len(states) == EXPECTED_GATE_COUNT
    assert [state.gate for state in states] == [
        ProgressiveGate.KYC,
        ProgressiveGate.PAYOUT_DETAILS,
        ProgressiveGate.CREW_ROSTER,
    ]
    for state in states:
        assert state.is_satisfied is False
        assert state.reason
        assert state.next_action is not None
        assert state.blocks


def test_a_satisfied_gate_carries_no_reason_and_no_next_action() -> None:
    """There is nothing to explain and nowhere to send anybody.

    Publishing copy for a satisfied gate invites a UI that renders a resolved warning.
    """
    partner = _partner()
    capabilities.add_crew_member(
        partner=partner,
        display_name="Ramesh K",
        phone_e164="+919888800001",
    )

    roster_gate = next(
        state
        for state in capabilities.gate_states(partner)
        if state.gate == ProgressiveGate.CREW_ROSTER
    )

    assert roster_gate.is_satisfied is True
    assert roster_gate.reason == ""
    assert roster_gate.next_action is None


def test_the_gate_read_and_the_gate_refusal_publish_the_same_sentence() -> None:
    """Acceptance criterion 7, which is the reason `GATE_COPY` exists at all.

    The same explanation has to arrive two ways — before the Partner tries, and in the `403` after —
    and two copies of it drift the first time the rule changes.
    """
    partner = _partner()
    kyc_gate = next(
        state for state in capabilities.gate_states(partner) if state.gate == ProgressiveGate.KYC
    )

    reason, next_action = capabilities.gate_refusal_detail("m2_kyc_required")

    assert reason == kyc_gate.reason
    assert next_action == kyc_gate.next_action
    assert reason == GATE_COPY["m2_kyc_required"][1]


def test_kyc_is_satisfied_only_by_an_approved_application() -> None:
    partner = _partner()
    application = PartnerApplication.objects.create(
        partner=partner,
        status=PartnerApplication.Status.SUBMITTED,
    )

    submitted = next(
        state for state in capabilities.gate_states(partner) if state.gate == ProgressiveGate.KYC
    )
    application.status = PartnerApplication.Status.APPROVED
    application.save(update_fields=("status",))
    approved = next(
        state for state in capabilities.gate_states(partner) if state.gate == ProgressiveGate.KYC
    )

    assert submitted.is_satisfied is False
    assert approved.is_satisfied is True


# ---------------------------------------------------------------------------
# Crew roster
# ---------------------------------------------------------------------------


def test_re_adding_an_archived_member_reinstates_rather_than_duplicating() -> None:
    """Acceptance criterion 10, and the response must be able to say so.

    "We put Ramesh back on your roster" is the copy that matters; a silent success on a name the
    Partner thought was gone reads as a duplicate that never appeared.
    """
    partner = _partner()
    first = capabilities.add_crew_to_roster(
        partner=partner,
        display_name="Ramesh K",
        phone_e164="+919888800001",
    )
    capabilities.archive_crew_member(membership=first.membership)

    again = capabilities.add_crew_to_roster(
        partner=partner,
        display_name="Ramesh K",
        phone_e164="+919888800001",
    )

    assert first.was_created is True
    assert again.was_created is False
    assert again.was_reinstated is True
    assert again.membership.id == first.membership.id
    assert again.membership.status == PartnerCrewMembership.Status.ACTIVE
    assert PartnerCrewMembership.objects.filter(partner=partner).count() == 1


def test_the_roster_shows_four_digits_and_never_the_global_identity() -> None:
    """Acceptance criterion 8, at the read-model layer.

    Four digits are what let a Partner tell two people called Ramesh apart. The number itself is
    never stored, so a dump of `CrewMember` is not a contact list.
    """
    partner = _partner()
    capabilities.add_crew_to_roster(
        partner=partner,
        display_name="Ramesh K",
        phone_e164="+919888804821",
    )

    entry = capabilities.crew_roster(partner)[0]

    assert entry.phone_masked == "•••••• 4821"
    assert "9888804821" not in entry.phone_masked
    assert not hasattr(entry, "crew_member_id")


def test_updating_a_member_replaces_their_skills_rather_than_accumulating() -> None:
    partner = _partner()
    plumbing = Skill.objects.create(code="plumbing", name="Plumbing")
    housekeeping = Skill.objects.create(code="housekeeping", name="Housekeeping")
    change = capabilities.add_crew_to_roster(
        partner=partner,
        display_name="Ramesh K",
        phone_e164="+919888800001",
        skills=[plumbing],
    )

    capabilities.update_crew_member(
        membership=change.membership,
        skills=[housekeeping],
        is_supervisor=True,
    )

    entry = capabilities.crew_roster(partner)[0]
    assert entry.skill_codes == ("housekeeping",)
    assert entry.is_supervisor is True


def test_one_person_on_two_rosters_is_one_crew_member() -> None:
    """Global identity, which is what makes a cross-agency double-booking detectable at all."""
    first_agency = _partner("+919700000010")
    second_agency = _partner("+919700000011")

    a = capabilities.add_crew_to_roster(
        partner=first_agency,
        display_name="Ramesh K",
        phone_e164="+919888800001",
    )
    b = capabilities.add_crew_to_roster(
        partner=second_agency,
        display_name="Ramesh Kumar",
        phone_e164="+919888800001",
    )

    assert a.membership.crew_member_id == b.membership.crew_member_id
    assert a.membership.id != b.membership.id
