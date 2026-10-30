"""Seed a wide, non-production spread of data across every Operations console.

`seed_technician_catalog`, `seed_partner_reference_data`, `seed_test_partner` and
`seed_m1_density_fixtures` each seed one slice of the system: catalog, reference data, one
eligible Partner, and Partner density. None of them puts a Booking through its lifecycle, so
none of them leaves anything in the consoles that actually *depend* on lifecycle state — the
Cases queue, the Payout runs list, the Kill switches board, and the Partner review queue are
all empty after running them.

This command drives real Booking Groups through the real command layer (cart, checkout, fake
payment capture, dispatch, completion, disputes, cancellation, refunds, settlement and payout
batches) so those consoles have rows to look at. Two shortcuts are taken deliberately and noted
where they happen:

* new demo Partners' `PartnerApplication` rows are written directly at the target status rather
  than walked through `submit_partner_application`/`transition_partner_application`, because the
  goal is a populated review queue, not a second proof that the submission invariants hold —
  `tests/partners` already proves those.
* a couple of `OperationsCase.due_at` values are backdated after creation so the queue has a
  visibly overdue row to render; nothing in the domain can create one honestly except waiting.

Every identifier this command creates lives in a phone-number block (`+9195...`) not touched by
the other seed commands, so re-running it, or running it alongside them, never collides.
"""

import itertools
import random
from dataclasses import dataclass
from datetime import datetime, time, timedelta
from http import HTTPStatus
from typing import Any
from zoneinfo import ZoneInfo

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from rest_framework.test import APIClient

from apps.assignments.group_services import (
    accept_unit_offer,
    reconcile_group_dispatch,
    start_group_dispatch,
)
from apps.assignments.models import PartnerOffer, Reservation
from apps.carts.compatibility import create_compatibility_rule_draft
from apps.carts.models import (
    BookingGroup,
    CheckoutSession,
    FulfilmentUnit,
    ServiceCompatibilityRule,
)
from apps.cases.models import OperationsCase
from apps.cases.services import add_case_note, claim_case, escalate_case, open_case, resolve_case
from apps.catalog.models import ServiceVariant
from apps.commerce.models import Booking, Order, PaymentAttempt
from apps.commerce.providers import ProviderPayment
from apps.commerce.services import (
    apply_provider_payment,
    create_provider_order,
    request_unit_refund,
    submit_refund,
)
from apps.fulfilment.cancellation import cancel_booked_group
from apps.fulfilment.completion import (
    OutcomeInput,
    confirm_completion,
    dispute_completion,
    submit_completion,
)
from apps.fulfilment.models import WorkTask
from apps.fulfilment.otp import operations_assisted_start
from apps.fulfilment.services import mark_arrived, mark_en_route
from apps.identity.models import Role, User, UserRole
from apps.locations.models import ServiceArea
from apps.notifications.services import engage_kill_switch, release_kill_switch
from apps.partners.models import (
    PartnerApplication,
    PartnerApplicationTransition,
    PartnerAvailabilityRule,
    PartnerDocument,
    PartnerProfile,
    PartnerService,
    PartnerServiceArea,
)
from apps.partners.services import _ensure_partner_role
from apps.payouts.services import (
    apply_payout_result,
    approve_payout_batch,
    cancel_payout_batch,
    propose_payout_batch,
    register_payout_account,
    settle_booking_earning,
    start_paying_batch,
    submit_payout_item,
)

DEMO_AREA_SLUG = "hyderabad-500032"
# A fresh three-digit salt per invocation. Cart items are not idempotent on their own — replaying
# the same customer's "add switch-socket-repair to cart" a second time is a genuine
# `duplicate_cart_item` conflict, not a safe no-op — so a rerun must mint new demo identities
# rather than reuse the previous run's, which a fixed phone block would do.
RUN_SALT = f"{random.randint(0, 999):03d}"
#: The Partner `seed_test_partner` maintains for manual testing. Restored at the end so
#: this command does not quietly take away the account somebody signs in with.
TEST_PARTNER_PHONE = "+919900000099"
CUSTOMER_PHONE_PREFIX = f"+9195{RUN_SALT}0"
PARTNER_PHONE_PREFIX = f"+9195{RUN_SALT}1"
APPLICANT_PHONE_PREFIX = f"+9195{RUN_SALT}2"
OPERATOR_PHONE_PREFIX = f"+9195{RUN_SALT}3"
SERVICE_SLUGS = (
    "switch-socket-repair",
    "fan-installation",
    "light-led-installation",
    "tap-repair",
    "wc-flush-repair",
    "cupboard-hinge-repair",
)

