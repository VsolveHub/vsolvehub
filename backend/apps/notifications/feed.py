"""The in-app feed: what one person has been told, and what they have read.

## Why the feed is a filter and not a table of its own

An in-app notice is a `NotificationIntent` whose channel happens to be `IN_APP`. Giving it its own
table would mean two rows for one fact, a join on every read, and a second place for the escalation
ladder to fall out of step with itself. The filter is covered by a dedicated index, so the cost of
not duplicating is one index rather than one table.

## Why suppressed and failed notices are not in the feed

`SUPPRESSED` means a kill switch or a preference stopped this message. Showing it anyway would
make the kill switch a lie. `FAILED` cannot occur on in-app — the write is the delivery — but it is
excluded rather than assumed away, because the day a sender does touch these rows, silently
showing failures as if they had arrived is the bug nobody would look for.

## Why reading someone else's notice is a 404

The same rule the requirement selectors use: existence is itself private, and a 403 confirms a
record is there to be found. A notification id is a UUID nobody can guess, which is exactly why a
confirmed guess would be worth something.
"""

import uuid

from django.db.models import QuerySet
from django.utils import timezone

from apps.identity.models import User
from apps.notifications.models import NotificationIntent

__all__ = [
    "NotificationNotFoundError",
    "mark_all_read",
    "mark_read",
    "notification_feed",
    "unread_count",
]

#: Statuses a person may see in their feed. `PENDING` is deliberately absent: an in-app notice is
#: delivered inline by `request_notification`, so a `PENDING` in-app row means the delivery write
#: did not happen and the honest thing is not to show it.
_VISIBLE_STATUSES = (NotificationIntent.Status.SENT,)


class NotificationNotFoundError(RuntimeError):
    """No such notification belongs to this person."""

    def __init__(self) -> None:
        super().__init__("We could not find that notification.")
        self.code = "notification_not_found"
        self.message = "We could not find that notification."
        self.status_code = 404
        self.retryable = False


def notification_feed(recipient: User) -> QuerySet[NotificationIntent]:
    """This person's in-app notices, newest first.

    Ordering comes from `Meta.ordering` — `("-created_at", "id")` — which is also what the cursor
    paginator declares, so the page boundary and the sort cannot disagree.
    """

    return NotificationIntent.objects.filter(
        recipient=recipient,
        channel=NotificationIntent.Channel.IN_APP,
        status__in=_VISIBLE_STATUSES,
    )


def unread_count(recipient: User) -> int:
    """How many of this person's in-app notices are unopened.

    This is the number behind a badge polled on every authenticated screen in both apps, so it is
    a `COUNT` over the covering index and never a length of a materialised page.
    """

    return notification_feed(recipient).filter(read_at__isnull=True).count()


def mark_read(*, recipient: User, notification_id: uuid.UUID) -> NotificationIntent:
    """Mark one notice read. Idempotent — a second call keeps the first timestamp.

    Keeping the original `read_at` matters more than it looks: "when did they first see this" is
    the question an escalation asks before it climbs, and a re-tap that moved the timestamp
    forward would make a notice look freshly seen every time the panel was reopened.
    """

    notification = notification_feed(recipient).filter(id=notification_id).first()
    if notification is None:
        raise NotificationNotFoundError
    if notification.read_at is None:
        notification.read_at = timezone.now()
        notification.save(update_fields=("read_at", "updated_at"))
    return notification


def mark_all_read(*, recipient: User) -> int:
    """Mark every unread notice read, and report how many moved.

    One `UPDATE`, so a feed with a long unread tail does not become a long transaction. Rows
    already read keep their timestamps because the filter excludes them.
    """

    return notification_feed(recipient).filter(read_at__isnull=True).update(read_at=timezone.now())
