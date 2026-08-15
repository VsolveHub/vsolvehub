"""Notification feed, kill switch and partner event-stream routes."""

from django.urls import path

from apps.notifications.streaming import PartnerOfferStreamView
from apps.notifications.views import (
    KillSwitchListView,
    KillSwitchReleaseView,
    NotificationFeedView,
    NotificationReadView,
    NotificationUnreadCountView,
)

urlpatterns = [
    # Everyone. Deliberately unprefixed by role: a Customer, a lead and an operator all read
    # their own feed through the same three routes, and the recipient is the session rather than
    # a path segment.
    path("notifications/", NotificationFeedView.as_view(), name="notification-feed"),
    path(
        "notifications/unread-count/",
        NotificationUnreadCountView.as_view(),
        name="notification-unread-count",
    ),
    path("notifications/read/", NotificationReadView.as_view(), name="notification-read"),
    # Sits under the same /api/v1/partner/offers/ prefix as the list it
    # complements (apps.assignments.urls). "stream" never matches that module's
    # <uuid:offer_id> converter, so the two cannot shadow each other.
    path("partner/offers/stream/", PartnerOfferStreamView.as_view()),
    path(
        "operations/kill-switches/", KillSwitchListView.as_view(), name="operations-kill-switches"
    ),
    path(
        "operations/kill-switches/release/",
        KillSwitchReleaseView.as_view(),
        name="operations-kill-switch-release",
    ),
]
