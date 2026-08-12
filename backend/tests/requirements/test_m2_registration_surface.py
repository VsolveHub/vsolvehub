"""The HTTP half of proposal 0013: business identity, capabilities, insurance, gates, crew.

Lives beside the rest of the M2 HTTP tests rather than in `tests/partners/` because the M2 fixtures
do — `apps/requirements/urls.py` already hosts the Partner-facing M2 routes, and one `world` fixture
covering both columns is worth more than tidiness about which app a route's view file sits in. The
domain half of the same proposal is in `tests/partners/test_m2_capability_lifecycle.py`.

Object-level authorization for all of these paths is in `test_m2_http_authorization.py`. This file
is about behaviour: the status codes a client branches on, the copy the server authors, and the two
distinctions the proposal asked for and could not make.
"""

import uuid
from datetime import timedelta
from http import HTTPStatus

import pytest
from django.utils import timezone

from apps.catalog.models import ServiceVariant
from apps.partners import capabilities
from apps.partners.models import (
    PartnerBusinessProfile,
    PartnerCapability,
    PartnerCrewMembership,
    PartnerDocument,
    Skill,
)
from tests.requirements.conftest import M2World, invitation_for, submitted_requirement

pytestmark = pytest.mark.django_db

BUSINESS_TYPE_COUNT = 3
GATE_COUNT = 3
COVERAGE_PAISE = 50_000_000
MAX_CREW = 12
ONE_MEMBER = 1


def _key() -> dict[str, str]:
    return {"HTTP_IDEMPOTENCY_KEY": uuid.uuid4().hex}


# ---------------------------------------------------------------------------
# Business identity
# ---------------------------------------------------------------------------


def test_a_business_profile_can_be_declared_and_read_back(world: M2World) -> None:
    written = world.vendor_client.put(
        "/api/v1/partner/business-profile/",
        {
            "business_type": "WORKFORCE_AGENCY",
            "legal_name": "Sri Sai Facility Services",
            "registration_number": "AP/2019/0042",
            "gst_registered": True,
            "gstin": "37ABCDE1234F1Z5",
            "years_in_operation": 6,
        },
        format="json",
    )
    read = world.vendor_client.get("/api/v1/partner/business-profile/")

    assert written.status_code == HTTPStatus.OK
    assert read.status_code == HTTPStatus.OK
    assert read.json()["business_type"] == "WORKFORCE_AGENCY"
    assert read.json()["gstin"] == "37ABCDE1234F1Z5"


def test_a_registration_number_on_an_individual_is_a_field_error(world: M2World) -> None:
    """`m2_business_type_invalid`, keyed to the field, rather than an `IntegrityError` as a 500.

    `partners_individual_has_no_registration_number` would otherwise refuse the row and the Partner
    would see a server error for doing something reasonable.
    """
    response = world.vendor_client.put(
        "/api/v1/partner/business-profile/",
        {"business_type": "INDIVIDUAL", "registration_number": "AP/2019/0042"},
        format="json",
    )

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert response.json()["error"]["code"] == "m2_business_type_invalid"


def test_a_gstin_without_gst_registration_is_a_field_error(world: M2World) -> None:
    response = world.vendor_client.put(
        "/api/v1/partner/business-profile/",
        {
            "business_type": "WORKFORCE_AGENCY",
            "gst_registered": False,
            "gstin": "37ABCDE1234F1Z5",
        },
        format="json",
    )

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert response.json()["error"]["code"] == "m2_business_type_invalid"


def test_the_put_replaces_rather_than_merging(world: M2World) -> None:
    world.vendor_client.put(
        "/api/v1/partner/business-profile/",
        {
            "business_type": "WORKFORCE_AGENCY",
            "legal_name": "Sri Sai Facility Services",
            "registration_number": "AP/2019/0042",
        },
        format="json",
    )

    switched = world.vendor_client.put(
        "/api/v1/partner/business-profile/",
        {"business_type": "INDIVIDUAL", "legal_name": "Ravi Kumar"},
        format="json",
    )

    assert switched.status_code == HTTPStatus.OK
    assert switched.json()["registration_number"] == ""
    assert switched.json()["business_type"] == "INDIVIDUAL"


