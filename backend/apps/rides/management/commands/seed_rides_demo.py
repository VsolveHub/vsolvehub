"""Load placeholder Rides data so the rider flow can be tried by hand. Development only.

Two guards, copied from `seed_m2_demo`: `settings.DEBUG` must be true, and
`--i-understand-this-is-dev-only` must be passed even then.

## Placeholders

Every rate below is a **placeholder** standing in for Operations' real prices, which they set
through `operations/rides/rate-cards/`. They are not anyone's decision.

An area and vehicle type that already has an active card is left alone, so running this again,
or after Operations has set a price, never overwrites a real one.

It also writes two PLACEHOLDER pass plans (a ₹0 launch pass and a ₹49 day pass), and three
approved test captains (bike, auto, cab) with an active launch pass on +91 90000 777 01-03.
"""

from datetime import timedelta
from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError, CommandParser
from django.db import transaction
from django.utils import timezone

from apps.identity.models import Role, User, UserRole
from apps.locations.models import ServiceArea
from apps.partners.models import PartnerApplication, PartnerProfile
from apps.rides.models import (
    CaptainPass,
    CaptainPassPlan,
    CaptainVehicle,
    RideRateCard,
    VehicleType,
)

AREA_SLUG = "hyderabad-500032"

#: Three approved test captains, one per vehicle, on their own reserved number block
#: (+91 90000 777 0x). Phone, name, vehicle, plate. Not put on duty: tests do that.
TEST_CAPTAINS: tuple[tuple[str, str, str, str], ...] = (
    ("+919000077701", "Test Captain Bike", VehicleType.BIKE, "TS09TC0001"),
    ("+919000077702", "Test Captain Auto", VehicleType.AUTO, "TS09TC0002"),
    ("+919000077703", "Test Captain Cab", VehicleType.CAB, "TS09TC0003"),
)
TEST_VEHICLE_MODELS: dict[str, str] = {
    VehicleType.BIKE: "Honda Shine",
    VehicleType.AUTO: "Bajaj RE",
    VehicleType.CAB: "Maruti Dzire",
}

#: PLACEHOLDER pass plans: the brief's "two pass plans (one ₹0)". Operations sets real ones.
PLACEHOLDER_PASS_PLANS: tuple[dict[str, object], ...] = (
    {"code": "launch-pass", "name": "Launch pass", "price_paise": 0, "duration_hours": 24},
    {"code": "day-pass", "name": "Day pass", "price_paise": 4900, "duration_hours": 24},
)

#: PLACEHOLDER rates in paise. Base, included metres, per km, per minute, minimum,
#: free waiting minutes, waiting per minute.
PLACEHOLDER_RATES: dict[str, dict[str, int]] = {
    VehicleType.BIKE: {
        "base_fare_paise": 1500,
        "included_distance_m": 1000,
        "per_km_paise": 600,
        "per_minute_paise": 100,
        "minimum_fare_paise": 2500,
        "free_waiting_minutes": 3,
        "waiting_per_minute_paise": 100,
    },
    VehicleType.AUTO: {
        "base_fare_paise": 3000,
        "included_distance_m": 1500,
        "per_km_paise": 1300,
        "per_minute_paise": 150,
        "minimum_fare_paise": 3500,
        "free_waiting_minutes": 3,
        "waiting_per_minute_paise": 150,
    },
    VehicleType.CAB: {
        "base_fare_paise": 5000,
        "included_distance_m": 2000,
        "per_km_paise": 1600,
        "per_minute_paise": 200,
        "minimum_fare_paise": 8000,
        "free_waiting_minutes": 3,
        "waiting_per_minute_paise": 200,
    },
}


