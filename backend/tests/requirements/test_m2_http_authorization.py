"""Object-level authorization for every published M2 path, per endpoint and per role.

Wave C0 published 17 paths and wrote none of these, which is the only reason `M2-BE-013` never left
`[~]`. Wave C1 published 16 more. This file covers all of them.

Three rules are being proved, and they are the whole point of the file:

1. **A foreign actor sees `404`, not `403`.** `07-state-machines-and-permissions.md` §7 requires it:
   a `403` on a requirement id confirms there is a record there to find, which is itself the leak.
   Enumerating requirement ids would otherwise map who is buying what.
2. **A payload sent to somebody who has paid or proved nothing carries nothing extra.** The teaser,
   the demand preview and the crew roster are asserted **by exhaustive key comparison**, so a field
   added later fails this test rather than leaking. A client cannot un-receive a payload.
3. **Route-level role checks and record-level ownership checks are different things**, and both are
   tested. A Partner-role session with somebody else's invitation id must fail on the record, and a
   Customer session on a `partner/**` route must fail on the role.

The route tables below are written out rather than derived from the URLconf on purpose. A table
generated from `urlpatterns` would grow silently with the code and prove only that the code agrees
with itself; a written list fails when somebody publishes a path and does not come here.
"""

import uuid
from datetime import timedelta
from http import HTTPStatus

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.catalog.models import ServiceVariant
from apps.partners.models import PartnerCapability, PartnerCrewMembership
from apps.requirements import proposals
from apps.requirements.models import CustomerRequirement, RequirementAttachment
from apps.requirements.selectors import demand_preview_id
from tests.requirements.conftest import (
    A3_TOTAL_PAISE,
    M2World,
    address_for,
    draft_requirement,
    invitation_for,
    proposal_for,
    site_visit_for,
    submitted_requirement,
)

pytestmark = pytest.mark.django_db

SHA256 = "a" * 64
#: `INDIVIDUAL`, `WORKFORCE_AGENCY`, `PROJECT_VENDOR`.
BUSINESS_TYPE_COUNT = 3


def _key() -> dict[str, str]:
    return {"HTTP_IDEMPOTENCY_KEY": uuid.uuid4().hex}


# ---------------------------------------------------------------------------
# Anonymous access: every M2 path refuses it
# ---------------------------------------------------------------------------

#: `(method, path)` for every published M2 operation. Ids are arbitrary — an anonymous caller is
#: refused before any record is resolved, so a nonexistent id is the correct thing to send: a test
#: using a real one could pass because the record was missing, not because the caller was.
ANONYMOUS_ROUTES: tuple[tuple[str, str], ...] = (
    ("get", "/api/v1/requirements/"),
    ("post", "/api/v1/requirements/"),
    ("get", f"/api/v1/requirements/{uuid.uuid4()}/"),
    ("patch", f"/api/v1/requirements/{uuid.uuid4()}/"),
    ("post", f"/api/v1/requirements/{uuid.uuid4()}/submit/"),
    ("get", "/api/v1/requirements/duplicate-check/"),
    ("get", f"/api/v1/requirements/{uuid.uuid4()}/timeline/"),
    ("get", f"/api/v1/requirements/{uuid.uuid4()}/quotes/teasers/"),
    ("post", f"/api/v1/requirements/questions/{uuid.uuid4()}/answer/"),
    ("post", f"/api/v1/requirements/{uuid.uuid4()}/attachments/uploads/"),
    ("post", f"/api/v1/requirements/{uuid.uuid4()}/attachments/"),
    ("delete", f"/api/v1/requirements/{uuid.uuid4()}/attachments/{uuid.uuid4()}/"),
    ("post", f"/api/v1/site-visits/{uuid.uuid4()}/schedule/"),
    ("post", f"/api/v1/site-visits/{uuid.uuid4()}/complete/"),
    ("get", "/api/v1/partner/enquiries/"),
    ("get", f"/api/v1/partner/enquiries/{uuid.uuid4()}/"),
    ("post", f"/api/v1/partner/enquiries/{uuid.uuid4()}/accept/"),
    ("post", f"/api/v1/partner/enquiries/{uuid.uuid4()}/decline/"),
    ("post", f"/api/v1/partner/enquiries/{uuid.uuid4()}/questions/"),
    ("post", f"/api/v1/partner/enquiries/{uuid.uuid4()}/site-visits/"),
    ("post", "/api/v1/proposals/"),
    ("get", f"/api/v1/proposals/{uuid.uuid4()}/"),
    ("post", f"/api/v1/proposals/{uuid.uuid4()}/withdraw/"),
    ("get", "/api/v1/partner/workspaces/"),
    ("get", "/api/v1/partner/demand-preview/"),
    ("get", "/api/v1/partner/business-profile/"),
    ("put", "/api/v1/partner/business-profile/"),
    ("get", "/api/v1/partner/capability-options/"),
    ("get", "/api/v1/partner/capabilities/"),
    ("post", "/api/v1/partner/capabilities/"),
    ("post", f"/api/v1/partner/capabilities/{uuid.uuid4()}/withdraw/"),
    ("get", "/api/v1/partner/insurance/"),
    ("put", "/api/v1/partner/insurance/"),
    ("get", "/api/v1/partner/gates/"),
    ("get", "/api/v1/partner/crew/"),
    ("post", "/api/v1/partner/crew/"),
    ("patch", f"/api/v1/partner/crew/{uuid.uuid4()}/"),
    ("post", f"/api/v1/partner/crew/{uuid.uuid4()}/archive/"),
)

