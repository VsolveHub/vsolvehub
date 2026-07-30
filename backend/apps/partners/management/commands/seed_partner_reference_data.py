"""Synchronize normalized Partner skills from the active service catalog."""

from django.core.management.base import BaseCommand, CommandParser
from django.db import transaction

from apps.catalog.models import Service, ServiceVariant
from apps.partners.models import Skill


class Command(BaseCommand):
    help = "Upsert Partner skills required by active service variants."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--deactivate-missing",
            action="store_true",
            help="Deactivate skills no longer referenced by an active service variant.",
        )

    @transaction.atomic
    def handle(self, *_args: object, **options: object) -> None:
        variants = (
            ServiceVariant.objects.filter(
                is_active=True,
                service__status=Service.Status.ACTIVE,
            )
            .exclude(required_skill_code="")
            .select_related("service__subcategory")
            .order_by("required_skill_code", "service__subcategory__name")
        )
        names_by_code: dict[str, str] = {}
        for variant in variants:
            names_by_code.setdefault(
                variant.required_skill_code,
                variant.service.subcategory.name,
            )

        for code, name in names_by_code.items():
            Skill.objects.update_or_create(
                code=code,
                defaults={"name": name, "is_active": True},
            )

        if bool(options["deactivate_missing"]):
            Skill.objects.exclude(code__in=names_by_code).update(is_active=False)

        self.stdout.write(
            self.style.SUCCESS(
                f"Partner reference data synchronized ({len(names_by_code)} active skills).",
            ),
        )