# ---------------------------------------------------------------------------
# Capability options and requests
# ---------------------------------------------------------------------------


def test_the_options_read_authors_all_of_its_own_copy(world: M2World) -> None:
    """Server-authored, and the reason is in the consequence text.

    "I supply a team" means nothing on its own; "the customer pays you directly" is the sentence
    that decides whether somebody picks it — and it is the sentence that becomes wrong if the
    commercial mode changes and a client-side table does not.
    """
    world.vendor.capabilities.all().delete()

    response = world.vendor_client.get("/api/v1/partner/capability-options/")

    body = response.json()
    assert response.status_code == HTTPStatus.OK
    assert len(body["business_types"]) == BUSINESS_TYPE_COUNT
    for option in body["business_types"]:
        assert option["label"]
        assert option["consequence"]
    for capability in body["capabilities"]:
        assert capability["lifecycle_explanation"]
        assert capability["workspace_key"] in {"A3_TIME_BLOCK", "A5_CUSTOM_PROJECT"}


def test_the_options_read_names_the_fields_each_archetype_needs(world: M2World) -> None:
    """`asks_for` is what makes one form serve both archetypes.

    A client-side `if archetype === "A3"` is the per-archetype branch `SIM-09` rejects, and this
    field exists so it is unnecessary.
    """
    world.vendor.capabilities.all().delete()

    body = world.vendor_client.get("/api/v1/partner/capability-options/").json()

    by_key = {option["workspace_key"]: option for option in body["capabilities"]}
    assert by_key["A3_TIME_BLOCK"]["asks_for"] == ["max_crew_size"]
    assert by_key["A5_CUSTOM_PROJECT"]["asks_for"] == ["max_project_value_paise"]


def test_requires_insurance_is_published_by_the_server_never_inferred(world: M2World) -> None:
    """The client must not decide that A3 means insurance.

    `request_capability` sets the flag today, and that is a server-side policy which can change per
    variant tomorrow — so the value on the wire is the one the command will apply.
    """
    world.vendor.capabilities.all().delete()

    body = world.vendor_client.get("/api/v1/partner/capability-options/").json()

    by_key = {option["workspace_key"]: option for option in body["capabilities"]}
    assert by_key["A3_TIME_BLOCK"]["requires_insurance"] is True
    assert by_key["A5_CUSTOM_PROJECT"]["requires_insurance"] is False


def test_already_requested_mirrors_the_database_constraint(world: M2World) -> None:
    """So the control is disabled before the refusal rather than after it."""
    body = world.vendor_client.get("/api/v1/partner/capability-options/").json()

    by_key = {option["variant_id"]: option for option in body["capabilities"]}
    assert by_key[str(world.variant.id)]["already_requested"] is True


def test_a_capability_can_be_requested_and_lands_at_requested(world: M2World) -> None:
    world.vendor.capabilities.all().delete()

    response = world.vendor_client.post(
        "/api/v1/partner/capabilities/",
        {"variant_id": str(world.variant.id), "max_crew_size": MAX_CREW},
        format="json",
        **_key(),
    )

    assert response.status_code == HTTPStatus.CREATED
    body = response.json()
    assert body["status"] == "REQUESTED"
    assert body["max_crew_size"] == MAX_CREW
    assert body["commercial_mode"] == "LEAD_ONLY"


def test_a_duplicate_request_answers_the_distinct_code(world: M2World) -> None:
    """Acceptance criterion 4 of proposal 0013.

    The recovery is "open the one you already have", which a generic transition error does not say.
    """
    response = world.vendor_client.post(
        "/api/v1/partner/capabilities/",
        {"variant_id": str(world.variant.id)},
        format="json",
        **_key(),
    )

    assert response.status_code == HTTPStatus.CONFLICT
    assert response.json()["error"]["code"] == "m2_capability_already_requested"


