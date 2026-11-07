from django.contrib import admin

from apps.rides.models import CaptainVehicle


@admin.register(CaptainVehicle)
class CaptainVehicleAdmin(admin.ModelAdmin):
    list_display = ("registration_number", "vehicle_type", "make_model", "partner")
    list_filter = ("vehicle_type",)
    search_fields = ("registration_number", "make_model")
