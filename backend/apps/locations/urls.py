from django.urls import path

from apps.locations.views import (
    AddressDetailView,
    AddressListCreateView,
    ReverseGeocodeView,
    ServiceabilityCheckView,
)

app_name = "locations"

urlpatterns = [
    path("addresses/", AddressListCreateView.as_view(), name="address-list"),
    path("addresses/<uuid:address_id>/", AddressDetailView.as_view(), name="address-detail"),
    path("geocoding/reverse/", ReverseGeocodeView.as_view(), name="reverse-geocode"),
    path(
        "serviceability/check/",
        ServiceabilityCheckView.as_view(),
        name="serviceability-check",
    ),
]
