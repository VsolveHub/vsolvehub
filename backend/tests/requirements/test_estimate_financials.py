"""Server-owned estimate shape, tax, fee and installment arithmetic."""

# ruff: noqa: PLR2004 - exact paise outcomes are the assertions under test

from datetime import timedelta
from decimal import Decimal
from http import HTTPStatus

import pytest
from django.utils import timezone

from apps.catalog.models import M2VariantConfiguration, ServiceVariant
from apps.partners.models import PartnerBusinessProfile
from apps.requirements import financials, proposals
from apps.requirements.exceptions import (
    FinancialPolicyUnavailableError,
    InstallmentMismatchError,
    ProposalShapeError,
    UnsupportedChargeError,
)
from apps.requirements.models import CommercialPolicy, Proposal

from .conftest import M2World, draft_requirement, invitation_for, submitted_requirement

pytestmark = pytest.mark.django_db


def _tax_profile(world: M2World, *, registered: bool = True) -> PartnerBusinessProfile:
    return PartnerBusinessProfile.objects.create(
        partner=world.vendor,
        business_type=PartnerBusinessProfile.BusinessType.PROJECT_VENDOR,
        legal_name="Sri Sai Facility Private Limited",
        gst_registered=registered,
        gstin="36ABCDE1234F1Z5" if registered else "",
        gstin_verified_at=timezone.now() if registered else None,
        registered_state_code=world.area.state_code if registered else "",
        tax_profile_effective_from=timezone.localdate() - timedelta(days=1),
    )


