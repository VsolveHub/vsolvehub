"""Rental quantity stock, handover PIN, deposit dispute, and booking status filter."""

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status

from apps.catalog.models import (
    A7VariantConfiguration,
    Category,
    Service,
    ServiceVariant,
    Subcategory,
)
from apps.identity.models import Role, UserRole
from apps.partners.models import PartnerApplication, PartnerCapability, PartnerProfile
from apps.rental.models import AssetReservation, RentalBooking, RentalDeposit
from apps.rental.services import (
    RentalStateError,
    cancel_booking,
    create_asset,
    create_booking,
    dispute_deposit,
    handover_booking,
    initiate_rental_booking_payment,
    moderate_asset,
    public_assets,
    repair_ghost_asset_holds,
    return_booking,
    submit_asset,
)
from tests.helpers import force_role_client

User = get_user_model()


@pytest.fixture
def rental_world(db):
    category = Category.objects.create(slug="rental-qty-test", name="Rental Qty Test")
    sub = Subcategory.objects.create(category=category, slug="cameras", name="Cameras")
    service = Service.objects.create(
        subcategory=sub, slug="dslr", name="DSLR", status=Service.Status.ACTIVE
    )
    variant = ServiceVariant.objects.create(
        service=service,
        code="dslr-rental",
        name="DSLR rental",
        pricing_strategy=ServiceVariant.PricingStrategy.FIXED,
        booking_archetype=ServiceVariant.BookingArchetype.A7_RENTAL,
        required_skill_code="rental",
        tax_category_code="rental",
    )
    A7VariantConfiguration.objects.create(
        variant=variant,
        version=1,
        status=A7VariantConfiguration.Status.ACTIVE,
        default_deposit_paise=50000,
        min_rental_days=1,
    )
    owner = User.objects.create(phone_number="+919944440001", full_name="Qty Owner")
    partner = PartnerProfile.objects.create(
        user=owner, display_name="Qty Co", default_location_text="Hitech City pickup"
    )
    PartnerApplication.objects.create(partner=partner, status=PartnerApplication.Status.APPROVED)
    PartnerCapability.objects.create(
        partner=partner,
        variant=variant,
        archetype=ServiceVariant.BookingArchetype.A7_RENTAL,
        status=PartnerCapability.Status.APPROVED,
    )
    customer = User.objects.create(phone_number="+919944440002", full_name="Qty Customer")
    customer2 = User.objects.create(phone_number="+919944440003", full_name="Qty Customer 2")
    return {
        "variant": variant,
        "partner": partner,
        "owner": owner,
        "customer": customer,
        "customer2": customer2,
    }


def _publish_asset(world, *, quantity_available: int = 1, deposit_paise: int = 50000):
    asset = create_asset(
        partner=world["partner"],
        variant_id=world["variant"].id,
        title="Stock Camera",
        daily_rate_paise=25000,
        deposit_paise=deposit_paise,
        quantity_available=quantity_available,
        location_text="",
    )
    assert asset.location_text == "Hitech City pickup"
    assert asset.quantity_available == quantity_available
    submit_asset(asset=asset, partner=world["partner"])
    moderate_asset(asset=asset, actor=world["owner"], action="APPROVE", reason="ok")
    return asset


def _partner_client(user):
    role, _ = Role.objects.get_or_create(code="partner", defaults={"name": "Partner"})
    UserRole.objects.get_or_create(user=user, role=role, revoked_at=None)
    return force_role_client(user=user, role_code="partner")


@pytest.mark.django_db
def test_quantity_stock_blocks_third_booking(rental_world):
    asset = _publish_asset(rental_world, quantity_available=2)
    start = timezone.localdate() + timedelta(days=2)
    end = start + timedelta(days=2)
    create_booking(
        customer=rental_world["customer"],
        asset_id=asset.id,
        start_date=start,
        end_date=end,
        hold_deposit_for_demo=True,
    )
    create_booking(
        customer=rental_world["customer2"],
        asset_id=asset.id,
        start_date=start,
        end_date=end,
        hold_deposit_for_demo=True,
    )
    with pytest.raises(RentalStateError) as exc:
        create_booking(
            customer=rental_world["customer"],
            asset_id=asset.id,
            start_date=start,
            end_date=end,
            hold_deposit_for_demo=True,
        )
    assert exc.value.code == "out_of_stock"


