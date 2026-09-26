from typing import Any, NoReturn
from uuid import UUID

from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import permissions, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.models import ServiceVariant, Subcategory
from apps.foundation.services import execute_idempotent
from apps.partners.permissions import IsOperationsUser
from apps.listings.exceptions import (
    ApplicationDuplicateApiError,
    ApplicationRateLimitApiError,
    ListingCapabilityRequiredApiError,
    ListingIdempotencyKeyRequiredApiError,
    ListingNotAcceptingApplicationsApiError,
    ListingStateConflictApiError,
    ListingVariantRequiredApiError,
    UnsupportedListingActionApiError,
)
from apps.listings.models import Application, Listing, ListingResumeUpload, VendorSubscriptionPlan
from apps.listings.selectors import public_listings
from apps.listings.serializers import (
    ActionReasonSerializer,
    ApplicationReportSerializer,
    ApplicationSerializer,
    ApplicationStatusSerializer,
    ListingDetailSerializer,
    ListingFiltersTaxonomySerializer,
    ListingReportSerializer,
    ListingSummarySerializer,
    ModerationSerializer,
    PartnerListingSerializer,
    ReportSerializer,
    SubmitApplicationSerializer,
    VendorSubscriptionPlanSerializer,
    VendorSubscriptionSerializer,
    OpsCreateVendorSubscriptionPlanSerializer,
    OpsUpdateVendorSubscriptionPlanSerializer,
)
from apps.listings.services import (
    ListingStateError,
    close_listing,
    create_listing,
    moderate_listing,
    partner_summary,
    publish_listing,
    reinstate_listing,
    remove_listing,
    report_application,
    report_listing,
    republish_listing,
    reveal_contact,
    start_premium_purchase,
    start_subscription_purchase,
    submit_application,
    submit_listing,
    update_application_status,
    update_listing,
    withdraw_application,
)
from apps.partners.models import PartnerProfile
from apps.partners.permissions import IsOperationsUser, IsPartnerUser


def _idempotency_key(request: Any) -> str:
    key = request.headers.get("Idempotency-Key", "").strip()
    if not key:
        raise ListingIdempotencyKeyRequiredApiError
    return str(key)


def _partner_profile(user: Any) -> PartnerProfile:
    return get_object_or_404(PartnerProfile, user=user)


def _raise_listing_error(exc: Exception) -> NoReturn:
    """Translate a domain refusal into the platform error envelope.

    A bare ``{"detail": ...}`` body is not the published error contract, so the
    client cannot parse it and reports an opaque contract failure. Raising an
    ``APIException`` lets ``common.errors.handler`` render the envelope with a
    stable code and a safe message.
    """

    if isinstance(exc, PermissionError):
        raise ListingCapabilityRequiredApiError from exc
    message = str(exc)
    if message == "APPLICATION_DUPLICATE":
        raise ApplicationDuplicateApiError from exc
    if message.startswith("Application rate limit reached"):
        raise ApplicationRateLimitApiError from exc
    if message.startswith("This listing is not accepting applications"):
        raise ListingNotAcceptingApplicationsApiError from exc
    raise ListingStateConflictApiError(message) from exc


class ListingFiltersView(APIView):
    permission_classes = (permissions.AllowAny,)

    @extend_schema(responses=ListingFiltersTaxonomySerializer)
    def get(self, _request: Any) -> Response:
        subcats = (
            Subcategory.objects.filter(
                category__slug="career-jobs",
                is_active=True,
            )
            .exclude(slug="hiring-partners")
            .order_by("name")
        )
        options: list[dict[str, str]] = [{"label": "All Roles", "value": ""}]
        if subcats.exists():
            options.extend({"label": sc.name, "value": sc.slug} for sc in subcats)
        else:
            fallback = [
                {"label": "IT & Software", "value": "software"},
                {"label": "Sales & Marketing", "value": "sales"},
                {"label": "Driver & Delivery", "value": "driver"},
                {"label": "Office & Admin", "value": "admin"},
                {"label": "Customer Support", "value": "support"},
                {"label": "Retail & Shop", "value": "retail"},
            ]
            options.extend(fallback)
        return Response({"categories": options})


