"""A real same-day `PartnerOffer`, built through the real dispatch path.

The existing offer fixtures in `tests.assignments.test_partner_offer_commands` plan
against `_preferred_start()` — tomorrow at 10:00 — which is an *advance* unit. Advance
units go through `directly_assign` and produce a `Reservation` with no offer at all,
so those fixtures cannot be reused by anything that needs an offer to exist.

Producing one means satisfying every gate the same-day path actually has, which is
why this is a module rather than three lines in a test:

* `is_same_day_unit` — the start must be inside `M1_TODAY_LEAD_TIME_MINUTES` of now;
* `earliest_reachable` — and outside the commit window plus default travel;
* `require_online` — a same-day candidate must hold an open `PartnerOnlineSession`;
* the service area's and the Partner's published hours must both cover the start.

Those constraints have no simultaneous solution at an arbitrary wall clock — the
window is roughly 45 to 120 minutes wide and has to land inside business hours — so
the clock is frozen at a fixed weekday morning. Freezing is what makes this
deterministic rather than green-in-the-morning and red-at-night.
"""

from datetime import UTC, datetime, time
from http import HTTPStatus
from zoneinfo import ZoneInfo

from rest_framework.test import APIClient

from apps.assignments.models import PartnerOffer
from apps.carts.models import BookingGroup
from apps.catalog.models import ServiceVariant
from apps.identity.models import User
from apps.locations.models import ServiceArea
from apps.partners.models import (
    PartnerApplication,
    PartnerAvailabilityRule,
    PartnerOnlineSession,
    PartnerProfile,
    PartnerService,
    PartnerServiceArea,
)
from tests.assignments.test_group_dispatch import _checkout, _quote
from tests.carts.test_fulfilment_planning import _add_item, _address_payload, _plan

#: Monday 2026-08-10, 10:00 in Asia/Kolkata. A weekday inside every seeded rota.
FROZEN_NOW = datetime(2026, 8, 10, 4, 30, tzinfo=UTC)
#: 11:30 IST — 90 minutes out. Inside the 120-minute same-day horizon, and past the
#: 45-minute commit-plus-travel floor `earliest_reachable` imposes.
SAME_DAY_START = datetime(2026, 8, 10, 6, 0, tzinfo=UTC)


def online_partner(*, suffix: str, variant_slugs: tuple[str, ...]) -> PartnerProfile:
    """An approved, online Partner whose rota covers `SAME_DAY_START`."""

    area = ServiceArea.objects.get(slug="hyderabad-500032")
    user = User.objects.create_user(phone_number=f"+91987654{int(suffix):04d}")
    partner = PartnerProfile.objects.create(user=user, display_name=f"Partner {suffix}")
    PartnerApplication.objects.create(partner=partner, status=PartnerApplication.Status.APPROVED)
    for variant in ServiceVariant.objects.filter(service__slug__in=variant_slugs):
        PartnerService.objects.create(partner=partner, variant=variant)
    PartnerServiceArea.objects.create(partner=partner, service_area=area)
    PartnerAvailabilityRule.objects.create(
        partner=partner,
        service_area=area,
        # The rota is published in the area's local weekday, not UTC's.
        weekday=SAME_DAY_START.astimezone(ZoneInfo(area.timezone)).weekday(),
        starts_at=time(8),
        ends_at=time(20),
    )
    PartnerOnlineSession.objects.create(partner=partner, service_area=area, ended_at=None)
    return partner


def same_day_offer(
    *,
    phone: str,
    key: str,
    slug: str = "switch-socket-repair",
) -> PartnerOffer:
    """One Customer from empty cart to a live same-day offer. Call under a frozen clock."""

    customer = User.objects.create_user(phone_number=phone)
    client = APIClient()
    client.force_authenticate(customer)
    cart_version = client.get("/api/v1/cart/").json()["version"]
    address = client.post("/api/v1/addresses/", _address_payload(), format="json")
    assert address.status_code == HTTPStatus.CREATED
    item = _add_item(client, slug=slug, cart_version=cart_version)
    plans = _plan(
        client,
        address_id=address.json()["id"],
        cart_version=int(item["version"]),
        starts_at=SAME_DAY_START,
    )
    quote = _quote(client, plans["plans"][0]["id"], key=f"{key}-quote")
    checkout = _checkout(client, quote["id"], key=f"{key}-checkout")
    group = BookingGroup.objects.get(id=checkout["booking_group"]["id"])
    return PartnerOffer.objects.select_related("partner", "fulfilment_unit").get(
        fulfilment_unit__booking_group=group
    )
