"""Create the reviewed, task-priced M1 Technician catalog configuration."""

from dataclasses import dataclass
from datetime import UTC, datetime, time
from itertools import combinations
from uuid import UUID

from django.core.management.base import BaseCommand, CommandParser
from django.db import transaction

from apps.carts.models import ServiceCompatibilityRule
from apps.catalog.icons import service_icon_for_subcategory
from apps.catalog.models import (
    A1VariantConfiguration,
    Category,
    Service,
    ServicePolicy,
    ServiceVariant,
    Subcategory,
)
from apps.catalog.seed_content import category_for_trade
from apps.locations.models import (
    PostalCode,
    ServiceArea,
    ServiceAreaOperatingWindow,
    ServiceAreaPostalCode,
    ServiceAreaService,
)
from apps.pricing.models import (
    CancellationPolicy,
    CancellationPolicyBand,
    PricingPolicy,
    ServiceRate,
    TaskRate,
)


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
                30,
            ),
            ServiceSeed(
                "Fan Installation",
                "fan-installation",
                "Assembly, mounting and wiring of a new ceiling or wall fan.",
                24_900,
                60,
            ),
            ServiceSeed(
                "Light / LED Installation",
                "light-led-installation",
                "Install LED bulbs, tube lights or decorative panel lights.",
                12_900,
                30,
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
                45,
            ),
            ServiceSeed(
                "WC / Flush Repair",
                "wc-flush-repair",
                "Repair faulty flush valves, syphons or wall-hung flush units.",
                24_900,
                45,
            ),
        ),
    ),
    "carpenter": (
        "Carpenter",
        (
            ServiceSeed(
                "Cupboard / Hinge Repair",
                "cupboard-hinge-repair",
                "Repair cupboard shutters, hinges and drawer channels.",
                29_900,
                60,
            ),
        ),
    ),
}

SEED_RATE_EFFECTIVE_FROM = datetime(2026, 1, 1, tzinfo=UTC)
M1_BASE_DURATION_MINUTES = {
    "switch-socket-repair": 10,
    "fan-installation": 20,
    "light-led-installation": 10,
    "tap-repair": 15,
    "wc-flush-repair": 15,
    "cupboard-hinge-repair": 20,
}
M1_VARIANT_OPERATIONAL_POLICIES: dict[str, dict[str, object]] = {
    "switch-socket-repair": {
        "equipment": ["insulated screwdriver set", "voltage tester", "electrical tape"],
        "unsafe": ["live exposed conductors", "signs of fire damage", "water ingress"],
    },
    "fan-installation": {
        "equipment": ["drill", "ladder", "screwdriver set", "voltage tester"],
        "unsafe": ["unstable ceiling mount", "live exposed conductors", "unsafe access"],
    },
    "light-led-installation": {
        "equipment": ["screwdriver set", "voltage tester", "ladder"],
        "unsafe": ["live exposed conductors", "damaged fitting", "unsafe access"],
    },
    "tap-repair": {
        "equipment": ["adjustable wrench", "pliers", "plumber tape"],
        "unsafe": ["uncontrolled water flow", "corroded pipe failure", "sewage exposure"],
    },
    "wc-flush-repair": {
        "equipment": ["screwdriver set", "adjustable wrench", "pliers"],
        "unsafe": ["sewage exposure", "cracked cistern", "uncontrolled water flow"],
    },
    "cupboard-hinge-repair": {
        "equipment": ["screwdriver set", "drill", "measuring tape"],
        "unsafe": ["structural cabinet instability", "sharp broken hardware", "unsafe access"],
    },
}