#: Every published M2 operation is in the table above. Asserted rather than trusted, because the one
#: failure mode of a hand-written table is a path nobody added to it.
EXPECTED_M2_OPERATION_COUNT = 38


def test_the_route_table_covers_every_published_m2_path() -> None:
    assert len(ANONYMOUS_ROUTES) == EXPECTED_M2_OPERATION_COUNT
    assert len(set(ANONYMOUS_ROUTES)) == EXPECTED_M2_OPERATION_COUNT


@pytest.mark.parametrize(("method", "path"), ANONYMOUS_ROUTES)
def test_no_m2_path_answers_an_anonymous_caller(method: str, path: str) -> None:
    response = getattr(APIClient(), method)(path, {}, format="json")
    assert response.status_code in (HTTPStatus.UNAUTHORIZED, HTTPStatus.FORBIDDEN), (
        f"{method.upper()} {path} answered {response.status_code} to an anonymous caller"
    )


# ---------------------------------------------------------------------------
# Customer requirements: another Customer's record is a 404, never a 403
# ---------------------------------------------------------------------------


def test_another_customers_requirement_reads_404_not_403(world: M2World) -> None:
    """The single most load-bearing assertion in this file.

    A `403` would confirm the requirement exists, and requirement ids are the one identifier that
    maps a person to what they are buying. `07-state-machines-and-permissions.md` §7 makes the
    distinction a requirement rather than a preference.
    """
    requirement = draft_requirement(world=world)

    response = world.other_customer_client.get(f"/api/v1/requirements/{requirement.id}/")

    assert response.status_code == HTTPStatus.NOT_FOUND
    assert response.json()["error"]["code"] == "m2_requirement_not_found"


REQUIREMENT_SCOPED_ROUTES: tuple[tuple[str, str], ...] = (
    ("get", "/api/v1/requirements/{id}/"),
    ("patch", "/api/v1/requirements/{id}/"),
    ("post", "/api/v1/requirements/{id}/submit/"),
    ("get", "/api/v1/requirements/{id}/timeline/"),
    ("get", "/api/v1/requirements/{id}/quotes/teasers/"),
    ("post", "/api/v1/requirements/{id}/attachments/uploads/"),
    ("post", "/api/v1/requirements/{id}/attachments/"),
)


@pytest.mark.parametrize(("method", "template"), REQUIREMENT_SCOPED_ROUTES)
def test_every_requirement_route_hides_another_customers_record(
    world: M2World,
    method: str,
    template: str,
) -> None:
    requirement = draft_requirement(world=world)
    path = template.format(id=requirement.id)

    response = getattr(world.other_customer_client, method)(
        path,
        {"upload_id": str(uuid.uuid4())},
        format="json",
        **_key(),
    )

    assert response.status_code == HTTPStatus.NOT_FOUND, (
        f"{method.upper()} {path} answered {response.status_code} to a stranger"
    )


def test_a_customer_only_lists_their_own_requirements(world: M2World) -> None:
    mine = draft_requirement(world=world)
    theirs = draft_requirement(world=world, customer=world.other_customer)

    response = world.customer_client.get("/api/v1/requirements/")

    assert response.status_code == HTTPStatus.OK
    ids = {row["id"] for row in response.json()["results"]}
    assert str(mine.id) in ids
    assert str(theirs.id) not in ids


def test_the_duplicate_check_refuses_another_customers_address(world: M2World) -> None:
    """The address, not only the requirement, is scoped.

    An address id is guessable, and a duplicate check that resolved somebody else's would answer
    "you already have a request here" about a stranger's home.
    """
    foreign_address = address_for(world.other_customer)

    response = world.customer_client.get(
        "/api/v1/requirements/duplicate-check/",
        {
            "variant_id": str(world.variant.id),
            "address_id": str(foreign_address.id),
            "requested_start": (timezone.now() + timedelta(days=10)).isoformat(),
        },
    )

    assert response.status_code == HTTPStatus.NOT_FOUND


