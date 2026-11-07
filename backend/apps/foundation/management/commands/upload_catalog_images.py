"""Put the catalogue photos on Cloudflare R2, and point saved links at them.

The photos arrive in the repository (`frontend/apps/customer/public/catalog/`), but every image
is served from the public bucket. Run once wherever `R2_*` names the bucket you mean, with that
folder available:

    python manage.py upload_catalog_images --source /catalog-source --dry-run
    python manage.py upload_catalog_images --source /catalog-source

A file `rentals/drill.jpg` lands at `catalog/rentals/drill.jpg`, so a saved link keeps its path
and only gains the bucket's address. Safe to run again: it replaces the same objects, and a link
already rewritten no longer matches.
"""

import mimetypes
from pathlib import Path
from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError, CommandParser
from django.db import transaction
from django.db.models import CharField, F, Value
from django.db.models.functions import Concat

from apps.foundation.catalog_media import CATALOG_PREFIX
from apps.foundation.management.commands.rehost_public_media import _url_fields
from apps.foundation.storage import r2_client

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".avif"}

#: A month: a browser or Cloudflare may keep it that long, and a changed photo gets a new name.
CACHE_CONTROL = "public, max-age=2592000"


class Command(BaseCommand):
    help = "Upload catalogue photos to the public R2 bucket and repoint saved /catalog/ links."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--source", required=True, help="The folder holding the catalog photos."
        )
        parser.add_argument(
            "--dry-run", action="store_true", help="Report what would change; change nothing."
        )

    def handle(self, *_args: Any, **options: Any) -> None:
        if not settings.R2_PUBLIC_ENABLED:
            raise CommandError("R2 is not configured here, so there is nowhere to upload to.")
        source = Path(options["source"])
        files = sorted(
            path
            for path in source.rglob("*")
            if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES
        )
        if not files:
            raise CommandError(f"No images found under {source}.")

        dry_run = options["dry_run"]
        self.stdout.write(
            f"{'Would upload' if dry_run else 'Uploading'} {len(files)} images to "
            f"{settings.R2_PUBLIC_BUCKET} ({settings.R2_PUBLIC_BASE_URL})."
        )
        if not dry_run:
            self._upload(files, source)
        repointed = self._repoint(dry_run=dry_run)
        self.stdout.write(
            self.style.SUCCESS(
                f"{'Would repoint' if dry_run else 'Repointed'} {repointed} saved links."
            )
        )

    def _upload(self, files: list[Path], source: Path) -> None:
        client = r2_client()
        for path in files:
            key = f"{CATALOG_PREFIX}{path.relative_to(source).as_posix()}".lstrip("/")
            client.put_object(
                Bucket=settings.R2_PUBLIC_BUCKET,
                Key=key,
                Body=path.read_bytes(),
                ContentType=mimetypes.guess_type(path.name)[0] or "application/octet-stream",
                CacheControl=CACHE_CONTROL,
            )
        self.stdout.write(self.style.SUCCESS(f"Uploaded {len(files)} images."))

    def _repoint(self, *, dry_run: bool) -> int:
        """Every saved `/catalog/...` link gains the bucket's address, on any model."""
        total = 0
        with transaction.atomic():
            for model, field in _url_fields():
                rows = model._base_manager.filter(**{f"{field}__startswith": CATALOG_PREFIX})
                count = rows.count()
                if count == 0:
                    continue
                total += count
                self.stdout.write(f"{model._meta.label}.{field}: {count}")
                if not dry_run:
                    rows.update(
                        **{
                            field: Concat(
                                Value(settings.R2_PUBLIC_BASE_URL),
                                F(field),
                                output_field=CharField(),
                            )
                        }
                    )
        return total
