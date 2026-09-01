"""Seed one event-staff crew day, all the way to a shift-day screen. Development only.

The A3 twin of `mark_painter_booking_paid.py`, and it exists because the crew assignment screen
(`/work/jobs/<engagement>/days/<stage>`) is unreachable without an `Engagement`, and an engagement
is six real commands deep: draft, book at the published rate, dispatch a wave, accept, pay the
booking fee, open the day.

It drives **the real path** at every step rather than writing rows:

    create_draft / update_draft   -> a DRAFT requirement with a men/women mix
    book_at_published_rate        -> RateCardBooking + the first cascade wave
    accept_crew_offer             -> OFFER_HELD, siblings withdrawn, fee held
    apply_provider_payment        -> CONFIRMED, receipt allocated, engagement opened

so the result is a booking the whole app agrees is real, not one that looks paid on the payments
table and unpaid everywhere the app actually reads. The only thing fabricated is the one thing
genuinely missing in local dev: a provider saying "captured".

The mix is deliberately one a crew can get **wrong** while still passing the gate -- three waiter
men, two waiter women, two setup men. `assign_crew` refuses on totals, so five men and two women
in any arrangement is accepted; naming both women onto setup is what makes
`crew_mix.role_fulfilment` warn. That is the case worth being able to see on a screen.

Usage (from backend/):
    python scripts/seed_event_crew_day.py
    python scripts/seed_event_crew_day.py --partner-phone +917030000002
    python scripts/seed_event_crew_day.py --dry-run
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import timedelta
from pathlib import Path

import django

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")
django.setup()

from django.db import transaction  # noqa: E402
from django.utils import timezone  # noqa: E402

from apps.catalog.models import ServiceVariant  # noqa: E402
from apps.commerce.providers import FakePaymentProvider  # noqa: E402
from apps.commerce.services.capture import apply_provider_payment  # noqa: E402
from apps.commerce.services.payments import create_provider_order  # noqa: E402
from apps.identity.models import User  # noqa: E402
from apps.locations.models import Address  # noqa: E402
from apps.locations.services import check_serviceability  # noqa: E402
from apps.partners.models import PartnerProfile  # noqa: E402
from apps.requirements import (  # noqa: E402
    booking_fees,
    crew_dispatch,
    crew_mix,
    matching,
    services,
)
from apps.requirements.models import (  # noqa: E402
    CustomerRequirement,
    Engagement,
    EngagementStage,
    RateCardBooking,
    VendorInvitation,
)

SERVICE_SLUG = "event-staff-by-the-day"
DEFAULT_PARTNER_PHONE = "+917030000002"

#: Two waiter men, two waiter women, one setup man. Five people, three men, two women.
#:
#: Sized to what the seeded demo vendor can actually field -- a six-person roster of three men and
#: three women. Ask for seven people or five men and the dispatch gates refuse before anybody is
#: invited, which is correct and useless for looking at a screen.
#:
#: The arrangement is still one a crew can get **wrong** while passing: `assign_crew` refuses on
#: totals, so three men and two women in any arrangement is accepted, and naming all three men
#: onto waiting is what makes `crew_mix.role_fulfilment` warn. That is the case worth seeing.
MIX = {
    "event_type": "wedding",
    "guest_band": "50-100",
    "service_style": "sit-down",
    "waiter_count": 4,
    "waiter_men": 2,
    "waiter_women": 2,
    "setup_count": 1,
    "setup_men": 1,
    "setup_women": 0,
    "worker_count": 5,
    "duration_days": 1,
    "dress_code": "black-white",
    "staff_meal_provided": True,
}


def _partner(phone: str) -> PartnerProfile:
    user = User.objects.filter(phone_number=phone).first()
    if user is None:
        raise SystemExit(f"No user with phone {phone}. Run seed_m2_demo first.")
    profile = PartnerProfile.objects.filter(user=user).first()
    if profile is None:
        raise SystemExit(f"{phone} has no partner profile.")
    return profile


def _customer_address_area(variant: ServiceVariant) -> tuple[User, Address, object]:
    """A customer, a saved address, and the area that actually covers it for this variant.

    The area comes from `check_serviceability` -- the same call the A1 cart and the requirement
    view both make -- rather than from a column on the address, so this script cannot disagree
    with the app about which area covers a postal code.
    """
    for address in (
        Address.objects.filter(archived_at__isnull=True)
        .select_related("customer")
        .order_by("-created_at")[:25]
    ):
        decision = check_serviceability(postal_code=address.postal_code, variant_id=variant.id)
        if decision.service_area is not None:
            return address.customer, address, decision.service_area
    raise SystemExit(
        "No saved address falls in a service area that covers event staff. "
        "Run seed_m2_demo, or add an address in Hyderabad 500032."
    )


def _pay(*, requirement: object, actor: User) -> None:
    """Open the Customer's booking-fee checkout, then capture it.

    Two real commands, not one: `hold_booking_fee` put the fee in `PENDING` at accept and a
    `PaymentAttempt` does not exist until the Customer opens checkout. Skipping the first and
    writing the attempt by hand would produce a fee nothing had ever quoted.
    """
    _fee, attempt = booking_fees.create_booking_fee_checkout(
        requirement_id=requirement.id,
        actor=actor,
        idempotency_key=f"seed-crew-day-{requirement.id}",
    )
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


def _explain_empty_wave(*, requirement: object, partner: PartnerProfile) -> None:
    """Say which rule kept this lead out, then close the requirement it stranded.

    Without this the script fails with "not in the first wave", which is true and tells nobody
    anything: the eleven exclusions are all invisible from outside `evaluate_candidates`. It also
    leaves a MATCHING requirement nobody will ever answer, so the failure path closes it -- a
    script that litters on the way out is a script people stop running.
    """
    invited = VendorInvitation.objects.filter(requirement=requirement).select_related(
        "partner__user"
    )
    print()
    print(
        f"No offer reached {partner.display_name}. Invited: "
        f"{[i.partner.user.phone_number for i in invited] or 'nobody'}"
    )
    for candidate in matching.evaluate_candidates(requirement=requirement).evaluations:
        if candidate.partner.id != partner.id:
            continue
        print(
            f"  {partner.display_name} excluded by: {', '.join(candidate.exclusions) or 'nothing'}"
        )
    roster = crew_mix.roster_mix(partner)
    men, women = crew_mix.requested_mix(requirement)
    print(
        f"  roster: {roster.men} men, {roster.women} women, {roster.unknown} unrecorded "
        f"({roster.total} people)"
    )
    print(f"  wanted: {men} men, {women} women ({requirement.answers.get('worker_count')} people)")

    services.close_requirement(
        requirement_id=requirement.id,
        status=CustomerRequirement.Status.CLOSED_CANCELLED,
        reason_code="seed_script_no_candidates",
        actor=requirement.customer,
    )
    raise SystemExit("Closed the stranded requirement. Adjust MIX, or add crew to the roster.")


def _shift_day_url(engagement: Engagement) -> str | None:
    stage = EngagementStage.objects.filter(engagement=engagement).order_by("position").first()
    if stage is None:
        return None
    return f"http://localhost:3001/work/jobs/{engagement.id}/days/{stage.id}"


def _open(engagement: Engagement) -> None:
    url = _shift_day_url(engagement)
    if url is None:
        raise SystemExit("The engagement opened with no shift-day. Nothing to look at.")
    print()
    print("Done. Open this as the partner:")
    print(f"  {url}")


def _resume_in_flight(*, partner: PartnerProfile) -> Engagement | None:
    """Finish, or point at, a crew day this script already started for this lead.

    Returns the engagement when there is one to look at, and `None` when there is nothing in
    flight and a fresh booking is the right move.
    """
    booking = (
        RateCardBooking.objects.select_related("requirement", "requirement__customer")
        .filter(
            requirement__variant__service__slug=SERVICE_SLUG,
            accepted_invitation__partner=partner,
            status__in=(
                RateCardBooking.Status.OFFER_HELD,
                RateCardBooking.Status.CONFIRMED,
            ),
        )
        .order_by("-created_at")
        .first()
    )
    if booking is None:
        return None

    if booking.status == RateCardBooking.Status.OFFER_HELD:
        print(f"Resuming a held offer from an earlier run ({str(booking.id)[:8]}); paying it.")
        _pay(requirement=booking.requirement, actor=booking.requirement.customer)

    engagement = Engagement.objects.filter(requirement=booking.requirement).first()
    if engagement is None:
        raise SystemExit("The booking is paid but no engagement opened. Check the outbox worker.")
    return engagement


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--partner-phone", default=DEFAULT_PARTNER_PHONE)
    #: Far enough out that the demo vendor's other bookings do not read as `capacity_committed`.
    parser.add_argument("--days-ahead", type=int, default=9)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    partner = _partner(args.partner_phone)
    variant = ServiceVariant.objects.select_related("service").get(service__slug=SERVICE_SLUG)
    customer, address, service_area = _customer_address_area(variant)

    print(f"Customer : {customer.phone_number}")
    print(f"Partner  : {partner.display_name} ({args.partner_phone})")
    print(f"Address  : {address.line1}, {service_area}")
    # Derived, not written twice: a summary line that disagrees with the MIX it describes is
    # exactly the kind of thing this whole feature exists to stop.
    print(
        f"Mix      : {MIX['waiter_men']} waiter men + {MIX['waiter_women']} waiter women"
        f" + {MIX['setup_men']} setup men  ({MIX['worker_count']} people)"
    )
    print(f"Date     : {args.days_ahead} days out")

    if args.dry_run:
        print("Dry run: nothing changed.")
        return

    # Resume before creating. A run that got as far as an accepted offer and then failed leaves
    # the lead holding it, which reads as `capacity_committed` on the next attempt -- so a script
    # that always started fresh would lock itself out of its own vendor after one bad run.
    resumed = _resume_in_flight(partner=partner)
    if resumed is not None:
        _open(resumed)
        return

    with transaction.atomic():
        requirement = services.create_draft(customer=customer, variant=variant, answers=MIX)
        services.update_draft(
            requirement=requirement,
            answers=MIX,
            address=address,
            service_area=service_area,
            requested_start=timezone.now() + timedelta(days=args.days_ahead),
        )
        crew_dispatch.book_at_published_rate(
            requirement_id=requirement.id, actor=customer, allow_duplicate=True
        )

    invitation = VendorInvitation.objects.filter(
        requirement=requirement, partner=partner, status=VendorInvitation.Status.INVITED
    ).first()
    if invitation is None:
        _explain_empty_wave(requirement=requirement, partner=partner)

    crew_dispatch.accept_crew_offer(invitation_id=invitation.id)
    _pay(requirement=requirement, actor=customer)

    _open(Engagement.objects.get(requirement=requirement))


if __name__ == "__main__":
    main()
