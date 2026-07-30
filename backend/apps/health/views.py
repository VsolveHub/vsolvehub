"""Liveness and dependency-readiness checks."""

from django.core.cache import caches
from django.db import connections
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView


class LiveHealthView(APIView):
    authentication_classes = ()
    permission_classes = (AllowAny,)

    @extend_schema(
        tags=["Health"],
        responses={200: OpenApiResponse(description="The API process is running.")},
    )
    def get(self, _request: Request) -> Response:
        return Response({"status": "ok", "service": "vsolve-hub-api"})


class ReadyHealthView(APIView):
    authentication_classes = ()
    permission_classes = (AllowAny,)

    @extend_schema(
        tags=["Health"],
        responses={
            200: OpenApiResponse(description="Required dependencies are reachable."),
            503: OpenApiResponse(description="One or more required dependencies are unavailable."),
        },
    )
    def get(self, _request: Request) -> Response:
        checks: dict[str, str] = {}

        try:
            connections["default"].ensure_connection()
            checks["database"] = "ok"
        except Exception:
            checks["database"] = "unavailable"

        try:
            cache = caches["default"]
            cache.set("health:ready", "ok", timeout=5)
            checks["cache"] = "ok" if cache.get("health:ready") == "ok" else "unavailable"
        except Exception:
            checks["cache"] = "unavailable"

        is_ready = all(value == "ok" for value in checks.values())
        response_status = status.HTTP_200_OK if is_ready else status.HTTP_503_SERVICE_UNAVAILABLE
        return Response(
            {
                "status": "ok" if is_ready else "degraded",
                "checks": checks,
            },
            status=response_status,
        )