def test_requesting_a_capability_on_a_non_m2_variant_is_a_lifecycle_refusal(
    world: M2World,
) -> None:
    """Not a field error. The Customer-facing equivalent shows "we do not cover this yet"."""
    ServiceVariant.objects.filter(id=world.variant.id).update(
        booking_archetype=ServiceVariant.BookingArchetype.A1_TASK_VISIT,
    )
    world.vendor.capabilities.all().delete()

    response = world.vendor_client.post(
        "/api/v1/partner/capabilities/",
        {"variant_id": str(world.variant.id)},
        format="json",
        **_key(),
    )

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert response.json()["error"]["code"] == "m2_lifecycle_not_supported"


def test_a_replayed_capability_request_returns_the_original_response(world: M2World) -> None:
    world.vendor.capabilities.all().delete()
    key = _key()

    first = world.vendor_client.post(
        "/api/v1/partner/capabilities/",
        {"variant_id": str(world.variant.id)},
        format="json",
        **key,
    )
    replayed = world.vendor_client.post(
        "/api/v1/partner/capabilities/",
        {"variant_id": str(world.variant.id)},
        format="json",
        **key,
    )

    assert first.status_code == HTTPStatus.CREATED
    assert replayed.json() == first.json()
    assert PartnerCapability.objects.filter(partner=world.vendor).count() == 1


def test_the_capability_list_distinguishes_a_rejection_from_a_withdrawal(world: M2World) -> None:
    """The read that makes the navigation states tellable apart.

    An empty workspace-grant list cannot distinguish "not applied", "under review" and "suspended",
    and inferring a review banner from one would show it to every existing M1 Partner.
    """
    capability = PartnerCapability.objects.get(partner=world.vendor, variant=world.variant)
    capabilities.transition_capability(
        capability_id=capability.id,
        to_status=PartnerCapability.Status.SUSPENDED,
        actor=None,
        reason_code="documents-expired",
    )

    body = world.vendor_client.get("/api/v1/partner/capabilities/").json()

    record = next(row for row in body["capabilities"] if row["id"] == str(capability.id))
    assert record["status"] == "SUSPENDED"
    assert record["suspension_reason_code"] == "documents-expired"
    assert record["last_transition"]["to_status"] == "SUSPENDED"
    assert record["last_transition"]["occurred_at"]
    assert "actor_kind" not in record["last_transition"], (
        "a computed actor would mislabel a system-driven change as the Partner's own"
    )


def test_a_changes_required_capability_always_carries_a_note(world: M2World) -> None:
    """Acceptance criterion 5 of proposal 0013, read over the wire."""
    capability = PartnerCapability.objects.get(partner=world.vendor, variant=world.variant)
    capabilities.transition_capability(
        capability_id=capability.id,
        to_status=PartnerCapability.Status.WITHDRAWN,
        actor=None,
        reason_code="reset",
    )
    fresh = capabilities.request_capability(partner=world.vendor, variant=world.variant)
    capabilities.transition_capability(
        capability_id=fresh.id,
        to_status=PartnerCapability.Status.UNDER_REVIEW,
        actor=None,
        reason_code="queued",
    )
    capabilities.transition_capability(
        capability_id=fresh.id,
        to_status=PartnerCapability.Status.CHANGES_REQUIRED,
        actor=None,
        reason_code="documents_unclear",
        reason="The address on your ID does not match the address proof.",
    )

    body = world.vendor_client.get("/api/v1/partner/capabilities/").json()

    record = next(row for row in body["capabilities"] if row["id"] == str(fresh.id))
    assert record["status"] == "CHANGES_REQUIRED"
    assert record["review_notes"] == ("The address on your ID does not match the address proof.")


