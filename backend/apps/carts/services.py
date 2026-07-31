"""Server-authoritative M1 cart, quote, and checkout commands."""

from datetime import datetime, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.carts.models import Cart, CartItem, CartItemScope, CheckoutSession, Quote
from apps.catalog.models import A1VariantConfiguration, ServiceVariant
from apps.identity.hashing import keyed_hash
from apps.identity.models import ConsentReceipt, User
from apps.locations.models import Address
from apps.locations.services import check_serviceability
from apps.pricing.models import PricingPolicy
from apps.pricing.selectors import current_pricing_policy, current_task_rate


def _cart_for(*, user: User | None, session_key: str) -> Cart:
    if user is not None:
        cart, _ = Cart.objects.get_or_create(customer=user)
        return cart
    cart, _ = Cart.objects.get_or_create(session_key_hash=keyed_hash(session_key))
    return cart


@transaction.atomic
def merge_session_cart(*, user: User, session_key: str) -> Cart:
    """Claim the anonymous cart on first authenticated cart access.

    A customer cart is deliberately limited to one item for M1.  Two non-empty
    carts therefore cannot be silently merged; the customer must choose which
    cart to retain.
    """
    session_hash = keyed_hash(session_key)
    customer_cart, _ = Cart.objects.select_for_update().get_or_create(customer=user)
    anonymous_cart = (
        Cart.objects.select_for_update()
        .filter(customer__isnull=True, session_key_hash=session_hash)
        .first()
    )
    if anonymous_cart is None or anonymous_cart.id == customer_cart.id:
        return customer_cart
    has_customer_item = CartItem.objects.filter(cart=customer_cart).exists()
    has_anonymous_item = CartItem.objects.filter(cart=anonymous_cart).exists()
    if has_customer_item and has_anonymous_item:
        raise ValueError("Both carts contain an item and cannot be merged automatically.")
    if has_anonymous_item:
        CartItem.objects.filter(cart=anonymous_cart).update(cart=customer_cart)
    anonymous_cart.delete()
    return customer_cart


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


@transaction.atomic
def replace_cart_item(
    *,
    user: User | None,
    session_key: str,
    variant_id: UUID,
    quantity: int,
    scope: dict[str, object],
) -> CartItem:
    variant = ServiceVariant.objects.select_for_update().get(
        id=variant_id,
        is_active=True,
        booking_archetype=ServiceVariant.BookingArchetype.A1_TASK_VISIT,
        service__status="ACTIVE",
    )
    configuration = A1VariantConfiguration.objects.get(
        variant=variant, status=A1VariantConfiguration.Status.ACTIVE
    )
    _validate_scope(schema=configuration.scope_schema, scope=scope)
    task_rate = current_task_rate(variant=variant, task_code=variant.service.slug)
    if task_rate is None:
        raise ValueError("The selected task has no current rate.")
    cart = _cart_for(user=user, session_key=session_key)
    # Quotes retain their cart-item snapshot.  Detach that historical cart before
    # replacing its item so a subsequent cart edit cannot mutate quoted inputs.
    if CartItem.objects.filter(cart=cart, quote__isnull=False).exists():
        cart.customer = None
        cart.session_key_hash = ""
        cart.save(update_fields=("customer", "session_key_hash", "updated_at"))
        cart = _cart_for(user=user, session_key=session_key)
    CartItem.objects.filter(cart=cart).delete()
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


