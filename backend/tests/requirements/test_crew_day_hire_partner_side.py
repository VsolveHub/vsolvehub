"""The lead's side of an A3 crew booking, contract 1.49.0.

Before this the crew wave wrote invitation rows and told nobody, a confirmed lead had no field
that said where the site was, and the working day's notices all went to the Customer. These tests
pin the four additions: the offer push, the disclosed address and contacts on the engagement, the
per-day summary on each stage, and the partner routes for money moving on the day.
"""

import uuid
from datetime import timedelta
from typing import Any, cast

import pytest
from django.utils import timezone

from apps.foundation.models import OutboxEvent
from apps.payouts.performance import partner_performance
from apps.payouts.services import partner_balance_paise
from apps.requirements.models import (
    DaySettlement,
    Engagement,
    EngagementStage,
    ShiftAttendance,
)
from apps.requirements.notifications import notify_for_outbox_event
from apps.requirements.serializers.engagements import EngagementSerializer

from .conftest import M2World, invitation_for, submitted_requirement

pytestmark = pytest.mark.django_db(transaction=True)


def _event(*, event_type: str, payload: dict[str, Any]) -> OutboxEvent:
    return OutboxEvent.objects.create(
        aggregate_type="requirement",
        aggregate_id=uuid.uuid4(),
        event_type=event_type,
        idempotency_key=f"test:{uuid.uuid4()}",
        payload=payload,
    )


def _crew_engagement(*, world: M2World, released: bool = True) -> Engagement:
    requirement = submitted_requirement(world=world)
    now = timezone.now()
    engagement = Engagement.objects.create(
        requirement=requirement,
        selection=None,
        proposal=None,
        partner=world.vendor,
        customer=world.customer,
        archetype=requirement.archetype,
        commercial_mode=Engagement.CommercialMode.LEAD_ONLY,
        status=Engagement.Status.ACTIVE,
        total_paise=510_000,
        tax_paise=0,
        tax_basis="UNKNOWN",
        staged_total_paise=510_000,
        terms_snapshot={
            "source": "rate_card",
            "headcount": 3,
            "days": 2,
            "worker_day_wage_paise": 60_000,
            "supervision_margin_paise": 25_000,
            "lead_day_receipt_paise": 255_000,
            "lead_receipt_paise": 510_000,
            "booking_fee_paise": 30_000,
            "total_customer_paise": 540_000,
            "standard_day_hours": 8,
            "overtime_hourly_paise": 11_250,
            "add_on_rates": {},
            "inclusions": ["Own tools"],
        },
        contact_released_at=now if released else None,
        work_may_start_at=now if released else None,
    )
    for day in (1, 2):
        EngagementStage.objects.create(
            engagement=engagement,
            position=day,
            label=f"Day {day}",
            amount_paise=255_000,
            kind=EngagementStage.Kind.WORK,
            scheduled_on=timezone.localdate() + timedelta(days=day),
            funding_state=EngagementStage.FundingState.NOT_REQUIRED,
        )
    return engagement


# --------------------------------------------------------------------------------------------
# The engagement read
# --------------------------------------------------------------------------------------------


def test_a_confirmed_lead_is_told_where_to_go_and_whom_to_ring(world: M2World) -> None:
    engagement = _crew_engagement(world=world)

    data = EngagementSerializer(engagement).data

    assert data["site_address"] is not None
    assert data["site_address"]["city"]
    address = engagement.requirement.address
    assert data["site_address"]["directions_url"] == (
        f"https://www.google.com/maps/dir/?api=1&destination={address.latitude},{address.longitude}"
    )
    # A route, never a coordinate feed: no bare latitude or longitude alongside it.
    assert "latitude" not in data["site_address"]
    assert "longitude" not in data["site_address"]
    assert data["customer_contact"] == {
        "name": world.customer.full_name or "Customer",
        "phone": world.customer.phone_number,
    }
    assert data["partner_contact"]["name"] == world.vendor.display_name
    assert data["partner_contact"]["phone"] == world.vendor.user.phone_number


