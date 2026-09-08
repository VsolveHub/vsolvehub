"""Unit and integration test suite for Rental Services (A7_RENTAL).

Validates:
- M3-A7-01: Query-time rollup de-duplication (RentalListingGroup)
- M3-A7-02: PostgreSQL ExclusionConstraint concurrency locking for serialized assets
- M3-A7-03: Fungible pooled capacity check (select_for_update)
- M3-A7-04: Maintenance downtime collision
- M3-A7-05: Booking confirmation and ADR-0003 payment allocation
- M3-A7-06: Handover custody transfer and deposit transition to HELD
- M3-A7-07: Rental extension
- M3-A7-08: Clean return -> 100% deposit release & vendor ledger entry
- M3-A7-09: Minor damage within cap -> auto-consumption & partial refund
- M3-A7-10: Major damage exceeding cap -> OperationsCase dispute
- M3-A7-11: Customer dispute flow
- M3-A7-12: Operations asset reassignment pre-handover
- M3-A7-13: Operations dispute resolution & settlement
"""

from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from typing import Any
from django.contrib.auth import get_user_model
from django.db import connections
from django.test import TestCase, TransactionTestCase
from django.utils import timezone

from apps.cases.models import OperationsCase
from apps.catalog.models import (
    A7VariantConfiguration,
    Category,
    Service,
    ServiceVariant,
    Subcategory,
)
from apps.commerce.models import Booking, PaymentAttempt
from apps.partners.models import PartnerBusinessProfile, PartnerProfile
from apps.payouts.models import PartnerLedgerEntry
from apps.rentals.exceptions import AssetUnavailableError, InvalidRentalStateTransitionError
from apps.foundation.models import OutboxEvent
from apps.rentals.models import (
    AssetReservation,
    RentalAsset,
    RentalBooking,
    RentalDeposit,
    RentalExtension,
    RentalMaintenancePeriod,
    RentalPaymentAllocation,
)
from apps.rentals.selectors import get_rental_listing_groups
from apps.rentals.services import (
    approve_extension,
    cancel_rental_booking,
    confirm_extension_payment,
    confirm_rental_booking,
    create_rental_hold,
    dispute_deposit,
    handle_rental_checkout_failure,
    initiate_rental_checkout,
    operations_reassign_asset,
    operations_resolve_dispute,
    record_handover,
    record_return_inspection,
    request_extension,
)
from apps.rentals.tasks import (
    sweep_expired_asset_reservations,
    sweep_maintenance_asset_blocks,
)

User = get_user_model()


