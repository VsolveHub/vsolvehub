"""VSolve Rides V1: bike, auto and cab rides.

Money is integer paise, calculated on the server. Every invariant that matters is also a database
constraint, so a bug in a service cannot write an impossible row.
"""

import uuid
from typing import Any

from django.conf import settings
from django.db import models
from django.db.models import Q

__all__ = ["CaptainVehicle", "RideRateCard", "VehicleType", "normalise_registration_number"]


def normalise_registration_number(value: str) -> str:
    """Upper-case with no spaces, so two spellings of one plate are one plate."""
    return "".join(value.split()).upper()


class VehicleType(models.TextChoices):
    BIKE = "BIKE", "Bike"
    AUTO = "AUTO", "Auto"
    CAB = "CAB", "Cab"


class CaptainVehicle(models.Model):
    """The one vehicle a ride captain drives. A captain is a partner on the `RIDE_CAPTAIN` track."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.OneToOneField(
        "partners.PartnerProfile",
        on_delete=models.PROTECT,
        related_name="ride_vehicle",
    )
    vehicle_type = models.CharField(max_length=8, choices=VehicleType.choices)
    #: Stored upper-case with no spaces, so two spellings cannot be two vehicles.
    registration_number = models.CharField(max_length=16, unique=True)
    make_model = models.CharField(max_length=120)
    colour = models.CharField(max_length=40)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=~Q(registration_number=""),
                name="rides_vehicle_registration_present",
            ),
        ]

    def __str__(self) -> str:
        return self.registration_number

    def save(self, *args: Any, **kwargs: Any) -> None:
        self.registration_number = normalise_registration_number(self.registration_number)
        super().save(*args, **kwargs)


class RideRateCard(models.Model):
    """Operations' price list for one vehicle type in one service area.

    A vehicle type is bookable in an area only while it has an active card: that is the only
    on/off switch. An edit is a new row with the next `version`, and the old row is deactivated,
    so a quote keeps the exact numbers it was priced on.

    Every money value is integer paise. Positive integer fields make "never negative" a database
    rule, not just a serializer rule.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    service_area = models.ForeignKey(
        "locations.ServiceArea",
        on_delete=models.PROTECT,
        related_name="ride_rate_cards",
    )
    vehicle_type = models.CharField(max_length=8, choices=VehicleType.choices)

    base_fare_paise = models.PositiveBigIntegerField()
    #: Distance the base fare already covers, in metres. `per_km_paise` applies beyond it.
    included_distance_m = models.PositiveIntegerField()
    per_km_paise = models.PositiveBigIntegerField()
    per_minute_paise = models.PositiveBigIntegerField()
    minimum_fare_paise = models.PositiveBigIntegerField()
    free_waiting_minutes = models.PositiveSmallIntegerField()
    waiting_per_minute_paise = models.PositiveBigIntegerField()

    is_active = models.BooleanField(default=True)
    #: Starts at 1 and goes up by one per edit, per (area, vehicle type).
    version = models.PositiveIntegerField(default=1)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="ride_rate_cards_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("service_area", "vehicle_type", "-version")
        constraints = [
            # The on/off switch: at most one live price per area and vehicle type.
            models.UniqueConstraint(
                fields=("service_area", "vehicle_type"),
                condition=Q(is_active=True),
                name="rides_one_active_rate_card_per_area_vehicle",
            ),
            models.UniqueConstraint(
                fields=("service_area", "vehicle_type", "version"),
                name="rides_unique_rate_card_version",
            ),
            models.CheckConstraint(
                condition=Q(version__gte=1),
                name="rides_rate_card_version_from_one",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.service_area_id}:{self.vehicle_type}:v{self.version}"
