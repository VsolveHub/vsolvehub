"""API Views for Stays & Accommodations (A9_STAY)."""

import contextlib
import datetime
import uuid
from typing import Any

from django.db import models, transaction
from django.http import HttpResponse
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, OpenApiTypes, extend_schema
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.commerce.documents.render import DocumentLine, DocumentSpec, render_pdf
from apps.commerce.serializers import PaymentAttemptSerializer
from apps.foundation.services import execute_idempotent
from apps.partners.permissions import (
    HasApprovedPartnerCapability,
    IsOperationsUser,
    IsPartnerUser,
    has_active_session_role,
)
from apps.payouts.models import PartnerLedgerEntry
from apps.stays.exceptions import (
    GuestPolicyViolationError,
    InvalidStayStateTransitionError,
    StayAuthorizationError,
    UnitUnavailableError,
)
from apps.stays.models import (
    Property,
    PropertyPolicy,
    PropertyVisitRequest,
    StayExtension,
    StayReservation,
    Unit,
    UnitPricingOverride,
    UnitPricingRule,
    UnitType,
)
from apps.stays.selectors import (
    browse_stays,
    get_partner_properties,
    get_property_detail,
    get_stay_filter_definitions,
)
from apps.stays.serializers import (
    OpsStayReassignSerializer,
    OpsStayResolveDisputeSerializer,
    PartnerBlockUnitSerializer,
    PartnerCheckInSerializer,
    PartnerCheckOutSerializer,
    PartnerPropertyCreateSerializer,
    PartnerPropertyPolicySerializer,
    PartnerReassignUnitSerializer,
    PartnerUnitCreateSerializer,
    PartnerUnitPricingOverrideSerializer,
    PartnerUnitPricingRuleSerializer,
    PartnerUnitTypeCreateSerializer,
    PropertyVisitRequestSerializer,
    StayCancelSerializer,
    StayDisputeSerializer,
    StayEarlyCheckoutSerializer,
    StayExtensionRequestSerializer,
    StayHoldCreateSerializer,
    StayPaymentAttemptsSerializer,
    StayReservationDetailSerializer,
)
from apps.stays.services import (
    cancel_stay_reservation,
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
    release_stay_hold,
    request_stay_extension,
)

MAX_PARAM_RUPEES_THRESHOLD = 100_000

IDEMPOTENCY_HEADER = OpenApiParameter(
    name="Idempotency-Key",
    type=OpenApiTypes.STR,
    location=OpenApiParameter.HEADER,
    required=True,
    description="Stable unique key for safe command replay.",
)


class HasApprovedA9Capability(HasApprovedPartnerCapability):
    archetype = "A9_STAY"


class StayBrowseView(APIView):
    """Public browse and filter-first stay search."""

    permission_classes = (permissions.AllowAny,)
    serializer_class = StayReservationDetailSerializer

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request: Any) -> Response:
        locality = request.query_params.get("locality", "")
        property_type = request.query_params.get("property_type", "")
        sharing_type = request.query_params.get("sharing_type", "")
        furnishing_status = request.query_params.get("furnishing_status", "")
        is_ac_raw = request.query_params.get("is_ac")
        is_ac = is_ac_raw.lower() in ("true", "1") if is_ac_raw else None
        food_raw = request.query_params.get("food_included")
        food_included = food_raw.lower() in ("true", "1") if food_raw else None
        bhk = request.query_params.get("bhk", "")
        min_price_raw = request.query_params.get("min_price_paise") or request.query_params.get(
            "min_price"
        )
        max_price_raw = request.query_params.get("max_price_paise") or request.query_params.get(
            "max_price"
        )
        duration_mode = request.query_params.get("duration_mode", "MONTHLY")

        min_price_paise = None
        if min_price_raw:
            with contextlib.suppress(ValueError):
                v = int(min_price_raw)
                min_price_paise = (
                    v * 100
                    if (
                        "min_price_paise" not in request.query_params
                        and v <= MAX_PARAM_RUPEES_THRESHOLD
                    )
                    else v
                )

        max_price_paise = None
        if max_price_raw:
            with contextlib.suppress(ValueError):
                v = int(max_price_raw)
                max_price_paise = (
                    v * 100
                    if (
                        "max_price_paise" not in request.query_params
                        and v <= MAX_PARAM_RUPEES_THRESHOLD
                    )
                    else v
                )

        start_date_str = request.query_params.get("start_date")
        end_date_str = request.query_params.get("end_date")

        start_date = None
        end_date = None
        if start_date_str:
            with contextlib.suppress(ValueError):
                start_date = datetime.date.fromisoformat(start_date_str)
        if end_date_str:
            with contextlib.suppress(ValueError):
                end_date = datetime.date.fromisoformat(end_date_str)

        unit_type_id = request.query_params.get("unit_type_id")
        subcategory_slug = (
            request.query_params.get("subcategory_slug")
            or request.query_params.get("subcategory")
            or ""
        )
        service_slug = (
            request.query_params.get("service_slug") or request.query_params.get("service") or ""
        )

        results = browse_stays(
            locality=locality,
            property_type=property_type,
            sharing_type=sharing_type,
            furnishing_status=furnishing_status,
            is_ac=is_ac,
            food_included=food_included,
            bhk=bhk,
            min_price_paise=min_price_paise,
            max_price_paise=max_price_paise,
            duration_mode=duration_mode,
            start_date=start_date,
            end_date=end_date,
            unit_type_id=unit_type_id,
            subcategory_slug=subcategory_slug,
            service_slug=service_slug,
        )
        return Response(results)


class StayFilterDefinitionsView(APIView):
    """Public stay browse filter definitions driven by catalog.ServiceQuestion metadata (§5.1)."""

    permission_classes = (permissions.AllowAny,)

    @extend_schema(
        operation_id="stays_filter_definitions",
        summary="Get stay filter definitions",
        description=(
            "Returns dynamic filter definitions authoritative from "
            "catalog.ServiceQuestion metadata."
        ),
        parameters=[
            OpenApiParameter(
                name="service_slug",
                type=OpenApiTypes.STR,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Optional service slug filter (e.g. rooms, pg-accommodation).",
            ),
        ],
        responses={200: OpenApiResponse(description="List of filter definitions")},
    )
    def get(self, request: Any) -> Response:
        service_slug = request.query_params.get("service_slug")
        definitions = get_stay_filter_definitions(service_slug=service_slug)
        return Response(definitions)