def test_an_expired_required_document_is_published_on_the_capability(world: M2World) -> None:
    """The distinguishable state the frontend needed, as raw fields rather than a seventh status.

    A computed `EXPIRED` would be a status the model does not have — a second source of truth that
    drifts from the first.
    """
    application = world.vendor.application
    PartnerDocument.objects.create(
        application=application,
        kind=PartnerDocument.Kind.GOVERNMENT_ID,
        version=1,
        object_key=f"partners/{world.vendor.id}/government_id/x.jpg",
        content_type="image/jpeg",
        size_bytes=1024,
        sha256="a" * 64,
        status=PartnerDocument.Status.APPROVED,
        expires_on=timezone.localdate() - timedelta(days=1),
    )

    body = world.vendor_client.get("/api/v1/partner/capabilities/").json()

    approved = [row for row in body["capabilities"] if row["status"] == "APPROVED"]
    assert approved
    assert all(row["expired_document_kinds"] == ["GOVERNMENT_ID"] for row in approved)


def test_a_partner_can_withdraw_their_own_capability(world: M2World) -> None:
    capability = PartnerCapability.objects.get(partner=world.vendor, variant=world.variant)

    response = world.vendor_client.post(
        f"/api/v1/partner/capabilities/{capability.id}/withdraw/",
        {},
        format="json",
    )

    capability.refresh_from_db()
    assert response.status_code == HTTPStatus.OK
    assert capability.status == PartnerCapability.Status.WITHDRAWN
    assert response.json()["status"] == "WITHDRAWN"


def test_withdrawing_twice_is_refused_rather_than_silently_repeated(world: M2World) -> None:
    capability = PartnerCapability.objects.get(partner=world.vendor, variant=world.variant)
    world.vendor_client.post(
        f"/api/v1/partner/capabilities/{capability.id}/withdraw/",
        {},
        format="json",
    )

    again = world.vendor_client.post(
        f"/api/v1/partner/capabilities/{capability.id}/withdraw/",
        {},
        format="json",
    )

    assert again.status_code == HTTPStatus.CONFLICT
    assert again.json()["error"]["code"] == "m2_capability_transition_not_allowed"


# ---------------------------------------------------------------------------
# Insurance
# ---------------------------------------------------------------------------


def test_an_insurance_declaration_is_never_returned_as_verified(world: M2World) -> None:
    """Declared is not insured, and the client must render the difference.

    Only Operations sets `verified_at`, because the difference is who carries the liability if a
    worker is hurt.
    """
    response = world.vendor_client.put(
        "/api/v1/partner/insurance/",
        {
            "insurer_name": "New India Assurance",
            "policy_reference": "WC/2026/88213",
            "coverage_paise": COVERAGE_PAISE,
            "covers_workmen_compensation": True,
            "valid_from": timezone.localdate().isoformat(),
            "valid_to": (timezone.localdate() + timedelta(days=365)).isoformat(),
        },
        format="json",
    )

    assert response.status_code == HTTPStatus.OK
    assert response.json()["verified_at"] is None


def test_a_backwards_policy_range_is_a_field_error(world: M2World) -> None:
    response = world.vendor_client.put(
        "/api/v1/partner/insurance/",
        {
            "insurer_name": "New India Assurance",
            "policy_reference": "WC/2026/88213",
            "coverage_paise": COVERAGE_PAISE,
            "valid_from": timezone.localdate().isoformat(),
            "valid_to": (timezone.localdate() - timedelta(days=1)).isoformat(),
        },
        format="json",
    )

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert "valid_to" in response.content.decode()


# ---------------------------------------------------------------------------
# Progressive gates
# ---------------------------------------------------------------------------


def test_the_gates_read_explains_every_unsatisfied_gate(world: M2World) -> None:
    """Acceptance criterion 6: three gates, and each unsatisfied one carries copy and an action."""
    response = world.vendor_client.get("/api/v1/partner/gates/")

    assert response.status_code == HTTPStatus.OK
    gates = response.json()["gates"]
    assert len(gates) == GATE_COUNT
    assert {gate["gate"] for gate in gates} == {"KYC", "PAYOUT_DETAILS", "CREW_ROSTER"}
    for gate in gates:
        if gate["is_satisfied"]:
            assert gate["reason"] == ""
            assert gate["next_action"] is None
        else:
            assert gate["reason"]
            assert gate["next_action"] is not None


