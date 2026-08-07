"""BE-5: every ordinary offer tells the Partner it exists.

`directly_assign` has always requested a `partner.job_assigned` notification for
advance bookings. The same-day offer path — the one with a 45-second clock, where
being told late is the difference between taking the job and losing it — requested
nothing at all.

The `context` shape asserted here is a published contract:
`contracts/proposals/partner-offer-events.md`. BE-6's SSE stream serialises it and
FE-3 reads it, and neither of those can see this code. Changing a key here without
changing that document breaks them silently, which is what these assertions exist to
prevent.
"""

from http import HTTPStatus

import pytest
from django.core.management import call_command
from freezegun import freeze_time

from apps.assignments.group_services import decline_or_undo_unit_offer
from apps.assignments.models import PartnerOffer
from apps.notifications.models import NotificationIntent
from apps.notifications.services import TRANSACTIONAL_PURPOSES
from tests.assignments.same_day_offers import FROZEN_NOW, online_partner, same_day_offer
from tests.assignments.test_group_dispatch import _partner_client

pytestmark = pytest.mark.django_db(transaction=True)

CUSTOMER = "+919876543210"
PURPOSE = "partner.offer_created"


def _intents(offer: PartnerOffer) -> list[NotificationIntent]:
    return list(
        NotificationIntent.objects.filter(
            purpose=PURPOSE,
            idempotency_key=f"offer-created:{offer.id}",
        )
    )


@freeze_time(FROZEN_NOW)
def test_creating_an_offer_notifies_the_offered_partner() -> None:
    call_command("seed_technician_catalog")
    partner = online_partner(suffix="71", variant_slugs=("switch-socket-repair",))

    offer = same_day_offer(phone=CUSTOMER, key="notify-created")

    unit = offer.fulfilment_unit
    assert unit is not None
    intents = _intents(offer)
    assert len(intents) == 1
    intent = intents[0]
    assert intent.recipient_id == partner.user_id
    assert intent.channel == NotificationIntent.Channel.PUSH
    assert intent.template_code == "partner_offer_created"
    assert intent.status == NotificationIntent.Status.PENDING
    # The published contract, key for key. See partner-offer-events.md.
    assert intent.context == {
        "offer_id": str(offer.id),
        "fulfilment_unit_id": str(unit.id),
        "requested_start": unit.requested_start.isoformat(),
        "expires_at": offer.expires_at.isoformat(),
    }


@freeze_time(FROZEN_NOW)
def test_the_notification_carries_no_money() -> None:
    """Earnings reach the Partner through the offer projection, which is server-priced.

    An event is a signal to go read the authoritative row, never a second source of
    truth for a rupee amount.
    """

    call_command("seed_technician_catalog")
    online_partner(suffix="72", variant_slugs=("switch-socket-repair",))

    offer = same_day_offer(phone=CUSTOMER, key="notify-no-money")

    context = _intents(offer)[0].context
    assert set(context) == {"offer_id", "fulfilment_unit_id", "requested_start", "expires_at"}


@freeze_time(FROZEN_NOW)
def test_the_purpose_cannot_be_muted() -> None:
    """A Partner who is online must not be able to silence the arrival of work."""

    assert PURPOSE in TRANSACTIONAL_PURPOSES


@freeze_time(FROZEN_NOW)
def test_a_redispatched_unit_notifies_again_under_a_new_key() -> None:
    """Keyed on the offer, not the unit.

    A declined unit is redispatched to the next candidate, and that candidate has
    been told nothing yet. Keying on the unit would have suppressed their only
    notification as a duplicate of somebody else's.
    """

    call_command("seed_technician_catalog")
    first_partner = online_partner(suffix="73", variant_slugs=("switch-socket-repair",))
    second_partner = online_partner(suffix="74", variant_slugs=("switch-socket-repair",))
    offer = same_day_offer(phone=CUSTOMER, key="notify-redispatch")
    offered_to = offer.partner
    other = second_partner if offered_to == first_partner else first_partner

    successor = decline_or_undo_unit_offer(offer_id=offer.id, partner=offered_to, undo=False)

    assert successor is not None
    assert successor.partner == other
    assert len(_intents(offer)) == 1
    assert len(_intents(successor)) == 1
    assert _intents(successor)[0].recipient_id == other.user_id


@freeze_time(FROZEN_NOW)
def test_the_notification_is_idempotent_per_offer() -> None:
    """The list endpoint is a convenient way to prove no second row appeared."""

    call_command("seed_technician_catalog")
    partner = online_partner(suffix="75", variant_slugs=("switch-socket-repair",))
    offer = same_day_offer(phone=CUSTOMER, key="notify-idempotent")
    client = _partner_client(partner)

    inbox = client.get("/api/v1/partner/offers/")

    assert inbox.status_code == HTTPStatus.OK
    assert [row["id"] for row in inbox.json()["results"]] == [str(offer.id)]
    assert (
        NotificationIntent.objects.filter(
            purpose=PURPOSE,
            recipient_id=partner.user_id,
        ).count()
        == 1
    )
