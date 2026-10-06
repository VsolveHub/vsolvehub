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
    path("me/stay-enquiries", views.MyStayEnquiriesView.as_view(), name="my-stay-enquiries"),
    path(
        "me/stay-enquiries/<uuid:enquiry_id>/cancel",
        views.MyStayEnquiryCancelView.as_view(),
        name="my-stay-enquiry-cancel",
    ),
    path("stays/visits", views.StayVisitCreateView.as_view(), name="stay-visit-create"),
    path(
        "stays/<uuid:property_id>/visit-slots",
        views.StayVisitAvailabilityView.as_view(),
        name="stay-visit-slots",
    ),
    path("me/stay-visits", views.MyStayVisitsView.as_view(), name="my-stay-visits"),
    path(
        "me/stay-visits/<uuid:visit_id>/cancel",
        views.MyStayVisitCancelView.as_view(),
        name="my-stay-visit-cancel",
    ),
    path(
        "partner/stays/summary",
        views.PartnerStaySummaryView.as_view(),
        name="partner-stay-summary",
    ),
    path(
        "partner/stays/units/<uuid:unit_id>/rooms",
        views.PartnerUnitRoomCollectionView.as_view(),
        name="partner-stay-unit-rooms",
    ),
    path(
        "partner/stays/rooms/<uuid:room_id>",
        views.PartnerRoomDetailView.as_view(),
        name="partner-stay-room-detail",
    ),
    path(
        "partner/stays/rooms/<uuid:room_id>/<slug:action>",
        views.PartnerRoomActionView.as_view(),
        name="partner-stay-room-action",
    ),
    # Before ".../properties/<id>/<action>", which would otherwise take "visiting-hours".
    path(
        "partner/stays/properties/<uuid:property_id>/visiting-hours",
        views.PartnerVisitingHoursView.as_view(),
        name="partner-stay-visiting-hours",
    ),
    path(
        "partner/stays/visits",
        views.PartnerVisitCollectionView.as_view(),
        name="partner-stay-visits",
    ),
    path(
        "partner/stays/visits/<uuid:visit_id>/<slug:action>",
        views.PartnerVisitActionView.as_view(),
        name="partner-stay-visit-action",
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
        "partner/stays/units/<uuid:unit_id>/media",
        views.PartnerUnitMediaCreateView.as_view(),
        name="partner-stay-unit-media-create",
    ),
    path(
        "partner/stays/units/<uuid:unit_id>/media/<uuid:media_id>",
        views.PartnerUnitMediaDeleteView.as_view(),
        name="partner-stay-unit-media-delete",
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
    path("stays/reviews", views.StayReviewCreateView.as_view(), name="stay-review-create"),
    path(
        "stays/reviews/photos",
        views.StayReviewPhotoUploadView.as_view(),
        name="stay-review-photos",
    ),
    path(
        "partner/stays/properties/<uuid:property_id>/media",
        views.PartnerPropertyMediaCreateView.as_view(),
        name="partner-stay-property-media-create",
    ),
    path(
        "partner/stays/properties/<uuid:property_id>/media/<uuid:media_id>",
        views.PartnerPropertyMediaDeleteView.as_view(),
        name="partner-stay-property-media-delete",
    ),
    path("ops/stays/enquiries", views.OpsStayEnquiriesView.as_view(), name="ops-stay-enquiries"),
    path(
        "ops/stays/reservations",
        views.OpsStayReservationsView.as_view(),
        name="ops-stay-reservations",
    ),
    path(
        "ops/stays/reservations/<uuid:reservation_id>/cancel",
        views.OpsStayReservationCancelView.as_view(),
        name="ops-stay-reservation-cancel",
    ),
    path(
        "ops/stay-subscription-plans",
        views.OpsStaySubscriptionPlanCollectionView.as_view(),
        name="ops-stay-subscription-plans",
    ),
    path(
        "ops/stay-subscription-plans/<uuid:plan_id>",
        views.OpsStaySubscriptionPlanDetailView.as_view(),
        name="ops-stay-subscription-plan-detail",
    ),
    path(
        "partner/stays/subscription",
        views.PartnerStaySubscriptionView.as_view(),
        name="partner-stay-subscription",
    ),
    # Last: "stays/<key>" would otherwise swallow fixed addresses such as "stays/reviews".
    path("stays/<str:key>", views.StayDetailView.as_view(), name="stay-detail"),
]
