"""Kill switch routes."""

from django.urls import path

from apps.notifications.views import KillSwitchListView, KillSwitchReleaseView

urlpatterns = [
    path(
        "operations/kill-switches/", KillSwitchListView.as_view(), name="operations-kill-switches"
    ),
    path(
        "operations/kill-switches/release/",
        KillSwitchReleaseView.as_view(),
        name="operations-kill-switch-release",
    ),
]