class ListingBrowseView(APIView):
    permission_classes = (permissions.AllowAny,)

    @extend_schema(
        parameters=[
            OpenApiParameter("q", OpenApiTypes.STR, OpenApiParameter.QUERY),
            OpenApiParameter("location", OpenApiTypes.STR, OpenApiParameter.QUERY),
            OpenApiParameter("service", OpenApiTypes.STR, OpenApiParameter.QUERY),
            OpenApiParameter("sort", OpenApiTypes.STR, OpenApiParameter.QUERY),
            OpenApiParameter("employment_type", OpenApiTypes.STR, OpenApiParameter.QUERY),
            OpenApiParameter("work_mode", OpenApiTypes.STR, OpenApiParameter.QUERY),
            OpenApiParameter("experience", OpenApiTypes.STR, OpenApiParameter.QUERY),
            OpenApiParameter("salary_band", OpenApiTypes.STR, OpenApiParameter.QUERY),
        ],
        responses=ListingSummarySerializer(many=True),
    )
    def get(self, request: Any) -> Response:
        rows = public_listings(
            {
                "q": request.query_params.get("q"),
                "location": request.query_params.get("location"),
                "service": request.query_params.get("service"),
                "sort": request.query_params.get("sort") or "latest",
                "employment_type": request.query_params.get("employment_type"),
                "work_mode": request.query_params.get("work_mode"),
                "experience": request.query_params.get("experience"),
                "salary_band": request.query_params.get("salary_band"),
            }
        )
        return Response(ListingSummarySerializer(rows, many=True).data)


class ListingDetailView(APIView):
    permission_classes = (permissions.AllowAny,)

    @extend_schema(responses=ListingDetailSerializer)
    def get(self, _request: Any, listing_id: UUID) -> Response:
        listing = get_object_or_404(public_listings(), id=listing_id)
        return Response(ListingDetailSerializer(listing).data)


_RESUME_TYPES = {
    "application/pdf": ".pdf",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
}
_RESUME_MAX_BYTES = 5 * 1024 * 1024


