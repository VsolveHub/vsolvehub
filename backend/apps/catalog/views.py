"""Read-only public catalog API."""

from drf_spectacular.utils import extend_schema
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.selectors import (
    public_categories,
    public_service_by_slug,
    public_services_for_category,
)
from apps.catalog.serializers import (
    CategorySerializer,
    ServiceCardSerializer,
    ServiceDetailSerializer,
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
