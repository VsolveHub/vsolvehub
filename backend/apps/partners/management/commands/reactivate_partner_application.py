"""Reinstate one suspended Partner application to APPROVED, from the terminal.

## Why this is a command and not a database edit

`transition_partner_application` is the one place SUSPENDED -> APPROVED is allowed to happen: it
checks the mover is not reviewing their own record, requires a reason, appends an immutable
`PartnerApplicationTransition` row, and validates the application is still actually complete before
letting it back to APPROVED. Setting `PartnerApplication.status` directly would skip every one of
those checks and leave no record of who did it or why — the same "Operations must edit the database
to recover it" failure `redact_m2_requirement.py` was written to avoid.

This command exists because Operations' own admin screen already exposes the same action as a
"Reinstate" button (`frontend/apps/admin/features/partner-review/model/decisions.ts`); this is the
terminal equivalent of clicking it, for when acting from a shell is faster than opening the UI.

## What it does not undo

Suspending a Partner ends any open presence session and releases their future confirmed/en-route
bookings for reassignment (`transition_partner_application`, review.py:196-215). Reinstating only
restores eligibility for *new* dispatch — it does not resurrect a booking that was already handed to
another Partner. That is unchanged and out of scope here.
"""

from typing import Any

from django.core.management.base import BaseCommand, CommandError, CommandParser

from apps.identity.models import User, UserRole
from apps.identity.phone import InvalidPhoneNumberError, normalize_phone_number
from apps.partners.exceptions import PartnerDomainError
from apps.partners.models import PartnerApplication, PartnerProfile
from apps.partners.services.review import transition_partner_application


class Command(BaseCommand):
    help = (
        "Move one Partner application from SUSPENDED back to APPROVED. "
        "Requires an Operations actor and a reason; refuses if the application "
        "is not currently SUSPENDED or is no longer complete."
    )

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "partner_phone",
            type=str,
            help="The Partner's phone number (any format normalize_phone_number accepts).",
        )
        parser.add_argument(
            "--actor-phone",
            required=True,
            help=(
                "The Operations user running this, in E.164 or a normalizable format. Named on "
                "the transition audit row — a reinstatement with no accountable human is the one "
                "thing this command must not permit."
            ),
        )
        parser.add_argument(
            "--reason",
            required=True,
            help="Why the suspension is being lifted. Recorded on the transition row.",
        )

    def handle(self, *_args: Any, **options: Any) -> None:
        actor = self._resolve_operations_actor(options["actor_phone"])

        try:
            partner_phone = normalize_phone_number(str(options["partner_phone"]))
        except InvalidPhoneNumberError as exc:
            raise CommandError(str(exc)) from exc

        profile = (
            PartnerProfile.objects.select_related("user", "application")
            .filter(user__phone_number=partner_phone)
            .first()
        )
        if profile is None:
            raise CommandError(f"No partner profile for {partner_phone}.")

        application = getattr(profile, "application", None)
        if application is None:
            raise CommandError(f"{partner_phone} has no application record.")

        if application.status != PartnerApplication.Status.SUSPENDED:
            raise CommandError(
                f"{partner_phone}'s application is {application.status}, not SUSPENDED. "
                "Nothing to reinstate."
            )

        try:
            reinstated = transition_partner_application(
                reviewer=actor,
                application_id=application.id,
                expected_version=application.version,
                target_status=PartnerApplication.Status.APPROVED,
                reason=str(options["reason"]),
            )
        except PartnerDomainError as exc:
            raise CommandError(f"[{exc.code}] {exc.message}") from exc

        self.stdout.write(
            self.style.SUCCESS(
                f"Reinstated {partner_phone} ({reinstated.partner.display_name}) "
                f"to {reinstated.status} — version {reinstated.version}."
            )
        )
        self.stdout.write(
            "Note: this restores eligibility for new offers only. Any booking already released "
            "and reassigned during the suspension was not restored."
        )

    def _resolve_operations_actor(self, raw_phone: str) -> User:
        try:
            actor_phone = normalize_phone_number(str(raw_phone))
        except InvalidPhoneNumberError as exc:
            raise CommandError(str(exc)) from exc

        actor = User.objects.filter(phone_number=actor_phone, is_active=True).first()
        if actor is None:
            raise CommandError(f"No active user with phone {actor_phone}.")
        if not UserRole.objects.filter(
            user=actor, role__code="operations", revoked_at__isnull=True
        ).exists():
            # The same role check `IsOperationsUser` makes, minus the session step — there is no
            # session on a CLI. Checked rather than assumed, because "who may reinstate a Partner"
            # is not a question a shell prompt should answer by default.
            raise CommandError(f"{actor_phone} does not hold the operations role.")
        return actor
