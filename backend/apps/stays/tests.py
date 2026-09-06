"""Unit and integration test suite for Stays & Accommodations (A9_STAY).

Validates:
- M3-A9-01: Happy path lifecycle (hold -> confirm -> check-in -> check-out -> deposit release &
  host ledger)
- M3-A9-02: Calendar concurrency locking on a Unit
- M3-A9-03: Benign like-for-like room reassignment (host_reassign_unit)
- M3-A9-04: Guest policy enforcement (max guests check)
- M3-A9-05: Check-in with ID verification
- M3-A9-06: Damage check-out and deposit consumption
- M3-A9-07: De-duplicated browse selector (UnitType cards with counts)
"""

from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from typing import Any
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import connections
from django.test import TestCase, TransactionTestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.cases.models import OperationsCase
from apps.catalog.models import (
    A9VariantConfiguration,
    Category,
    Service,
    ServiceVariant,
    Subcategory,
)
from apps.commerce.models import PaymentAttempt
from apps.foundation.models import OutboxEvent
from apps.partners.models import PartnerBusinessProfile, PartnerProfile
from apps.payouts.models import PartnerLedgerEntry
from apps.stays.exceptions import (
    GuestPolicyViolationError,
    InvalidStayStateTransitionError,
    UnitUnavailableError,
)
from apps.stays.models import (
    Property,
    PropertyPolicy,
    PropertyVisitRequest,
    StayCheckIn,
    StayCheckOut,
    StayDeposit,
    StayPaymentAllocation,
    StayReservation,
    StayReservationLine,
    Unit,
    UnitPricingRule,
    UnitReservation,
    UnitType,
)
from apps.stays.selectors import browse_stays, get_property_detail
from apps.stays.services import (
    cancel_stay_reservation,
    confirm_stay_extension,
    confirm_stay_reservation,
    create_stay_hold,
    dispute_stay_damage,
    host_block_unit,
    host_reassign_unit,
    initiate_stay_checkout,
    initiate_stay_extension_payment,
    operations_reassign_unit,
    operations_resolve_stay_dispute,
    record_check_in,
    record_check_out,
    record_early_checkout,
    request_stay_extension,
)
from apps.stays.tasks import sweep_expired_tentative_holds, sweep_no_show_reservations

User = get_user_model()