# `M1_SCHEDULED_MAX_DAYS = 7` bounds how far ahead a visit can be scheduled, so spreading demo
# Booking Groups across distinct *days* only buys 7 slots. Varying the hour too gives 7 days x 6
# hours = 42 (day, hour) slots — enough for every Booking Group this command creates, with room
# to spare for a rerun. Shuffled with a `RUN_SALT`-seeded RNG so a rerun picks a different corner
# of the grid instead of the same slots a previous run's leftover demo Partners already hold —
# see `_booked_group`'s docstring-length comment on why a stale Reservation elsewhere in the grid
# would otherwise win the ranking tie and leave nothing to accept.
_SLOT_HOURS = (8, 10, 12, 14, 16, 18)
_SLOT_POOL = [(day, hour) for day in range(1, 8) for hour in _SLOT_HOURS]
random.Random(RUN_SALT).shuffle(_SLOT_POOL)

_customer_seq = itertools.count(1)
_partner_seq = itertools.count(1)


def _k(suffix: str) -> str:
    """A `RUN_SALT`-scoped idempotency/reference key.

    `OperationsCase.idempotency_key`, `PartnerLedgerEntry.idempotency_key`, `PayoutBatch.reference`
    and friends are unique across the whole table, not per actor — unlike the HTTP idempotency
    records above, which are scoped to `(actor, operation, key)` and so tolerate a fixed literal.
    A fixed literal here would make a rerun silently replay the *previous* run's Case or ledger
    entry instead of creating a new one, defeating the point of seeding more data.
    """

    return f"demo-{RUN_SALT}-{suffix}"


def _preferred_start(slot: tuple[int, int]) -> Any:
    # Every demo Booking Group gets its own (day, hour) slot — see `_SLOT_POOL` above for why a
    # day alone is not enough room, and why a slot must be exclusive to this Booking Group.
    day_offset, hour = slot
    zone = ZoneInfo("Asia/Kolkata")
    local_date = timezone.now().astimezone(zone).date() + timedelta(days=day_offset)
    return datetime.combine(local_date, time(hour), tzinfo=zone)


def _address_payload(suffix: int) -> dict[str, object]:
    return {
        "label": "Home",
        "line1": f"{suffix} Vsolve Demo Street",
        "line2": "",
        "landmark": "Near the park",
        "locality": "Khajaguda",
        "city": "Hyderabad",
        "state": "Telangana",
        "postal_code": "500032",
        "country_code": "IN",
        "latitude": "17.414053",
        "longitude": "78.353554",
        "source": "MANUAL",
        "is_default": True,
    }


@dataclass(frozen=True, slots=True)
class BookedGroup:
    client: APIClient
    customer: User
    checkout: CheckoutSession
    group: BookingGroup
    order: Order

    @property
    def unit(self) -> FulfilmentUnit:
        return self.group.units.order_by("position").first()  # type: ignore[return-value]

    @property
    def booking(self) -> Booking:
        return self.unit.booking

    @property
    def partner(self) -> PartnerProfile:
        return self.booking.partner


