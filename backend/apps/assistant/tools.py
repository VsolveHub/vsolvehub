"""The functions the model may call, each a thin wrapper over a command the website already uses.

| Tool | Wraps |
| --- | --- |
| `search_services` | `catalog.selectors.public_service_index` + current rates |
| `get_service_details` | A1 variants, `pricing.selectors.current_task_rate`, `ServicePolicy` |
| `list_my_addresses` | the Customer's saved `Address` rows |
| `add_service_to_booking`, `view_booking`, `remove_from_booking` | `carts.services` commands |
| `find_slots` | `carts.services.create_booking_windows`, per scheduling group |
| `prepare_booking` | `carts.planning.create_fulfilment_plan_set` + `create_plan_quote` |
| `confirm_booking` | `carts.services.create_checkout` |
| `booking_status` | the live `BookingGroup`, through `progress.describe` |

Nothing here takes money. Payment starts from the booking page's own Pay button, and a booking is
confirmed only by the provider-verified capture path (see `progress`).

## Two guards the model cannot talk its way past

- `confirm_booking` refuses a quote created in the same turn. The Customer must have seen the
  price in an earlier message and answered it; "quote it and book it" in one breath becomes a
  question, not a booking.
- One open booking per conversation, enforced by a database constraint on `AssistantBooking`.
"""

import logging
import re
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import cast
from uuid import UUID

from django.db import IntegrityError, transaction
from django.db.models import QuerySet
from django.utils import timezone
from rest_framework.exceptions import APIException

from apps.carts.exceptions import DuplicateCartItemApiError
from apps.carts.models import BookingGroup, Cart, CartItem, FulfilmentUnit, Quote
from apps.carts.planning import (
    create_fulfilment_plan_set,
    create_plan_quote,
    resolve_cart_service_area,
    scheduling_groups,
)
from apps.carts.services import (
    add_cart_item,
    create_booking_windows,
    create_checkout,
    merge_session_cart,
    remove_cart_item,
)
from apps.catalog.models import A1VariantConfiguration, Service, ServicePolicy, ServiceVariant
from apps.catalog.selectors import public_service_index
from apps.identity.models import User
from apps.locations.models import Address
from apps.pricing.selectors import current_task_rate, variants_with_current_rate

from .formatting import format_day, format_inr, format_window, local
from .llm import JsonObject, ToolCall, ToolResult, ToolSpec
from .models import AssistantBooking, AssistantSession
from .progress import describe, phase_of
from .refs import UnknownReferenceError, recall, remember

logger = logging.getLogger(__name__)

MAX_SEARCH_RESULTS = 6
MAX_SLOTS_PER_VISIT = 6
MAX_SUGGESTED_DAYS = 5
MAX_QUANTITY = 20
MAX_ERROR_MESSAGE = 200
#: Local-hour bounds for "morning", "afternoon" and "evening" as a Customer means them.
PART_OF_DAY_HOURS = {"morning": (6, 12), "afternoon": (12, 17), "evening": (17, 23)}
ACTIVE_GROUP_STATUSES = (
    BookingGroup.Status.CONFIRMED,
    BookingGroup.Status.MATCHING,
    BookingGroup.Status.PARTIALLY_HELD,
    BookingGroup.Status.ALL_UNITS_HELD,
    BookingGroup.Status.PAYMENT_PENDING,
    BookingGroup.Status.BOOKED,
)

LOGIN_ACTION: JsonObject = {"type": "LOGIN", "label": "Log in to continue", "href": "/login"}
ADD_ADDRESS_ACTION: JsonObject = {
    "type": "ADD_ADDRESS",
    "label": "Add an address",
    "href": "/account/addresses",
}


