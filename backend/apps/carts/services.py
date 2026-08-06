"""Server-authoritative M1 cart, arrival-window, quote, and checkout commands."""

import hashlib
import json
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

from django.conf import settings
from django.core import signing
from django.db import transaction
from django.utils import timezone

from apps.carts.exceptions import (
    CartItemLimitReachedApiError,
    CartItemNotFoundApiError,
    CartMergeConflictApiError,
    CartVersionConflictApiError,
    DuplicateCartItemApiError,
    QuoteExpiredApiError,
    WindowNoLongerAvailableApiError,
)
from apps.carts.models import (
    BookingGroup,
    Cart,
    CartItem,
    CartItemScope,
    CheckoutSession,
    FulfilmentPlanSet,
    FulfilmentUnit,
    FulfilmentUnitLine,
    Quote,
)
from apps.catalog.models import A1VariantConfiguration, ServiceVariant
from apps.foundation.services import enqueue_outbox_event
from apps.identity.hashing import keyed_hash
from apps.identity.models import ConsentReceipt, User
from apps.locations.models import Address, ServiceArea
from apps.locations.services import check_serviceability, operating_ranges_for_date
from apps.pricing.models import PricingPolicy, TaskRate
from apps.pricing.selectors import (
    current_cancellation_policy,
    current_pricing_policy,
    current_task_rate,
)

WINDOW_SIGNING_SALT = "carts.booking-window.v1"


@dataclass(frozen=True, slots=True)
class BookingWindow:
    id: str
    starts_at: datetime
    ends_at: datetime
    is_available: bool
    unavailable_reason: str | None


@dataclass(frozen=True, slots=True)
class BookingWindowDay:
    date: date
    is_today: bool
    windows: tuple[BookingWindow, ...]


@dataclass(frozen=True, slots=True)
class BookingWindows:
    server_now: datetime
    estimated_duration_minutes: int
    availability_is_preliminary: bool
    days: tuple[BookingWindowDay, ...]


def _cart_for(*, user: User | None, session_key: str) -> Cart:
    if user is not None:
        cart, _ = Cart.objects.get_or_create(customer=user)
        return cart
    cart, _ = Cart.objects.get_or_create(session_key_hash=keyed_hash(session_key))
    return cart


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
    _validate_scope(schema=configuration.scope_schema, scope=normalized_scope)
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


def _validate_scope(*, schema: dict[str, object], scope: dict[str, object]) -> None:
    questions = schema.get("questions")
    if not isinstance(questions, list):
        raise ValueError("The selected task has an invalid scope configuration.")
    definitions: dict[str, dict[str, object]] = {}
    for question in questions:
        if not isinstance(question, dict) or not isinstance(question.get("code"), str):
            raise ValueError("The selected task has an invalid scope configuration.")
        definitions[question["code"]] = question
    unknown = set(scope).difference(definitions)
    if unknown:
        raise ValueError("Scope includes a question that is not configured for this task.")
    for code, definition in definitions.items():
        value = scope.get(code)
        if definition.get("required") and code not in scope:
            raise ValueError(f"Scope question '{code}' is required.")
        if value is None:
            continue
        if definition.get("kind") == "INTEGER":
            if isinstance(value, bool) or not isinstance(value, int):
                raise ValueError(f"Scope question '{code}' requires an integer value.")
            minimum = definition.get("minimum")
            if isinstance(minimum, int) and value < minimum:
                raise ValueError(f"Scope question '{code}' is below its minimum value.")
        elif definition.get("kind") not in {"TEXT", "BOOLEAN", "SELECT"}:
            raise ValueError("The selected task has an unsupported scope configuration.")


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
    _validate_scope(schema=configuration.scope_schema, scope=scope)
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


