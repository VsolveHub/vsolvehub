"""Project and workforce ledger lines say which job and stage they were for.

The other sources are pinned in `tests/payouts/test_ledger_origin.py`; these need the M2 world.
"""

import pytest

from apps.payouts.ledger_sources import describe_ledger_sources
from apps.payouts.models import PartnerLedgerEntry

from .conftest import M2World
from .test_crew_day_hire_partner_side import _crew_engagement

pytestmark = pytest.mark.django_db(transaction=True)


def _line(world: M2World, snapshot: dict[str, object], key: str) -> PartnerLedgerEntry:
    return PartnerLedgerEntry.objects.create(
        partner=world.vendor,
        kind=PartnerLedgerEntry.Kind.EARNING,
        status=PartnerLedgerEntry.Status.AVAILABLE,
        gross_paise=255_000,
        commission_paise=0,
        net_paise=255_000,
        calculation_snapshot=snapshot,
        idempotency_key=key,
    )


def test_a_stage_payment_names_the_service_the_stage_and_its_day(world: M2World) -> None:
    engagement = _crew_engagement(world=world)
    stage = engagement.stages.order_by("position").last()
    assert stage is not None
    entry = _line(
        world,
        {
            "source": "m2_engagement_stage",
            "engagement_id": str(engagement.id),
            "engagement_stage_id": str(stage.id),
        },
        f"origin-stage-{stage.id}",
    )

    origin = describe_ledger_sources([entry])[entry.id]

    assert origin.type == "PROJECT_STAGE"
    assert origin.title == engagement.requirement.variant.service.name
    assert (origin.stage_position, origin.stage_label) == (stage.position, stage.label)
    assert origin.starts_on == stage.scheduled_on
    assert origin.engagement_id == engagement.id


def test_released_retention_points_at_its_job(world: M2World) -> None:
    engagement = _crew_engagement(world=world)
    entry = _line(
        world,
        {"source": "m2_warranty_retention", "engagement_id": str(engagement.id)},
        f"origin-retention-{engagement.id}",
    )

    origin = describe_ledger_sources([entry])[entry.id]

    assert origin.type == "PROJECT_RETENTION"
    assert origin.engagement_id == engagement.id
    assert origin.title == engagement.requirement.variant.service.name