@pytest.mark.django_db
def test_insufficient_quantity_code(rental_world):
    asset = _publish_asset(rental_world, quantity_available=2)
    start = timezone.localdate() + timedelta(days=5)
    end = start + timedelta(days=1)
    create_booking(
        customer=rental_world["customer"],
        asset_id=asset.id,
        start_date=start,
        end_date=end,
        quantity=1,
        hold_deposit_for_demo=True,
    )
    with pytest.raises(RentalStateError) as exc:
        create_booking(
            customer=rental_world["customer2"],
            asset_id=asset.id,
            start_date=start,
            end_date=end,
            quantity=2,
            hold_deposit_for_demo=True,
        )
    assert exc.value.code == "insufficient_quantity"


@pytest.mark.django_db
def test_handover_pin_required_and_dispute(rental_world):
    asset = _publish_asset(rental_world, deposit_paise=80000)
    start = timezone.localdate() + timedelta(days=1)
    booking = create_booking(
        customer=rental_world["customer"],
        asset_id=asset.id,
        start_date=start,
        end_date=start + timedelta(days=2),
        hold_deposit_for_demo=True,
    )
    pin = booking.handover_pin_hash
    assert len(pin) == 4

    with pytest.raises(RentalStateError) as bad:
        handover_booking(booking=booking, partner=rental_world["partner"], pin="0000")
    assert bad.value.code == "handover_pin_invalid"

    handover_booking(booking=booking, partner=rental_world["partner"], pin=pin)
    booking.refresh_from_db()
    assert booking.status == RentalBooking.Status.HANDOVER
    return_booking(booking=booking, partner=rental_world["partner"])
    booking.refresh_from_db()
    disputed = dispute_deposit(
        booking=booking,
        partner=rental_world["partner"],
        reason="Scratched lens barrel",
        consume_paise=30000,
    )
    assert disputed.status == RentalBooking.Status.DISPUTED
    disputed.deposit.refresh_from_db()
    assert disputed.deposit.status == RentalDeposit.Status.PARTIALLY_CONSUMED
    assert disputed.deposit.consumed_paise == 30000


@pytest.mark.django_db
def test_partner_bookings_status_filter_and_dispute_http(rental_world):
    asset = _publish_asset(rental_world, deposit_paise=60000)
    start = timezone.localdate() + timedelta(days=3)
    booking = create_booking(
        customer=rental_world["customer"],
        asset_id=asset.id,
        start_date=start,
        end_date=start + timedelta(days=1),
        hold_deposit_for_demo=True,
    )
    pin = booking.handover_pin_hash
    client = _partner_client(rental_world["owner"])

    listed = client.get("/api/v1/partner/rentals/bookings", {"status": "CONFIRMED"})
    assert listed.status_code == status.HTTP_200_OK
    assert any(row["id"] == str(booking.id) for row in listed.data)

    empty = client.get("/api/v1/partner/rentals/bookings", {"status": "DISPUTED"})
    assert empty.status_code == status.HTTP_200_OK
    assert empty.data == []

    hand = client.post(
        f"/api/v1/partner/rentals/bookings/{booking.id}/handover",
        {"pin": pin},
        format="json",
    )
    assert hand.status_code == status.HTTP_200_OK
    assert hand.data["status"] == RentalBooking.Status.HANDOVER

    ret = client.post(f"/api/v1/partner/rentals/bookings/{booking.id}/return", {}, format="json")
    assert ret.status_code == status.HTTP_200_OK

    disp = client.post(
        f"/api/v1/partner/rentals/bookings/{booking.id}/dispute-deposit",
        {"reason": "Missing charger", "consume_paise": 60000},
        format="json",
    )
    assert disp.status_code == status.HTTP_200_OK
    assert disp.data["status"] == RentalBooking.Status.DISPUTED
    assert disp.data["deposit"]["status"] == RentalDeposit.Status.FULLY_CONSUMED


def _returned_booking(world, *, deposit_paise: int = 50000):
    asset = _publish_asset(world, deposit_paise=deposit_paise)
    start = timezone.localdate() + timedelta(days=4)
    booking = create_booking(
        customer=world["customer"],
        asset_id=asset.id,
        start_date=start,
        end_date=start + timedelta(days=1),
        hold_deposit_for_demo=True,
    )
    pin = booking.handover_pin_hash
    handover_booking(booking=booking, partner=world["partner"], pin=pin)
    return_booking(booking=booking, partner=world["partner"])
    booking.refresh_from_db()
    return booking


@pytest.mark.django_db
def test_dispute_omitted_consume_paise_does_not_full_consume(rental_world):
    """Blank/omit consume_paise must dispute without consuming (default 0)."""
    booking = _returned_booking(rental_world, deposit_paise=50000)
    disputed = dispute_deposit(
        booking=booking,
        partner=rental_world["partner"],
        reason="Cosmetic scratch only",
    )
    assert disputed.status == RentalBooking.Status.DISPUTED
    disputed.deposit.refresh_from_db()
    assert disputed.deposit.consumed_paise == 0
    assert disputed.deposit.status == RentalDeposit.Status.RELEASED


