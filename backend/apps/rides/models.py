"""VSolve Rides V1: bike, auto and cab rides.

Money is integer paise, calculated on the server. Every invariant that matters is also a database
constraint, so a bug in a service cannot write an impossible row.
"""

import uuid
from typing import Any

from django.db import models
from django.db.models import Q

__all__ = ["CaptainVehicle", "VehicleType", "normalise_registration_number"]


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
