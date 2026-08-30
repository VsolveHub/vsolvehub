"""Event-decor brief: MULTI_SELECT answers and the budget-band projection.

The 2026-08-29 redesign (`docs/superpowers/plans/2026-08-29-event-decor-flow-audit-
and-redesign.md`) gave `event-lighting-decor` a multi-select "What should we
decorate?" question and a `budget_band` choice that must land on the
requirement's `budget_min_paise`/`budget_max_paise` columns — the fields the
detail screen has always rendered and nothing ever wrote.
"""

from decimal import Decimal

import pytest
from django.utils import timezone

from apps.carts.item_inputs import validate_scope
from apps.catalog.models import (
    Category,
    M2VariantConfiguration,
    Service,
    ServiceVariant,
    Subcategory,
)
from apps.identity.models import User
from apps.locations.models import Address
from apps.requirements import services

pytestmark = pytest.mark.django_db

DECOR_SCHEMA = {
    "questions": [
        {"code": "event_type", "kind": "SELECT", "required": True},
        {"code": "event_description", "kind": "TEXT", "required": False},
        {"code": "decor_areas", "kind": "MULTI_SELECT", "required": True},
        {"code": "decor_style", "kind": "SELECT", "required": True},
        {"code": "venue_type", "kind": "SELECT", "required": True},
        {"code": "guest_band", "kind": "SELECT", "required": True},
        {"code": "budget_band", "kind": "SELECT", "required": True},
        {"code": "setup_access", "kind": "SELECT", "required": False},
    ]
}

TEN_THOUSAND_RUPEES = 1_000_000
TWENTY_FIVE_THOUSAND_RUPEES = 2_500_000
FIFTY_THOUSAND_RUPEES = 5_000_000
ONE_LAKH_RUPEES = 10_000_000

ANSWERS: dict[str, object] = {
    "event_type": "wedding",
    "decor_areas": ["stage", "entrance"],
    "decor_style": "fresh-flowers",
    "venue_type": "hall",
    "guest_band": "100-250",
    "budget_band": "25-50k",
}


class TestMultiSelectValidation:
    def test_accepts_a_list_of_option_codes(self) -> None:
        validate_scope(schema=DECOR_SCHEMA, scope=dict(ANSWERS))

    def test_refuses_a_scalar_where_a_list_is_expected(self) -> None:
        with pytest.raises(ValueError, match="decor_areas"):
            validate_scope(schema=DECOR_SCHEMA, scope={**ANSWERS, "decor_areas": "stage"})

    def test_refuses_a_list_with_a_non_string_entry(self) -> None:
        with pytest.raises(ValueError, match="decor_areas"):
            validate_scope(schema=DECOR_SCHEMA, scope={**ANSWERS, "decor_areas": ["stage", 3]})

    def test_refuses_an_empty_list_for_a_required_question(self) -> None:
        with pytest.raises(ValueError, match="decor_areas"):
            validate_scope(schema=DECOR_SCHEMA, scope={**ANSWERS, "decor_areas": []})


def _decor_variant() -> ServiceVariant:
    category = Category.objects.create(slug="events", name="Events")
    subcategory = Subcategory.objects.create(
        category=category, slug="lighting-decor", name="Lighting & decor"
    )
    service = Service.objects.create(
        subcategory=subcategory,
        slug="event-lighting-decor",
        name="Event lighting & decor",
        short_description="Test service.",
        status=Service.Status.ACTIVE,
    )
    variant = ServiceVariant.objects.create(
        service=service,
        code="standard",
        name="Decor, priced per event",
        pricing_strategy=ServiceVariant.PricingStrategy.FIXED,
        booking_archetype=ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT,
        required_skill_code="event-lighting-decor",
        tax_category_code="services-standard",
    )
    M2VariantConfiguration.objects.create(
        variant=variant,
        version=1,
        status=M2VariantConfiguration.Status.ACTIVE,
        question_schema=DECOR_SCHEMA,
        first_quote_sla_hours=8,
        quote_delivery_sla_hours=24,
    )
    return variant


def _customer() -> User:
    return User.objects.create_user(phone_number="+919812345671", full_name="Priya S")


class TestBudgetBandProjection:
    def test_create_draft_writes_the_band_onto_the_budget_columns(self) -> None:
        requirement = services.create_draft(
            customer=_customer(), variant=_decor_variant(), answers=dict(ANSWERS)
        )
        assert requirement.budget_min_paise == TWENTY_FIVE_THOUSAND_RUPEES
        assert requirement.budget_max_paise == FIFTY_THOUSAND_RUPEES

    def test_an_open_ended_band_leaves_the_open_side_null(self) -> None:
        requirement = services.create_draft(
            customer=_customer(),
            variant=_decor_variant(),
            answers={**ANSWERS, "budget_band": "1l-plus"},
        )
        assert requirement.budget_min_paise == ONE_LAKH_RUPEES
        assert requirement.budget_max_paise is None

    def test_unsure_stores_no_budget(self) -> None:
        requirement = services.create_draft(
            customer=_customer(),
            variant=_decor_variant(),
            answers={**ANSWERS, "budget_band": "unsure"},
        )
        assert requirement.budget_min_paise is None
        assert requirement.budget_max_paise is None

    def test_update_draft_rederives_the_band_when_answers_change(self) -> None:
        requirement = services.create_draft(
            customer=_customer(), variant=_decor_variant(), answers=dict(ANSWERS)
        )
        updated = services.update_draft(
            requirement=requirement,
            answers={**ANSWERS, "budget_band": "under-10k"},
        )
        assert updated.budget_min_paise is None
        assert updated.budget_max_paise == TEN_THOUSAND_RUPEES

    def test_an_answer_set_without_the_question_leaves_budget_alone(self) -> None:
        # A variant that never asks for a band — e.g. waterproofing — must not
        # have this projection clear a budget something else wrote.
        variant = _decor_variant()
        customer = _customer()
        requirement = services.create_draft(
            customer=customer, variant=variant, answers=dict(ANSWERS)
        )
        address = Address.objects.create(
            customer=customer,
            label="Home",
            line1="12, Lake View",
            locality="Kukatpally",
            city="Hyderabad",
            state="Telangana",
            postal_code="500072",
            latitude=Decimal("17.494500"),
            longitude=Decimal("78.399200"),
            confirmed_at=timezone.now(),
        )
        updated = services.update_draft(requirement=requirement, address=address)
        assert updated.budget_min_paise == TWENTY_FIVE_THOUSAND_RUPEES
        assert updated.budget_max_paise == FIFTY_THOUSAND_RUPEES
