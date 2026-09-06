"""API views for Rental Services (A7_RENTAL)."""

from datetime import date
from uuid import UUID

from django.shortcuts import get_object_or_404
from django.db.models import Q
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, OpenApiTypes, extend_schema
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.commerce.models import PaymentAttempt
from apps.commerce.serializers import PaymentAttemptSerializer
from apps.foundation.services import execute_idempotent
from apps.identity.models import User
from apps.partners.models import PartnerCapability, PartnerProfile
from apps.partners.permissions import (
    HasApprovedPartnerCapability,
    IsOperationsUser,
    IsPartnerUser,
)
from apps.partners.selectors import partner_profile_for_user
from apps.rentals.exceptions import RentalError
from apps.rentals.models import (
    RentalAsset,
    RentalAssetMedia,
    RentalBooking,
    RentalMaintenancePeriod,
)

from apps.rentals.selectors import (
    get_booking_detail,
    get_rental_listing_groups,
    get_rental_variant_options,
)
from apps.rentals.serializers import (
    CancelRentalBookingInputSerializer,
    ConfirmExtensionPaymentInputSerializer,
    DisputeDepositInputSerializer,
    OperationsReassignInputSerializer,
    OperationsResolveDisputeInputSerializer,
    RecordHandoverInputSerializer,
    RecordReturnInspectionInputSerializer,
    RentalAssetMediaCreateSerializer,
    RentalAssetMediaSerializer,
    RentalAssetSerializer,
    RentalBookingDetailSerializer,
    RentalHoldCreateSerializer,
    RentalListingGroupSerializer,
    RentalMaintenancePeriodCreateSerializer,
    RentalMaintenancePeriodSerializer,
    RentalPaymentAttemptsSerializer,
    RentalVariantOptionSerializer,
    RequestExtensionInputSerializer,
)


IDEMPOTENCY_HEADER = OpenApiParameter(
    name="Idempotency-Key",
    type=OpenApiTypes.STR,
    location=OpenApiParameter.HEADER,
    required=True,
    description="Stable unique key for safe command replay.",
)
from apps.rentals.services import (
    approve_extension,
    cancel_rental_booking,
    confirm_rental_booking,
    create_rental_hold,
    dispute_deposit,
    initiate_rental_checkout,
    initiate_rental_extension_payment,
    initiate_return,
    operations_reassign_asset,
    operations_resolve_dispute,
    record_handover,
    record_return_inspection,
    reject_extension,
    request_extension,
)


class HasApprovedA7Capability(HasApprovedPartnerCapability):
    archetype = "A7_RENTAL"


def _resolve_customer(request: Request) -> User:
    """Resolve the authenticated customer without a demo-account fallback."""
    user = request.user
    if isinstance(user, User) and user.is_authenticated:
        return user
    raise NotFound("Customer not found")


def _resolve_partner(request: Request) -> PartnerProfile:
    """Resolve only the authenticated caller's own partner profile."""
    partner = partner_profile_for_user(request.user)
    if partner is None:
        raise NotFound("Partner profile not found")
    return partner


def _require_variant_capability(partner: PartnerProfile, variant_id: UUID) -> None:
    approved = (
        PartnerCapability.objects.filter(
            partner=partner,
            variant_id=variant_id,
            archetype="A7_RENTAL",
            status=PartnerCapability.Status.APPROVED,
        )
        .filter(Q(expires_at__isnull=True) | Q(expires_at__gt=timezone.now()))
        .exists()
    )
    if not approved:
        raise PermissionDenied("This rental product is not approved for your workspace.")