def _policy(world: M2World, *, tax_basis: str = "EXCLUSIVE") -> CommercialPolicy:
    return CommercialPolicy.objects.create(
        version=1,
        status=CommercialPolicy.Status.ACTIVE,
        effective_from=timezone.now() - timedelta(days=1),
        approved_at=timezone.now(),
        approved_by=world.operations,
        approval_reference="FINANCE-TEST-1",
        supplier_of_record="PARTNER",
        material_supplier_of_record="PARTNER",
        visit_supplier_of_record="VSOLVE",
        tax_basis=tax_basis,
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


def _calculate(world: M2World, **overrides: object) -> financials.CalculationResult:
    requirement = draft_requirement(
        world=world,
        archetype=ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT,
    )
    values: dict[str, object] = {
        "requirement": requirement,
        "partner": world.vendor,
        "estimate_type": Proposal.EstimateType.ITEM_WISE,
        "item_lines": [
            {
                "category": "Electrical",
                "title": "Rewire distribution board",
                "unit": "job",
                "quantity": Decimal("1.000"),
                "rate_paise": 100_000,
            }
        ],
        "material_lines": [
            {
                "title": "Copper wire",
                "unit": "metre",
                "quantity": Decimal("10.000"),
                "rate_paise": 2_000,
            }
        ],
        "other_charges": [
            {"code": "TRANSPORT", "label": "Material transport", "amount_paise": 10_000}
        ],
        "stages": [
            {
                "title": "Installation",
                "deliverable": "Board rewired and tested",
                "amount_paise": 110_000,
            }
        ],
    }
    values.update(overrides)
    return financials.calculate_estimate(**values)  # type: ignore[arg-type]


def test_estimate_pricing_fails_closed_without_approved_policy(world: M2World) -> None:
    _tax_profile(world)

    with pytest.raises(FinancialPolicyUnavailableError):
        _calculate(world)


def test_operations_verifies_tax_identity_and_activates_approved_policy(world: M2World) -> None:
    profile = PartnerBusinessProfile.objects.create(
        partner=world.vendor,
        business_type=PartnerBusinessProfile.BusinessType.PROJECT_VENDOR,
        legal_name="Sri Sai Facility Private Limited",
        gst_registered=True,
        gstin="36ABCDE1234F1Z5",
        tax_profile_effective_from=timezone.localdate(),
    )

    verified = world.operations_client.post(
        f"/api/v1/operations/partners/{world.vendor.id}/tax-profile/verify/",
        {"registered_state_code": "TG"},
        format="json",
    )
    activated = world.operations_client.post(
        "/api/v1/operations/commercial-policies/activate/",
        {
            "version": 7,
            "approval_reference": "FINANCE-LEGAL-2026-08",
            "effective_from": (timezone.now() - timedelta(minutes=1)).isoformat(),
            "supplier_of_record": "PARTNER",
            "material_supplier_of_record": "PARTNER",
            "visit_supplier_of_record": "VSOLVE",
            "tax_basis": "EXCLUSIVE",
            "tax_rates_bps": {"labour": 1_800},
            "material_tax_category": "labour",
            "charge_tax_categories": {"TRANSPORT": "labour"},
            "platform_fee_treatment": "CUSTOMER",
            "platform_fee_bps": 200,
            "platform_fee_tax_bps": 1_800,
            "commission_bps": 500,
            "commission_basis": "PARTNER_QUOTE",
            "withholding_bps": 100,
            "withholding_basis": "PARTNER_QUOTE",
        },
        format="json",
    )

    assert verified.status_code == HTTPStatus.OK
    assert verified.json()["registered_state_code"] == "TG"
    profile.refresh_from_db()
    assert profile.gstin_verified_at is not None
    assert activated.status_code == HTTPStatus.OK
    assert activated.json()["version"] == 7
    assert activated.json()["status"] == CommercialPolicy.Status.ACTIVE


def test_exclusive_tax_fee_and_installments_reconcile_in_integer_paise(world: M2World) -> None:
    _tax_profile(world)
    _policy(world)

    result = _calculate(world)

    assert result.line_subtotal_paise == 100_000
    assert result.material_total_paise == 20_000
    assert result.authorized_charges_paise == 10_000
    assert result.partner_service_tax_paise == 23_400
    assert result.partner_quote_total_paise == 153_400
    assert result.platform_fee_paise == 3_068
    assert result.platform_fee_tax_paise == 552
    assert result.customer_total_paise == 157_020
    assert (
        sum(row["total_due_paise"] for row in result.stages)
        + sum(row["total_due_paise"] for row in result.material_lines)
        == result.customer_total_paise
    )


def test_inclusive_policy_extracts_tax_without_changing_customer_base(world: M2World) -> None:
    _tax_profile(world)
    _policy(world, tax_basis=CommercialPolicy.TaxBasis.INCLUSIVE)

    result = _calculate(world)

    assert result.partner_service_tax_paise == 19_830
    assert result.partner_quote_total_paise == 130_000
    assert result.customer_total_paise > result.partner_quote_total_paise


def test_unregistered_partner_has_zero_service_tax_under_approved_policy(world: M2World) -> None:
    _tax_profile(world, registered=False)
    _policy(world)

    result = _calculate(world)

    assert result.partner_service_tax_paise == 0
    assert result.calculation_snapshot["partner_tax_profile"]["registration_status"] == (
        "UNREGISTERED"
    )


def test_mixed_service_material_and_charge_tax_categories_are_snapshotted(world: M2World) -> None:
    _tax_profile(world)
    policy = _policy(world)
    policy.tax_rates_bps = {"labour": 1_800, "materials": 500, "transport": 1_200}
    policy.material_tax_category = "materials"
    policy.charge_tax_categories = {"TRANSPORT": "transport"}
    policy.save(update_fields=("tax_rates_bps", "material_tax_category", "charge_tax_categories"))

    result = _calculate(world)

    assert result.partner_service_tax_paise == 20_200
    components = result.calculation_snapshot["tax"]["components"]
    assert [(row["purpose"], row["rate_bps"]) for row in components] == [
        ("SERVICE", 1_800),
        ("MATERIAL", 500),
        ("TRANSPORT", 1_200),
    ]


def test_mixed_estimate_modes_unsupported_charges_and_installment_gaps_are_rejected(
    world: M2World,
) -> None:
    _tax_profile(world)
    _policy(world)

    with pytest.raises(ProposalShapeError):
        _calculate(
            world,
            labour_lines=[
                {
                    "role": "Electrician",
                    "team": "A",
                    "member_count": 1,
                    "day_count": 1,
                    "rate_paise_per_day": 100_000,
                }
            ],
        )
    with pytest.raises(UnsupportedChargeError):
        _calculate(
            world,
            other_charges=[{"code": "MISCELLANEOUS", "label": "Misc", "amount_paise": 10_000}],
        )
    with pytest.raises(InstallmentMismatchError):
        _calculate(world, stages=[{"title": "Deposit", "amount_paise": 100_000}])


def test_customer_procured_recipes_are_published_as_a_shopping_list(
    world: M2World,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _tax_profile(world)
    _policy(world)
    recipe = [{"title": "Copper wire", "quantity": "2", "unit": "coil"}]
    monkeypatch.setattr(financials.price_book, "shopping_list_for_lines", lambda _lines: recipe)

    result = _calculate(world)

    assert result.material_fulfilment_mode == Proposal.MaterialFulfilmentMode.CUSTOMER_PROCURES
    assert result.suggested_material_list == recipe
    assert result.suggested_included_supply_list == []


def test_partner_turnkey_recipes_are_disclosure_not_a_customer_shopping_list(
    world: M2World,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    configuration = world.project_variant.m2_configurations.get(status="ACTIVE")
    configuration.material_fulfilment_mode = (
        M2VariantConfiguration.MaterialFulfilmentMode.PARTNER_TURNKEY
    )
    configuration.save(update_fields=("material_fulfilment_mode",))
    _tax_profile(world)
    _policy(world)
    recipe = [{"title": "Warm-white fairy lights", "quantity": "12", "unit": "string"}]
    monkeypatch.setattr(financials.price_book, "shopping_list_for_lines", lambda _lines: recipe)

    result = _calculate(world)

    assert result.material_fulfilment_mode == Proposal.MaterialFulfilmentMode.PARTNER_TURNKEY
    assert result.suggested_material_list == []
    assert result.suggested_included_supply_list == recipe
    assert result.calculation_snapshot["material_fulfilment_mode"] == "PARTNER_TURNKEY"


def test_partner_turnkey_submission_cannot_assign_a_customer_shopping_list(
    world: M2World,
) -> None:
    configuration = world.project_variant.m2_configurations.get(status="ACTIVE")
    configuration.material_fulfilment_mode = (
        M2VariantConfiguration.MaterialFulfilmentMode.PARTNER_TURNKEY
    )
    configuration.save(update_fields=("material_fulfilment_mode",))
    requirement = submitted_requirement(
        world=world,
        archetype=ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT,
    )
    invitation = invitation_for(requirement=requirement, partner=world.vendor, accepted=True)

    with pytest.raises(ProposalShapeError, match="cannot ask the Customer to buy"):
        proposals.submit_proposal(
            invitation_id=invitation.id,
            material_list=[{"title": "Flowers", "quantity": "10", "unit": "bunch"}],
        )


def test_customer_procured_submission_cannot_publish_turnkey_supplies(world: M2World) -> None:
    requirement = submitted_requirement(
        world=world,
        archetype=ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT,
    )
    invitation = invitation_for(requirement=requirement, partner=world.vendor, accepted=True)

    with pytest.raises(ProposalShapeError, match="cannot publish a Partner-turnkey supply list"):
        proposals.submit_proposal(
            invitation_id=invitation.id,
            included_supply_list=[{"title": "Copper wire", "quantity": "2", "unit": "coil"}],
        )


def test_operations_reads_the_policy_history_newest_first(world: M2World) -> None:
    """The console shows what is in force and prefills the next version from it."""
    old = _policy(world)
    old.status = CommercialPolicy.Status.RETIRED
    old.save(update_fields=("status",))
    newer = _policy(world)
    newer.version = 2
    newer.approval_reference = "FINANCE-TEST-2"
    newer.save(update_fields=("version", "approval_reference"))

    response = world.operations_client.get("/api/v1/operations/commercial-policies/")

    assert response.status_code == HTTPStatus.OK
    body = response.json()
    assert [row["version"] for row in body] == [2, 1]
    assert body[0]["status"] == CommercialPolicy.Status.ACTIVE
    assert body[0]["tax_rates_bps"] == {"labour": 1_800}


def test_only_operations_reads_the_policy_history(world: M2World) -> None:
    response = world.customer_client.get("/api/v1/operations/commercial-policies/")
    assert response.status_code == HTTPStatus.FORBIDDEN