def test_nothing_is_disclosed_before_contact_is_released(world: M2World) -> None:
    engagement = _crew_engagement(world=world, released=False)

    data = EngagementSerializer(engagement).data

    assert data["site_address"] is None
    assert data["customer_contact"] is None
    assert data["partner_contact"] is None


def test_crew_terms_come_from_the_frozen_snapshot(world: M2World) -> None:
    engagement = _crew_engagement(world=world)

    terms = EngagementSerializer(engagement).data["crew_terms"]

    assert terms["headcount"] == 3
    assert terms["days"] == 2
    assert terms["per_worker_day_paise"] == 85_000, "wage plus supervision margin"
    assert terms["lead_receipt_paise"] == 510_000
    assert terms["booking_fee_paise"] == 30_000
    assert terms["inclusions"] == ["Own tools"]


def test_a_quote_flow_engagement_has_no_crew_terms(world: M2World) -> None:
    engagement = _crew_engagement(world=world)
    engagement.terms_snapshot = {"source": "proposal"}
    engagement.save(update_fields=("terms_snapshot",))

    assert EngagementSerializer(engagement).data["crew_terms"] is None


def test_each_day_carries_its_own_summary(world: M2World) -> None:
    engagement = _crew_engagement(world=world)
    first, _second = engagement.stages.order_by("position")
    ShiftAttendance.objects.create(
        stage=first,
        engagement=engagement,
        status=ShiftAttendance.Status.CUSTOMER_CONFIRMED,
        expected_count=3,
        present_count=2,
        arrival_confirmed_at=timezone.now(),
    )
    DaySettlement.objects.create(
        stage=first,
        engagement=engagement,
        status=DaySettlement.Status.SETTLED,
        per_worker_paise=85_000,
        workers_present=2,
        workers_expected=3,
        extras_paise=0,
        amount_paise=170_000,
    )

    stages = {row["position"]: row for row in EngagementSerializer(engagement).data["stages"]}

    assert stages[1]["shift_summary"]["present_count"] == 2
    assert stages[1]["shift_summary"]["settlement_status"] == "SETTLED"
    assert stages[1]["shift_summary"]["settlement_amount_paise"] == 170_000
    untouched = stages[2]["shift_summary"]
    assert untouched["attendance_status"] == "PENDING"
    assert untouched["expected_count"] == 3, "the booked headcount, before anybody records"
    assert untouched["settlement_status"] == ""
    assert untouched["crew_named"] == 0


def test_directly_settled_crew_work_counts_as_earnings_and_one_completed_job(
    world: M2World,
) -> None:
    """A3 wages are performance income without becoming a fake Vsolve payout."""
    engagement = _crew_engagement(world=world)
    now = timezone.now()
    for stage in engagement.stages.order_by("position"):
        DaySettlement.objects.create(
            stage=stage,
            engagement=engagement,
            status=DaySettlement.Status.SETTLED,
            per_worker_paise=85_000,
            workers_present=3,
            workers_expected=3,
            extras_paise=0,
            amount_paise=255_000,
            supervisor_confirmed_at=now,
            supervisor_confirmed_by=world.vendor.user,
            customer_confirmed_at=now,
            customer_confirmed_by=world.customer,
            settled_at=now,
        )
    engagement.status = Engagement.Status.COMPLETED
    engagement.completed_at = now
    engagement.save(update_fields=("status", "completed_at", "updated_at"))

    performance = partner_performance(world.vendor)
    daily = cast(list[dict[str, object]], performance["daily"])

    assert performance["today_net_paise"] == 510_000
    assert performance["today_direct_paise"] == 510_000
    assert performance["month_net_paise"] == 510_000
    assert performance["month_direct_paise"] == 510_000
    assert performance["lifetime_net_paise"] == 510_000
    assert performance["lifetime_direct_paise"] == 510_000
    assert performance["today_jobs"] == 1
    assert performance["month_jobs"] == 1
    assert performance["lifetime_jobs"] == 1
    assert daily[-1]["net_paise"] == 510_000
    assert daily[-1]["jobs"] == 1
    assert partner_balance_paise(world.vendor) == {
        "pending_paise": 0,
        "available_paise": 0,
        "reserved_paise": 0,
        "paid_paise": 0,
    }


