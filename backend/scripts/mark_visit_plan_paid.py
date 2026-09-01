"""Mark an A5 visit plan (e.g. "Event lighting & decor") as PAID. Development only.

The A5 twin of `mark_painter_booking_paid.py`, and it exists for the same reason:
`VisitPlan.status = ACTIVE` set by hand is a plan that looks paid on the access
table while its `SiteVisit` rows are still `REQUESTED`, their `Reservation`s
still `TENTATIVE`, the requirement still `MATCHING`, and no receipt number
allocated -- paid in one column and unpaid everywhere the app reads.

So this drives the real path instead:

    create_visit_plan_checkout  -> opens the PaymentAttempt against a held slot
    apply_provider_payment      -> what a verified provider webhook calls
      \\_ complete_visit_plan    -> ACTIVE + receipt, visits SCHEDULED,
                                    reservations CONFIRMED, requirement
                                    VISITS_BOOKED

The one thing fabricated is the one thing genuinely missing in local dev: a
provider saying "captured".

Note `create_visit_plan_checkout` refuses with `m2_visit_plan_not_chargeable`
unless a vendor has actually committed a slot (a `SiteVisit` in `REQUESTED`
with a `plan_share`). That refusal is deliberate -- it is what makes "paid but
nothing happened" unreachable -- so this script reports it rather than routing
around it.

Usage (from backend/):
    python scripts/mark_visit_plan_paid.py
    python scripts/mark_visit_plan_paid.py --dry-run
    python scripts/mark_visit_plan_paid.py --requirement-id <uuid>
    python scripts/mark_visit_plan_paid.py --variant decor
"""

from __future__ import annotations

import argparse
import os
import sys
import uuid
from pathlib import Path

import django

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")
django.setup()

from django.contrib.auth import get_user_model  # noqa: E402
from django.db import transaction  # noqa: E402
from django.db.models import Q  # noqa: E402

from apps.commerce.models import PaymentAttempt  # noqa: E402
from apps.commerce.providers import FakePaymentProvider  # noqa: E402
from apps.commerce.services.base import PAYMENT_FINAL_STATES  # noqa: E402
from apps.commerce.services.capture import apply_provider_payment  # noqa: E402
from apps.commerce.services.payments import create_provider_order  # noqa: E402
from apps.requirements.access.visit_plans import (  # noqa: E402
    create_visit_plan_checkout,
)
from apps.requirements.models import CustomerRequirement, SiteVisit, VisitPlan  # noqa: E402

#: "Event lighting & decor" is variant "Decor, priced per event"; match on the word
#: that survives either naming.
DEFAULT_VARIANT_TERM = "decor"

#: `CustomerRequirement.variant` is a FK to the catalogue variant, so the search runs
#: against that model's own text columns rather than a free-text label on the request.
VARIANT_LOOKUPS = ("variant__code", "variant__name")


def find_requirement(*, variant_term: str, requirement_id: str | None) -> CustomerRequirement:
    """The most recently created A5 requirement whose variant matches."""
    qs = CustomerRequirement.objects.select_related(
        "variant", "configuration", "visit_plan"
    ).order_by("-created_at")

    if requirement_id:
        return qs.get(pk=uuid.UUID(requirement_id))

    match = Q()
    for lookup in VARIANT_LOOKUPS:
        match |= Q(**{f"{lookup}__icontains": variant_term})

    requirement = qs.filter(match).filter(visit_plan__isnull=False).first()
    if requirement is None:
        raise SystemExit(
            f"No requirement with a visit plan found matching variant {variant_term!r}."
        )
    return requirement


def describe(requirement: CustomerRequirement) -> str:
    variant = requirement.variant
    plan = getattr(requirement, "visit_plan", None)
    label = getattr(variant, "name", None) or getattr(variant, "code", None) or "?"
    plan_bit = (
        f"plan={plan.status} price={plan.chargeable_paise / 100:.2f} INR size={plan.plan_size}"
        if plan
        else "plan=<none>"
    )
    return (
        f"requirement={requirement.id} variant={label} status={requirement.status} "
        f"{plan_bit} created={requirement.created_at:%Y-%m-%d %H:%M}"
    )


def _actor(requirement: CustomerRequirement):
    """The customer who owns the request; the checkout records them on the transition."""
    actor = getattr(requirement, "customer", None) or getattr(requirement, "created_by", None)
    if actor is not None:
        return actor
    return get_user_model().objects.filter(is_superuser=True).first()