class StayLifecycleTests(TestCase):
    def setUp(self) -> None:
        self.host_user = User.objects.create(
            phone_number="+919888800011",
            full_name="Ramesh Kumar",
        )
        self.host_partner = PartnerProfile.objects.create(
            user=self.host_user,
            display_name="Ramesh Kumar Stays",
        )
        PartnerBusinessProfile.objects.create(
            partner=self.host_partner,
            legal_name="Ramesh Stays",
        )

        self.customer = User.objects.create(
            phone_number="+919888800022",
            full_name="Ananya Sharma",
        )
        self.operator = User.objects.create(
            phone_number="+919888800077",
            full_name="Operations Staff",
            is_staff=True,
        )

        self.property = Property.objects.create(
            partner=self.host_partner,
            title="Kondapur Luxury Residency",
            locality="Kondapur, Hyderabad",
            property_type=Property.PropertyType.INDEPENDENT_HOUSE,
        )
        PropertyPolicy.objects.create(
            property=self.property,
            max_guests_per_unit=4,
            id_verification_required=True,
            effective_from=date.today() - timedelta(days=365),
        )
        category = Category.objects.create(slug="stays", name="Stays")
        subcategory = Subcategory.objects.create(category=category, slug="rooms", name="Rooms")
        service = Service.objects.create(
            subcategory=subcategory,
            slug="stay-room",
            name="Stay room",
            status=Service.Status.ACTIVE,
        )
        variant = ServiceVariant.objects.create(
            service=service,
            code="monthly",
            name="Monthly stay",
            booking_archetype=ServiceVariant.BookingArchetype.A9_STAY,
        )
        A9VariantConfiguration.objects.create(
            variant=variant,
            version=1,
            status=A9VariantConfiguration.Status.ACTIVE,
            default_deposit_paise=6400000,
        )

        self.unit_type = UnitType.objects.create(
            property=self.property,
            variant=variant,
            name="3 BHK Villa",
            bhk="3 BHK",
            sharing_type=UnitType.SharingType.ENTIRE_PLACE,
            built_up_sqft=1800,
            is_ac=True,
        )

        self.pricing_rule = UnitPricingRule.objects.create(
            unit_type=self.unit_type,
            duration_mode=UnitPricingRule.DurationMode.MONTHLY,
            base_rate_paise=3200000,
            deposit_paise=6400000,
            maintenance_paise=200000,
            effective_from=date(2020, 1, 1),
        )

        # 2 physical units
        self.unit_1 = Unit.objects.create(
            property=self.property,
            unit_type=self.unit_type,
            unit_code="Villa #1",
        )
        self.unit_2 = Unit.objects.create(
            property=self.property,
            unit_type=self.unit_type,
            unit_code="Villa #2",
        )

    def _confirm(self, reservation: StayReservation) -> StayReservation:
        attempts = []
        for purpose, raw_lines in (
            (
                PaymentAttempt.Purpose.A9_STAY_RESERVATION,
                reservation.lines.exclude(kind=StayReservationLine.Kind.SECURITY_DEPOSIT),
            ),
            (
                PaymentAttempt.Purpose.A9_DEPOSIT_HOLD,
                reservation.lines.filter(kind=StayReservationLine.Kind.SECURITY_DEPOSIT),
            ),
        ):
            target_lines = list(raw_lines)
            total = sum(line.amount_paise for line in target_lines)
            if not total:
                continue
            attempt = PaymentAttempt.objects.create(
                purpose=purpose,
                amount_paise=total,
                currency="INR",
                provider="razorpay",
                provider_payment_id=f"pay_{purpose}_{reservation.id}",
                status=PaymentAttempt.Status.CAPTURED,
            )
            for line in target_lines:
                StayPaymentAllocation.objects.create(
                    payment_attempt=attempt,
                    stay_reservation_line=line,
                    amount_paise=line.amount_paise,
                )
            attempts.append(attempt)
        price = next(
            item for item in attempts if item.purpose == PaymentAttempt.Purpose.A9_STAY_RESERVATION
        )
        return confirm_stay_reservation(reservation.id, payment_attempt=price)

    def test_happy_path_stay_lifecycle(self) -> None:
        """Hold -> Confirm -> Check-in -> Check-out -> Settlement & Ledger."""
        start = date.today() + timedelta(days=1)
        end = date.today() + timedelta(days=31)

        # 1. Create Hold
        res = create_stay_hold(
            customer=self.customer,
            unit_type_id=self.unit_type.id,
            start_date=start,
            end_date=end,
            guest_count=2,
        )
        self.assertEqual(res.status, StayReservation.Status.HELD)
        self.assertEqual(res.unit_id, self.unit_1.id)
        self.assertEqual(res.base_amount_paise, 3200000)
        self.assertEqual(res.deposit.status, StayDeposit.Status.REQUIRED)

        # 2. Confirm reservation
        res = self._confirm(res)
        self.assertEqual(res.status, StayReservation.Status.CONFIRMED)
        self.assertEqual(res.deposit.status, StayDeposit.Status.HELD)

        # 3. Check-in
        check_in = record_check_in(
            host_partner=self.host_partner,
            reservation_id=res.id,
            id_document_type=StayCheckIn.IdDocumentType.AADHAAR,
            id_document_number="1234-5678-9012",
        )
        self.assertTrue(check_in.id_verified)
        res.refresh_from_db()
        self.assertEqual(res.status, StayReservation.Status.IN_STAY)

        # 4. Check-out (Clean condition)
        record_check_out(
            host_partner=self.host_partner,
            reservation_id=res.id,
            condition_grade=StayCheckOut.ConditionGrade.EXCELLENT,
            damage_found=False,
        )
        res.refresh_from_db()
        self.assertEqual(res.status, StayReservation.Status.COMPLETED)
        self.assertEqual(res.deposit.status, StayDeposit.Status.RELEASED)

        # 5. Ledger entry created
        ledger = PartnerLedgerEntry.objects.filter(stay_reservation=res).first()
        self.assertIsNotNone(ledger)
        self.assertEqual(ledger.status, PartnerLedgerEntry.Status.AVAILABLE)
        self.assertEqual(ledger.gross_paise, 3200000 + 200000)

    def test_concurrency_calendar_overlap_prevention(self) -> None:
        """ExclusionConstraint prevents two overlapping reservations on the same Unit."""
        start = date.today() + timedelta(days=2)
        end = date.today() + timedelta(days=10)

        # Hold Villa #1
        res1 = create_stay_hold(
            customer=self.customer,
            unit_type_id=self.unit_type.id,
            start_date=start,
            end_date=end,
        )
        self.assertEqual(res1.unit_id, self.unit_1.id)

        # Hold Villa #2 (second candidate succeeds)
        res2 = create_stay_hold(
            customer=self.customer,
            unit_type_id=self.unit_type.id,
            start_date=start,
            end_date=end,
        )
        self.assertEqual(res2.unit_id, self.unit_2.id)

        # Third hold must fail since both units are held
        with self.assertRaises(UnitUnavailableError):
            create_stay_hold(
                customer=self.customer,
                unit_type_id=self.unit_type.id,
                start_date=start,
                end_date=end,
            )

    def test_host_reassign_unit_like_for_like(self) -> None:
        """Host swaps Unit to another equivalent vacant Unit under same UnitType."""
        start = date.today() + timedelta(days=5)
        end = date.today() + timedelta(days=20)

        res = create_stay_hold(
            customer=self.customer,
            unit_type_id=self.unit_type.id,
            start_date=start,
            end_date=end,
        )
        self.assertEqual(res.unit_id, self.unit_1.id)

        # Host reassigns from Villa #1 to Villa #2
        updated = host_reassign_unit(
            host_partner=self.host_partner,
            reservation_id=res.id,
            target_unit_id=self.unit_2.id,
        )
        self.assertEqual(updated.unit_id, self.unit_2.id)

    def test_guest_policy_violation(self) -> None:
        """Guest count exceeding max_guests_per_unit is rejected."""
        start = date.today() + timedelta(days=1)
        end = date.today() + timedelta(days=5)

        with self.assertRaises(GuestPolicyViolationError):
            create_stay_hold(
                customer=self.customer,
                unit_type_id=self.unit_type.id,
                start_date=start,
                end_date=end,
                guest_count=10,  # Limit is 4
            )

    def test_browse_stays_deduplication(self) -> None:
        """De-duplicated UnitType card returned with units_available count = 2."""
        results = browse_stays(locality="Kondapur")
        self.assertEqual(len(results), 1)
        card = results[0]
        self.assertEqual(card["unit_name"], "3 BHK Villa")
        self.assertEqual(card["total_units"], 2)
        self.assertEqual(card["units_available"], 2)

    def test_cancellation_moderate_policy_and_hold_release(self) -> None:
        """M3-A9-02: Cancellation refunds deposit 100% and releases unit calendar."""
        start = date.today() + timedelta(days=10)
        end = date.today() + timedelta(days=20)

        # Set policy to MODERATE
        policy = self.property.policy
        policy.cancellation_policy = "MODERATE"
        policy.save(update_fields=["cancellation_policy"])

        res = create_stay_hold(
            customer=self.customer,
            unit_type_id=self.unit_type.id,
            start_date=start,
            end_date=end,
        )
        res = self._confirm(res)
        self.assertEqual(res.status, StayReservation.Status.CONFIRMED)

        # Cancel reservation (> 5 days before check-in -> 100% refund for MODERATE)
        cancelled = cancel_stay_reservation(
            customer=self.customer, reservation_id=res.id, reason="Customer cancelled"
        )
        self.assertEqual(cancelled.status, StayReservation.Status.CANCELLED)
        self.assertFalse(
            UnitReservation.objects.filter(
                unit=res.unit,
                status__in=(UnitReservation.Status.TENTATIVE, UnitReservation.Status.CONFIRMED),
            ).exists()
        )

        cancelled.deposit.refresh_from_db()
        self.assertEqual(cancelled.deposit.status, StayDeposit.Status.RELEASED)
        self.assertEqual(cancelled.deposit.refunded_amount_paise, cancelled.deposit_amount_paise)

    def test_stay_extension_and_calendar_widening(self) -> None:
        """M3-A9-05: Extension widens UnitReservation calendar and charges price delta."""
        start = date.today() + timedelta(days=2)
        end = date.today() + timedelta(days=7)

        res = create_stay_hold(
            customer=self.customer,
            unit_type_id=self.unit_type.id,
            start_date=start,
            end_date=end,
        )
        res = self._confirm(res)

        ext = request_stay_extension(
            customer=self.customer, reservation_id=res.id, additional_nights=3
        )
        self.assertEqual(ext.additional_nights, 3)
        self.assertEqual(ext.status, "PENDING_PAYMENT")
        self.assertEqual(ext.extended_end_date, end + timedelta(days=3))

        # Confirm extension
        ext_line = StayReservationLine.objects.create(
            stay_reservation=res,
            kind=StayReservationLine.Kind.ROOM_CHARGE,
            description=f"Stay Extension {ext.id}",
            amount_paise=ext.additional_amount_paise,
        )
        ext_payment = PaymentAttempt.objects.create(
            purpose=PaymentAttempt.Purpose.A9_EXTENSION,
            amount_paise=ext.additional_amount_paise,
            currency="INR",
            provider="razorpay",
            status=PaymentAttempt.Status.CAPTURED,
        )
        StayPaymentAllocation.objects.create(
            payment_attempt=ext_payment,
            stay_reservation_line=ext_line,
            amount_paise=ext.additional_amount_paise,
        )
        updated_res = confirm_stay_extension(ext.id, payment_attempt=ext_payment)
        self.assertEqual(updated_res.end_date, end + timedelta(days=3))
        active_hold = UnitReservation.objects.filter(
            unit=res.unit,
            status=UnitReservation.Status.CONFIRMED,
        ).first()
        self.assertIsNotNone(active_hold)
        self.assertEqual(active_hold.occupied_range.upper.date(), end + timedelta(days=3))

    def test_early_checkout_trims_calendar(self) -> None:
        """M3-A9-04: Early checkout trims occupied range to free unit inventory."""
        start = date.today()
        end = date.today() + timedelta(days=15)

        res = create_stay_hold(
            customer=self.customer,
            unit_type_id=self.unit_type.id,
            start_date=start,
            end_date=end,
        )
        res = self._confirm(res)
        res.status = StayReservation.Status.IN_STAY
        res.save(update_fields=["status"])

        early_date = date.today() + timedelta(days=5)
        early_res = record_early_checkout(
            user=self.customer, reservation_id=res.id, early_checkout_date=early_date
        )
        self.assertEqual(early_res.status, StayReservation.Status.EARLY_CHECKOUT)
        active_hold = UnitReservation.objects.filter(
            unit=res.unit,
            status=UnitReservation.Status.CONFIRMED,
        ).first()
        self.assertIsNotNone(active_hold)
        self.assertEqual(active_hold.occupied_range.upper.date(), early_date)

    def test_damage_dispute_and_operations_maker_checker_resolution(self) -> None:
        """M3-A9-06: Customer disputes damage deduction -> OpsCase opened ->
        Ops overrides deposit.
        """
        start = date.today() - timedelta(days=10)
        end = date.today() - timedelta(days=2)

        res = create_stay_hold(
            customer=self.customer,
            unit_type_id=self.unit_type.id,
            start_date=start,
            end_date=end,
        )
        res = self._confirm(res)
        record_check_in(
            host_partner=self.host_partner,
            reservation_id=res.id,
            id_document_number="123456789012",
            condition_photo_urls=["https://images.vsolve.com/check-in.jpg"],
        )
        record_check_out(
            host_partner=self.host_partner,
            reservation_id=res.id,
            damage_found=True,
            damage_estimate_paise=50000,
            condition_photo_urls=["https://images.vsolve.com/check-out.jpg"],
        )

        disputed = dispute_stay_damage(
            customer=self.customer,
            reservation_id=res.id,
            dispute_reason="Floor damage was pre-existing",
        )
        self.assertEqual(disputed.deposit.status, StayDeposit.Status.DISPUTED)
        self.assertTrue(
            OperationsCase.objects.filter(kind=OperationsCase.Kind.STAY_DAMAGE_DISPUTE).exists()
        )

        # Operations resolves dispute: ₹500 deduction, rest refunded
        ops_user = User.objects.create(
            phone_number="+919888800099", full_name="Ops Lead", is_staff=True
        )
        proposal = {
            "reservation_id": res.id,
            "final_consumed_amount_paise": 50000,
            "resolution_notes": (
                "Customer provided move-in photo proof. Minor cleaning fee of ₹500 assessed."
            ),
            "refund_deposit": True,
        }
        deposit, resolved = operations_resolve_stay_dispute(
            ops_user=ops_user,
            **proposal,
        )
        self.assertFalse(resolved)
        checker = User.objects.create(
            phone_number="+919888800098", full_name="Ops Checker", is_staff=True
        )
        deposit, resolved = operations_resolve_stay_dispute(
            ops_user=checker,
            **proposal,
        )
        self.assertTrue(resolved)
        res.refresh_from_db()
        self.assertEqual(res.status, StayReservation.Status.COMPLETED)
        deposit.refresh_from_db()
        self.assertEqual(deposit.consumed_amount_paise, 50000)
        self.assertEqual(deposit.refunded_amount_paise, res.deposit_amount_paise - 50000)

    def test_sweep_expired_tentative_holds(self) -> None:
        """M3-BE-341: Celery sweep removes stale holds and releases units."""
        start = date.today() + timedelta(days=5)
        end = date.today() + timedelta(days=10)

        res = create_stay_hold(
            customer=self.customer,
            unit_type_id=self.unit_type.id,
            start_date=start,
            end_date=end,
        )
        # Fast forward hold expiration to past on UnitReservation
        UnitReservation.objects.filter(
            unit=res.unit,
            status=UnitReservation.Status.TENTATIVE,
        ).update(expires_at=timezone.now() - timedelta(minutes=5))

        # Fast forward created_at on StayReservation
        StayReservation.objects.filter(id=res.id).update(
            created_at=timezone.now() - timedelta(minutes=20)
        )

        swept_count = sweep_expired_tentative_holds()
        self.assertGreaterEqual(swept_count, 1)

        res.refresh_from_db()
        self.assertEqual(res.status, StayReservation.Status.EXPIRED)
        self.assertFalse(
            UnitReservation.objects.filter(
                unit=res.unit,
                status=UnitReservation.Status.TENTATIVE,
            ).exists()
        )

    def test_outbox_events_emitted_during_lifecycle(self) -> None:
        """Verify outbox events are emitted across key lifecycle transitions (§10.1)."""
        start = date.today() + timedelta(days=2)
        end = date.today() + timedelta(days=15)
        res = create_stay_hold(
            customer=self.customer,
            unit_type_id=self.unit_type.id,
            start_date=start,
            end_date=end,
        )
        confirmed = self._confirm(res)
        self.assertTrue(
            OutboxEvent.objects.filter(
                aggregate_type="StayReservation",
                aggregate_id=confirmed.id,
                event_type="stay_reservation.confirmed",
            ).exists()
        )

        record_check_in(
            host_partner=self.host_partner,
            reservation_id=confirmed.id,
            id_document_number="123456789012",
        )
        self.assertTrue(
            OutboxEvent.objects.filter(
                aggregate_type="StayReservation",
                aggregate_id=confirmed.id,
                event_type="stay_reservation.checked_in",
            ).exists()
        )

        record_check_out(
            host_partner=self.host_partner,
            reservation_id=confirmed.id,
            damage_found=False,
        )
        self.assertTrue(
            OutboxEvent.objects.filter(
                aggregate_type="StayReservation",
                aggregate_id=confirmed.id,
                event_type="stay_reservation.checked_out",
            ).exists()
        )
        self.assertTrue(
            OutboxEvent.objects.filter(
                aggregate_type="StayReservation",
                aggregate_id=confirmed.id,
                event_type="stay_reservation.settled",
            ).exists()
        )

    def test_checkout_is_idempotent_and_forged_capture_is_rejected(self) -> None:
        start = date.today() + timedelta(days=2)
        reservation = create_stay_hold(
            customer=self.customer,
            unit_type_id=self.unit_type.id,
            start_date=start,
            end_date=start + timedelta(days=10),
        )
        forged = PaymentAttempt.objects.create(
            purpose=PaymentAttempt.Purpose.A9_STAY_RESERVATION,
            amount_paise=1,
            currency="INR",
            provider="razorpay",
            status=PaymentAttempt.Status.CAPTURED,
        )
        with self.assertRaises((ValueError, InvalidStayStateTransitionError)):
            confirm_stay_reservation(reservation.id, payment_attempt=forged)

        first = initiate_stay_checkout(
            reservation_id=reservation.id,
            customer=self.customer,
            idempotency_key="stay-checkout-one",
        )
        replay = initiate_stay_checkout(
            reservation_id=reservation.id,
            customer=self.customer,
            idempotency_key="stay-checkout-one",
        )
        duplicate_submit = initiate_stay_checkout(
            reservation_id=reservation.id,
            customer=self.customer,
            idempotency_key="stay-checkout-two",
        )
        self.assertEqual([item.id for item in first], [item.id for item in replay])
        self.assertEqual([item.id for item in first], [item.id for item in duplicate_submit])
        self.assertEqual(
            PaymentAttempt.objects.filter(
                stay_allocations__stay_reservation_line__stay_reservation=reservation
            )
            .distinct()
            .count(),
            2,
        )

    def test_requested_duration_requires_its_own_effective_price(self) -> None:
        start = date.today() + timedelta(days=2)
        self.assertEqual(
            browse_stays(
                duration_mode=UnitPricingRule.DurationMode.WEEKLY,
                start_date=start,
                end_date=start + timedelta(days=7),
            ),
            [],
        )
        with self.assertRaises(ValueError):
            create_stay_hold(
                customer=self.customer,
                unit_type_id=self.unit_type.id,
                start_date=start,
                end_date=start + timedelta(days=7),
                duration_mode=UnitPricingRule.DurationMode.WEEKLY,
            )
        self.assertFalse(StayReservation.objects.exists())
        self.assertFalse(UnitReservation.objects.exists())

    def test_nightly_override_is_applied_without_mode_conversion(self) -> None:
        start = date.today() + timedelta(days=2)
        nightly = UnitPricingRule.objects.create(
            unit_type=self.unit_type,
            duration_mode=UnitPricingRule.DurationMode.NIGHTLY,
            base_rate_paise=100000,
            deposit_paise=200000,
        )
        nightly.overrides.create(date=start + timedelta(days=1), rate_paise=150000)
        reservation = create_stay_hold(
            customer=self.customer,
            unit_type_id=self.unit_type.id,
            start_date=start,
            end_date=start + timedelta(days=3),
            duration_mode=UnitPricingRule.DurationMode.NIGHTLY,
        )
        self.assertEqual(reservation.base_amount_paise, 350000)

    def test_property_and_filter_browse_share_price_and_availability(self) -> None:
        start = date.today() + timedelta(days=2)
        end = start + timedelta(days=10)
        create_stay_hold(
            customer=self.customer,
            unit_type_id=self.unit_type.id,
            start_date=start,
            end_date=end,
        )
        filter_card = browse_stays(
            unit_type_id=self.unit_type.id,
            start_date=start,
            end_date=end,
            duration_mode=UnitPricingRule.DurationMode.MONTHLY,
        )[0]
        property_detail = get_property_detail(
            self.property.id,
            start_date=start,
            end_date=end,
            duration_mode=UnitPricingRule.DurationMode.MONTHLY,
        )
        self.assertIsNotNone(property_detail)
        property_card = property_detail["unit_types"][0]
        self.assertEqual(filter_card["price_paise"], property_card["base_rate_paise"])
        self.assertEqual(filter_card["units_available"], property_card["units_available"])

    def test_host_reassignment_conflict_preserves_original_unit(self) -> None:
        start = date.today() + timedelta(days=2)
        end = start + timedelta(days=10)
        original = create_stay_hold(
            customer=self.customer,
            unit_type_id=self.unit_type.id,
            start_date=start,
            end_date=end,
        )
        create_stay_hold(
            customer=self.customer,
            unit_type_id=self.unit_type.id,
            start_date=start,
            end_date=end,
        )
        with self.assertRaises(UnitUnavailableError):
            host_reassign_unit(
                host_partner=self.host_partner,
                reservation_id=original.id,
                target_unit_id=self.unit_2.id,
            )
        original.refresh_from_db()
        self.assertEqual(original.unit_id, self.unit_1.id)

    def test_identity_is_masked_hashed_and_damage_requires_both_evidence_sets(self) -> None:
        start = date.today() + timedelta(days=1)
        reservation = self._confirm(
            create_stay_hold(
                customer=self.customer,
                unit_type_id=self.unit_type.id,
                start_date=start,
                end_date=start + timedelta(days=10),
            )
        )
        check_in = record_check_in(
            host_partner=self.host_partner,
            reservation_id=reservation.id,
            id_document_number="1234-5678-9012",
            condition_photo_urls=[],
        )
        self.assertEqual(check_in.id_document_number, "****9012")
        self.assertEqual(len(check_in.id_document_hash), 64)
        self.assertNotIn("1234", check_in.id_document_number)
        with self.assertRaises(InvalidStayStateTransitionError):
            record_check_out(
                host_partner=self.host_partner,
                reservation_id=reservation.id,
                damage_found=True,
                damage_estimate_paise=10000,
                condition_photo_urls=["https://images.vsolve.com/check-out.jpg"],
            )

    @patch("apps.stays.tasks.request_standalone_refund")
    def test_no_show_uses_snapshot_and_does_not_double_charge_deposit(self, refund) -> None:
        policy = self.property.policy
        policy.no_show_first_night_charge_basis_points = 10000
        policy.no_show_deposit_forfeit_basis_points = 2500
        policy.save(
            update_fields=(
                "no_show_first_night_charge_basis_points",
                "no_show_deposit_forfeit_basis_points",
            )
        )
        start = date.today()
        reservation = self._confirm(
            create_stay_hold(
                customer=self.customer,
                unit_type_id=self.unit_type.id,
                start_date=start,
                end_date=start + timedelta(days=10),
            )
        )
        reservation.policy_snapshot["check_in_time"] = "00:00:00"
        reservation.policy_snapshot["no_show_grace_minutes"] = 0
        reservation.save(update_fields=("policy_snapshot",))

        self.assertEqual(sweep_no_show_reservations(), 1)
        reservation.refresh_from_db()
        reservation.deposit.refresh_from_db()
        first_night = round(reservation.base_amount_paise / reservation.total_nights)
        deposit_forfeit = reservation.deposit_amount_paise * 2500 // 10000
        self.assertEqual(reservation.status, StayReservation.Status.NO_SHOW)
        self.assertEqual(reservation.deposit.consumed_amount_paise, deposit_forfeit)
        self.assertEqual(
            reservation.deposit.refunded_amount_paise,
            reservation.deposit_amount_paise - deposit_forfeit,
        )
        refund_amounts = sorted(call.kwargs["amount_paise"] for call in refund.call_args_list)
        self.assertEqual(
            refund_amounts,
            sorted(
                [
                    reservation.base_amount_paise
                    + reservation.maintenance_amount_paise
                    + reservation.tax_amount_paise
                    - first_night,
                    reservation.deposit_amount_paise - deposit_forfeit,
                ]
            ),
        )

    def test_host_block_unit_triggers_recovery_required(self) -> None:
        """Host blocks unit -> active reservations move to RECOVERY_REQUIRED -> Ops reassigns."""
        start = date.today() + timedelta(days=12)
        end = start + timedelta(days=5)

        hold = create_stay_hold(
            customer=self.customer,
            unit_type_id=self.unit_type.id,
            start_date=start,
            end_date=end,
        )
        res = self._confirm(hold)
        self.assertEqual(res.status, StayReservation.Status.CONFIRMED)
        assigned_unit = res.unit

        # Host blocks assigned unit
        unit, impacted = host_block_unit(
            partner_user=self.host_user,
            unit_id=assigned_unit.id,
            reason="Plumbing emergency repair",
        )
        self.assertEqual(impacted, 1)
        self.assertEqual(unit.current_status, Unit.Status.MAINTENANCE)

        res.refresh_from_db()
        self.assertEqual(res.status, StayReservation.Status.RECOVERY_REQUIRED)

        # Ops reassigns to unit_2 (same UnitType)
        other_unit = self.unit_2 if assigned_unit.id == self.unit_1.id else self.unit_1
        reassigned = operations_reassign_unit(
            ops_user=self.operator,
            reservation_id=res.id,
            target_unit_id=other_unit.id,
            reason="Reassigned after host maintenance block",
        )
        self.assertEqual(reassigned.status, StayReservation.Status.CONFIRMED)
        self.assertEqual(reassigned.unit.id, other_unit.id)

    def test_stay_extension_independent_deposit_delta(self) -> None:
        """Verify extension records and captures independent deposit delta."""
        start = date.today() + timedelta(days=18)
        end = start + timedelta(days=30)

        hold = create_stay_hold(
            customer=self.customer,
            unit_type_id=self.unit_type.id,
            start_date=start,
            end_date=end,
            duration_mode=UnitPricingRule.DurationMode.MONTHLY,
        )
        res = self._confirm(hold)
        initial_deposit = res.deposit.authorized_amount_paise

        # Request extension with an explicit deposit delta
        ext = request_stay_extension(
            customer=self.customer,
            reservation_id=res.id,
            additional_months=1,
            additional_deposit_paise=250000,
        )
        self.assertEqual(ext.additional_deposit_paise, 250000)

        # Initiate payment
        attempt = initiate_stay_extension_payment(
            extension_id=ext.id,
            customer=self.customer,
            idempotency_key=f"ext-pay-test:{ext.id}",
        )
        attempt.status = PaymentAttempt.Status.CAPTURED
        attempt.save(update_fields=["status"])

        updated_res = confirm_stay_extension(ext.id, payment_attempt=attempt)
        updated_res.deposit.refresh_from_db()
        self.assertEqual(
            updated_res.deposit.authorized_amount_paise,
            initial_deposit + 250000,
        )

    def test_unpaid_reservation_receipt_blocked_and_paid_allowed(self) -> None:
        start = date.today() + timedelta(days=10)
        end = start + timedelta(days=30)
        res = create_stay_hold(
            customer=self.customer,
            unit_type_id=self.unit_type.id,
            start_date=start,
            end_date=end,
            duration_mode=UnitPricingRule.DurationMode.MONTHLY,
        )

        client = APIClient()
        client.force_authenticate(user=self.customer)

        # Held/unpaid reservation must return 409 Conflict
        url = f"/api/v1/stays/reservations/{res.id}/receipt/"
        response = client.get(url)
        self.assertEqual(response.status_code, 409)

        # Confirm reservation with payment capture
        self._confirm(res)

        # Confirmed paid reservation returns 200 PDF
        response = client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")

    def test_property_visit_request_creation(self) -> None:
        client = APIClient()
        visit_date = (date.today() + timedelta(days=5)).isoformat()
        payload = {
            "visitor_name": "Kiran Patel",
            "visitor_phone": "+919876543210",
            "visitor_email": "kiran@example.com",
            "preferred_date": visit_date,
            "time_slot": "11:00 AM - 12:00 PM",
            "notes": "Looking for immediate move-in",
        }
        url = f"/api/v1/stays/properties/{self.property.id}/visits/"
        response = client.post(url, data=payload, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["visitor_name"], "Kiran Patel")
        self.assertEqual(response.data["time_slot"], "11:00 AM - 12:00 PM")

        # Verify DB persistence
        visit = PropertyVisitRequest.objects.get(id=response.data["id"])
        self.assertEqual(visit.property, self.property)
        self.assertEqual(visit.status, PropertyVisitRequest.Status.REQUESTED)


