from django.urls import path

from apps.assignments.operations_views import (
    OperationsDispatchExplanationView,
    OperationsOfferRevokeView,
    OperationsReservationReleaseView,
    OperationsUnitRecoverView,
)
from apps.assignments.views import (
    AdvanceSearchView,
    DispatchOfferAcceptView,
    DispatchOfferDeclineView,
    DispatchOfferDetailView,
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
    path(
        "partner/dispatch-offers/<uuid:offer_id>/",
        DispatchOfferDetailView.as_view(),
        name="dispatch-offer-detail",
    ),
    path(
        "partner/dispatch-offers/<uuid:offer_id>/accept/",
        DispatchOfferAcceptView.as_view(),
        name="dispatch-offer-accept",
    ),
    path(
        "partner/dispatch-offers/<uuid:offer_id>/decline/",
        DispatchOfferDeclineView.as_view(),
        name="dispatch-offer-decline",
    ),

    path("operations/checkouts/<uuid:checkout_id>/offers/", ManualOfferView.as_view()),
    path(
        "operations/fulfilment-units/<uuid:unit_id>/offers/",
        ManualUnitOfferView.as_view(),
    ),
    path(
        "operations/fulfilment-units/<uuid:unit_id>/dispatch-explanation/",
        OperationsDispatchExplanationView.as_view(),
    ),
    path("operations/offers/<uuid:offer_id>/revoke/", OperationsOfferRevokeView.as_view()),
    path(
        "operations/reservations/<uuid:reservation_id>/release/",
        OperationsReservationReleaseView.as_view(),
    ),
    path(
        "operations/fulfilment-units/<uuid:unit_id>/recover/",
        OperationsUnitRecoverView.as_view(),
    ),
]