class Command(BaseCommand):
    help = "Seed non-production demo data across every Operations console; never use in production."

    def _isolate_dispatch(self) -> None:
        """Make each slot's demo Partner the only candidate dispatch can pick.

        Dispatch ranks by Partner UUID across *every* eligible Partner, and
        `PartnerAvailabilityRule` is weekday-based so it recurs weekly. That means two things
        break a naive seeder:

        * a demo Partner created for "Tuesday 10am" in an earlier run is still eligible for this
          run's Tuesday slot, and being lower in UUID order gets dispatched instead;
        * `seed_test_partner` and `seed_m1_density_fixtures` create Partners with broad
          availability, and one of them wins *every* slot — accumulating reservations until two
          overlap and the GiST exclusion constraint refuses, which is that constraint doing
          exactly its job.

        So every approved Partner outside this run is suspended for the duration. Suspending
        rather than deleting: their Bookings, ledger entries and payout items are the rows these
        consoles are being seeded to show, and `on_delete=PROTECT` guards most of them for good
        reason. The phone numbers are returned so `_restore_partners` can put back the ones a
        human actually uses.
        """

        outsiders = PartnerApplication.objects.filter(
            status=PartnerApplication.Status.APPROVED
        ).exclude(partner__user__phone_number__startswith=PARTNER_PHONE_PREFIX)
        suspended = outsiders.update(status=PartnerApplication.Status.SUSPENDED)
        if suspended:
            self.stdout.write(
                f"Suspended {suspended} Partner(s) outside this run so dispatch has exactly one "
                f"candidate per slot."
            )
        self._release_stale_reservations()

    def _release_stale_reservations(self) -> None:
        """Free reservations left by a run that failed partway.

        A half-finished seed leaves its holds behind, and the next run then collides with them
        rather than with anything it created.
        """

        stale = Reservation.objects.exclude(status=Reservation.Status.RELEASED)
        count = stale.count()
        for reservation in stale:
            reservation.release()
        if count:
            self.stdout.write(f"Released {count} reservation(s) left by earlier runs.")

    def _restore_partners(self) -> None:
        """Re-approve the Partner `seed_test_partner` maintains for manual testing.

        Only that one. The demo Partners this command creates each run are meant to accumulate
        as history; re-approving all of them would recreate the eligibility overlap that made
        dispatch unusable in the first place.
        """

        restored = PartnerApplication.objects.filter(
            partner__user__phone_number=TEST_PARTNER_PHONE,
            status=PartnerApplication.Status.SUSPENDED,
        ).update(status=PartnerApplication.Status.APPROVED)
        if restored:
            self.stdout.write(f"Restored {TEST_PARTNER_PHONE} for manual testing.")

    def handle(self, *_args: object, **_options: object) -> None:
        if not settings.DEBUG:
            raise CommandError("Console demo data is forbidden outside local development.")
        # This command drives real endpoints through `APIClient`, which sends `Host: testserver`.
        # Only `django.test` settings allowlist that host; local/dev settings do not, because a
        # real deployment never should. Extending it for the life of this DEBUG-gated process is
        # safe and avoids requiring a different `ALLOWED_HOSTS` just to run a seed script.
        if "testserver" not in settings.ALLOWED_HOSTS:
            settings.ALLOWED_HOSTS = [*settings.ALLOWED_HOSTS, "testserver"]

        self.stdout.write("Ensuring baseline catalog and Partner reference data...")
        call_command("seed_technician_catalog")
        call_command("seed_partner_reference_data")
        call_command("seed_test_partner")
        call_command("seed_m1_density_fixtures")

        # After the baseline seeds, not before: `seed_test_partner` re-approves its Partner.
        self._isolate_dispatch()

        area = ServiceArea.objects.get(slug=DEMO_AREA_SLUG)
        ops_primary, ops_secondary = self._operators()

        self.stdout.write("Driving Booking Groups through the real command layer...")
        labels = (
            "confirmed",
            "en-route",
            "arrived",
            "in-progress",
            "completed-payable",
            "completed-unpayable",
            "disputed",
            "payout-hold",
            "refunded",
            "cancelled",
        )
        groups = {
            label: self._booked_group(slug=slug, key_prefix=f"demo-{RUN_SALT}-{label}", slot=slot)
            for slot, (label, slug) in zip(
                _SLOT_POOL, zip(labels, itertools.cycle(SERVICE_SLUGS), strict=False), strict=False
            )
        }

        self._advance_bookings(groups, ops_primary=ops_primary, area=area)
        self._seed_payouts(groups, ops_primary=ops_primary, ops_secondary=ops_secondary)
        self._seed_cases(groups, ops_primary=ops_primary, ops_secondary=ops_secondary)
        self._seed_kill_switches(ops_primary=ops_primary, ops_secondary=ops_secondary)
        self._seed_review_queue(ops_primary=ops_primary)
        self._restore_partners()
        self._seed_compatibility_rules(ops_secondary=ops_secondary)

        self.stdout.write(self.style.SUCCESS("Console demo data seeded."))

    # -- Operators ----------------------------------------------------------------------------

    def _operators(self) -> tuple[User, User]:
        role, _ = Role.objects.get_or_create(
            code="operations", defaults={"name": "Operations", "is_system": True}
        )
        primary, _ = User.objects.get_or_create(
            phone_number="+918019013032",
            defaults={"full_name": "Operations (dev)"},
        )
        UserRole.objects.update_or_create(user=primary, role=role, defaults={"revoked_at": None})
        secondary, _ = User.objects.get_or_create(
            phone_number=f"{OPERATOR_PHONE_PREFIX}0002",
            defaults={"full_name": "Demo Ops Reviewer"},
        )
        UserRole.objects.update_or_create(user=secondary, role=role, defaults={"revoked_at": None})
        return primary, secondary

    # -- Booking group construction -------------------------------------------------------------

    def _customer_context(self) -> tuple[APIClient, User, str, int]:
        suffix = next(_customer_seq)
        customer, _ = User.objects.get_or_create(
            phone_number=f"{CUSTOMER_PHONE_PREFIX}{suffix:04d}",
            defaults={"full_name": f"Demo Customer {suffix}"},
        )
        client = APIClient()
        client.force_authenticate(customer)
        cart = client.get("/api/v1/cart/")
        assert cart.status_code == HTTPStatus.OK
        address = client.post("/api/v1/addresses/", _address_payload(suffix), format="json")
        assert address.status_code == HTTPStatus.CREATED, address.json()
        return client, customer, address.json()["id"], cart.json()["version"]

    def _demo_partner(self, *, slug: str, slot: tuple[int, int]) -> PartnerProfile:
        area = ServiceArea.objects.get(slug=DEMO_AREA_SLUG)
        suffix = next(_partner_seq)
        user, _ = User.objects.get_or_create(
            phone_number=f"{PARTNER_PHONE_PREFIX}{suffix:04d}",
            defaults={"full_name": f"Demo Partner {suffix}"},
        )
        # A profile and even an APPROVED application are not an authentication grant.
        # Partner endpoints require an active `partner` UserRole, so a seed that skips the
        # application command must preserve that command's role invariant explicitly.
        _ensure_partner_role(user)
        partner, _ = PartnerProfile.objects.get_or_create(
            user=user, defaults={"display_name": f"Demo Partner {suffix}", "experience_years": 3}
        )
        PartnerApplication.objects.update_or_create(
            partner=partner, defaults={"status": PartnerApplication.Status.APPROVED}
        )
        variant = (
            ServiceVariant.objects.filter(service__slug=slug, is_active=True).order_by("id").first()
            or ServiceVariant.objects.filter(service__slug=slug).order_by("id").first()
        )
        if variant is None:
            raise ServiceVariant.DoesNotExist(f"No variant found for service slug {slug}")
        PartnerService.objects.get_or_create(partner=partner, variant=variant)
        PartnerServiceArea.objects.get_or_create(partner=partner, service_area=area)
        starts_at = _preferred_start(slot).astimezone(ZoneInfo(area.timezone))
        PartnerAvailabilityRule.objects.get_or_create(
            partner=partner,
            service_area=area,
            weekday=starts_at.weekday(),
            starts_at=time(8),
            defaults={"ends_at": time(20), "is_active": True},
        )
        return partner

    def _booked_group(self, *, slug: str, key_prefix: str, slot: tuple[int, int]) -> BookedGroup:
        client, customer, address_id, cart_version = self._customer_context()
        variant = (
            ServiceVariant.objects.filter(service__slug=slug, is_active=True).order_by("id").first()
            or ServiceVariant.objects.filter(service__slug=slug).order_by("id").first()
        )
        if variant is None:
            raise ServiceVariant.DoesNotExist(f"No variant found for service slug {slug}")
        response = client.post(
            "/api/v1/cart/items/",
            {
                "expected_cart_version": cart_version,
                "variant_id": str(variant.id),
                "quantity": 1,
                "scope": {"quantity": 1},
            },
            format="json",
        )
        assert response.status_code == HTTPStatus.CREATED, response.json()
        cart_version = int(response.json()["version"])
        self._demo_partner(slug=slug, slot=slot)

        groups_response = client.post(
            "/api/v1/cart/scheduling-groups/",
            {"address_id": address_id, "expected_cart_version": cart_version},
            format="json",
        )
        assert groups_response.status_code == HTTPStatus.OK, groups_response.json()

        plan_response = client.post(
            "/api/v1/fulfilment-plan-sets/",
            {
                "address_id": address_id,
                "expected_cart_version": cart_version,
                "preferred_starts": [
                    {"group_key": group["key"], "starts_at": _preferred_start(slot).isoformat()}
                    for group in groups_response.json()["groups"]
                ],
            },
            format="json",
            HTTP_IDEMPOTENCY_KEY=f"{key_prefix}-plan",
        )
        assert plan_response.status_code == HTTPStatus.CREATED, plan_response.json()
        plan = plan_response.json()["plans"][0]

        quote_response = client.post(
            "/api/v1/plan-quotes/",
            {"plan_id": plan["id"]},
            format="json",
            HTTP_IDEMPOTENCY_KEY=f"{key_prefix}-quote",
        )
        assert quote_response.status_code == HTTPStatus.CREATED, quote_response.json()

        checkout_response = client.post(
            "/api/v1/checkouts/",
            {"quote_id": quote_response.json()["id"]},
            format="json",
            HTTP_IDEMPOTENCY_KEY=f"{key_prefix}-checkout",
        )
        assert checkout_response.status_code == HTTPStatus.CREATED, checkout_response.json()
        checkout = CheckoutSession.objects.get(id=checkout_response.json()["id"])
        # `booking_group_id` is nullable in the schema; checkout materialization always sets
        # it, and asserting that here is cheaper than a cast that hides a real None.
        assert checkout.booking_group_id is not None
        group = BookingGroup.objects.get(id=checkout.booking_group_id)

        # Checkout creation only enqueues the `checkout.created` outbox event; a Celery worker
        # normally delivers it and calls `start_group_dispatch`, which moves the group from
        # CONFIRMED to MATCHING and creates the first offer. Nothing runs a worker for this
        # command (`config.settings.test`'s eager mode is the only environment where this
        # happens inline), so it is called directly here instead of waiting for one.
        start_group_dispatch(group_id=group.id)
        offers = list(
            PartnerOffer.objects.filter(
                fulfilment_unit__booking_group=group, status=PartnerOffer.Status.OFFERED
            ).select_related("partner")
        )
        for offer in offers:
            accepted = accept_unit_offer(offer_id=offer.id, partner=offer.partner)
            accepted.undo_deadline = timezone.now() - timedelta(seconds=1)
            accepted.save(update_fields=("undo_deadline",))
        reconcile_group_dispatch(group_id=group.id)
        checkout.refresh_from_db()

        payment_response = client.post(
            "/api/v1/payment-attempts/",
            {
                "checkout_id": str(checkout.id),
                "expected_checkout_version": checkout.version,
            },
            format="json",
            HTTP_IDEMPOTENCY_KEY=f"{key_prefix}-payment",
        )
        assert payment_response.status_code == HTTPStatus.ACCEPTED, payment_response.json()
        # Same story as dispatch: initiating a payment attempt only enqueues the outbox event a
        # worker would use to call `create_provider_order` and stamp a real `provider_order_id`.
        # Without that, every attempt sits at `PROVIDER_PENDING` with an empty
        # `provider_order_id`, and a second demo booking's `apply_provider_payment` would match
        # more than one row on that empty string. Called directly for the same reason
        # `start_group_dispatch` is above.
        create_provider_order(attempt_id=payment_response.json()["id"])
        attempt = PaymentAttempt.objects.get(id=payment_response.json()["id"])

        order = apply_provider_payment(
            provider_code="fake",
            payment=ProviderPayment(
                provider_payment_id=f"fake_payment_{key_prefix}",
                provider_order_id=attempt.provider_order_id,
                amount_paise=attempt.amount_paise,
                currency=attempt.currency,
                status="captured",
            ),
        )
        assert order is not None
        group.refresh_from_db()
        return BookedGroup(
            client=client, customer=customer, checkout=checkout, group=group, order=order
        )

    # -- Lifecycle progression --------------------------------------------------------------

    def _deliver(self, booked: BookedGroup, *, key: str, outage_actor: User) -> Booking:
        booking = mark_en_route(
            booking_id=booked.booking.id,
            partner_id=booked.partner.id,
            expected_version=booked.booking.version,
        )
        booking = mark_arrived(
            booking_id=booking.id, partner_id=booked.partner.id, expected_version=booking.version
        )
        operations_assisted_start(
            booking_id=booking.id,
            operator=outage_actor,
            outage_reason="Demo seed: skip Partner OTP for scripted data.",
            expected_version=booking.version,
        )
        booked.booking.refresh_from_db()
        tasks = list(WorkTask.objects.filter(booking=booked.booking))
        submit_completion(
            booking_id=booked.booking.id,
            partner_id=booked.partner.id,
            notes="Demo seed: work completed as scoped.",
            safety_damage_declared=False,
            outcomes=[
                OutcomeInput(work_task_id=task.id, outcome="COMPLETED", quantity=task.quantity)
                for task in tasks
            ],
            expected_version=booked.booking.version,
            idempotency_key=f"{key}-submit",
        )
        booked.booking.refresh_from_db()
        return booked.booking

    def _advance_bookings(
        self,
        groups: dict[str, BookedGroup],
        *,
        ops_primary: User,
        area: ServiceArea,
    ) -> None:
        self.stdout.write("Advancing Bookings through their lifecycle...")

        en_route = groups["en-route"]
        mark_en_route(
            booking_id=en_route.booking.id,
            partner_id=en_route.partner.id,
            expected_version=en_route.booking.version,
        )

        arrived = groups["arrived"]
        booking = mark_en_route(
            booking_id=arrived.booking.id,
            partner_id=arrived.partner.id,
            expected_version=arrived.booking.version,
        )
        mark_arrived(
            booking_id=booking.id, partner_id=arrived.partner.id, expected_version=booking.version
        )

        in_progress = groups["in-progress"]
        booking = mark_en_route(
            booking_id=in_progress.booking.id,
            partner_id=in_progress.partner.id,
            expected_version=in_progress.booking.version,
        )
        booking = mark_arrived(
            booking_id=booking.id,
            partner_id=in_progress.partner.id,
            expected_version=booking.version,
        )
        operations_assisted_start(
            booking_id=booking.id,
            operator=ops_primary,
            outage_reason="Demo seed: skip Partner OTP for scripted data.",
            expected_version=booking.version,
        )

        payable = groups["completed-payable"]
        self._deliver(payable, key=_k("completed-payable"), outage_actor=ops_primary)
        confirm_completion(
            booking_id=payable.booking.id,
            customer_id=payable.customer.id,
            expected_version=payable.booking.version,
            idempotency_key=_k("completed-payable-confirm"),
        )
        payable.booking.refresh_from_db()
        settle_booking_earning(booking_id=payable.booking.id)
        account = register_payout_account(
            partner_id=payable.partner.id,
            account_last4="4242",
            ifsc="HDFC0001234",
            holder_name=payable.partner.display_name,
            actor=ops_primary,
        )
        account.status = account.Status.VERIFIED
        account.verified_at = timezone.now()
        account.effective_from = timezone.now() - timedelta(hours=1)
        account.save(update_fields=("status", "verified_at", "effective_from"))

        unpayable = groups["completed-unpayable"]
        self._deliver(unpayable, key=_k("completed-unpayable"), outage_actor=ops_primary)
        confirm_completion(
            booking_id=unpayable.booking.id,
            customer_id=unpayable.customer.id,
            expected_version=unpayable.booking.version,
            idempotency_key=_k("completed-unpayable-confirm"),
        )
        unpayable.booking.refresh_from_db()
        settle_booking_earning(booking_id=unpayable.booking.id)
        # Deliberately left with no verified payout account — surfaces in
        # `useUnpayablePartners` on the Payout runs console.

        disputed = groups["disputed"]
        self._deliver(disputed, key=_k("disputed"), outage_actor=ops_primary)
        disputed.booking.refresh_from_db()
        dispute_completion(
            booking_id=disputed.booking.id,
            customer_id=disputed.customer.id,
            dispute_reason="The switch was left loose after the visit.",
            expected_version=disputed.booking.version,
            idempotency_key=_k("disputed-dispute"),
        )

        hold = groups["payout-hold"]
        self._deliver(hold, key=_k("payout-hold"), outage_actor=ops_primary)
        confirm_completion(
            booking_id=hold.booking.id,
            customer_id=hold.customer.id,
            expected_version=hold.booking.version,
            idempotency_key=_k("payout-hold-confirm"),
        )
        hold.booking.refresh_from_db()
        settle_booking_earning(booking_id=hold.booking.id)

        refunded = groups["refunded"]
        self._deliver(refunded, key=_k("refunded"), outage_actor=ops_primary)
        confirm_completion(
            booking_id=refunded.booking.id,
            customer_id=refunded.customer.id,
            expected_version=refunded.booking.version,
            idempotency_key=_k("refunded-confirm"),
        )
        refunded.order.refresh_from_db()
        refund = request_unit_refund(
            order_id=refunded.order.id,
            unit_ids=[refunded.unit.id],
            reason_code="service-not-delivered",
            idempotency_key=_k("refunded-refund"),
            requested_by_id=ops_primary.id,
        )
        submit_refund(refund_id=refund.id)

        cancelled = groups["cancelled"]
        cancel_booked_group(
            group_id=cancelled.group.id,
            customer_id=cancelled.customer.id,
            expected_version=cancelled.group.version,
            reason="Customer asked to cancel before the visit.",
            idempotency_key=_k("cancelled-cancel"),
        )

    # -- Payout batches -----------------------------------------------------------------------

    def _seed_payouts(
        self,
        groups: dict[str, BookedGroup],
        *,
        ops_primary: User,
        ops_secondary: User,
    ) -> None:
        self.stdout.write("Proposing and settling Payout runs...")
        now = timezone.now()
        period_start = now - timedelta(days=7)
        period_end = now + timedelta(days=1)

        paid_batch = propose_payout_batch(
            reference=_k("weekly-paid"),
            period_start=period_start,
            period_end=period_end,
            actor=ops_secondary,
        )
        if paid_batch.items.exists():
            paid_batch = approve_payout_batch(
                batch_id=paid_batch.id, expected_version=paid_batch.version, actor=ops_primary
            )
            paid_batch = start_paying_batch(
                batch_id=paid_batch.id, expected_version=paid_batch.version
            )
            for reserved in paid_batch.items.all():
                submitted = submit_payout_item(item_id=reserved.id)
                apply_payout_result(item_id=submitted.id, status="processed")

        # A second, still-pending batch: nothing left eligible after the first batch reserved it,
        # so this one is deliberately empty and stays in PENDING_APPROVAL to show that state too.
        pending_reference = _k(f"pending-{now.date().isoformat()}")
        pending_batch = propose_payout_batch(
            reference=pending_reference,
            period_start=period_start,
            period_end=period_end,
            actor=ops_primary,
        )
        self.stdout.write(f"  pending batch {pending_batch.reference}: {pending_batch.status}")

        # And a batch proposed, then cancelled — releasing its reservations back to the ledger.
        cancel_reference = _k(f"cancelled-batch-{now.date().isoformat()}")
        cancel_batch = propose_payout_batch(
            reference=cancel_reference,
            period_start=period_start,
            period_end=period_end,
            actor=ops_secondary,
        )
        if cancel_batch.status == cancel_batch.Status.PENDING_APPROVAL:
            cancel_payout_batch(
                batch_id=cancel_batch.id, expected_version=cancel_batch.version, actor=ops_primary
            )

    # -- Operations cases -----------------------------------------------------------------------

    def _seed_cases(
        self, groups: dict[str, BookedGroup], *, ops_primary: User, ops_secondary: User
    ) -> None:
        self.stdout.write("Opening Operations cases...")

        disputed = groups["disputed"]
        quality_case = open_case(
            kind=OperationsCase.Kind.QUALITY,
            summary="Customer disputed a completed switch/socket repair.",
            severity=OperationsCase.Severity.HIGH,
            booking_id=disputed.booking.id,
            detail="The switch was reportedly left loose after the visit.",
            opened_by=disputed.customer,
            idempotency_key=_k("demo-case-quality"),
        )
        claim_case(
            case_id=quality_case.id, expected_version=quality_case.version, actor=ops_primary
        )
        quality_case.refresh_from_db()
        add_case_note(
            case_id=quality_case.id,
            actor=ops_primary,
            body="Called the customer; a callback visit is being scheduled.",
        )
        # Left IN_PROGRESS on purpose so the queue shows an open, claimed, high-severity case.

        hold = groups["payout-hold"]
        payout_case = open_case(
            kind=OperationsCase.Kind.PAYOUT,
            summary="Payout ambiguity flagged after a provider timeout in the demo run.",
            severity=OperationsCase.Severity.NORMAL,
            booking_id=hold.booking.id,
            opened_by=ops_secondary,
            idempotency_key=_k("demo-case-payout"),
        )
        claim_case(case_id=payout_case.id, expected_version=payout_case.version, actor=ops_primary)
        payout_case.refresh_from_db()
        resolve_case(
            case_id=payout_case.id,
            expected_version=payout_case.version,
            resolution="RESERVATION_RELEASED",
            note="Confirmed with the provider that no payout went out; reservation released.",
            actor=ops_primary,
        )

        cancelled = groups["cancelled"]
        assignment_case = open_case(
            kind=OperationsCase.Kind.ASSIGNMENT,
            summary="Recovery needed after the customer cancelled ahead of dispatch settling.",
            severity=OperationsCase.Severity.URGENT,
            booking_id=None,
            order_id=cancelled.order.id,
            opened_by=ops_primary,
            idempotency_key=_k("demo-case-assignment"),
        )
        # Backdated so the queue shows a genuinely overdue row — nothing in the domain produces
        # one honestly except waiting for the SLA clock to actually run out.
        OperationsCase.objects.filter(id=assignment_case.id).update(
            due_at=timezone.now() - timedelta(hours=3)
        )

        payable = groups["completed-payable"]
        late_case = open_case(
            kind=OperationsCase.Kind.LATE_NO_SHOW,
            summary="Partner arrived after the promised window; customer flagged it.",
            severity=OperationsCase.Severity.LOW,
            booking_id=payable.booking.id,
            opened_by=ops_secondary,
            idempotency_key=_k("demo-case-late"),
        )
        escalate_case(
            case_id=late_case.id,
            expected_version=late_case.version,
            severity=OperationsCase.Severity.NORMAL,
            actor=ops_primary,
        )
        late_case.refresh_from_db()
        resolve_case(
            case_id=late_case.id,
            expected_version=late_case.version,
            resolution="PERFORMED",
            note="Visit was completed; a goodwill note was sent to the customer.",
            actor=ops_primary,
        )

        open_case(
            kind=OperationsCase.Kind.SAFETY,
            summary="Customer reported a Partner working without protective gear.",
            severity=OperationsCase.Severity.URGENT,
            partner_id=payable.partner.id,
            opened_by=ops_primary,
            idempotency_key=_k("demo-case-safety"),
        )

    # -- Kill switches -------------------------------------------------------------------------

    def _seed_kill_switches(self, *, ops_primary: User, ops_secondary: User) -> None:
        self.stdout.write("Engaging demo Kill switches...")
        engage_kill_switch(
            scope="SMS",
            reason="Demo: provider incident drill.",
            actor=ops_primary,
        )
        engage_kill_switch(
            scope="SERVICE_AREA",
            target=DEMO_AREA_SLUG,
            reason="Demo: flooding reported in the service area.",
            actor=ops_secondary,
        )
        # Engaged, then released, so the board shows a switch with real history too.
        engage_kill_switch(
            scope="PAYMENTS",
            reason="Demo: payment provider degraded briefly.",
            actor=ops_secondary,
        )
        release_kill_switch(scope="PAYMENTS", actor=ops_primary)

    # -- Partner review queue -------------------------------------------------------------------

    def _seed_review_queue(self, *, ops_primary: User) -> None:
        self.stdout.write("Seeding the Partner review queue...")
        variant = (
            ServiceVariant.objects.filter(service__slug=SERVICE_SLUGS[0], is_active=True)
            .order_by("id")
            .first()
            or ServiceVariant.objects.filter(service__slug=SERVICE_SLUGS[0]).order_by("id").first()
        )
        area = ServiceArea.objects.get(slug=DEMO_AREA_SLUG)

        def _applicant(idx: int, name: str) -> PartnerProfile:
            user, _ = User.objects.get_or_create(
                phone_number=f"{APPLICANT_PHONE_PREFIX}{idx:04d}", defaults={"full_name": name}
            )
            _ensure_partner_role(user)
            partner, _ = PartnerProfile.objects.get_or_create(
                user=user, defaults={"display_name": name, "experience_years": 2}
            )
            PartnerService.objects.get_or_create(partner=partner, variant=variant)
            PartnerServiceArea.objects.get_or_create(partner=partner, service_area=area)
            return partner

        submitted = _applicant(1, "Applicant Awaiting Review")
        application, _ = PartnerApplication.objects.update_or_create(
            partner=submitted,
            defaults={
                "status": PartnerApplication.Status.SUBMITTED,
                "submitted_at": timezone.now(),
                "version": 2,
            },
        )
        PartnerApplicationTransition.objects.get_or_create(
            application=application,
            to_status=PartnerApplication.Status.SUBMITTED,
            defaults={
                "from_status": PartnerApplication.Status.DRAFT,
                "actor": submitted.user,
                "reason_code": "application_submitted",
                "application_version": 2,
            },
        )
        PartnerDocument.objects.get_or_create(
            application=application,
            kind=PartnerDocument.Kind.GOVERNMENT_ID,
            version=1,
            defaults={
                "object_key": "seed/non-production/government_id.txt",
                "content_type": "text/plain",
                "size_bytes": 1,
                "sha256": "1" * 64,
                "scan_status": PartnerDocument.ScanStatus.CLEAN,
                "scanned_at": timezone.now(),
                "status": PartnerDocument.Status.PENDING,
            },
        )

        under_review = _applicant(2, "Applicant Under Review")
        PartnerApplication.objects.update_or_create(
            partner=under_review,
            defaults={
                "status": PartnerApplication.Status.UNDER_REVIEW,
                "submitted_at": timezone.now() - timedelta(hours=6),
                "review_assigned_to": ops_primary,
                "review_assigned_at": timezone.now() - timedelta(hours=1),
                "version": 2,
            },
        )

        changes_required = _applicant(3, "Applicant Needing Changes")
        PartnerApplication.objects.update_or_create(
            partner=changes_required,
            defaults={
                "status": PartnerApplication.Status.CHANGES_REQUIRED,
                "submitted_at": timezone.now() - timedelta(days=1),
                "reviewed_by": ops_primary,
                "reviewed_at": timezone.now() - timedelta(hours=20),
                "change_request_message": "Re-upload a clearer photo of your government ID.",
                "version": 3,
            },
        )

    # -- Compatibility rules --------------------------------------------------------------------

    def _seed_compatibility_rules(self, *, ops_secondary: User) -> None:
        """Two proposals awaiting a second reviewer.

        They stay `DRAFT`, and that is the point twice over.

        `seed_technician_catalog` already writes a baseline rule for *every* pair of the six M1
        variants, and `carts_unique_current_compatibility` permits one **current** rule per pair.
        Activating a demo rule on a pair the baseline owns leaves two current rules on it — which
        does not fail here, but makes the next `seed_technician_catalog` run collide, so a second
        run of this command used to break on a line it does not own.

        A draft is also what the console actually needs. The maker-checker queue is a list of
        proposals waiting for somebody other than their author; an already-activated rule is not
        one, so activating them here would empty the very queue this is seeding.
        """

        self.stdout.write("Seeding Service compatibility rule proposals...")
        now = timezone.now()
        proposals = (
            (
                "switch-socket-repair",
                "fan-installation",
                ServiceCompatibilityRule.Mode.SAME_PARTNER_SEQUENTIAL,
                "Demo: let one Partner do both in the same visit.",
                "demo-compat-draft",
            ),
            (
                "tap-repair",
                "wc-flush-repair",
                ServiceCompatibilityRule.Mode.MUST_BE_SEPARATE,
                "Demo: still awaiting a second reviewer.",
                "demo-compat-draft-pending",
            ),
        )

        for left_slug, right_slug, mode, reason, request_id in proposals:
            left = (
                ServiceVariant.objects.filter(service__slug=left_slug, is_active=True)
                .order_by("id")
                .first()
                or ServiceVariant.objects.filter(service__slug=left_slug).order_by("id").first()
            )
            right = (
                ServiceVariant.objects.filter(service__slug=right_slug, is_active=True)
                .order_by("id")
                .first()
                or ServiceVariant.objects.filter(service__slug=right_slug).order_by("id").first()
            )
            if left is None or right is None:
                # A slug this catalogue does not carry: nothing to propose a rule between.
                continue
            # Checked in both directions: a rule stores its pair canonically ordered, so the row
            # written for (switch-socket, fan) reads back as (fan, switch-socket) and a
            # one-directional lookup silently misses it.
            already = ServiceCompatibilityRule.objects.filter(
                left_variant__in=(left, right),
                right_variant__in=(left, right),
                lifecycle_status=ServiceCompatibilityRule.LifecycleStatus.DRAFT,
            ).exists()
            if already:
                continue
            create_compatibility_rule_draft(
                actor=ops_secondary,
                left_variant_id=left.id,
                right_variant_id=right.id,
                mode=mode,
                dependency=ServiceCompatibilityRule.Dependency.NONE,
                conditions={},
                effective_from=now,
                effective_to=None,
                change_reason=reason,
                request_id=request_id,
            )
