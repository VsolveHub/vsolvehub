from django.urls import path

from apps.rides.views import (
    CaptainLocationView,
    CaptainMeView,
    CaptainPassesView,
    CaptainPassPlansView,
    CaptainVehicleView,
    CurrentOfferView,
    DutyStartView,
    DutyStopView,
    FareQuotesView,
    OfferAcceptView,
    OfferDeclineView,
    OpsPassPlanDetailView,
    OpsPassPlansView,
    OpsRateCardDetailView,
    OpsRateCardsView,
    RideDetailView,
    RidesView,
)

app_name = "rides"

urlpatterns = [
    path("rides/", RidesView.as_view(), name="rides"),
    path("rides/quotes/", FareQuotesView.as_view(), name="quotes"),
    path("rides/<uuid:ride_id>/", RideDetailView.as_view(), name="ride"),
    path("partner/rides/me/", CaptainMeView.as_view(), name="captain-me"),
    path("partner/rides/vehicle/", CaptainVehicleView.as_view(), name="captain-vehicle"),
    path("partner/rides/pass-plans/", CaptainPassPlansView.as_view(), name="pass-plans"),
    path("partner/rides/passes/", CaptainPassesView.as_view(), name="passes"),
    path("partner/rides/duty/start/", DutyStartView.as_view(), name="duty-start"),
    path("partner/rides/duty/stop/", DutyStopView.as_view(), name="duty-stop"),
    path("partner/rides/location/", CaptainLocationView.as_view(), name="location"),
    path("partner/rides/offers/current/", CurrentOfferView.as_view(), name="offer-current"),
    path(
        "partner/rides/offers/<uuid:offer_id>/accept/",
        OfferAcceptView.as_view(),
        name="offer-accept",
    ),
    path(
        "partner/rides/offers/<uuid:offer_id>/decline/",
        OfferDeclineView.as_view(),
        name="offer-decline",
    ),
    path("operations/rides/rate-cards/", OpsRateCardsView.as_view(), name="ops-rate-cards"),
    path(
        "operations/rides/rate-cards/<uuid:card_id>/",
        OpsRateCardDetailView.as_view(),
        name="ops-rate-card",
    ),
    path("operations/rides/pass-plans/", OpsPassPlansView.as_view(), name="ops-pass-plans"),
    path(
        "operations/rides/pass-plans/<uuid:plan_id>/",
        OpsPassPlanDetailView.as_view(),
        name="ops-pass-plan",
    ),
]
