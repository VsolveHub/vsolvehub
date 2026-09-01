"""Mark the last "Painter by the day" A3 booking as PAID / CONFIRMED. Development only.

Deliberately drives the *real* capture path rather than flipping
`PaymentAttempt.status = CAPTURED` by hand. Setting that column alone would
leave the `BookingFee` in `PENDING`, the `RateCardBooking` in `OFFER_HELD` and
no `Engagement` at all -- a booking that looks paid on the payments table and
unpaid everywhere the app actually reads.
`apps.commerce.services.capture.apply_provider_payment` is what a verified
provider webhook calls, and it is what moves the fee to `ACTIVE`, the booking to
`CONFIRMED`, allocates the receipt number and opens the engagement.

So the only thing this fabricates is the one thing genuinely missing in local
dev: a provider saying "captured".

Usage (from backend/):
    python scripts/mark_painter_booking_paid.py
    python scripts/mark_painter_booking_paid.py --dry-run
    python scripts/mark_painter_booking_paid.py --booking-id <uuid>
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

from django.db import transaction  # noqa: E402
from django.db.models import Q  # noqa: E402
from django.utils import timezone  # noqa: E402

from apps.commerce.models import PaymentAttempt  # noqa: E402
from apps.commerce.providers import FakePaymentProvider  # noqa: E402
from apps.commerce.services.base import PAYMENT_FINAL_STATES  # noqa: E402
from apps.commerce.services.capture import apply_provider_payment  # noqa: E402
from apps.commerce.services.payments import create_provider_order  # noqa: E402
from apps.requirements.models import BookingFee, RateCardBooking  # noqa: E402

DEFAULT_SKILL_TERM = "paint"

#: `RateCard.skill` is a FK to `partners.Skill` -- the statutory wage classification, not a
#: free-text trade label -- so the search runs against that model's own text columns.
SKILL_LOOKUPS = ("rate_card__skill__code", "rate_card__skill__name")


def find_booking(*, skill_term: str, booking_id: str | None) -> RateCardBooking:
    """The most recently created A3 booking whose rate card is a painter day-rate."""
    qs = RateCardBooking.objects.select_related(
        "rate_card", "rate_card__skill", "requirement", "requirement__configuration"
    ).order_by("-created_at")

    if booking_id:
        return qs.get(pk=uuid.UUID(booking_id))

    match = Q()
    for lookup in SKILL_LOOKUPS:
        match |= Q(**{f"{lookup}__icontains": skill_term})

    booking = qs.filter(match).first()
    if booking is None:
        raise SystemExit(f"No rate-card booking found matching skill {skill_term!r}.")
    return booking


def describe(booking: RateCardBooking) -> str:
    skill = booking.rate_card.skill.name
    return (
        f"booking={booking.id} skill={skill} status={booking.status} "
        f"headcount={booking.headcount} days={booking.days} "
        f"fee={booking.booking_fee_paise / 100:.2f} INR "
        f"total={booking.total_customer_paise / 100:.2f} INR "
        f"created={booking.created_at:%Y-%m-%d %H:%M}"
    )


@transaction.atomic
def mark_paid(booking: RateCardBooking) -> None:
    """Take the booking's live fee to ACTIVE and the booking to CONFIRMED."""
    booking = RateCardBooking.objects.select_for_update(of=("self",)).get(pk=booking.pk)

    fee = (
        BookingFee.objects.select_for_update(of=("self",))
        .filter(booking=booking)
        .exclude(status__in=BookingFee.NON_BLOCKING_STATUSES)
        .order_by("-created_at")
        .first()
    )
    if fee is None:
        raise SystemExit(
            "This booking has no live BookingFee -- a lead has to accept the job first, "
            "since that is what opens the fee in OFFER_ACCEPTED."
        )
    if fee.status in BookingFee.CHARGED_STATUSES:
        print(f"  Already paid: fee {fee.id} is {fee.status}.")
        _report(fee=fee, booking=booking)
        return

    # `complete_booking_fee` re-checks the hold before confirming the crew, and refunds
    # the money if it has lapsed. Clear it so the capture confirms rather than refunds.
    if booking.status == RateCardBooking.Status.OFFER_HELD and booking.hold_expires_at:
        booking.hold_expires_at = None
        booking.save(update_fields=("hold_expires_at", "updated_at"))
        print("  Cleared the lapsed offer hold so the capture confirms instead of refunding.")

    attempt = fee.payment_attempt
    if attempt is None:
        attempt = PaymentAttempt.objects.create(
            checkout=None,
            purpose=PaymentAttempt.Purpose.M2_BOOKING_FEE,
            idempotency_key=f"manual-paid-{fee.id}",
            provider=FakePaymentProvider.code,
            amount_paise=fee.amount_paise,
            currency="INR",
        )
        fee.status = BookingFee.Status.PENDING
        fee.payment_attempt = attempt
        fee.save(update_fields=("status", "payment_attempt", "updated_at"))
        print(f"  Created payment attempt {attempt.id} for {attempt.amount_paise} paise.")

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

    fee.refresh_from_db()
    booking.refresh_from_db()

    # The capture path is the authority. If it declined to confirm (a state it does not
    # recognise), say so plainly rather than forcing the column behind its back.
    if booking.status != RateCardBooking.Status.CONFIRMED:
        if fee.status in BookingFee.CHARGED_STATUSES:
            booking.status = RateCardBooking.Status.CONFIRMED
            booking.confirmed_at = booking.confirmed_at or timezone.now()
            booking.hold_expires_at = None
            booking.save(update_fields=("status", "confirmed_at", "hold_expires_at", "updated_at"))
            print("  Booking set to CONFIRMED alongside the charged fee.")
        else:
            print(
                f"  WARNING: the capture path left the fee {fee.status} and the booking "
                f"{booking.status}. Not forcing CONFIRMED over it -- read the reason above."
            )

    _report(fee=fee, booking=booking)


def _report(*, fee: BookingFee, booking: RateCardBooking) -> None:
    attempt = fee.payment_attempt
    print(f"  Payment -> {attempt.status if attempt else 'no attempt'}")
    print(f"  Fee     -> {fee.status}")
    print(f"  Booking -> {booking.status}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skill", default=DEFAULT_SKILL_TERM, help="Skill substring to match.")
    parser.add_argument("--booking-id", default=None, help="Target this booking exactly.")
    parser.add_argument("--dry-run", action="store_true", help="Show the target, change nothing.")
    args = parser.parse_args()

    booking = find_booking(skill_term=args.skill, booking_id=args.booking_id)
    print(f"Target: {describe(booking)}")

    for fee in BookingFee.objects.filter(booking=booking).order_by("-created_at"):
        attempt = fee.payment_attempt
        state = (str(attempt.id), attempt.provider, attempt.status) if attempt else None
        print(f"  fee {fee.id} status={fee.status} amount={fee.amount_paise} attempt={state}")

    if args.dry_run:
        print("Dry run: nothing changed.")
        return

    mark_paid(booking)
    print("Done.")


if __name__ == "__main__":
    main()
