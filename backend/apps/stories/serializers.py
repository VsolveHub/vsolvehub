"""Serializers for Safety Stories."""

from __future__ import annotations

from typing import Any

from django.http import HttpRequest
from rest_framework import serializers

from .models import SafetyStory


def _media_url(obj: SafetyStory, context: dict[str, Any]) -> str:
    """The story file's URL, absolute when the request is known; empty when there is no file."""

    if not obj.stored_file:
        return ""
    url: str = obj.stored_file.url
    request: HttpRequest | None = context.get("request")
    if request is not None:
        return request.build_absolute_uri(url)
    return url


class PublicSafetyStorySerializer(serializers.ModelSerializer[SafetyStory]):
    media_url = serializers.SerializerMethodField()
    time_remaining_seconds = serializers.IntegerField(read_only=True)

    class Meta:
        model = SafetyStory
        fields = (
            "id",
            "title",
            "caption",
            "media_type",
            "media_url",
            "content_type",
            "display_order",
            "published_at",
            "expires_at",
            "time_remaining_seconds",
        )
        read_only_fields = fields

    def get_media_url(self, obj: SafetyStory) -> str:
        return _media_url(obj, self.context)


class OpsSafetyStorySerializer(serializers.ModelSerializer[SafetyStory]):
    media_url = serializers.SerializerMethodField()
    is_active = serializers.BooleanField(read_only=True)
    time_remaining_seconds = serializers.IntegerField(read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = SafetyStory
        fields = (
            "id",
            "title",
            "caption",
            "media_type",
            "media_url",
            "original_name",
            "content_type",
            "size_bytes",
            "display_order",
            "is_published",
            "is_active",
            "created_by_name",
            "published_at",
            "expires_at",
            "time_remaining_seconds",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "media_type",
            "media_url",
            "original_name",
            "content_type",
            "size_bytes",
            "is_active",
            "created_by_name",
            "published_at",
            "expires_at",
            "time_remaining_seconds",
            "created_at",
            "updated_at",
        )

    def get_media_url(self, obj: SafetyStory) -> str:
        return _media_url(obj, self.context)

    def get_created_by_name(self, obj: SafetyStory) -> str:
        if not obj.created_by:
            return ""
        return (
            getattr(obj.created_by, "full_name", "")
            or getattr(obj.created_by, "phone_number", "")
            or str(obj.created_by.id)
        )


class OpsSafetyStoryCreateSerializer(serializers.Serializer[dict[str, Any]]):
    file = serializers.FileField(write_only=True, required=True)
    title = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")
    caption = serializers.CharField(max_length=280, required=False, allow_blank=True, default="")
    display_order = serializers.IntegerField(required=False, default=0, min_value=0)
    is_published = serializers.BooleanField(required=False, default=True)


class OpsSafetyStoryUpdateSerializer(serializers.Serializer[dict[str, Any]]):
    title = serializers.CharField(max_length=120, required=False, allow_blank=True)
    caption = serializers.CharField(max_length=280, required=False, allow_blank=True)
    display_order = serializers.IntegerField(required=False, min_value=0)
    is_published = serializers.BooleanField(required=False)
