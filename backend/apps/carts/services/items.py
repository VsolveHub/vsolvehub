"""The cart line-item commands: add, update, remove, clear, and the legacy replace.

Everything here mutates the contents of one cart under an optimistic version pair and,
having done so, invalidates the plans and quotes that described the previous contents.
The boundary is the cart aggregate — validating a variant against its active A1
configuration and rate belongs here because only these commands do it; pricing that
contents into a quote does not, and lives in `checkout`.

`replace_cart_item` is the pre-multi-item single-slot flow and is kept intact rather
than folded into `add_cart_item`: it answers a different error (`CartItemLimitReached`
with the item to swap) and detaches a quoted cart instead of editing it.
"""

from uuid import UUID

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.carts.exceptions import (
    CartItemLimitReachedApiError,
    CartItemNotFoundApiError,
    CartVersionConflictApiError,
    DuplicateCartItemApiError,
)
from apps.carts.item_inputs import validate_scope
from apps.carts.models import Cart, CartItem, CartItemScope, Quote
from apps.catalog.models import A1VariantConfiguration, ServiceVariant
from apps.identity.models import User
from apps.pricing.models import TaskRate
from apps.pricing.selectors import current_task_rate

from .base import (
    _assert_cart_version,
    _cart_for,
    _cart_item_fingerprint,
    _invalidate_cart_outputs,
    _request_fingerprint,
)


def _validated_variant_inputs(
    *,
    variant_id: UUID,
    quantity: int,
    scope: dict[str, object],
    reject_conflicting_quantity: bool = True,
) -> tuple[ServiceVariant, A1VariantConfiguration, TaskRate, dict[str, object]]:
    variant = (
        ServiceVariant.objects.select_related("service")
        .filter(
            id=variant_id,
            is_active=True,
            booking_archetype=ServiceVariant.BookingArchetype.A1_TASK_VISIT,
            service__status="ACTIVE",
        )
        .first()
    )
    if variant is None:
        raise ValueError("The selected service is not available.")
    configuration = A1VariantConfiguration.objects.filter(
        variant=variant,
        status=A1VariantConfiguration.Status.ACTIVE,
    ).first()
    if configuration is None:
        raise ValueError("The selected task has no active fulfilment configuration.")
    normalized_scope = _scope_with_quantity(
        schema=configuration.scope_schema,
        scope=scope,
        quantity=quantity,
        reject_conflicting_quantity=reject_conflicting_quantity,
    )
    validate_scope(schema=configuration.scope_schema, scope=normalized_scope)
    task_rate = current_task_rate(variant=variant, task_code=variant.service.slug)
    if task_rate is None:
        raise ValueError("The selected task has no current rate.")
    return variant, configuration, task_rate, normalized_scope


@transaction.atomic
def add_cart_item(
    *,
    user: User | None,
    session_key: str,
    expected_cart_version: int,
    variant_id: UUID,
    quantity: int,
    scope: dict[str, object],
) -> CartItem:
    cart = _cart_for(user=user, session_key=session_key)
    cart = Cart.objects.select_for_update().get(id=cart.id)
    _assert_cart_version(cart=cart, expected_version=expected_cart_version)
    active_items = list(
        CartItem.objects.filter(cart=cart, removed_at__isnull=True).prefetch_related("scope_values")
    )
    if len(active_items) >= settings.M1_CART_ITEM_LIMIT:
        raise ValueError("The active cart item limit has been reached.")
    variant, configuration, task_rate, normalized_scope = _validated_variant_inputs(
        variant_id=variant_id,
        quantity=quantity,
        scope=scope,
    )
    fingerprint = _request_fingerprint(variant_id=variant_id, scope=normalized_scope)
    duplicate = next(
        (item for item in active_items if _cart_item_fingerprint(item) == fingerprint),
        None,
    )
    if duplicate is not None:
        raise DuplicateCartItemApiError(
            existing_item_id=str(duplicate.id),
            current_version=cart.version,
        )
    item = CartItem.objects.create(
        cart=cart,
        variant=variant,
        task_rate=task_rate,
        quantity=quantity,
        configuration=configuration,
        scope_schema_snapshot=configuration.scope_schema,
    )
    CartItemScope.objects.bulk_create(
        [
            CartItemScope(item=item, code=code, value=value)
            for code, value in normalized_scope.items()
        ]
    )
    cart.version += 1
    cart.save(update_fields=("version", "updated_at"))
    _invalidate_cart_outputs(cart=cart)
    return item