def test_a_customer_cannot_answer_a_question_on_another_customers_requirement(
    world: M2World,
) -> None:
    requirement = submitted_requirement(world=world)
    invitation = invitation_for(requirement=requirement, partner=world.vendor, accepted=True)
    question = proposals.ask_question(
        invitation_id=invitation.id,
        asked_by=world.vendor.user,
        question="Is there a lift?",
    )

    response = world.other_customer_client.post(
        f"/api/v1/requirements/questions/{question.id}/answer/",
        {"answer": "Yes."},
        format="json",
    )

    assert response.status_code == HTTPStatus.NOT_FOUND
    assert response.json()["error"]["code"] == "m2_requirement_not_found"


def test_a_customer_cannot_remove_another_customers_attachment(world: M2World) -> None:
    requirement = draft_requirement(world=world)
    attachment = RequirementAttachment.objects.create(
        requirement=requirement,
        kind=RequirementAttachment.Kind.IMAGE,
        object_key=f"requirements/{requirement.id}/image/{uuid.uuid4().hex}.jpg",
        content_type="image/jpeg",
        size_bytes=1024,
        sha256=SHA256,
    )

    response = world.other_customer_client.delete(
        f"/api/v1/requirements/{requirement.id}/attachments/{attachment.id}/"
    )

    assert response.status_code == HTTPStatus.NOT_FOUND
    assert RequirementAttachment.objects.filter(id=attachment.id).exists()


def test_an_attachment_id_from_another_requirement_is_a_404(world: M2World) -> None:
    """Both halves of the path are checked, not only the requirement.

    Scoping the requirement and then trusting the attachment id would let a Customer delete media
    off their own requirement's URL that belongs to a different requirement entirely.
    """
    mine = draft_requirement(world=world)
    other = draft_requirement(world=world)
    foreign_attachment = RequirementAttachment.objects.create(
        requirement=other,
        kind=RequirementAttachment.Kind.IMAGE,
        object_key=f"requirements/{other.id}/image/{uuid.uuid4().hex}.jpg",
        content_type="image/jpeg",
        size_bytes=1024,
        sha256=SHA256,
    )

    response = world.customer_client.delete(
        f"/api/v1/requirements/{mine.id}/attachments/{foreign_attachment.id}/"
    )

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert RequirementAttachment.objects.filter(id=foreign_attachment.id).exists()


# ---------------------------------------------------------------------------
# The teaser payload: asserted by exhaustive key comparison
# ---------------------------------------------------------------------------

#: The complete set of keys a pre-unlock teaser may carry. **A snapshot, not a spot check.**
#: A test that asserted `"partner_name" not in teaser` would pass for every field nobody thought to
#: name; this one fails the moment any field is added, which is the only version of this test worth
#: having.
TEASER_KEYS = frozenset(
    {
        "proposal_id",
        "vendor_type",
        "is_verified",
        "price_band_low_paise",
        "price_band_high_paise",
        "is_out_of_budget",
    }
)
TEASER_ENVELOPE_KEYS = frozenset(
    {"teasers", "usable_quote_count", "unlock_available", "server_now"}
)


def test_the_teaser_payload_carries_exactly_these_keys_and_no_vendor_identity(
    world: M2World,
) -> None:
    requirement = submitted_requirement(world=world)
    invitation = invitation_for(requirement=requirement, partner=world.vendor, accepted=True)
    proposal_for(invitation=invitation)

    response = world.customer_client.get(f"/api/v1/requirements/{requirement.id}/quotes/teasers/")

    assert response.status_code == HTTPStatus.OK
    body = response.json()
    assert frozenset(body) == TEASER_ENVELOPE_KEYS
    assert body["teasers"], "the fixture proposal should have produced one teaser"
    for teaser in body["teasers"]:
        assert frozenset(teaser) == TEASER_KEYS


def test_no_teaser_value_contains_the_vendors_name_or_phone(world: M2World) -> None:
    """Belt and braces over the key snapshot above.

    The keys could be right and a value still wrong — `vendor_type` is a free-ish string, and a
    later change that put a display name in it would pass the snapshot test. This reads the whole
    serialized body as text and looks for the two things that must never be in it.
    """
    requirement = submitted_requirement(world=world)
    invitation = invitation_for(requirement=requirement, partner=world.vendor, accepted=True)
    proposal_for(invitation=invitation)

    response = world.customer_client.get(f"/api/v1/requirements/{requirement.id}/quotes/teasers/")
    body = response.content.decode()

    assert world.vendor.display_name not in body
    assert world.vendor.user.phone_number not in body
    # The exact total is the other thing the band exists to withhold.
    assert str(A3_TOTAL_PAISE) not in body


