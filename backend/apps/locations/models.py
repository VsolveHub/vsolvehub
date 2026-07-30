"""Customer-confirmed addresses and service-area configuration."""

import uuid
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import RegexValidator
from django.db import models

from apps.catalog.models import ServiceVariant

indian_postal_code_validator = RegexValidator(
    regex=r"^\d{6}$",
    message="Enter a valid six-digit Indian postal code.",
    code="invalid_postal_code",
)


def validate_iana_timezone(value: str) -> None:
    try:
        ZoneInfo(value)
    except ZoneInfoNotFoundError as exc:
        raise ValidationError("Enter a valid IANA timezone.", code="invalid_timezone") from exc


class PostalCode(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=12, unique=True, validators=(indian_postal_code_validator,))
    city = models.CharField(max_length=120)
    state = models.CharField(max_length=120)
    country_code = models.CharField(max_length=2, default="IN")
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("code",)

    def __str__(self) -> str:
        return self.code


class ServiceArea(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    slug = models.SlugField(max_length=120, unique=True)
    name = models.CharField(max_length=160)
    timezone = models.CharField(
        max_length=64,
        default="Asia/Kolkata",
        validators=(validate_iana_timezone,),
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("name",)

    def __str__(self) -> str:
        return self.name


class ServiceAreaPostalCode(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    service_area = models.ForeignKey(
        ServiceArea,
        on_delete=models.CASCADE,
        related_name="postal_code_links",
    )
    postal_code = models.ForeignKey(
        PostalCode,
        on_delete=models.PROTECT,
        related_name="service_area_links",
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("service_area", "postal_code"),
                name="locations_unique_area_postal_code",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.service_area_id}: {self.postal_code_id}"


class ServiceAreaService(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    service_area = models.ForeignKey(
        ServiceArea,
        on_delete=models.CASCADE,
        related_name="service_links",
    )
    variant = models.ForeignKey(
        ServiceVariant,
        on_delete=models.PROTECT,
        related_name="service_area_links",
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("service_area", "variant"),
                name="locations_unique_area_service_variant",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.service_area_id}: {self.variant_id}"


class ServiceAreaOperatingWindow(models.Model):
    service_area = models.ForeignKey(
        ServiceArea,
        on_delete=models.CASCADE,
        related_name="operating_windows",
    )
    weekday = models.PositiveSmallIntegerField(help_text="Monday is 0 and Sunday is 6.")
    opens_at = models.TimeField()
    closes_at = models.TimeField()
    closes_next_day = models.BooleanField(default=False)

    class Meta:
        ordering = ("weekday", "opens_at")
        constraints = [
            models.CheckConstraint(
                condition=models.Q(weekday__gte=0, weekday__lte=6),
                name="locations_operating_window_valid_weekday",
            ),
            models.UniqueConstraint(
                fields=("service_area", "weekday", "opens_at"),
                name="locations_unique_area_window_start",
            ),
            models.CheckConstraint(
                condition=~models.Q(opens_at=models.F("closes_at")),
                name="locations_operating_window_nonzero",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.service_area_id}: {self.weekday} {self.opens_at}-{self.closes_at}"


class ServiceAreaOperatingException(models.Model):
    service_area = models.ForeignKey(
        ServiceArea,
        on_delete=models.CASCADE,
        related_name="operating_exceptions",
    )
    date = models.DateField()
    is_closed = models.BooleanField(default=True)
    opens_at = models.TimeField(null=True, blank=True)
    closes_at = models.TimeField(null=True, blank=True)
    closes_next_day = models.BooleanField(default=False)
    reason = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ("date",)
        constraints = [
            models.UniqueConstraint(
                fields=("service_area", "date"),
                name="locations_unique_area_operating_exception_date",
            ),
            models.CheckConstraint(
                condition=models.Q(is_closed=True)
                | (
                    models.Q(opens_at__isnull=False, closes_at__isnull=False)
                    & ~models.Q(opens_at=models.F("closes_at"))
                ),
                name="locations_open_exception_requires_nonzero_window",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.service_area_id}: {self.date}"


class Address(models.Model):
    class Source(models.TextChoices):
        MANUAL = "MANUAL", "Manual"
        REVERSE_GEOCODED = "REVERSE_GEOCODED", "Reverse geocoded"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="addresses",
    )
    label = models.CharField(max_length=60)
    line1 = models.CharField(max_length=200)
    line2 = models.CharField(max_length=200, blank=True)
    landmark = models.CharField(max_length=160, blank=True)
    locality = models.CharField(max_length=160)
    city = models.CharField(max_length=120)
    state = models.CharField(max_length=120)
    postal_code = models.CharField(max_length=12, validators=(indian_postal_code_validator,))
    country_code = models.CharField(max_length=2, default="IN")
    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)
    source = models.CharField(max_length=24, choices=Source.choices, default=Source.MANUAL)
    confirmed_at = models.DateTimeField()
    is_default = models.BooleanField(default=False)
    archived_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-is_default", "-updated_at")
        indexes = [
            models.Index(fields=("customer", "archived_at")),
            models.Index(fields=("postal_code", "archived_at")),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=("customer",),
                condition=models.Q(is_default=True, archived_at__isnull=True),
                name="locations_unique_active_default_address_per_customer",
            ),
            models.CheckConstraint(
                condition=models.Q(latitude__gte=-90, latitude__lte=90),
                name="locations_address_valid_latitude",
            ),
            models.CheckConstraint(
                condition=models.Q(longitude__gte=-180, longitude__lte=180),
                name="locations_address_valid_longitude",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.label}: {self.line1}, {self.postal_code}"
