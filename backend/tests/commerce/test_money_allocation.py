"""The money-splitting kernel behind invoice tax and per-unit fees.

These are pure-arithmetic tests on purpose. The bug they pin down only became visible
as an `IntegrityError` five layers up — a rejected `TaxDocumentLine` that took a whole
captured payment down with it — and the arithmetic is where it is cheap to prove.
"""

import pytest

from apps.carts.planning import _allocate
from apps.commerce.services import _allocate_exact

# The real quote that first produced this: two services in one cart, each carrying a ₹0
# `minimum_visit_topup` line (nothing is priced under the ₹49 floor any more, so the
# top-up is always zero) plus its share of the platform fee.
REAL_WEIGHTS = [79_900, 0, 1_009, 149_900, 0, 1_891]
REAL_TAX_PAISE = 35_497
ROUNDING_TOTALS_TO_SWEEP = 40
PLANNING_FEE_PAISE = 5


def test_a_line_worth_nothing_is_taxed_nothing() -> None:
    """`commerce_document_line_tax_lte_total` is the constraint this protects.

    The remainder used to be handed out from index 0 with no regard for the basis, so a
    ₹0 line could be assigned a paise of tax. Postgres rejected the row, the exception
    escaped `_materialize_captured_group`, and the customer got a 500 on a payment the
    provider had already taken.
    """

    allocations = _allocate_exact(REAL_TAX_PAISE, REAL_WEIGHTS)

    assert sum(allocations) == REAL_TAX_PAISE
    untaxable = [
        share for share, weight in zip(allocations, REAL_WEIGHTS, strict=True) if weight == 0
    ]
    assert untaxable == [0, 0]


def test_no_share_ever_exceeds_its_own_basis() -> None:
    """Tax on a line can equal its amount but never exceed it, whatever the rounding."""

    for total in range(ROUNDING_TOTALS_TO_SWEEP):
        allocations = _allocate_exact(total, REAL_WEIGHTS)
        assert sum(allocations) == total
        assert all(share <= weight for share, weight in zip(allocations, REAL_WEIGHTS, strict=True))


def test_remainder_still_lands_somewhere_when_every_line_carries_value() -> None:
    """The exactness guarantee is unchanged for the ordinary case."""

    assert _allocate_exact(2, [1, 1, 1]) == [1, 1, 0]
    assert _allocate_exact(3, [1, 1, 1]) == [1, 1, 1]
    assert _allocate_exact(0, [1, 1, 1]) == [0, 0, 0]


def test_an_allocation_cannot_exceed_the_basis_it_is_split_over() -> None:
    with pytest.raises(ValueError, match="basis"):
        _allocate_exact(101, [50, 50])


def test_a_zero_basis_is_still_refused() -> None:
    with pytest.raises(ValueError, match="basis"):
        _allocate_exact(10, [0, 0])


def test_planning_never_charges_a_unit_that_contributed_nothing() -> None:
    """The same remainder bug in the quote-time fee split.

    A unit with no service subtotal has no share of the platform fee. Handing it a
    stray paise puts a charge on a line the customer was never quoted.
    """

    # Chosen so the rounding remainder is two paise: enough to walk past index 0 and
    # reach the zero-subtotal unit at index 1.
    allocations = _allocate(PLANNING_FEE_PAISE, (3, 0, 3, 3))

    assert sum(allocations) == PLANNING_FEE_PAISE
    assert allocations[1] == 0
