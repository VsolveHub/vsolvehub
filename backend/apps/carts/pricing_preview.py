"""What a cart currently costs, before anything is quoted.

The cart carried no money at all: `CartItemDetailSerializer` published a name, a quantity and a
scope, and `CartSerializer` published no total. So the cart page had nothing to render and showed
none — a basket that will not say what is in it.

## Why this is an estimate and says so

A `Quote` is the priced, signed, expiring artefact a booking is made against. It needs an address
and a chosen arrival window, and it is the only number anybody is ever held to. A cart has
neither, so this cannot be that.

What it can do is apply the same rules to what is known: current task rates, the same minimum
visit charge, the same platform fee and the same inclusive GST as `carts.services.create_quote`.
Same policy, same arithmetic, same order — so the number on the cart and the number at checkout
differ only when something real differs, never because two code paths disagreed about the maths.

## Why it is here and not in the serializer

Serializers render; they do not decide what money is. Keeping it out means one place computes a
price and one place shows it, and a future second surface reads this rather than reimplementing
the fee and tax rules a third time.
"""

from dataclasses import dataclass

from apps.carts.models import Cart
from apps.pricing.models import PricingPolicy
from apps.pricing.selectors import current_pricing_policy, current_task_rate


@dataclass(frozen=True, slots=True)
class CartLinePrice:
    item_id: str
    unit_price_paise: int
    amount_paise: int


@dataclass(frozen=True, slots=True)
class CartPriceSummary:
    lines: tuple[CartLinePrice, ...]
    task_subtotal_paise: int
    minimum_visit_adjustment_paise: int
    platform_fee_paise: int
    tax_paise: int
    total_paise: int
    currency: str


def cart_price_summary(cart: Cart) -> CartPriceSummary | None:
    """The cart's current cost, or `None` when it cannot be priced.

    `None` rather than zero for an empty cart or a missing policy. Zero is a price, and a cart
    that cannot be priced has not got one — rendering ₹0 would tell somebody their basket is free.

    One query per distinct variant for the rate, plus one for the policy. Cart items are capped
    at `M1_CART_ITEM_LIMIT`, so this is bounded by configuration rather than by user input.
    """

    items = list(cart.items.filter(removed_at__isnull=True).select_related("variant__service"))
    if not items:
        return None
    policy = current_pricing_policy(code="m1-technician")
    if policy is None:
        return None

    lines: list[CartLinePrice] = []
    task_subtotal = 0
    currency = "INR"
    for item in items:
        rate = current_task_rate(variant=item.variant, task_code=item.variant.service.slug)
        if rate is None:
            # A variant with no live rate cannot be priced, and guessing one would put a number
            # on screen that no quote would honour. The whole summary is withheld rather than
            # silently under-reporting by the value of the line it could not read.
            return None
        amount = rate.unit_price_paise * item.quantity
        task_subtotal += amount
        currency = rate.currency
        lines.append(
            CartLinePrice(
                item_id=str(item.id),
                unit_price_paise=rate.unit_price_paise,
                amount_paise=amount,
            )
        )

    # Deliberately the same sequence as `create_quote`, including the top-up being applied to the
    # basket rather than per line: the minimum visit charge is a floor on the visit, and charging
    # it per item would invent a second one.
    adjustment = max(0, policy.minimum_service_subtotal_paise - task_subtotal)
    service_subtotal = task_subtotal + adjustment
    fee = (
        policy.platform_fee_value
        if policy.platform_fee_mode == PricingPolicy.PlatformFeeMode.FIXED
        else service_subtotal * policy.platform_fee_value // 10_000
    )
    total = service_subtotal + fee
    tax = (total * policy.gst_rate_basis_points + (10_000 + policy.gst_rate_basis_points) // 2) // (
        10_000 + policy.gst_rate_basis_points
    )
    return CartPriceSummary(
        lines=tuple(lines),
        task_subtotal_paise=task_subtotal,
        minimum_visit_adjustment_paise=adjustment,
        platform_fee_paise=fee,
        tax_paise=tax,
        total_paise=total,
        currency=currency,
    )
