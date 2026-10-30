"""Read-only public catalog API."""

from django.utils.cache import patch_cache_control
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.selectors import (
    active_promo_banners,
    public_categories,
    public_service_by_slug,
    public_service_index,
    public_services_for_category,
)
from apps.catalog.serializers import (
    CategorySerializer,
    PromoBannerSerializer,
    ServiceCardSerializer,
    ServiceDetailSerializer,
    ServiceIndexItemSerializer,
)
from common.errors.serializers import ApiErrorSerializer


class CategoryListView(APIView):
    authentication_classes = ()
    permission_classes = (AllowAny,)

    @extend_schema(tags=["Catalog"], responses={200: CategorySerializer(many=True)})
    def get(self, _request: Request) -> Response:
        return Response(CategorySerializer(public_categories(), many=True).data)


class CategoryServiceListView(APIView):
    authentication_classes = ()
    permission_classes = (AllowAny,)

    @extend_schema(tags=["Catalog"], responses={200: ServiceCardSerializer(many=True)})
    def get(self, _request: Request, category_slug: str) -> Response:
        services = public_services_for_category(category_slug)
        return Response(ServiceCardSerializer(services, many=True).data)


class ServiceIndexView(APIView):
    authentication_classes = ()
    permission_classes = (AllowAny,)

    @extend_schema(
        operation_id="catalog_service_index",
        tags=["Catalog"],
        responses={200: ServiceIndexItemSerializer(many=True)},
    )
    def get(self, _request: Request) -> Response:
        response = Response(ServiceIndexItemSerializer(public_service_index(), many=True).data)
        patch_cache_control(response, public=True, max_age=300, stale_while_revalidate=600)
        return response


class ServiceDetailView(APIView):
    authentication_classes = ()
    permission_classes = (AllowAny,)

    @extend_schema(
        tags=["Catalog"],
        responses={
            200: ServiceDetailSerializer,
            404: ApiErrorSerializer,
        },
    )
    def get(self, _request: Request, service_slug: str) -> Response:
        return Response(ServiceDetailSerializer(public_service_by_slug(service_slug)).data)


class ServiceConfigurationView(ServiceDetailView):
    """Stable configuration endpoint retained separately for booking-workspace caching."""


class PromoBannerListView(APIView):
    """Display-only promotional banners for service pages. Never read by pricing."""

    authentication_classes = ()
    permission_classes = (AllowAny,)

    @extend_schema(
        tags=["Catalog"],
        parameters=[
            OpenApiParameter(
                "category",
                str,
                required=False,
                description="Category slug; adds that category's banners to the site-wide ones.",
            )
        ],
        responses={200: PromoBannerSerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        category_slug = request.query_params.get("category") or None
        response = Response(
            PromoBannerSerializer(active_promo_banners(category_slug), many=True).data
        )
        patch_cache_control(response, public=True, max_age=60)
        return response
