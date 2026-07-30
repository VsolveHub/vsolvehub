"""Root API routes."""

from django.conf import settings
from django.contrib import admin
from django.urls import include, path
from django.urls.resolvers import URLPattern, URLResolver
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

urlpatterns: list[URLPattern | URLResolver] = [
    path("admin/", admin.site.urls),
    path("api/v1/auth/", include("apps.identity.urls")),
    path("api/v1/", include("apps.catalog.urls")),
    path("api/v1/", include("apps.locations.urls")),
    path("api/v1/", include("apps.partners.urls")),
    path("api/v1/health/", include("apps.health.urls")),
]

if settings.API_DOCS_ENABLED:
    urlpatterns += [
        path("api/v1/schema/", SpectacularAPIView.as_view(), name="api-schema"),
        path(
            "api/v1/docs/",
            SpectacularSwaggerView.as_view(url_name="api-schema"),
            name="api-docs",
        ),
    ]
