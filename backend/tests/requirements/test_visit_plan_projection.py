"""Visit-plan projections used by the Customer payment screen."""

from datetime import timedelta
from http import HTTPStatus

import pytest
from django.test import override_settings
from django.utils import timezone
from psycopg.types.range import Range

from apps.assignments.models import Reservation
from apps.catalog.models import ServiceVariant
from apps.commerce.models import PaymentAttempt
from apps.requirements.models import (
    M2AccessPrice,
    SiteVisit,
    VisitPlan,
    VisitPlanShare,
)
from apps.requirements.serializers import VisitPlanSerializer

from .conftest import M2World, draft_requirement, invitation_for

pytestmark = pytest.mark.django_db


@override_settings(PAYMENTS_ALLOW_SIMULATED_CAPTURE=True)
def test_pending_visit_plan_publishes_its_development_capture_attempt(world: M2World) -> None:
    requirement = draft_requirement(
        world=world,
        archetype=ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT,
    )
    price = M2AccessPrice.objects.create(
        kind=M2AccessPrice.Kind.A5_VISIT_PLAN,
        plan_size=2,
        amount_paise=9900,
        vendor_payout_basis_points=8000,
        effective_from=timezone.localdate() - timedelta(days=1),
    )
    attempt = PaymentAttempt.objects.create(
        purpose=PaymentAttempt.Purpose.M2_VISIT_PLAN,
        provider="fake",
        provider_order_id="fake_order_attempt_1",
        amount_paise=9900,
        currency="INR",
        status=PaymentAttempt.Status.CREATED,
    )
    plan = VisitPlan.objects.create(
        requirement=requirement,
        plan_size=2,
        price=price,
        price_paise=9900,
        vendor_payout_basis_points=8000,
        payment_attempt=attempt,
        status=VisitPlan.Status.PENDING,
    )

    data = VisitPlanSerializer(plan).data

    assert data["payment_attempt_id"] == str(attempt.id)
    assert data["simulated_capture_available"] is True


@override_settings(PAYMENT_PROVIDER="fake", PAYMENTS_ALLOW_SIMULATED_CAPTURE=True)
def test_simulated_visit_plan_capture_creates_missing_fake_provider_order(
    world: M2World,
) -> None:
    requirement = draft_requirement(
        world=world,
        archetype=ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT,
    )
    price = M2AccessPrice.objects.create(
        kind=M2AccessPrice.Kind.A5_VISIT_PLAN,
        plan_size=1,
        amount_paise=9900,
        vendor_payout_basis_points=8000,
        effective_from=timezone.localdate() - timedelta(days=1),
    )
    attempt = PaymentAttempt.objects.create(
        purpose=PaymentAttempt.Purpose.M2_VISIT_PLAN,
        provider="fake",
        amount_paise=9900,
        currency="INR",
        status=PaymentAttempt.Status.PROVIDER_PENDING,
    )
    plan = VisitPlan.objects.create(
        requirement=requirement,
        plan_size=1,
        price=price,
        price_paise=9900,
        vendor_payout_basis_points=8000,
        payment_attempt=attempt,
        status=VisitPlan.Status.PENDING,
    )
    share = VisitPlanShare.objects.create(
        plan=plan,
        position=1,
        amount_paise=9900,
        vendor_payout_paise=7920,
        platform_share_paise=1980,
        status=VisitPlanShare.Status.COMMITTED,
        partner=world.vendor,
        committed_at=timezone.now(),
    )
    invitation = invitation_for(requirement=requirement, partner=world.vendor)
    scheduled_for = timezone.now() + timedelta(days=2)
    visit = SiteVisit.objects.create(
        requirement=requirement,
        invitation=invitation,
        plan_share=share,
        status=SiteVisit.Status.REQUESTED,
        fee_paise=share.amount_paise,
        scheduled_for=scheduled_for,
        duration_minutes=90,
    )
    reservation = Reservation.objects.create(
        site_visit=visit,
        partner=world.vendor,
        occupied_range=Range(scheduled_for, scheduled_for + timedelta(minutes=90), "[)"),
        status=Reservation.Status.TENTATIVE,
        expires_at=timezone.now() + timedelta(minutes=10),
    )

    response = world.customer_client.post(
        f"/api/v1/payment-attempts/{attempt.id}/simulate-capture/"
    )

    attempt.refresh_from_db()
    plan.refresh_from_db()
    visit.refresh_from_db()
    reservation.refresh_from_db()
    assert response.status_code == HTTPStatus.OK
    assert response.json()["id"] == str(attempt.id)
    assert response.json()["status"] == PaymentAttempt.Status.CAPTURED
    assert attempt.provider_order_id
    assert attempt.status == PaymentAttempt.Status.CAPTURED
    assert plan.status == VisitPlan.Status.ACTIVE
    assert visit.status == SiteVisit.Status.SCHEDULED
    assert reservation.status == Reservation.Status.CONFIRMED
