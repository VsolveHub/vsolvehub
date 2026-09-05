"""Pure, integer-paise estimate calculation backed by an approved policy snapshot."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from django.db import models, transaction
from django.utils import timezone

from apps.foundation.services import enqueue_outbox_event
from apps.identity.models import User
from apps.partners.models import PartnerBusinessProfile, PartnerProfile
from apps.requirements import price_book
from apps.requirements.exceptions import (
    FinancialPolicyUnavailableError,
    InstallmentMismatchError,
    ProposalShapeError,
    UnsupportedChargeError,
)
from apps.requirements.models import CommercialPolicy, CustomerRequirement, Proposal

ALLOWED_UNITS = frozenset(
    {"each", "job", "hour", "day", "sq_ft", "running_ft", "metre", "kg", "litre", "set"}
)
ALLOWED_CHARGE_CODES = frozenset(
    {"TRANSPORT", "LOADING_UNLOADING", "DISPOSAL", "PERMIT", "EQUIPMENT_DELIVERY", "CUSTOM"}
)
MAX_BASIS_POINTS = 10_000


@dataclass(frozen=True, slots=True)
class CalculationResult:
    estimate_type: str
    item_lines: list[dict[str, Any]]
    labour_lines: list[dict[str, Any]]
    material_lines: list[dict[str, Any]]
    other_charges: list[dict[str, Any]]
    stages: list[dict[str, Any]]
    line_subtotal_paise: int
    material_total_paise: int
    authorized_charges_paise: int
    discount_base_paise: int
    pricing_discount_paise: int
    pre_discount_customer_total_paise: int
    customer_savings_paise: int
    taxable_value_paise: int
    partner_service_tax_paise: int
    partner_quote_total_paise: int
    platform_fee_paise: int
    platform_fee_tax_paise: int
    customer_total_paise: int
    commission_paise: int
    withholding_paise: int
    partner_net_paise: int
    tax_basis: str
    policy_version: int
    calculation_snapshot: dict[str, Any]
    #: What the Customer should buy, built from the catalog lines' material recipes. Quantities
    #: only; the Partner corrects it before sending and the corrected list is what is stored.
    suggested_material_list: list[dict[str, Any]]
    #: The same recipe projection for Partner-turnkey work. It describes what the Partner includes
    #: inside the quoted rates and never contributes money a second time.
    suggested_included_supply_list: list[dict[str, Any]]
    material_fulfilment_mode: str

    def as_payload(self) -> dict[str, Any]:
        return asdict(self)


def _bps(amount: int, basis_points: int) -> int:
    """Round half-up once per named allocation, using integer arithmetic."""

    return (amount * basis_points + 5_000) // 10_000


def material_fulfilment_mode(requirement: CustomerRequirement) -> str:
    """Return the versioned procurement decision, refusing an unconfigured A5 estimate."""

    configuration = requirement.configuration
    mode = configuration.material_fulfilment_mode if configuration is not None else ""
    allowed = {
        Proposal.MaterialFulfilmentMode.CUSTOMER_PROCURES,
        Proposal.MaterialFulfilmentMode.PARTNER_TURNKEY,
    }
    if mode not in allowed:
        raise FinancialPolicyUnavailableError(
            "Operations has not configured who supplies materials for this service."
        )
    return str(mode)


def _inclusive_tax(gross: int, basis_points: int) -> int:
    if basis_points == 0:
        return 0
    return (gross * basis_points + (10_000 + basis_points) // 2) // (10_000 + basis_points)


def _quantity_amount(quantity: Decimal, rate_paise: int) -> int:
    return int((quantity * Decimal(rate_paise)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def active_policy(*, at: datetime | None = None) -> CommercialPolicy:
    moment = at or timezone.now()
    policy = (
        CommercialPolicy.objects.filter(
            status=CommercialPolicy.Status.ACTIVE,
            approved_at__isnull=False,
            approved_by__isnull=False,
            effective_from__lte=moment,
        )
        .filter(models.Q(effective_until__isnull=True) | models.Q(effective_until__gt=moment))
        .first()
    )
    required = (
        "supplier_of_record",
        "material_supplier_of_record",
        "visit_supplier_of_record",
        "tax_basis",
        "platform_fee_treatment",
        "commission_basis",
        "withholding_basis",
        "approval_reference",
        "material_tax_category",
    )
    if policy is None or any(not getattr(policy, field) for field in required):
        raise FinancialPolicyUnavailableError()
    if any(
        value is None
        for value in (
            policy.platform_fee_bps,
            policy.platform_fee_tax_bps,
            policy.commission_bps,
            policy.withholding_bps,
        )
    ):
        raise FinancialPolicyUnavailableError()
    if policy.platform_fee_treatment == CommercialPolicy.PlatformFeeTreatment.PARTNER and (
        policy.platform_fee_bps and policy.commission_bps
    ):
        raise FinancialPolicyUnavailableError(
            "The active policy duplicates a Partner platform deduction and commission."
        )
    return policy


@transaction.atomic
def activate_policy(
    *,
    actor: User,
    version: int,
    approval_reference: str,
    effective_from: datetime,
    effective_until: datetime | None,
    supplier_of_record: str,
    material_supplier_of_record: str,
    visit_supplier_of_record: str,
    tax_basis: str,
    tax_rates_bps: dict[str, int],
    material_tax_category: str,
    charge_tax_categories: dict[str, str],
    platform_fee_treatment: str,
    platform_fee_bps: int,
    platform_fee_tax_bps: int,
    commission_bps: int,
    commission_basis: str,
    withholding_bps: int,
    withholding_basis: str,
) -> CommercialPolicy:
    """Record and activate one Finance/legal-approved policy, idempotently by version."""

    if not approval_reference.strip() or not tax_rates_bps or not material_tax_category:
        raise FinancialPolicyUnavailableError(
            "An approval reference and tax-rate table are required."
        )
    if effective_until is not None and effective_until <= effective_from:
        raise FinancialPolicyUnavailableError("Policy end must be after its effective start.")
    if any(
        not isinstance(rate, int) or not 0 <= rate <= MAX_BASIS_POINTS
        for rate in tax_rates_bps.values()
    ):
        raise FinancialPolicyUnavailableError("Every tax rate must be integer basis points.")
    unknown_charge_codes = set(charge_tax_categories) - ALLOWED_CHARGE_CODES
    if unknown_charge_codes:
        raise UnsupportedChargeError(
            f"Unsupported charge policy codes: {', '.join(sorted(unknown_charge_codes))}."
        )
    unmapped_categories = {
        material_tax_category,
        *charge_tax_categories.values(),
    } - set(tax_rates_bps)
    if unmapped_categories:
        raise FinancialPolicyUnavailableError(
            f"Tax rates are missing for: {', '.join(sorted(unmapped_categories))}."
        )
    values: dict[str, Any] = {
        "approval_reference": approval_reference.strip(),
        "effective_from": effective_from,
        "effective_until": effective_until,
        "supplier_of_record": supplier_of_record,
        "material_supplier_of_record": material_supplier_of_record,
        "visit_supplier_of_record": visit_supplier_of_record,
        "tax_basis": tax_basis,
        "tax_rates_bps": tax_rates_bps,
        "material_tax_category": material_tax_category,
        "charge_tax_categories": charge_tax_categories,
        "platform_fee_treatment": platform_fee_treatment,
        "platform_fee_bps": platform_fee_bps,
        "platform_fee_tax_bps": platform_fee_tax_bps,
        "commission_bps": commission_bps,
        "commission_basis": commission_basis,
        "withholding_bps": withholding_bps,
        "withholding_basis": withholding_basis,
    }
    existing = CommercialPolicy.objects.select_for_update().filter(version=version).first()
    if existing is not None and existing.status == CommercialPolicy.Status.ACTIVE:
        return existing
    CommercialPolicy.objects.select_for_update().filter(
        status=CommercialPolicy.Status.ACTIVE
    ).update(status=CommercialPolicy.Status.RETIRED, updated_at=timezone.now())
    if existing is None:
        policy = CommercialPolicy(version=version, **values)
    else:
        policy = existing
        for field, value in values.items():
            setattr(policy, field, value)
    policy.status = CommercialPolicy.Status.ACTIVE
    policy.approved_by = actor
    policy.approved_at = timezone.now()
    policy.full_clean()
    policy.save()
    enqueue_outbox_event(
        aggregate_type="commercial_policy",
        aggregate_id=policy.id,
        event_type="m2.commercial_policy.activated",
        idempotency_key=f"commercial-policy-activated:{version}",
        payload={
            "version": version,
            "approval_reference": policy.approval_reference,
            "approved_by": str(actor.id),
            "effective_from": effective_from.isoformat(),
        },
    )
    return policy


def _tax_identity(*, partner: PartnerProfile) -> PartnerBusinessProfile:
    profile = PartnerBusinessProfile.objects.filter(partner=partner).first()
    if profile is None or profile.tax_profile_effective_from is None:
        raise FinancialPolicyUnavailableError("The Partner tax profile has not been verified.")
    if profile.gst_registered and (
        not profile.gstin or not profile.gstin_verified_at or not profile.registered_state_code
    ):
        raise FinancialPolicyUnavailableError("The Partner GST registration is not verified.")
    return profile


def _normalise_items(lines: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    output: list[dict[str, Any]] = []
    for line in lines:
        unit = str(line["unit"])
        if unit not in ALLOWED_UNITS:
            raise ProposalShapeError(f"Unsupported unit: {unit}.")
        quantity = Decimal(line["quantity"])
        amount = _quantity_amount(quantity, int(line["rate_paise"]))
        output.append({**line, "quantity": str(quantity), "amount_paise": amount})
    return output, sum(int(line["amount_paise"]) for line in output)


def _normalise_labour(lines: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    output: list[dict[str, Any]] = []
    for line in lines:
        amount = (
            int(line["member_count"]) * int(line["day_count"]) * int(line["rate_paise_per_day"])
        )
        output.append({**line, "amount_paise": amount})
    return output, sum(int(line["amount_paise"]) for line in output)


def _normalise_materials(lines: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    output: list[dict[str, Any]] = []
    for line in lines:
        quantity = Decimal(line.get("quantity") or 1)
        rate = int(line.get("rate_paise") or line.get("amount_paise") or 0)
        amount = _quantity_amount(quantity, rate)
        if amount <= 0:
            raise ProposalShapeError("Material amounts must be positive.")
        output.append(
            {**line, "quantity": str(quantity), "rate_paise": rate, "amount_paise": amount}
        )
    return output, sum(int(line["amount_paise"]) for line in output)


def _normalise_charges(lines: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    output: list[dict[str, Any]] = []
    seen: set[str] = set()
    for line in lines:
        code = str(line["code"])
        label = str(line.get("label") or "").strip()
        amount = int(line["amount_paise"])
        if code not in ALLOWED_CHARGE_CODES:
            raise UnsupportedChargeError(f"Unsupported charge code: {code}.")
        if code in seen:
            raise UnsupportedChargeError(f"Only one {code.lower()} charge is allowed.")
        if not label or label.lower() in {"misc", "miscellaneous", "other"} or amount <= 0:
            raise UnsupportedChargeError("Every charge needs a specific name and positive amount.")
        seen.add(code)
        output.append({"code": code, "label": label, "amount_paise": amount})
    return output, sum(int(line["amount_paise"]) for line in output)


def _allocate(total: int, weights: list[int]) -> list[int]:
    if not weights:
        return []
    denominator = sum(weights)
    allocations = [(total * weight) // denominator for weight in weights]
    allocations[-1] += total - sum(allocations)
    return allocations


@dataclass(frozen=True, slots=True)
class _PriceOutcome:
    tax_components: list[dict[str, Any]]
    tax: int
    pre_tax_value: int
    gross_priced_value: int
    quote_total: int
    platform_fee: int
    platform_fee_tax: int
    customer_fee: int
    partner_fee: int
    commission: int
    withholding: int
    partner_net: int

    @property
    def customer_total(self) -> int:
        return self.quote_total + self.customer_fee


def _discounted_tax_groups(
    tax_groups: list[tuple[str, str, int]], discount_paise: int
) -> list[tuple[str, str, int, int, int]]:
    """Allocate one overall discount across every priced tax group.

    The estimate keeps its authored item and charge rates. This allocation exists for statutory
    tax and settlement arithmetic only: each group carries ``gross, discount, net`` and the
    customer sees the concession once, at the estimate total.
    """

    gross_values = [amount for _purpose, _category, amount in tax_groups]
    gross_total = sum(gross_values)
    if discount_paise < 0 or discount_paise >= gross_total:
        raise ProposalShapeError("The overall discount must leave a positive estimate amount.")
    allocations = (
        _allocate(discount_paise, gross_values) if discount_paise else [0] * len(tax_groups)
    )
    return [
        (purpose, category, gross, allocated, gross - allocated)
        for (purpose, category, gross), allocated in zip(tax_groups, allocations, strict=True)
    ]


def _price_outcome(
    *,
    tax_groups: list[tuple[str, str, int]],
    discount_paise: int,
    policy: CommercialPolicy,
    gst_registered: bool,
) -> _PriceOutcome:
    tax_components: list[dict[str, Any]] = []
    tax = 0
    pre_tax_value = 0
    gross_priced_value = 0
    for purpose, category, gross_amount, allocated_discount, amount in _discounted_tax_groups(
        tax_groups, discount_paise
    ):
        raw_rate = policy.tax_rates_bps.get(category) if gst_registered else 0
        if not isinstance(raw_rate, int) or not 0 <= raw_rate <= MAX_BASIS_POINTS:
            raise FinancialPolicyUnavailableError(f"Tax category {category} has no approved rate.")
        component_tax = (
            _inclusive_tax(amount, raw_rate)
            if policy.tax_basis == CommercialPolicy.TaxBasis.INCLUSIVE
            else _bps(amount, raw_rate)
        )
        component_taxable = (
            amount - component_tax
            if policy.tax_basis == CommercialPolicy.TaxBasis.INCLUSIVE
            else amount
        )
        tax += component_tax
        pre_tax_value += component_taxable
        gross_priced_value += amount
        tax_components.append(
            {
                "purpose": purpose,
                "category_code": category,
                "rate_bps": raw_rate,
                "pre_discount_priced_value_paise": gross_amount,
                "discount_paise": allocated_discount,
                "priced_value_paise": amount,
                "taxable_value_paise": component_taxable,
                "tax_paise": component_tax,
            }
        )
    quote_total = (
        gross_priced_value
        if policy.tax_basis == CommercialPolicy.TaxBasis.INCLUSIVE
        else gross_priced_value + tax
    )
    platform_fee = _bps(quote_total, int(policy.platform_fee_bps or 0))
    platform_fee_tax = _bps(platform_fee, int(policy.platform_fee_tax_bps or 0))
    customer_fee = (
        platform_fee + platform_fee_tax
        if policy.platform_fee_treatment == CommercialPolicy.PlatformFeeTreatment.CUSTOMER
        else 0
    )
    partner_fee = (
        platform_fee
        if policy.platform_fee_treatment == CommercialPolicy.PlatformFeeTreatment.PARTNER
        else 0
    )
    commission_base = (
        pre_tax_value
        if policy.commission_basis == CommercialPolicy.AmountBasis.TAXABLE_VALUE
        else quote_total
    )
    withholding_base = (
        0
        if policy.withholding_basis == CommercialPolicy.AmountBasis.NONE
        else (
            pre_tax_value
            if policy.withholding_basis == CommercialPolicy.AmountBasis.TAXABLE_VALUE
            else quote_total
        )
    )
    commission = _bps(commission_base, int(policy.commission_bps or 0))
    withholding = _bps(withholding_base, int(policy.withholding_bps or 0))
    partner_net = quote_total - partner_fee - commission - withholding
    if partner_net < 0:
        raise FinancialPolicyUnavailableError("Policy deductions exceed the Partner quote total.")
    return _PriceOutcome(
        tax_components=tax_components,
        tax=tax,
        pre_tax_value=pre_tax_value,
        gross_priced_value=gross_priced_value,
        quote_total=quote_total,
        platform_fee=platform_fee,
        platform_fee_tax=platform_fee_tax,
        customer_fee=customer_fee,
        partner_fee=partner_fee,
        commission=commission,
        withholding=withholding,
        partner_net=partner_net,
    )


def _discount_for_customer_total(
    *,
    tax_groups: list[tuple[str, str, int]],
    target_total_paise: int,
    policy: CommercialPolicy,
    gst_registered: bool,
) -> tuple[int, _PriceOutcome, _PriceOutcome]:
    """Find the audited pre-tax concession closest to one partner-approved final total.

    Tax and percentage fees make the mapping from a displayed final total to the underlying
    invoice discount non-linear by a few paise. A monotonic binary search keeps the partner's
    requested final amount authoritative without floating-point money. Ties choose the lower
    customer total so the confirmation never promises less discount than it applies.
    """

    undiscounted = _price_outcome(
        tax_groups=tax_groups,
        discount_paise=0,
        policy=policy,
        gst_registered=gst_registered,
    )
    if target_total_paise <= 0 or target_total_paise >= undiscounted.customer_total:
        raise ProposalShapeError("Choose a final total below the current estimate amount.")

    gross_total = sum(amount for _purpose, _category, amount in tax_groups)
    low = 1
    high = gross_total - 1
    best_discount = 0
    best = undiscounted
    best_distance = abs(undiscounted.customer_total - target_total_paise)
    while low <= high:
        candidate_discount = (low + high) // 2
        candidate = _price_outcome(
            tax_groups=tax_groups,
            discount_paise=candidate_discount,
            policy=policy,
            gst_registered=gst_registered,
        )
        distance = abs(candidate.customer_total - target_total_paise)
        if distance < best_distance or (
            distance == best_distance and candidate.customer_total < best.customer_total
        ):
            best_discount = candidate_discount
            best = candidate
            best_distance = distance
        if candidate.customer_total > target_total_paise:
            low = candidate_discount + 1
        elif candidate.customer_total < target_total_paise:
            high = candidate_discount - 1
        else:
            return candidate_discount, candidate, undiscounted
    return best_discount, best, undiscounted


def calculate_estimate(  # noqa: PLR0912, PLR0915 - mirrors the published money ladder
    *,
    requirement: CustomerRequirement,
    partner: PartnerProfile,
    estimate_type: str,
    item_lines: list[dict[str, Any]] | None = None,
    labour_lines: list[dict[str, Any]] | None = None,
    material_lines: list[dict[str, Any]] | None = None,
    other_charges: list[dict[str, Any]] | None = None,
    stages: list[dict[str, Any]] | None = None,
    discount_target_total_paise: int | None = None,
    at: datetime | None = None,
) -> CalculationResult:
    """Calculate, validate and snapshot one A5 estimate without caller-owned percentages."""

    if estimate_type not in Proposal.EstimateType.values:
        raise ProposalShapeError("Choose Item-wise or Labour-wise pricing.")
    fulfilment_mode = material_fulfilment_mode(requirement)
    items = item_lines or []
    labour = labour_lines or []
    guardrail_policy_version: int | None = None
    if estimate_type == Proposal.EstimateType.ITEM_WISE:
        if not items or labour:
            raise ProposalShapeError("An Item-wise estimate must contain only item lines.")
        normal_items, line_subtotal = _normalise_items(items)
        normal_labour: list[dict[str, Any]] = []
        # The price book's guarantee: a catalog line is band-checked against the live policy and
        # a custom line's name is screened, here, on every preview and every submission.
        if any(line.get("work_item_id") or line.get("is_custom") for line in normal_items):
            guard = price_book.validate_quote_guardrails(
                service_area=requirement.service_area,
                item_lines=normal_items,
            )
            normal_items = guard.item_lines
            guardrail_policy_version = guard.policy_version
    else:
        if not labour or items:
            raise ProposalShapeError("A Labour-wise estimate must contain only labour lines.")
        normal_labour, line_subtotal = _normalise_labour(labour)
        normal_items = []

    normal_materials, material_total = _normalise_materials(material_lines or [])
    normal_charges, charges_total = _normalise_charges(other_charges or [])
    service_amount = line_subtotal + charges_total
    stage_rows = list(stages or [])
    if not stage_rows:
        raise InstallmentMismatchError("Add at least one payment installment.")
    stage_amounts = [int(row.get("amount_paise") or 0) for row in stage_rows]
    if any(amount <= 0 for amount in stage_amounts) or sum(stage_amounts) != service_amount:
        raise InstallmentMismatchError(
            "Installment service amounts must exactly match priced lines and named charges."
        )

    policy = active_policy(at=at)
    identity = _tax_identity(partner=partner)
    effective_from = identity.tax_profile_effective_from
    if effective_from is None:
        raise FinancialPolicyUnavailableError("The Partner tax profile has no effective date.")
    service_category = requirement.variant.tax_category_code
    if not service_category:
        raise FinancialPolicyUnavailableError("This service has no approved tax category.")

    tax_groups: list[tuple[str, str, int]] = [("SERVICE", service_category, line_subtotal)]
    if material_total:
        tax_groups.append(("MATERIAL", policy.material_tax_category, material_total))
    for charge in normal_charges:
        charge_category = policy.charge_tax_categories.get(charge["code"])
        if not isinstance(charge_category, str) or not charge_category:
            raise FinancialPolicyUnavailableError(
                f"Charge {charge['code']} has no approved tax category."
            )
        tax_groups.append((str(charge["code"]), charge_category, int(charge["amount_paise"])))

    if discount_target_total_paise is None:
        pricing_discount = 0
        outcome = _price_outcome(
            tax_groups=tax_groups,
            discount_paise=0,
            policy=policy,
            gst_registered=identity.gst_registered,
        )
        undiscounted = outcome
    else:
        pricing_discount, outcome, undiscounted = _discount_for_customer_total(
            tax_groups=tax_groups,
            target_total_paise=discount_target_total_paise,
            policy=policy,
            gst_registered=identity.gst_registered,
        )
    tax_components = outcome.tax_components
    tax = outcome.tax
    pre_tax_value = outcome.pre_tax_value
    quote_total = outcome.quote_total
    platform_fee = outcome.platform_fee
    platform_fee_tax = outcome.platform_fee_tax
    customer_fee = outcome.customer_fee
    partner_fee = outcome.partner_fee
    commission = outcome.commission
    withholding = outcome.withholding
    partner_net = outcome.partner_net

    service_state = requirement.service_area.state_code if requirement.service_area else ""
    intra_state = bool(
        identity.gst_registered
        and service_state
        and service_state == identity.registered_state_code
    )
    if intra_state:
        cgst = tax // 2
        sgst = tax - cgst
        igst = 0
    else:
        cgst = sgst = 0
        igst = tax

    gross_weights = [*stage_amounts, material_total] if material_total else stage_amounts
    discount_allocations = (
        _allocate(pricing_discount, gross_weights) if pricing_discount else [0] * len(gross_weights)
    )
    weights = [
        amount - discount
        for amount, discount in zip(gross_weights, discount_allocations, strict=True)
    ]
    tax_allocations = _allocate(tax, weights)
    customer_platform_fee_allocations = (
        _allocate(platform_fee, weights) if customer_fee else [0] * len(weights)
    )
    customer_platform_tax_allocations = (
        _allocate(platform_fee_tax, weights) if customer_fee else [0] * len(weights)
    )
    installments: list[dict[str, Any]] = []
    for position, row in enumerate(stage_rows, start=1):
        installment_tax = tax_allocations[position - 1]
        installment_fee = customer_platform_fee_allocations[position - 1]
        installment_fee_tax = customer_platform_tax_allocations[position - 1]
        installment_discount = discount_allocations[position - 1]
        discounted_amount = int(row["amount_paise"]) - installment_discount
        installments.append(
            {
                **row,
                "position": position,
                "discount_paise": installment_discount,
                "discounted_amount_paise": discounted_amount,
                "tax_paise": installment_tax,
                "platform_fee_paise": installment_fee,
                "platform_fee_tax_paise": installment_fee_tax,
                "total_due_paise": (
                    discounted_amount + installment_tax + installment_fee + installment_fee_tax
                ),
            }
        )
    material_tax = tax_allocations[-1] if material_total else 0
    material_fee = customer_platform_fee_allocations[-1] if material_total else 0
    material_fee_tax = customer_platform_tax_allocations[-1] if material_total else 0
    material_discount = discount_allocations[-1] if material_total else 0
    if normal_materials:
        material_weights = [int(row["amount_paise"]) for row in normal_materials]
        material_discount_rows = _allocate(material_discount, material_weights)
        discounted_material_weights = [
            amount - discount
            for amount, discount in zip(material_weights, material_discount_rows, strict=True)
        ]
        material_tax_rows = _allocate(material_tax, discounted_material_weights)
        material_fee_rows = _allocate(material_fee, discounted_material_weights)
        material_fee_tax_rows = _allocate(material_fee_tax, discounted_material_weights)
        for row, row_discount, row_tax, row_fee, row_fee_tax in zip(
            normal_materials,
            material_discount_rows,
            material_tax_rows,
            material_fee_rows,
            material_fee_tax_rows,
            strict=True,
        ):
            discounted_amount = int(row["amount_paise"]) - row_discount
            row["discount_paise"] = row_discount
            row["discounted_amount_paise"] = discounted_amount
            row["tax_paise"] = row_tax
            row["platform_fee_paise"] = row_fee
            row["platform_fee_tax_paise"] = row_fee_tax
            row["total_due_paise"] = discounted_amount + row_tax + row_fee + row_fee_tax
    calculated_at = at or timezone.now()
    snapshot = {
        "calculator_version": 2,
        "rounding": "integer_paise_half_up; allocation remainder to final row",
        "calculated_at": calculated_at.isoformat(),
        "guardrail_policy_version": guardrail_policy_version,
        "policy": {
            "id": str(policy.id),
            "version": policy.version,
            "supplier_of_record": policy.supplier_of_record,
            "material_supplier_of_record": policy.material_supplier_of_record,
            "visit_supplier_of_record": policy.visit_supplier_of_record,
            "tax_basis": policy.tax_basis,
            "platform_fee_treatment": policy.platform_fee_treatment,
            "approval_reference": policy.approval_reference,
            "commission_basis": policy.commission_basis,
            "withholding_basis": policy.withholding_basis,
        },
        "partner_tax_profile": {
            "legal_name": identity.legal_name,
            "registration_status": "REGISTERED" if identity.gst_registered else "UNREGISTERED",
            "gstin": identity.gstin if identity.gst_registered else "",
            "gstin_verified_at": (
                identity.gstin_verified_at.isoformat() if identity.gstin_verified_at else None
            ),
            "supplier_state_code": identity.registered_state_code,
            "effective_from": effective_from.isoformat(),
        },
        "place_of_supply": {
            "customer_state_code": service_state,
            "treatment": "INTRA_STATE" if intra_state else "INTER_STATE",
        },
        "tax": {
            "taxable_value_paise": pre_tax_value,
            "cgst_paise": cgst,
            "sgst_paise": sgst,
            "igst_paise": igst,
            "cess_paise": 0,
            "material_tax_paise": material_tax,
            "components": tax_components,
        },
        "discount": {
            "eligible_base_paise": sum(amount for _purpose, _category, amount in tax_groups),
            "pricing_discount_paise": pricing_discount,
            "pre_discount_customer_total_paise": undiscounted.customer_total,
            "customer_savings_paise": undiscounted.customer_total - outcome.customer_total,
            "target_customer_total_paise": discount_target_total_paise,
        },
        "installments": installments,
        "materials": normal_materials,
        "material_fulfilment_mode": fulfilment_mode,
    }
    recipe_lines = price_book.shopping_list_for_lines(normal_items)
    return CalculationResult(
        estimate_type=estimate_type,
        item_lines=normal_items,
        labour_lines=normal_labour,
        material_lines=normal_materials,
        other_charges=normal_charges,
        stages=installments,
        line_subtotal_paise=line_subtotal,
        material_total_paise=material_total,
        authorized_charges_paise=charges_total,
        discount_base_paise=sum(amount for _purpose, _category, amount in tax_groups),
        pricing_discount_paise=pricing_discount,
        pre_discount_customer_total_paise=undiscounted.customer_total,
        customer_savings_paise=undiscounted.customer_total - outcome.customer_total,
        taxable_value_paise=pre_tax_value,
        partner_service_tax_paise=tax,
        partner_quote_total_paise=quote_total,
        platform_fee_paise=platform_fee,
        platform_fee_tax_paise=platform_fee_tax,
        customer_total_paise=quote_total + customer_fee,
        commission_paise=commission + partner_fee,
        withholding_paise=withholding,
        partner_net_paise=partner_net,
        tax_basis=policy.tax_basis,
        policy_version=policy.version,
        calculation_snapshot=snapshot,
        suggested_material_list=(
            recipe_lines
            if fulfilment_mode == Proposal.MaterialFulfilmentMode.CUSTOMER_PROCURES
            else []
        ),
        suggested_included_supply_list=(
            recipe_lines
            if fulfilment_mode == Proposal.MaterialFulfilmentMode.PARTNER_TURNKEY
            else []
        ),
        material_fulfilment_mode=fulfilment_mode,
    )
