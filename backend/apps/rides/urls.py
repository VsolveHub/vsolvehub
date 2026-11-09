from django.urls import path

from apps.rides.views import CaptainMeView, CaptainVehicleView, FareQuotesView

app_name = "rides"

urlpatterns = [
    path("rides/quotes/", FareQuotesView.as_view(), name="quotes"),
    path("partner/rides/me/", CaptainMeView.as_view(), name="captain-me"),
    path("partner/rides/vehicle/", CaptainVehicleView.as_view(), name="captain-vehicle"),
]
