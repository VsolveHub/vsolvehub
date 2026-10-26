"""API views for Safety Stories (Customer and Operations/Admin)."""

from __future__ import annotations

from typing import Any

from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import permissions, status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import SafetyStory
from .permissions import IsStoryAdminUser
from .serializers import (
    OpsSafetyStoryCreateSerializer,
    OpsSafetyStorySerializer,
    OpsSafetyStoryUpdateSerializer,
    PublicSafetyStorySerializer,
)
from .validation import validate_story_media


class PublicSafetyStoryListView(APIView):
    """Customer-facing endpoint: returns active, published safety stories within 24 hours."""

    permission_classes = (permissions.AllowAny,)

    @extend_schema(
        summary="List active safety stories",
        description="Returns all active, published safety stories that have not expired.",
        responses={200: PublicSafetyStorySerializer(many=True)},
        tags=["safety-stories"],
    )
    def get(self, request: Request) -> Response:
        now = timezone.now()
        stories = (
            SafetyStory.objects.filter(is_published=True, expires_at__gt=now)
            .order_by("display_order", "-published_at")
        )
        serializer = PublicSafetyStorySerializer(stories, many=True, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class OpsSafetyStoryListCreateView(APIView):
    """Operations/Admin endpoint: list, filter, and upload safety stories."""

    permission_classes = (permissions.IsAuthenticated, IsStoryAdminUser)
    parser_classes = (MultiPartParser, FormParser, JSONParser)

    @extend_schema(
        summary="List all safety stories (Operations)",
        description="Filter stories by status: active, expired, draft, or all.",
        parameters=[
            OpenApiParameter(
                name="status",
                description="Status filter: all, active, expired, draft",
                required=False,
                type=str,
                default="all",
            ),
        ],
        responses={200: OpsSafetyStorySerializer(many=True)},
        tags=["operations-safety-stories"],
    )
    def get(self, request: Request) -> Response:
        status_param = (request.query_params.get("status") or "all").lower().strip()
        now = timezone.now()

        queryset = SafetyStory.objects.all()

        if status_param == "active":
            queryset = queryset.filter(is_published=True, expires_at__gt=now)
        elif status_param == "expired":
            queryset = queryset.filter(is_published=True, expires_at__lte=now)
        elif status_param == "draft":
            queryset = queryset.filter(is_published=False)

        stories = queryset.select_related("created_by").order_by("display_order", "-created_at")
        serializer = OpsSafetyStorySerializer(stories, many=True, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(
        summary="Upload and publish a safety story",
        request={"multipart/form-data": OpsSafetyStoryCreateSerializer},
        responses={201: OpsSafetyStorySerializer},
        tags=["operations-safety-stories"],
    )
    def post(self, request: Request) -> Response:
        serializer = OpsSafetyStoryCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated_data = serializer.validated_data

        upload = validated_data["file"]
        media_type, content_type, size = validate_story_media(upload)

        story = SafetyStory(
            title=validated_data.get("title", ""),
            caption=validated_data.get("caption", ""),
            media_type=media_type,
            stored_file=upload,
            original_name=str(getattr(upload, "name", "media"))[:180],
            content_type=content_type,
            size_bytes=size,
            display_order=validated_data.get("display_order", 0),
            is_published=validated_data.get("is_published", True),
            created_by=request.user if request.user.is_authenticated else None,
            published_at=timezone.now(),
        )
        story.save()

        output_serializer = OpsSafetyStorySerializer(story, context={"request": request})
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)


class OpsSafetyStoryDetailView(APIView):
    """Operations/Admin endpoint: retrieve, update, and delete a safety story."""

    permission_classes = (permissions.IsAuthenticated, IsStoryAdminUser)
    parser_classes = (JSONParser, FormParser)

    @extend_schema(
        summary="Retrieve a safety story",
        responses={200: OpsSafetyStorySerializer},
        tags=["operations-safety-stories"],
    )
    def get(self, request: Request, story_id: Any) -> Response:
        story = get_object_or_404(SafetyStory.objects.select_related("created_by"), id=story_id)
        serializer = OpsSafetyStorySerializer(story, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(
        summary="Update a safety story",
        request=OpsSafetyStoryUpdateSerializer,
        responses={200: OpsSafetyStorySerializer},
        tags=["operations-safety-stories"],
    )
    def patch(self, request: Request, story_id: Any) -> Response:
        story = get_object_or_404(SafetyStory, id=story_id)
        serializer = OpsSafetyStoryUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        validated_data = serializer.validated_data

        if "title" in validated_data:
            story.title = validated_data["title"]
        if "caption" in validated_data:
            story.caption = validated_data["caption"]
        if "display_order" in validated_data:
            story.display_order = validated_data["display_order"]
        if "is_published" in validated_data:
            story.is_published = validated_data["is_published"]

        # Note: expires_at is not modified on edits, preventing clock resets
        story.save()

        output_serializer = OpsSafetyStorySerializer(story, context={"request": request})
        return Response(output_serializer.data, status=status.HTTP_200_OK)

    @extend_schema(exclude=True)
    def put(self, request: Request, story_id: Any) -> Response:
        return self.patch(request, story_id)

    @extend_schema(
        summary="Delete a safety story",
        responses={204: None},
        tags=["operations-safety-stories"],
    )
    def delete(self, _request: Request, story_id: Any) -> Response:
        story = get_object_or_404(SafetyStory, id=story_id)
        story.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