class RentalBrowseView(APIView):
    """Customer discovery: returns de-duplicated vendor storefront cards for a product type."""

    permission_classes = [AllowAny]
    serializer_class = RentalListingGroupSerializer

    @extend_schema(responses=RentalListingGroupSerializer(many=True))
    def get(self, request: Request) -> Response:
        service_slug = request.query_params.get("service_slug")
        variant_id = request.query_params.get("variant_id")
        asset_id = request.query_params.get("asset_id")
        start_str = request.query_params.get("start_date")
        end_str = request.query_params.get("end_date")

        start_date = date.fromisoformat(start_str) if start_str else None
        end_date = date.fromisoformat(end_str) if end_str else None

        groups = get_rental_listing_groups(
            service_slug=service_slug,
            service_variant_id=variant_id,
            asset_id=asset_id,
            start_date=start_date,
            end_date=end_date,
        )
        serializer = RentalListingGroupSerializer(groups, many=True)
        return Response(serializer.data)


class RentalHoldCreateView(APIView):
    """Customer initiates checkout by locking an asset hold."""

    permission_classes = [IsAuthenticated]
    serializer_class = RentalHoldCreateSerializer

    @extend_schema(
        request=RentalHoldCreateSerializer,
        responses={201: RentalBookingDetailSerializer},
        parameters=[IDEMPOTENCY_HEADER],
    )
    def post(self, request: Request) -> Response:
        key = request.headers.get("Idempotency-Key", "").strip()
        if not key:
            return Response(
                {"error": "Idempotency-Key header is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = RentalHoldCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            customer = _resolve_customer(request)
            result = execute_idempotent(
                actor=customer,
                operation="rentals.create_hold",
                key=key,
                request_payload=request.data,
                command=lambda: self._create_hold(customer=customer, data=data),
            )
            return Response(result.body, status=result.status_code)
        except RentalError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_409_CONFLICT)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    @staticmethod
    def _create_hold(*, customer: User, data: dict) -> tuple[int, dict]:
        booking = create_rental_hold(
            customer=customer,
            asset_id=data["asset_id"],
            start_date=data["start_date"],
            end_date=data["end_date"],
            quantity=data["quantity"],
            delivery_mode=data["delivery_mode"],
            delivery_address_id=data.get("delivery_address_id"),
        )
        detail = get_booking_detail(booking.id)
        return status.HTTP_201_CREATED, dict(RentalBookingDetailSerializer(detail).data)


class RentalBookingDetailView(APIView):
    """Detail view for a rental booking, scoped to the requesting customer."""

    permission_classes = [IsAuthenticated]
    serializer_class = RentalBookingDetailSerializer

    def get(self, request: Request, booking_id: UUID) -> Response:
        customer = _resolve_customer(request)
        booking = get_object_or_404(RentalBooking, id=booking_id, customer=customer)
        detail = get_booking_detail(booking.id)
        return Response(RentalBookingDetailSerializer(detail).data)


class RentalCustomerBookingsView(APIView):
    """Customer's active and historical rentals."""

    permission_classes = [IsAuthenticated]
    serializer_class = RentalBookingDetailSerializer

    def get(self, request: Request) -> Response:
        customer = _resolve_customer(request)
        bookings = (
            RentalBooking.objects.filter(customer=customer)
            .select_related(
                "asset",
                "asset__partner",
                "asset__variant",
                "delivery_address",
                "handover",
                "return_inspection",
                "deposit",
            )
            .prefetch_related("lines", "extensions")
        )
        tab = request.query_params.get("tab")
        if tab in ("active", "upcoming"):
            bookings = bookings.filter(
                status__in=[
                    RentalBooking.Status.HELD,
                    RentalBooking.Status.PAYMENT_PENDING,
                    RentalBooking.Status.CONFIRMED,
                    RentalBooking.Status.HANDED_OVER,
                    RentalBooking.Status.ACTIVE,
                    RentalBooking.Status.EXTENDED,
                    RentalBooking.Status.RETURN_PENDING,
                    RentalBooking.Status.RETURNED,
                    RentalBooking.Status.INSPECTED,
                    RentalBooking.Status.DISPUTED,
                    RentalBooking.Status.RECOVERY_REQUIRED,
                ]
            )
        elif tab == "completed":
            bookings = bookings.filter(
                status__in=[
                    RentalBooking.Status.SETTLED,
                    RentalBooking.Status.COMPLETED,
                ]
            )
        elif tab == "cancelled":
            bookings = bookings.filter(
                status__in=[
                    RentalBooking.Status.CANCELLED,
                    RentalBooking.Status.EXPIRED,
                    RentalBooking.Status.FAILED,
                ]
            )
        return Response(RentalBookingDetailSerializer(bookings, many=True).data)


class RentalConfirmView(APIView):
    """Confirm a rental booking and captured payment."""

    permission_classes = [IsAuthenticated]
    serializer_class = RentalBookingDetailSerializer

    def post(self, request: Request, booking_id: UUID) -> Response:
        customer = _resolve_customer(request)
        booking = get_object_or_404(RentalBooking, id=booking_id, customer=customer)
        payment_attempt_id = request.data.get("payment_attempt_id")
        payment_attempt = (
            get_object_or_404(PaymentAttempt, id=payment_attempt_id) if payment_attempt_id else None
        )

        try:
            confirmed = confirm_rental_booking(
                booking_id=booking.id,
                payment_attempt=payment_attempt,
                customer=customer,
            )
            detail = get_booking_detail(confirmed.id)
            return Response(RentalBookingDetailSerializer(detail).data)
        except (RentalError, ValueError) as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)