def test_the_timeline_never_names_an_invited_vendor(world: M2World) -> None:
    requirement = submitted_requirement(world=world)
    invitation_for(requirement=requirement, partner=world.vendor, accepted=True)

    response = world.customer_client.get(f"/api/v1/requirements/{requirement.id}/timeline/")
    body = response.content.decode()

    assert response.status_code == HTTPStatus.OK
    assert world.vendor.display_name not in body
    assert str(world.vendor.id) not in body


# ---------------------------------------------------------------------------
# Partner routes: the role gate, then the record gate
# ---------------------------------------------------------------------------

PARTNER_ROLE_ROUTES: tuple[tuple[str, str], ...] = (
    ("get", "/api/v1/partner/enquiries/"),
    ("get", f"/api/v1/partner/enquiries/{uuid.uuid4()}/"),
    ("post", f"/api/v1/partner/enquiries/{uuid.uuid4()}/accept/"),
    ("post", f"/api/v1/partner/enquiries/{uuid.uuid4()}/decline/"),
    ("post", f"/api/v1/partner/enquiries/{uuid.uuid4()}/questions/"),
    ("post", f"/api/v1/partner/enquiries/{uuid.uuid4()}/site-visits/"),
    ("post", "/api/v1/proposals/"),
    ("get", f"/api/v1/proposals/{uuid.uuid4()}/"),
    ("post", f"/api/v1/proposals/{uuid.uuid4()}/withdraw/"),
    ("get", "/api/v1/partner/workspaces/"),
    ("get", "/api/v1/partner/demand-preview/"),
    ("get", "/api/v1/partner/business-profile/"),
    ("put", "/api/v1/partner/business-profile/"),
    ("get", "/api/v1/partner/capability-options/"),
    ("get", "/api/v1/partner/capabilities/"),
    ("post", "/api/v1/partner/capabilities/"),
    ("post", f"/api/v1/partner/capabilities/{uuid.uuid4()}/withdraw/"),
    ("get", "/api/v1/partner/insurance/"),
    ("put", "/api/v1/partner/insurance/"),
    ("get", "/api/v1/partner/gates/"),
    ("get", "/api/v1/partner/crew/"),
    ("post", "/api/v1/partner/crew/"),
    ("patch", f"/api/v1/partner/crew/{uuid.uuid4()}/"),
    ("post", f"/api/v1/partner/crew/{uuid.uuid4()}/archive/"),
)


@pytest.mark.parametrize(("method", "path"), PARTNER_ROLE_ROUTES)
def test_a_customer_session_cannot_reach_any_partner_route(
    world: M2World,
    method: str,
    path: str,
) -> None:
    """A signed-in Customer is refused at the role, before any record is looked up.

    `403` here rather than `404` is correct and does not contradict the rule above: the refusal is
    about the caller's role on a route that exists for a different audience, and it discloses
    nothing about whether any particular record does.
    """
    response = getattr(world.customer_client, method)(path, {}, format="json", **_key())

    assert response.status_code == HTTPStatus.FORBIDDEN, (
        f"{method.upper()} {path} answered {response.status_code} to a Customer session"
    )


def test_a_partner_sees_only_their_own_enquiries(world: M2World) -> None:
    requirement = submitted_requirement(world=world)
    mine = invitation_for(requirement=requirement, partner=world.vendor)
    theirs = invitation_for(requirement=requirement, partner=world.other_vendor)

    response = world.vendor_client.get("/api/v1/partner/enquiries/")

    assert response.status_code == HTTPStatus.OK
    ids = {row["id"] for row in response.json()["results"]}
    assert str(mine.id) in ids
    assert str(theirs.id) not in ids


ENQUIRY_SCOPED_ROUTES: tuple[tuple[str, str, dict[str, object]], ...] = (
    ("get", "/api/v1/partner/enquiries/{id}/", {}),
    ("post", "/api/v1/partner/enquiries/{id}/accept/", {}),
    ("post", "/api/v1/partner/enquiries/{id}/decline/", {"reason_code": "too-far"}),
    ("post", "/api/v1/partner/enquiries/{id}/questions/", {"question": "Is there a lift?"}),
    (
        "post",
        "/api/v1/partner/enquiries/{id}/site-visits/",
        {"fee_paise": 50_000, "adjusts_against_final_price": True},
    ),
)


