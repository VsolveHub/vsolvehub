"""The GST inside a home-visit price, and what is left of it for the work itself.

Home-visit prices are shown and charged *including* GST (`apps.carts.planning.pricing`). That
GST is owed to the government, not earned by anybody, so a Partner's earning and V Solve Hub's
commission are both worked out on the price *before* GST. Settling on the GST-inclusive amount
paid the tax away to the Partner and left V Solve Hub to fund it from its commission, which
lost money on every visit large enough to reach the commission cap.
"""


def inclusive_gst_paise(gross_paise: int, gst_basis_points: int) -> int:
    """The GST contained in a GST-inclusive amount, rounded half-up as checkout rounds it."""

    if gst_basis_points <= 0 or gross_paise <= 0:
        return 0
    return (gross_paise * gst_basis_points + (10_000 + gst_basis_points) // 2) // (
        10_000 + gst_basis_points
    )


def pre_gst_paise(gross_paise: int, gst_basis_points: int) -> int:
    """A GST-inclusive amount with its GST taken out: the value of the work itself."""

    return gross_paise - inclusive_gst_paise(gross_paise, gst_basis_points)
