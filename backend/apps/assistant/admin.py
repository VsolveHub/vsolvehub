"""Read-only review of conversations, for Operations to audit what the assistant said."""

from django.contrib import admin
from django.http import HttpRequest

from .models import AssistantBooking, AssistantMessage, AssistantSession


class AssistantMessageInline(admin.TabularInline):
    model = AssistantMessage
    fields = ("sequence", "role", "text", "tool_calls", "tool_results", "provider", "created_at")
    readonly_fields = fields
    extra = 0
    can_delete = False
    ordering = ("sequence",)

    def has_add_permission(self, request: HttpRequest, obj: object = None) -> bool:
        del request, obj
        return False


@admin.register(AssistantSession)
class AssistantSessionAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "customer",
        "channel",
        "user_message_count",
        "input_tokens",
        "output_tokens",
        "last_activity_at",
    )
    list_filter = ("channel",)
    readonly_fields = (
        "id",
        "customer",
        "channel",
        "state",
        "turn_count",
        "user_message_count",
        "input_tokens",
        "output_tokens",
        "last_activity_at",
        "created_at",
    )
    exclude = ("token_hash", "busy_until")
    inlines = (AssistantMessageInline,)

    def has_add_permission(self, request: HttpRequest) -> bool:
        del request
        return False

    def has_change_permission(self, request: HttpRequest, obj: object = None) -> bool:
        del request, obj
        return False


@admin.register(AssistantBooking)
class AssistantBookingAdmin(admin.ModelAdmin):
    list_display = ("session", "checkout", "booking_group", "announced_status", "closed_at")
    readonly_fields = list_display

    def has_add_permission(self, request: HttpRequest) -> bool:
        del request
        return False

    def has_change_permission(self, request: HttpRequest, obj: object = None) -> bool:
        del request, obj
        return False