class RentalPaymentStartView(APIView):
    """Start real provider orders for the booking price and deposit."""

    permission_classes = [IsAuthenticated]
    serializer_class = PaymentAttemptSerializer

    @extend_schema(
        request=None,
        responses={202: RentalPaymentAttemptsSerializer},
        parameters=[IDEMPOTENCY_HEADER],
    )
    def post(self, request: Request, booking_id: UUID) -> Response:
        key = request.headers.get("Idempotency-Key", "").strip()
        if not key:
            return Response(
                {"error": "Idempotency-Key header is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            attempts = initiate_rental_checkout(
                booking_id=booking_id,
                customer=_resolve_customer(request),
                idempotency_key=key,
            )
        except RentalError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_409_CONFLICT)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            {"payment_attempts": PaymentAttemptSerializer(attempts, many=True).data},
            status=status.HTTP_202_ACCEPTED,
        )


class RentalExtensionRequestView(APIView):
    """Customer requests extension of active rental."""

    permission_classes = [IsAuthenticated]
    serializer_class = RequestExtensionInputSerializer

    def post(self, request: Request, booking_id: UUID) -> Response:
        booking = get_object_or_404(RentalBooking, id=booking_id, customer=request.user)
        serializer = RequestExtensionInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            request_extension(
                booking_id=booking.id,
                new_end_date=serializer.validated_data["new_end_date"],
            )
            # Left PENDING for the owning vendor to approve/reject — see
            # PartnerApproveExtensionView/PartnerRejectExtensionView below.
            detail = get_booking_detail(booking.id)
            return Response(RentalBookingDetailSerializer(detail).data)
        except RentalError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_409_CONFLICT)


class RentalDisputeView(APIView):
    """Customer disputes deposit deductions."""

    permission_classes = [IsAuthenticated]
    serializer_class = DisputeDepositInputSerializer

    def post(self, request: Request, booking_id: UUID) -> Response:
        serializer = DisputeDepositInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            case = dispute_deposit(
                booking_id=booking_id,
                customer=request.user,
                reason=serializer.validated_data["reason"],
            )
            detail = get_booking_detail(booking_id)
            return Response(
                {
                    "case_id": str(case.id),
                    "booking": RentalBookingDetailSerializer(detail).data,
                }
            )
        except RentalError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)


class RentalCancelView(APIView):
    """Customer cancels a rental booking before handover."""

    permission_classes = [IsAuthenticated]
    serializer_class = CancelRentalBookingInputSerializer

    def post(self, request: Request, booking_id: UUID) -> Response:
        customer = _resolve_customer(request)
        serializer = CancelRentalBookingInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            cancelled = cancel_rental_booking(
                booking_id=booking_id,
                customer=customer,
                reason=serializer.validated_data.get("reason", ""),
            )
            detail = get_booking_detail(cancelled.id)
            return Response(RentalBookingDetailSerializer(detail).data)
        except RentalError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)