class RentalServicesTestSuite(TestCase):
    def setUp(self) -> None:
        # 1. Customer user
        self.customer = User.objects.create(
            phone_number="+919888800001", full_name="Ramesh Customer"
        )

        # 2. Ops staff user
        self.operator = User.objects.create(
            phone_number="+919888800099", full_name="Admin Ops", is_staff=True
        )

        # 3. Partner user & profile
        self.partner_user = User.objects.create(
            phone_number="+919888800002", full_name="Suresh Vendor"
        )
        self.partner = PartnerProfile.objects.create(
            user=self.partner_user, display_name="Suresh Tool Rentals"
        )
        PartnerBusinessProfile.objects.create(
            partner=self.partner,
            legal_name="Suresh Tools Pvt Ltd",
            business_type=PartnerBusinessProfile.BusinessType.INDIVIDUAL,
        )

        # 4. Catalog
        self.category = Category.objects.create(
            slug="rental-services", name="Rental Services", display_order=10
        )
        self.subcategory = Subcategory.objects.create(
            category=self.category,
            slug="tools-machinery",
            name="Tools & Machinery",
            display_order=1,
        )
        self.service = Service.objects.create(
            subcategory=self.subcategory,
            slug="rental-drill-machine",
            name="Drill Machine",
            status=Service.Status.ACTIVE,
        )
        self.variant = ServiceVariant.objects.create(
            service=self.service,
            code="standard",
            name="Daily Rental",
            pricing_strategy=ServiceVariant.PricingStrategy.DURATION,
            booking_archetype=ServiceVariant.BookingArchetype.A7_RENTAL,
        )
        self.a7_config = A7VariantConfiguration.objects.create(
            variant=self.variant,
            version=1,
            status=A7VariantConfiguration.Status.ACTIVE,
            default_deposit_paise=100000,
            late_fee_per_day_paise=35000,
            minor_damage_cap_paise=500000,
        )

        # 5. Serialized asset
        self.serialized_asset = RentalAsset.objects.create(
            partner=self.partner,
            variant=self.variant,
            title="Bosch Hammer Drill Serial 01",
            asset_identifier="BOSCH-001",
            is_serialized=True,
            daily_price_paise=35000,
            deposit_paise=100000,
            condition_grade=RentalAsset.ConditionGrade.EXCELLENT,
            current_status=RentalAsset.Status.ACTIVE,
        )

        # 6. Fungible pooled asset (e.g. 5 chairs)
        self.chair_service = Service.objects.create(
            subcategory=self.subcategory,
            slug="rental-plastic-chair",
            name="Plastic Chair",
            status=Service.Status.ACTIVE,
        )
        self.chair_variant = ServiceVariant.objects.create(
            service=self.chair_service,
            code="standard",
            name="Chair Daily Rental",
            pricing_strategy=ServiceVariant.PricingStrategy.DURATION,
            booking_archetype=ServiceVariant.BookingArchetype.A7_RENTAL,
        )
        self.pooled_asset = RentalAsset.objects.create(
            partner=self.partner,
            variant=self.chair_variant,
            title="Standard White Chairs",
            is_serialized=False,
            quantity_available=5,
            daily_price_paise=1500,
            deposit_paise=5000,
            condition_grade=RentalAsset.ConditionGrade.EXCELLENT,
            current_status=RentalAsset.Status.ACTIVE,
        )
        A7VariantConfiguration.objects.create(
            variant=self.chair_variant,
            version=1,
            status=A7VariantConfiguration.Status.ACTIVE,
            default_deposit_paise=5000,
        )

    def _create_payment_attempt(self, amount_paise: int = 100000) -> PaymentAttempt:
        booking = RentalBooking.objects.filter(
            customer=self.customer, status=RentalBooking.Status.HELD
        ).latest("created_at")
        attempts = []
        for purpose, lines in (
            (
                PaymentAttempt.Purpose.A7_RENTAL_BOOKING,
                booking.lines.exclude(line_type="DEPOSIT_HOLD"),
            ),
            (
                PaymentAttempt.Purpose.A7_DEPOSIT_HOLD,
                booking.lines.filter(line_type="DEPOSIT_HOLD"),
            ),
        ):
            lines = list(lines)
            total = sum(line.amount_paise for line in lines)
            if not total:
                continue
            attempt = PaymentAttempt.objects.create(
                purpose=purpose,
                status=PaymentAttempt.Status.CAPTURED,
                provider="razorpay",
                provider_payment_id=f"pay_{purpose}_{booking.id}",
                amount_paise=total,
                currency="INR",
            )
            for line in lines:
                RentalPaymentAllocation.objects.create(
                    payment_attempt=attempt,
                    rental_booking_line=line,
                    amount_paise=line.amount_paise,
                )
            attempts.append(attempt)
        return next(
            item for item in attempts if item.purpose == PaymentAttempt.Purpose.A7_RENTAL_BOOKING
        )

    def test_01_query_time_rollup_deduplication(self) -> None:
        """Verify identical assets roll up into one vendor card at query time."""
        RentalAsset.objects.create(
            partner=self.partner,
            variant=self.variant,
            title="Bosch Hammer Drill Serial 02",
            asset_identifier="BOSCH-002",
            is_serialized=True,
            daily_price_paise=35000,
            deposit_paise=100000,
            condition_grade=RentalAsset.ConditionGrade.EXCELLENT,
            current_status=RentalAsset.Status.ACTIVE,
        )

        groups = get_rental_listing_groups(service_slug="rental-drill-machine")
        self.assertEqual(len(groups), 1)
        self.assertEqual(groups[0]["quantity_available"], 2)
        self.assertEqual(groups[0]["vendor_name"], "Suresh Tools Pvt Ltd")
        self.assertEqual(groups[0]["daily_price_paise"], 35000)

    def test_02_serialized_asset_hold_exclusion_constraint(self) -> None:
        """Verify concurrent holds on overlapping ranges are refused."""
        today = date.today() + timedelta(days=2)
        end = today + timedelta(days=3)

        booking1 = create_rental_hold(
            customer=self.customer,
            asset_id=self.serialized_asset.id,
            start_date=today,
            end_date=end,
        )
        self.assertEqual(booking1.status, RentalBooking.Status.HELD)
        self.assertEqual(booking1.reservation.status, AssetReservation.Status.TENTATIVE)

        with self.assertRaises(AssetUnavailableError):
            create_rental_hold(
                customer=self.customer,
                asset_id=self.serialized_asset.id,
                start_date=today + timedelta(days=1),
                end_date=end + timedelta(days=2),
            )

    def test_03_pooled_asset_capacity_limits(self) -> None:
        """Verify fungible pooled assets allow holds up to quantity_available then refuse."""
        today = date.today() + timedelta(days=5)
        end = today + timedelta(days=2)

        holds = []
        for _ in range(5):
            h = create_rental_hold(
                customer=self.customer,
                asset_id=self.pooled_asset.id,
                start_date=today,
                end_date=end,
            )
            holds.append(h)
        self.assertEqual(len(holds), 5)

        with self.assertRaises(AssetUnavailableError):
            create_rental_hold(
                customer=self.customer,
                asset_id=self.pooled_asset.id,
                start_date=today,
                end_date=end,
            )

    def test_04_maintenance_period_blocks_hold(self) -> None:
        """Verify asset under maintenance cannot be booked."""
        today = date.today() + timedelta(days=10)
        end = today + timedelta(days=5)

        RentalMaintenancePeriod.objects.create(
            asset=self.serialized_asset,
            start_date=today,
            end_date=end,
            reason="Annual motor overhaul",
        )

        with self.assertRaises(AssetUnavailableError):
            create_rental_hold(
                customer=self.customer,
                asset_id=self.serialized_asset.id,
                start_date=today + timedelta(days=1),
                end_date=today + timedelta(days=3),
            )

    def test_05_booking_confirmation_and_payment_allocation(self) -> None:
        """Verify confirmation transitions reservation and creates ADR-0003 allocations."""
        today = date.today() + timedelta(days=2)
        end = today + timedelta(days=4)

        booking = create_rental_hold(
            customer=self.customer,
            asset_id=self.serialized_asset.id,
            start_date=today,
            end_date=end,
        )
        total_paise = sum(l.amount_paise for l in booking.lines.all())
        payment_attempt = self._create_payment_attempt(amount_paise=total_paise)

        confirmed = confirm_rental_booking(
            booking_id=booking.id,
            payment_attempt=payment_attempt,
            customer=self.customer,
        )

        self.assertEqual(confirmed.status, RentalBooking.Status.CONFIRMED)
        self.assertEqual(confirmed.reservation.status, AssetReservation.Status.CONFIRMED)
        self.assertEqual(confirmed.deposit.status, RentalDeposit.Status.AUTHORIZED)

        # Verify ADR-0003 allocations
        allocations = payment_attempt.rental_allocations.all()
        self.assertEqual(
            sum(a.amount_paise for a in allocations),
            sum(line.amount_paise for line in booking.lines.exclude(line_type="DEPOSIT_HOLD")),
        )
        self.assertEqual(
            sum(
                allocation.amount_paise
                for attempt in PaymentAttempt.objects.filter(
                    rental_allocations__rental_booking_line__rental_booking=booking
                ).distinct()
                for allocation in attempt.rental_allocations.all()
            ),
            total_paise,
        )

    def test_06_handover_custody_transfer(self) -> None:
        """Verify handover records condition photos and sets deposit to HELD."""
        today = date.today()
        end = today + timedelta(days=3)

        booking = create_rental_hold(
            customer=self.customer,
            asset_id=self.serialized_asset.id,
            start_date=today,
            end_date=end,
        )
        pa = self._create_payment_attempt()
        confirm_rental_booking(booking_id=booking.id, payment_attempt=pa, customer=self.customer)

        handover = record_handover(
            booking_id=booking.id,
            partner=self.partner,
            photo_urls=["https://images.vsolve.com/handover1.jpg"],
            condition_notes="Unit in brand new working condition.",
        )

        booking.refresh_from_db()
        self.assertEqual(booking.status, RentalBooking.Status.ACTIVE)
        self.assertEqual(booking.deposit.status, RentalDeposit.Status.HELD)
        self.assertEqual(handover.photo_urls[0], "https://images.vsolve.com/handover1.jpg")

    def test_07_extension_lifecycle(self) -> None:
        """Verify extension updates end date and adds line without conflict."""
        today = date.today()
        end = today + timedelta(days=3)

        booking = create_rental_hold(
            customer=self.customer,
            asset_id=self.serialized_asset.id,
            start_date=today,
            end_date=end,
        )
        pa = self._create_payment_attempt()
        confirm_rental_booking(booking_id=booking.id, payment_attempt=pa, customer=self.customer)
        record_handover(
            booking_id=booking.id,
            partner=self.partner,
            photo_urls=["https://images.vsolve.com/handover1.jpg"],
        )
        new_end = end + timedelta(days=2)
        ext = request_extension(booking_id=booking.id, new_end_date=new_end)
        self.assertEqual(ext.status, "PENDING")

        approve_extension(extension_id=ext.id, partner=self.partner)
        booking.refresh_from_db()
        self.assertEqual(booking.rental_end, end)

    def test_08_settlement_clean_return_releases_full_deposit(self) -> None:
        """Verify on-time clean return releases 100% deposit and credits vendor ledger."""
        today = date.today()
        end = today + timedelta(days=2)

        booking = create_rental_hold(
            customer=self.customer,
            asset_id=self.serialized_asset.id,
            start_date=today,
            end_date=end,
        )
        pa = self._create_payment_attempt()
        confirm_rental_booking(booking_id=booking.id, payment_attempt=pa, customer=self.customer)
        record_handover(
            booking_id=booking.id,
            partner=self.partner,
            photo_urls=["https://images.vsolve.com/handover1.jpg"],
        )

        # Inspection: no damage, 0 late days
        record_return_inspection(
            booking_id=booking.id,
            partner=self.partner,
            photo_urls=["https://images.vsolve.com/return1.jpg"],
            damage_found=False,
            damage_estimated_paise=0,
            late_days=0,
        )

        booking.refresh_from_db()
        self.assertEqual(booking.status, RentalBooking.Status.COMPLETED)
        self.assertEqual(booking.deposit.status, RentalDeposit.Status.RELEASED)
        self.assertEqual(booking.deposit.refunded_amount_paise, booking.deposit.amount_paise)

        # Vendor earning exists
        ledger = PartnerLedgerEntry.objects.filter(rental_booking=booking).first()
        self.assertIsNotNone(ledger)
        self.assertEqual(ledger.kind, PartnerLedgerEntry.Kind.EARNING)

    def test_09_settlement_minor_damage_within_cap(self) -> None:
        """Verify damage under cap (₹5,000) auto-consumes partial deposit and refunds remainder."""
        today = date.today()
        end = today + timedelta(days=2)

        booking = create_rental_hold(
            customer=self.customer,
            asset_id=self.serialized_asset.id,
            start_date=today,
            end_date=end,
        )
        pa = self._create_payment_attempt()
        confirm_rental_booking(booking_id=booking.id, payment_attempt=pa, customer=self.customer)
        record_handover(
            booking_id=booking.id,
            partner=self.partner,
            photo_urls=["https://images.vsolve.com/handover1.jpg"],
        )

        # ₹300 damage (30,000 paise), within ₹5,000 cap
        record_return_inspection(
            booking_id=booking.id,
            partner=self.partner,
            photo_urls=["https://images.vsolve.com/return1.jpg"],
            damage_found=True,
            damage_estimated_paise=30000,
            late_days=0,
        )

        booking.refresh_from_db()
        self.assertEqual(booking.status, RentalBooking.Status.COMPLETED)
        self.assertEqual(booking.deposit.status, RentalDeposit.Status.PARTIALLY_CONSUMED)
        self.assertEqual(booking.deposit.consumed_amount_paise, 30000)
        self.assertEqual(booking.deposit.refunded_amount_paise, 70000)  # 100000 - 30000

    def test_10_settlement_major_damage_exceeding_cap_opens_case(self) -> None:
        """Verify damage exceeding cap opens OperationsCase and holds deposit in DISPUTED."""
        today = date.today()
        end = today + timedelta(days=2)

        booking = create_rental_hold(
            customer=self.customer,
            asset_id=self.serialized_asset.id,
            start_date=today,
            end_date=end,
        )
        pa = self._create_payment_attempt()
        confirm_rental_booking(booking_id=booking.id, payment_attempt=pa, customer=self.customer)
        record_handover(
            booking_id=booking.id,
            partner=self.partner,
            photo_urls=["https://images.vsolve.com/handover1.jpg"],
        )

        # ₹6,000 damage (600,000 paise), exceeds ₹5,000 cap
        record_return_inspection(
            booking_id=booking.id,
            partner=self.partner,
            photo_urls=["https://images.vsolve.com/return1.jpg"],
            damage_found=True,
            damage_estimated_paise=600000,
            late_days=0,
        )

        booking.refresh_from_db()
        self.assertEqual(booking.status, RentalBooking.Status.DISPUTED)
        self.assertEqual(booking.deposit.status, RentalDeposit.Status.DISPUTED)

        # Case exists
        case = OperationsCase.objects.filter(rental_booking=booking).first()
        self.assertIsNotNone(case)
        self.assertEqual(case.kind, OperationsCase.Kind.RENTAL_DEPOSIT_DISPUTE)

    def test_21_checkout_is_idempotent_and_forged_capture_is_rejected(self) -> None:
        start = date.today() + timedelta(days=2)
        booking = create_rental_hold(
            customer=self.customer,
            asset_id=self.serialized_asset.id,
            start_date=start,
            end_date=start + timedelta(days=2),
        )
        forged = PaymentAttempt.objects.create(
            purpose=PaymentAttempt.Purpose.A7_RENTAL_BOOKING,
            status=PaymentAttempt.Status.CAPTURED,
            provider="razorpay",
            amount_paise=1,
        )
        with self.assertRaises((ValueError, InvalidRentalStateTransitionError)):
            confirm_rental_booking(
                booking_id=booking.id,
                payment_attempt=forged,
                customer=self.customer,
            )

        first = initiate_rental_checkout(
            booking_id=booking.id,
            customer=self.customer,
            idempotency_key="rental-checkout-one",
        )
        replay = initiate_rental_checkout(
            booking_id=booking.id,
            customer=self.customer,
            idempotency_key="rental-checkout-one",
        )
        duplicate_submit = initiate_rental_checkout(
            booking_id=booking.id,
            customer=self.customer,
            idempotency_key="rental-checkout-two",
        )
        self.assertEqual([item.id for item in first], [item.id for item in replay])
        self.assertEqual([item.id for item in first], [item.id for item in duplicate_submit])
        self.assertEqual(
            PaymentAttempt.objects.filter(
                rental_allocations__rental_booking_line__rental_booking=booking
            )
            .distinct()
            .count(),
            2,
        )

    def test_11_customer_deposit_dispute(self) -> None:
        """Verify customer can contest deposit deduction."""
        today = date.today()
        end = today + timedelta(days=2)

        booking = create_rental_hold(
            customer=self.customer,
            asset_id=self.serialized_asset.id,
            start_date=today,
            end_date=end,
        )
        pa = self._create_payment_attempt()
        confirm_rental_booking(booking_id=booking.id, payment_attempt=pa, customer=self.customer)
        record_handover(
            booking_id=booking.id,
            partner=self.partner,
            photo_urls=["https://images.vsolve.com/handover1.jpg"],
        )
        record_return_inspection(
            booking_id=booking.id,
            partner=self.partner,
            photo_urls=["https://images.vsolve.com/return-damage.jpg"],
            damage_found=True,
            damage_estimated_paise=600000,
        )

        case = dispute_deposit(
            booking_id=booking.id,
            customer=self.customer,
            reason="Scratch was already present at pickup time.",
        )
        booking.refresh_from_db()
        self.assertEqual(booking.status, RentalBooking.Status.DISPUTED)
        self.assertEqual(booking.deposit.status, RentalDeposit.Status.DISPUTED)
        self.assertEqual(case.rental_booking, booking)

    def test_12_operations_reassign_asset_pre_handover(self) -> None:
        """Verify Ops can reassign an unavailable asset to equivalent unit pre-handover."""
        today = date.today() + timedelta(days=1)
        end = today + timedelta(days=3)

        booking = create_rental_hold(
            customer=self.customer,
            asset_id=self.serialized_asset.id,
            start_date=today,
            end_date=end,
        )
        pa = self._create_payment_attempt()
        confirm_rental_booking(booking_id=booking.id, payment_attempt=pa, customer=self.customer)

        new_drill = RentalAsset.objects.create(
            partner=self.partner,
            variant=self.variant,
            title="Bosch Replacement Drill",
            asset_identifier="BOSCH-REP-01",
            is_serialized=True,
            daily_price_paise=35000,
            deposit_paise=100000,
            condition_grade=RentalAsset.ConditionGrade.EXCELLENT,
            current_status=RentalAsset.Status.ACTIVE,
        )

        reassigned = operations_reassign_asset(
            booking_id=booking.id,
            new_asset_id=new_drill.id,
            operator=self.operator,
        )
        self.assertEqual(reassigned.asset, new_drill)
        self.assertEqual(reassigned.reservation.asset, new_drill)

    def test_13_operations_resolve_dispute_and_settle(self) -> None:
        """Verify Ops closes dispute, records refund and consumption transactions."""
        today = date.today()
        end = today + timedelta(days=2)

        booking = create_rental_hold(
            customer=self.customer,
            asset_id=self.serialized_asset.id,
            start_date=today,
            end_date=end,
        )
        pa = self._create_payment_attempt()
        confirm_rental_booking(booking_id=booking.id, payment_attempt=pa, customer=self.customer)
        record_handover(
            booking_id=booking.id,
            partner=self.partner,
            photo_urls=["https://images.vsolve.com/handover1.jpg"],
        )
        record_return_inspection(
            booking_id=booking.id,
            partner=self.partner,
            photo_urls=["https://images.vsolve.com/return-damage.jpg"],
            damage_found=True,
            damage_estimated_paise=600000,
        )
        case = dispute_deposit(
            booking_id=booking.id,
            customer=self.customer,
            reason="Contesting scratch charge.",
        )

        proposal = {
            "case_id": case.id,
            "refund_customer_paise": 50000,
            "vendor_payout_paise": 50000,
            "resolution_note": "50-50 split agreed with customer and vendor.",
        }
        self.assertFalse(operations_resolve_dispute(operator=self.operator, **proposal))
        checker = User.objects.create(
            phone_number="+919888800098", full_name="Second Ops", is_staff=True
        )
        self.assertTrue(operations_resolve_dispute(operator=checker, **proposal))

        booking.refresh_from_db()
        self.assertEqual(booking.status, RentalBooking.Status.COMPLETED)
        self.assertEqual(booking.deposit.status, RentalDeposit.Status.RESOLVED)
        self.assertEqual(booking.deposit.refunded_amount_paise, 50000)
        self.assertEqual(booking.deposit.consumed_amount_paise, 50000)

        case.refresh_from_db()
        self.assertEqual(case.status, OperationsCase.Status.RESOLVED)

    def test_14_cancellation_free_window(self) -> None:
        """Verify free cancellation >= 24h before rental start (100% refund, 100% deposit released)."""
        future_start = date.today() + timedelta(days=3)
        future_end = future_start + timedelta(days=2)

        booking = create_rental_hold(
            customer=self.customer,
            asset_id=self.serialized_asset.id,
            start_date=future_start,
            end_date=future_end,
        )
        pa = self._create_payment_attempt()
        confirm_rental_booking(booking_id=booking.id, payment_attempt=pa, customer=self.customer)

        cancelled = cancel_rental_booking(
            booking_id=booking.id,
            customer=self.customer,
            reason="Event rescheduled",
        )
        cancelled.refresh_from_db()
        self.assertEqual(cancelled.status, RentalBooking.Status.CANCELLED)
        self.assertEqual(cancelled.reservation.status, AssetReservation.Status.RELEASED)
        self.assertEqual(cancelled.deposit.status, RentalDeposit.Status.RELEASED)
        self.assertEqual(cancelled.cancellation_reason, "Event rescheduled")

        event = OutboxEvent.objects.filter(
            aggregate_id=cancelled.id, event_type="rental_booking.cancelled"
        ).first()
        self.assertIsNotNone(event)
        self.assertEqual(event.payload.get("cancellation_fee_paise"), 0)

    def test_15_cancellation_late_window(self) -> None:
        """Verify late cancellation < 24h before start retains 1 day's rental fee and releases deposit."""
        today = date.today()
        end = today + timedelta(days=2)

        booking = create_rental_hold(
            customer=self.customer,
            asset_id=self.serialized_asset.id,
            start_date=today,
            end_date=end,
        )
        pa = self._create_payment_attempt()
        confirm_rental_booking(booking_id=booking.id, payment_attempt=pa, customer=self.customer)

        cancelled = cancel_rental_booking(
            booking_id=booking.id,
            customer=self.customer,
            reason="Late emergency cancel",
        )
        cancelled.refresh_from_db()
        self.assertEqual(cancelled.status, RentalBooking.Status.CANCELLED)
        self.assertEqual(cancelled.reservation.status, AssetReservation.Status.RELEASED)
        self.assertEqual(cancelled.deposit.status, RentalDeposit.Status.RELEASED)

        event = OutboxEvent.objects.filter(
            aggregate_id=cancelled.id, event_type="rental_booking.cancelled"
        ).first()
        self.assertIsNotNone(event)
        self.assertEqual(
            event.payload.get("cancellation_fee_paise"), self.serialized_asset.daily_price_paise
        )

    def test_16_extension_payment_and_pooled_conflict(self) -> None:
        """Verify customer extension payment flow and pooled asset capacity conflict check."""
        today = date.today() + timedelta(days=1)
        end = today + timedelta(days=2)

        booking = create_rental_hold(
            customer=self.customer,
            asset_id=self.pooled_asset.id,
            start_date=today,
            end_date=end,
        )
        pa = self._create_payment_attempt()
        confirm_rental_booking(booking_id=booking.id, payment_attempt=pa, customer=self.customer)
        record_handover(
            booking_id=booking.id,
            partner=self.partner,
            photo_urls=["https://images.vsolve.com/p1.jpg"],
        )

        # Request extension
        new_end = end + timedelta(days=2)
        ext = request_extension(booking_id=booking.id, new_end_date=new_end)
        self.assertEqual(ext.status, RentalExtension.Status.PENDING)
        approve_extension(extension_id=ext.id, partner=self.partner)

        # Customer confirms payment for extension
        ext_pa = PaymentAttempt.objects.create(
            purpose=PaymentAttempt.Purpose.A7_EXTENSION,
            status=PaymentAttempt.Status.CAPTURED,
            provider="razorpay",
            amount_paise=ext.price_delta_paise,
            currency="INR",
        )
        ext_line = booking.lines.create(
            line_type="EXTENSION",
            amount_paise=ext.price_delta_paise,
            description=f"Extension {ext.id}",
        )
        RentalPaymentAllocation.objects.create(
            payment_attempt=ext_pa,
            rental_booking_line=ext_line,
            amount_paise=ext.price_delta_paise,
        )
        confirmed_ext = confirm_extension_payment(
            extension_id=ext.id,
            payment_attempt=ext_pa,
            customer=self.customer,
        )
        self.assertEqual(confirmed_ext.status, RentalExtension.Status.APPROVED)
        booking.refresh_from_db()
        self.assertEqual(booking.rental_end, new_end)

        # Outbox event emitted
        event = OutboxEvent.objects.filter(
            aggregate_id=booking.id, event_type="rental_booking.extended"
        ).first()
        self.assertIsNotNone(event)

    def test_17_settlement_photo_evidence_requirement(self) -> None:
        """Verify damage claim without handover photos transitions to DISPUTED and creates OperationsCase."""
        today = date.today()
        end = today + timedelta(days=1)

        booking = create_rental_hold(
            customer=self.customer,
            asset_id=self.serialized_asset.id,
            start_date=today,
            end_date=end,
        )
        pa = self._create_payment_attempt()
        confirm_rental_booking(booking_id=booking.id, payment_attempt=pa, customer=self.customer)
        # Handover with empty photos
        record_handover(booking_id=booking.id, partner=self.partner, photo_urls=[])

        # Vendor claims damage without valid baseline photos
        record_return_inspection(
            booking_id=booking.id,
            partner=self.partner,
            photo_urls=["https://images.vsolve.com/return_damage.jpg"],
            damage_found=True,
            damage_estimated_paise=100000,
        )

        booking.refresh_from_db()
        self.assertEqual(booking.status, RentalBooking.Status.DISPUTED)
        self.assertEqual(booking.deposit.status, RentalDeposit.Status.DISPUTED)

        case = OperationsCase.objects.filter(rental_booking=booking).first()
        self.assertIsNotNone(case)
        self.assertEqual(case.kind, OperationsCase.Kind.RENTAL_DEPOSIT_DISPUTE)

    def test_18_settlement_excess_damage_recovery(self) -> None:
        """Verify damage exceeding deposit captures 100% of deposit and creates A7_DAMAGE_SETTLEMENT payment attempt."""
        today = date.today()
        end = today + timedelta(days=1)

        booking = create_rental_hold(
            customer=self.customer,
            asset_id=self.serialized_asset.id,
            start_date=today,
            end_date=end,
        )
        pa = self._create_payment_attempt()
        confirm_rental_booking(booking_id=booking.id, payment_attempt=pa, customer=self.customer)
        record_handover(
            booking_id=booking.id,
            partner=self.partner,
            photo_urls=["https://images.vsolve.com/h.jpg"],
        )

        # Deposit is ₹1,000 (100000 paise). Damage claim is ₹1,500 (150000 paise). Excess is ₹500 (50000 paise)
        record_return_inspection(
            booking_id=booking.id,
            partner=self.partner,
            photo_urls=["https://images.vsolve.com/r.jpg"],
            damage_found=True,
            damage_estimated_paise=150000,
        )

        booking.refresh_from_db()
        self.assertEqual(booking.status, RentalBooking.Status.RECOVERY_REQUIRED)
        self.assertEqual(booking.deposit.status, RentalDeposit.Status.FULLY_CONSUMED)
        self.assertEqual(booking.deposit.consumed_amount_paise, 100000)

        # Excess damage payment attempt created
        excess_pa = PaymentAttempt.objects.filter(
            purpose=PaymentAttempt.Purpose.A7_DAMAGE_SETTLEMENT,
            amount_paise=50000,
        ).first()
        self.assertIsNotNone(excess_pa)

    def test_19_task_sweep_expired_holds(self) -> None:
        """Verify sweep_expired_asset_reservations releases timed-out tentative holds."""
        today = date.today() + timedelta(days=5)
        end = today + timedelta(days=2)

        booking = create_rental_hold(
            customer=self.customer,
            asset_id=self.serialized_asset.id,
            start_date=today,
            end_date=end,
        )
        # Manually backdate expiration to past
        booking.reservation.expires_at = timezone.now() - timedelta(minutes=5)
        booking.reservation.save(update_fields=("expires_at",))

        count = sweep_expired_asset_reservations()
        self.assertGreaterEqual(count, 1)

        booking.refresh_from_db()
        self.assertEqual(booking.status, RentalBooking.Status.EXPIRED)
        self.assertEqual(booking.reservation.status, AssetReservation.Status.RELEASED)

    def test_20_task_sweep_maintenance_collision(self) -> None:
        """Verify sweep_maintenance_asset_blocks flags collision between maintenance and booking."""
        start = date.today() + timedelta(days=10)
        end = start + timedelta(days=3)

        booking = create_rental_hold(
            customer=self.customer,
            asset_id=self.serialized_asset.id,
            start_date=start,
            end_date=end,
        )
        pa = self._create_payment_attempt()
        confirm_rental_booking(booking_id=booking.id, payment_attempt=pa, customer=self.customer)

        # Partner introduces an overlapping maintenance window
        RentalMaintenancePeriod.objects.create(
            asset=self.serialized_asset,
            start_date=start,
            end_date=end,
            reason="Emergency scheduled motor overhaul",
        )

        flagged = sweep_maintenance_asset_blocks()
        self.assertGreaterEqual(flagged, 1)

        booking.refresh_from_db()
        self.assertEqual(booking.status, RentalBooking.Status.RECOVERY_REQUIRED)
        case = OperationsCase.objects.filter(rental_booking=booking).first()
        self.assertIsNotNone(case)

    def test_21_checkout_failure_releases_hold_and_sibling_refund(self) -> None:
        """Verify handle_rental_checkout_failure releases hold and unwinds captured sibling attempt."""
        today = date.today() + timedelta(days=1)
        end = today + timedelta(days=3)

        booking = create_rental_hold(
            customer=self.customer,
            asset_id=self.serialized_asset.id,
            start_date=today,
            end_date=end,
        )
        booking_pa = PaymentAttempt.objects.create(
            purpose=PaymentAttempt.Purpose.A7_RENTAL_BOOKING,
            status=PaymentAttempt.Status.CAPTURED,
            provider="fake",
            provider_payment_id="pay_test_booking",
            amount_paise=100000,
            currency="INR",
        )
        RentalPaymentAllocation.objects.create(
            payment_attempt=booking_pa,
            rental_booking_line=booking.lines.first(),
            amount_paise=100000,
        )

        deposit_pa = PaymentAttempt.objects.create(
            purpose=PaymentAttempt.Purpose.A7_DEPOSIT_HOLD,
            status=PaymentAttempt.Status.FAILED,
            provider="fake",
            provider_payment_id="pay_test_deposit",
            amount_paise=100000,
            currency="INR",
        )
        RentalPaymentAllocation.objects.create(
            payment_attempt=deposit_pa,
            rental_booking_line=booking.lines.first(),
            amount_paise=100000,
        )

        handle_rental_checkout_failure(payment_attempt_id=deposit_pa.id)

        booking.refresh_from_db()
        self.assertEqual(booking.status, RentalBooking.Status.FAILED)
        self.assertEqual(booking.reservation.status, AssetReservation.Status.RELEASED)

    def test_22_partner_ledger_entry_scope_constraint(self) -> None:
        """Verify payouts_ledger_entry_at_most_one_scope and payouts_earning_must_have_exactly_one_scope."""
        from django.db import IntegrityError, transaction

        today = date.today() + timedelta(days=1)
        booking = create_rental_hold(
            customer=self.customer,
            asset_id=self.serialized_asset.id,
            start_date=today,
            end_date=today + timedelta(days=2),
        )

        # 1. An EARNING with no scope set violates payouts_earning_must_have_exactly_one_scope
        with transaction.atomic():
            with self.assertRaises(IntegrityError):
                PartnerLedgerEntry.objects.create(
                    partner=self.partner,
                    kind=PartnerLedgerEntry.Kind.EARNING,
                    status=PartnerLedgerEntry.Status.PENDING,
                    gross_paise=50000,
                    commission_paise=5000,
                    net_paise=45000,
                )

        # 2. A ledger entry with valid rental_booking succeeds
        entry = PartnerLedgerEntry.objects.create(
            partner=self.partner,
            kind=PartnerLedgerEntry.Kind.EARNING,
            status=PartnerLedgerEntry.Status.PENDING,
            gross_paise=50000,
            commission_paise=5000,
            net_paise=45000,
            rental_booking=booking,
        )
        self.assertIsNotNone(entry.id)

    def test_23_rental_deposit_bounds_check_constraints(self) -> None:
        """Verify check constraints prevent refunded or consumed amounts exceeding authorized deposit."""
        from django.db import IntegrityError, transaction

        today = date.today() + timedelta(days=1)
        booking = create_rental_hold(
            customer=self.customer,
            asset_id=self.serialized_asset.id,
            start_date=today,
            end_date=today + timedelta(days=2),
        )

        deposit = booking.deposit
        deposit.amount_paise = 100000
        deposit.save()

        with transaction.atomic():
            with self.assertRaises(IntegrityError):
                deposit.refunded_amount_paise = 150000
                deposit.save()

        deposit.refresh_from_db()
        with transaction.atomic():
            with self.assertRaises(IntegrityError):
                deposit.consumed_amount_paise = 200000
                deposit.save()


