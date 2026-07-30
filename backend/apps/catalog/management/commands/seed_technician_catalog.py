"""Create deterministic Technician catalog and local serviceability configuration."""

from dataclasses import dataclass
from datetime import UTC, datetime, time

from django.core.management.base import BaseCommand, CommandParser
from django.db import transaction

from apps.catalog.models import Category, Service, ServicePolicy, ServiceVariant, Subcategory
from apps.locations.models import (
    PostalCode,
    ServiceArea,
    ServiceAreaOperatingWindow,
    ServiceAreaPostalCode,
    ServiceAreaService,
)
from apps.pricing.models import ServiceRate


@dataclass(frozen=True, slots=True)
class ServiceSeed:
    name: str
    slug: str
    description: str
    price_paise: int
    recommended_duration_minutes: int = 60


TECHNICIAN_CATALOG: dict[str, tuple[str, tuple[ServiceSeed, ...]]] = {
    "electrician": (
        "Electrician",
        (
            ServiceSeed(
                "Switch / Socket Repair",
                "switch-socket-repair",
                "Repair faulty switches, modular boards, or sparking sockets.",
                12_900,
            ),
            ServiceSeed(
                "Fan Installation",
                "fan-installation",
                "Assembly, mounting and wiring of a new ceiling or wall fan.",
                24_900,
            ),
            ServiceSeed(
                "Light / LED Installation",
                "light-led-installation",
                "Install LED bulbs, tube lights or decorative panel lights.",
                12_900,
            ),
            ServiceSeed(
                "Power Issue Check",
                "power-issue-check",
                "Diagnose partial power failure, MCB tripping or fuse issues.",
                19_900,
            ),
            ServiceSeed(
                "Short Circuit Fix",
                "short-circuit-fix",
                "Identify and resolve short circuits and burned wiring.",
                34_900,
                90,
            ),
        ),
    ),
    "plumber": (
        "Plumber",
        (
            ServiceSeed(
                "Tap Repair & Leakage",
                "tap-repair",
                "Fix leaking taps, pipe joints or spindle replacements.",
                19_900,
            ),
            ServiceSeed(
                "Drain Block Removal",
                "drain-block-removal",
                "Clear blocked drains, sinks and bathroom outlets.",
                29_900,
            ),
            ServiceSeed(
                "WC / Flush Repair",
                "wc-flush-repair",
                "Repair faulty flush valves, syphons or wall-hung flush units.",
                24_900,
            ),
            ServiceSeed(
                "Basin / Sink Installation",
                "basin-sink-installation",
                "Install or replace wash basins and kitchen sinks.",
                39_900,
            ),
        ),
    ),
    "carpenter": (
        "Carpenter",
        (
            ServiceSeed(
                "Door / Lock Repair",
                "door-lock-repair",
                "Fix handle locks, latches or key-rotation issues on doors.",
                24_900,
            ),
            ServiceSeed(
                "Furniture Assembly",
                "furniture-assembly",
                "Assemble beds, tables, wardrobes and flat-pack furniture.",
                39_900,
            ),
            ServiceSeed(
                "Cupboard / Hinge Repair",
                "cupboard-hinge-repair",
                "Repair cupboard shutters, hinges and drawer channels.",
                29_900,
            ),
        ),
    ),
    "ac-technician": (
        "AC Technician",
        (
            ServiceSeed(
                "AC General Service",
                "ac-general-service",
                "Standard service with coil cleaning, filter wash and gas-pressure check.",
                59_900,
            ),
            ServiceSeed(
                "AC Deep Cleaning",
                "ac-deep-cleaning",
                "Jet-wash deep cleaning of indoor and outdoor AC units.",
                99_900,
                90,
            ),
            ServiceSeed(
                "Split AC Installation",
                "split-ac-installation",
                "Mounting, piping and commissioning of a split AC.",
                199_900,
                120,
            ),
            ServiceSeed(
                "AC Gas Filling",
                "ac-gas-filling",
                "Top-up or full refill of AC refrigerant gas.",
                299_900,
                90,
            ),
        ),
    ),
    "ro-technician": (
        "RO Technician",
        (
            ServiceSeed(
                "RO Service",
                "ro-service",
                "Periodic RO service with filter check, sanitisation and TDS calibration.",
                39_900,
            ),
            ServiceSeed(
                "RO Filter Replacement",
                "ro-filter-replacement",
                "Replace sediment, carbon or membrane filters.",
                49_900,
            ),
            ServiceSeed(
                "RO Installation",
                "ro-installation",
                "Wall-mount installation and commissioning of a new RO unit.",
                59_900,
            ),
        ),
    ),
}