class RentalExtensionPayView(APIView):
    """Customer pays for an extension to confirm and apply it."""

    permission_classes = [IsAuthenticated]
    serializer_class = ConfirmExtensionPaymentInputSerializer

    @extend_schema(
        request=None,
        responses={202: PaymentAttemptSerializer},
        parameters=[IDEMPOTENCY_HEADER],
    )
    def post(self, request: Request, extension_id: UUID) -> Response:
        customer = _resolve_customer(request)
        serializer = ConfirmExtensionPaymentInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            key = request.headers.get("Idempotency-Key", "").strip()
            if not key:
                return Response(
                    {"error": "Idempotency-Key header is required."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            payment_attempt = initiate_rental_extension_payment(
                extension_id=extension_id,
                customer=customer,
                idempotency_key=key,
            )
            return Response(
                PaymentAttemptSerializer(payment_attempt).data,
                status=status.HTTP_202_ACCEPTED,
            )
        except RentalError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)


# --- Partner Endpoints ---


class PartnerRentalVariantsView(APIView):
    """Every listable A7_RENTAL product type, for the "list a new item" picker.

    Read-only catalog data, not partner-scoped — every rental vendor picks from
    the same Category/Subcategory/Service/Variant taxonomy (§4.1a).
    """

    permission_classes = [IsAuthenticated, IsPartnerUser, HasApprovedA7Capability]
    serializer_class = RentalVariantOptionSerializer

    def get(self, request: Request) -> Response:
        return Response(RentalVariantOptionSerializer(get_rental_variant_options(), many=True).data)


class PartnerRentalAssetsView(APIView):
    """Partner manages their rental assets."""

    permission_classes = [IsAuthenticated, IsPartnerUser, HasApprovedA7Capability]
    serializer_class = RentalAssetSerializer

    @extend_schema(operation_id="rentals_partner_assets_list")
    def get(self, request: Request) -> Response:
        partner = _resolve_partner(request)
        assets = RentalAsset.objects.filter(partner=partner)
        return Response(RentalAssetSerializer(assets, many=True).data)

    def post(self, request: Request) -> Response:
        partner = _resolve_partner(request)
        serializer = RentalAssetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        _require_variant_capability(partner, serializer.validated_data["variant"].id)
        asset = serializer.save(partner=partner)
        return Response(RentalAssetSerializer(asset).data, status=status.HTTP_201_CREATED)


class PartnerRentalAssetDetailView(APIView):
    """Partner views or updates a single rental asset."""

    permission_classes = [IsAuthenticated, IsPartnerUser, HasApprovedA7Capability]
    serializer_class = RentalAssetSerializer

    @extend_schema(operation_id="rentals_partner_asset_retrieve")
    def get(self, request: Request, pk: UUID) -> Response:
        partner = _resolve_partner(request)
        asset = get_object_or_404(RentalAsset, id=pk, partner=partner)
        return Response(RentalAssetSerializer(asset).data)

    def put(self, request: Request, pk: UUID) -> Response:
        partner = _resolve_partner(request)
        asset = get_object_or_404(RentalAsset, id=pk, partner=partner)
        serializer = RentalAssetSerializer(asset, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        variant = serializer.validated_data.get("variant", asset.variant)
        _require_variant_capability(partner, variant.id)
        serializer.save()
        return Response(serializer.data)


class PartnerAssetMaintenanceView(APIView):
    """Partner manages maintenance periods on their rental assets."""

    permission_classes = [IsAuthenticated, IsPartnerUser, HasApprovedA7Capability]
    serializer_class = RentalMaintenancePeriodCreateSerializer

    def get(self, request: Request, pk: UUID) -> Response:
        partner = _resolve_partner(request)
        asset = get_object_or_404(RentalAsset, id=pk, partner=partner)
        periods = asset.maintenance_periods.all()
        return Response(RentalMaintenancePeriodSerializer(periods, many=True).data)

    def post(self, request: Request, pk: UUID) -> Response:
        partner = _resolve_partner(request)
        asset = get_object_or_404(RentalAsset, id=pk, partner=partner)
        serializer = RentalMaintenancePeriodCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        period = RentalMaintenancePeriod.objects.create(
            asset=asset,
            start_date=data["start_date"],
            end_date=data["end_date"],
            reason=data.get("reason", ""),
        )
        return Response(
            RentalMaintenancePeriodSerializer(period).data, status=status.HTTP_201_CREATED
        )


class PartnerAssetMediaView(APIView):
    """Partner manages condition and showcase media for an asset."""

    permission_classes = [IsAuthenticated, IsPartnerUser, HasApprovedA7Capability]
    serializer_class = RentalAssetMediaCreateSerializer

    def get(self, request: Request, pk: UUID) -> Response:
        partner = _resolve_partner(request)
        asset = get_object_or_404(RentalAsset, id=pk, partner=partner)
        return Response(RentalAssetMediaSerializer(asset.media.all(), many=True).data)

    def post(self, request: Request, pk: UUID) -> Response:
        partner = _resolve_partner(request)
        asset = get_object_or_404(RentalAsset, id=pk, partner=partner)
        serializer = RentalAssetMediaCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if data.get("is_primary"):
            asset.media.filter(is_primary=True).update(is_primary=False)

        media = RentalAssetMedia.objects.create(
            asset=asset,
            url=data["url"],
            caption=data.get("caption", ""),
            is_primary=data.get("is_primary", False),
        )
        return Response(RentalAssetMediaSerializer(media).data, status=status.HTTP_201_CREATED)


class PartnerRentalBookingsView(APIView):
    """Partner views their rental bookings."""

    permission_classes = [IsAuthenticated, IsPartnerUser, HasApprovedA7Capability]
    serializer_class = RentalBookingDetailSerializer

    def get(self, request: Request) -> Response:
        partner = _resolve_partner(request)
        bookings = (
            RentalBooking.objects.filter(asset__partner=partner)
            .select_related(
                "customer",
                "asset",
                "asset__partner",
                "asset__variant",
                "delivery_address",
                "handover",
                "return_inspection",
                "deposit",
            )
            .prefetch_related("lines", "extensions")
        )
        return Response(RentalBookingDetailSerializer(bookings, many=True).data)


class PartnerRecordHandoverView(APIView):
    """Partner records outbound condition & transfers custody."""

    permission_classes = [IsAuthenticated, IsPartnerUser, HasApprovedA7Capability]
    serializer_class = RecordHandoverInputSerializer

    def post(self, request: Request, booking_id: UUID) -> Response:
        partner = _resolve_partner(request)
        serializer = RecordHandoverInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            record_handover(
                booking_id=booking_id,
                partner=partner,
                photo_urls=data["photo_urls"],
                condition_notes=data.get("condition_notes", ""),
                checklist=data.get("checklist"),
                assigned_serial=data.get("assigned_serial", ""),
            )
            detail = get_booking_detail(booking_id)
            return Response(RentalBookingDetailSerializer(detail).data)
        except RentalError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)


class PartnerInitiateReturnView(APIView):
    """Partner flags that return is in progress."""

    permission_classes = [IsAuthenticated, IsPartnerUser, HasApprovedA7Capability]
    serializer_class = RentalBookingDetailSerializer

    def post(self, request: Request, booking_id: UUID) -> Response:
        partner = _resolve_partner(request)
        try:
            booking = initiate_return(booking_id=booking_id, partner=partner)
            detail = get_booking_detail(booking.id)
            return Response(RentalBookingDetailSerializer(detail).data)
        except RentalError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)


