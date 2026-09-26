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
        "partner/stays/properties",
        views.PartnerPropertyCollectionView.as_view(),
        name="partner-stay-properties",
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
    path("ops/stays", views.OpsStayCollectionView.as_view(), name="ops-stays"),
    path(
        "ops/stays/<uuid:property_id>/moderate",
        views.OpsStayModerateView.as_view(),
        name="ops-stay-moderate",
    ),
]