# --------------------------------------------------------------------------------------------
# The lead's notices
# --------------------------------------------------------------------------------------------


def test_an_offer_reaches_the_lead_and_opens_the_offer_screen(world: M2World) -> None:
    requirement = submitted_requirement(world=world)
    invitation = invitation_for(requirement=requirement, partner=world.vendor)
    event = _event(
        event_type="m2.crew_offer.invited",
        payload={
            "requirement_id": str(requirement.id),
            "vendor_invitation_id": str(invitation.id),
            "crew_size": 5,
            "days": 3,
            "amount_paise": 900_000,
        },
    )

    intents = notify_for_outbox_event(event)

    assert [intent.recipient_id for intent in intents] == [world.vendor.user_id]
    intent = intents[0]
    assert intent.template_code == "m2_crew_offer_invited"
    assert intent.context["target_kind"] == "CREW_OFFER"
    assert intent.context["target_id"] == str(invitation.id)
    assert intent.context["days"] == "3"
    assert intent.context["amount"] == "₹9,000"


def test_a_crew_win_is_not_described_as_a_chosen_quote(world: M2World) -> None:
    engagement = _crew_engagement(world=world)
    event = _event(
        event_type="m2.engagement.opened",
        payload={
            "requirement_id": str(engagement.requirement_id),
            "engagement_id": str(engagement.id),
            "commercial_mode": engagement.commercial_mode,
        },
    )

    by_recipient = {intent.recipient_id: intent for intent in notify_for_outbox_event(event)}

    assert by_recipient[world.vendor.user_id].template_code == "m2_engagement_opened_partner_crew"
    assert by_recipient[world.customer.id].template_code == "m2_engagement_opened_customer"


def test_the_customer_agreeing_the_count_tells_the_lead_what_to_collect(world: M2World) -> None:
    engagement = _crew_engagement(world=world)
    stage = engagement.stages.order_by("position").first()
    assert stage is not None
    event = _event(
        event_type="m2.shift.attendance_confirmed",
        payload={
            "engagement_id": str(engagement.id),
            "stage_id": str(stage.id),
            "workers_present": 4,
            "workers_expected": 5,
            "amount_paise": 320_000,
        },
    )

    intents = notify_for_outbox_event(event)

    assert [intent.recipient_id for intent in intents] == [world.vendor.user_id]
    assert intents[0].template_code == "m2_shift_attendance_confirmed_partner"
    assert intents[0].context["amount"] == "₹3,200"


def test_travel_compensation_is_announced_to_the_lead(world: M2World) -> None:
    requirement = submitted_requirement(world=world)
    invitation = invitation_for(requirement=requirement, partner=world.vendor, accepted=True)
    event = _event(
        event_type="m2.booking_fee.forfeited",
        payload={
            "requirement_id": str(requirement.id),
            "vendor_invitation_id": str(invitation.id),
            "amount_paise": 30_000,
            "reason_code": "late_cancellation",
        },
    )

    intents = notify_for_outbox_event(event)

    assert [intent.recipient_id for intent in intents] == [world.vendor.user_id]
    assert intents[0].template_code == "m2_booking_fee_forfeited_partner"


def test_a_free_redispatch_confirms_the_replacement_lead_too(world: M2World) -> None:
    engagement = _crew_engagement(world=world)
    event = _event(
        event_type="m2.booking_fee.waived",
        payload={
            "requirement_id": str(engagement.requirement_id),
            "engagement_id": str(engagement.id),
        },
    )

    recipients = {intent.recipient_id for intent in notify_for_outbox_event(event)}

    assert recipients == {world.customer.id, world.vendor.user_id}
