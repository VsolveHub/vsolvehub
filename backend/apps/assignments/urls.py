from django.urls import path

from apps.assignments.views import (
    AdvanceSearchView,
    ManualOfferView,
    ManualUnitOfferView,
    PartnerOfferCommandView,
    PartnerOfferListView,
    StartSearchView,
)

urlpatterns = [
    path("checkouts/<uuid:checkout_id>/search/", StartSearchView.as_view()),
    path("checkouts/<uuid:checkout_id>/search/advance/", AdvanceSearchView.as_view()),
    path("partner/offers/", PartnerOfferListView.as_view()),
    path("partner/offers/<uuid:offer_id>/<str:action>/", PartnerOfferCommandView.as_view()),
    path("operations/checkouts/<uuid:checkout_id>/offers/", ManualOfferView.as_view()),
    path(
        "operations/fulfilment-units/<uuid:unit_id>/offers/",
        ManualUnitOfferView.as_view(),
    ),
]
