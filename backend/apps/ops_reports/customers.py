"""Operations customer directory and record.

A customer calls, Operations finds them by phone or name, and sees everything about them on one
page: every booking across home services, rentals, stays and crew or project requests, their
wallet and coins, open cases, and whether the account is blocked. The record reads other apps
and writes nothing; blocking is `apps.identity.services.set_account_blocked`.
"""

import uuid
from dataclasses import dataclass
from datetime import date, datetime, time
from typing import Any, Final

from django.db.models import Exists, OuterRef, Q, QuerySet
from django.utils import timezone

from apps.carts.models import Quote, QuoteLine
from apps.cases.models import TERMINAL_CASE_STATUSES, OperationsCase
from apps.commerce.models import Booking
from apps.identity.models import AccessAuditEvent, User, UserRole
from apps.identity.services import ACCOUNT_BLOCKED_ACTION, ACCOUNT_UNBLOCKED_ACTION
from apps.loyalty.services.coins import get_customer_coin_balances
from apps.partners.models import PartnerProfile
from apps.payouts.services import partner_balance_paise
from apps.rental.models import RentalBooking
from apps.requirements.models import CustomerRequirement
from apps.stay.models import StayReservation
from apps.wallet.models import WalletAccount

#: Fewer digits than this is too short to be a number anyone is looking for.
MIN_PHONE_SEARCH_DIGITS: Final = 4
#: An Indian mobile number without its country code.
MOBILE_DIGITS: Final = 10
#: How many of the most recent bookings the record shows, across every kind.
RECENT_BOOKINGS: Final = 25


def _is_customer() -> Exists:
    return Exists(
        UserRole.objects.filter(user=OuterRef("pk"), role__code="customer", revoked_at__isnull=True)
    )


def customer_search(query: str) -> Q:
    """A name, or a mobile number however it was typed (same rule as the partner directory)."""
    match = Q(full_name__icontains=query)
    digits = "".join(character for character in query if character.isdigit())
    if len(digits) >= MIN_PHONE_SEARCH_DIGITS:
        match |= Q(phone_number__contains=digits[-MOBILE_DIGITS:])
    return match


def operations_customer_directory(query: str = "") -> QuerySet[User]:
    """Everyone with a customer role, newest first, optionally narrowed by name or phone."""
    rows = User.objects.filter(_is_customer()).annotate(
        is_partner=Exists(PartnerProfile.objects.filter(user=OuterRef("pk")))
    )
    query = query.strip()
    if query:
        rows = rows.filter(customer_search(query))
    return rows


def operations_customer(customer_id: uuid.UUID) -> User | None:
    return User.objects.filter(_is_customer(), id=customer_id).first()


@dataclass(frozen=True)
class CustomerBooking:
    kind: str
    id: uuid.UUID
    title: str
    status: str
    status_label: str
    when: datetime
    total_paise: int | None


def _at(value: date) -> datetime:
    return timezone.make_aware(datetime.combine(value, time.min))


def _home_visits(customer: User) -> list[CustomerBooking]:
    rows = (
        Booking.objects.filter(customer=customer)
        .select_related("fulfilment_unit")
        .prefetch_related("fulfilment_unit__lines")
        .order_by("-scheduled_start")[:RECENT_BOOKINGS]
    )
    visits = []
    for booking in rows:
        unit = booking.fulfilment_unit
        labels = (
            [line.label for line in unit.lines.all() if line.kind == QuoteLine.Kind.SERVICE]
            if unit is not None
            else []
        )
        visits.append(
            CustomerBooking(
                kind="HOME_VISIT",
                id=booking.id,
                title=", ".join(labels) or "Home-service visit",
                status=booking.status,
                status_label=booking.get_status_display(),
                when=booking.scheduled_start,
                total_paise=unit.total_paise if unit is not None else None,
            )
        )
    return visits


