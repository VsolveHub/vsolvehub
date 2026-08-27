"""Load the shared catalog dump (services + Cloudflare image URLs) into this database.

A teammate clones the repo, migrates, then runs::

    python manage.py load_catalog_dump

The command is idempotent. It keys on slugs (not the exporter's UUIDs), writes Cloudflare
R2 image URLs onto categories / tiles / service covers, and creates the A1 rates plus
configuration a task visit needs to be bookable.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.catalog.icons import ServiceIconKey
from apps.catalog.models import (
    A1VariantConfiguration,
    Category,
    M2VariantConfiguration,
    Service,
    ServiceMedia,
    ServicePolicy,
    ServiceVariant,
    Subcategory,
)
from apps.catalog.seed_content import content_for_trade
from apps.locations.models import ServiceArea, ServiceAreaService
from apps.pricing.models import (
    CancellationPolicy,
    CancellationPolicyBand,
    PricingPolicy,
    ServiceRate,
    TaskRate,
)

SEED_RATE_EFFECTIVE_FROM = datetime(2026, 1, 1, tzinfo=UTC)
A1 = ServiceVariant.BookingArchetype.A1_TASK_VISIT
A3 = ServiceVariant.BookingArchetype.A3_TIME_BLOCK
A5 = ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT


def default_dump_path() -> Path:
    repo = Path(__file__).resolve().parents[5]
    exports = repo / "exports"
    if not exports.is_dir():
        raise CommandError(f"exports folder not found: {exports}")
    dumps = sorted(exports.glob("*/catalog_live.json"))
    if not dumps:
        raise CommandError(f"no catalog_live.json under {exports}")
    return dumps[-1]


class Command(BaseCommand):
    help = "Load exports/*/catalog_live.json (Cloudflare images + services) into this database."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--path",
            type=Path,
            default=None,
            help="Path to catalog_live.json (default: latest exports/*/catalog_live.json)",
        )

    @transaction.atomic
    def handle(self, *_args: object, **options: object) -> None:
        path: Path = options["path"] or default_dump_path()
        if not path.is_file():
            raise CommandError(f"dump not found: {path}")
        catalog = json.loads(path.read_text(encoding="utf-8"))
        self.stdout.write(f"Loading {path}")

        self._ensure_pricing_policy()
        counts = {
            "categories": 0,
            "subcategories": 0,
            "services": 0,
            "variants": 0,
            "covers": 0,
            "a1_rates": 0,
        }
        loaded_variants: list[ServiceVariant] = []

        for category_payload in catalog.get("categories") or []:
            category, _ = Category.objects.update_or_create(
                slug=category_payload["slug"],
                defaults={
                    "name": category_payload["name"],
                    "description": category_payload.get("description") or "",
                    "icon_key": category_payload.get("icon_key") or "",
                    "image_url": category_payload.get("image_url") or "",
                    "display_order": category_payload.get("display_order") or 0,
                    "is_active": bool(category_payload.get("is_active", True)),
                },
            )
            counts["categories"] += 1
            for tile_payload in category_payload.get("subcategories") or []:
                tile, _ = Subcategory.objects.update_or_create(
                    category=category,
                    slug=tile_payload["slug"],
                    defaults={
                        "name": tile_payload["name"],
                        "image_url": tile_payload.get("image_url") or "",
                        "icon_key": tile_payload.get("icon_key") or "",
                        "display_order": tile_payload.get("display_order") or 0,
                        "is_active": bool(tile_payload.get("is_active", True)),
                    },
                )
                counts["subcategories"] += 1
                for service_payload in tile_payload.get("services") or []:
                    service, variants = self._load_service(tile, service_payload)
                    counts["services"] += 1
                    counts["variants"] += len(variants)
                    if any(service.media.filter(kind=ServiceMedia.Kind.COVER, is_active=True)):
                        counts["covers"] += 1
                    counts["a1_rates"] += sum(
                        1
                        for variant in variants
                        if variant.booking_archetype == A1
                        and variant.rates.filter(is_active=True).exists()
                    )
                    loaded_variants.extend(variants)

        self._link_service_area(loaded_variants)
        self.stdout.write(
            self.style.SUCCESS(
                "Loaded "
                f"{counts['categories']} categories, "
                f"{counts['subcategories']} tiles, "
                f"{counts['services']} services, "
                f"{counts['variants']} variants, "
                f"{counts['covers']} covers, "
                f"{counts['a1_rates']} A1 rates "
                f"from {path.as_posix()}"
            )
        )

    def _load_service(
        self, tile: Subcategory, payload: dict
    ) -> tuple[Service, list[ServiceVariant]]:
        icon_key = payload.get("icon_key") or ServiceIconKey.SERVICE
        if icon_key not in ServiceIconKey.values:
            icon_key = ServiceIconKey.SERVICE
        service, _ = Service.objects.update_or_create(
            slug=payload["slug"],
            defaults={
                "subcategory": tile,
                "name": payload["name"],
                "icon_key": icon_key,
                "short_description": (payload.get("short_description") or payload["name"])[:240],
                "description": payload.get("description") or payload.get("short_description") or "",
                "status": payload.get("status") or Service.Status.ACTIVE,
                "display_order": payload.get("display_order") or 0,
            },
        )
        self._seed_cover(service, payload)
        self._seed_policies(service, payload)
        variants: list[ServiceVariant] = []
        for position, option in enumerate(payload.get("variants") or [], start=1):
            variants.append(self._load_variant(service, option, position))
        return service, variants

    def _seed_cover(self, service: Service, payload: dict) -> None:
        media_rows = payload.get("media") or []
        cover_url = payload.get("cover_image_url") or ""
        alt_text = service.name
        if media_rows:
            cover = next(
                (row for row in media_rows if row.get("kind") == ServiceMedia.Kind.COVER),
                media_rows[0],
            )
            cover_url = cover.get("url") or cover_url
            alt_text = (cover.get("alt_text") or alt_text)[:200]
        if not cover_url:
            return
        existing = (
            ServiceMedia.objects.filter(service=service, kind=ServiceMedia.Kind.COVER)
            .order_by("display_order", "id")
            .first()
        )
        if existing is None:
            ServiceMedia.objects.create(
                service=service,
                kind=ServiceMedia.Kind.COVER,
                url=cover_url,
                alt_text=alt_text,
                display_order=1,
                is_active=True,
            )
            return
        existing.url = cover_url
        existing.alt_text = alt_text
        existing.is_active = True
        existing.save(update_fields=("url", "alt_text", "is_active"))

    def _seed_policies(self, service: Service, payload: dict) -> None:
        variants = payload.get("variants") or []
        skill = (variants[0].get("skill_code") if variants else "") or ""
        content = content_for_trade(skill)
        ServicePolicy.objects.filter(service=service).update(is_active=False)
        rows: list[tuple[str, str, str, int]] = [
            (ServicePolicy.Kind.PROCESS, step.title, step.text, order)
            for order, step in enumerate(content.process, start=1)
        ]
        rows += [
            (ServicePolicy.Kind.INCLUDED, "", text, order)
            for order, text in enumerate(content.included, start=1)
        ]
        rows += [
            (ServicePolicy.Kind.EXCLUDED, "", text, order)
            for order, text in enumerate(content.excluded, start=1)
        ]
        rows.append(
            (
                ServicePolicy.Kind.GOOD_TO_KNOW,
                "",
                "Extra time or parts are charged only after your approval.",
                1,
            )
        )
        for kind, title, text, order in rows:
            ServicePolicy.objects.update_or_create(
                service=service,
                kind=kind,
                display_order=order,
                defaults={"title": title, "text": text, "is_active": True},
            )

    def _load_variant(self, service: Service, option: dict, position: int) -> ServiceVariant:
        minutes = int(option.get("work_minutes") or 60) or 60
        min_minutes = int(option.get("min_minutes") or minutes) or minutes
        max_minutes = int(option.get("max_minutes") or minutes) or minutes
        if max_minutes < min_minutes:
            max_minutes = min_minutes
        recommended = min(max(minutes, min_minutes), max_minutes)
        archetype = option.get("booking_archetype") or A1
        variant, _ = ServiceVariant.objects.update_or_create(
            service=service,
            code=option.get("code") or "standard",
            defaults={
                "name": option.get("name") or "Standard service",
                "description": option.get("description") or service.short_description,
                "display_order": position,
                "pricing_strategy": option.get("pricing_strategy")
                or ServiceVariant.PricingStrategy.FIXED,
                "booking_archetype": archetype,
                "minimum_duration_minutes": min_minutes,
                "recommended_duration_minutes": recommended,
                "duration_increment_minutes": min_minutes,
                "maximum_duration_minutes": max_minutes,
                "required_skill_code": option.get("skill_code") or tile_skill_fallback(service),
                "tax_category_code": option.get("tax_category_code") or "technician-home-service",
                "image_url": option.get("image_url") or "",
                "is_active": bool(option.get("is_active", True)),
            },
        )
        price_paise = option.get("price_paise")
        if price_paise:
            self._seed_a1_price(variant, service.slug, int(price_paise), min_minutes, recommended)
        if archetype == A1:
            self._seed_a1_config(variant)
        elif archetype in {A3, A5}:
            self._seed_m2_config(variant)
        return variant

    def _seed_a1_price(
        self,
        variant: ServiceVariant,
        task_code: str,
        price_paise: int,
        setup_minutes: int,
        work_minutes: int,
    ) -> None:
        ServiceRate.objects.update_or_create(
            variant=variant,
            effective_from=SEED_RATE_EFFECTIVE_FROM,
            defaults={
                "amount_paise": price_paise,
                "currency": "INR",
                "effective_to": None,
                "is_active": True,
            },
        )
        TaskRate.objects.update_or_create(
            variant=variant,
            task_code=task_code,
            effective_from=SEED_RATE_EFFECTIVE_FROM,
            defaults={
                "unit_price_paise": price_paise,
                "base_duration_minutes": 0 if setup_minutes == work_minutes else 10,
                "marginal_duration_minutes": work_minutes,
                "currency": "INR",
                "effective_to": None,
                "is_active": True,
            },
        )

    def _seed_a1_config(self, variant: ServiceVariant) -> None:
        A1VariantConfiguration.objects.update_or_create(
            variant=variant,
            version=1,
            defaults={
                "status": A1VariantConfiguration.Status.ACTIVE,
                "scope_schema": {
                    "version": 1,
                    "questions": [
                        {"code": "quantity", "kind": "INTEGER", "required": True, "minimum": 1},
                    ],
                },
                "required_equipment": [],
                "out_of_scope_rules": [],
                "evidence_policy": {
                    "before_photos_required": True,
                    "after_photos_required": True,
                    "completion_checklist_required": True,
                },
            },
        )

    def _seed_m2_config(self, variant: ServiceVariant) -> None:
        M2VariantConfiguration.objects.update_or_create(
            variant=variant,
            version=1,
            defaults={
                "status": M2VariantConfiguration.Status.ACTIVE,
                "question_schema": {"version": 1, "questions": []},
                "registration_question_schema": {},
                "max_quotes": 3,
            },
        )

    def _ensure_pricing_policy(self) -> None:
        PricingPolicy.objects.update_or_create(
            code="m1-technician",
            version=1,
            defaults={
                "minimum_service_subtotal_paise": 4_900,
                "gst_rate_basis_points": 1_800,
                "platform_fee_mode": PricingPolicy.PlatformFeeMode.FIXED,
                "platform_fee_value": 2_900,
                "commission_basis_points": 1_800,
                "commission_floor_paise": 3_000,
                "commission_cap_paise": 50_000,
                "effective_from": SEED_RATE_EFFECTIVE_FROM,
                "effective_to": None,
                "is_active": True,
            },
        )
        cancellation_policy, _ = CancellationPolicy.objects.update_or_create(
            code="m1-scheduled-today",
            version=1,
            defaults={
                "effective_from": SEED_RATE_EFFECTIVE_FROM,
                "effective_to": None,
                "is_active": True,
            },
        )
        bands = (
            ("more-than-24-hours", "More than 24 hours before your arrival window", 0),
            ("24-to-2-hours", "Between 24 hours and 2 hours before your arrival window", 4_900),
            (
                "less-than-2-hours",
                "Less than 2 hours before your arrival window and before verified arrival",
                9_900,
            ),
            (
                "verified-arrival",
                "After verified arrival and the required wait and contact evidence",
                14_900,
            ),
        )
        for order, (code, condition_text, fee_paise) in enumerate(bands, start=1):
            CancellationPolicyBand.objects.update_or_create(
                policy=cancellation_policy,
                code=code,
                defaults={
                    "condition_text": condition_text,
                    "fee_paise": fee_paise,
                    "display_order": order,
                },
            )

    def _link_service_area(self, variants: list[ServiceVariant]) -> None:
        area = ServiceArea.objects.filter(slug="hyderabad-500032").first()
        if area is None:
            self.stdout.write(
                "No service area hyderabad-500032 yet — services are loaded but not offered "
                "in an area. Run seed_technician_catalog first if you need the M1 area."
            )
            return
        for variant in variants:
            ServiceAreaService.objects.update_or_create(
                service_area=area,
                variant=variant,
                defaults={"is_active": True},
            )


def tile_skill_fallback(service: Service) -> str:
    return service.subcategory.slug