SEED_RATE_EFFECTIVE_FROM = datetime(2026, 1, 1, tzinfo=UTC)


class Command(BaseCommand):
    help = "Idempotently seed the Technician catalog."

    @transaction.atomic
    def handle(self, *_args: object, **_options: object) -> None:
        category, _ = Category.objects.update_or_create(
            slug="technician",
            defaults={
                "name": "Technician",
                "description": "Electricians, plumbers, AC, RO and repair professionals.",
                "icon_key": "wrench",
                "display_order": 1,
                "is_active": True,
            },
        )
        variants: list[ServiceVariant] = []
        for subcategory_order, (subcategory_slug, definition) in enumerate(
            TECHNICIAN_CATALOG.items(),
            start=1,
        ):
            subcategory_name, services = definition
            subcategory, _ = Subcategory.objects.update_or_create(
                category=category,
                slug=subcategory_slug,
                defaults={
                    "name": subcategory_name,
                    "display_order": subcategory_order,
                    "is_active": True,
                },
            )
            for service_order, seed in enumerate(services, start=1):
                service, _ = Service.objects.update_or_create(
                    slug=seed.slug,
                    defaults={
                        "subcategory": subcategory,
                        "name": seed.name,
                        "short_description": seed.description,
                        "description": seed.description,
                        "status": Service.Status.ACTIVE,
                        "display_order": service_order,
                    },
                )
                variant, _ = ServiceVariant.objects.update_or_create(
                    service=service,
                    code="standard",
                    defaults={
                        "name": "Standard service",
                        "description": seed.description,
                        "pricing_strategy": ServiceVariant.PricingStrategy.DURATION,
                        "minimum_duration_minutes": 60,
                        "recommended_duration_minutes": seed.recommended_duration_minutes,
                        "duration_increment_minutes": 30,
                        "maximum_duration_minutes": 480,
                        "required_skill_code": subcategory_slug,
                        "tax_category_code": "technician-home-service",
                        "is_active": True,
                    },
                )
                ServiceRate.objects.update_or_create(
                    variant=variant,
                    effective_from=SEED_RATE_EFFECTIVE_FROM,
                    defaults={
                        "amount_paise": seed.price_paise,
                        "currency": "INR",
                        "effective_to": None,
                        "is_active": True,
                    },
                )
                ServicePolicy.objects.update_or_create(
                    service=service,
                    kind=ServicePolicy.Kind.GOOD_TO_KNOW,
                    display_order=1,
                    defaults={
                        "text": "Extra time or parts are charged only after your approval.",
                        "is_active": True,
                    },
                )
                variants.append(variant)

        if bool(_options["with_development_area"]):
            self._seed_local_service_area(variants)
        self.stdout.write(
            self.style.SUCCESS(f"Seeded {len(variants)} Technician services deterministically."),
        )

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--with-development-area",
            action="store_true",
            help="Also create the explicit local PIN 500032 serviceability configuration.",
        )

    @staticmethod
    def _seed_local_service_area(variants: list[ServiceVariant]) -> None:
        postal_code, _ = PostalCode.objects.update_or_create(
            code="500032",
            defaults={
                "city": "Hyderabad",
                "state": "Telangana",
                "country_code": "IN",
                "is_active": True,
            },
        )
        area, _ = ServiceArea.objects.update_or_create(
            slug="west-hyderabad-development",
            defaults={
                "name": "West Hyderabad (Development)",
                "timezone": "Asia/Kolkata",
                "is_active": True,
            },
        )
        ServiceAreaPostalCode.objects.get_or_create(service_area=area, postal_code=postal_code)
        for weekday in range(7):
            ServiceAreaOperatingWindow.objects.update_or_create(
                service_area=area,
                weekday=weekday,
                opens_at=time(8, 0),
                defaults={
                    "closes_at": time(20, 0),
                    "closes_next_day": False,
                },
            )
        for variant in variants:
            ServiceAreaService.objects.update_or_create(
                service_area=area,
                variant=variant,
                defaults={"is_active": True},
            )