def _rentals(customer: User) -> list[CustomerBooking]:
    rows = (
        RentalBooking.objects.filter(customer=customer)
        .select_related("asset")
        .order_by("-start_date")[:RECENT_BOOKINGS]
    )
    return [
        CustomerBooking(
            kind="RENTAL",
            id=booking.id,
            title=booking.asset.title,
            status=booking.status,
            status_label=booking.get_status_display(),
            when=_at(booking.start_date),
            total_paise=None,
        )
        for booking in rows
    ]


def _stays(customer: User) -> list[CustomerBooking]:
    rows = (
        StayReservation.objects.filter(customer=customer)
        .select_related("property")
        .order_by("-check_in")[:RECENT_BOOKINGS]
    )
    return [
        CustomerBooking(
            kind="STAY",
            id=reservation.id,
            title=reservation.property.title,
            status=reservation.status,
            status_label=reservation.get_status_display(),
            when=_at(reservation.check_in),
            total_paise=reservation.total_paise,
        )
        for reservation in rows
    ]


def _requests(customer: User) -> list[CustomerBooking]:
    rows = (
        CustomerRequirement.objects.filter(customer=customer)
        .exclude(status=CustomerRequirement.Status.DRAFT)
        .select_related("variant__service")
        .order_by("-created_at")[:RECENT_BOOKINGS]
    )
    return [
        CustomerBooking(
            kind="REQUEST",
            id=requirement.id,
            title=requirement.variant.service.name,
            status=requirement.status,
            status_label=requirement.get_status_display(),
            when=requirement.created_at,
            total_paise=None,
        )
        for requirement in rows
    ]


def customer_bookings(customer: User) -> list[CustomerBooking]:
    """The most recent bookings of every kind, newest first."""
    everything = (
        _home_visits(customer) + _rentals(customer) + _stays(customer) + _requests(customer)
    )
    everything.sort(key=lambda booking: booking.when, reverse=True)
    return everything[:RECENT_BOOKINGS]


def customer_open_cases(customer: User) -> QuerySet[OperationsCase]:
    return (
        OperationsCase.objects.filter(
            Q(booking__customer=customer)
            | Q(order__customer=customer)
            | Q(requirement__customer=customer)
        )
        .exclude(status__in=tuple(TERMINAL_CASE_STATUSES))
        .order_by("-created_at")
        .distinct()
    )


@dataclass(frozen=True)
class CustomerQuote:
    id: uuid.UUID
    title: str
    total_paise: int
    created_at: datetime
    expires_at: datetime


def customer_open_quotes(customer: User) -> list[CustomerQuote]:
    """Quotes the customer built and has not paid for, so Operations can check out for them."""
    rows = (
        Quote.objects.filter(
            Q(cart_item__cart__customer=customer)
            | Q(fulfilment_plan__plan_set__cart__customer=customer),
            status=Quote.Status.ACTIVE,
            expires_at__gt=timezone.now(),
        )
        .prefetch_related("units__lines")
        .order_by("-created_at")
        .distinct()[:10]
    )
    quotes = []
    for quote in rows:
        labels = [
            line.label
            for unit in quote.units.all()
            for line in unit.lines.all()
            if line.kind == QuoteLine.Kind.SERVICE
        ]
        quotes.append(
            CustomerQuote(
                id=quote.id,
                title=", ".join(labels) or "Home-service quote",
                total_paise=quote.total_paise,
                created_at=quote.created_at,
                expires_at=quote.expires_at,
            )
        )
    return quotes


def _last_block_event(customer: User) -> AccessAuditEvent | None:
    return (
        AccessAuditEvent.objects.filter(
            subject_user=customer, action__in=(ACCOUNT_BLOCKED_ACTION, ACCOUNT_UNBLOCKED_ACTION)
        )
        .select_related("actor")
        .order_by("-created_at")
        .first()
    )


