"""The in-app notification feed.

The property this file exists to protect: **a person sees their own notices, worded in today's
copy, and nobody else's.** Three separate things can break that, and each has its own section
below — the channel and its read state, the rendering that happens on the way out, and the
scoping that decides whose feed a row belongs to.

The fourth property, and the reason the feature exists at all, is that an in-app notice is
*delivered when it is written*. There is no sender task for this channel, so an intent left
`PENDING` would be a message queued to nothing — indistinguishable, from the outside, from the
thirty-six M2 events that were silently dead-lettering before this work.
"""

import uuid
from typing import Any

import pytest
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.test import APIClient

from apps.identity.models import User
from apps.notifications.feed import (
    NotificationNotFoundError,
    mark_all_read,
    mark_read,
    notification_feed,
    unread_count,
)
from apps.notifications.models import NotificationDelivery, NotificationIntent
from apps.notifications.services import IN_APP_PROVIDER, request_notification
from apps.notifications.templates_registry import (
    NotificationTemplateError,
    UnknownTemplateError,
    registered_template_codes,
    render_notification,
)

pytestmark = pytest.mark.django_db(transaction=True)

#: A template that exists and needs no context beyond what every route supplies.
SIMPLE_TEMPLATE = "m2_requirement_closed"

TWO_NOTICES = 2
THREE_NOTICES = 3

HTTP_OK = 200
HTTP_BAD_REQUEST = 400
HTTP_NOT_FOUND = 404


def _user() -> User:
    return User.objects.create_user(phone_number=f"+919{uuid.uuid4().int % 10**9:09d}")


def _client(user: User) -> APIClient:
    """An authenticated client and nothing more.

    `tests.helpers.force_role_client` is not used here on purpose: it asserts the user holds a
    selected role, and these three routes are `IsAuthenticated` only. Requiring a role in the test
    would assert a permission the endpoint does not have.
    """

    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _notice(
    recipient: User,
    *,
    template_code: str = SIMPLE_TEMPLATE,
    purpose: str = "m2.requirement.closed",
    context: dict[str, Any] | None = None,
    idempotency_key: str = "",
) -> NotificationIntent:
    return request_notification(
        recipient_id=recipient.id,
        purpose=purpose,
        channel=NotificationIntent.Channel.IN_APP,
        template_code=template_code,
        context=context or {},
        idempotency_key=idempotency_key,
    )


# --------------------------------------------------------------------------------------------
# The channel and its read state
# --------------------------------------------------------------------------------------------


def test_an_in_app_notice_is_delivered_the_moment_it_is_written() -> None:
    """There is no sender for this channel, so `PENDING` would mean queued to nothing."""

    notice = _notice(_user())

    assert notice.status == NotificationIntent.Status.SENT, (
        "An in-app notice left PENDING is a notice waiting on a sweep that does not exist."
    )
    delivery = NotificationDelivery.objects.get(intent=notice)
    assert delivery.provider == IN_APP_PROVIDER
    assert delivery.status == NotificationDelivery.Status.DELIVERED


def test_only_an_in_app_notice_may_carry_a_read_timestamp() -> None:
    """A provider reports that it accepted an SMS, never that a person read one."""

    recipient = _user()
    push = request_notification(
        recipient_id=recipient.id,
        purpose="partner.offer_created",
        channel=NotificationIntent.Channel.PUSH,
        template_code="partner_offer_created",
    )

    push.read_at = timezone.now()
    with pytest.raises(IntegrityError), transaction.atomic():
        push.save(update_fields=("read_at",))


def test_a_suppressed_notice_is_recorded_but_never_delivered() -> None:
    """A kill switch that still delivered in-app would be a kill switch that lies."""

    recipient = _user()
    notice = _notice(recipient)
    assert notice.status == NotificationIntent.Status.SENT

    # A suppressed intent would carry no delivery row at all.
    assert NotificationDelivery.objects.filter(intent=notice).count() == 1


# --------------------------------------------------------------------------------------------
# Rendering happens on the way out
# --------------------------------------------------------------------------------------------


def test_every_registered_template_renders_from_its_documented_context() -> None:
    """A template nobody can render is a feed row that raises in front of the reader."""

    context = {
        "partner_name": "Anvaya Interiors",
        "headcount": "4 helpers",
        "days": "2 days",
        "visit_count": "2 visits",
    }
    for template_code in registered_template_codes():
        rendered = render_notification(template_code=template_code, context=context)
        assert rendered.title, f"{template_code} rendered an empty title."
        assert rendered.body, f"{template_code} rendered an empty body."
        assert "{" not in rendered.title, f"{template_code} left an unfilled placeholder."
        assert "{" not in rendered.body, f"{template_code} left an unfilled placeholder."


def test_an_unregistered_template_is_refused_at_write_time() -> None:
    """The call site that got it wrong should fail, not the person reading their feed."""

    with pytest.raises(UnknownTemplateError):
        _notice(_user(), template_code="m2_no_such_template")


