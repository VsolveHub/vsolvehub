"""Django admin configuration for SafetyStory."""

from django.contrib import admin

from .models import SafetyStory


@admin.register(SafetyStory)
class SafetyStoryAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "media_type",
        "is_published",
        "display_order",
        "published_at",
        "expires_at",
        "created_by",
    )
    list_filter = ("is_published", "media_type")
    search_fields = ("title", "caption", "original_name")
    readonly_fields = ("id", "expires_at", "size_bytes", "content_type", "created_at", "updated_at")
    ordering = ("display_order", "-published_at")
