"""Everything a deploy runs once, before the new web processes start.

Migrations, then the reference data the product cannot work without. That second half used to
be a step someone had to remember: without published Partner agreements no application can be
completed, so a fresh environment that only migrated accepted no Partners at all.

Every step here is idempotent and safe to repeat on every deploy. Demo and test data never
belong here; they have their own `seed_*` commands.
"""

from typing import Any

from django.core.management import call_command
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Run migrations, then sync required reference data. Safe on every deploy."

    def handle(self, *args: Any, **options: Any) -> None:
        del args, options
        call_command("migrate", interactive=False)
        call_command("seed_partner_reference_data")
        call_command("scan_pending_partner_documents")
