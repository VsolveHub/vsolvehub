from typing import Any

from django.contrib import admin
from django.http import HttpRequest

from apps.rides.models import (
    CaptainDutySession,
    CaptainPass,
    CaptainPassPlan,
    CaptainVehicle,
    FareQuote,
    Ride,
    RideOffer,
    RideRateCard,
    RideRating,
    RideSosEvent,
    RideTransition,
)


@admin.register(CaptainVehicle)
class CaptainVehicleAdmin(admin.ModelAdmin):
    list_display = ("registration_number", "vehicle_type", "make_model", "partner")
    list_filter = ("vehicle_type",)
    search_fields = ("registration_number", "make_model")


class ReadOnlyAdmin(admin.ModelAdmin):
    """For looking while testing. Every change goes through the services or Operations APIs."""

    def has_add_permission(self, request: HttpRequest) -> bool:
        del request
        return False

    def has_change_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        del request, obj
        return False

    def has_delete_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        del request, obj
        return False


@admin.register(RideRateCard)
class RideRateCardAdmin(ReadOnlyAdmin):
    list_display = ("service_area", "vehicle_type", "version", "is_active", "base_fare_paise")
    list_filter = ("vehicle_type", "is_active")


@admin.register(FareQuote)
class FareQuoteAdmin(ReadOnlyAdmin):
    list_display = ("id", "vehicle_type", "fare_paise", "expires_at", "consumed_at")
    list_filter = ("vehicle_type",)


@admin.register(CaptainPassPlan)
class CaptainPassPlanAdmin(ReadOnlyAdmin):
    list_display = ("code", "name", "price_paise", "duration_hours", "is_active")


@admin.register(CaptainPass)
class CaptainPassAdmin(ReadOnlyAdmin):
    list_display = ("partner", "plan", "status", "starts_at", "ends_at")
    list_filter = ("status",)


@admin.register(CaptainDutySession)
class CaptainDutySessionAdmin(ReadOnlyAdmin):
    list_display = ("partner", "started_at", "ended_at", "end_reason")


@admin.register(Ride)
class RideAdmin(ReadOnlyAdmin):
    list_display = ("id", "state", "vehicle_type", "fare_paise", "captain", "created_at")
    list_filter = ("state", "vehicle_type")


@admin.register(RideTransition)
class RideTransitionAdmin(ReadOnlyAdmin):
    list_display = ("ride", "from_state", "to_state", "actor_kind", "at")


@admin.register(RideOffer)
class RideOfferAdmin(ReadOnlyAdmin):
    list_display = ("ride", "captain", "round", "status", "expires_at")
    list_filter = ("status",)


@admin.register(RideRating)
class RideRatingAdmin(ReadOnlyAdmin):
    list_display = ("ride", "rater_kind", "stars", "created_at")


@admin.register(RideSosEvent)
class RideSosEventAdmin(ReadOnlyAdmin):
    list_display = ("ride", "status", "created_at", "resolved_at")
    list_filter = ("status",)
