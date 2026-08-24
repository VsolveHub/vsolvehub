"""Seed clearly non-production Partner density fixtures for M1 tests and local development."""

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.catalog.models import ServiceVariant
from apps.identity.models import User
from apps.locations.models import ServiceArea
from apps.partners.models import (
    PartnerApplication,
    PartnerProfile,
    PartnerService,
    PartnerServiceArea,
    PartnerSkill,
    Skill,
)
from apps.partners.services import _ensure_partner_role

FIXTURE_PHONE_PREFIX = "+9199000000"
PARTNERS_PER_CATEGORY = 3


class Command(BaseCommand):
    help = "Seed non-production M1 Partner density fixtures; never use in production."

    @transaction.atomic
    def handle(self, *_args: object, **_options: object) -> None:
        if not settings.DEBUG:
            raise CommandError("M1 density fixtures are forbidden outside local development.")
        area = ServiceArea.objects.get(slug="hyderabad-500032")
        variants = ServiceVariant.objects.filter(
            booking_archetype=ServiceVariant.BookingArchetype.A1_TASK_VISIT,
            is_active=True,
            service__status="ACTIVE",
        ).select_related("service__subcategory")
        created = 0
        for category_index, category_slug in enumerate(
            variants.values_list("service__subcategory__slug", flat=True)
            .distinct()
            .order_by(
                "service__subcategory__slug",
            ),
            start=1,
        ):
            category_variants = variants.filter(service__subcategory__slug=category_slug)
            skill, _ = Skill.objects.get_or_create(
                code=category_slug,
                defaults={"name": category_slug.replace("-", " ").title(), "is_active": True},
            )
            for partner_index in range(1, PARTNERS_PER_CATEGORY + 1):
                phone_number = f"{FIXTURE_PHONE_PREFIX}{category_index}{partner_index}"
                user, was_created = User.objects.get_or_create(phone_number=phone_number)
                _ensure_partner_role(user)
                partner, _ = PartnerProfile.objects.get_or_create(
                    user=user,
                    defaults={
                        "display_name": f"M1 Fixture {category_slug.title()} {partner_index}"
                    },
                )
                PartnerApplication.objects.update_or_create(
                    partner=partner,
                    defaults={"status": PartnerApplication.Status.APPROVED},
                )
                PartnerSkill.objects.update_or_create(
                    partner=partner,
                    skill=skill,
                    defaults={"is_active": True},
                )
                PartnerServiceArea.objects.update_or_create(
                    partner=partner,
                    service_area=area,
                    defaults={"is_active": True},
                )
                for variant in category_variants:
                    PartnerService.objects.update_or_create(
                        partner=partner,
                        variant=variant,
                        defaults={"is_active": True},
                    )
                created += int(was_created)
        self.stdout.write(self.style.SUCCESS(f"Seeded {created} non-production M1 fixture users."))
