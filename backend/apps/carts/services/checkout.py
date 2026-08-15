"""Pricing a cart into a quote, and turning an accepted quote into a checkout session.

The boundary is the money leg: from here on the cart's contents are frozen into
snapshots — the task rate, the pricing policy, the cancellation bands and the scope
schema are all copied onto the `Quote` so a later catalog or policy edit cannot
retroactively change what the Customer agreed to.

`create_quote` redeems a window id issued by `windows`; `create_checkout` re-checks
serviceability for every unit, opens the `BookingGroup` and its `FulfilmentUnit` rows,
consumes the quote, and enqueues the outbox event that starts the Partner search.
"""

from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.carts.availability import arrival_window_for_duration
from apps.carts.exceptions import QuoteExpiredApiError, WindowNoLongerAvailableApiError
from apps.carts.item_inputs import assert_window_time_is_current, current_item_inputs
from apps.carts.models import (
    BookingGroup,
    Cart,
    CartItem,
    CheckoutSession,
    FulfilmentUnit,
    FulfilmentUnitLine,
    Quote,
)
from apps.carts.planning import resolve_cart_service_area, scheduling_groups
from apps.foundation.services import enqueue_outbox_event
from apps.identity.models import ConsentReceipt, User
from apps.locations.models import Address
from apps.locations.services import check_serviceability
from apps.pricing.models import PricingPolicy
from apps.pricing.selectors import current_cancellation_policy, current_pricing_policy

from .windows import _window_start_from_id


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
    configuration, task_rate, scope, duration = current_item_inputs(item)
    if address.customer_id != customer.id or address.archived_at is not None:
        raise PermissionError("Use one of the Customer's active addresses.")
    # The window was signed against the scheduling group the item belongs to
    # (`create_booking_windows`), not the item id directly — the same visit can
    # combine several cart items (spec §9), so this resolves the same way rather
    # than duplicating the grouping rule.
    grouping_area = resolve_cart_service_area(cart=locked_cart, address=address)
    group = next(
        (
            candidate
            for candidate in scheduling_groups(cart=locked_cart, area=grouping_area, at=now)
            if item.id in candidate.cart_item_ids
        ),
        None,
    )
    if group is None:
        raise WindowNoLongerAvailableApiError
    requested_start, promised_window_minutes = _window_start_from_id(
        window_id=window_id,
        scope_key=group.key,
        address=address,
    )
    # The grid drew this window against the duration the visit had at the time.
    # If the Customer edited the item's scope since, the duration — and with it the
    # tier — can have moved while the scheduling group's key stayed the same. Refuse
    # rather than book a width the Customer was never shown; the client re-fetches
    # the grid on this error and the Customer picks again from honest slots.
    if promised_window_minutes != arrival_window_for_duration(duration):
        raise WindowNoLongerAvailableApiError
    decision = check_serviceability(
        postal_code=address.postal_code,
        variant_id=item.variant_id,
        requested_start=requested_start,
        duration_minutes=duration,
    )
    if not decision.is_serviceable or decision.service_area is None:
        raise WindowNoLongerAvailableApiError
    assert_window_time_is_current(
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
        arrival_window_minutes=promised_window_minutes,
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
    assert_window_time_is_current(
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