@transaction.atomic
def update_cart_item(
    *,
    cart: Cart,
    item_id: UUID,
    expected_cart_version: int,
    expected_item_version: int,
    quantity: int,
    scope: dict[str, object],
) -> CartItem:
    locked_cart = Cart.objects.select_for_update().get(id=cart.id)
    _assert_cart_version(cart=locked_cart, expected_version=expected_cart_version)
    item = (
        CartItem.objects.select_for_update()
        .select_related("variant__service")
        .get(id=item_id, cart=locked_cart, removed_at__isnull=True)
    )
    if item.version != expected_item_version:
        raise CartVersionConflictApiError(
            current_version=locked_cart.version,
            conflicting_field="expected_item_version",
        )
    _variant, configuration, task_rate, normalized_scope = _validated_variant_inputs(
        variant_id=item.variant_id,
        quantity=quantity,
        scope=scope,
        # The scope arriving here is the one Django published for this item, so its
        # quantity answer is a stale mirror of the field this request is moving.
        reject_conflicting_quantity=False,
    )
    item.quantity = quantity
    item.version += 1
    item.task_rate = task_rate
    item.configuration = configuration
    item.scope_schema_snapshot = configuration.scope_schema
    item.save(
        update_fields=(
            "quantity",
            "version",
            "task_rate",
            "configuration",
            "scope_schema_snapshot",
            "updated_at",
        )
    )
    item.scope_values.all().delete()
    CartItemScope.objects.bulk_create(
        [
            CartItemScope(item=item, code=code, value=value)
            for code, value in normalized_scope.items()
        ]
    )
    locked_cart.version += 1
    locked_cart.save(update_fields=("version", "updated_at"))
    _invalidate_cart_outputs(cart=locked_cart)
    return item


@transaction.atomic
def remove_cart_item(
    *,
    cart: Cart,
    item_id: UUID,
    expected_cart_version: int,
    expected_item_version: int,
) -> Cart:
    """Soft-remove one item of the caller's cart under an optimistic version pair.

    The two row locks are taken cart-then-item, matching `update_cart_item`, so a
    concurrent edit and a removal serialize instead of deadlocking.  Both expected
    versions are compared while both rows are held, so a caller can never observe
    one guard pass and the other race.

    The item is located before either version is compared.  A removal replayed
    after it already succeeded then answers `cart_item_not_found` — what actually
    happened — instead of `cart_version_conflict`, which would send the caller
    back to reload a cart that is already exactly what they wanted.  The command
    is still refused in both orderings, so a double submission can never remove a
    second item.
    """
    locked_cart = Cart.objects.select_for_update().get(id=cart.id)
    try:
        item = CartItem.objects.select_for_update().get(
            id=item_id,
            cart=locked_cart,
            removed_at__isnull=True,
        )
    except CartItem.DoesNotExist as exc:
        raise CartItemNotFoundApiError from exc
    _assert_cart_version(cart=locked_cart, expected_version=expected_cart_version)
    if item.version != expected_item_version:
        raise CartVersionConflictApiError(
            current_version=locked_cart.version,
            conflicting_field="expected_item_version",
        )
    item.version += 1
    item.removed_at = timezone.now()
    item.save(update_fields=("version", "removed_at", "updated_at"))
    locked_cart.version += 1
    locked_cart.save(update_fields=("version", "updated_at"))
    _invalidate_cart_outputs(cart=locked_cart)
    return locked_cart


def clear_booked_cart_items(*, quote: Quote) -> Cart | None:
    """Removes exactly the items this quote turned into a booking.

    ## Why only these items

    A cart can outlive a checkout. Anything the Customer added after the quote was
    priced, or anything the planner could not fit and they chose to leave behind,
    is still work they want — emptying the whole cart would silently discard it.
    The items are therefore read back from the quote's own plan units rather than
    from the cart, so what is removed is precisely what was paid for.

    ## Why at capture and not at checkout

    A Booking Group can still expire or fail to find a Partner, and its recovery
    action sends the Customer back to the cart to arrange it differently. If the
    items were cleared when the group was created, that recovery would hand them
    an empty cart and nothing to re-plan. Once payment is captured the booking is
    real, and the cart has genuinely become something else.

    Idempotent: `removed_at__isnull=True` means a replayed capture removes nothing
    a second time and leaves the cart version alone.
    """
    booked_item_ids = {
        line.plan_unit_item.cart_item_id
        for unit in quote.units.all()
        for line in unit.lines.all()
        if line.plan_unit_item is not None and line.plan_unit_item.cart_item_id is not None
    }
    if not booked_item_ids:
        return None

    cart_id = (
        Quote.objects.filter(id=quote.id)
        .values_list("fulfilment_plan__plan_set__cart_id", flat=True)
        .first()
    )
    if cart_id is None:
        return None

    locked_cart = Cart.objects.select_for_update().get(id=cart_id)
    now = timezone.now()
    removed = 0
    for item in CartItem.objects.select_for_update().filter(
        cart=locked_cart,
        id__in=booked_item_ids,
        removed_at__isnull=True,
    ):
        item.version += 1
        item.removed_at = now
        item.save(update_fields=("version", "removed_at", "updated_at"))
        removed += 1
    if removed == 0:
        return locked_cart

    locked_cart.version += 1
    locked_cart.save(update_fields=("version", "updated_at"))
    # Plans and quotes derived from the previous cart version no longer describe
    # what is in it, and the Customer must not be shown one.
    _invalidate_cart_outputs(cart=locked_cart)
    return locked_cart