def _current_item_inputs(
    item: CartItem,
) -> tuple[A1VariantConfiguration, TaskRate, dict[str, object], int]:
    configuration = A1VariantConfiguration.objects.filter(
        variant=item.variant,
        status=A1VariantConfiguration.Status.ACTIVE,
    ).first()
    if configuration is None:
        raise ValueError("The selected task is no longer available for booking.")
    scope = {entry.code: entry.value for entry in item.scope_values.all()}
    _validate_scope(schema=configuration.scope_schema, scope=scope)
    task_rate = current_task_rate(
        variant=item.variant,
        task_code=item.variant.service.slug,
    )
    if task_rate is None:
        raise ValueError("The selected task has no current rate.")
    duration = task_rate.base_duration_minutes + task_rate.marginal_duration_minutes * item.quantity
    return configuration, task_rate, scope, duration


def _signed_window_id(
    *,
    item: CartItem,
    address: Address,
    starts_at: datetime,
) -> str:
    return signing.dumps(
        {
            "v": 1,
            "item_id": str(item.id),
            "address_id": str(address.id),
            "starts_at": starts_at.isoformat(),
        },
        salt=WINDOW_SIGNING_SALT,
        compress=True,
    )


def _window_start_from_id(
    *,
    window_id: str,
    item: CartItem,
    address: Address,
) -> datetime:
    try:
        payload = signing.loads(
            window_id,
            salt=WINDOW_SIGNING_SALT,
            max_age=settings.M1_WINDOW_TOKEN_TTL_SECONDS,
        )
        if not isinstance(payload, dict):
            raise ValueError
        if payload.get("v") != 1:
            raise ValueError
        if payload.get("item_id") != str(item.id):
            raise ValueError
        if payload.get("address_id") != str(address.id):
            raise ValueError
        starts_at_value = payload.get("starts_at")
        if not isinstance(starts_at_value, str):
            raise ValueError
        starts_at = datetime.fromisoformat(starts_at_value)
        if timezone.is_naive(starts_at):
            raise ValueError
        return starts_at
    except (signing.BadSignature, signing.SignatureExpired, TypeError, ValueError) as exc:
        raise WindowNoLongerAvailableApiError from exc


def _assert_window_time_is_current(
    *,
    starts_at: datetime,
    area_timezone: str,
    now: datetime,
) -> None:
    local_now = now.astimezone(ZoneInfo(area_timezone))
    local_start = starts_at.astimezone(ZoneInfo(area_timezone))
    if starts_at < now + timedelta(minutes=settings.M1_TODAY_LEAD_TIME_MINUTES):
        raise WindowNoLongerAvailableApiError
    if local_start.date() > local_now.date() + timedelta(days=settings.M1_SCHEDULED_MAX_DAYS):
        raise WindowNoLongerAvailableApiError