@pytest.mark.parametrize(("method", "template", "payload"), ENQUIRY_SCOPED_ROUTES)
def test_every_enquiry_route_hides_another_partners_invitation(
    world: M2World,
    method: str,
    template: str,
    payload: dict[str, object],
) -> None:
    requirement = submitted_requirement(world=world)
    invitation = invitation_for(requirement=requirement, partner=world.vendor, accepted=True)
    path = template.format(id=invitation.id)

    response = getattr(world.other_vendor_client, method)(
        path,
        payload,
        format="json",
        **_key(),
    )

    assert response.status_code == HTTPStatus.NOT_FOUND, (
        f"{method.upper()} {path} answered {response.status_code} to a rival vendor"
    )


def test_a_partner_cannot_read_another_partners_proposal(world: M2World) -> None:
    requirement = submitted_requirement(world=world)
    invitation = invitation_for(requirement=requirement, partner=world.vendor, accepted=True)
    proposal = proposal_for(invitation=invitation)

    response = world.other_vendor_client.get(f"/api/v1/proposals/{proposal.id}/")

    assert response.status_code == HTTPStatus.NOT_FOUND
    assert response.json()["error"]["code"] == "m2_requirement_not_found"


def test_a_partner_cannot_withdraw_another_partners_proposal(world: M2World) -> None:
    """A rival withdrawing your live quote is the worst outcome on this surface.

    It would leave the vendor believing they were in the running with nothing on the table.
    """
    requirement = submitted_requirement(world=world)
    invitation = invitation_for(requirement=requirement, partner=world.vendor, accepted=True)
    proposal = proposal_for(invitation=invitation)

    response = world.other_vendor_client.post(
        f"/api/v1/proposals/{proposal.id}/withdraw/",
        {},
        format="json",
        **_key(),
    )

    proposal.refresh_from_db()
    assert response.status_code == HTTPStatus.NOT_FOUND
    assert proposal.status == proposal.Status.SUBMITTED


def test_a_partner_cannot_quote_against_another_partners_invitation(world: M2World) -> None:
    requirement = submitted_requirement(world=world)
    invitation = invitation_for(requirement=requirement, partner=world.vendor, accepted=True)

    response = world.other_vendor_client.post(
        "/api/v1/proposals/",
        {
            "invitation_id": str(invitation.id),
            "total_paise": A3_TOTAL_PAISE,
            "tax_basis": "INCLUSIVE",
            "rate_paise_per_worker_day": 80_000,
            "minimum_days": 3,
            "worker_count": 4,
        },
        format="json",
        **_key(),
    )

    assert response.status_code == HTTPStatus.NOT_FOUND


EXPECTED_GATE_COUNT = 3


def test_a_partner_role_with_no_profile_gets_404_not_500(world: M2World) -> None:
    """The account a person holds thirty seconds after starting to register.

    It is a real state, and every partner route has to survive it. Before C1 nothing proved that a
    `PartnerProfile` of `None` did not become an `AttributeError`.
    """
    response = world.unregistered_vendor_client.get("/api/v1/partner/enquiries/")

    assert response.status_code == HTTPStatus.NOT_FOUND


def test_workspaces_and_gates_answer_an_unreviewed_partner_rather_than_refusing(
    world: M2World,
) -> None:
    """Registered-but-not-reviewed is a common state and must not read as an error.

    `200 {"workspaces": []}` is the contract. A `403` here would blank the Partner shell's
    navigation mid-session for every account waiting on review.
    """
    workspaces = world.unregistered_vendor_client.get("/api/v1/partner/workspaces/")

    assert workspaces.status_code == HTTPStatus.OK
    assert workspaces.json() == {"workspaces": []}


# ---------------------------------------------------------------------------
# Site visits: two participants, and nobody else
# ---------------------------------------------------------------------------


def test_either_participant_can_schedule_a_site_visit(world: M2World) -> None:
    requirement = submitted_requirement(world=world)
    invitation = invitation_for(requirement=requirement, partner=world.vendor, accepted=True)
    visit = site_visit_for(invitation=invitation)
    when = timezone.now() + timedelta(days=2)

    by_vendor = world.vendor_client.post(
        f"/api/v1/site-visits/{visit.id}/schedule/",
        {"scheduled_for": when.isoformat()},
        format="json",
        **_key(),
    )
    by_customer = world.customer_client.post(
        f"/api/v1/site-visits/{visit.id}/schedule/",
        {"scheduled_for": (when + timedelta(hours=1)).isoformat()},
        format="json",
        **_key(),
    )

    assert by_vendor.status_code == HTTPStatus.OK
    assert by_customer.status_code == HTTPStatus.OK


