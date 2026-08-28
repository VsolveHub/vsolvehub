"""Report which Partner profiles look genuinely unused — read-only, deletes nothing.

## What "unused" means here

Strictly: `PartnerApplication.status == DRAFT`. A partner who started signing up and never
submitted. `submitted_at IS NULL` is checked too as a cheap second confirmation — every DRAFT row
should already satisfy it, so a DRAFT row with a `submitted_at` set would mean the status machine
moved in a way this report's assumptions don't expect, and that mismatch is worth surfacing rather
than silently trusting one field over the other.

## Why this is a report and not a delete command

Every FK to `PartnerProfile` in this codebase — capabilities, bookings, payouts, standing,
cases, crew — is `on_delete=PROTECT` except four (`PartnerAvailabilityRule`,
`PartnerAvailabilityException`, `PartnerLocation`, `PartnerRateBookItem`, all `CASCADE`). A
DRAFT signup that never went anywhere is the one case where deleting the profile should touch
nothing else; anything else attached to it means someone or something has already relied on
it, and this codebase's own PROTECT graph is the thing refusing to let that be an accident.
Rather than re-deriving that graph by hand, this uses Django's own deletion `Collector` — the
exact mechanism `.delete()` would run — to ask "what would actually be touched" without
touching anything, so the report can never fall behind if a future migration adds a new FK to
`PartnerProfile` elsewhere in the codebase.

Also flags — separately, since it is not a deletion blocker but a real fact worth knowing
before anyone deletes anything — whether the same `User` also holds a `CustomerProfile`.
Deleting the `PartnerProfile` never touches that row (it is an independent one-to-one off
`User`), but a human reading "delete this profile" should still be told that phone number is
also a live customer account.
"""

from collections import Counter
from datetime import timedelta
from typing import Any

from django.core.management.base import BaseCommand, CommandParser
from django.db.models.deletion import Collector, ProtectedError
from django.utils import timezone

from apps.identity.models import CustomerProfile
from apps.partners.models import (
    PartnerApplication,
    PartnerApplicationTransition,
    PartnerDocument,
    PartnerDocumentUpload,
    PartnerProfile,
)


class Command(BaseCommand):
    help = (
        "List Partner profiles whose application has never left DRAFT, and for each, exactly "
        "what a deletion would touch. Read-only: makes no database changes."
    )

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--older-than-days",
            type=int,
            default=0,
            help=(
                "Only report DRAFT applications created at least this many days ago. "
                "Default 0: report every DRAFT row regardless of age."
            ),
        )

    def handle(self, *_args: Any, **options: Any) -> None:
        cutoff = timezone.now() - timedelta(days=int(options["older_than_days"]))

        drafts = (
            PartnerApplication.objects.select_related("partner", "partner__user")
            .filter(status=PartnerApplication.Status.DRAFT, created_at__lte=cutoff)
            .order_by("created_at")
        )

        total = drafts.count()
        if total == 0:
            self.stdout.write("No DRAFT applications found.")
            return

        self.stdout.write(f"{total} DRAFT application(s) found.\n")

        safe_count = 0
        blocked_count = 0

        for application in drafts:
            profile = application.partner
            user = profile.user
            age = timezone.now() - application.created_at

            self.stdout.write(
                self.style.MIGRATE_HEADING(
                    f"{user.phone_number}  ({profile.display_name or 'no name set'})"
                )
            )
            self.stdout.write(f"  partner_profile_id: {profile.id}")
            self.stdout.write(f"  application_id:     {application.id}")
            self.stdout.write(
                f"  created_at:         {application.created_at.isoformat()}"
                f"  ({age.days} day(s) ago)"
            )

            if application.submitted_at is not None:
                self.stdout.write(
                    self.style.WARNING(
                        "  WARNING: status is DRAFT but submitted_at is set — this row does not "
                        "match this report's assumptions about DRAFT. Skipping automatic "
                        "classification; look at it by hand."
                    )
                )
                self.stdout.write("")
                continue

            has_customer_profile = CustomerProfile.objects.filter(user_id=user.id).exists()
            if has_customer_profile:
                self.stdout.write(
                    self.style.WARNING(
                        "  NOTE: this phone number also has a CustomerProfile. Deleting the "
                        "PartnerProfile does not touch it either way, since they are independent "
                        "records off the same User — but the account is not fully \"unused\"."
                    )
                )

            blockers = self._protected_dependents(profile, application)

            if blockers is None:
                safe_count += 1
                self.stdout.write(
                    self.style.SUCCESS("  SAFE TO DELETE: nothing else references this profile.")
                )
            else:
                blocked_count += 1
                total_blocking = sum(blockers.values())
                self.stdout.write(
                    self.style.ERROR(
                        f"  NOT deletable as-is: {total_blocking} related row(s) across "
                        f"{len(blockers)} table(s) protect this profile from deletion:"
                    )
                )
                for label, count in sorted(blockers.items()):
                    self.stdout.write(f"    - {label}: {count}")

            self.stdout.write("")

        self.stdout.write(
            self.style.SUCCESS(
                f"Summary: {safe_count} safe to delete, {blocked_count} blocked by other data."
            )
        )
        if blocked_count:
            self.stdout.write(
                'Blocked profiles are not "unused" in the sense this report checks for — '
                "something else in the system already depends on them. Deleting those needs a "
                "separate, specific decision about the dependent rows, not a bulk cleanup."
            )

    #: Rows that only ever exist *because of* one specific `PartnerApplication` — its transition
    #: history and any uploaded documents — and so are always part of deleting that application,
    #: never an external blocker on it. Every DRAFT application has at least one transition (its
    #: own creation record), so without this the check would call every application "blocked" by
    #: its own history.
    _APPLICATION_OWNED_MODELS = (
        PartnerApplicationTransition,
        PartnerDocument,
        PartnerDocumentUpload,
    )

    def _protected_dependents(
        self, profile: PartnerProfile, application: PartnerApplication
    ) -> Counter[str] | None:
        """What blocks deleting this profile and its application, or `None` if nothing does.

        `Collector.collect()` runs the same walk `.delete()` would, purely as SELECTs — it never
        issues a write — and raises `ProtectedError` the moment it finds a `PROTECT` relation
        with rows still pointing at the object being collected. It checks two things, matching
        the order the real delete has to run in:

        1. Does `application` have anything protecting *it*, other than rows that belong to it by
           definition (`_APPLICATION_OWNED_MODELS`, all FK'd straight to this one application and
           deleted alongside it — never a reason to call the application undeletable)?
        2. Does `profile` have anything protecting it, other than `application` itself (its
           `PROTECT` FK always shows up here since `related_objects()` queries fresh regardless of
           what else is being deleted in the same operation — it is the one expected reference,
           not an external blocker)?
        """

        blockers: Counter[str] = Counter()

        app_collector = Collector(using="default")
        try:
            app_collector.collect([application])
        except ProtectedError as error:
            unexpected = [
                obj
                for obj in error.protected_objects
                if not isinstance(obj, self._APPLICATION_OWNED_MODELS)
            ]
            blockers.update(f"{obj._meta.app_label}.{obj._meta.object_name}" for obj in unexpected)

        profile_collector = Collector(using="default")
        try:
            profile_collector.collect([profile])
        except ProtectedError as error:
            remaining = [obj for obj in error.protected_objects if obj.pk != application.pk]
            blockers.update(f"{obj._meta.app_label}.{obj._meta.object_name}" for obj in remaining)

        return blockers or None