def create_booking_windows(
    *,
    customer: User,
    cart: Cart,
    address: Address,
) -> BookingWindows:
    now = timezone.now()
    if address.customer_id != customer.id or address.archived_at is not None:
        raise PermissionError("Use one of the Customer's active addresses.")
    item = (
        CartItem.objects.select_related("variant__service", "task_rate", "configuration")
        .prefetch_related("scope_values")
        .filter(cart=cart)
        .first()
    )
    if item is None:
        raise ValueError("Add a service to your booking before choosing an arrival window.")
    _configuration, _task_rate, _scope, duration = _current_item_inputs(item)
    decision = check_serviceability(
        postal_code=address.postal_code,
        variant_id=item.variant_id,
    )
    if not decision.is_serviceable or decision.service_area is None:
        raise ValueError(decision.reason_code or "Address is not serviceable.")
    area = ServiceArea.objects.prefetch_related(
        "operating_windows",
        "operating_exceptions",
    ).get(id=decision.service_area.id)
    zone = ZoneInfo(area.timezone)
    today = now.astimezone(zone).date()
    days: list[BookingWindowDay] = []
    for day_offset in range(settings.M1_SCHEDULED_MAX_DAYS + 1):
        local_date = today + timedelta(days=day_offset)
        windows: list[BookingWindow] = []
        for opens_at, closes_at in operating_ranges_for_date(
            area=area,
            local_date=local_date,
        ):
            starts_at = opens_at
            while starts_at + timedelta(minutes=settings.M1_ARRIVAL_WINDOW_MINUTES) <= closes_at:
                unavailable_reason: str | None = None
                if starts_at <= now:
                    unavailable_reason = "PAST"
                elif starts_at < now + timedelta(minutes=settings.M1_TODAY_LEAD_TIME_MINUTES):
                    unavailable_reason = "TOO_SOON"
                elif starts_at + timedelta(minutes=duration) > closes_at:
                    unavailable_reason = "OUTSIDE_OPERATING_WINDOW"
                windows.append(
                    BookingWindow(
                        id=_signed_window_id(
                            item=item,
                            address=address,
                            starts_at=starts_at,
                        ),
                        starts_at=starts_at,
                        ends_at=starts_at + timedelta(minutes=settings.M1_ARRIVAL_WINDOW_MINUTES),
                        is_available=unavailable_reason is None,
                        unavailable_reason=unavailable_reason,
                    ),
                )
                starts_at += timedelta(minutes=settings.M1_ARRIVAL_WINDOW_MINUTES)
        days.append(
            BookingWindowDay(
                date=local_date,
                is_today=local_date == today,
                windows=tuple(windows),
            ),
        )
    return BookingWindows(
        server_now=now,
        estimated_duration_minutes=duration,
        availability_is_preliminary=True,
        days=tuple(days),
    )


@transaction.atomic
def create_quote(
    *,
    customer: User,
    cart: Cart,
    address: Address,
    window_id: str,
) -> Quote:
    now = timezone.now()
    locked_cart = Cart.objects.select_for_update().get(id=cart.id)
    item = (
        CartItem.objects.select_related("variant__service", "task_rate", "configuration")
        .prefetch_related("scope_values")
        .filter(cart=locked_cart)
        .first()
    )
    if item is None:
        raise ValueError("Add a service to your booking before requesting a quote.")
    configuration, task_rate, scope, duration = _current_item_inputs(item)
    if address.customer_id != customer.id or address.archived_at is not None:
        raise PermissionError("Use one of the Customer's active addresses.")
    requested_start = _window_start_from_id(
        window_id=window_id,
        item=item,
        address=address,
    )
    decision = check_serviceability(
        postal_code=address.postal_code,
        variant_id=item.variant_id,
        requested_start=requested_start,
        duration_minutes=duration,
    )
    if not decision.is_serviceable or decision.service_area is None:
        raise WindowNoLongerAvailableApiError
    _assert_window_time_is_current(
        starts_at=requested_start,
        area_timezone=decision.service_area.timezone,
        now=now,
    )
    policy = current_pricing_policy(code="m1-technician")
    if policy is None:
        raise ValueError("No current pricing policy is configured.")
    cancellation_policy = current_cancellation_policy(code="m1-scheduled-today")
    if cancellation_policy is None:
        raise ValueError("No current cancellation policy is configured.")
    task_subtotal = task_rate.unit_price_paise * item.quantity
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
    cancellation_snapshot = {
        "code": cancellation_policy.code,
        "version": cancellation_policy.version,
        "bands": [
            {
                "code": band.code,
                "condition_text": band.condition_text,
                "fee_paise": band.fee_paise,
            }
            for band in cancellation_policy.bands.all()
        ],
    }
    return Quote.objects.create(
        version=1,
        cart_item=item,
        address=address,
        service_area=decision.service_area,
        task_subtotal_paise=task_subtotal,
        minimum_visit_adjustment_paise=adjustment,
        platform_fee_paise=fee,
        tax_paise=tax,
        total_paise=total,
        currency=task_rate.currency,
        estimated_duration_minutes=duration,
        requested_start=requested_start,
        arrival_window_minutes=settings.M1_ARRIVAL_WINDOW_MINUTES,
        arrival_window_id=window_id,
        task_rate_snapshot={
            "task_code": task_rate.task_code,
            "label": item.variant.service.name,
            "unit_price_paise": task_rate.unit_price_paise,
            "base_duration_minutes": task_rate.base_duration_minutes,
            "marginal_duration_minutes": task_rate.marginal_duration_minutes,
            "currency": task_rate.currency,
            "effective_from": task_rate.effective_from.isoformat(),
            "effective_to": (
                task_rate.effective_to.isoformat() if task_rate.effective_to else None
            ),
        },
        pricing_policy=policy,
        pricing_policy_snapshot={
            "code": policy.code,
            "version": policy.version,
            "minimum_service_subtotal_paise": policy.minimum_service_subtotal_paise,
            "gst_rate_basis_points": policy.gst_rate_basis_points,
            "platform_fee_mode": policy.platform_fee_mode,
            "platform_fee_value": policy.platform_fee_value,
            "commission_basis_points": policy.commission_basis_points,
            "commission_floor_paise": policy.commission_floor_paise,
            "commission_cap_paise": policy.commission_cap_paise,
        },
        cancellation_policy=cancellation_policy,
        cancellation_policy_snapshot=cancellation_snapshot,
        quote_inputs_snapshot={
            "cart_item_id": str(item.id),
            "quantity": item.quantity,
            "scope": scope,
            "configuration_version": configuration.version,
            "scope_schema": configuration.scope_schema,
        },
        expires_at=now + timedelta(seconds=settings.M1_QUOTE_TTL_SECONDS),
    )