@pytest.mark.django_db
def test_dispute_http_omitted_consume_paise_is_zero(rental_world):
    booking = _returned_booking(rental_world, deposit_paise=45000)
    client = _partner_client(rental_world["owner"])
    disp = client.post(
        f"/api/v1/partner/rentals/bookings/{booking.id}/dispute-deposit",
        {"reason": "Needs ops review"},
        format="json",
    )
    assert disp.status_code == status.HTTP_200_OK
    assert disp.data["status"] == RentalBooking.Status.DISPUTED
    assert disp.data["deposit"]["consumed_paise"] == 0
    assert disp.data["deposit"]["status"] == RentalDeposit.Status.RELEASED


@pytest.mark.django_db
def test_dispute_explicit_zero_consume_paise(rental_world):
    booking = _returned_booking(rental_world, deposit_paise=40000)
    disputed = dispute_deposit(
        booking=booking,
        partner=rental_world["partner"],
        reason="Flagging without withhold",
        consume_paise=0,
    )
    disputed.deposit.refresh_from_db()
    assert disputed.deposit.consumed_paise == 0
    assert disputed.deposit.status == RentalDeposit.Status.RELEASED


@pytest.mark.django_db
def test_zero_quantity_available_is_not_bookable(rental_world):
    """Fail closed: create_asset rejects qty < 1; DB CheckConstraint blocks qty=0 rows."""
    from django.db import IntegrityError, connection

    with pytest.raises(RentalStateError, match="at least 1"):
        create_asset(
            partner=rental_world["partner"],
            variant_id=rental_world["variant"].id,
            title="Zero Stock Camera",
            daily_rate_paise=25000,
            deposit_paise=50000,
            quantity_available=0,
        )

    asset = _publish_asset(rental_world, quantity_available=1)
    with pytest.raises(IntegrityError), connection.cursor() as cursor:
        cursor.execute(
            "UPDATE rental_rentalasset SET quantity_available = 0 WHERE id = %s",
            [str(asset.id)],
        )


@pytest.mark.django_db
def test_customer_handover_pin_visibility(rental_world):
    asset = _publish_asset(rental_world)
    start = timezone.localdate() + timedelta(days=17)
    booking = create_booking(
        customer=rental_world["customer"],
        asset_id=asset.id,
        start_date=start,
        end_date=start + timedelta(days=1),
        hold_deposit_for_demo=True,
    )
    pin = booking.handover_pin_hash

    role, _ = Role.objects.get_or_create(code="customer", defaults={"name": "Customer"})
    UserRole.objects.get_or_create(user=rental_world["customer"], role=role, revoked_at=None)
    customer_client = force_role_client(user=rental_world["customer"], role_code="customer")
    mine = customer_client.get("/api/v1/me/rentals")
    assert mine.status_code == status.HTTP_200_OK
    row = next(r for r in mine.data if r["id"] == str(booking.id))
    assert row["handover_pin"] == pin

    partner_client = _partner_client(rental_world["owner"])
    partner_list = partner_client.get("/api/v1/partner/rentals/bookings")
    assert partner_list.status_code == status.HTTP_200_OK
    partner_row = next(r for r in partner_list.data if r["id"] == str(booking.id))
    assert partner_row["handover_pin"] is None


@pytest.mark.django_db
def test_patch_default_location_text(rental_world):
    client = _partner_client(rental_world["owner"])
    patched = client.patch(
        "/api/v1/partner/me/",
        {"default_location_text": "New pickup bay B2"},
        format="json",
    )
    assert patched.status_code == status.HTTP_200_OK
    assert patched.data["default_location_text"] == "New pickup bay B2"
    rental_world["partner"].refresh_from_db()
    assert rental_world["partner"].default_location_text == "New pickup bay B2"

    got = client.get("/api/v1/partner/me/")
    assert got.status_code == status.HTTP_200_OK
    assert got.data["default_location_text"] == "New pickup bay B2"


