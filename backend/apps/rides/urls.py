"""Rides routes. Endpoints are added with the captain API."""

from django.urls import URLPattern, URLResolver

app_name = "rides"

urlpatterns: list[URLPattern | URLResolver] = []