class StayPropertyDetailView(APIView):
    """Public property-first detail endpoint."""

    permission_classes = (permissions.AllowAny,)
    serializer_class = StayReservationDetailSerializer

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request: Any, property_id: uuid.UUID) -> Response:
        try:
            start_date = (
                datetime.date.fromisoformat(request.query_params["start_date"])
                if request.query_params.get("start_date")
                else None
            )
            end_date = (
                datetime.date.fromisoformat(request.query_params["end_date"])
                if request.query_params.get("end_date")
                else None
            )
        except ValueError:
            return Response(
                {"detail": "Dates must use YYYY-MM-DD."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        detail = get_property_detail(
            property_id,
            start_date=start_date,
            end_date=end_date,
            duration_mode=request.query_params.get("duration_mode", "MONTHLY"),
        )
        if not detail:
            return Response({"detail": "Property not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(detail)


class StayHoldCreateView(APIView):
    """Create a tentative calendar hold and draft reservation."""

    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = StayHoldCreateSerializer

    @extend_schema(
        request=StayHoldCreateSerializer,
        responses={201: StayReservationDetailSerializer},
        parameters=[IDEMPOTENCY_HEADER],
    )
    def post(self, request: Any) -> Response:
        key = request.headers.get("Idempotency-Key", "").strip()
        if not key:
            return Response(
                {"detail": "Idempotency-Key header is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = StayHoldCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            result = execute_idempotent(
                actor=request.user,
                operation="stays.create_hold",
                key=key,
                request_payload=request.data,
                command=lambda: self._create_hold(customer=request.user, data=data),
            )
            return Response(result.body, status=result.status_code)
        except (UnitUnavailableError, GuestPolicyViolationError, ValueError) as err:
            return Response({"detail": str(err)}, status=status.HTTP_400_BAD_REQUEST)

    @staticmethod
    def _create_hold(*, customer: Any, data: dict) -> tuple[int, dict]:
        reservation = create_stay_hold(
            customer=customer,
            unit_type_id=data["unit_type_id"],
            start_date=data["start_date"],
            end_date=data["end_date"],
            duration_mode=data.get("duration_mode", "MONTHLY"),
            guest_count=data.get("guest_count", 1),
            lease_duration_months=data.get("lease_duration_months", 11),
            primary_tenant_name=data["primary_tenant_name"],
            guest_phone=data["guest_phone"],
            guest_email=data["guest_email"],
            emergency_contact_name=data["emergency_contact_name"],
            emergency_contact_phone=data["emergency_contact_phone"],
            agreement_version=data["agreement_version"],
            agreement_accepted=data["agreement_accepted"],
            kyc_document=data.get("kyc_document"),
            require_checkout_details=True,
        )
        return status.HTTP_201_CREATED, dict(StayReservationDetailSerializer(reservation).data)


class StayHoldReleaseView(APIView):
    """Release an unpaid tentative stay hold immediately."""

    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = StayReservationDetailSerializer

    @extend_schema(
        request=None,
        responses={200: StayReservationDetailSerializer},
        parameters=[IDEMPOTENCY_HEADER],
    )
    def post(self, request: Any, reservation_id: uuid.UUID) -> Response:
        key = request.headers.get("Idempotency-Key", "").strip()
        if not key:
            return Response(
                {"detail": "Idempotency-Key header is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            result = execute_idempotent(
                actor=request.user,
                operation="stays.release_hold",
                key=key,
                request_payload={"reservation_id": str(reservation_id)},
                command=lambda: self._release(customer=request.user, reservation_id=reservation_id),
            )
            return Response(result.body, status=result.status_code)
        except StayAuthorizationError as err:
            return Response({"detail": str(err)}, status=status.HTTP_403_FORBIDDEN)
        except InvalidStayStateTransitionError as err:
            return Response({"detail": str(err)}, status=status.HTTP_409_CONFLICT)

    @staticmethod
    def _release(*, customer: Any, reservation_id: uuid.UUID) -> tuple[int, dict]:
        reservation = release_stay_hold(customer=customer, reservation_id=reservation_id)
        return status.HTTP_200_OK, dict(StayReservationDetailSerializer(reservation).data)


class StayReservationDetailView(APIView):
    """View reservation status and details."""

    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = StayReservationDetailSerializer

    def get(self, request: Any, reservation_id: uuid.UUID) -> Response:
        try:
            res = (
                StayReservation.objects.select_related(
                    "unit",
                    "unit__property",
                    "unit__property__address",
                    "unit__property__partner",
                    "unit__property__partner__user",
                    "unit_type",
                    "deposit",
                )
                .prefetch_related("lines")
                .get(id=reservation_id)
            )
        except StayReservation.DoesNotExist:
            return Response({"detail": "Reservation not found"}, status=status.HTTP_404_NOT_FOUND)

        # Allow customer or host to view
        is_customer = res.customer == request.user
        is_host = (
            hasattr(request.user, "partner_profile")
            and res.unit.property.partner == request.user.partner_profile
        )
        if not (is_customer or is_host or request.user.is_staff):
            return Response({"detail": "Not authorized"}, status=status.HTTP_403_FORBIDDEN)

        serializer = StayReservationDetailSerializer(res)
        return Response(serializer.data)


class StayReservationReceiptView(APIView):
    """Download a payment receipt for a non-pending stay reservation."""

    permission_classes = (permissions.IsAuthenticated,)

    @extend_schema(responses={(200, "application/pdf"): OpenApiTypes.BINARY})
    def get(self, request: Any, reservation_id: uuid.UUID) -> HttpResponse | Response:
        try:
            res = (
                StayReservation.objects.select_related(
                    "unit__property__address",
                    "unit__property__partner__user",
                    "customer",
                )
                .prefetch_related("lines")
                .get(id=reservation_id)
            )
        except StayReservation.DoesNotExist:
            return Response({"detail": "Reservation not found"}, status=status.HTTP_404_NOT_FOUND)
        is_host = (
            hasattr(request.user, "partner_profile")
            and res.unit.property.partner == request.user.partner_profile
        )
        if res.customer != request.user and not is_host and not request.user.is_staff:
            return Response({"detail": "Not authorized"}, status=status.HTTP_403_FORBIDDEN)
        has_captured_payment = res.lines.filter(
            payment_allocations__payment_attempt__status="CAPTURED"
        ).exists()
        if res.status in (
            StayReservation.Status.HELD,
            StayReservation.Status.PAYMENT_PENDING,
            StayReservation.Status.EXPIRED,
            StayReservation.Status.FAILED,
        ) or (res.status == StayReservation.Status.CANCELLED and not has_captured_payment):
            return Response(
                {"detail": "Receipt is available after payment capture."},
                status=status.HTTP_409_CONFLICT,
            )

        def money(value: int) -> str:
            return f"INR {value / 100:,.2f}"

        address = res.unit.property.address
        pdf = render_pdf(
            DocumentSpec(
                title="Stay payment receipt",
                number=f"STAY-{str(res.id).split('-')[0].upper()}",
                issued_on=res.created_at,
                issuer_name="Vsolve Hub",
                buyer_name=res.primary_tenant_name
                or getattr(res.customer, "full_name", "")
                or getattr(res.customer, "phone_number", "Guest"),
                issuer_address="India",
                lines=tuple(
                    DocumentLine(label=line.description, amount=money(line.amount_paise))
                    for line in res.lines.all()
                ),
                total_label="Amount paid / held",
                total_amount=money(res.total_amount_paise),
                footnote=(
                    "Payment receipt for a managed stay reservation. The security deposit remains "
                    "refundable subject to the snapshotted property policy; "
                    "this is not a tax invoice."
                ),
                meta=(
                    ("Reservation", str(res.id)),
                    ("Property", res.unit.property.title),
                    (
                        "Address",
                        f"{address.line1}, {address.city} {address.postal_code}"
                        if address
                        else res.unit.property.locality,
                    ),
                    ("Stay", f"{res.start_date} to {res.end_date}"),
                ),
            )
        )
        response = HttpResponse(pdf, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="stay-{res.id}-receipt.pdf"'
        return response


class StayConfirmView(APIView):
    """Confirm a HELD reservation upon successful checkout payment capture."""

    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = StayReservationDetailSerializer

    def post(self, request: Any, reservation_id: uuid.UUID) -> Response:
        try:
            res = StayReservation.objects.get(id=reservation_id, customer=request.user)
        except StayReservation.DoesNotExist:
            return Response({"detail": "Reservation not found"}, status=status.HTTP_404_NOT_FOUND)

        try:
            confirmed = confirm_stay_reservation(
                reservation_id=res.id,
                payment_attempt=None,
            )
            serializer = StayReservationDetailSerializer(confirmed)
            return Response(serializer.data)
        except InvalidStayStateTransitionError as err:
            return Response({"detail": str(err)}, status=status.HTTP_400_BAD_REQUEST)


class StayPaymentStartView(APIView):
    """Start real provider orders for stay charges and any refundable deposit."""

    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = PaymentAttemptSerializer

    @extend_schema(
        request=None,
        responses={202: StayPaymentAttemptsSerializer},
        parameters=[IDEMPOTENCY_HEADER],
    )
    def post(self, request: Any, reservation_id: uuid.UUID) -> Response:
        key = request.headers.get("Idempotency-Key", "").strip()
        if not key:
            return Response(
                {"detail": "Idempotency-Key header is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            attempts = initiate_stay_checkout(
                reservation_id=reservation_id,
                customer=request.user,
                idempotency_key=key,
            )
        except (
            StayAuthorizationError,
            UnitUnavailableError,
            InvalidStayStateTransitionError,
        ) as err:
            return Response({"detail": str(err)}, status=status.HTTP_409_CONFLICT)
        except ValueError as err:
            return Response({"detail": str(err)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            {"payment_attempts": PaymentAttemptSerializer(attempts, many=True).data},
            status=status.HTTP_202_ACCEPTED,
        )


class StayCustomerReservationsView(APIView):
    """List customer's reservations filtered by upcoming or completed."""

    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = StayReservationDetailSerializer

    def get(self, request: Any) -> Response:
        status_filter = request.query_params.get("tab")
        qs = (
            StayReservation.objects.filter(customer=request.user)
            .select_related("unit", "unit__property", "unit_type", "deposit")
            .prefetch_related("lines")
            .order_by("-created_at")
        )

        if status_filter == "upcoming":
            qs = qs.filter(
                status__in=(
                    StayReservation.Status.CONFIRMED,
                    StayReservation.Status.CHECKED_IN,
                    StayReservation.Status.IN_STAY,
                )
            )
        elif status_filter == "completed":
            qs = qs.filter(
                status__in=(
                    StayReservation.Status.CHECKED_OUT,
                    StayReservation.Status.COMPLETED,
                    StayReservation.Status.SETTLED,
                )
            )

        serializer = StayReservationDetailSerializer(qs, many=True)
        return Response(serializer.data)


# ---------------------------------------------------------------------------
# Partner (Host) Workspace Views
# ---------------------------------------------------------------------------


class PartnerPropertiesView(APIView):
    """Host properties management endpoint."""

    permission_classes = (permissions.IsAuthenticated, IsPartnerUser, HasApprovedA9Capability)
    serializer_class = PartnerPropertyCreateSerializer

    @extend_schema(operation_id="stays_partner_properties_list")
    def get(self, request: Any) -> Response:
        partner = getattr(request.user, "partner_profile", None)
        if not partner:
            return Response(
                {"detail": "Partner profile required"}, status=status.HTTP_403_FORBIDDEN
            )
        data = get_partner_properties(partner)
        return Response(data)

    def post(self, request: Any) -> Response:
        partner = getattr(request.user, "partner_profile", None)
        if not partner:
            return Response(
                {"detail": "Partner profile required"}, status=status.HTTP_403_FORBIDDEN
            )
        serializer = PartnerPropertyCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        prop = serializer.save(partner=partner)
        PropertyPolicy.objects.create(property=prop)
        return Response({"id": str(prop.id), "title": prop.title}, status=status.HTTP_201_CREATED)


class PartnerPropertyDetailView(APIView):
    """Read or update one property owned by the authenticated Host."""

    permission_classes = (permissions.IsAuthenticated, IsPartnerUser, HasApprovedA9Capability)
    serializer_class = PartnerPropertyCreateSerializer

    @extend_schema(operation_id="stays_partner_property_retrieve")
    def get(self, request: Any, property_id: uuid.UUID) -> Response:
        partner = request.user.partner_profile
        try:
            prop = Property.objects.get(id=property_id, partner=partner)
        except Property.DoesNotExist:
            return Response({"detail": "Property not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(PartnerPropertyCreateSerializer(prop).data)

    def put(self, request: Any, property_id: uuid.UUID) -> Response:
        partner = request.user.partner_profile
        try:
            prop = Property.objects.get(id=property_id, partner=partner)
        except Property.DoesNotExist:
            return Response({"detail": "Property not found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = PartnerPropertyCreateSerializer(prop, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class PartnerPropertyPolicyView(APIView):
    """Read or update the booking policy that makes a Host property bookable."""

    permission_classes = (permissions.IsAuthenticated, IsPartnerUser, HasApprovedA9Capability)
    serializer_class = PartnerPropertyPolicySerializer

    def _policy(self, request: Any, property_id: uuid.UUID) -> PropertyPolicy | None:
        partner = request.user.partner_profile
        try:
            prop = Property.objects.get(id=property_id, partner=partner)
        except Property.DoesNotExist:
            return None
        return prop.get_active_policy()

    def get(self, request: Any, property_id: uuid.UUID) -> Response:
        policy = self._policy(request, property_id)
        if policy is None:
            return Response({"detail": "Property not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(PartnerPropertyPolicySerializer(policy).data)

    def put(self, request: Any, property_id: uuid.UUID) -> Response:
        policy = self._policy(request, property_id)
        if policy is None:
            return Response({"detail": "Property not found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = PartnerPropertyPolicySerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            current = PropertyPolicy.objects.select_for_update().get(id=policy.id)
            current.is_active = False
            current.effective_to = timezone.localdate() - datetime.timedelta(days=1)
            current.save(update_fields=("is_active", "effective_to", "updated_at"))
            next_policy = PropertyPolicy.objects.create(
                property=current.property,
                version=current.version + 1,
                effective_from=timezone.localdate(),
                **{
                    field: serializer.validated_data.get(field, getattr(current, field))
                    for field in (
                        "check_in_time",
                        "check_out_time",
                        "max_guests_per_unit",
                        "id_verification_required",
                        "cancellation_policy",
                        "notice_period_days",
                        "no_show_grace_minutes",
                        "no_show_first_night_charge_basis_points",
                        "no_show_deposit_forfeit_basis_points",
                        "house_rules",
                    )
                },
            )
        return Response(PartnerPropertyPolicySerializer(next_policy).data)


class PartnerReservationsView(APIView):
    """List host's incoming guest reservations."""

    permission_classes = (permissions.IsAuthenticated, IsPartnerUser, HasApprovedA9Capability)
    serializer_class = StayReservationDetailSerializer

    @extend_schema(operation_id="stays_partner_reservations_list")
    def get(self, request: Any) -> Response:
        partner = getattr(request.user, "partner_profile", None)
        if not partner:
            return Response(
                {"detail": "Partner profile required"}, status=status.HTTP_403_FORBIDDEN
            )

        status_param = request.query_params.get("status")
        qs = (
            StayReservation.objects.filter(unit__property__partner=partner)
            .select_related(
                "unit",
                "unit__property",
                "unit_type",
                "customer",
                "deposit",
                "check_in_record",
                "check_out_record",
            )
            .prefetch_related("lines")
            .order_by("-created_at")
        )
        if status_param:
            qs = qs.filter(status=status_param)

        serializer = StayReservationDetailSerializer(qs, many=True)
        return Response(serializer.data)


class PartnerStayMoneyView(APIView):
    """Return the host's immutable A9 ledger and live deposit custody totals."""

    permission_classes = (permissions.IsAuthenticated, IsPartnerUser, HasApprovedA9Capability)

    @extend_schema(operation_id="stays_partner_money_retrieve")
    def get(self, request: Any) -> Response:
        partner = request.user.partner_profile
        entries = PartnerLedgerEntry.objects.filter(
            partner=partner,
            stay_reservation__isnull=False,
        ).select_related(
            "stay_reservation__unit__property"
        ).prefetch_related("payout_items__batch")

        totals = entries.aggregate(
            gross_paise=models.Sum("gross_paise"),
            commission_paise=models.Sum("commission_paise"),
            net_paise=models.Sum("net_paise"),
            settled_net_paise=models.Sum(
                "net_paise",
                filter=models.Q(
                    status__in=(
                        PartnerLedgerEntry.Status.AVAILABLE,
                        PartnerLedgerEntry.Status.RESERVED,
                        PartnerLedgerEntry.Status.PAID,
                    )
                ),
            ),
            available_paise=models.Sum(
                "net_paise",
                filter=models.Q(status=PartnerLedgerEntry.Status.AVAILABLE),
            ),
            pending_paise=models.Sum(
                "net_paise",
                filter=models.Q(status=PartnerLedgerEntry.Status.PENDING),
            ),
            paid_paise=models.Sum(
                "net_paise",
                filter=models.Q(status=PartnerLedgerEntry.Status.PAID),
            ),
        )
        deposit_totals = StayReservation.objects.filter(
            unit__property__partner=partner,
            deposit__status__in=("AUTHORIZED", "PARTIALLY_CONSUMED"),
        ).aggregate(
            authorized=models.Sum("deposit__authorized_amount_paise"),
            consumed=models.Sum("deposit__consumed_amount_paise"),
            refunded=models.Sum("deposit__refunded_amount_paise"),
        )
        deposit_held = (
            int(deposit_totals["authorized"] or 0)
            - int(deposit_totals["consumed"] or 0)
            - int(deposit_totals["refunded"] or 0)
        )

        serialized_entries = []
        for entry in entries.order_by("-created_at"):
            latest_payout_item = entry.payout_items.order_by("-id").first()
            serialized_entries.append(
                {
                    "id": str(entry.id),
                    "reservation_id": str(entry.stay_reservation_id),
                    "property_title": entry.stay_reservation.unit.property.title,
                    "kind": entry.kind,
                    "status": entry.status,
                    "status_display": entry.get_status_display(),
                    "gross_paise": entry.gross_paise,
                    "commission_paise": entry.commission_paise,
                    "net_paise": entry.net_paise,
                    "created_at": entry.created_at,
                    "payout_batch_reference": (
                        latest_payout_item.batch.reference if latest_payout_item else None
                    ),
                    "payout_batch_status": (
                        latest_payout_item.batch.status if latest_payout_item else None
                    ),
                }
            )

        return Response(
            {
                "gross_paise": int(totals["gross_paise"] or 0),
                "commission_paise": int(totals["commission_paise"] or 0),
                "net_paise": int(totals["net_paise"] or 0),
                "settled_net_paise": int(totals["settled_net_paise"] or 0),
                "available_paise": int(totals["available_paise"] or 0),
                "pending_paise": int(totals["pending_paise"] or 0),
                "paid_paise": int(totals["paid_paise"] or 0),
                "deposit_held_paise": max(0, deposit_held),
                "entries": serialized_entries,
            }
        )


class PartnerReservationDetailView(APIView):
    """Retrieve full details of a specific guest reservation for the host."""

    permission_classes = (permissions.IsAuthenticated, IsPartnerUser, HasApprovedA9Capability)
    serializer_class = StayReservationDetailSerializer

    @extend_schema(operation_id="stays_partner_reservation_retrieve")
    def get(self, request: Any, reservation_id: uuid.UUID) -> Response:
        partner = getattr(request.user, "partner_profile", None)
        if not partner:
            return Response(
                {"detail": "Partner profile required"}, status=status.HTTP_403_FORBIDDEN
            )

        try:
            res = (
                StayReservation.objects.select_related(
                    "unit",
                    "unit__property",
                    "unit_type",
                    "customer",
                    "deposit",
                    "check_in_record",
                    "check_out_record",
                )
                .prefetch_related("lines")
                .get(id=reservation_id, unit__property__partner=partner)
            )
        except StayReservation.DoesNotExist:
            return Response({"detail": "Reservation not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = StayReservationDetailSerializer(res)
        return Response(serializer.data)


class PartnerCheckInView(APIView):
    """Host records guest arrival and ID verification."""

    permission_classes = (permissions.IsAuthenticated, IsPartnerUser, HasApprovedA9Capability)
    serializer_class = PartnerCheckInSerializer

    def post(self, request: Any, reservation_id: uuid.UUID) -> Response:
        partner = getattr(request.user, "partner_profile", None)
        if not partner:
            return Response(
                {"detail": "Partner profile required"}, status=status.HTTP_403_FORBIDDEN
            )

        serializer = PartnerCheckInSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            check_in = record_check_in(
                host_partner=partner,
                reservation_id=reservation_id,
                id_document_type=data.get("id_document_type"),
                id_document_number=data.get("id_document_number", ""),
                guest_notes=data.get("guest_notes", ""),
                condition_photo_urls=data.get("condition_photo_urls", []),
            )
            return Response({"id": str(check_in.id), "status": "IN_STAY"})
        except (StayAuthorizationError, InvalidStayStateTransitionError) as err:
            return Response({"detail": str(err)}, status=status.HTTP_400_BAD_REQUEST)


class PartnerCheckOutView(APIView):
    """Host records guest check-out and condition inspection."""

    permission_classes = (permissions.IsAuthenticated, IsPartnerUser, HasApprovedA9Capability)
    serializer_class = PartnerCheckOutSerializer

    def post(self, request: Any, reservation_id: uuid.UUID) -> Response:
        partner = getattr(request.user, "partner_profile", None)
        if not partner:
            return Response(
                {"detail": "Partner profile required"}, status=status.HTTP_403_FORBIDDEN
            )

        serializer = PartnerCheckOutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            check_out = record_check_out(
                host_partner=partner,
                reservation_id=reservation_id,
                condition_grade=data.get("condition_grade"),
                damage_found=data.get("damage_found", False),
                damage_estimate_paise=data.get("damage_estimate_paise", 0),
                inspection_notes=data.get("inspection_notes", ""),
                condition_photo_urls=data.get("condition_photo_urls", []),
            )
            return Response({"id": str(check_out.id), "condition": check_out.condition_grade})
        except (StayAuthorizationError, InvalidStayStateTransitionError) as err:
            return Response({"detail": str(err)}, status=status.HTTP_400_BAD_REQUEST)


class PartnerReassignUnitView(APIView):
    """Host swaps unit to another equivalent vacant unit of same UnitType (§5.1a)."""

    permission_classes = (permissions.IsAuthenticated, IsPartnerUser, HasApprovedA9Capability)
    serializer_class = PartnerReassignUnitSerializer

    def post(self, request: Any, reservation_id: uuid.UUID) -> Response:
        partner = getattr(request.user, "partner_profile", None)
        if not partner:
            return Response(
                {"detail": "Partner profile required"}, status=status.HTTP_403_FORBIDDEN
            )

        serializer = PartnerReassignUnitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        target_unit_id = serializer.validated_data["target_unit_id"]

        try:
            updated = host_reassign_unit(
                host_partner=partner,
                reservation_id=reservation_id,
                target_unit_id=target_unit_id,
            )
            return Response({"status": "REASSIGNED", "new_unit_code": updated.unit.unit_code})
        except (
            StayAuthorizationError,
            InvalidStayStateTransitionError,
            UnitUnavailableError,
            ValueError,
        ) as err:
            return Response({"detail": str(err)}, status=status.HTTP_400_BAD_REQUEST)


class PartnerPropertyUnitsView(APIView):
    """List physical units under a property for reassignment options."""

    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = PartnerUnitCreateSerializer

    def get(self, request: Any, property_id: uuid.UUID) -> Response:
        partner = getattr(request.user, "partner_profile", None)
        is_staff = getattr(request.user, "is_staff", False)
        is_ops = (
            has_active_session_role(request=request, role_code="operations")
            if hasattr(request.user, "is_authenticated") and request.user.is_authenticated
            else False
        )
        is_admin = is_staff or is_ops
        if not partner and not is_admin:
            return Response(
                {"detail": "Partner profile or staff/operations privileges required"},
                status=status.HTTP_403_FORBIDDEN,
            )

        unit_type_id = request.query_params.get("unit_type_id")
        qs = Unit.objects.filter(property_id=property_id)
        if partner and not is_admin:
            qs = qs.filter(property__partner=partner)
        if unit_type_id:
            qs = qs.filter(unit_type_id=unit_type_id)

        units_data = [
            {
                "id": str(u.id),
                "unit_code": u.unit_code,
                "unit_type_name": u.unit_type.name,
                "floor": u.floor,
                "status": u.current_status,
            }
            for u in qs
        ]
        return Response(units_data)


class PartnerBlockUnitView(APIView):
    """Host blocks physical unit for maintenance and moves reservations to recovery (§5.1b)."""

    permission_classes = (permissions.IsAuthenticated, IsPartnerUser, HasApprovedA9Capability)
    serializer_class = PartnerBlockUnitSerializer

    @extend_schema(
        operation_id="stays_partner_block_unit",
        summary="Host block unit",
        description=(
            "Marks a unit under maintenance and moves confirmed reservations into recovery."
        ),
        request=PartnerBlockUnitSerializer,
        responses={200: OpenApiResponse(description="Unit marked under maintenance")},
    )
    def post(self, request: Any, unit_id: uuid.UUID) -> Response:
        serializer = PartnerBlockUnitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reason = serializer.validated_data.get("reason", "Host maintenance block")
        try:
            unit, impacted = host_block_unit(
                partner_user=request.user,
                unit_id=unit_id,
                reason=reason,
            )
            return Response(
                {
                    "status": "BLOCKED",
                    "unit_code": unit.unit_code,
                    "impacted_reservations_count": impacted,
                }
            )
        except (StayAuthorizationError, UnitUnavailableError, ValueError) as err:
            return Response({"detail": str(err)}, status=status.HTTP_400_BAD_REQUEST)


class StayCancelView(APIView):
    """Customer self-service cancellation with policy refund bands (§5.4, §5.5, M3-A9-02)."""

    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = StayCancelSerializer

    def post(self, request: Any, reservation_id: uuid.UUID) -> Response:
        serializer = StayCancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reason = serializer.validated_data.get("reason", "Customer requested cancellation")

        try:
            cancelled = cancel_stay_reservation(
                customer=request.user,
                reservation_id=reservation_id,
                reason=reason,
            )
            out = StayReservationDetailSerializer(cancelled)
            return Response(out.data)
        except (StayAuthorizationError, InvalidStayStateTransitionError) as err:
            return Response({"detail": str(err)}, status=status.HTTP_400_BAD_REQUEST)


class StayExtensionRequestView(APIView):
    """Customer requests stay extension or late check-out (§5.4, M3-A9-05)."""

    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = StayExtensionRequestSerializer

    def post(self, request: Any, reservation_id: uuid.UUID) -> Response:
        serializer = StayExtensionRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            extension = request_stay_extension(
                customer=request.user,
                reservation_id=reservation_id,
                additional_nights=data.get("additional_nights", 0),
                additional_months=data.get("additional_months", 0),
                additional_deposit_paise=data.get("additional_deposit_paise"),
            )
            return Response(
                {
                    "extension_id": str(extension.id),
                    "original_end_date": str(extension.original_end_date),
                    "extended_end_date": str(extension.extended_end_date),
                    "additional_nights": extension.additional_nights,
                    "additional_amount_paise": extension.additional_amount_paise,
                    "additional_deposit_paise": extension.additional_deposit_paise,
                    "status": extension.status,
                },
                status=status.HTTP_201_CREATED,
            )
        except (
            StayAuthorizationError,
            InvalidStayStateTransitionError,
            UnitUnavailableError,
            ValueError,
        ) as err:
            return Response({"detail": str(err)}, status=status.HTTP_400_BAD_REQUEST)


class StayExtensionConfirmView(APIView):
    """Confirm stay extension upon payment capture (§5.4, M3-A9-05)."""

    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = PaymentAttemptSerializer

    @extend_schema(
        request=None,
        responses={202: PaymentAttemptSerializer},
        parameters=[IDEMPOTENCY_HEADER],
    )
    def post(self, request: Any, extension_id: uuid.UUID) -> Response:
        try:
            ext = StayExtension.objects.get(
                id=extension_id, stay_reservation__customer=request.user
            )
        except StayExtension.DoesNotExist:
            return Response(
                {"detail": "Extension request not found"}, status=status.HTTP_404_NOT_FOUND
            )

        try:
            key = request.headers.get("Idempotency-Key", "").strip()
            if not key:
                return Response(
                    {"detail": "Idempotency-Key header is required."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            payment = initiate_stay_extension_payment(
                extension_id=ext.id,
                customer=request.user,
                idempotency_key=key,
            )
            return Response(
                PaymentAttemptSerializer(payment).data,
                status=status.HTTP_202_ACCEPTED,
            )
        except InvalidStayStateTransitionError as err:
            return Response({"detail": str(err)}, status=status.HTTP_400_BAD_REQUEST)


class StayEarlyCheckoutView(APIView):
    """Record guest early checkout and trim calendar hold (§5.4, M3-A9-04)."""

    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = StayEarlyCheckoutSerializer

    def post(self, request: Any, reservation_id: uuid.UUID) -> Response:
        serializer = StayEarlyCheckoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            res = record_early_checkout(
                user=request.user,
                reservation_id=reservation_id,
                early_checkout_date=data.get("early_checkout_date"),
                reason=data.get("reason", "Early departure"),
            )
            out = StayReservationDetailSerializer(res)
            return Response(out.data)
        except (InvalidStayStateTransitionError, ValueError) as err:
            return Response({"detail": str(err)}, status=status.HTTP_400_BAD_REQUEST)


class StayDisputeView(APIView):
    """Guest contests damage assessment, opening an Operations case (§5.4, §8.2, M3-A9-06)."""

    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = StayDisputeSerializer

    def post(self, request: Any, reservation_id: uuid.UUID) -> Response:
        serializer = StayDisputeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            res = dispute_stay_damage(
                customer=request.user,
                reservation_id=reservation_id,
                dispute_reason=serializer.validated_data["dispute_reason"],
            )
            out = StayReservationDetailSerializer(res)
            return Response(out.data)
        except (StayAuthorizationError, InvalidStayStateTransitionError) as err:
            return Response({"detail": str(err)}, status=status.HTTP_400_BAD_REQUEST)


class PartnerPropertyUnitTypesView(APIView):
    """List or create room configurations under a host property."""

    permission_classes = (permissions.IsAuthenticated, IsPartnerUser, HasApprovedA9Capability)
    serializer_class = PartnerUnitTypeCreateSerializer

    def get(self, request: Any, property_id: uuid.UUID) -> Response:
        partner = getattr(request.user, "partner_profile", None)
        if not partner:
            return Response(
                {"detail": "Partner profile required"}, status=status.HTTP_403_FORBIDDEN
            )

        unit_types = UnitType.objects.filter(property_id=property_id, property__partner=partner)
        data = [
            {
                "id": str(ut.id),
                "name": ut.name,
                "sharing_type": ut.sharing_type,
                "sharing_display": ut.get_sharing_type_display(),
                "is_ac": ut.is_ac,
                "bathroom_type": ut.bathroom_type,
                "furnishing_status": ut.furnishing_status,
                "food_included": ut.food_included,
                "bhk": ut.bhk,
                "units_count": ut.units.count(),
            }
            for ut in unit_types
        ]
        return Response(data)

    def post(self, request: Any, property_id: uuid.UUID) -> Response:
        partner = getattr(request.user, "partner_profile", None)
        if not partner:
            return Response(
                {"detail": "Partner profile required"}, status=status.HTTP_403_FORBIDDEN
            )

        try:
            prop = Property.objects.get(id=property_id, partner=partner)
        except Property.DoesNotExist:
            return Response({"detail": "Property not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = PartnerUnitTypeCreateSerializer(
            data=request.data,
            context={"partner": partner},
        )
        serializer.is_valid(raise_exception=True)
        ut = serializer.save(property=prop)
        return Response({"id": str(ut.id), "name": ut.name}, status=status.HTTP_201_CREATED)


class PartnerUnitTypeDetailView(APIView):
    """Read or update one room configuration owned by the Host."""

    permission_classes = (permissions.IsAuthenticated, IsPartnerUser, HasApprovedA9Capability)
    serializer_class = PartnerUnitTypeCreateSerializer

    def _unit_type(self, request: Any, unit_type_id: uuid.UUID) -> UnitType | None:
        return UnitType.objects.filter(
            id=unit_type_id,
            property__partner=request.user.partner_profile,
        ).first()

    def get(self, request: Any, unit_type_id: uuid.UUID) -> Response:
        unit_type = self._unit_type(request, unit_type_id)
        if unit_type is None:
            return Response({"detail": "Unit type not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(PartnerUnitTypeCreateSerializer(unit_type).data)

    def put(self, request: Any, unit_type_id: uuid.UUID) -> Response:
        unit_type = self._unit_type(request, unit_type_id)
        if unit_type is None:
            return Response({"detail": "Unit type not found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = PartnerUnitTypeCreateSerializer(
            unit_type,
            data=request.data,
            partial=True,
            context={"partner": request.user.partner_profile},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class PartnerUnitTypePricingRulesView(APIView):
    """List or add effective-dated prices for one Host-owned room type."""

    permission_classes = (permissions.IsAuthenticated, IsPartnerUser, HasApprovedA9Capability)
    serializer_class = PartnerUnitPricingRuleSerializer

    def _unit_type(self, request: Any, unit_type_id: uuid.UUID) -> UnitType | None:
        return UnitType.objects.filter(
            id=unit_type_id,
            property__partner=request.user.partner_profile,
        ).first()

    def get(self, request: Any, unit_type_id: uuid.UUID) -> Response:
        unit_type = self._unit_type(request, unit_type_id)
        if unit_type is None:
            return Response({"detail": "Unit type not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(
            PartnerUnitPricingRuleSerializer(unit_type.pricing_rules.all(), many=True).data
        )

    def post(self, request: Any, unit_type_id: uuid.UUID) -> Response:
        unit_type = self._unit_type(request, unit_type_id)
        if unit_type is None:
            return Response({"detail": "Unit type not found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = PartnerUnitPricingRuleSerializer(
            data=request.data,
            context={"unit_type": unit_type},
        )
        serializer.is_valid(raise_exception=True)
        rule = serializer.save(unit_type=unit_type)
        return Response(
            PartnerUnitPricingRuleSerializer(rule).data,
            status=status.HTTP_201_CREATED,
        )


class PartnerUnitPricingRuleDetailView(APIView):
    """Update or deactivate one Host-owned effective pricing rule."""

    permission_classes = (permissions.IsAuthenticated, IsPartnerUser, HasApprovedA9Capability)
    serializer_class = PartnerUnitPricingRuleSerializer

    def put(self, request: Any, rule_id: uuid.UUID) -> Response:
        try:
            rule = UnitPricingRule.objects.select_related("unit_type").get(
                id=rule_id,
                unit_type__property__partner=request.user.partner_profile,
            )
        except UnitPricingRule.DoesNotExist:
            return Response({"detail": "Pricing rule not found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = PartnerUnitPricingRuleSerializer(
            rule,
            data=request.data,
            partial=True,
            context={"unit_type": rule.unit_type},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class PartnerPricingOverridesView(APIView):
    """List or add nightly date overrides on a Host-owned pricing rule."""

    permission_classes = (permissions.IsAuthenticated, IsPartnerUser, HasApprovedA9Capability)
    serializer_class = PartnerUnitPricingOverrideSerializer

    def _rule(self, request: Any, rule_id: uuid.UUID) -> UnitPricingRule | None:
        return UnitPricingRule.objects.filter(
            id=rule_id,
            unit_type__property__partner=request.user.partner_profile,
        ).first()

    def get(self, request: Any, rule_id: uuid.UUID) -> Response:
        rule = self._rule(request, rule_id)
        if rule is None:
            return Response({"detail": "Pricing rule not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(PartnerUnitPricingOverrideSerializer(rule.overrides.all(), many=True).data)

    def post(self, request: Any, rule_id: uuid.UUID) -> Response:
        rule = self._rule(request, rule_id)
        if rule is None:
            return Response({"detail": "Pricing rule not found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = PartnerUnitPricingOverrideSerializer(
            data=request.data,
            context={"pricing_rule": rule},
        )
        serializer.is_valid(raise_exception=True)
        override = serializer.save(pricing_rule=rule)
        return Response(
            PartnerUnitPricingOverrideSerializer(override).data,
            status=status.HTTP_201_CREATED,
        )


class PartnerPricingOverrideDetailView(APIView):
    """Update a nightly date override owned by the Host."""

    permission_classes = (permissions.IsAuthenticated, IsPartnerUser, HasApprovedA9Capability)
    serializer_class = PartnerUnitPricingOverrideSerializer

    def put(self, request: Any, override_id: uuid.UUID) -> Response:
        try:
            override = UnitPricingOverride.objects.select_related("pricing_rule").get(
                id=override_id,
                pricing_rule__unit_type__property__partner=request.user.partner_profile,
            )
        except UnitPricingOverride.DoesNotExist:
            return Response(
                {"detail": "Pricing override not found"}, status=status.HTTP_404_NOT_FOUND
            )
        serializer = PartnerUnitPricingOverrideSerializer(
            override,
            data=request.data,
            partial=True,
            context={"pricing_rule": override.pricing_rule},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class PartnerAddUnitView(APIView):
    """Add a physical bookable room/unit under a property."""

    permission_classes = (permissions.IsAuthenticated, IsPartnerUser, HasApprovedA9Capability)
    serializer_class = PartnerUnitCreateSerializer

    def post(self, request: Any, property_id: uuid.UUID) -> Response:
        partner = getattr(request.user, "partner_profile", None)
        if not partner:
            return Response(
                {"detail": "Partner profile required"}, status=status.HTTP_403_FORBIDDEN
            )

        try:
            prop = Property.objects.get(id=property_id, partner=partner)
        except Property.DoesNotExist:
            return Response({"detail": "Property not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = PartnerUnitCreateSerializer(data=request.data, context={"property": prop})
        serializer.is_valid(raise_exception=True)
        unit = serializer.save(property=prop)
        return Response(
            {"id": str(unit.id), "unit_code": unit.unit_code}, status=status.HTTP_201_CREATED
        )


# ---------------------------------------------------------------------------
# Operations Staff Views (§8.2, §10.1, M3-OPS-321)
# ---------------------------------------------------------------------------


class OpsStayReservationsView(APIView):
    """Operations workspace listing for all stay reservations, disputes, and recovery cases."""

    permission_classes = (IsOperationsUser,)
    serializer_class = StayReservationDetailSerializer

    def get(self, request: Any) -> Response:
        status_filter = request.query_params.get("status")
        qs = (
            StayReservation.objects.all()
            .select_related(
                "unit",
                "unit__property",
                "unit__property__partner",
                "unit_type",
                "customer",
                "deposit",
            )
            .prefetch_related("lines")
            .order_by("-created_at")
        )

        if status_filter:
            qs = qs.filter(status=status_filter)

        data = [
            {
                "id": str(r.id),
                "property_id": str(r.unit.property.id),
                "property_title": r.unit.property.title,
                "property_locality": r.unit.property.locality,
                "unit_id": str(r.unit.id),
                "unit_code": r.unit.unit_code,
                "unit_type_id": str(r.unit_type.id),
                "unit_type_name": r.unit_type.name,
                "customer_name": getattr(r.customer, "full_name", "") or "Guest",
                "customer_phone": getattr(r.customer, "phone_number", ""),
                "host_name": getattr(r.unit.property.partner.user, "full_name", "") or "Host",
                "start_date": str(r.start_date),
                "end_date": str(r.end_date),
                "status": r.status,
                "total_amount_paise": r.total_amount_paise,
                "deposit_amount_paise": r.deposit_amount_paise,
                "deposit_status": r.deposit.status if hasattr(r, "deposit") else "NONE",
                "deposit_dispute_reason": r.deposit.dispute_reason if hasattr(r, "deposit") else "",
                "cancellation_reason": r.cancellation_reason,
                "notes": r.notes,
                "created_at": r.created_at.isoformat(),
            }
            for r in qs
        ]

        return Response(data)


class OpsStayReassignUnitView(APIView):
    """Operations emergency unit reassignment (§8.2, M3-A9-10)."""

    permission_classes = (IsOperationsUser,)
    serializer_class = OpsStayReassignSerializer

    def post(self, request: Any, reservation_id: uuid.UUID) -> Response:
        serializer = OpsStayReassignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            res = operations_reassign_unit(
                ops_user=request.user,
                reservation_id=reservation_id,
                target_unit_id=data["target_unit_id"],
                reason=data.get("reason", "Operations reassignment"),
            )
            return Response({"status": "REASSIGNED", "new_unit_code": res.unit.unit_code})
        except (StayAuthorizationError, UnitUnavailableError, ValueError) as err:
            return Response({"detail": str(err)}, status=status.HTTP_400_BAD_REQUEST)


class OpsStayResolveDisputeView(APIView):
    """Operations adjudicates damage dispute with maker-checker override (§8.2, M3-A9-06)."""

    permission_classes = (IsOperationsUser,)
    serializer_class = OpsStayResolveDisputeSerializer

    def post(self, request: Any, reservation_id: uuid.UUID) -> Response:
        serializer = OpsStayResolveDisputeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            deposit, resolved = operations_resolve_stay_dispute(
                ops_user=request.user,
                reservation_id=reservation_id,
                final_consumed_amount_paise=data["final_consumed_amount_paise"],
                resolution_notes=data["resolution_notes"],
            )
            return Response(
                {
                    "status": deposit.status if resolved else "PENDING_SECOND_APPROVAL",
                    "consumed_paise": deposit.consumed_amount_paise,
                    "refunded_paise": deposit.refunded_amount_paise,
                },
                status=status.HTTP_200_OK if resolved else status.HTTP_202_ACCEPTED,
            )
        except (StayAuthorizationError, InvalidStayStateTransitionError, ValueError) as err:
            return Response({"detail": str(err)}, status=status.HTTP_403_FORBIDDEN)


class PropertyVisitCreateView(APIView):
    """Schedule an in-person property visit (Step 10 inquiry flow)."""

    permission_classes = (permissions.AllowAny,)
    serializer_class = PropertyVisitRequestSerializer

    @extend_schema(
        request=PropertyVisitRequestSerializer,
        responses={201: PropertyVisitRequestSerializer},
    )
    def post(self, request: Any, property_id: uuid.UUID) -> Response:
        try:
            prop = Property.objects.get(id=property_id, is_active=True)
        except Property.DoesNotExist:
            return Response({"detail": "Property not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = PropertyVisitRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        customer = request.user if request.user and request.user.is_authenticated else None
        visit = serializer.save(property=prop, customer=customer)
        return Response(PropertyVisitRequestSerializer(visit).data, status=status.HTTP_201_CREATED)


class PartnerPropertyVisitListView(APIView):
    """List visit requests for partner's properties."""

    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request: Any) -> Response:
        if not hasattr(request.user, "partner_profile"):
            return Response(
                {"detail": "Partner profile required"},
                status=status.HTTP_403_FORBIDDEN,
            )
        visits = PropertyVisitRequest.objects.filter(
            property__partner=request.user.partner_profile
        ).select_related("property")
        return Response(PropertyVisitRequestSerializer(visits, many=True).data)