class PartnerRecordInspectionView(APIView):
    """Partner inspects returned asset, triggering settlement."""

    permission_classes = [IsAuthenticated, IsPartnerUser, HasApprovedA7Capability]
    serializer_class = RecordReturnInspectionInputSerializer

    def post(self, request: Request, booking_id: UUID) -> Response:
        partner = _resolve_partner(request)
        serializer = RecordReturnInspectionInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            record_return_inspection(
                booking_id=booking_id,
                partner=partner,
                photo_urls=data.get("photo_urls", []),
                condition_notes=data.get("condition_notes", ""),
                damage_found=data.get("damage_found", False),
                damage_estimated_paise=data.get("damage_estimated_paise", 0),
                damage_details=data.get("damage_details"),
                late_days=data.get("late_days", 0),
            )
            detail = get_booking_detail(booking_id)
            return Response(RentalBookingDetailSerializer(detail).data)
        except RentalError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)


class PartnerApproveExtensionView(APIView):
    """Partner approves a customer's pending extension request (§4.7)."""

    permission_classes = [IsAuthenticated, IsPartnerUser, HasApprovedA7Capability]
    serializer_class = RentalBookingDetailSerializer

    def post(self, request: Request, extension_id: UUID) -> Response:
        partner = _resolve_partner(request)
        try:
            extension = approve_extension(extension_id=extension_id, partner=partner)
            detail = get_booking_detail(extension.rental_booking_id)
            return Response(RentalBookingDetailSerializer(detail).data)
        except RentalError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)