class Command(BaseCommand):
    help = (
        "Load PLACEHOLDER Rides rate cards (bike, auto, cab) for hyderabad-500032 and two "
        "pass plans. Development only."
    )

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--i-understand-this-is-dev-only",
            action="store_true",
            dest="acknowledged",
            help="Required. Every price this command writes is a placeholder.",
        )

    def handle(self, *args: Any, **options: Any) -> None:
        if not settings.DEBUG:
            raise CommandError(
                "seed_rides_demo writes placeholder prices and is forbidden outside local "
                "development. settings.DEBUG is False."
            )
        if not options["acknowledged"]:
            raise CommandError(
                "Pass --i-understand-this-is-dev-only. Every rate this command writes is a "
                "placeholder for Operations' real prices."
            )

        area = ServiceArea.objects.filter(slug=AREA_SLUG).first()
        if area is None:
            raise CommandError(
                f"Service area {AREA_SLUG} does not exist. Run seed_m2_demo first, which creates it."
            )

        with transaction.atomic():
            for vehicle_type, rates in PLACEHOLDER_RATES.items():
                if RideRateCard.objects.filter(
                    service_area=area, vehicle_type=vehicle_type, is_active=True
                ).exists():
                    self.stdout.write(f"{vehicle_type}: active card already exists, left alone.")
                    continue
                last = (
                    RideRateCard.objects.filter(service_area=area, vehicle_type=vehicle_type)
                    .order_by("-version")
                    .first()
                )
                RideRateCard.objects.create(
                    service_area=area,
                    vehicle_type=vehicle_type,
                    version=(last.version + 1) if last else 1,
                    **rates,
                )
                self.stdout.write(f"{vehicle_type}: PLACEHOLDER rate card created.")

            for plan in PLACEHOLDER_PASS_PLANS:
                code = str(plan["code"])
                _, created = CaptainPassPlan.objects.get_or_create(
                    code=code, defaults={k: v for k, v in plan.items() if k != "code"}
                )
                state = "PLACEHOLDER pass plan created" if created else "already exists, left alone"
                self.stdout.write(f"{code}: {state}.")

            launch = CaptainPassPlan.objects.get(code="launch-pass")
            for phone, name, vehicle_type, plate in TEST_CAPTAINS:
                self._seed_captain(phone, name, vehicle_type, plate, launch)

        self.stdout.write(self.style.SUCCESS("Rides placeholder data is ready."))

    def _seed_captain(
        self, phone: str, name: str, vehicle_type: str, plate: str, plan: CaptainPassPlan
    ) -> None:
        """An approved captain with a vehicle and an active pass, ready to go on duty.

        Written directly, as `seed_trade_partners` does, so the `partner` role is granted here:
        the onboarding path that normally grants it is skipped.
        """
        user, _ = User.objects.update_or_create(phone_number=phone, defaults={"full_name": name})
        role, _ = Role.objects.get_or_create(
            code="partner", defaults={"name": "Partner", "is_system": True}
        )
        UserRole.objects.update_or_create(user=user, role=role, defaults={"revoked_at": None})
        partner, _ = PartnerProfile.objects.update_or_create(
            user=user, defaults={"display_name": name}
        )
        PartnerApplication.objects.update_or_create(
            partner=partner,
            defaults={
                "track": PartnerApplication.Track.RIDE_CAPTAIN,
                "status": PartnerApplication.Status.APPROVED,
            },
        )
        CaptainVehicle.objects.update_or_create(
            partner=partner,
            defaults={
                "vehicle_type": vehicle_type,
                "registration_number": plate,
                "make_model": TEST_VEHICLE_MODELS[vehicle_type],
                "colour": "White",
            },
        )
        now = timezone.now()
        if not CaptainPass.objects.filter(
            partner=partner, status=CaptainPass.Status.ACTIVE, ends_at__gt=now
        ).exists():
            CaptainPass.objects.filter(partner=partner, status=CaptainPass.Status.ACTIVE).update(
                status=CaptainPass.Status.EXPIRED, updated_at=now
            )
            CaptainPass.objects.create(
                partner=partner,
                plan=plan,
                status=CaptainPass.Status.ACTIVE,
                starts_at=now,
                ends_at=now + timedelta(hours=plan.duration_hours),
            )
        self.stdout.write(f"{name} ({phone}): approved, {vehicle_type}, active pass.")
