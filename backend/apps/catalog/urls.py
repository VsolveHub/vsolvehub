from django.urls import path

from apps.catalog.views import (
    CategoryListView,
    CategoryServiceListView,
    ServiceConfigurationView,
    ServiceDetailView,
    ServiceIndexView,
)

app_name = "catalog"

urlpatterns = [
    path("categories/", CategoryListView.as_view(), name="category-list"),
    path(
        "categories/<slug:category_slug>/services/",
        CategoryServiceListView.as_view(),
        name="category-service-list",
    ),
    path("services/", ServiceIndexView.as_view(), name="service-index"),
    path("services/<slug:service_slug>/", ServiceDetailView.as_view(), name="service-detail"),
    path(
        "services/<slug:service_slug>/configuration/",
        ServiceConfigurationView.as_view(),
        name="service-configuration",
    ),
]