@pytest.mark.django_db
def test_quantity_multi_unit_stock(rental_world):
    """Multi-unit stock tracking across overlapping and non-overlapping date windows."""
    asset = _publish_asset(rental_world, quantity_available=10, deposit_paise=20000)
    today = timezone.localdate()

    # Customer 1 books 8 items for day 5 to 7 (2 days)
    start1 = today + timedelta(days=5)
    end1 = start1 + timedelta(days=2)
    booking1 = create_booking(
        customer=rental_world["customer"],
        asset_id=asset.id,
        start_date=start1,
        end_date=end1,
        quantity=8,
        hold_deposit_for_demo=True,
    )
    assert booking1.status == RentalBooking.Status.CONFIRMED
    assert booking1.price_paise == asset.daily_rate_paise * 2 * 8
    assert booking1.deposit.amount_paise == 20000 * 8
    assert booking1.lines.first().quantity == 8

    # Non-overlapping booking: Customer 1 books 3 items for day 7 to 9 (start2 == end1)
    # This must succeed even though 8 + 3 = 11 > 10 because there is no date overlap.
    start2 = end1
    end2 = start2 + timedelta(days=2)
    booking2 = create_booking(
        customer=rental_world["customer"],
        asset_id=asset.id,
        start_date=start2,
        end_date=end2,
        quantity=3,
        hold_deposit_for_demo=True,
    )
    assert booking2.status == RentalBooking.Status.CONFIRMED
    assert booking2.lines.first().quantity == 3

    # Overlapping window: Customer 2 attempts to book 3 items for day 5 to 7
    # Only 2 units remain (10 - 8 = 2). Requesting 3 fails with insufficient_quantity.
    with pytest.raises(RentalStateError) as exc:
        create_booking(
            customer=rental_world["customer2"],
            asset_id=asset.id,
            start_date=start1,
            end_date=end1,
            quantity=3,
            hold_deposit_for_demo=True,
        )
    assert exc.value.code == "insufficient_quantity"

    # Customer 2 books remaining 2 items for day 5 to 7 -> succeeds (full 10 units now held)
    booking3 = create_booking(
        customer=rental_world["customer2"],
        asset_id=asset.id,
        start_date=start1,
        end_date=end1,
        quantity=2,
        hold_deposit_for_demo=True,
    )
    assert booking3.status == RentalBooking.Status.CONFIRMED
    assert booking3.lines.first().quantity == 2

    # Further attempt on day 5 to 7 for 1 unit fails with out_of_stock
    with pytest.raises(RentalStateError) as exc:
        create_booking(
            customer=rental_world["customer2"],
            asset_id=asset.id,
            start_date=start1,
            end_date=end1,
            quantity=1,
            hold_deposit_for_demo=True,
        )
    assert exc.value.code == "out_of_stock"


@pytest.mark.django_db
def test_multi_qty_line_blocks_oversell_out_of_stock(rental_world):
    """Stock must sum line quantities, not reservation rows.

    stock=10 + qty=8 leaves 2; a further qty=3 must fail (row-count would allow it).
    """
    asset = _publish_asset(rental_world, quantity_available=10)
    start = timezone.localdate() + timedelta(days=8)
    end = start + timedelta(days=2)
    create_booking(
        customer=rental_world["customer"],
        asset_id=asset.id,
        start_date=start,
        end_date=end,
        quantity=8,
        hold_deposit_for_demo=True,
    )
    with pytest.raises(RentalStateError) as exc:
        create_booking(
            customer=rental_world["customer2"],
            asset_id=asset.id,
            start_date=start,
            end_date=end,
            quantity=3,
            hold_deposit_for_demo=True,
        )
    # remaining=2 → insufficient_quantity; full exhaustion uses out_of_stock.
    assert exc.value.code in ("out_of_stock", "insufficient_quantity")
    assert exc.value.code == "insufficient_quantity"


@pytest.mark.django_db
def test_full_stock_qty_then_out_of_stock(rental_world):
    asset = _publish_asset(rental_world, quantity_available=10)
    start = timezone.localdate() + timedelta(days=12)
    end = start + timedelta(days=1)
    create_booking(
        customer=rental_world["customer"],
        asset_id=asset.id,
        start_date=start,
        end_date=end,
        quantity=10,
        hold_deposit_for_demo=True,
    )
    with pytest.raises(RentalStateError) as exc:
        create_booking(
            customer=rental_world["customer2"],
            asset_id=asset.id,
            start_date=start,
            end_date=end,
            quantity=1,
            hold_deposit_for_demo=True,
        )
    assert exc.value.code == "out_of_stock"


