"""Put the authored R2 artwork back after a seed run overwrote it with stock photos.

`seed_task_catalog` passes `image_url` inside `update_or_create(defaults=...)`, so every
run replaces whatever the catalog is holding with a URL from `apps.catalog.seed_images`
(Unsplash photographs). That is fine on an empty database and destructive on a real one:
the authored R2 icon set — the 3D icons the customer tiles are designed around — is not
reproducible from code, only from the export.

This command reads `exports/<dump>/catalog_live.json` and writes the R2 URLs back, matching
rows by slug. It only ever *restores from the export*; it never invents a URL.

By default it refuses to blank a row: if the export has no image for a slug, the value in
the database is left alone, so running this can only ever move rows toward the export's
artwork. Pass `--prune` to also clear rows the export says should be empty.

    python manage.py restore_r2_images --dry-run
    python manage.py restore_r2_images
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Final

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.catalog.models import Category, Service, ServiceMedia, Subcategory

#: Repo-relative default. `manage.py` runs from `backend/`, so the export sits one level up.
DEFAULT_EXPORT: Final = Path("../exports/2026-08-27-catalog/catalog_live.json")

R2_HOST: Final = "pub-32e84da8140449ddbc61c13539728e0e.r2.dev"


class Command(BaseCommand):
    help = "Restore authored R2 image URLs from a catalog export."

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument(
            "--export",
            default=str(DEFAULT_EXPORT),
            help=f"Path to catalog_live.json (default: {DEFAULT_EXPORT}).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would change without writing.",
        )
        parser.add_argument(
            "--prune",
            action="store_true",
            help="Also blank rows the export shows as having no image.",
        )

    def handle(self, *_args: object, **options: Any) -> None:
        export_path = Path(options["export"])
        if not export_path.exists():
            raise CommandError(f"Export not found: {export_path.resolve()}")

        payload = json.loads(export_path.read_text(encoding="utf-8"))
        categories = payload.get("categories")
        if not categories:
            raise CommandError(f"{export_path} has no 'categories' — is this a catalog dump?")

        dry_run: bool = options["dry_run"]
        prune: bool = options["prune"]

        # Slug -> URL, flattened out of the nested export.
        category_urls: dict[str, str] = {}
        subcategory_urls: dict[tuple[str, str], str] = {}
        service_urls: dict[tuple[str, str], str] = {}

        for category in categories:
            category_slug = category["slug"]
            category_urls[category_slug] = category.get("image_url") or ""
            for subcategory in category.get("subcategories") or []:
                subcategory_slug = subcategory["slug"]
                subcategory_urls[(category_slug, subcategory_slug)] = (
                    subcategory.get("image_url") or ""
                )
                for service in subcategory.get("services") or []:
                    service_urls[(subcategory_slug, service["slug"])] = (
                        service.get("cover_image_url") or ""
                    )

        with transaction.atomic():
            changed = {
                "category": self._restore_categories(category_urls, prune, dry_run),
                "subcategory": self._restore_subcategories(subcategory_urls, prune, dry_run),
                "service_media": self._restore_service_media(service_urls, prune, dry_run),
            }
            if dry_run:
                transaction.set_rollback(True)

        total = sum(changed.values())
        for label, count in changed.items():
            self.stdout.write(f"  {label:<16} {count} row(s)")
        verb = "would change" if dry_run else "changed"
        self.stdout.write(self.style.SUCCESS(f"{verb} {total} row(s)."))

        if not dry_run and total:
            self._report_remaining()

    def _should_write(self, current: str, wanted: str, prune: bool) -> bool:
        """Restore only moves toward the export; a blank export value needs --prune."""
        if current == wanted:
            return False
        # A blank in the export means "no authored art"; only --prune may act on that.
        return bool(wanted) or prune

    def _restore_categories(
        self, urls: dict[str, str], prune: bool, dry_run: bool
    ) -> int:
        changed = 0
        for category in Category.objects.all():
            wanted = urls.get(category.slug)
            if wanted is None:
                self.stdout.write(
                    self.style.WARNING(f"  category {category.slug!r} not in export — skipped")
                )
                continue
            if not self._should_write(category.image_url, wanted, prune):
                continue
            self.stdout.write(
                f"  category {category.slug}: "
                f"{_summarise(category.image_url)} -> {_summarise(wanted)}"
            )
            if not dry_run:
                category.image_url = wanted
                category.save(update_fields=["image_url"])
            changed += 1
        return changed

    def _restore_subcategories(
        self, urls: dict[tuple[str, str], str], prune: bool, dry_run: bool
    ) -> int:
        changed = 0
        for subcategory in Subcategory.objects.select_related("category"):
            key = (subcategory.category.slug, subcategory.slug)
            wanted = urls.get(key)
            if wanted is None:
                continue
            if not self._should_write(subcategory.image_url, wanted, prune):
                continue
            self.stdout.write(
                f"  subcategory {key[0]}/{key[1]}: "
                f"{_summarise(subcategory.image_url)} -> {_summarise(wanted)}"
            )
            if not dry_run:
                subcategory.image_url = wanted
                subcategory.save(update_fields=["image_url"])
            changed += 1
        return changed

    def _restore_service_media(
        self, urls: dict[tuple[str, str], str], prune: bool, dry_run: bool
    ) -> int:
        """Service covers live on ServiceMedia rows, keyed by (subcategory, service) slug."""
        changed = 0
        services = Service.objects.select_related("subcategory").prefetch_related("media")
        for service in services:
            wanted = urls.get((service.subcategory.slug, service.slug))
            if not wanted:
                continue
            for media in service.media.all():
                if not self._should_write(media.url, wanted, prune):
                    continue
                self.stdout.write(
                    f"  service {service.slug}: {_summarise(media.url)} -> {_summarise(wanted)}"
                )
                if not dry_run:
                    media.url = wanted
                    media.save(update_fields=["url"])
                changed += 1
                # One cover per service; later media rows are gallery images.
                break
        return changed

    def _report_remaining(self) -> None:
        """A restore that leaves stock photos behind has not finished the job."""
        leftovers = (
            Category.objects.filter(image_url__contains="unsplash").count()
            + Subcategory.objects.filter(image_url__contains="unsplash").count()
            + ServiceMedia.objects.filter(url__contains="unsplash").count()
        )
        if leftovers:
            self.stdout.write(
                self.style.WARNING(
                    f"{leftovers} row(s) still point at Unsplash — they are absent from the export."
                )
            )
        else:
            self.stdout.write(self.style.SUCCESS("No Unsplash URLs remain in the catalog."))


def _summarise(url: str) -> str:
    """Readable one-liner for the change log: host plus filename, not a 200-char URL."""
    if not url:
        return "(blank)"
    if R2_HOST in url:
        return f"r2:…/{url.rsplit('/', maxsplit=1)[-1][:40]}"
    if "unsplash" in url:
        return f"unsplash:{url.rsplit('/', maxsplit=1)[-1].split('?', maxsplit=1)[0][:28]}"
    return url[:48]