class ListingResumeUploadView(APIView):
    permission_classes = (permissions.IsAuthenticated,)
    parser_classes = (MultiPartParser, FormParser)

    @extend_schema(request={"multipart/form-data": {"type": "object"}}, responses={201: dict})
    def post(self, request: Any, listing_id: UUID) -> Response:
        listing = get_object_or_404(public_listings(), id=listing_id)
        upload = request.FILES.get("file")
        if upload is None:
            return Response({"detail": "Attach a resume file."}, status=status.HTTP_400_BAD_REQUEST)
        content_type = (upload.content_type or "").split(";")[0].strip()
        if content_type not in _RESUME_TYPES:
            return Response(
                {"detail": "Resume must be a PDF, DOC, or DOCX file."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if upload.size > _RESUME_MAX_BYTES:
            return Response(
                {"detail": "Resume must be 5 MB or smaller."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        row = ListingResumeUpload.objects.create(
            listing=listing,
            applicant=request.user,
            original_name=upload.name[:180],
            content_type=content_type,
            size_bytes=upload.size,
            stored_file=upload,
        )
        resume_url = request.build_absolute_uri(row.stored_file.url)
        return Response(
            {"upload_id": str(row.id), "resume_url": resume_url, "original_name": row.original_name},
            status=status.HTTP_201_CREATED,
        )


class ListingApplicationView(APIView):
    @extend_schema(request=SubmitApplicationSerializer, responses=ApplicationSerializer)
    def post(self, request: Any, listing_id: UUID) -> Response:
        serializer = SubmitApplicationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        listing = get_object_or_404(Listing, id=listing_id)
        key = _idempotency_key(request)

        def command() -> tuple[int, dict[str, Any]]:
            try:
                application = submit_application(
                    listing=listing,
                    applicant=request.user,
                    applicant_snapshot={
                        "name": serializer.validated_data["name"],
                        "phone": serializer.validated_data["phone"],
                        "email": serializer.validated_data.get("email", ""),
                        "experience": serializer.validated_data.get("experience", ""),
                    },
                    cover_note=serializer.validated_data.get("cover_note", ""),
                    resume_url=serializer.validated_data.get("resume_url", ""),
                )
            except (ListingStateError, PermissionError) as exc:
                _raise_listing_error(exc)
            return status.HTTP_201_CREATED, ApplicationSerializer(application).data

        result = execute_idempotent(
            actor=request.user,
            operation="submit_application",
            key=key,
            request_payload={"listing_id": str(listing_id), "body": serializer.validated_data},
            command=command,
        )
        return Response(result.body, status=result.status_code)


class ListingReportView(APIView):
    @extend_schema(request=ReportSerializer, responses=ListingReportSerializer)
    def post(self, request: Any, listing_id: UUID) -> Response:
        serializer = ReportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        listing = get_object_or_404(Listing, id=listing_id)
        report = report_listing(
            listing=listing,
            reporter=request.user,
            reason=serializer.validated_data["reason"],
            detail=serializer.validated_data.get("detail", ""),
        )
        return Response(ListingReportSerializer(report).data, status=status.HTTP_201_CREATED)


class ApplicationReportView(APIView):
    @extend_schema(request=ReportSerializer, responses=ApplicationReportSerializer)
    def post(self, request: Any, application_id: UUID) -> Response:
        serializer = ReportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        application = get_object_or_404(Application, id=application_id)
        report = report_application(
            application=application,
            reporter=request.user,
            reason=serializer.validated_data["reason"],
            detail=serializer.validated_data.get("detail", ""),
        )
        return Response(ApplicationReportSerializer(report).data, status=status.HTTP_201_CREATED)


class MyApplicationsView(APIView):
    @extend_schema(responses=ApplicationSerializer(many=True))
    def get(self, request: Any) -> Response:
        rows = Application.objects.select_related("listing").filter(applicant=request.user)
        return Response(ApplicationSerializer(rows, many=True).data)


class MyApplicationWithdrawView(APIView):
    @extend_schema(request=None, responses=ApplicationSerializer)
    def post(self, request: Any, application_id: UUID) -> Response:
        application = get_object_or_404(Application, id=application_id, applicant=request.user)
        return Response(
            ApplicationSerializer(
                withdraw_application(application=application, actor=request.user)
            ).data
        )


class PartnerListingRoleCatalogView(APIView):
    permission_classes = (IsPartnerUser,)

    @extend_schema(responses={200: OpenApiTypes.OBJECT})
    def get(self, _request: Any) -> Response:
        variants = (
            ServiceVariant.objects.filter(booking_archetype="A10_LISTING", is_active=True)
            .select_related("service")
            .prefetch_related("a10_configurations")
            .order_by("service__name")
        )
        data = []
        for v in variants:
            active_cfg = next(
                (c for c in v.a10_configurations.all() if c.status == "ACTIVE"),
                None,
            )
            data.append(
                {
                    "id": str(v.service_id),
                    "slug": v.service.slug,
                    "name": v.service.name,
                    "variants": [
                        {
                            "id": str(v.id),
                            "code": v.code,
                            "name": v.name,
                            "fulfilment_archetype": v.booking_archetype,
                            "listing_type_schema": active_cfg.listing_type_schema
                            if active_cfg
                            else {},
                            "application_schema": active_cfg.application_schema
                            if active_cfg
                            else {},
                        }
                    ],
                }
            )
        return Response(data)


class PartnerListingCollectionView(APIView):
    permission_classes = (IsPartnerUser,)

    @extend_schema(responses=PartnerListingSerializer(many=True))
    def get(self, request: Any) -> Response:
        poster = _partner_profile(request.user)
        rows = Listing.objects.select_related("variant", "variant__service", "poster").filter(
            poster=poster
        )
        return Response(PartnerListingSerializer(rows, many=True).data)

    @extend_schema(request=PartnerListingSerializer, responses=PartnerListingSerializer)
    def post(self, request: Any) -> Response:
        poster = _partner_profile(request.user)
        serializer = PartnerListingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        variant_id = serializer.validated_data.get("variant_id")
        if not variant_id:
            service_id = serializer.validated_data.get("service_id")
            service_slug = serializer.validated_data.get("service_slug")
            variant_qs = ServiceVariant.objects.filter(
                booking_archetype="A10_LISTING", is_active=True
            )
            if service_id:
                variant_qs = variant_qs.filter(service_id=service_id)
            elif service_slug:
                variant_qs = variant_qs.filter(service__slug=service_slug)
            variant = variant_qs.first()
            if not variant:
                if service_id:
                    variant = ServiceVariant.objects.filter(
                        service_id=service_id, is_active=True
                    ).first()
                elif service_slug:
                    variant = ServiceVariant.objects.filter(
                        service__slug=service_slug, is_active=True
                    ).first()
            if not variant:
                raise ListingVariantRequiredApiError
            variant_id = variant.id

        try:
            listing = create_listing(
                poster=poster,
                variant_id=variant_id,
                title=serializer.validated_data["title"],
                description=serializer.validated_data["description"],
                structured_fields=serializer.validated_data.get("structured_fields", {}),
                location_text=serializer.validated_data.get("location_text", ""),
                contact_phone=serializer.validated_data.get("contact_phone", ""),
                contact_email=serializer.validated_data.get("contact_email", ""),
            )
            if serializer.validated_data.get("is_premium"):
                listing = start_premium_purchase(
                    listing=listing,
                    actor=request.user,
                    idempotency_key=_idempotency_key(request),
                )
        except (ListingStateError, PermissionError) as exc:
            _raise_listing_error(exc)
        return Response(PartnerListingSerializer(listing).data, status=status.HTTP_201_CREATED)


class PartnerListingDetailView(APIView):
    permission_classes = (IsPartnerUser,)

    def _listing(self, request: Any, listing_id: UUID) -> Listing:
        return get_object_or_404(Listing, id=listing_id, poster=_partner_profile(request.user))

    @extend_schema(responses=PartnerListingSerializer)
    def get(self, request: Any, listing_id: UUID) -> Response:
        return Response(PartnerListingSerializer(self._listing(request, listing_id)).data)

    @extend_schema(request=PartnerListingSerializer, responses=PartnerListingSerializer)
    def put(self, request: Any, listing_id: UUID) -> Response:
        listing = self._listing(request, listing_id)
        serializer = PartnerListingSerializer(listing, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            validated = dict(serializer.validated_data)
            wants_premium = validated.pop("is_premium", False)
            validated.pop("service_id", None)
            validated.pop("service_slug", None)
            validated.pop("variant_id", None)
            listing = update_listing(listing=listing, actor=request.user, **validated)
            if wants_premium and not listing.is_premium:
                listing = start_premium_purchase(
                    listing=listing,
                    actor=request.user,
                    idempotency_key=_idempotency_key(request),
                )
        except (ListingStateError, PermissionError) as exc:
            _raise_listing_error(exc)
        return Response(PartnerListingSerializer(listing).data)


class PartnerListingActionView(APIView):
    permission_classes = (IsPartnerUser,)

    @extend_schema(
        operation_id="partner_listing_action",
        request=ActionReasonSerializer,
        responses=PartnerListingSerializer,
    )
    def post(self, request: Any, listing_id: UUID, action: str) -> Response:
        listing = get_object_or_404(Listing, id=listing_id, poster=_partner_profile(request.user))
        serializer = ActionReasonSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            if action == "submit":
                listing = submit_listing(listing=listing, actor=request.user)
            elif action == "publish":
                listing = publish_listing(listing=listing, actor=request.user)
            elif action == "republish":
                listing = republish_listing(listing=listing, actor=request.user)
            elif action == "close":
                listing = close_listing(
                    listing=listing,
                    actor=request.user,
                    reason=serializer.validated_data.get("reason", ""),
                )
            elif action == "purchase-premium":
                listing = start_premium_purchase(
                    listing=listing,
                    actor=request.user,
                    idempotency_key=_idempotency_key(request),
                )
            else:
                raise UnsupportedListingActionApiError
        except (ListingStateError, PermissionError) as exc:
            _raise_listing_error(exc)
        return Response(PartnerListingSerializer(listing).data)


class PartnerListingApplicationsView(APIView):
    permission_classes = (IsPartnerUser,)

    @extend_schema(responses=ApplicationSerializer(many=True))
    def get(self, request: Any, listing_id: UUID) -> Response:
        poster = _partner_profile(request.user)
        listing = get_object_or_404(Listing, id=listing_id, poster=poster)
        rows = Application.objects.select_related("listing").filter(listing=listing)
        return Response(ApplicationSerializer(rows, many=True).data)


class PartnerApplicationActionView(APIView):
    permission_classes = (IsPartnerUser,)

    @extend_schema(
        operation_id="partner_listing_application_action",
        request=ApplicationStatusSerializer,
        responses=ApplicationSerializer,
    )
    def post(self, request: Any, application_id: UUID, action: str) -> Response:
        poster = _partner_profile(request.user)
        application = get_object_or_404(
            Application.objects.select_related("listing"), id=application_id, listing__poster=poster
        )
        try:
            if action == "reveal-contact":
                application = reveal_contact(application=application, actor=request.user)
            elif action == "status":
                serializer = ApplicationStatusSerializer(data=request.data)
                serializer.is_valid(raise_exception=True)
                application = update_application_status(
                    application=application,
                    actor=request.user,
                    status=serializer.validated_data["status"],
                )
            else:
                raise UnsupportedListingActionApiError
        except (ListingStateError, PermissionError) as exc:
            _raise_listing_error(exc)
        return Response(ApplicationSerializer(application).data)


class PartnerListingHomeView(APIView):
    permission_classes = (IsPartnerUser,)

    @extend_schema(responses={200: OpenApiTypes.OBJECT})
    def get(self, request: Any) -> Response:
        return Response(partner_summary(_partner_profile(request.user)))


class VendorSubscriptionPlanView(APIView):
    permission_classes = (IsPartnerUser,)

    @extend_schema(responses=VendorSubscriptionPlanSerializer(many=True))
    def get(self, _request: Any) -> Response:
        plans = VendorSubscriptionPlan.objects.filter(is_active=True)
        return Response(VendorSubscriptionPlanSerializer(plans, many=True).data)


class VendorSubscriptionPurchaseView(APIView):
    permission_classes = (IsPartnerUser,)

    @extend_schema(
        operation_id="partner_listing_subscription_purchase",
        request=None,
        responses=VendorSubscriptionSerializer,
    )
    def post(self, request: Any, plan_id: UUID) -> Response:
        key = _idempotency_key(request)
        plan = get_object_or_404(VendorSubscriptionPlan, id=plan_id, is_active=True)
        try:
            subscription = start_subscription_purchase(
                poster=_partner_profile(request.user),
                plan=plan,
                idempotency_key=key,
            )
        except (ListingStateError, PermissionError) as exc:
            _raise_listing_error(exc)
        return Response(
            VendorSubscriptionSerializer(subscription).data, status=status.HTTP_201_CREATED
        )


class OpsListingCollectionView(APIView):
    permission_classes = (IsOperationsUser,)

    @extend_schema(responses=PartnerListingSerializer(many=True))
    def get(self, _request: Any) -> Response:
        rows = Listing.objects.select_related("poster", "variant", "variant__service").all()
        return Response(PartnerListingSerializer(rows, many=True).data)


class OpsListingModerateView(APIView):
    permission_classes = (IsOperationsUser,)

    @extend_schema(request=ModerationSerializer, responses=PartnerListingSerializer)
    def post(self, request: Any, listing_id: UUID) -> Response:
        serializer = ModerationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        listing = get_object_or_404(Listing, id=listing_id)
        try:
            listing = moderate_listing(
                listing=listing,
                actor=request.user,
                approved=serializer.validated_data["approved"],
                reason=serializer.validated_data.get("reason", ""),
            )
        except (ListingStateError, PermissionError) as exc:
            _raise_listing_error(exc)
        return Response(PartnerListingSerializer(listing).data)


class OpsListingRemoveView(APIView):
    permission_classes = (IsOperationsUser,)

    @extend_schema(request=ActionReasonSerializer, responses=PartnerListingSerializer)
    def post(self, request: Any, listing_id: UUID) -> Response:
        serializer = ActionReasonSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            listing = remove_listing(
                listing=get_object_or_404(Listing, id=listing_id),
                actor=request.user,
                reason=serializer.validated_data.get("reason", ""),
            )
        except (ListingStateError, PermissionError) as exc:
            _raise_listing_error(exc)
        return Response(PartnerListingSerializer(listing).data)


class OpsListingReinstateView(APIView):
    permission_classes = (IsOperationsUser,)

    @extend_schema(request=ActionReasonSerializer, responses=PartnerListingSerializer)
    def post(self, request: Any, listing_id: UUID) -> Response:
        serializer = ActionReasonSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            listing = reinstate_listing(
                listing=get_object_or_404(Listing, id=listing_id),
                actor=request.user,
                reason=serializer.validated_data.get("reason", ""),
            )
        except (ListingStateError, PermissionError) as exc:
            _raise_listing_error(exc)
        return Response(PartnerListingSerializer(listing).data)


class OpsVendorSubscriptionPlanCollectionView(APIView):
    permission_classes = (IsOperationsUser,)

    @extend_schema(responses=VendorSubscriptionPlanSerializer(many=True))
    def get(self, _request: Any) -> Response:
        plans = VendorSubscriptionPlan.objects.all().order_by("code")
        return Response(VendorSubscriptionPlanSerializer(plans, many=True).data)

    @extend_schema(request=OpsCreateVendorSubscriptionPlanSerializer, responses=VendorSubscriptionPlanSerializer)
    def post(self, request: Any) -> Response:
        ser = OpsCreateVendorSubscriptionPlanSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        plan = ser.save()
        return Response(VendorSubscriptionPlanSerializer(plan).data, status=status.HTTP_201_CREATED)


class OpsVendorSubscriptionPlanDetailView(APIView):
    permission_classes = (IsOperationsUser,)

    @extend_schema(request=OpsUpdateVendorSubscriptionPlanSerializer, responses=VendorSubscriptionPlanSerializer)
    def patch(self, request: Any, plan_id: UUID) -> Response:
        plan = get_object_or_404(VendorSubscriptionPlan, id=plan_id)
        ser = OpsUpdateVendorSubscriptionPlanSerializer(plan, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        plan = ser.save()
        return Response(VendorSubscriptionPlanSerializer(plan).data)
