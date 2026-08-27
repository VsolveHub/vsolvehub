"""Server-Sent Events for partner offer notifications.

A same-day offer lives for `M1_PARTNER_OFFER_TIMEOUT_SECONDS` — 45 seconds. A
partner app that learns about it on its next list poll can burn a third of that
window before the partner has seen the card. This endpoint holds one connection
open and pushes as soon as the offer exists.

## Why polling behind a stream, rather than a real push

There is no Channels/ASGI/WebSocket infrastructure in this codebase — `config/asgi.py`
exists but nothing serves it, and neither `channels` nor `daphne` is a dependency.
Adding one for a single endpoint is a runtime dependency, a deployment topology and
an operational surface, for a feature whose whole benefit is measured in seconds.

A `StreamingHttpResponse` whose generator polls the database server-side is
genuinely push-like from the browser's side — one connection, the server decides
when to send — and needs none of that. The polling did not disappear; it moved off
the phone and onto the server, where it costs one query every two seconds per
connection instead of a full authenticated list request per client tick.

## The cost, stated plainly

**Each open stream occupies one WSGI worker thread for up to
`M1_OFFER_STREAM_MAX_SECONDS`.** With a synchronous worker pool, N partners with the
app open means N threads unavailable for ordinary requests. That is the ceiling on
this design, and it is why the connection is capped rather than held indefinitely.
Past roughly a worker pool's worth of concurrently-online partners this needs to
become a real ASGI/push transport — which is an infrastructure decision, not
something to paper over by raising the cap.

The database connection is released between polls (`close_old_connections`) so a
stream does not also pin a connection for its whole life.

## Not OS-level push

This delivers to an app that is open. It cannot wake a closed or backgrounded app —
that needs a service worker, a browser push-permission flow, VAPID/FCM registration
and device-token storage. Deliberately out of scope.
"""

import json
import math
import time
from collections.abc import Iterator
from datetime import datetime, timedelta
from typing import Any, cast
from uuid import UUID

from django.conf import settings
from django.db import close_old_connections
from django.db.models import Q
from django.http import StreamingHttpResponse
from django.utils import timezone
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework.permissions import IsAuthenticated
from rest_framework.renderers import BaseRenderer, JSONRenderer
from rest_framework.request import Request
from rest_framework.views import APIView

from apps.identity.models import User
from apps.notifications.models import NotificationIntent
from apps.notifications.templates_registry import render_notification
from apps.partners.permissions import IsPartnerUser

#: The one purpose this stream carries. Written by
#: `assignments.group_services._create_offer`; see
#: `contracts/proposals/partner-offer-events.md`.
OFFER_CREATED_PURPOSE = "partner.offer_created"
OFFER_CREATED_EVENT = "offer_created"

#: Advance bookings assigned directly — same transport, different event.
JOB_ASSIGNED_PURPOSE = "partner.job_assigned"
JOB_ASSIGNED_EVENT = "job_assigned"

#: In-app notices that should foreground-pop when a customer books or enquires.
NOTIFICATION_CREATED_EVENT = "notification_created"
PARTNER_IN_APP_STREAM_PURPOSES = frozenset(
    {
        "m2.invitation.received",
        "m2.booking_fee.charged",
        "m2.engagement.opened",
    }
)


def _frame(*, event: str, data: dict[str, object]) -> str:
    """One SSE event. `data` is a single line of JSON, as the contract states."""

    return f"event: {event}\ndata: {json.dumps(data, separators=(',', ':'))}\n\n"


def _comment(text: str) -> str:
    """A keepalive. Carries no event; `EventSource` ignores it.

    Without these an idle connection looks dead to intermediate proxies, which cut
    it — and the partner then has neither a stream nor any signal that they lost it.
    """

    return f": {text}\n\n"


def _stream_filter(*, recipient_id: UUID, since: datetime) -> Q:
    """Intents this connection may carry for one partner."""

    return Q(recipient_id=recipient_id, created_at__gt=since) & (
        Q(
            purpose=OFFER_CREATED_PURPOSE,
            channel=NotificationIntent.Channel.PUSH,
        )
        | Q(
            purpose=JOB_ASSIGNED_PURPOSE,
            channel=NotificationIntent.Channel.PUSH,
        )
        | Q(
            purpose__in=PARTNER_IN_APP_STREAM_PURPOSES,
            channel=NotificationIntent.Channel.IN_APP,
            status=NotificationIntent.Status.SENT,
        )
    )


def _payload_for_intent(intent: NotificationIntent) -> tuple[str, dict[str, object]] | None:
    if intent.purpose == OFFER_CREATED_PURPOSE:
        return OFFER_CREATED_EVENT, cast(dict[str, object], intent.context)
    if intent.purpose == JOB_ASSIGNED_PURPOSE:
        return JOB_ASSIGNED_EVENT, cast(dict[str, object], intent.context)
    if (
        intent.channel == NotificationIntent.Channel.IN_APP
        and intent.purpose in PARTNER_IN_APP_STREAM_PURPOSES
    ):
        rendered = render_notification(
            template_code=intent.template_code,
            context=cast(dict[str, Any], intent.context),
        )
        payload: dict[str, object] = {
            "notification_id": str(intent.id),
            "purpose": intent.purpose,
            "title": rendered.title,
            "body": rendered.body,
        }
        context = cast(dict[str, Any], intent.context)
        target_kind = context.get("target_kind")
        target_id = context.get("target_id")
        if isinstance(target_kind, str) and isinstance(target_id, str):
            payload["target_kind"] = target_kind
            payload["target_id"] = target_id
        return NOTIFICATION_CREATED_EVENT, payload
    return None


