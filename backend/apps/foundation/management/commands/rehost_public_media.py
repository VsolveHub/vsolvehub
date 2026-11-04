"""Point saved links at the public bucket's own domain instead of its ``r2.dev`` address.

Cloudflare rate-limits a bucket's ``pub-….r2.dev`` address and advises against it in
production (docs/runbooks/cloudflare-r2-storage.md). Once the bucket has a custom domain and
``R2_PUBLIC_BASE_URL`` names it, new uploads already use it; links saved before that (catalogue
artwork, stay, rental and listing photos) still point at ``r2.dev``. This rewrites them:

    python manage.py rehost_public_media --from https://pub-xxxx.r2.dev            # report only
    python manage.py rehost_public_media --from https://pub-xxxx.r2.dev --apply

It looks at every URL field of every model and changes only the start of a link, and only
where it begins with ``--from``. The new address is ``R2_PUBLIC_BASE_URL`` unless ``--to``
names another. Safe to run again: a rewritten link no longer matches.
"""

from typing import Any
from urllib.parse import urlparse

from django.apps import apps
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError, CommandParser
from django.db import models, transaction
from django.db.models import Value
from django.db.models.functions import Concat, Substr


def _origin(raw: str, flag: str) -> str:
    """``https://host`` with no path or trailing slash; anything else is a typing mistake."""
    url = raw.strip().rstrip("/")
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc or parsed.path or parsed.query:
        raise CommandError(
            f"{flag} must be a bare address like https://media.example.com (got {raw!r})."
        )
    return url


def _url_fields() -> list[tuple[type[models.Model], str]]:
    """Every concrete URL field on every model this project owns the table of."""
    found: list[tuple[type[models.Model], str]] = []
    for model in apps.get_models():
        meta = model._meta
        if not meta.managed or meta.proxy:
            continue
        found.extend(
            (model, field.attname)
            for field in meta.concrete_fields
            if isinstance(field, models.URLField)
        )
    return found


class Command(BaseCommand):
    help = "Repoint saved r2.dev links at the public bucket's custom domain."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--from",
            dest="old",
            required=True,
            help="The address links move away from, e.g. https://pub-xxxx.r2.dev",
        )
        parser.add_argument(
            "--to",
            dest="new",
            default="",
            help="The address links move to (default: R2_PUBLIC_BASE_URL).",
        )
        parser.add_argument(
            "--apply", action="store_true", help="Write the changes; without it, only report."
        )

    def handle(self, *_args: Any, **options: Any) -> None:
        old = _origin(str(options["old"]), "--from")
        new = _origin(str(options["new"]) or str(settings.R2_PUBLIC_BASE_URL), "--to")
        if not new.startswith("https://"):
            raise CommandError(f"The new address must be https (got {new!r}).")
        if old == new:
            raise CommandError("--from and the new address are the same; nothing to move.")
        apply = bool(options["apply"])

        old_prefix = f"{old}/"
        new_prefix = f"{new}/"
        total = 0
        with transaction.atomic():
            for model, field in _url_fields():
                rows = model._default_manager.filter(**{f"{field}__startswith": old_prefix})
                count = rows.count()
                if count == 0:
                    continue
                total += count
                self.stdout.write(f"{model._meta.label}.{field}: {count}")
                if apply:
                    rows.update(
                        **{
                            field: Concat(
                                Value(new_prefix),
                                Substr(field, len(old_prefix) + 1),
                                output_field=models.URLField(),
                            )
                        }
                    )

        if apply:
            self.stdout.write(self.style.SUCCESS(f"{total} link(s) now start with {new_prefix}"))
        else:
            self.stdout.write(
                f"{total} link(s) would move to {new_prefix}. Nothing changed; pass --apply."
            )
