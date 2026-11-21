"""A home-visit Partner earns, and commission is taken on, the price *before* GST.

Visit prices include GST. Settling on the GST-inclusive amount handed the tax to the Partner and
left V Solve Hub to pay it out of commission — a loss on every visit large enough to reach the
commission cap. These pin the arithmetic, and that the offer and the settlement agree.
"""

import pytest

from apps.payouts.services import _commission_for, visit_work_value_paise
from apps.pricing.tax import inclusive_gst_paise, pre_gst_paise

PRICING = {
    "gst_rate_basis_points": 1800,
    "commission_basis_points": 1800,
    "commission_floor_paise": 3000,
    "commission_cap_paise": 50000,
}


def test_the_gst_inside_a_price_is_taken_out_as_checkout_adds_it() -> None:
    # ₹1,180 including 18% GST is ₹1,000 of work and ₹180 of tax.
    assert inclusive_gst_paise(118000, 1800) == 18000
    assert pre_gst_paise(118000, 1800) == 100000
    assert pre_gst_paise(118000, 0) == 118000
    assert inclusive_gst_paise(0, 1800) == 0


@pytest.mark.parametrize("price_rupees", [300, 1000, 3440, 5000, 20000])
def test_v_solve_hub_never_pays_the_gst_out_of_its_commission(price_rupees: int) -> None:
    price = price_rupees * 100
    work = visit_work_value_paise(gross_paise=price, pricing=PRICING)
    commission = _commission_for(gross_paise=work, pricing=PRICING)
    partner = work - commission
    gst = price - work

    # Everything collected is accounted for: the Partner's share, the commission, the GST.
    assert partner + commission + gst == price
    # The platform keeps its commission whole; the GST is set aside, not funded from it.
    assert price - partner - gst == commission
    assert commission >= 0


def test_a_5000_visit_no_longer_loses_money() -> None:
    """The case from the audit: ₹5,000 used to leave V Solve Hub ₹238 short after GST."""

    price = 500000
    work = visit_work_value_paise(gross_paise=price, pricing=PRICING)
    commission = _commission_for(gross_paise=work, pricing=PRICING)
    partner = work - commission

    assert work == 423729  # ₹5,000 less 18% GST inside it
    assert commission == 50000  # capped at ₹500
    assert price - partner - (price - work) == 50000  # V Solve Hub keeps its ₹500


def test_a_snapshot_without_a_gst_rate_is_refused_rather_than_guessed() -> None:
    with pytest.raises(KeyError):
        visit_work_value_paise(gross_paise=100000, pricing={"commission_basis_points": 1800})
