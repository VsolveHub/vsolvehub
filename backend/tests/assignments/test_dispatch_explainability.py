"""BE-07 — dispatch decisions must be explainable to Operations.

`AssignmentAttempt` recorded which candidate was offered and the eligibility inputs, but
never why that candidate was first, nor why the Partners in the same service area who were
not offered were passed over. An Operations agent answering "why did this Partner get this
job" had only a UUID sort buried in a queryset to point at.

There is no business ranking in M1 and these tests do not invent one. They hold that the
order which *does* run is recorded honestly: the policy that ran, the pool it considered,
the single factor that decided it, and a named reason for every Partner it passed over.
"""

from http import HTTPStatus

import pytest
from django.core.management import call_command
from rest_framework.test import APIClient

from apps.assignments.models import AssignmentAttempt, PartnerOffer
from apps.assignments.ranking import (
    RANKING_POLICY,
    RANKING_POLICY_VERSION,
    ExclusionReason,
    evaluate_unit_candidates,
)
from apps.carts.models import BookingGroup, FulfilmentUnit
from apps.identity.models import Role, User, UserRole
from tests.assignments.test_group_dispatch import _checkout, _quote
from tests.carts.test_fulfilment_planning import (
    _add_item,
    _address_payload,
    _partner,
    _plan,
)
from tests.helpers import force_role_client

pytestmark = pytest.mark.django_db(transaction=True)

CUSTOMER = "+919876543210"


def _dispatched_unit(*, phone: str, key: str) -> FulfilmentUnit:
    """Run one Customer from empty cart to dispatch and return the unit it produced."""
    customer = User.objects.create_user(phone_number=phone)
    client = APIClient()
    client.force_authenticate(customer)
    cart_version = client.get("/api/v1/cart/").json()["version"]
    address = client.post("/api/v1/addresses/", _address_payload(), format="json")
    assert address.status_code == HTTPStatus.CREATED
    item = _add_item(client, slug="switch-socket-repair", cart_version=cart_version)
    plans = _plan(client, address_id=address.json()["id"], cart_version=int(item["version"]))
    quote = _quote(client, plans["plans"][0]["id"], key=f"{key}-quote")
    checkout = _checkout(client, quote["id"], key=f"{key}-checkout")
    group = BookingGroup.objects.get(id=checkout["booking_group"]["id"])
    return FulfilmentUnit.objects.select_related("service_area").get(booking_group=group)


def _operations_client(*, phone: str) -> APIClient:
    role, _created = Role.objects.get_or_create(
        code="operations",
        defaults={"name": "Operations", "is_system": True},
    )
    user = User.objects.create_user(phone_number=phone)
    UserRole.objects.create(user=user, role=role)
    return force_role_client(user=user, role_code="operations")


def test_the_evaluator_names_a_reason_for_every_excluded_candidate() -> None:
    call_command("seed_technician_catalog")
    offered = _partner(suffix="80", variant_slugs=("switch-socket-repair",))
    wrong_service = _partner(suffix="81", variant_slugs=("fan-installation",))
    unit = _dispatched_unit(phone=CUSTOMER, key="evaluator")

    ranking = evaluate_unit_candidates(unit)

    by_partner = {item.partner.id: item for item in ranking.evaluations}
    assert by_partner[wrong_service.id].exclusions == (ExclusionReason.VARIANT_NOT_OFFERED,)
    # The Partner holding the live offer already has an attempt against this unit.
    assert ExclusionReason.ALREADY_ATTEMPTED in by_partner[offered.id].exclusions
    assert wrong_service.id not in {item.id for item in ranking.ordered}


def test_the_provenance_document_records_the_policy_pool_and_factors() -> None:
    call_command("seed_technician_catalog")
    _first = _partner(suffix="82", variant_slugs=("switch-socket-repair",))
    _second = _partner(suffix="83", variant_slugs=("switch-socket-repair",))
    unit = _dispatched_unit(phone=CUSTOMER, key="provenance")
    attempt = AssignmentAttempt.objects.get(fulfilment_unit=unit)

    snapshot = attempt.ranking_snapshot

    assert snapshot["policy"] == RANKING_POLICY
    assert snapshot["policy_version"] == RANKING_POLICY_VERSION
    assert snapshot["pool"]["scope"] == "service_area"
    assert snapshot["pool"]["service_area_id"] == str(unit.service_area_id)
    assert snapshot["selected"]["partner_id"] == str(attempt.candidate_id)
    assert snapshot["selected"]["rank"] == 1
    ranked = snapshot["ranked"]
    assert [entry["rank"] for entry in ranked] == list(range(1, len(ranked) + 1))
    # The order has exactly one input today, and the document says so rather than
    # publishing a score that no code computes.
    assert ranked[0]["factors"] == {"tiebreak_partner_id": str(attempt.candidate_id)}


def test_operations_can_read_why_each_candidate_was_ordered() -> None:
    call_command("seed_technician_catalog")
    _first = _partner(suffix="84", variant_slugs=("switch-socket-repair",))
    _excluded = _partner(suffix="85", variant_slugs=("fan-installation",))
    unit = _dispatched_unit(phone=CUSTOMER, key="ops-read")
    offer = PartnerOffer.objects.get(fulfilment_unit=unit)

    response = _operations_client(phone="+919812340084").get(
        f"/api/v1/operations/fulfilment-units/{unit.id}/dispatch-explanation/"
    )

    assert response.status_code == HTTPStatus.OK
    body = response.json()
    assert body["fulfilment_unit_id"] == str(unit.id)
    assert body["policy"] == RANKING_POLICY
    attempt = body["attempts"][0]
    assert attempt["rank"] == 1
    assert attempt["partner_id"] == str(offer.partner_id)
    assert attempt["offer_status"] == PartnerOffer.Status.OFFERED
    assert attempt["ranked"][0]["factors"] == {"tiebreak_partner_id": str(offer.partner_id)}
    assert any(
        entry["reasons"] == [ExclusionReason.VARIANT_NOT_OFFERED] for entry in attempt["excluded"]
    )


def test_a_partner_session_cannot_read_the_dispatch_explanation() -> None:
    """Ranking inputs are Operations-only.

    The document names every Partner in the service area and why each was passed over.
    Published to a Partner it would disclose who else was considered for the same job.
    """
    call_command("seed_technician_catalog")
    partner = _partner(suffix="86", variant_slugs=("switch-socket-repair",))
    unit = _dispatched_unit(phone=CUSTOMER, key="ops-denied")
    role, _created = Role.objects.get_or_create(
        code="partner",
        defaults={"name": "Partner", "is_system": True},
    )
    UserRole.objects.get_or_create(user=partner.user, role=role)

    response = force_role_client(user=partner.user, role_code="partner").get(
        f"/api/v1/operations/fulfilment-units/{unit.id}/dispatch-explanation/"
    )

    assert response.status_code == HTTPStatus.FORBIDDEN
    assert response.json()["error"]["code"] == "permission_denied"