class StayConcurrencyTestSuite(TransactionTestCase):
    """Multi-threaded parallel race tests for physical unit calendar holds."""

    def setUp(self) -> None:
        self.host_user = User.objects.create(
            phone_number="+919555500001", full_name="Parallel Stay Host"
        )
        self.partner = PartnerProfile.objects.create(
            user=self.host_user, display_name="Parallel Host"
        )
        PartnerBusinessProfile.objects.create(
            partner=self.partner,
            legal_name="Parallel Stays LLP",
            business_type=PartnerBusinessProfile.BusinessType.INDIVIDUAL,
        )
        self.category = Category.objects.create(
            slug="stays-concurrency-cat", name="Stays Concurrency", display_order=30
        )
        self.subcategory = Subcategory.objects.create(
            category=self.category,
            slug="co-living-concurrency",
            name="Co-Living Concurrency",
            display_order=1,
        )
        self.service = Service.objects.create(
            subcategory=self.subcategory,
            slug="parallel-stay-svc",
            name="Parallel Stay Studio",
            status=Service.Status.ACTIVE,
        )
        self.variant = ServiceVariant.objects.create(
            service=self.service,
            code="parallel-studio-standard",
            name="Parallel Studio Standard",
            pricing_strategy=ServiceVariant.PricingStrategy.DURATION,
            booking_archetype=ServiceVariant.BookingArchetype.A9_STAY,
        )
        self.a9_config = A9VariantConfiguration.objects.create(
            variant=self.variant,
            version=1,
            status=A9VariantConfiguration.Status.ACTIVE,
            deposit_required=True,
            default_deposit_paise=100000,
        )
        self.property = Property.objects.create(
            partner=self.partner,
            title="Single Room Studio Villa",
            property_type=Property.PropertyType.INDEPENDENT_HOUSE,
            locality="Hitech City",
        )
        self.policy = PropertyPolicy.objects.create(
            property=self.property,
            cancellation_policy=PropertyPolicy.CancellationPolicy.FLEXIBLE,
        )
        self.unit_type = UnitType.objects.create(
            property=self.property,
            variant=self.variant,
            name="Single Luxury Studio",
            sharing_type=UnitType.SharingType.PRIVATE,
            is_ac=True,
            bathroom_type=UnitType.BathroomType.ATTACHED,
            furnishing_status=UnitType.FurnishingStatus.FULLY_FURNISHED,
        )
        self.pricing_rule = UnitPricingRule.objects.create(
            unit_type=self.unit_type,
            duration_mode=UnitPricingRule.DurationMode.DAILY,
            base_rate_paise=150000,
            deposit_paise=100000,
        )
        # Exactly ONE physical unit
        self.sole_unit = Unit.objects.create(
            property=self.property,
            unit_type=self.unit_type,
            unit_code="SOLO-101",
            current_status=Unit.Status.ACTIVE,
        )
        self.customers = [
            User.objects.create(phone_number=f"+91944440000{i}", full_name=f"Stay Racer {i}")
            for i in range(1, 4)
        ]

    def test_parallel_unit_calendar_hold_race(self) -> None:
        """Verify that under concurrent threads on 1 unit,
        exactly 1 thread wins the calendar hold.
        """
        start = date.today() + timedelta(days=35)
        end = start + timedelta(days=3)
        unit_type_id = self.unit_type.id
        customers = self.customers

        def attempt_hold(customer: Any) -> str:
            try:
                create_stay_hold(
                    customer=customer,
                    unit_type_id=unit_type_id,
                    start_date=start,
                    end_date=end,
                    duration_mode=UnitPricingRule.DurationMode.DAILY,
                )
                return "SUCCESS"
            except UnitUnavailableError:
                return "UNAVAILABLE"
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=3) as executor:
            outcomes = list(executor.map(attempt_hold, customers))

        self.assertEqual(outcomes.count("SUCCESS"), 1)
        self.assertEqual(outcomes.count("UNAVAILABLE"), 2)
