"""Run a data-subject erasure request against one M2 request (`M2-BE-805`).

## Why this is a command and not an endpoint

Erasure is rare, irreversible, and needs a named human behind it. A management command run from a
bastion, with an operator's own account named on the audit row, is a better fit for all three than a
button — and it does not add a published path to the contract for a workflow no screen consumes yet.
An Operations API surface is a genuine M3 item and is recorded as such in
`Django_Next.js_Plan/M2/frontend-execution-plan.md` §7 rather than half-built here.

It is emphatically **not** a database edit. `04-acceptance-and-cutover.md`'s rule — "a scenario is
failed if Operations must edit the database to recover it" — is honoured: this calls
`retention.handle_erasure_request`, the same domain command an endpoint would call, which takes an
actor, requires a reason, writes a `RequirementTransition` and an `AccessAuditEvent`, and refuses to
touch a single money row.

## What it prints

Everything it removed, and — more importantly — every financial hold that made it keep something.
That list is what the operator relays to the person who asked, so it is printed in full rather than
summarised as a count.
"""

import uuid
from typing import Any

from django.core.management.base import BaseCommand, CommandError, CommandParser

from apps.identity.models import User, UserRole
from apps.requirements import retention
from apps.requirements.exceptions import RequirementDomainError
from apps.requirements.models import CustomerRequirement


class Command(BaseCommand):
    help = (
        "Redact the personal content of one M2 request in response to an erasure request. "
        "Never deletes a money row; reports every financial hold that applied."
    )

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("requirement_id", type=str, help="The request's UUID.")
        parser.add_argument(
            "--actor-phone",
            required=True,
            help=(
                "The Operations user running this, in E.164. Named on the audit row — an erasure "
                "with no accountable human is the one thing this command must not permit."
            ),
        )
        parser.add_argument(
            "--reason",
            required=True,
            help="Why. Recorded on the transition and the access-audit event.",
        )
        parser.add_argument(
            "--holds-only",
            action="store_true",
            help=(
                "Report what is holding this request's records and change nothing. Run this first: "
                "it is the answer to 'what can we actually remove', and it is a pure read."
            ),
        )

    def handle(self, *_args: Any, **options: Any) -> None:
        try:
            requirement_id = uuid.UUID(str(options["requirement_id"]))
        except ValueError as exc:
            raise CommandError("requirement_id must be a UUID.") from exc

        actor = User.objects.filter(phone_number=options["actor_phone"], is_active=True).first()
        if actor is None:
            raise CommandError(f"No active user with phone {options['actor_phone']}.")
        if not UserRole.objects.filter(
            user=actor, role__code="operations", revoked_at__isnull=True
        ).exists():
            # The same role check `IsOperationsUser` makes, minus the session step — there is no
            # session on a CLI. Checked rather than assumed, because "who may erase a Customer's
            # data" is not a question a shell prompt should answer by default.
            raise CommandError(f"{actor.phone_number} does not hold the operations role.")

        if options["holds_only"]:
            self._report_holds(requirement_id=requirement_id)
            return

        try:
            result = retention.handle_erasure_request(
                requirement_id=requirement_id,
                actor=actor,
                reason=str(options["reason"]),
            )
        except RequirementDomainError as exc:
            raise CommandError(exc.message) from exc

        self.stdout.write(self.style.SUCCESS(f"Redacted {result.requirement_id}."))
        self.stdout.write(f"  clarification messages redacted: {result.questions_redacted}")
        self.stdout.write(f"  attachment objects deleted:      {result.attachments_purged}")
        if result.attachments_left_in_storage:
            self.stdout.write(
                self.style.WARNING(
                    f"  attachment objects NOT deleted:  {result.attachments_left_in_storage} "
                    "(storage refused; the daily sweep will retry, and re-running this command "
                    "is safe)"
                )
            )
        self._print_holds(result.holds)

    def _report_holds(self, *, requirement_id: uuid.UUID) -> None:
        requirement = CustomerRequirement.objects.filter(pk=requirement_id).first()
        if requirement is None:
            raise CommandError("No such request.")
        self._print_holds(tuple(retention.financial_holds(requirement)))

    def _print_holds(self, holds: tuple[retention.FinancialHold, ...]) -> None:
        if not holds:
            self.stdout.write("  financial holds: none.")
            return
        self.stdout.write(
            self.style.WARNING(
                f"  financial holds: {len(holds)}. These records are kept and were not removed:"
            )
        )
        for hold in holds:
            self.stdout.write(f"    - [{hold.kind}] {hold.detail}")