class ToolError(Exception):
    """A refusal the model should explain to the Customer, in the Customer's words."""

    def __init__(self, code: str, message: str, *, actions: list[JsonObject] | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.actions = actions or []


@dataclass
class ToolContext:
    session: AssistantSession
    user: User | None
    cart_session_key: str
    #: This turn's number. A quote remembers the turn it was shown in; see `confirm_booking`.
    turn: int
    #: UI cards for the reply. The most recent tool that produced cards wins, so chips for an
    #: earlier step never sit under the answer to a later one.
    actions: list[JsonObject] = field(default_factory=list)

    @property
    def state(self) -> JsonObject:
        return cast(JsonObject, self.session.state)

    def customer(self) -> User:
        if self.user is None:
            raise ToolError(
                "login_required",
                "The customer must log in before this step.",
                actions=[LOGIN_ACTION],
            )
        return self.user


Handler = Callable[[ToolContext, JsonObject], JsonObject]


@dataclass(frozen=True, slots=True)
class Tool:
    spec: ToolSpec
    handler: Handler


# --- argument helpers ------------------------------------------------------------------------


def _text(args: JsonObject, key: str, *, required: bool = True, max_length: int = 200) -> str:
    value = args.get(key)
    if value is None or (isinstance(value, str) and not value.strip()):
        if required:
            raise ToolError("missing_argument", f"`{key}` is required.")
        return ""
    return str(value).strip()[:max_length]


def _int(args: JsonObject, key: str, *, default: int, minimum: int, maximum: int) -> int:
    value = args.get(key, default)
    try:
        number = int(value)
    except (TypeError, ValueError) as exc:
        raise ToolError("invalid_argument", f"`{key}` must be a whole number.") from exc
    if not minimum <= number <= maximum:
        raise ToolError("invalid_argument", f"`{key}` must be between {minimum} and {maximum}.")
    return number


def _ref(ctx: ToolContext, args: JsonObject, key: str, kind: str) -> JsonObject:
    try:
        return recall(ctx.state, _text(args, key), kind)
    except UnknownReferenceError as exc:
        raise ToolError(
            "unknown_reference",
            f"{exc.ref!r} is not a {kind} from this conversation. Look it up again first.",
        ) from exc


def _quick_replies(labels: list[str]) -> list[JsonObject]:
    return [{"type": "QUICK_REPLY", "label": label, "message": label} for label in labels]


# --- shared reads ----------------------------------------------------------------------------


def _bookable_variants() -> QuerySet[ServiceVariant]:
    """A1 variants a Customer can put in a cart today: active, configured and priced."""

    return (
        variants_with_current_rate()
        .filter(
            is_active=True,
            booking_archetype=ServiceVariant.BookingArchetype.A1_TASK_VISIT,
            service__status=Service.Status.ACTIVE,
            a1_configurations__status=A1VariantConfiguration.Status.ACTIVE,
        )
        .filter(current_rate_amount_paise__isnull=False)  # type: ignore[misc]  # Subquery annotation.
        .distinct()
    )


def _cart(ctx: ToolContext) -> Cart:
    return merge_session_cart(user=ctx.customer(), session_key=ctx.cart_session_key)


def _active_items(cart: Cart) -> list[CartItem]:
    return list(
        CartItem.objects.filter(cart=cart, removed_at__isnull=True)
        .select_related("variant__service", "task_rate")
        .order_by("created_at")
    )


def _booking_summary(ctx: ToolContext, cart: Cart) -> JsonObject:
    items = [
        {
            "item_ref": remember(ctx.state, "item", {"id": str(item.id)}),
            "service": item.variant.service.name,
            "option": item.variant.name,
            "quantity": item.quantity,
            "price": format_inr(item.task_rate.unit_price_paise * item.quantity),
        }
        for item in _active_items(cart)
    ]
    return {"items": items, "note": "Fees and GST are added in the final price."}


def _address(ctx: ToolContext, args: JsonObject) -> Address:
    payload = _ref(ctx, args, "address_ref", "address")
    address = Address.objects.filter(
        id=payload["id"], customer=ctx.customer(), archived_at__isnull=True
    ).first()
    if address is None:
        raise ToolError("unknown_reference", "That address is no longer saved. List them again.")
    return address


def _open_booking(ctx: ToolContext) -> AssistantBooking | None:
    return (
        AssistantBooking.objects.filter(session=ctx.session, closed_at__isnull=True)
        .select_related("booking_group")
        .first()
    )


# --- tools -----------------------------------------------------------------------------------


def _search_services(ctx: ToolContext, args: JsonObject) -> JsonObject:
    query = _text(args, "query", max_length=120).lower()
    tokens = [token for token in re.split(r"[^a-z0-9]+", query) if len(token) >= 2]  # noqa: PLR2004
    if not tokens:
        raise ToolError("missing_argument", "Search with one or two English keywords.")
    stems = [{token, token.rstrip("s")} for token in tokens]
    services = list(public_service_index())
    prices: dict[UUID, int] = {}
    for service_id, amount in (
        _bookable_variants()
        .filter(service_id__in=[service.id for service in services])
        .values_list("service_id", "current_rate_amount_paise")  # type: ignore[misc]
    ):
        prices[service_id] = min(amount, prices.get(service_id, amount))
    scored: list[tuple[int, int, Service]] = []
    for position, service in enumerate(services):
        name = service.name.lower()
        haystack = " ".join(
            (
                name,
                service.short_description.lower(),
                service.slug.replace("-", " "),
                service.subcategory.name.lower(),
                service.subcategory.category.name.lower(),
            )
        )
        score = 0
        for forms in stems:
            if any(form and form in name for form in forms):
                score += 2
            elif any(form and form in haystack for form in forms):
                score += 1
        if score:
            scored.append((-score, position, service))
    scored.sort(key=lambda row: (row[0], row[1]))
    results = []
    for _negative_score, _position, service in scored[:MAX_SEARCH_RESULTS]:
        bookable = service.id in prices
        results.append(
            {
                "service_ref": remember(ctx.state, "service", {"id": str(service.id)}),
                "name": service.name,
                "category": service.subcategory.category.name,
                "price_from": format_inr(prices[service.id]) if bookable else None,
                "bookable_in_chat": bookable,
            }
        )
    if not results:
        return {
            "results": [],
            "hint": "Nothing matched. Try other English catalogue words, or ask what needs doing.",
        }
    ctx.actions = _quick_replies([str(result["name"]) for result in results])
    return {"results": results}


def _scope_questions(schema: JsonObject) -> tuple[list[JsonObject], bool]:
    questions = schema.get("questions")
    if not isinstance(questions, list):
        return [], False
    asks_quantity = False
    visible: list[JsonObject] = []
    for question in questions:
        if not isinstance(question, dict) or not isinstance(question.get("code"), str):
            continue
        if question["code"] == "quantity":
            asks_quantity = True
            continue
        entry: JsonObject = {
            "code": question["code"],
            "kind": question.get("kind"),
            "required": bool(question.get("required")),
        }
        for key in ("prompt", "label", "minimum", "options"):
            if key in question:
                entry[key] = question[key]
        visible.append(entry)
    return visible, asks_quantity


def _get_service_details(ctx: ToolContext, args: JsonObject) -> JsonObject:
    payload = _ref(ctx, args, "service_ref", "service")
    service = (
        Service.objects.select_related("subcategory__category")
        .filter(id=payload["id"], status=Service.Status.ACTIVE)
        .first()
    )
    if service is None:
        raise ToolError("not_available", "This service is no longer offered.")
    variants = list(_bookable_variants().filter(service=service).order_by("display_order", "name"))
    if not variants:
        ctx.actions = [
            {
                "type": "OPEN_LINK",
                "label": f"Request {service.name}",
                "href": f"/book/{service.slug}",
            }
        ]
        return {
            "service": service.name,
            "bookable_in_chat": False,
            "message": "This service is booked through a request on the website, not in chat.",
        }
    options: list[JsonObject] = []
    for variant in variants:
        rate = current_task_rate(variant=variant, task_code=service.slug)
        configuration = A1VariantConfiguration.objects.filter(
            variant=variant, status=A1VariantConfiguration.Status.ACTIVE
        ).first()
        if rate is None or configuration is None:
            continue
        questions, asks_quantity = _scope_questions(cast(JsonObject, configuration.scope_schema))
        options.append(
            {
                "variant_ref": remember(ctx.state, "variant", {"id": str(variant.id)}),
                "name": variant.name,
                "description": variant.description[:200],
                "price": format_inr(rate.unit_price_paise),
                "duration_minutes": rate.base_duration_minutes + rate.marginal_duration_minutes,
                "asks_quantity": asks_quantity,
                "questions": questions,
            }
        )
    policies = ServicePolicy.objects.filter(
        service=service,
        is_active=True,
        kind__in=(ServicePolicy.Kind.INCLUDED, ServicePolicy.Kind.EXCLUDED),
    ).order_by("kind", "display_order")[:8]
    if len(options) > 1:
        ctx.actions = _quick_replies([str(option["name"]) for option in options])
    return {
        "service": service.name,
        "bookable_in_chat": True,
        "options": options,
        "included": [p.text for p in policies if p.kind == ServicePolicy.Kind.INCLUDED],
        "not_included": [p.text for p in policies if p.kind == ServicePolicy.Kind.EXCLUDED],
        "note": "Prices are per unit before fees; the final total is shown before confirming.",
    }


def _list_my_addresses(ctx: ToolContext, _args: JsonObject) -> JsonObject:
    addresses = list(
        Address.objects.filter(customer=ctx.customer(), archived_at__isnull=True).order_by(
            "-is_default", "-updated_at"
        )[:10]
    )
    if not addresses:
        ctx.actions = [ADD_ADDRESS_ACTION]
        return {
            "addresses": [],
            "next": "Ask the customer to add an address with the button, then continue.",
        }
    ctx.actions = [*_quick_replies([a.label for a in addresses]), ADD_ADDRESS_ACTION]
    return {
        "addresses": [
            {
                "address_ref": remember(ctx.state, "address", {"id": str(a.id)}),
                "label": a.label,
                # Locality and PIN only: enough to recognise, and no house number to the model.
                "area": f"{a.locality}, {a.city} {a.postal_code}",
                "is_default": a.is_default,
            }
            for a in addresses
        ]
    }


def _scope_from_answers(schema: JsonObject, answers: object, quantity: int) -> JsonObject:
    definitions = {
        str(q["code"]): q
        for q in schema.get("questions") or []
        if isinstance(q, dict) and isinstance(q.get("code"), str)
    }
    scope: JsonObject = {"quantity": quantity} if "quantity" in definitions else {}
    for answer in answers if isinstance(answers, list) else []:
        if not isinstance(answer, dict):
            continue
        code, value = str(answer.get("code", "")), str(answer.get("value", "")).strip()
        definition = definitions.get(code)
        if definition is None or code == "quantity":
            continue
        kind = definition.get("kind")
        if kind == "INTEGER":
            try:
                scope[code] = int(value)
            except ValueError as exc:
                raise ToolError("invalid_argument", f"`{code}` needs a whole number.") from exc
        elif kind == "BOOLEAN":
            scope[code] = value.lower() in {"yes", "true", "y", "1", "haan", "ha"}
        elif kind == "MULTI_SELECT":
            scope[code] = [entry.strip() for entry in value.split(",") if entry.strip()]
        else:
            scope[code] = value[:200]
    return scope


def _add_service_to_booking(ctx: ToolContext, args: JsonObject) -> JsonObject:
    user = ctx.customer()
    payload = _ref(ctx, args, "variant_ref", "variant")
    quantity = _int(args, "quantity", default=1, minimum=1, maximum=MAX_QUANTITY)
    variant = _bookable_variants().select_related("service").filter(id=payload["id"]).first()
    if variant is None:
        raise ToolError("not_available", "That option can no longer be booked.")
    configuration = A1VariantConfiguration.objects.get(
        variant=variant, status=A1VariantConfiguration.Status.ACTIVE
    )
    scope = _scope_from_answers(
        cast(JsonObject, configuration.scope_schema), args.get("answers"), quantity
    )
    cart = _cart(ctx)
    try:
        add_cart_item(
            user=user,
            session_key=ctx.cart_session_key,
            expected_cart_version=cart.version,
            variant_id=variant.id,
            quantity=quantity,
            scope=scope,
        )
        added = True
    except DuplicateCartItemApiError:
        added = False
    cart.refresh_from_db()
    return {
        "added": added,
        "message": None if added else "That exact option is already in the booking.",
        "booking": _booking_summary(ctx, cart),
    }


def _view_booking(ctx: ToolContext, _args: JsonObject) -> JsonObject:
    return {"booking": _booking_summary(ctx, _cart(ctx))}


def _remove_from_booking(ctx: ToolContext, args: JsonObject) -> JsonObject:
    payload = _ref(ctx, args, "item_ref", "item")
    cart = _cart(ctx)
    item = CartItem.objects.filter(id=payload["id"], cart=cart, removed_at__isnull=True).first()
    if item is None:
        raise ToolError("unknown_reference", "That item is not in the booking any more.")
    cart = remove_cart_item(
        cart=cart,
        item_id=item.id,
        expected_cart_version=cart.version,
        expected_item_version=item.version,
    )
    return {"removed": True, "booking": _booking_summary(ctx, cart)}


def _requested_date(args: JsonObject) -> date | None:
    raw = _text(args, "date", required=False, max_length=10)
    if not raw:
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError as exc:
        raise ToolError("invalid_argument", "`date` must look like 2026-11-07.") from exc


def _find_slots(ctx: ToolContext, args: JsonObject) -> JsonObject:
    user = ctx.customer()
    address = _address(ctx, args)
    wanted_day = _requested_date(args)
    part = _text(args, "part_of_day", required=False, max_length=12).lower()
    hours = PART_OF_DAY_HOURS.get(part)
    cart = _cart(ctx)
    if not _active_items(cart):
        raise ToolError("empty_booking", "Add a service before looking for times.")
    area = resolve_cart_service_area(cart=cart, address=address)
    visits: list[JsonObject] = []
    first_visit_labels: list[str] = []
    for group in scheduling_groups(cart=cart, area=area):
        grid = create_booking_windows(
            customer=user, cart=cart, address=address, group_key=group.key
        )
        available = [w for day in grid.days for w in day.windows if w.is_available]
        matching = [
            w
            for w in available
            if (wanted_day is None or local(w.starts_at, grid.timezone).date() == wanted_day)
            and (hours is None or hours[0] <= local(w.starts_at, grid.timezone).hour < hours[1])
        ]
        slots = []
        for window in matching[:MAX_SLOTS_PER_VISIT]:
            label = format_window(window.starts_at, window.ends_at, grid.timezone)
            slots.append(
                {
                    "slot_ref": remember(
                        ctx.state,
                        "slot",
                        {
                            "group_key": group.key,
                            "starts_at": window.starts_at.isoformat(),
                            "address_id": str(address.id),
                            "cart_version": cart.version,
                        },
                    ),
                    "label": label,
                }
            )
        other_days: list[str] = []
        for window in available:
            day = format_day(window.starts_at, grid.timezone)
            if day not in other_days:
                other_days.append(day)
            if len(other_days) == MAX_SUGGESTED_DAYS:
                break
        visits.append(
            {
                "visit": group.label,
                "duration_minutes": group.estimated_duration_minutes,
                "slots": slots,
                "other_days_with_slots": [] if slots else other_days,
            }
        )
        if not first_visit_labels:
            first_visit_labels = [str(slot["label"]) for slot in slots]
    ctx.actions = _quick_replies(first_visit_labels)
    return {"visits": visits, "note": "Times are arrival windows."}


def _prepare_booking(ctx: ToolContext, args: JsonObject) -> JsonObject:
    user = ctx.customer()
    address = _address(ctx, args)
    raw_refs = args.get("slot_refs")
    if not isinstance(raw_refs, list) or not raw_refs:
        raise ToolError("missing_argument", "Pass one slot_ref for every visit.")
    cart = _cart(ctx)
    preferred: dict[str, datetime] = {}
    for raw in raw_refs:
        try:
            slot = recall(ctx.state, raw, "slot")
        except UnknownReferenceError as exc:
            raise ToolError("unknown_reference", f"{raw!r} is not a slot from find_slots.") from exc
        if slot["address_id"] != str(address.id):
            raise ToolError("slot_mismatch", "That time was found for a different address.")
        if slot["cart_version"] != cart.version:
            raise ToolError("slots_stale", "The booking changed since then. Run find_slots again.")
        preferred[str(slot["group_key"])] = datetime.fromisoformat(str(slot["starts_at"]))
    plan_set = create_fulfilment_plan_set(
        customer=user,
        cart=cart,
        address=address,
        expected_cart_version=cart.version,
        preferred_starts=preferred,
        booking_mode="SCHEDULED",
    )
    plan = plan_set.plans.filter(is_recommended=True).first() or plan_set.plans.first()
    if plan is None:
        raise ToolError("no_plan", "No professional can do this at that time. Try another slot.")
    quote = create_plan_quote(customer=user, plan=plan)
    units = list(quote.units.select_related("plan_unit__service_area").order_by("position"))
    lines = [f"Service: {format_inr(quote.task_subtotal_paise)}"]
    if quote.minimum_visit_adjustment_paise:
        lines.append(f"Minimum visit charge: {format_inr(quote.minimum_visit_adjustment_paise)}")
    if quote.platform_fee_paise:
        lines.append(f"Platform fee: {format_inr(quote.platform_fee_paise)}")
    if quote.tax_paise:
        lines.append(f"Includes GST: {format_inr(quote.tax_paise)}")
    visits = [
        {
            "when": format_window(
                unit.requested_start,
                unit.requested_start + timedelta(minutes=unit.arrival_window_minutes),
                unit.plan_unit.service_area.timezone,
            ),
            "duration_minutes": unit.estimated_duration_minutes,
        }
        for unit in units
    ]
    total = format_inr(quote.total_paise)
    quote_ref = remember(ctx.state, "quote", {"id": str(quote.id), "turn": ctx.turn})
    ctx.actions = [
        {
            "type": "QUOTE",
            "label": "Yes, book it",
            "amount": total,
            "lines": [*lines, *(f"Visit: {visit['when']}" for visit in visits)],
            "message": "Yes, book it",
        }
    ]
    minutes_valid = max(0, int((quote.expires_at - timezone.now()).total_seconds() // 60))
    return {
        "quote_ref": quote_ref,
        "total": total,
        "lines": lines,
        "visits": visits,
        "address": f"{address.label} — {address.locality}",
        "valid_for_minutes": minutes_valid,
        "next": "Show the total and time, then wait for the customer to say yes.",
    }


def _duplicate_exists(user: User, quote: Quote) -> bool:
    starts = list(quote.units.values_list("requested_start", flat=True))
    variant_ids = list(
        quote.units.values_list("plan_unit__items__cart_item__variant_id", flat=True).distinct()
    )
    return FulfilmentUnit.objects.filter(
        booking_group__customer=user,
        booking_group__status__in=ACTIVE_GROUP_STATUSES,
        requested_start__in=starts,
        lines__cart_item__variant_id__in=[v for v in variant_ids if v is not None],
    ).exists()


def _confirm_booking(ctx: ToolContext, args: JsonObject) -> JsonObject:
    user = ctx.customer()
    payload = _ref(ctx, args, "quote_ref", "quote")
    if int(payload["turn"]) >= ctx.turn:
        raise ToolError(
            "confirmation_required",
            "Show the customer the total first and wait for their reply before confirming.",
        )
    if _open_booking(ctx) is not None:
        raise ToolError(
            "booking_already_open",
            "This chat already has a booking in progress. Check booking_status.",
        )
    quote = Quote.objects.filter(id=payload["id"]).first()
    if quote is None or quote.status != Quote.Status.ACTIVE:
        raise ToolError("quote_expired", "That price has expired. Run prepare_booking again.")
    if _duplicate_exists(user, quote):
        raise ToolError(
            "duplicate_booking",
            "The customer already has this service booked at that time. Point them to Bookings.",
            actions=[{"type": "OPEN_LINK", "label": "My bookings", "href": "/bookings"}],
        )
    try:
        with transaction.atomic():
            checkout = create_checkout(customer=user, quote=quote)
            group = checkout.booking_group
            if group is None:
                raise ToolError("not_possible", "This booking cannot be completed in chat.")
            AssistantBooking.objects.create(
                session=ctx.session,
                checkout=checkout,
                booking_group=group,
                announced_status=phase_of(group.status),
            )
    except IntegrityError as exc:
        raise ToolError(
            "booking_already_open",
            "This chat already has a booking in progress. Check booking_status.",
        ) from exc
    group = BookingGroup.objects.select_related("quote").get(id=group.id)
    progress = describe(group)
    ctx.actions = progress.actions
    return progress.as_tool_content()


def _booking_status(ctx: ToolContext, _args: JsonObject) -> JsonObject:
    ctx.customer()
    booking = (
        AssistantBooking.objects.filter(session=ctx.session)
        .order_by("closed_at", "-created_at")
        .first()
    )
    if booking is None:
        return {"status": "none", "summary": "No booking has been made in this chat yet."}
    group = BookingGroup.objects.select_related("quote").get(id=booking.booking_group_id)
    progress = describe(group)
    ctx.actions = progress.actions
    return progress.as_tool_content()


# --- registry --------------------------------------------------------------------------------

_REF = {"type": "string", "description": "A reference returned by an earlier tool, such as V3."}

TOOLS: tuple[Tool, ...] = (
    Tool(
        ToolSpec(
            "search_services",
            "Find home services in the catalogue. Pass short English keywords that describe the "
            "service, e.g. 'ac repair', 'geyser', 'fan installation', 'deep cleaning'.",
            {
                "type": "object",
                "properties": {"query": {"type": "string", "description": "English keywords."}},
                "required": ["query"],
            },
        ),
        _search_services,
    ),
    Tool(
        ToolSpec(
            "get_service_details",
            "Options (variants) of one service with price per unit, duration, any questions the "
            "booking needs, and what is included.",
            {"type": "object", "properties": {"service_ref": _REF}, "required": ["service_ref"]},
        ),
        _get_service_details,
    ),
    Tool(
        ToolSpec(
            "list_my_addresses",
            "The customer's saved addresses. Requires login.",
            {"type": "object", "properties": {}},
        ),
        _list_my_addresses,
    ),
    Tool(
        ToolSpec(
            "add_service_to_booking",
            "Add one option to the customer's booking. Requires login.",
            {
                "type": "object",
                "properties": {
                    "variant_ref": _REF,
                    "quantity": {"type": "integer", "description": "How many units. Default 1."},
                    "answers": {
                        "type": "array",
                        "description": "Answers to the option's questions, if it has any.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "code": {"type": "string"},
                                "value": {"type": "string"},
                            },
                            "required": ["code", "value"],
                        },
                    },
                },
                "required": ["variant_ref"],
            },
        ),
        _add_service_to_booking,
    ),
    Tool(
        ToolSpec(
            "view_booking",
            "What is currently in the customer's booking (cart). Requires login.",
            {"type": "object", "properties": {}},
        ),
        _view_booking,
    ),
    Tool(
        ToolSpec(
            "remove_from_booking",
            "Remove one item from the customer's booking. Requires login.",
            {"type": "object", "properties": {"item_ref": _REF}, "required": ["item_ref"]},
        ),
        _remove_from_booking,
    ),
    Tool(
        ToolSpec(
            "find_slots",
            "Available arrival windows for everything in the booking at one address. Optional "
            "filters: a date and a part of day. Requires login.",
            {
                "type": "object",
                "properties": {
                    "address_ref": _REF,
                    "date": {"type": "string", "description": "YYYY-MM-DD, in India time."},
                    "part_of_day": {
                        "type": "string",
                        "enum": ["morning", "afternoon", "evening", "any"],
                    },
                },
                "required": ["address_ref"],
            },
        ),
        _find_slots,
    ),
    Tool(
        ToolSpec(
            "prepare_booking",
            "Get the exact total for the booking at the chosen address and slot(s). Does not book "
            "anything. Pass one slot_ref per visit.",
            {
                "type": "object",
                "properties": {
                    "address_ref": _REF,
                    "slot_refs": {"type": "array", "items": _REF},
                },
                "required": ["address_ref", "slot_refs"],
            },
        ),
        _prepare_booking,
    ),
    Tool(
        ToolSpec(
            "confirm_booking",
            "Book it, after the customer has seen the total from prepare_booking and said yes in "
            "a later message. Starts assigning a professional. Payment comes after.",
            {"type": "object", "properties": {"quote_ref": _REF}, "required": ["quote_ref"]},
        ),
        _confirm_booking,
    ),
    Tool(
        ToolSpec(
            "booking_status",
            "The live status of the booking made in this chat: finding a professional, waiting "
            "for payment, confirmed, or not booked.",
            {"type": "object", "properties": {}},
        ),
        _booking_status,
    ),
)

TOOLS_BY_NAME = {tool.spec.name: tool for tool in TOOLS}
TOOL_SPECS = tuple(tool.spec for tool in TOOLS)


def _api_error_content(exc: APIException) -> JsonObject:
    code = str(getattr(exc, "error_code", "") or exc.default_code)
    message = str(getattr(exc, "safe_message", "") or exc.detail)
    return {"ok": False, "error": code, "message": message[:MAX_ERROR_MESSAGE]}


def execute_tool(call: ToolCall, ctx: ToolContext) -> ToolResult:
    """Run one tool call. Every failure becomes a result the model can explain, never a 500."""

    tool = TOOLS_BY_NAME.get(call.name)
    content: JsonObject
    if tool is None:
        content = {"ok": False, "error": "unknown_tool", "message": f"No tool named {call.name}."}
    elif call.arguments.get("__invalid_arguments__"):
        content = {"ok": False, "error": "invalid_arguments", "message": "Arguments were not JSON."}
    else:
        try:
            with transaction.atomic():
                content = tool.handler(ctx, call.arguments)
            content = {"ok": True, **content}
        except ToolError as exc:
            content = {"ok": False, "error": exc.code, "message": exc.message}
            if exc.actions:
                ctx.actions = exc.actions
        except APIException as exc:
            content = _api_error_content(exc)
        except (ValueError, PermissionError) as exc:
            # Domain commands in `carts` raise these with sentences written for Customers.
            content = {
                "ok": False,
                "error": "not_possible",
                "message": str(exc)[:MAX_ERROR_MESSAGE],
            }
        except Exception:
            logger.exception("assistant.tool_failed", extra={"tool": call.name})
            content = {
                "ok": False,
                "error": "internal_error",
                "message": "This step failed on our side. Apologise and offer the website instead.",
            }
    ctx.session.save(update_fields=("state",))
    return ToolResult(call_id=call.id, name=call.name, content=content)
