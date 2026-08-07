"""Kill switch and partner event-stream routes."""

from django.urls import path

from apps.notifications.streaming import PartnerOfferStreamView
from apps.notifications.views import KillSwitchListView, KillSwitchReleaseView

urlpatterns = [
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