def test_a_gate_blocks_an_action_and_never_a_screen(world: M2World) -> None:
    """`blocks` names actions in the same vocabulary the workspace grant publishes.

    An unsatisfied gate never hides demand; it explains the one control it stands in front of.
    """
    gates = world.vendor_client.get("/api/v1/partner/gates/").json()["gates"]

    blocks = {gate["gate"]: gate["blocks"] for gate in gates}
    assert blocks["KYC"] == ["enquiry.accept"]
    assert blocks["PAYOUT_DETAILS"] == ["payout.receive"]
    assert blocks["CREW_ROSTER"] == ["crew.assign"]


def test_the_gate_read_and_the_refused_command_say_the_same_thing(world: M2World) -> None:
    """Acceptance criterion 7, end to end over HTTP.

    A vendor whose KYC is incomplete reads the explanation on the gates screen, and reads the same
    explanation in the `403` from the accept they tried anyway.
    """
    world.vendor.application.status = world.vendor.application.Status.DRAFT
    world.vendor.application.save(update_fields=("status",))
    requirement = submitted_requirement(world=world)
    invitation = invitation_for(requirement=requirement, partner=world.vendor)

    gates = world.vendor_client.get("/api/v1/partner/gates/").json()["gates"]
    kyc_gate = next(gate for gate in gates if gate["gate"] == "KYC")
    refused = world.vendor_client.post(
        f"/api/v1/partner/enquiries/{invitation.id}/accept/",
        {},
        format="json",
        **_key(),
    )

    assert kyc_gate["is_satisfied"] is False
    assert refused.status_code == HTTPStatus.FORBIDDEN
    assert refused.json()["error"]["code"] == "m2_kyc_required"
    reason, next_action = capabilities.gate_refusal_detail("m2_kyc_required")
    assert reason == kyc_gate["reason"]
    assert next_action == kyc_gate["next_action"]


# ---------------------------------------------------------------------------
# Crew roster
# ---------------------------------------------------------------------------


def test_adding_a_new_crew_member_answers_201(world: M2World) -> None:
    response = world.vendor_client.post(
        "/api/v1/partner/crew/",
        {
            "display_name": "Ramesh K.",
            "phone_e164": "+919888804821",
            "skill_codes": [],
            "is_supervisor": True,
        },
        format="json",
        **_key(),
    )

    assert response.status_code == HTTPStatus.CREATED
    body = response.json()
    assert body["display_name"] == "Ramesh K."
    assert body["phone_masked"] == "•••••• 4821"
    assert body["is_supervisor"] is True


def test_reinstating_an_archived_member_answers_200_not_201(world: M2World) -> None:
    """Acceptance criterion 10, and the status code is the whole point.

    `200` is what lets the UI say "we put Ramesh back on your roster" rather than silently
    succeeding on a name the Partner thought was gone.
    """
    added = world.vendor_client.post(
        "/api/v1/partner/crew/",
        {"display_name": "Ramesh K.", "phone_e164": "+919888804821"},
        format="json",
        **_key(),
    )
    membership = PartnerCrewMembership.objects.get(id=added.json()["membership_id"])
    capabilities.archive_crew_member(membership=membership)

    again = world.vendor_client.post(
        "/api/v1/partner/crew/",
        {"display_name": "Ramesh K.", "phone_e164": "+919888804821"},
        format="json",
        **_key(),
    )

    assert added.status_code == HTTPStatus.CREATED
    assert again.status_code == HTTPStatus.OK
    assert again.json()["membership_id"] == added.json()["membership_id"]
    assert again.json()["status"] == "ACTIVE"