def _scope_with_quantity(
    *,
    schema: dict[str, object],
    scope: dict[str, object],
    quantity: int,
    reject_conflicting_quantity: bool = True,
) -> dict[str, object]:
    """Keep the legacy scope quantity consistent with the canonical request field.

    A `quantity` answer that disagrees with the canonical field is a contradiction
    worth refusing for as long as it is the client's own claim, which is the case
    when an item is first added.  On an edit it is Django's own derivation handed
    back instead: every read republishes it, so a Customer moving the quantity
    necessarily returns the pre-edit mirror alongside the new canonical value.
    Refusing that would refuse the very edit that caused it, so editing passes
    `reject_conflicting_quantity=False` and lets the canonical field win.
    """
    questions = schema.get("questions")
    if not isinstance(questions, list):
        return scope.copy()
    has_quantity_question = any(
        isinstance(question, dict) and question.get("code") == "quantity" for question in questions
    )
    if not has_quantity_question:
        return scope.copy()

    normalized = scope.copy()
    supplied_quantity = normalized.get("quantity")
    if (
        reject_conflicting_quantity
        and supplied_quantity is not None
        and supplied_quantity != quantity
    ):
        raise ValueError("Scope quantity must match the cart item quantity.")
    normalized["quantity"] = quantity
    return normalized


@transaction.atomic
def replace_cart_item(
    *,
    user: User | None,
    session_key: str,
    variant_id: UUID,
    quantity: int,
    scope: dict[str, object],
    replace_existing: bool = False,
) -> CartItem:
    cart = _cart_for(user=user, session_key=session_key)
    cart = Cart.objects.select_for_update().get(id=cart.id)
    variant = (
        ServiceVariant.objects.select_for_update()
        .select_related("service")
        .get(
            id=variant_id,
            is_active=True,
            booking_archetype=ServiceVariant.BookingArchetype.A1_TASK_VISIT,
            service__status="ACTIVE",
        )
    )
    configuration = A1VariantConfiguration.objects.get(
        variant=variant, status=A1VariantConfiguration.Status.ACTIVE
    )
    scope = _scope_with_quantity(
        schema=configuration.scope_schema,
        scope=scope,
        quantity=quantity,
    )
    validate_scope(schema=configuration.scope_schema, scope=scope)
    task_rate = current_task_rate(variant=variant, task_code=variant.service.slug)
    if task_rate is None:
        raise ValueError("The selected task has no current rate.")
    existing = CartItem.objects.select_related("variant__service").filter(cart=cart).first()
    if existing is not None and existing.variant_id != variant.id and not replace_existing:
        raise CartItemLimitReachedApiError(
            existing_item={
                "id": str(existing.id),
                "variant_id": str(existing.variant_id),
                "service_slug": existing.variant.service.slug,
                "service_name": existing.variant.service.name,
                "variant_name": existing.variant.name,
                "quantity": existing.quantity,
            },
        )
    # Quotes retain their cart-item snapshot.  Detach that historical cart before
    # replacing its item so a subsequent cart edit cannot mutate quoted inputs.
    if existing is not None and Quote.objects.filter(cart_item=existing).exists():
        cart.customer = None
        cart.session_key_hash = ""
        cart.save(update_fields=("customer", "session_key_hash", "updated_at"))
        cart = _cart_for(user=user, session_key=session_key)
        cart = Cart.objects.select_for_update().get(id=cart.id)
        existing = None
    if existing is not None:
        existing.delete()
    item = CartItem.objects.create(
        cart=cart,
        variant=variant,
        task_rate=task_rate,
        quantity=quantity,
        configuration=configuration,
        scope_schema_snapshot=configuration.scope_schema,
    )
    CartItemScope.objects.bulk_create(
        [CartItemScope(item=item, code=code, value=value) for code, value in scope.items()]
    )
    return item