@transaction.atomic
def create_checkout(  # noqa: PLR0912
    *,
    customer: User,
    quote: Quote,
    assisted_by: User | None = None,
    consent_purpose: str = "",
    consent_version: str = "",
) -> CheckoutSession:
    plan_cart_id, legacy_cart_id = (
        Quote.objects.filter(id=quote.id)
        .values_list(
            "fulfilment_plan__plan_set__cart_id",
            "cart_item__cart_id",
        )
        .get()
    )
    cart_id = plan_cart_id or legacy_cart_id
    if cart_id is None:
        raise PermissionError("The quote is not attached to a Customer cart.")
    locked_cart = Cart.objects.select_for_update().get(id=cart_id)
    locked_quote = (
        Quote.objects.select_for_update(of=("self",))
        .select_related(
            "cart_item__cart",
            "cart_item__variant",
            "fulfilment_plan__plan_set__cart",
            "address",
            "service_area",
        )
        .prefetch_related(
            "units__lines__plan_unit_item__cart_item",
            "units__plan_unit__items__cart_item",
        )
        .get(id=quote.id)
    )
    now = timezone.now()
    fulfilment_plan = locked_quote.fulfilment_plan
    legacy_cart_item = locked_quote.cart_item
    owning_cart = (
        fulfilment_plan.plan_set.cart
        if fulfilment_plan is not None
        else legacy_cart_item.cart
        if legacy_cart_item is not None
        else None
    )
    if owning_cart is None or owning_cart.customer_id != customer.id:
        raise PermissionError("The quote does not belong to this Customer.")
    if owning_cart.id != locked_cart.id:
        raise PermissionError("The quote cart relationship changed unexpectedly.")
    owning_cart = locked_cart
    if CheckoutSession.objects.filter(quote=locked_quote).exists():
        raise ValueError(
            "Checkout has already been started for this quote. Retry with its original key."
        )
    if locked_quote.status != Quote.Status.ACTIVE or locked_quote.expires_at <= now:
        if locked_quote.status == Quote.Status.ACTIVE:
            locked_quote.status = Quote.Status.EXPIRED
            locked_quote.save(update_fields=("status",))
        raise QuoteExpiredApiError
    if owning_cart.version != locked_quote.cart_version:
        locked_quote.status = Quote.Status.INVALIDATED
        locked_quote.save(update_fields=("status",))
        raise QuoteExpiredApiError
    if locked_quote.address.archived_at is not None:
        raise WindowNoLongerAvailableApiError
    _assert_window_time_is_current(
        starts_at=locked_quote.requested_start,
        area_timezone=locked_quote.service_area.timezone,
        now=now,
    )
    if fulfilment_plan is not None:
        for quote_unit in locked_quote.units.all():
            for plan_item in quote_unit.plan_unit.items.all():
                serviceability = check_serviceability(
                    postal_code=locked_quote.address.postal_code,
                    variant_id=plan_item.cart_item.variant_id,
                    requested_start=quote_unit.requested_start,
                    duration_minutes=quote_unit.estimated_duration_minutes,
                )
                if (
                    not serviceability.is_serviceable
                    or serviceability.service_area is None
                    or serviceability.service_area.id != quote_unit.plan_unit.service_area_id
                ):
                    raise WindowNoLongerAvailableApiError
    elif legacy_cart_item is not None:
        serviceability = check_serviceability(
            postal_code=locked_quote.address.postal_code,
            variant_id=legacy_cart_item.variant_id,
            requested_start=locked_quote.requested_start,
            duration_minutes=locked_quote.estimated_duration_minutes,
        )
        if (
            not serviceability.is_serviceable
            or serviceability.service_area is None
            or serviceability.service_area.id != locked_quote.service_area_id
        ):
            raise WindowNoLongerAvailableApiError
    if (
        assisted_by is not None
        and not ConsentReceipt.objects.filter(
            user=customer,
            purpose=consent_purpose,
            policy_version=consent_version,
            withdrawn_at__isnull=True,
        ).exists()
    ):
        raise PermissionError("An active Customer assisted-booking consent receipt is required.")
    booking_group: BookingGroup | None = None
    if fulfilment_plan is not None:
        booking_group = BookingGroup.objects.create(
            customer=customer,
            quote=locked_quote,
            address=locked_quote.address,
            confirmation_policy=fulfilment_plan.confirmation_policy,
            expires_at=now + timedelta(seconds=settings.M1_PARTNER_SEARCH_TIMEOUT_SECONDS),
        )
        for quote_unit in locked_quote.units.order_by("position"):
            unit = FulfilmentUnit.objects.create(
                booking_group=booking_group,
                quote_unit=quote_unit,
                service_area=quote_unit.plan_unit.service_area,
                position=quote_unit.position,
                requested_start=quote_unit.requested_start,
                arrival_window_minutes=quote_unit.arrival_window_minutes,
                estimated_duration_minutes=quote_unit.estimated_duration_minutes,
                total_paise=quote_unit.total_paise,
                currency=quote_unit.currency,
            )
            for line in quote_unit.lines.order_by("position"):
                plan_unit_item = line.plan_unit_item
                FulfilmentUnitLine.objects.create(
                    unit=unit,
                    quote_line=line,
                    cart_item=(plan_unit_item.cart_item if plan_unit_item is not None else None),
                    position=line.position,
                    kind=line.kind,
                    code=line.code,
                    label=line.label,
                    quantity=line.quantity,
                    amount_paise=line.amount_paise,
                    currency=line.currency,
                    snapshot=line.snapshot,
                )
    checkout = CheckoutSession.objects.create(
        customer=customer,
        quote=locked_quote,
        booking_group=booking_group,
        expires_at=now + timedelta(seconds=settings.M1_PARTNER_SEARCH_TIMEOUT_SECONDS),
        assisted_by=assisted_by,
        customer_consent_purpose=consent_purpose,
        customer_consent_version=consent_version,
    )
    locked_quote.status = Quote.Status.CONSUMED
    locked_quote.save(update_fields=("status",))
    if booking_group is not None:
        enqueue_outbox_event(
            aggregate_type="booking_group",
            aggregate_id=booking_group.id,
            event_type="booking_group.confirmed",
            idempotency_key=f"booking-group-confirmed:{booking_group.id}",
            payload={"booking_group_id": str(booking_group.id)},
        )
    return checkout
