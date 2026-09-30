from datetime import timedelta

import pytest
from django.utils import timezone

from apps.rental.services import create_asset, create_booking, moderate_asset, submit_asset


@pytest.mark.django_db
def test_stock_regression(rental_world):
    asset = create_asset(
        partner=rental_world["partner"],
        variant_id=rental_world["variant"].id,
        title="10-Quantity Asset",
        daily_rate_paise=1000,
        deposit_paise=0,
        quantity_available=10,
    )
    submit_asset(asset=asset, partner=rental_world["partner"])
    moderate_asset(asset=asset, actor=rental_world["owner"], action="APPROVE", reason="ok for test")

    start1 = timezone.localdate() + timedelta(days=5)
    end1 = start1 + timedelta(days=2)

    # Book 8 items for day 5 to 7
    create_booking(
        customer=rental_world["customer"],
        asset_id=asset.id,
        start_date=start1,
        end_date=end1,
        quantity=8,
        hold_deposit_for_demo=True,
    )

    # Book 3 items for day 7 to 9 (no overlap with day 5-7)
    start2 = end1
    end2 = start2 + timedelta(days=2)

    # This should succeed since they don't overlap on the same days,
    # even though 8 + 3 = 11 > 10.
    create_booking(
        customer=rental_world["customer"],
        asset_id=asset.id,
        start_date=start2,
        end_date=end2,
        quantity=3,
        hold_deposit_for_demo=True,
    )