def customer_record(customer: User) -> dict[str, Any]:
    """Everything the record screen shows, read once."""
    wallet = WalletAccount.objects.filter(customer=customer).first()
    coins = get_customer_coin_balances(customer)
    partner = PartnerProfile.objects.filter(user=customer).only("id").first()
    block = None
    if not customer.is_active:
        event = _last_block_event(customer)
        if event is not None and event.action == ACCOUNT_BLOCKED_ACTION:
            block = {
                "reason": str(event.metadata.get("reason", "")),
                "at": event.created_at,
                "by": event.actor.full_name if event.actor else "",
            }
    return {
        "id": customer.id,
        "full_name": customer.full_name,
        "phone_number": customer.phone_number,
        "email": customer.email,
        "date_joined": customer.date_joined,
        "is_blocked": not customer.is_active,
        "block": block,
        "partner_id": partner.id if partner else None,
        # No wallet yet means nothing was ever credited: zero is the true balance, not a guess.
        "wallet_balance_paise": wallet.balance_paise if wallet else 0,
        "coins_spendable": int(coins["spendable_coins"]),
        "bookings": customer_bookings(customer),
        "open_quotes": customer_open_quotes(customer),
        "open_cases": list(customer_open_cases(customer)[:20]),
    }


# --- The same booking list, from the partner's side ------------------------------------------


def partner_bookings(partner: PartnerProfile) -> list[CustomerBooking]:
    """A partner's most recent work of every kind, newest first: visits they were sent on,
    their rental items booked, their properties' stays, and crew or project engagements."""
    visits = (
        Booking.objects.filter(partner=partner)
        .select_related("fulfilment_unit")
        .prefetch_related("fulfilment_unit__lines")
        .order_by("-scheduled_start")[:RECENT_BOOKINGS]
    )
    rows: list[CustomerBooking] = []
    for booking in visits:
        unit = booking.fulfilment_unit
        labels = (
            [line.label for line in unit.lines.all() if line.kind == QuoteLine.Kind.SERVICE]
            if unit is not None
            else []
        )
        rows.append(
            CustomerBooking(
                kind="HOME_VISIT",
                id=booking.id,
                title=", ".join(labels) or "Home-service visit",
                status=booking.status,
                status_label=booking.get_status_display(),
                when=booking.scheduled_start,
                total_paise=unit.total_paise if unit is not None else None,
            )
        )
    rows += [
        CustomerBooking(
            kind="RENTAL",
            id=rental.id,
            title=rental.asset.title,
            status=rental.status,
            status_label=rental.get_status_display(),
            when=_at(rental.start_date),
            total_paise=None,
        )
        for rental in RentalBooking.objects.filter(asset__partner=partner)
        .select_related("asset")
        .order_by("-start_date")[:RECENT_BOOKINGS]
    ]
    rows += [
        CustomerBooking(
            kind="STAY",
            id=stay.id,
            title=stay.property.title,
            status=stay.status,
            status_label=stay.get_status_display(),
            when=_at(stay.check_in),
            total_paise=stay.total_paise,
        )
        for stay in StayReservation.objects.filter(property__host=partner)
        .select_related("property")
        .order_by("-check_in")[:RECENT_BOOKINGS]
    ]
    rows += [
        CustomerBooking(
            kind="REQUEST",
            id=requirement.id,
            title=requirement.variant.service.name,
            status=requirement.status,
            status_label=requirement.get_status_display(),
            when=requirement.created_at,
            total_paise=None,
        )
        for requirement in CustomerRequirement.objects.filter(engagement__partner=partner)
        .select_related("variant__service")
        .order_by("-created_at")[:RECENT_BOOKINGS]
    ]
    rows.sort(key=lambda booking: booking.when, reverse=True)
    return rows[:RECENT_BOOKINGS]


def partner_activity(partner: PartnerProfile) -> dict[str, Any]:
    """What the partner record shows beyond the application: their work and their money."""
    return {
        "balance": partner_balance_paise(partner),
        "bookings": partner_bookings(partner),
    }