class PartnerRejectExtensionView(APIView):
    """Partner rejects a customer's pending extension request (§4.7)."""

    permission_classes = [IsAuthenticated, IsPartnerUser, HasApprovedA7Capability]
    serializer_class = RentalBookingDetailSerializer

    def post(self, request: Request, extension_id: UUID) -> Response:
        partner = _resolve_partner(request)
        try:
            extension = reject_extension(extension_id=extension_id, partner=partner)
            detail = get_booking_detail(extension.rental_booking_id)
            return Response(RentalBookingDetailSerializer(detail).data)
        except RentalError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)


# --- Operations Endpoints ---


class OpsRentalBookingsView(APIView):
    """Operations oversight of all rental bookings."""

    permission_classes = [IsOperationsUser]
    serializer_class = RentalBookingDetailSerializer

    def get(self, request: Request) -> Response:
        bookings = (
            RentalBooking.objects.all()
            .select_related("customer", "asset", "asset__partner", "asset__variant")
            .prefetch_related("lines")
        )
        return Response(RentalBookingDetailSerializer(bookings, many=True).data)


class OpsReassignAssetView(APIView):
    """Operations reassigns an unavailable asset pre-handover."""

    permission_classes = [IsOperationsUser]
    serializer_class = OperationsReassignInputSerializer

    def post(self, request: Request, booking_id: UUID) -> Response:
        serializer = OperationsReassignInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            booking = operations_reassign_asset(
                booking_id=booking_id,
                new_asset_id=serializer.validated_data["new_asset_id"],
                operator=request.user,
            )
            detail = get_booking_detail(booking.id)
            return Response(RentalBookingDetailSerializer(detail).data)
        except RentalError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)


class OpsResolveDisputeView(APIView):
    """Operations adjudicates a deposit dispute case."""

    permission_classes = [IsOperationsUser]
    serializer_class = OperationsResolveDisputeInputSerializer

    def post(self, request: Request, case_id: UUID) -> Response:
        serializer = OperationsResolveDisputeInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            resolved = operations_resolve_dispute(
                case_id=case_id,
                refund_customer_paise=data["refund_customer_paise"],
                vendor_payout_paise=data["vendor_payout_paise"],
                resolution_note=data["resolution_note"],
                operator=request.user,
            )
            return Response(
                {"status": "RESOLVED" if resolved else "PENDING_SECOND_APPROVAL"},
                status=status.HTTP_200_OK if resolved else status.HTTP_202_ACCEPTED,
            )
        except RentalError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
