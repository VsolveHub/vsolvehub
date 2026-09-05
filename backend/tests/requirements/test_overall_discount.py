"""An overall discount is a new, auditable estimate revision—not a notification."""

# ruff: noqa: PLR2004 - exact basis-point and row-count outcomes are assertions under test

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from http import HTTPStatus

import pytest
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.catalog.models import ServiceVariant
from apps.partners.models import PartnerBusinessProfile
from apps.requirements import access, proposals
from apps.requirements.models import (
    CommercialPolicy,
    Proposal,
    RevisionRequest,
    SiteVisit,
    VisitPlan,
)

from .conftest import (
    M2World,
    invitation_for,
    site_visit_for,
    submitted_requirement,
)

pytestmark = pytest.mark.django_db(transaction=True)


def _commercial_policy(world: M2World) -> None:
    PartnerBusinessProfile.objects.create(
        partner=world.vendor,
        business_type=PartnerBusinessProfile.BusinessType.PROJECT_VENDOR,
        legal_name="Sri Sai Facility Private Limited",
        gst_registered=True,
        gstin="36ABCDE1234F1Z5",
        gstin_verified_at=timezone.now(),
        registered_state_code=world.area.state_code,
        tax_profile_effective_from=timezone.localdate() - timedelta(days=1),
    )
    CommercialPolicy.objects.create(
        version=1,
        status=CommercialPolicy.Status.ACTIVE,
        effective_from=timezone.now() - timedelta(days=1),
        approved_at=timezone.now(),
        approved_by=world.operations,
        approval_reference="FINANCE-DISCOUNT-1",
        supplier_of_record="PARTNER",
        material_supplier_of_record="PARTNER",
        visit_supplier_of_record="VSOLVE",
        tax_basis=CommercialPolicy.TaxBasis.EXCLUSIVE,
        tax_rates_bps={"labour": 1_800},
        material_tax_category="labour",
        charge_tax_categories={"TRANSPORT": "labour"},
        platform_fee_treatment=CommercialPolicy.PlatformFeeTreatment.CUSTOMER,
        platform_fee_bps=200,
        platform_fee_tax_bps=1_800,
        commission_bps=500,
        commission_basis=CommercialPolicy.AmountBasis.PARTNER_QUOTE,
        withholding_bps=100,
        withholding_basis=CommercialPolicy.AmountBasis.PARTNER_QUOTE,
    )


def _completed_visit(world: M2World) -> tuple[object, SiteVisit]:
    requirement = submitted_requirement(
        world=world,
        archetype=ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT,
    )
    plan = requirement.visit_plan
    plan.status = VisitPlan.Status.ACTIVE
    plan.charged_at = timezone.now()
    plan.save(update_fields=("status", "charged_at", "updated_at"))
    invitation = invitation_for(requirement=requirement, partner=world.vendor, accepted=True)
    visit = site_visit_for(invitation=invitation)
    visit.status = SiteVisit.Status.SCHEDULED
    visit.scheduled_for = timezone.now() + timedelta(hours=2)
    visit.save(update_fields=("status", "scheduled_for", "updated_at"))
    code = access.issue_visit_arrival_code(site_visit_id=visit.id, customer=world.customer)
    access.confirm_visit_arrival_with_code(
        site_visit_id=visit.id,
        vendor_user=world.vendor.user,
        code=code.digits or "",
    )
    access.complete_plan_visit(site_visit_id=visit.id)
    visit.refresh_from_db()
    return invitation, visit


def _price_ask(world: M2World) -> tuple[Proposal, RevisionRequest]:
    _commercial_policy(world)
    invitation, visit = _completed_visit(world)
    estimate = proposals.submit_proposal(
        invitation_id=invitation.id,
        site_visit_id=visit.id,
        estimate_type=Proposal.EstimateType.ITEM_WISE,
        item_lines=[
            {
                "category": "Electrical",
                "title": "Rewire distribution board",
                "unit": "job",
                "quantity": Decimal("1.000"),
                "rate_paise": 100_000,
            }
        ],
        material_lines=[
            {
                "title": "Copper wire",
                "unit": "metre",
                "quantity": Decimal("10.000"),
                "rate_paise": 2_000,
            }
        ],
        other_charges=[
            {"code": "TRANSPORT", "label": "Material transport", "amount_paise": 10_000}
        ],
        stages=[
            {
                "title": "Installation",
                "deliverable": "Board rewired and tested",
                "amount_paise": 110_000,
            }
        ],
        valid_until=timezone.now() + timedelta(days=7),
    )
    ask = proposals.request_revision(
        requirement_id=estimate.requirement_id,
        proposal_id=estimate.id,
        actor=world.customer,
        reason_code=RevisionRequest.ReasonCode.PRICE,
        excluded_items=[],
        note="Please reduce the overall amount.",
        requested_discount_bps=500,
    )
    return estimate, ask