def test_the_roster_is_not_a_general_address_book(world: M2World) -> None:
    """A Partner with no approved workforce capability cannot add crew.

    The roster exists from the moment an A3 capability is approved, and not before.
    """
    PartnerCapability.objects.filter(partner=world.vendor).update(
        status=PartnerCapability.Status.SUSPENDED,
        suspension_reason_code="under-review",
    )

    response = world.vendor_client.post(
        "/api/v1/partner/crew/",
        {"display_name": "Ramesh K.", "phone_e164": "+919888804821"},
        format="json",
        **_key(),
    )

    assert response.status_code == HTTPStatus.FORBIDDEN
    assert response.json()["error"]["code"] == "m2_capability_not_approved"


def test_a_display_name_cannot_be_changed_through_the_roster(world: M2World) -> None:
    """One agency renaming a shared person would rename them on every other roster.

    Published read-only with the reason stated, rather than published editable and scoped in a way a
    later caller can forget — so the field is not in the update serializer at all and is ignored.
    """
    membership = PartnerCrewMembership.objects.filter(partner=world.vendor).first()
    assert membership is not None
    original = membership.crew_member.display_name

    response = world.vendor_client.patch(
        f"/api/v1/partner/crew/{membership.id}/",
        {"display_name": "Somebody Else", "is_supervisor": True},
        format="json",
    )

    membership.refresh_from_db()
    assert response.status_code == HTTPStatus.OK
    assert membership.crew_member.display_name == original
    assert membership.is_supervisor is True


def test_updating_skills_replaces_the_set(world: M2World) -> None:
    membership = PartnerCrewMembership.objects.filter(partner=world.vendor).first()
    assert membership is not None
    Skill.objects.get_or_create(code="housekeeping", defaults={"name": "Housekeeping"})

    response = world.vendor_client.patch(
        f"/api/v1/partner/crew/{membership.id}/",
        {"skill_codes": ["housekeeping"]},
        format="json",
    )

    assert response.status_code == HTTPStatus.OK
    assert response.json()["skill_codes"] == ["housekeeping"]


def test_archiving_a_member_takes_them_off_the_active_roster(world: M2World) -> None:
    membership = PartnerCrewMembership.objects.filter(partner=world.vendor).first()
    assert membership is not None

    response = world.vendor_client.post(
        f"/api/v1/partner/crew/{membership.id}/archive/",
        {},
        format="json",
    )

    membership.refresh_from_db()
    assert response.status_code == HTTPStatus.OK
    assert membership.status == PartnerCrewMembership.Status.ARCHIVED
    assert response.json()["status"] == "ARCHIVED"


def test_an_archived_member_still_appears_in_the_roster_read(world: M2World) -> None:
    """The Partner needs to see who they took off, and re-adding is the ordinary next action.

    Filtering archived rows out of the read would make reinstatement undiscoverable.
    """
    membership = PartnerCrewMembership.objects.filter(partner=world.vendor).first()
    assert membership is not None
    world.vendor_client.post(
        f"/api/v1/partner/crew/{membership.id}/archive/",
        {},
        format="json",
    )

    body = world.vendor_client.get("/api/v1/partner/crew/").json()

    archived = [member for member in body["members"] if member["status"] == "ARCHIVED"]
    assert len(archived) == ONE_MEMBER


def test_a_malformed_phone_number_is_a_field_error(world: M2World) -> None:
    response = world.vendor_client.post(
        "/api/v1/partner/crew/",
        {"display_name": "Ramesh K.", "phone_e164": "9888804821"},
        format="json",
        **_key(),
    )

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert "phone_e164" in response.content.decode()


def test_a_business_profile_is_never_created_by_requesting_a_capability(world: M2World) -> None:
    """Acceptance criterion 12, over HTTP.

    `business_type` carries tax, liability and payout consequences. Deriving it from a capability
    request would be the platform deciding who owes the tax.
    """
    world.vendor.capabilities.all().delete()

    world.vendor_client.post(
        "/api/v1/partner/capabilities/",
        {"variant_id": str(world.variant.id)},
        format="json",
        **_key(),
    )

    assert not PartnerBusinessProfile.objects.filter(partner=world.vendor).exists()
    assert world.vendor_client.get("/api/v1/partner/business-profile/").status_code == (
        HTTPStatus.NOT_FOUND
    )
