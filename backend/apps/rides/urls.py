from django.urls import path

from apps.rides.views import (
    CaptainMeView,
    CaptainPassesView,
    CaptainPassPlansView,
    CaptainVehicleView,
    DutyStartView,
    DutyStopView,
    FareQuotesView,
)

app_name = "rides"

urlpatterns = [
    path("rides/quotes/", FareQuotesView.as_view(), name="quotes"),
    path("partner/rides/me/", CaptainMeView.as_view(), name="captain-me"),
    path("partner/rides/vehicle/", CaptainVehicleView.as_view(), name="captain-vehicle"),
    path("partner/rides/pass-plans/", CaptainPassPlansView.as_view(), name="pass-plans"),
    path("partner/rides/passes/", CaptainPassesView.as_view(), name="passes"),
    path("partner/rides/duty/start/", DutyStartView.as_view(), name="duty-start"),
    path("partner/rides/duty/stop/", DutyStopView.as_view(), name="duty-stop"),
]