def test_preview_is_exact_and_writes_nothing(world: M2World) -> None:
    estimate, ask = _price_ask(world)

    preview = proposals.preview_overall_discount(
        proposal_id=estimate.id,
        request_id=ask.id,
        partner_id=world.vendor.id,
        discount_kind=Proposal.DiscountKind.PERCENT,
        discount_bps=500,
        final_total_paise=None,
    )

    expected_total = estimate.total_paise - (estimate.total_paise * 500 + 5_000) // 10_000
    assert preview.calculation.customer_total_paise == expected_total
    assert preview.discount_paise == estimate.total_paise - expected_total
    assert preview.calculation.customer_savings_paise == preview.discount_paise
    assert (
        sum(row["total_due_paise"] for row in preview.calculation.stages)
        + sum(row["total_due_paise"] for row in preview.calculation.material_lines)
        == expected_total
    )
    assert Proposal.objects.filter(invitation=estimate.invitation).count() == 1
    ask.refresh_from_db()
    assert ask.status == RevisionRequest.Status.OPEN


def test_apply_publishes_an_immutable_discounted_revision(world: M2World) -> None:
    estimate, ask = _price_ask(world)

    discounted = proposals.apply_overall_discount(
        proposal_id=estimate.id,
        request_id=ask.id,
        partner_id=world.vendor.id,
        discount_kind=Proposal.DiscountKind.PERCENT,
        discount_bps=500,
        final_total_paise=None,
    )

    estimate.refresh_from_db()
    ask.refresh_from_db()
    assert estimate.status == Proposal.Status.SUPERSEDED
    assert discounted.supersedes_id == estimate.id
    assert discounted.revision == estimate.revision + 1
    assert discounted.discount_kind == Proposal.DiscountKind.PERCENT
    assert discounted.discount_bps == 500
    assert discounted.discount_source == Proposal.DiscountSource.CUSTOMER_REQUEST
    assert discounted.discount_base_paise == estimate.total_paise
    assert discounted.discount_base_paise == discounted.total_paise + discounted.discount_paise
    assert discounted.item_lines == estimate.item_lines
    assert discounted.other_charges == estimate.other_charges
    assert discounted.stages[0]["amount_paise"] == estimate.stages[0]["amount_paise"]
    assert (
        sum(row["total_due_paise"] for row in discounted.stages)
        + sum(row["total_due_paise"] for row in discounted.material_lines)
        == discounted.total_paise
    )
    assert ask.status == RevisionRequest.Status.ANSWERED
    assert ask.countered_discount_bps == 500


def test_apply_endpoint_is_idempotent(world: M2World) -> None:
    estimate, ask = _price_ask(world)
    url = f"/api/v1/proposals/{estimate.id}/revision-requests/{ask.id}/discount/apply/"
    payload = {
        "discount_kind": Proposal.DiscountKind.PERCENT,
        "discount_bps": 500,
        "final_total_paise": None,
    }

    first = world.vendor_client.post(
        url, payload, format="json", HTTP_IDEMPOTENCY_KEY="discount-apply-1"
    )
    repeated = world.vendor_client.post(
        url, payload, format="json", HTTP_IDEMPOTENCY_KEY="discount-apply-1"
    )

    assert first.status_code == HTTPStatus.CREATED
    assert repeated.status_code == HTTPStatus.CREATED
    assert repeated.json() == first.json()
    assert Proposal.objects.filter(invitation=estimate.invitation).count() == 2


def test_fixed_total_preview_enforces_the_fifteen_percent_cap(world: M2World) -> None:
    estimate, ask = _price_ask(world)
    url = f"/api/v1/proposals/{estimate.id}/revision-requests/{ask.id}/discount/preview/"

    accepted = world.vendor_client.post(
        url,
        {
            "discount_kind": Proposal.DiscountKind.FIXED,
            "discount_bps": None,
            "final_total_paise": estimate.total_paise - 5_000,
        },
        format="json",
    )
    refused = world.vendor_client.post(
        url,
        {
            "discount_kind": Proposal.DiscountKind.FIXED,
            "discount_bps": None,
            "final_total_paise": estimate.total_paise // 2,
        },
        format="json",
    )

    assert accepted.status_code == HTTPStatus.OK
    assert accepted.json()["customer_total_paise"] == estimate.total_paise - 5_000
    assert refused.status_code == HTTPStatus.BAD_REQUEST


def test_database_rejects_an_unreconciled_discount_snapshot(world: M2World) -> None:
    estimate, _ask = _price_ask(world)

    with pytest.raises(IntegrityError), transaction.atomic():
        Proposal.objects.filter(pk=estimate.id).update(
            discount_kind=Proposal.DiscountKind.PERCENT,
            discount_bps=500,
            discount_base_paise=estimate.total_paise,
            discount_paise=100,
            discount_source=Proposal.DiscountSource.CUSTOMER_REQUEST,
        )