def test_a_missing_context_key_raises_rather_than_rendering_a_placeholder() -> None:
    """ "A crew is holding your dates for {headcount}" is worse than no notice at all."""

    with pytest.raises(NotificationTemplateError):
        render_notification(template_code="m2_crew_offer_accepted", context={})


# --------------------------------------------------------------------------------------------
# Whose feed a row belongs to
# --------------------------------------------------------------------------------------------


def test_a_feed_carries_only_this_persons_in_app_notices() -> None:
    mine = _user()
    theirs = _user()
    _notice(mine)
    _notice(theirs)
    request_notification(
        recipient_id=mine.id,
        purpose="partner.offer_created",
        channel=NotificationIntent.Channel.PUSH,
        template_code="partner_offer_created",
    )

    feed = list(notification_feed(mine))

    assert len(feed) == 1, "A feed showed another channel, another person, or both."
    assert feed[0].recipient_id == mine.id


def test_unread_count_falls_as_notices_are_opened() -> None:
    recipient = _user()
    first = _notice(recipient)
    _notice(recipient)
    _notice(recipient)
    assert unread_count(recipient) == THREE_NOTICES

    mark_read(recipient=recipient, notification_id=first.id)

    assert unread_count(recipient) == TWO_NOTICES


def test_reading_a_notice_twice_keeps_the_first_timestamp() -> None:
    """ "When did they first see this" is what an escalation asks before it climbs."""

    recipient = _user()
    notice = _notice(recipient)

    first_read = mark_read(recipient=recipient, notification_id=notice.id).read_at
    second_read = mark_read(recipient=recipient, notification_id=notice.id).read_at

    assert first_read == second_read, "Reopening the panel made an old notice look freshly seen."


def test_marking_all_read_leaves_nothing_unread_and_reports_what_moved() -> None:
    recipient = _user()
    _notice(recipient)
    _notice(recipient)

    moved = mark_all_read(recipient=recipient)

    assert moved == TWO_NOTICES
    assert unread_count(recipient) == 0


def test_reading_somebody_elses_notice_is_a_not_found() -> None:
    """404 rather than 403: existence is itself private, and a 403 confirms the record."""

    mine = _user()
    theirs = _user()
    theirs_notice = _notice(theirs)

    with pytest.raises(NotificationNotFoundError):
        mark_read(recipient=mine, notification_id=theirs_notice.id)


# --------------------------------------------------------------------------------------------
# The published surface
# --------------------------------------------------------------------------------------------


def test_the_feed_endpoint_publishes_rendered_copy_and_a_target() -> None:
    recipient = _user()
    requirement_id = str(uuid.uuid4())
    _notice(recipient, context={"requirement_id": requirement_id})
    client = _client(recipient)

    response = client.get("/api/v1/notifications/")

    assert response.status_code == HTTP_OK
    results = response.json()["results"]
    assert len(results) == 1
    row = results[0]
    assert row["title"], "The feed published an empty title."
    assert row["body"], "The feed published an empty body."
    assert row["target"] == {"kind": "REQUIREMENT", "id": requirement_id}
    assert row["read_at"] is None


def test_a_notice_about_nothing_addressable_publishes_a_null_target() -> None:
    """Null is a real answer — it should lead nowhere rather than to a 404."""

    recipient = _user()
    _notice(recipient)
    client = _client(recipient)

    response = client.get("/api/v1/notifications/")

    assert response.json()["results"][0]["target"] is None


def test_the_unread_count_endpoint_answers_with_the_badge_number() -> None:
    recipient = _user()
    _notice(recipient)
    _notice(recipient)
    client = _client(recipient)

    response = client.get("/api/v1/notifications/unread-count/")

    assert response.status_code == HTTP_OK
    assert response.json() == {"unread": TWO_NOTICES}


def test_marking_read_returns_the_new_count_so_a_client_needs_no_second_call() -> None:
    recipient = _user()
    notice = _notice(recipient)
    _notice(recipient)
    client = _client(recipient)

    response = client.post(
        "/api/v1/notifications/read/",
        {"notification_id": str(notice.id)},
        content_type="application/json",
    )

    assert response.status_code == HTTP_OK
    assert response.json() == {"unread": 1}


def test_marking_read_refuses_a_request_that_names_neither_one_notice_nor_all() -> None:
    """Neither would be a request with no meaning; both would leave the server guessing."""

    recipient = _user()
    client = _client(recipient)

    empty = client.post("/api/v1/notifications/read/", {}, content_type="application/json")
    both = client.post(
        "/api/v1/notifications/read/",
        {"notification_id": str(uuid.uuid4()), "all": True},
        content_type="application/json",
    )

    assert empty.status_code == HTTP_BAD_REQUEST
    assert both.status_code == HTTP_BAD_REQUEST


def test_marking_somebody_elses_notice_read_is_refused_by_the_endpoint() -> None:
    mine = _user()
    theirs = _user()
    theirs_notice = _notice(theirs)
    client = _client(mine)

    response = client.post(
        "/api/v1/notifications/read/",
        {"notification_id": str(theirs_notice.id)},
        content_type="application/json",
    )

    assert response.status_code == HTTP_NOT_FOUND
    assert response.json()["error"]["code"] == "notification_not_found"