def offer_event_frames(
    *,
    recipient_id: UUID,
    since: datetime,
    poll_seconds: float,
    max_seconds: float,
) -> Iterator[str]:
    """Yield SSE frames for one partner until the connection's lifetime is spent.

    One query per poll, filtered on `(recipient, purpose, channel, created_at)`.
    `SUPPRESSED` intents are excluded: a suppressed intent is a recorded decision
    *not* to notify — usually an engaged kill switch — and streaming it anyway would
    route around the switch.

    Scoped to `recipient_id` in the query itself, so there is no path by which one
    partner's connection can carry another partner's offer.
    """

    last_seen = since
    # Bounded by a poll *count*, derived once, rather than by re-reading the clock
    # each pass. A clock-only bound has no exit if the clock does not advance — an
    # NTP step backwards, or a frozen clock under test — and this loop holds a
    # worker thread, so "usually terminates" is not good enough. It also makes the
    # cost of one connection exactly stateable: at most `polls` queries.
    polls = max(1, math.ceil(max_seconds / poll_seconds)) if poll_seconds > 0 else 1
    # Sent before the first sleep so the client sees headers and an open stream
    # immediately rather than after a poll interval of silence.
    yield _comment("connected")
    for _poll in range(polls):
        # The generator runs after the response is returned, outside the request
        # cycle that would otherwise do this — so a stream does not hold one
        # database connection for its entire life.
        close_old_connections()
        rows = list(
            NotificationIntent.objects.filter(_stream_filter(recipient_id=recipient_id, since=last_seen))
            .exclude(status=NotificationIntent.Status.SUPPRESSED)
            .order_by("created_at", "id")
        )
        for intent in rows:
            last_seen = intent.created_at
            framed = _payload_for_intent(intent)
            if framed is None:
                continue
            event, data = framed
            yield _frame(event=event, data=data)
        if not rows:
            yield _comment("keepalive")
        time.sleep(poll_seconds)


class EventStreamRenderer(BaseRenderer):
    """Accept `Accept: text/event-stream` from browser `EventSource`.

    DRF negotiates renderers before the view runs. Without one whose
    `media_type` matches, `EventSource`'s Accept header gets a `406` even
    though the view returns a `StreamingHttpResponse` directly.
    """

    media_type = "text/event-stream"
    format = "event-stream"
    charset = None

    def render(
        self,
        data: object,
        accepted_media_type: str | None = None,
        renderer_context: dict[str, object] | None = None,
    ) -> bytes:
        if data is None:
            return b""
        if isinstance(data, bytes):
            return data
        if isinstance(data, str):
            return data.encode("utf-8")
        return JSONRenderer().render(data, accepted_media_type, renderer_context)


class PartnerOfferStreamView(APIView):
    """`GET /api/v1/partner/offers/stream/` — see the contract proposal.

    Same authentication and permissions as `GET /api/v1/partner/offers/`.
    `EventSource` cannot send custom headers, so this relies on the session cookie
    the partner app already holds — which is also why the permission check happens
    here, before the generator, rather than inside it.
    """

    permission_classes = (IsAuthenticated, IsPartnerUser)
    renderer_classes = (EventStreamRenderer, JSONRenderer)

    @extend_schema(
        tags=["Partner"],
        operation_id="partner_offer_stream",
        request=None,
        responses={
            200: OpenApiResponse(
                description=(
                    "A `text/event-stream` multiplexed for Partner foreground delivery. "
                    "Events: `offer_created` (same-day offers), `job_assigned` "
                    "(advance bookings), `notification_created` (in-app booking and "
                    "enquiry notices). Comment lines are keepalives. The server closes "
                    "the connection after M1_OFFER_STREAM_MAX_SECONDS and the client "
                    "reconnects."
                ),
            ),
        },
    )
    def get(self, request: Request) -> StreamingHttpResponse:
        # `IsAuthenticated` already ran; narrowing for the type checker, which sees
        # the anonymous case the permission class has ruled out.
        user = cast(User, request.user)
        # Replays a short window, because an offer created between the client's list
        # fetch and this connection opening belongs to neither. Clients de-duplicate
        # on `offer_id`; the contract says so.
        since = timezone.now() - timedelta(seconds=settings.M1_OFFER_STREAM_REPLAY_SECONDS)
        response = StreamingHttpResponse(
            offer_event_frames(
                recipient_id=user.id,
                since=since,
                poll_seconds=settings.M1_OFFER_STREAM_POLL_SECONDS,
                max_seconds=settings.M1_OFFER_STREAM_MAX_SECONDS,
            ),
            content_type="text/event-stream",
        )
        # Buffering a stream defeats it: nginx and friends will hold frames until
        # the response ends, which for this response is five minutes.
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"
        return response
