"""Folding an anonymous session cart into the signed-in Customer's cart.

Two commands, one aggregate: `merge_session_cart` is the automatic pass that runs at
sign-in and only ever merges what cannot collide, and `resolve_session_cart_merge` is
the second round the Customer is sent to when it could not — it carries their per-item
decision for every duplicate the first pass refused to guess at.

Both hold the customer cart and the session cart under `select_for_update` for the whole
transaction, so the item limit and the duplicate set are evaluated against rows nobody
else can move underneath them.
"""

from uuid import UUID

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.carts.exceptions import CartMergeConflictApiError
from apps.carts.models import Cart, CartItem
from apps.identity.hashing import keyed_hash
from apps.identity.models import User

from .base import _cart_item_fingerprint, _invalidate_cart_outputs


@transaction.atomic
def merge_session_cart(*, user: User, session_key: str) -> Cart:
    """Merge non-duplicate anonymous requests without discarding either cart."""
    session_hash = keyed_hash(session_key)
    customer_cart, _ = Cart.objects.select_for_update().get_or_create(customer=user)
    anonymous_cart = (
        Cart.objects.select_for_update()
        .filter(customer__isnull=True, session_key_hash=session_hash)
        .first()
    )
    if anonymous_cart is None or anonymous_cart.id == customer_cart.id:
        return customer_cart
    customer_items = list(
        CartItem.objects.filter(cart=customer_cart, removed_at__isnull=True).prefetch_related(
            "scope_values"
        )
    )
    anonymous_items = list(
        CartItem.objects.filter(cart=anonymous_cart, removed_at__isnull=True).prefetch_related(
            "scope_values"
        )
    )
    if len(customer_items) + len(anonymous_items) > settings.M1_CART_ITEM_LIMIT:
        raise CartMergeConflictApiError(
            customer_cart_version=customer_cart.version,
            session_cart_version=anonymous_cart.version,
            conflicts=[
                {
                    "kind": "CART_LIMIT_EXCEEDED",
                    "combined_item_count": len(customer_items) + len(anonymous_items),
                    "maximum_item_count": settings.M1_CART_ITEM_LIMIT,
                }
            ],
        )
    customer_by_fingerprint = {_cart_item_fingerprint(item): item for item in customer_items}
    duplicates = [
        (customer_by_fingerprint[fingerprint], item)
        for item in anonymous_items
        if (fingerprint := _cart_item_fingerprint(item)) in customer_by_fingerprint
    ]
    if duplicates:
        raise CartMergeConflictApiError(
            customer_cart_version=customer_cart.version,
            session_cart_version=anonymous_cart.version,
            conflicts=[
                {
                    "kind": "EXACT_DUPLICATE",
                    "customer_item_id": str(customer_item.id),
                    "session_item_id": str(session_item.id),
                    "variant_id": str(session_item.variant_id),
                }
                for customer_item, session_item in duplicates
            ],
        )
    if anonymous_items:
        CartItem.objects.filter(id__in=(item.id for item in anonymous_items)).update(
            cart=customer_cart
        )
        customer_cart.version += 1
        customer_cart.save(update_fields=("version", "updated_at"))
        _invalidate_cart_outputs(cart=customer_cart)
    anonymous_cart.delete()
    return customer_cart


@transaction.atomic
def resolve_session_cart_merge(
    *,
    user: User,
    session_key: str,
    expected_customer_cart_version: int,
    expected_session_cart_version: int,
    decisions: dict[UUID, str],
) -> Cart:
    session_hash = keyed_hash(session_key)
    customer_cart = Cart.objects.select_for_update().get(customer=user)
    session_cart = (
        Cart.objects.select_for_update()
        .filter(customer__isnull=True, session_key_hash=session_hash)
        .first()
    )
    if session_cart is None:
        return customer_cart
    if (
        customer_cart.version != expected_customer_cart_version
        or session_cart.version != expected_session_cart_version
    ):
        raise CartMergeConflictApiError(
            customer_cart_version=customer_cart.version,
            session_cart_version=session_cart.version,
            conflicts=[{"kind": "CART_VERSION_CHANGED"}],
        )
    customer_items = list(
        CartItem.objects.select_for_update()
        .filter(cart=customer_cart, removed_at__isnull=True)
        .prefetch_related("scope_values")
    )
    session_items = list(
        CartItem.objects.select_for_update()
        .filter(cart=session_cart, removed_at__isnull=True)
        .prefetch_related("scope_values")
    )
    customer_by_fingerprint = {_cart_item_fingerprint(item): item for item in customer_items}
    final_count = len(customer_items)
    for session_item in session_items:
        fingerprint = _cart_item_fingerprint(session_item)
        customer_item = customer_by_fingerprint.get(fingerprint)
        if customer_item is None:
            final_count += 1
            continue
        action = decisions.get(session_item.id)
        if action not in {"KEEP_CUSTOMER", "KEEP_SESSION", "KEEP_BOTH"}:
            raise CartMergeConflictApiError(
                customer_cart_version=customer_cart.version,
                session_cart_version=session_cart.version,
                conflicts=[
                    {
                        "kind": "DECISION_REQUIRED",
                        "customer_item_id": str(customer_item.id),
                        "session_item_id": str(session_item.id),
                    }
                ],
            )
        if action == "KEEP_BOTH":
            final_count += 1
        elif action == "KEEP_SESSION":
            customer_item.removed_at = timezone.now()
            customer_item.version += 1
            customer_item.save(update_fields=("removed_at", "version", "updated_at"))
    if final_count > settings.M1_CART_ITEM_LIMIT:
        raise CartMergeConflictApiError(
            customer_cart_version=customer_cart.version,
            session_cart_version=session_cart.version,
            conflicts=[
                {
                    "kind": "CART_LIMIT_EXCEEDED",
                    "combined_item_count": final_count,
                    "maximum_item_count": settings.M1_CART_ITEM_LIMIT,
                }
            ],
        )
    for session_item in session_items:
        fingerprint = _cart_item_fingerprint(session_item)
        customer_item = customer_by_fingerprint.get(fingerprint)
        action = decisions.get(session_item.id)
        if customer_item is not None and action == "KEEP_CUSTOMER":
            continue
        session_item.cart = customer_cart
        session_item.save(update_fields=("cart", "updated_at"))
    session_cart.delete()
    customer_cart.version += 1
    customer_cart.save(update_fields=("version", "updated_at"))
    _invalidate_cart_outputs(cart=customer_cart)
    return customer_cart
