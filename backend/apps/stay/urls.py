from django.urls import path

from apps.stay import views

urlpatterns = [
    path("stays", views.StayBrowseView.as_view(), name="stay-browse"),
    path("stays/taxonomy", views.StayTaxonomyView.as_view(), name="stay-taxonomy"),
    path(
        "partner/stays/photos",
        views.PartnerStayPhotoUploadView.as_view(),
        name="partner-stay-photos",
    ),
    path("stays/quote", views.StayQuoteView.as_view(), name="stay-quote"),
    path("stays/enquire", views.StayEnquireView.as_view(), name="stay-enquire"),
    path("stays/<uuid:property_id>", views.StayDetailView.as_view(), name="stay-detail"),
    path("me/stay-enquiries", views.MyStayEnquiriesView.as_view(), name="my-stay-enquiries"),
    path(
        "me/stay-enquiries/<uuid:enquiry_id>/cancel",
        views.MyStayEnquiryCancelView.as_view(),
        name="my-stay-enquiry-cancel",
    ),
    path(
        "partner/stays/properties",
        views.PartnerPropertyCollectionView.as_view(),
        name="partner-stay-properties",
    ),
    path(
        "partner/stays/properties/<uuid:property_id>/units",
        views.PartnerUnitCollectionView.as_view(),
        name="partner-stay-units",
    ),
    path(
        "partner/stays/units/<uuid:unit_id>",
        views.PartnerUnitDetailView.as_view(),
        name="partner-stay-unit-detail",
    ),
    path(
        "partner/stays/properties/<uuid:property_id>",
        views.PartnerPropertyDetailView.as_view(),
        name="partner-stay-property-detail",
    ),
    path(
        "partner/stays/properties/<uuid:property_id>/<slug:action>",
        views.PartnerPropertyActionView.as_view(),
        name="partner-stay-property-action",
    ),
    path(
        "partner/stays/enquiries",
        views.PartnerEnquiryCollectionView.as_view(),
        name="partner-stay-enquiries",
    ),
    path(
        "partner/stays/enquiries/<uuid:enquiry_id>/respond",
        views.PartnerEnquiryRespondView.as_view(),
        name="partner-stay-enquiry-respond",
    ),
    path(
        "partner/stays/enquiries/<uuid:enquiry_id>/confirm",
        views.PartnerEnquiryConfirmView.as_view(),
        name="partner-stay-enquiry-confirm",
    ),
    path(
        "partner/stays/enquiries/<uuid:enquiry_id>/cancel",
        views.PartnerEnquiryCancelView.as_view(),
        name="partner-stay-enquiry-cancel",
    ),
    path("ops/stays", views.OpsStayCollectionView.as_view(), name="ops-stays"),
    path(
        "ops/stays/<uuid:property_id>/moderate",
        views.OpsStayModerateView.as_view(),
        name="ops-stay-moderate",
    ),
    path("stays/reserve", views.StayReserveView.as_view(), name="stay-reserve"),
    path(
        "me/stay-reservations", views.MyStayReservationsView.as_view(), name="my-stay-reservations"
    ),
    path(
        "me/stay-reservations/<uuid:reservation_id>/cancel",
        views.MyStayReservationCancelView.as_view(),
        name="my-stay-reservation-cancel",
    ),
    path(
        "partner/stays/reservations",
        views.PartnerReservationCollectionView.as_view(),
        name="partner-stay-reservations",
    ),
    path(
        "partner/stays/reservations/<uuid:reservation_id>/<slug:action>",
        views.PartnerReservationActionView.as_view(),
        name="partner-stay-reservation-action",
    ),
    path("ops/stays/enquiries", views.OpsStayEnquiriesView.as_view(), name="ops-stay-enquiries"),
    path(
        "ops/stays/reservations",
        views.OpsStayReservationsView.as_view(),
        name="ops-stay-reservations",
    ),
]