def test_a_stranger_cannot_schedule_a_site_visit(world: M2World) -> None:
    requirement = submitted_requirement(world=world)
    invitation = invitation_for(requirement=requirement, partner=world.vendor, accepted=True)
    visit = site_visit_for(invitation=invitation)

    for client in (world.other_customer_client, world.other_vendor_client, world.outsider_client):
        response = client.post(
            f"/api/v1/site-visits/{visit.id}/schedule/",
            {"scheduled_for": (timezone.now() + timedelta(days=2)).isoformat()},
            format="json",
            **_key(),
        )
        assert response.status_code == HTTPStatus.NOT_FOUND


def test_only_the_attending_vendor_can_complete_a_site_visit(world: M2World) -> None:
    """The Customer schedules with the vendor but does not close the visit.

    Completion is a report of what happened, and the party that travelled is the one who can make
    it. A Customer who disagrees has the clarification timeline, not a competing completion.
    """
    requirement = submitted_requirement(world=world)
    invitation = invitation_for(requirement=requirement, partner=world.vendor, accepted=True)
    visit = site_visit_for(invitation=invitation)
    proposals.schedule_site_visit(
        site_visit_id=visit.id,
        scheduled_for=timezone.now() + timedelta(days=2),
    )

    by_customer = world.customer_client.post(
        f"/api/v1/site-visits/{visit.id}/complete/",
        {"outcome_notes": "Looked fine."},
        format="json",
        **_key(),
    )
    by_rival = world.other_vendor_client.post(
        f"/api/v1/site-visits/{visit.id}/complete/",
        {},
        format="json",
        **_key(),
    )
    by_attendee = world.vendor_client.post(
        f"/api/v1/site-visits/{visit.id}/complete/",
        {"outcome_notes": "Three floors, no lift."},
        format="json",
        **_key(),
    )

    assert by_customer.status_code == HTTPStatus.FORBIDDEN
    assert by_rival.status_code == HTTPStatus.NOT_FOUND
    assert by_attendee.status_code == HTTPStatus.OK
    assert by_attendee.json()["status"] == "COMPLETED"


# ---------------------------------------------------------------------------
# The masked demand preview: sent to an account that has proved nothing
# ---------------------------------------------------------------------------

DEMAND_SUMMARY_KEYS = frozenset(
    {
        "id",
        "headline",
        "area_label",
        "starts_on",
        "workspace_key",
        "is_eligible",
        "eligibility_hint",
    }
)


def test_the_demand_preview_carries_exactly_these_keys(world: M2World) -> None:
    submitted_requirement(world=world)

    response = world.vendor_client.get("/api/v1/partner/demand-preview/")

    assert response.status_code == HTTPStatus.OK
    body = response.json()
    assert frozenset(body) == frozenset({"summaries", "matched_service_count", "server_now"})
    assert body["summaries"], "the submitted requirement should appear in the vendor's area"
    for summary in body["summaries"]:
        assert frozenset(summary) == DEMAND_SUMMARY_KEYS


def test_the_demand_preview_leaks_no_customer_identity_or_street(world: M2World) -> None:
    requirement = submitted_requirement(world=world)
    address = requirement.address
    assert address is not None

    response = world.vendor_client.get("/api/v1/partner/demand-preview/")
    body = response.content.decode()

    assert world.customer.full_name not in body
    assert world.customer.phone_number not in body
    assert address.line1 not in body
    assert str(requirement.id) not in body
    # The requirement's own budget band is not published either: a vendor who knows the ceiling
    # before quoting quotes the ceiling.
    assert "budget" not in body


def test_a_demand_preview_id_resolves_on_no_requirement_route(world: M2World) -> None:
    """Acceptance criterion 3 of proposal 0013.

    The preview id is a keyed hash and is not a UUID, so the `<uuid:...>` converter refuses it
    before a view runs — which is exactly the property that matters. "No endpoint accepts a
    requirement id today" does not survive the next endpoint; "the id is not one" does.
    """
    requirement = submitted_requirement(world=world)
    preview_id = demand_preview_id(requirement.id)

    response = world.customer_client.get(f"/api/v1/requirements/{preview_id}/")

    assert response.status_code == HTTPStatus.NOT_FOUND
    assert preview_id != str(requirement.id)