class RentalConcurrencyTestSuite(TransactionTestCase):
    """Multi-threaded parallel race tests for serialized and pooled rental inventory."""

    def setUp(self) -> None:
        self.partner_user = User.objects.create(
            phone_number="+919777700001", full_name="Parallel Tool Vendor"
        )
        self.partner = PartnerProfile.objects.create(
            user=self.partner_user, display_name="Parallel Tool Rentals"
        )
        PartnerBusinessProfile.objects.create(
            partner=self.partner,
            legal_name="Parallel Tools Pvt Ltd",
            business_type=PartnerBusinessProfile.BusinessType.INDIVIDUAL,
        )
        self.category = Category.objects.create(
            slug="rental-concurrency-cat", name="Rental Concurrency", display_order=20
        )
        self.subcategory = Subcategory.objects.create(
            category=self.category,
            slug="machinery-concurrency",
            name="Machinery Concurrency",
            display_order=1,
        )
        self.service = Service.objects.create(
            subcategory=self.subcategory,
            slug="concurrency-generator",
            name="Industrial Generator",
            status=Service.Status.ACTIVE,
        )
        self.variant = ServiceVariant.objects.create(
            service=self.service,
            code="generator-standard",
            name="Generator Daily",
            pricing_strategy=ServiceVariant.PricingStrategy.DURATION,
            booking_archetype=ServiceVariant.BookingArchetype.A7_RENTAL,
        )
        self.a7_config = A7VariantConfiguration.objects.create(
            variant=self.variant,
            version=1,
            status=A7VariantConfiguration.Status.ACTIVE,
            default_deposit_paise=200000,
            late_fee_per_day_paise=50000,
            minor_damage_cap_paise=500000,
        )
        self.serialized_asset = RentalAsset.objects.create(
            partner=self.partner,
            variant=self.variant,
            title="Kirloskar Generator Serial 99",
            asset_identifier="GEN-999",
            is_serialized=True,
            daily_price_paise=50000,
            deposit_paise=200000,
            condition_grade=RentalAsset.ConditionGrade.EXCELLENT,
            current_status=RentalAsset.Status.ACTIVE,
        )
        self.pooled_asset = RentalAsset.objects.create(
            partner=self.partner,
            variant=self.variant,
            title="Heavy Duty Cables Pool",
            is_serialized=False,
            quantity_available=2,
            daily_price_paise=5000,
            deposit_paise=10000,
            condition_grade=RentalAsset.ConditionGrade.EXCELLENT,
            current_status=RentalAsset.Status.ACTIVE,
        )
        self.customers = [
            User.objects.create(
                phone_number=f"+91966660000{i}", full_name=f"Concurrency Customer {i}"
            )
            for i in range(1, 6)
        ]

    def test_parallel_serialized_asset_hold_race(self) -> None:
        """Verify that under concurrent threads, exactly 1 thread wins serialized hold."""
        start = date.today() + timedelta(days=20)
        end = start + timedelta(days=3)
        asset_id = self.serialized_asset.id
        customers = self.customers[:4]

        def attempt_hold(customer: Any) -> str:
            try:
                create_rental_hold(
                    customer=customer,
                    asset_id=asset_id,
                    start_date=start,
                    end_date=end,
                )
                return "SUCCESS"
            except AssetUnavailableError:
                return "UNAVAILABLE"
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=4) as executor:
            outcomes = list(executor.map(attempt_hold, customers))

        self.assertEqual(outcomes.count("SUCCESS"), 1)
        self.assertEqual(outcomes.count("UNAVAILABLE"), 3)

    def test_parallel_pooled_asset_capacity_race(self) -> None:
        """Verify that under concurrent threads, holds cap at quantity_available exactly."""
        start = date.today() + timedelta(days=25)
        end = start + timedelta(days=2)
        asset_id = self.pooled_asset.id
        customers = self.customers[:5]

        def attempt_pooled_hold(customer: Any) -> str:
            try:
                create_rental_hold(
                    customer=customer,
                    asset_id=asset_id,
                    start_date=start,
                    end_date=end,
                    quantity=1,
                )
                return "SUCCESS"
            except AssetUnavailableError:
                return "UNAVAILABLE"
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=5) as executor:
            outcomes = list(executor.map(attempt_pooled_hold, customers))

        self.assertEqual(outcomes.count("SUCCESS"), 2)
        self.assertEqual(outcomes.count("UNAVAILABLE"), 3)

