"""Cart identity, request fingerprints, version guards, and output invalidation.

The primitives every command in this package is built on: finding the caller's cart,
deciding when two requests describe the same line, refusing a stale optimistic version,
and marking the plans and quotes that were derived from a cart version which no longer
exists.

This module is the bottom of the package's dependency arrow — it imports from the rest
of `apps.carts` but never from its own siblings, so there is no import cycle.
"""

import hashlib
import json
from uuid import UUID

from apps.carts.exceptions import CartVersionConflictApiError
from apps.carts.models import Cart, CartItem, FulfilmentPlanSet, Quote
from apps.identity.hashing import keyed_hash
from apps.identity.models import User


def _cart_for(*, user: User | None, session_key: str) -> Cart:
    if user is not None:
        cart, _ = Cart.objects.get_or_create(customer=user)
        return cart
    cart, _ = Cart.objects.get_or_create(session_key_hash=keyed_hash(session_key))
    return cart


def _cart_item_scope(item: CartItem) -> dict[str, object]:
    return {entry.code: entry.value for entry in item.scope_values.all()}


def _request_fingerprint(*, variant_id: UUID, scope: dict[str, object]) -> str:
    encoded = json.dumps(
        {"variant_id": str(variant_id), "scope": scope},
        sort_keys=True,
        separators=(",", ":"),
    ).encode()
    return hashlib.sha256(encoded).hexdigest()


def _cart_item_fingerprint(item: CartItem) -> str:
    return _request_fingerprint(variant_id=item.variant_id, scope=_cart_item_scope(item))


def _invalidate_cart_outputs(*, cart: Cart) -> None:
    FulfilmentPlanSet.objects.filter(
        cart=cart,
        status=FulfilmentPlanSet.Status.ACTIVE,
    ).update(status=FulfilmentPlanSet.Status.INVALIDATED)
    Quote.objects.filter(
        fulfilment_plan__plan_set__cart=cart,
        status=Quote.Status.ACTIVE,
    ).update(status=Quote.Status.INVALIDATED)


def _assert_cart_version(*, cart: Cart, expected_version: int) -> None:
    if cart.version != expected_version:
        raise CartVersionConflictApiError(
            current_version=cart.version,
            conflicting_field="expected_cart_version",
        )