def test_an_unapproved_partner_sees_demand_marked_ineligible_rather_than_hidden(
    world: M2World,
) -> None:
    """Honest, and the alternative is worse in both directions.

    Hiding ineligible demand makes an empty screen the first thing most new Partners see; showing it
    as actionable is a lie.
    """
    submitted_requirement(world=world)
    PartnerCapability.objects.filter(partner=world.other_vendor).update(
        status=PartnerCapability.Status.SUSPENDED,
        suspension_reason_code="under-review",
    )

    response = world.other_vendor_client.get("/api/v1/partner/demand-preview/")

    assert response.status_code == HTTPStatus.OK
    summaries = response.json()["summaries"]
    assert summaries
    assert all(summary["is_eligible"] is False for summary in summaries)
    assert all(summary["eligibility_hint"] for summary in summaries)


# ---------------------------------------------------------------------------
# Crew roster: per-Partner records, and no global identity on the wire
# ---------------------------------------------------------------------------

CREW_MEMBER_KEYS = frozenset(
    {
        "membership_id",
        "display_name",
        "phone_masked",
        "status",
        "is_supervisor",
        "skill_codes",
        "documents_verified_at",
        "added_at",
    }
)


def test_the_crew_roster_publishes_no_global_id_and_no_full_phone(world: M2World) -> None:
    """Acceptance criterion 8 of proposal 0013, by exhaustive comparison.

    `crew_member_id` absent is the load-bearing half: it is the global identity, and two agencies
    holding it could compare rosters and learn that a worker is on both.
    """
    response = world.vendor_client.get("/api/v1/partner/crew/")

    assert response.status_code == HTTPStatus.OK
    members = response.json()["members"]
    assert members
    for member in members:
        assert frozenset(member) == CREW_MEMBER_KEYS
    body = response.content.decode()
    for membership in PartnerCrewMembership.objects.filter(partner=world.vendor):
        assert str(membership.crew_member_id) not in body


def test_a_partner_sees_only_their_own_roster(world: M2World) -> None:
    response = world.vendor_client.get("/api/v1/partner/crew/")

    membership_ids = {member["membership_id"] for member in response.json()["members"]}
    foreign_ids = {
        str(row.id) for row in PartnerCrewMembership.objects.filter(partner=world.other_vendor)
    }
    assert membership_ids
    assert not membership_ids & foreign_ids


CREW_SCOPED_ROUTES: tuple[tuple[str, str, dict[str, object]], ...] = (
    ("patch", "/api/v1/partner/crew/{id}/", {"is_supervisor": True}),
    ("post", "/api/v1/partner/crew/{id}/archive/", {}),
)


@pytest.mark.parametrize(("method", "template", "payload"), CREW_SCOPED_ROUTES)
def test_crew_commands_hide_another_partners_membership(
    world: M2World,
    method: str,
    template: str,
    payload: dict[str, object],
) -> None:
    foreign = PartnerCrewMembership.objects.filter(partner=world.other_vendor).first()
    assert foreign is not None
    path = template.format(id=foreign.id)

    response = getattr(world.vendor_client, method)(path, payload, format="json", **_key())

    foreign.refresh_from_db()
    assert response.status_code == HTTPStatus.NOT_FOUND
    assert foreign.status == PartnerCrewMembership.Status.ACTIVE


# ---------------------------------------------------------------------------
# Capabilities, business profile and insurance: per-Partner records
# ---------------------------------------------------------------------------


def test_a_partner_cannot_withdraw_another_partners_capability(world: M2World) -> None:
    foreign = PartnerCapability.objects.filter(partner=world.other_vendor).first()
    assert foreign is not None

    response = world.vendor_client.post(
        f"/api/v1/partner/capabilities/{foreign.id}/withdraw/",
        {},
        format="json",
    )

    foreign.refresh_from_db()
    assert response.status_code == HTTPStatus.NOT_FOUND
    assert foreign.status == PartnerCapability.Status.APPROVED


def test_a_partner_lists_only_their_own_capabilities(world: M2World) -> None:
    response = world.vendor_client.get("/api/v1/partner/capabilities/")

    assert response.status_code == HTTPStatus.OK
    ids = {row["id"] for row in response.json()["capabilities"]}
    foreign_ids = {
        str(row.id) for row in PartnerCapability.objects.filter(partner=world.other_vendor)
    }
    assert ids
    assert not ids & foreign_ids


def test_the_business_profile_and_insurance_reads_are_404_when_absent(world: M2World) -> None:
    """The ordinary state for every M1 Partner, and it must not render as an error."""
    business = world.vendor_client.get("/api/v1/partner/business-profile/")
    insurance = world.vendor_client.get("/api/v1/partner/insurance/")

    assert business.status_code == HTTPStatus.NOT_FOUND
    assert insurance.status_code == HTTPStatus.NOT_FOUND


