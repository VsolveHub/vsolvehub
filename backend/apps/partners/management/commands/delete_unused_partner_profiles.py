"""Delete Partner (and paired Customer) profiles that never left DRAFT. Dev data only.

## Scope, exactly

For every `PartnerApplication` still `DRAFT` (never submitted) whose `PartnerProfile` has no
other row protecting it — the same check `report_unused_partner_profiles` runs — this deletes,
in order:

1. The application's own history and evidence: `PartnerApplicationTransition`,
   `PartnerDocument`, `PartnerDocumentUpload`. Every DRAFT application has at least one
   transition (its own creation record); these are never a reason an application is "in use",
   only rows that exist *because* the application does.
2. The `PartnerApplication` itself (its `PROTECT` FK to `PartnerProfile` is why it goes before
   the profile).
3. The `PartnerProfile`.
4. The `CustomerProfile` on the same `User`, if one exists.

The `User` row itself is never touched. It is not part of "unused" by this report's definition —
a phone number that only ever got as far as a draft Partner signup, with no customer account, is
still a real account, and this command has no way to know whether Support or Login needs it to
keep existing. Only the rows above are removed.

## Why this is separate from the report

`report_unused_partner_profiles` is read-only by construction — it only calls
`Collector.collect()`, which issues SELECTs, never writes. Deleting is a different, irreversible
action and gets its own command rather than a `--commit` flag bolted onto the report, so running
the report by itself can never be one flag away from a mistake.

## Why no confirmation prompt

This command is for development data only — the owner asked for it to run straight through, no
interactive confirmation. It still refuses (per account, not for the whole run) anything that
does not pass the same safety check the report uses, and anything explicitly excluded by
`--skip-phone` is left completely alone.
"""

from collections import Counter
from typing import Any

from django.core.management.base import BaseCommand, CommandParser
from django.db import transaction
from django.db.models.deletion import Collector, ProtectedError

from apps.identity.models import CustomerProfile
from apps.identity.phone import InvalidPhoneNumberError, normalize_phone_number
from apps.partners.models import (
    PartnerApplication,
    PartnerApplicationTransition,
    PartnerDocument,
    PartnerDocumentUpload,
    PartnerProfile,
)

#: See `report_unused_partner_profiles._APPLICATION_OWNED_MODELS` — kept identical on purpose.
_APPLICATION_OWNED_MODELS = (PartnerApplicationTransition, PartnerDocument, PartnerDocumentUpload)


class Command(BaseCommand):
    help = (
        "Delete PartnerProfile + PartnerApplication + CustomerProfile for every DRAFT "
        "application that has nothing else attached to it. Dev data only — irreversible."
    )

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--skip-phone",
            action="append",
            default=[],
            help=(
                "A phone number to leave untouched even if it would otherwise qualify. "
                "Repeatable."
            ),
        )

    def handle(self, *_args: Any, **options: Any) -> None:
        skip_phones = self._normalize_skip_list(options["skip_phone"])

        drafts = (
            PartnerApplication.objects.select_related("partner", "partner__user")
            .filter(status=PartnerApplication.Status.DRAFT, submitted_at__isnull=True)
            .order_by("created_at")
        )

        deleted = 0
        skipped = 0
        blocked = 0

        for application in drafts:
            profile = application.partner
            user = profile.user
            label = f"{user.phone_number} ({profile.display_name or 'no name set'})"

            if user.phone_number in skip_phones:
                self.stdout.write(f"SKIPPED (excluded): {label}")
                skipped += 1
                continue

            blockers = self._protected_dependents(profile, application)
            if blockers is not None:
                self.stdout.write(
                    self.style.WARNING(
                        f"NOT DELETED (still has {sum(blockers.values())} related row(s) across "
                        f"{len(blockers)} table(s)): {label}"
                    )
                )
                for table, count in sorted(blockers.items()):
                    self.stdout.write(f"    - {table}: {count}")
                blocked += 1
                continue

            with transaction.atomic():
                # Re-checked here, not just trusted from the pass above: the report and this
                # loop both run their own SELECTs, and another process could attach something
                # to this profile in between. PROTECT still refuses the deletes below if that
                # happened — this is what actually enforces safety, the check above is only
                # what decides whether to try.
                PartnerApplicationTransition.objects.filter(application=application).delete()
                PartnerDocument.objects.filter(application=application).delete()
                PartnerDocumentUpload.objects.filter(application=application).delete()
                application.delete()
                profile.delete()
                customer_deleted, _ = CustomerProfile.objects.filter(user_id=user.id).delete()
                had_customer_profile = customer_deleted > 0

            self.stdout.write(
                self.style.SUCCESS(
                    f"DELETED: {label}"
                    + (" (+ CustomerProfile)" if had_customer_profile else "")
                )
            )
            deleted += 1

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                f"Summary: {deleted} deleted, {skipped} skipped, {blocked} left in place "
                "(still referenced elsewhere)."
            )
        )

    def _normalize_skip_list(self, raw_phones: list[str]) -> set[str]:
        normalized = set()
        for raw in raw_phones:
            try:
                normalized.add(normalize_phone_number(raw))
            except InvalidPhoneNumberError as exc:
                raise ValueError(f"--skip-phone {raw!r}: {exc}") from exc
        return normalized

    def _protected_dependents(
        self, profile: PartnerProfile, application: PartnerApplication
    ) -> Counter[str] | None:
        """Same check `report_unused_partner_profiles` runs — see that file for why.

        Kept identical on purpose: a profile this command deletes must be a profile the report
        would have called safe, with no separate rule that could drift out of sync with it.
        """

        blockers: Counter[str] = Counter()

        app_collector = Collector(using="default")
        try:
            app_collector.collect([application])
        except ProtectedError as error:
            unexpected = [
                obj
                for obj in error.protected_objects
                if not isinstance(obj, _APPLICATION_OWNED_MODELS)
            ]
            blockers.update(f"{obj._meta.app_label}.{obj._meta.object_name}" for obj in unexpected)

        profile_collector = Collector(using="default")
        try:
            profile_collector.collect([profile])
        except ProtectedError as error:
            remaining = [obj for obj in error.protected_objects if obj.pk != application.pk]
            blockers.update(f"{obj._meta.app_label}.{obj._meta.object_name}" for obj in remaining)

        return blockers or None