class Command(BaseCommand):
    help = "Idempotently seed the Technician catalog."

    @transaction.atomic
    def handle(self, *_args: object, **_options: object) -> None:
        PricingPolicy.objects.update_or_create(
            code="m1-technician",
            version=1,
            defaults={
                # ₹49. Lowered from ₹199 so a genuinely small job can be sold at a genuinely
                # small price — a ₹69 switch repair displayed as ₹199 because of the floor made
                # every cheap variant look identical, which is the opposite of offering them.
                #
                # The floor still exists and still tops up, but at ₹49 no seeded task is below
                # it, so `minimum_visit_topup` no longer appears on any current quote. Keep that
                # in mind before adding a service priced under ₹49: it will be sold at ₹49.
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
        cancellation_bands = (
            (
                "more-than-24-hours",
                "More than 24 hours before your arrival window",
                0,
            ),
            (
                "24-to-2-hours",
                "Between 24 hours and 2 hours before your arrival window",
                4_900,
            ),
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
        for order, (code, condition_text, fee_paise) in enumerate(
            cancellation_bands,
            start=1,
        ):
            CancellationPolicyBand.objects.update_or_create(
                policy=cancellation_policy,
                code=code,
                defaults={
                    "condition_text": condition_text,
                    "fee_paise": fee_paise,
                    "display_order": order,
                },
            )
        Category.objects.update_or_create(
            slug="technician",
            defaults={
                "name": "Technician",
                "description": "Reviewed one-person Technician task visits.",
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
            # `Subcategory` is unique on `(category, slug)`, so pinning these to Technician while
            # `seed_task_catalog` put Electrician and Plumber in categories of their own would
            # not fail — it would create a second subcategory of the same slug here and pull
            # these six services back under it. One shared map decides, and both commands read
            # it.
            category = self._category_for(category_for_trade(subcategory_slug, "technician"))
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
                        "icon_key": service_icon_for_subcategory(subcategory_slug),
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
                        "pricing_strategy": ServiceVariant.PricingStrategy.FIXED,
                        "booking_archetype": ServiceVariant.BookingArchetype.A1_TASK_VISIT,
                        "minimum_duration_minutes": seed.recommended_duration_minutes,
                        "recommended_duration_minutes": seed.recommended_duration_minutes,
                        "duration_increment_minutes": seed.recommended_duration_minutes,
                        "maximum_duration_minutes": seed.recommended_duration_minutes,
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
                TaskRate.objects.update_or_create(
                    variant=variant,
                    task_code=seed.slug,
                    effective_from=SEED_RATE_EFFECTIVE_FROM,
                    defaults={
                        "unit_price_paise": seed.price_paise,
                        "base_duration_minutes": M1_BASE_DURATION_MINUTES[seed.slug],
                        "marginal_duration_minutes": seed.recommended_duration_minutes,
                        "currency": "INR",
                        "effective_to": None,
                        "is_active": True,
                    },
                )
                operational_policy = M1_VARIANT_OPERATIONAL_POLICIES[seed.slug]
                A1VariantConfiguration.objects.update_or_create(
                    variant=variant,
                    version=1,
                    defaults={
                        "status": A1VariantConfiguration.Status.ACTIVE,
                        "scope_schema": {
                            "version": 1,
                            "questions": [
                                {
                                    "code": "quantity",
                                    "kind": "INTEGER",
                                    "required": True,
                                    "minimum": 1,
                                },
                            ],
                        },
                        "required_equipment": operational_policy["equipment"],
                        "out_of_scope_rules": operational_policy["unsafe"],
                        "evidence_policy": {
                            "before_photos_required": True,
                            "after_photos_required": True,
                            "completion_checklist_required": True,
                        },
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

        active_slugs = {
            seed.slug for _, services in TECHNICIAN_CATALOG.values() for seed in services
        }
        self._deactivate_out_of_scope_catalog(active_slugs=active_slugs)
        self._seed_m1_service_area(variants)
        self._seed_m1_compatibility(variants)
        self.stdout.write(
            self.style.SUCCESS(f"Seeded {len(variants)} Technician services deterministically."),
        )

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--with-development-area",
            action="store_true",
            help="Deprecated compatibility flag; M1 always seeds the reviewed Hyderabad area.",
        )

    @staticmethod
    def _category_for(slug: str) -> Category:
        """The category a trade lives in, created if `seed_task_catalog` has not run yet.

        Named from the slug rather than left blank so a database seeded by this command alone
        still reads correctly; `seed_task_catalog` overwrites the copy with the reviewed wording
        when it runs.
        """

        category, _ = Category.objects.get_or_create(
            slug=slug,
            defaults={
                "name": slug.replace("-", " ").title(),
                "icon_key": "wrench",
                "display_order": 1,
                "is_active": True,
            },
        )
        return category

    @staticmethod
    def _deactivate_out_of_scope_catalog(*, active_slugs: set[str]) -> None:
        ServiceVariant.objects.exclude(service__slug__in=active_slugs).update(is_active=False)
        Service.objects.exclude(slug__in=active_slugs).update(status=Service.Status.PAUSED)
        ServiceArea.objects.filter(slug="west-hyderabad-development").update(is_active=False)

    @staticmethod
    def _seed_m1_service_area(variants: list[ServiceVariant]) -> None:
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
            slug="hyderabad-500032",
            defaults={
                "name": "Hyderabad 500032",
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

    @staticmethod
    def _seed_m1_compatibility(variants: list[ServiceVariant]) -> None:
        configured = list(
            ServiceVariant.objects.filter(
                id__in=(variant.id for variant in variants)
            ).select_related("service__subcategory")
        )
        active_pairs: set[tuple[UUID, UUID]] = set()
        for first, second in combinations(configured, 2):
            left, right = sorted((first, second), key=lambda variant: str(variant.id))
            same_trade = left.service.subcategory_id == right.service.subcategory_id
            mode = (
                ServiceCompatibilityRule.Mode.SAME_PARTNER_SEQUENTIAL
                if same_trade
                else ServiceCompatibilityRule.Mode.PARALLEL_ALLOWED
            )
            ServiceCompatibilityRule.objects.update_or_create(
                left_variant=left,
                right_variant=right,
                version=1,
                defaults={
                    "mode": mode,
                    "dependency": ServiceCompatibilityRule.Dependency.NONE,
                    "conditions": {},
                    "effective_from": SEED_RATE_EFFECTIVE_FROM,
                    "effective_to": None,
                    "is_active": True,
                    "lifecycle_status": (ServiceCompatibilityRule.LifecycleStatus.ACTIVE),
                    "change_reason": "Reviewed M1 exact-variant compatibility matrix.",
                    "review_reason": "Approved seed configuration.",
                },
            )
            active_pairs.add((left.id, right.id))
        for rule in ServiceCompatibilityRule.objects.filter(is_active=True):
            if (rule.left_variant_id, rule.right_variant_id) not in active_pairs:
                rule.is_active = False
                rule.lifecycle_status = ServiceCompatibilityRule.LifecycleStatus.RETIRED
                rule.save(update_fields=("is_active", "lifecycle_status"))
