"""Notification feed, kill switch and partner event-stream routes."""

from django.urls import path

from apps.notifications.streaming import PartnerOfferStreamView
from apps.notifications.views import (
    CustomerPushNotificationPreferencesView,
    CustomerPushSubscriptionDetailView,
    CustomerPushSubscriptionSyncView,
    DevOneSignalTestPushView,
    KillSwitchListView,
    KillSwitchReleaseView,
    NotificationFeedView,
    NotificationReadView,
    NotificationUnreadCountView,
    PartnerPushNotificationPreferencesView,
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
    path("dev/onesignal/test-push/", DevOneSignalTestPushView.as_view(), name="dev-onesignal-test-push"),
    path(
        "customer/push-subscriptions/sync/",
        CustomerPushSubscriptionSyncView.as_view(),
        name="customer-push-subscription-sync",
    ),
    path(
        "customer/push-subscriptions/<str:subscription_id>/",
        CustomerPushSubscriptionDetailView.as_view(),
        name="customer-push-subscription-detail",
    ),
    path(
        "customer/notification-preferences/",
        CustomerPushNotificationPreferencesView.as_view(),
        name="customer-push-notification-preferences",
    ),
    path(
        "partner/notification-preferences/",
        PartnerPushNotificationPreferencesView.as_view(),
        name="partner-push-notification-preferences",
    ),
]