@pytest.mark.django_db
def test_cancel_releases_reservation(rental_world):
    """Cancelling a booking releases its reservation and frees up inventory immediately."""
    asset = _publish_asset(rental_world, quantity_available=2)
    start = timezone.localdate() + timedelta(days=15)
    end = start + timedelta(days=1)
    booking = create_booking(
        customer=rental_world["customer"],
        asset_id=asset.id,
        start_date=start,
        end_date=end,
        quantity=2,
        hold_deposit_for_demo=True,
    )
    cancelled = cancel_booking(booking=booking, customer=rental_world["customer"])
    assert cancelled.status == RentalBooking.Status.CANCELLED
    reservation = AssetReservation.objects.get(id=cancelled.reservation_id)
    assert reservation.status == AssetReservation.Status.RELEASED

    # Stock is free again for a full-qty rebook.
    rebook = create_booking(
        customer=rental_world["customer2"],
        asset_id=asset.id,
        start_date=start,
        end_date=end,
        quantity=2,
        hold_deposit_for_demo=True,
    )
    assert rebook.status == RentalBooking.Status.CONFIRMED


test_cancel_releases_reservation_and_frees_stock = test_cancel_releases_reservation
cancel_releases_reservation = test_cancel_releases_reservation


@pytest.mark.django_db
def test_repair_ghost_hold_releases_cancelled_confirmed_reservation(rental_world):
    asset = _publish_asset(rental_world, quantity_available=1)
    start = timezone.localdate() + timedelta(days=20)
    booking = create_booking(
        customer=rental_world["customer"],
        asset_id=asset.id,
        start_date=start,
        end_date=start + timedelta(days=1),
        hold_deposit_for_demo=True,
    )
    # Simulate historical ghost: CANCELLED booking, reservation still CONFIRMED.
    booking.status = RentalBooking.Status.CANCELLED
    booking.save(update_fields=("status", "updated_at"))
    reservation = booking.reservation
    assert reservation.status == AssetReservation.Status.CONFIRMED

    repaired = repair_ghost_asset_holds()
    assert repaired >= 1
    reservation.refresh_from_db()
    assert reservation.status == AssetReservation.Status.RELEASED


@pytest.mark.django_db
def test_repair_ghost_hold_releases_returned_confirmed_reservation(rental_world):
    asset = _publish_asset(rental_world, quantity_available=1)
    start = timezone.localdate() + timedelta(days=22)
    booking = create_booking(
        customer=rental_world["customer"],
        asset_id=asset.id,
        start_date=start,
        end_date=start + timedelta(days=1),
        hold_deposit_for_demo=True,
    )
    # Simulate historical ghost: RETURNED booking, reservation still CONFIRMED.
    booking.status = RentalBooking.Status.RETURNED
    booking.save(update_fields=("status", "updated_at"))
    reservation = booking.reservation
    reservation.status = AssetReservation.Status.CONFIRMED
    reservation.save(update_fields=("status", "updated_at"))

    repaired = repair_ghost_asset_holds(asset_id=asset.id)
    assert repaired >= 1
    reservation.refresh_from_db()
    assert reservation.status == AssetReservation.Status.RELEASED


@pytest.mark.django_db
def test_public_assets_keeps_partial_stock_visible(rental_world):
    asset = _publish_asset(rental_world, quantity_available=5)
    start = timezone.localdate() + timedelta(days=25)
    end = start + timedelta(days=2)
    create_booking(
        customer=rental_world["customer"],
        asset_id=asset.id,
        start_date=start,
        end_date=end,
        quantity=2,
        hold_deposit_for_demo=True,
    )
    visible = list(public_assets(start_date=start, end_date=end).filter(id=asset.id))
    assert len(visible) == 1

    create_booking(
        customer=rental_world["customer2"],
        asset_id=asset.id,
        start_date=start,
        end_date=end,
        quantity=3,
        hold_deposit_for_demo=True,
    )
    hidden = list(public_assets(start_date=start, end_date=end).filter(id=asset.id))
    assert hidden == []


@pytest.mark.django_db
def test_initiate_payment_multiplies_by_line_quantity(rental_world):
    asset = _publish_asset(rental_world, quantity_available=4, deposit_paise=10000)
    start = timezone.localdate() + timedelta(days=30)
    end = start + timedelta(days=2)  # 2 days
    booking = create_booking(
        customer=rental_world["customer"],
        asset_id=asset.id,
        start_date=start,
        end_date=end,
        quantity=3,
        hold_deposit_for_demo=False,
    )
    # Resume / re-initiate must match create_booking pricing (fee*days*qty + deposit*qty).
    expected = (asset.daily_rate_paise * 2 * 3) + (asset.deposit_paise * 3)
    attempt = initiate_rental_booking_payment(booking=booking)
    assert attempt.amount_paise == expected
    assert booking.price_paise == asset.daily_rate_paise * 2 * 3