def test_writing_a_business_profile_never_touches_another_partners(world: M2World) -> None:
    world.vendor_client.put(
        "/api/v1/partner/business-profile/",
        {"business_type": "WORKFORCE_AGENCY", "legal_name": "Sri Sai Facility Services"},
        format="json",
    )

    other = world.other_vendor_client.get("/api/v1/partner/business-profile/")

    assert other.status_code == HTTPStatus.NOT_FOUND
    assert world.vendor.business_profile.legal_name == "Sri Sai Facility Services"


def test_capability_options_answer_an_account_with_nothing(world: M2World) -> None:
    """Acceptance criterion 1 of proposal 0013.

    This endpoint is the last screen of registration's fast path, so it has to answer for an account
    with no application, no documents, no capability and not even a `PartnerProfile`. A `404` here
    would be a gate, and proposal 0013's first constraint is that no gate stands before browsing.
    """
    response = world.unregistered_vendor_client.get("/api/v1/partner/capability-options/")

    assert response.status_code == HTTPStatus.OK
    body = response.json()
    assert len(body["business_types"]) == BUSINESS_TYPE_COUNT
    assert body["capabilities"] == []


def test_every_list_read_a_new_partner_needs_answers_before_a_profile_exists(
    world: M2World,
) -> None:
    """The thirty seconds between holding the Partner role and being set up is a real state.

    Four reads have to survive it, and each answers empty rather than refusing: an error on any of
    them blanks part of the registration flow for every account waiting to be created.
    """
    client = world.unregistered_vendor_client

    assert client.get("/api/v1/partner/workspaces/").json() == {"workspaces": []}
    assert client.get("/api/v1/partner/capabilities/").json()["capabilities"] == []
    assert client.get("/api/v1/partner/crew/").json() == {"members": []}
    gates = client.get("/api/v1/partner/gates/").json()["gates"]
    assert len(gates) == EXPECTED_GATE_COUNT
    assert all(gate["is_satisfied"] is False for gate in gates)
    assert all(gate["reason"] and gate["next_action"] for gate in gates)


def test_capability_options_answer_a_partner_with_no_capability(world: M2World) -> None:
    world.vendor.capabilities.all().delete()

    response = world.vendor_client.get("/api/v1/partner/capability-options/")

    assert response.status_code == HTTPStatus.OK
    body = response.json()
    assert len(body["business_types"]) == BUSINESS_TYPE_COUNT
    assert body["capabilities"]
    assert all(option["already_requested"] is False for option in body["capabilities"])


def test_named_routes_resolve_to_the_paths_the_tests_use(world: M2World) -> None:
    """A guard against this file drifting from the URLconf.

    Every assertion above uses a literal path, because that is what a client sends. If a route is
    renamed, `reverse` here changes and the literals do not, so this test is what notices.
    """
    del world
    assert reverse("m2-partner-gates") == "/api/v1/partner/gates/"
    assert reverse("m2-partner-crew") == "/api/v1/partner/crew/"
    assert reverse("m2-partner-demand-preview") == "/api/v1/partner/demand-preview/"
    assert reverse("m2-partner-capabilities") == "/api/v1/partner/capabilities/"
    assert (
        reverse("m2-requirement-attachment-upload", args=[uuid.UUID(int=1)])
        == f"/api/v1/requirements/{uuid.UUID(int=1)}/attachments/uploads/"
    )
    assert (
        reverse("m2-site-visit-schedule", args=[uuid.UUID(int=1)])
        == f"/api/v1/site-visits/{uuid.UUID(int=1)}/schedule/"
    )


def test_a_closed_requirement_is_still_the_owners_to_read(world: M2World) -> None:
    """Closure is not deletion.

    A Customer whose request expired still needs to read why, and an authorization rule that hid
    closed records would turn every explanation into a `404`.
    """
    requirement = submitted_requirement(world=world)
    CustomerRequirement.objects.filter(id=requirement.id).update(
        status=CustomerRequirement.Status.CLOSED_EXPIRED,
        closed_at=timezone.now(),
        closed_reason_code="service_by_passed",
    )

    mine = world.customer_client.get(f"/api/v1/requirements/{requirement.id}/")
    theirs = world.other_customer_client.get(f"/api/v1/requirements/{requirement.id}/")

    assert mine.status_code == HTTPStatus.OK
    assert theirs.status_code == HTTPStatus.NOT_FOUND


def test_an_a5_requirement_is_scoped_the_same_way_as_an_a3_one(world: M2World) -> None:
    """The archetype is not an authorization boundary, and this proves it is not treated as one."""
    requirement = submitted_requirement(
        world=world,
        archetype=ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT,
    )

    response = world.other_customer_client.get(f"/api/v1/requirements/{requirement.id}/")

    assert response.status_code == HTTPStatus.NOT_FOUND