def create_quote(
    *,
    customer: User,
    cart: Cart,
    address: Address,
    requested_start: datetime,
) -> Quote:
    now = timezone.now()
    india_now = now.astimezone(ZoneInfo("Asia/Kolkata"))
    local_start = requested_start.astimezone(ZoneInfo("Asia/Kolkata"))
    if requested_start < now + timedelta(minutes=settings.M1_TODAY_LEAD_TIME_MINUTES):
        raise ValueError("Today bookings require at least 120 minutes lead time.")
    if local_start.date() > india_now.date() + timedelta(days=settings.M1_SCHEDULED_MAX_DAYS):
        raise ValueError("Scheduled bookings are limited to seven calendar days ahead.")
    item = CartItem.objects.select_related("variant", "task_rate", "configuration").get(cart=cart)
    configuration = A1VariantConfiguration.objects.filter(
        variant=item.variant, status=A1VariantConfiguration.Status.ACTIVE
    ).first()
    if configuration is None:
        raise ValueError("The selected task is no longer available for booking.")
    scope = {entry.code: entry.value for entry in item.scope_values.all()}
    _validate_scope(schema=configuration.scope_schema, scope=scope)
    task_rate = current_task_rate(variant=item.variant, task_code=item.variant.service.slug)
    if task_rate is None:
        raise ValueError("The selected task has no current rate.")
    if address.customer_id != customer.id or address.archived_at is not None:
        raise PermissionError("Use one of the Customer's active addresses.")
    duration = task_rate.base_duration_minutes + task_rate.marginal_duration_minutes * item.quantity
    decision = check_serviceability(
        postal_code=address.postal_code,
        variant_id=item.variant_id,
        requested_start=requested_start,
        duration_minutes=duration,
    )
    if not decision.is_serviceable or decision.service_area is None:
        raise ValueError(decision.reason_code or "Address is not serviceable.")
    policy = current_pricing_policy(code="m1-technician")
    if policy is None:
        raise ValueError("No current pricing policy is configured.")
    task_subtotal = task_rate.unit_price_paise * item.quantity
    adjustment = max(0, policy.minimum_service_subtotal_paise - task_subtotal)
    service_subtotal = task_subtotal + adjustment
    fee = (
        policy.platform_fee_value
        if policy.platform_fee_mode == PricingPolicy.PlatformFeeMode.FIXED
        else service_subtotal * policy.platform_fee_value // 10_000
    )
    return Quote.objects.create(
        cart_item=item,
        address=address,
        service_area=decision.service_area,
        task_subtotal_paise=task_subtotal,
        minimum_visit_adjustment_paise=adjustment,
        platform_fee_paise=fee,
        total_paise=service_subtotal + fee,
        estimated_duration_minutes=duration,
        requested_start=requested_start,
        arrival_window_minutes=settings.M1_ARRIVAL_WINDOW_MINUTES,
        task_rate_snapshot={
            "task_code": task_rate.task_code,
            "unit_price_paise": task_rate.unit_price_paise,
            "base_duration_minutes": task_rate.base_duration_minutes,
            "marginal_duration_minutes": task_rate.marginal_duration_minutes,
        },
        pricing_policy=policy,
        quote_inputs_snapshot={
            "quantity": item.quantity,
            "scope": scope,
            "configuration_version": configuration.version,
            "scope_schema": configuration.scope_schema,
        },
    )


@transaction.atomic
def create_checkout(
    *,
    customer: User,
    quote: Quote,
    assisted_by: User | None = None,
    consent_purpose: str = "",
    consent_version: str = "",
) -> CheckoutSession:
    if quote.cart_item.cart.customer_id != customer.id:
        raise PermissionError("The quote does not belong to this Customer.")
    if quote.created_at < timezone.now() - timedelta(
        seconds=settings.M1_PARTNER_SEARCH_TIMEOUT_SECONDS
    ):
        raise ValueError("The quote has expired. Create a new quote before checkout.")
    if CheckoutSession.objects.filter(quote=quote).exists():
        raise ValueError(
            "Checkout has already been started for this quote. Retry with its original key."
        )
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
    return CheckoutSession.objects.create(
        customer=customer,
        quote=quote,
        expires_at=timezone.now() + timedelta(seconds=settings.M1_PARTNER_SEARCH_TIMEOUT_SECONDS),
        assisted_by=assisted_by,
        customer_consent_purpose=consent_purpose,
        customer_consent_version=consent_version,
    )