@transaction.atomic
def mark_paid(requirement: CustomerRequirement) -> None:
    """Take the requirement's visit plan to ACTIVE and its held visits to SCHEDULED."""
    plan = VisitPlan.objects.select_for_update(of=("self",)).get(requirement=requirement)

    if plan.status in VisitPlan.CHARGED_STATUSES:
        print(f"  Already paid: plan {plan.id} is {plan.status}.")
        _report(plan=plan, requirement=requirement)
        return

    if not plan.charge_required:
        print("  Nothing to charge: a credit already covers this plan in full.")
        _report(plan=plan, requirement=requirement)
        return

    attempt = plan.payment_attempt
    if attempt is None:
        # Go through the real checkout so the held-slot precondition is enforced and the
        # transition is recorded, rather than conjuring a PaymentAttempt behind its back.
        plan, attempt = create_visit_plan_checkout(
            requirement_id=requirement.id,
            actor=_actor(requirement),
            idempotency_key=f"manual-paid-{plan.id}",
        )
        print(f"  Opened checkout: attempt {attempt.id} for {attempt.amount_paise} paise.")

    if attempt.status in PAYMENT_FINAL_STATES:
        print(f"  Attempt {attempt.id} is already {attempt.status}.")
    else:
        # This environment is configured for Razorpay; a real gateway attempt cannot be
        # captured from a script, so move it onto the fake provider first.
        if attempt.provider != FakePaymentProvider.code:
            attempt.provider = FakePaymentProvider.code
            attempt.provider_order_id = ""
            attempt.status = PaymentAttempt.Status.PROVIDER_PENDING
            attempt.save(update_fields=("provider", "provider_order_id", "status", "updated_at"))
            print("  Switched the attempt to the fake provider for local capture.")

        if not attempt.provider_order_id:
            attempt = create_provider_order(attempt_id=attempt.id)
        if not attempt.provider_order_id:
            raise SystemExit(f"Attempt {attempt.id} has no provider order; cannot capture.")

        payment = FakePaymentProvider.record_payment(
            provider_payment_id=f"fake_pay_{attempt.id.hex}",
            provider_order_id=attempt.provider_order_id,
            amount_paise=attempt.amount_paise,
            currency=attempt.currency,
        )
        apply_provider_payment(payment=payment, provider_code=FakePaymentProvider.code)
        print(f"  Captured attempt {attempt.id} through the real capture path.")

    plan.refresh_from_db()
    requirement.refresh_from_db()

    # `complete_visit_plan` is the authority. If it declined to activate -- an amount
    # mismatch, an uncaptured attempt -- say so plainly rather than forcing the column.
    if plan.status not in VisitPlan.CHARGED_STATUSES:
        print(
            f"  WARNING: the capture path left the plan {plan.status}"
            f"{f' ({plan.failure_code})' if plan.failure_code else ''}. "
            "Not forcing ACTIVE over it -- read the reason above."
        )

    _report(plan=plan, requirement=requirement)


def _report(*, plan: VisitPlan, requirement: CustomerRequirement) -> None:
    attempt = plan.payment_attempt
    print(f"  Payment     -> {attempt.status if attempt else 'no attempt'}")
    print(f"  Visit plan  -> {plan.status}")
    print(f"  Requirement -> {requirement.status}")
    for visit in SiteVisit.objects.filter(requirement=requirement).order_by("created_at"):
        print(f"  Visit {visit.id} -> {visit.status}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--variant", default=DEFAULT_VARIANT_TERM, help="Variant substring to match."
    )
    parser.add_argument("--requirement-id", default=None, help="Target this requirement exactly.")
    parser.add_argument("--dry-run", action="store_true", help="Show the target, change nothing.")
    args = parser.parse_args()

    requirement = find_requirement(variant_term=args.variant, requirement_id=args.requirement_id)
    print(f"Target: {describe(requirement)}")

    plan = getattr(requirement, "visit_plan", None)
    if plan is None:
        raise SystemExit("This requirement has no visit plan; it is not an A5 request.")

    for share in plan.shares.order_by("position"):
        print(f"  share {share.id} position={share.position} status={share.status}")
    for visit in SiteVisit.objects.filter(requirement=requirement).order_by("created_at"):
        print(f"  visit {visit.id} status={visit.status} share={visit.plan_share_id}")

    if args.dry_run:
        print("Dry run: nothing changed.")
        return

    mark_paid(requirement)
    print("Done.")


if __name__ == "__main__":
    main()
