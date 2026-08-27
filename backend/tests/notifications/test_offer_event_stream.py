"""BE-6: the partner offer event stream.

The endpoint's whole promise is "you learn about an offer without asking again", so
these tests read actual frames off an actual `StreamingHttpResponse` rather than
asserting about the queryset behind it. The frame text *is* the contract FE-3 parses.

Poll interval and connection lifetime are settings so a test can run the real
generator to completion in milliseconds instead of five minutes.
"""

import json
from http import HTTPStatus

import pytest
from django.core.management import call_command
from django.test import override_settings
from freezegun import freeze_time
from rest_framework.test import APIClient

from apps.notifications.models import NotificationIntent
from apps.notifications.streaming import (
    NOTIFICATION_CREATED_EVENT,
    OFFER_CREATED_PURPOSE,
    offer_event_frames,
)
from apps.notifications.services import request_notification
from tests.assignments.same_day_offers import FROZEN_NOW, online_partner, same_day_offer
from tests.assignments.test_group_dispatch import _partner_client

pytestmark = pytest.mark.django_db(transaction=True)

CUSTOMER = "+919876543210"
STREAM_URL = "/api/v1/partner/offers/stream/"

# One poll, then the lifetime is spent. Enough to prove the loop reads and emits.
FAST_STREAM = override_settings(
    M1_OFFER_STREAM_POLL_SECONDS=0.01,
    M1_OFFER_STREAM_MAX_SECONDS=0.05,
    M1_OFFER_STREAM_REPLAY_SECONDS=600,
)


def _read(response) -> str:  # type: ignore[no-untyped-def]
    return b"".join(response.streaming_content).decode()


def _events(body: str) -> list[dict[str, object]]:
    """Every `offer_created` payload in the stream, in order."""

    payloads: list[dict[str, object]] = []
    for block in body.split("\n\n"):
        lines = block.splitlines()
        if not any(line == "event: offer_created" for line in lines):
            continue
        data = next(line for line in lines if line.startswith("data: "))
        payloads.append(json.loads(data.removeprefix("data: ")))
    return payloads


def _events_named(body: str, event_name: str) -> list[dict[str, object]]:
    payloads: list[dict[str, object]] = []
    for block in body.split("\n\n"):
        lines = block.splitlines()
        if not any(line == f"event: {event_name}" for line in lines):
            continue
        data = next(line for line in lines if line.startswith("data: "))
        payloads.append(json.loads(data.removeprefix("data: ")))
    return payloads


@FAST_STREAM
@freeze_time(FROZEN_NOW)
def test_stream_emits_the_offer_created_event_for_a_new_offer() -> None:
    call_command("seed_technician_catalog")
    partner = online_partner(suffix="81", variant_slugs=("switch-socket-repair",))
    offer = same_day_offer(phone=CUSTOMER, key="stream-emits")
    client = _partner_client(partner)

    response = client.get(STREAM_URL)

    assert response.status_code == HTTPStatus.OK
    assert response["Content-Type"] == "text/event-stream"
    body = _read(response)
    assert _events(body) == [
        {
            "offer_id": str(offer.id),
            "fulfilment_unit_id": str(offer.fulfilment_unit_id),
            "requested_start": offer.fulfilment_unit.requested_start.isoformat(),
            "expires_at": offer.expires_at.isoformat(),
        }
    ]


@FAST_STREAM
@freeze_time(FROZEN_NOW)
def test_a_partner_never_receives_another_partners_offer() -> None:
    """The isolation that makes this endpoint safe to expose at all."""

    call_command("seed_technician_catalog")
    offered = online_partner(suffix="82", variant_slugs=("switch-socket-repair",))
    bystander = online_partner(suffix="83", variant_slugs=("tap-repair",))
    offer = same_day_offer(phone=CUSTOMER, key="stream-isolation")
    assert offer.partner == offered

    body = _read(_partner_client(bystander).get(STREAM_URL))

    assert _events(body) == []
    # It was a live connection that simply had nothing for them, not a dead one.
    assert ": keepalive" in body


@FAST_STREAM
@freeze_time(FROZEN_NOW)
def test_an_idle_stream_sends_keepalives_so_proxies_do_not_cut_it() -> None:
    call_command("seed_technician_catalog")
    partner = online_partner(suffix="84", variant_slugs=("switch-socket-repair",))
    client = _partner_client(partner)

    body = _read(client.get(STREAM_URL))

    assert body.startswith(": connected\n\n")
    assert ": keepalive" in body
    assert "event:" not in body


@FAST_STREAM
@freeze_time(FROZEN_NOW)
def test_a_suppressed_intent_is_not_streamed() -> None:
    """A suppressed intent is a recorded decision not to notify — usually a kill
    switch. Streaming it would route around the switch."""

    call_command("seed_technician_catalog")
    partner = online_partner(suffix="85", variant_slugs=("switch-socket-repair",))
    offer = same_day_offer(phone=CUSTOMER, key="stream-suppressed")
    NotificationIntent.objects.filter(purpose=OFFER_CREATED_PURPOSE).update(
        status=NotificationIntent.Status.SUPPRESSED,
        suppressed_reason="kill_switch_engaged",
    )
    client = _partner_client(partner)

    body = _read(client.get(STREAM_URL))

    assert _events(body) == []
    assert str(offer.id) not in body


@FAST_STREAM
@freeze_time(FROZEN_NOW)
def test_the_stream_requires_a_partner_session() -> None:
    call_command("seed_technician_catalog")

    response = APIClient().get(STREAM_URL)

    assert response.status_code in (HTTPStatus.UNAUTHORIZED, HTTPStatus.FORBIDDEN)


@FAST_STREAM
@freeze_time(FROZEN_NOW)
def test_the_stream_accepts_text_event_stream_in_accept() -> None:
    """`EventSource` sends `Accept: text/event-stream`; that must not 406."""

    call_command("seed_technician_catalog")

    response = APIClient().get(STREAM_URL, HTTP_ACCEPT="text/event-stream")

    assert response.status_code in (HTTPStatus.UNAUTHORIZED, HTTPStatus.FORBIDDEN)
    assert response.status_code != HTTPStatus.NOT_ACCEPTABLE


@FAST_STREAM
@freeze_time(FROZEN_NOW)
def test_stream_emits_notification_created_for_partner_in_app_booking_notice() -> None:
    call_command("seed_technician_catalog")
    partner = online_partner(suffix="86", variant_slugs=("switch-socket-repair",))
    request_notification(
        recipient_id=partner.user_id,
        purpose="m2.invitation.received",
        channel=NotificationIntent.Channel.IN_APP,
        template_code="m2_invitation_received",
        context={
            "target_kind": "WORKFORCE_INVITATION",
            "target_id": "11111111-1111-1111-1111-111111111111",
        },
        idempotency_key="stream-invitation:86",
    )
    client = _partner_client(partner)

    body = _read(client.get(STREAM_URL))

    assert _events_named(body, NOTIFICATION_CREATED_EVENT) == [
        {
            "notification_id": str(
                NotificationIntent.objects.get(purpose="m2.invitation.received").id
            ),
            "purpose": "m2.invitation.received",
            "title": "New customer enquiry",
            "body": (
                "A customer has sent a new enquiry. Open it now to accept or quote before the "
                "slot moves on."
            ),
            "target_kind": "WORKFORCE_INVITATION",
            "target_id": "11111111-1111-1111-1111-111111111111",
        }
    ]
