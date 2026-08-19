"""Unstick selections written before choosing a vendor opened the engagement.

## Why these rows exist

Until `select_proposal` began opening the engagement itself, a Customer's choice created a
selection in `PENDING_RECONFIRMATION` and waited for the vendor to press a second button. The
partner app never called that endpoint — `POST /selections/{id}/reconfirm/` had no client anywhere
— so every such selection waited for a confirmation nothing could give, and then expired.

The code path that produced them is gone. The rows are not: they are live selections against real
requirements, and a Customer looking at one is told their professional "has not confirmed yet"
about a job that will never move.

## Why a command rather than a data migration

Resolving one means re-running the domain: the capability check, the capacity check, the quote's
validity, and then opening an engagement with frozen terms and a stage layout. A migration that
called into `apps.requirements.engagements` would be a migration whose behaviour changes every time
that package does — the failure mode migrations exist to avoid. This calls the domain deliberately,
at a moment somebody chose, and reports what it did.

`reconfirm_selection` is used unchanged rather than reimplemented. It already re-runs every check
and is already idempotent on a confirmed selection, so it is exactly the right operation — and
using it means this command cannot drift from the rule the endpoint applied.

## What it will not do

It never forces one through. A vendor whose capability lapsed, whose diary filled, or whose quote
expired while the selection sat there is reported and skipped — those are selections that *should*
be expired instead, and that is the Customer's call to make again rather than this command's to
make for them.
"""

from typing import Any

from django.core.management.base import BaseCommand, CommandParser
from django.utils import timezone

from apps.partners.exceptions import PartnerDomainError
from apps.requirements.engagements import reconfirm_selection
from apps.requirements.exceptions import RequirementDomainError
from apps.requirements.models import ProposalSelection


class Command(BaseCommand):
    help = "Confirm selections stuck awaiting a vendor reconfirmation that no longer exists."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would happen and change nothing.",
        )
        parser.add_argument(
            "--selection",
            dest="selection_id",
            default=None,
            help="Resolve one selection by id, rather than every stuck one.",
        )

    def handle(self, *_args: Any, **options: Any) -> None:
        dry_run = bool(options["dry_run"])
        stuck = ProposalSelection.objects.filter(
            status=ProposalSelection.Status.PENDING_RECONFIRMATION,
        ).select_related("requirement", "partner")
        selection_id = options.get("selection_id")
        if selection_id:
            stuck = stuck.filter(pk=selection_id)

        rows = list(stuck.order_by("created_at"))
        if not rows:
            self.stdout.write("Nothing is waiting on a reconfirmation.")
            return

        self.stdout.write(f"{len(rows)} selection(s) awaiting a reconfirmation that cannot come.")
        confirmed = 0
        skipped = 0

        for selection in rows:
            label = (
                f"  {selection.id} · {selection.partner.display_name} · "
                f"requirement {selection.requirement_id}"
            )
            # Reported rather than resolved. An expired one is a Customer's choice to make again,
            # not a job to open on their behalf two days late.
            if selection.reconfirm_by is not None and selection.reconfirm_by <= timezone.now():
                self.stdout.write(f"{label} — deadline already passed, left alone")
                skipped += 1
                continue

            if dry_run:
                self.stdout.write(f"{label} — would confirm and open the engagement")
                confirmed += 1
                continue

            try:
                engagement = reconfirm_selection(selection_id=selection.id)
            except (RequirementDomainError, PartnerDomainError) as exc:
                # The vendor can no longer take it. Saying which refusal it was is the whole
                # value of the line: it is what tells an operator whether to expire the selection
                # or fix the capability behind it.
                self.stdout.write(f"{label} — skipped: {getattr(exc, 'code', type(exc).__name__)}")
                skipped += 1
                continue

            self.stdout.write(f"{label} — confirmed, engagement {engagement.id}")
            confirmed += 1

        verb = "would be confirmed" if dry_run else "confirmed"
        self.stdout.write(f"{confirmed} {verb}, {skipped} left alone.")
