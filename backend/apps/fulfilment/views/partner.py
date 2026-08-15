"""Partner — physical work.

The old `views.py` banner of the same name, moved whole: the work shelf (its buckets, its two
cursor paginations and its horizon), the detail read, the six `_PartnerCommandView` subclasses
that move a Booking through en route / arrived / customer unavailable / abort / release /
start-OTP verify, and the four richer Partner endpoints — propose amendment, submit completion,
record a contact attempt, and the two-step evidence upload.

The boundary is the actor: every view here resolves a `PartnerProfile` from `request.user` and
refuses another Partner's Booking, and every projection is `PartnerBookingSerializer`, which is
what keeps a Customer's address off this surface.
"""

from datetime import datetime, time, timedelta
from typing import Any, cast
from uuid import UUID
from zoneinfo import ZoneInfo

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.commerce.models import Booking
from apps.foundation.services import ResponseBody, execute_idempotent
from apps.fulfilment import completion as completion_services
from apps.fulfilment import recovery_services
from apps.fulfilment.amendments import propose_scope_amendment
from apps.fulfilment.evidence import record_work_evidence, request_work_evidence_upload
from apps.fulfilment.otp import verify_start_otp
from apps.fulfilment.serializers import (
    CustomerContactAttemptRequestSerializer,
    EvidenceFinalizeRequestSerializer,
    EvidenceUploadGrantSerializer,
    EvidenceUploadRequestSerializer,
    PartnerBookingListQuerySerializer,
    PartnerBookingPageSerializer,
    PartnerBookingSerializer,
    ProposeAmendmentRequestSerializer,
    ReasonedCommandSerializer,
    StartOtpVerifyRequestSerializer,
    SubmitCompletionRequestSerializer,
    VersionedCommandSerializer,
    WorkEvidenceSerializer,
)
from apps.fulfilment.services import (
    mark_arrived,
    mark_customer_unavailable_wait_started,
    mark_en_route,
    record_customer_contact_attempt,
)
from apps.identity.models import User
from apps.partners.models import PartnerProfile
from apps.partners.permissions import IsPartnerUser
from common.errors.serializers import ApiErrorSerializer
from common.pagination import (
    BoundedCursorQuerySerializer,
    StrictCursorPagination,
    reject_invalid_cursor_query,
)
from common.schema import IDEMPOTENCY_KEY_HEADER

from .base import (
    _ERRORS_4XX,
    FULFILMENT_TAG,
    _amendment_projection,
    _booking_queryset,
    _partner_booking,
    _partner_profile,
    _partner_projection,
    _PartnerCommandView,
    _replayable,
    _required_key,
)

# Buckets the Partner actually thinks in. `active` is everything still owed work,
# so a status added to the lifecycle shows up there by default rather than silently
# vanishing from every shelf.
_PARTNER_TERMINAL_STATUSES = (
    Booking.Status.COMPLETED,
    Booking.Status.PARTIALLY_COMPLETED,
    Booking.Status.CANCELLED,
    Booking.Status.ABORTED,
)
_PARTNER_BUCKETS: dict[str, tuple[str, ...]] = {
    "completed": (Booking.Status.COMPLETED, Booking.Status.PARTIALLY_COMPLETED),
    "cancelled": (Booking.Status.CANCELLED, Booking.Status.ABORTED),
}


class PartnerBookingCursorPagination(StrictCursorPagination):
    page_size = 25
    #: History reads newest-first; the `active` shelf overrides this to soonest-first.
    ordering = ("-scheduled_start", "-id")


class PartnerActiveBookingCursorPagination(PartnerBookingCursorPagination):
    """Soonest first.

    The work shelf is a running order, not an archive: the next thing to do
    belongs at the top. Newest-first is right for what has already happened and
    exactly wrong for what has not.
    """

    ordering = ("scheduled_start", "id")


#: How far ahead the work shelf looks.
#:
#: Today and tomorrow only. A Partner uses this list to decide what to do now and
#: what to plan for tonight; a booking three weeks out is real but it is not a
#: task, and mixing the two buries the ones that are.
_ACTIVE_HORIZON_DAYS = 2


class PartnerBookingCollectionView(APIView):
    """The Partner's own work, as a list.

    Published because the app previously had no way to ask "what jobs do I have?"
    — only `GET /partner/bookings/{id}/`, which needs an id the Partner had no
    screen to get one from.

    Scoped to the caller's own profile and takes no `partner_id`: the safest
    filter is the one a caller cannot supply, which is the same reasoning that
    keeps `booking_group_id` off the Partner booking projection.
    """

    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=[FULFILMENT_TAG],
        operation_id="partner_booking_list",
        parameters=[PartnerBookingListQuerySerializer, BoundedCursorQuerySerializer],
        responses={200: PartnerBookingPageSerializer, 403: ApiErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        reject_invalid_cursor_query(request)
        query = PartnerBookingListQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        profile = _partner_profile(cast(User, request.user))

        queryset = _booking_queryset().filter(partner=profile)
        bucket = query.validated_data.get("bucket")
        paginator: PartnerBookingCursorPagination = PartnerBookingCursorPagination()

        if bucket == "active":
            zone = ZoneInfo(settings.TIME_ZONE)
            today = timezone.now().astimezone(zone).date()
            window_start = datetime.combine(today, time.min, tzinfo=zone)
            window_end = window_start + timedelta(days=_ACTIVE_HORIZON_DAYS)
            queryset = (
                queryset.exclude(status__in=_PARTNER_TERMINAL_STATUSES)
                .filter(scheduled_start__gte=window_start, scheduled_start__lt=window_end)
                # Stale work: the sweep already flagged it overdue and it never
                # left CONFIRMED, so nothing was ever started on it. Leaving those
                # on the shelf buries the jobs a Partner can still act on under
                # ones nobody is going to do. They stay readable by id, and they
                # are still counted wherever totals are counted — only the
                # "what now?" list drops them.
                .exclude(
                    status=Booking.Status.CONFIRMED,
                    late_declared_at__isnull=False,
                )
            )
            paginator = PartnerActiveBookingCursorPagination()
        elif bucket is not None:
            queryset = queryset.filter(status__in=_PARTNER_BUCKETS[bucket])

        page = paginator.paginate_queryset(queryset, request, view=self)
        response = paginator.get_paginated_response(PartnerBookingSerializer(page, many=True).data)
        # An empty shelf carries no row to calibrate a countdown from, so the page
        # publishes the server instant too — the same reason the offer inbox does.
        response.data["server_now"] = timezone.now()
        return response


class PartnerBookingDetailView(APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=[FULFILMENT_TAG],
        operation_id="partner_booking_retrieve",
        responses={200: PartnerBookingSerializer, 403: ApiErrorSerializer},
    )
    def get(self, request: Request, booking_id: UUID) -> Response:
        profile = _partner_profile(cast(User, request.user))
        booking = _partner_booking(booking_id, profile)
        return Response(PartnerBookingSerializer(booking).data)


class PartnerEnRouteView(_PartnerCommandView):
    operation = "fulfilment.mark_en_route"

    @extend_schema(
        tags=[FULFILMENT_TAG],
        operation_id="partner_booking_en_route",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=VersionedCommandSerializer,
        responses={200: PartnerBookingSerializer, **_ERRORS_4XX},
    )
    def post(self, request: Request, booking_id: UUID) -> Response:
        return super().post(request, booking_id)

    def run(
        self, *, booking: Booking, profile: PartnerProfile, data: dict[str, Any], key: str
    ) -> None:
        mark_en_route(
            booking_id=booking.id,
            partner_id=profile.id,
            expected_version=data["expected_version"],
            idempotency_key=key,
        )


class PartnerArrivedView(_PartnerCommandView):
    operation = "fulfilment.mark_arrived"

    @extend_schema(
        tags=[FULFILMENT_TAG],
        operation_id="partner_booking_arrived",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=VersionedCommandSerializer,
        responses={200: PartnerBookingSerializer, **_ERRORS_4XX},
    )
    def post(self, request: Request, booking_id: UUID) -> Response:
        return super().post(request, booking_id)

    def run(
        self, *, booking: Booking, profile: PartnerProfile, data: dict[str, Any], key: str
    ) -> None:
        mark_arrived(
            booking_id=booking.id,
            partner_id=profile.id,
            expected_version=data["expected_version"],
            idempotency_key=key,
        )


class PartnerCustomerUnavailableView(_PartnerCommandView):
    operation = "fulfilment.customer_unavailable"

    @extend_schema(
        tags=[FULFILMENT_TAG],
        operation_id="partner_booking_customer_unavailable",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=VersionedCommandSerializer,
        responses={200: PartnerBookingSerializer, **_ERRORS_4XX},
    )
    def post(self, request: Request, booking_id: UUID) -> Response:
        return super().post(request, booking_id)

    def run(
        self, *, booking: Booking, profile: PartnerProfile, data: dict[str, Any], key: str
    ) -> None:
        mark_customer_unavailable_wait_started(
            booking_id=booking.id,
            partner_id=profile.id,
            expected_version=data["expected_version"],
            idempotency_key=key,
        )


class PartnerAbortView(_PartnerCommandView):
    operation = "fulfilment.abort_work"
    request_serializer = ReasonedCommandSerializer

    @extend_schema(
        tags=[FULFILMENT_TAG],
        operation_id="partner_booking_abort",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=ReasonedCommandSerializer,
        responses={200: PartnerBookingSerializer, **_ERRORS_4XX},
    )
    def post(self, request: Request, booking_id: UUID) -> Response:
        return super().post(request, booking_id)

    def run(
        self, *, booking: Booking, profile: PartnerProfile, data: dict[str, Any], key: str
    ) -> None:
        completion_services.abort_work(
            booking_id=booking.id,
            partner_id=profile.id,
            reason=data["reason"],
            expected_version=data["expected_version"],
            idempotency_key=key,
        )


class PartnerReleaseView(_PartnerCommandView):
    """Give the job back, with a reason and no penalty attached.

    `01-scope-and-flow.md` is explicit that M1 records a late release for manual Operations
    review only — there is no automatic score, no threat and nothing the Partner can see that
    implies one. The reason is required because recovery needs to know what happened, not to
    justify the Partner to the platform.
    """

    operation = "fulfilment.partner_release"
    request_serializer = ReasonedCommandSerializer

    @extend_schema(
        tags=[FULFILMENT_TAG],
        operation_id="partner_booking_release",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=ReasonedCommandSerializer,
        responses={200: PartnerBookingSerializer, **_ERRORS_4XX},
    )
    def post(self, request: Request, booking_id: UUID) -> Response:
        return super().post(request, booking_id)

    def run(
        self, *, booking: Booking, profile: PartnerProfile, data: dict[str, Any], key: str
    ) -> None:
        recovery_services.release_booking_partner(
            booking_id=booking.id,
            partner_id=profile.id,
            reason=data["reason"],
            expected_version=data["expected_version"],
            idempotency_key=key,
        )


class PartnerStartOtpVerifyView(_PartnerCommandView):
    operation = "fulfilment.start_otp_verify"
    request_serializer = StartOtpVerifyRequestSerializer

    @extend_schema(
        tags=[FULFILMENT_TAG],
        operation_id="partner_booking_start_otp_verify",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=StartOtpVerifyRequestSerializer,
        responses={200: PartnerBookingSerializer, **_ERRORS_4XX},
    )
    def post(self, request: Request, booking_id: UUID) -> Response:
        return super().post(request, booking_id)

    def run(
        self, *, booking: Booking, profile: PartnerProfile, data: dict[str, Any], key: str
    ) -> None:
        verify_start_otp(
            booking_id=booking.id,
            partner_id=profile.id,
            expected_version=data["expected_version"],
            code=data["code"],
            idempotency_key=key,
        )


class PartnerProposeAmendmentView(APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=[FULFILMENT_TAG],
        operation_id="partner_booking_propose_amendment",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=ProposeAmendmentRequestSerializer,
        responses={201: ApiErrorSerializer, **_ERRORS_4XX},
    )
    def post(self, request: Request, booking_id: UUID) -> Response:
        serializer = ProposeAmendmentRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = cast(User, request.user)
        profile = _partner_profile(user)
        booking = _partner_booking(booking_id, profile)
        key = _required_key(request)

        def command() -> tuple[int, ResponseBody]:
            amendment = propose_scope_amendment(
                booking_id=booking.id,
                partner_id=profile.id,
                reason=serializer.validated_data["reason"],
                task_quantity=serializer.validated_data["task_quantity"],
                expected_version=serializer.validated_data["expected_version"],
                idempotency_key=key,
            )
            return status.HTTP_201_CREATED, _amendment_projection(amendment.id)

        result = execute_idempotent(
            actor=user,
            operation="fulfilment.propose_amendment",
            key=key,
            request_payload={"booking_id": str(booking.id), **serializer.validated_data},
            command=command,
        )
        return Response(result.body, status=result.status_code)


class PartnerSubmitCompletionView(APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=[FULFILMENT_TAG],
        operation_id="partner_booking_submit_completion",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=SubmitCompletionRequestSerializer,
        responses={200: PartnerBookingSerializer, **_ERRORS_4XX},
    )
    def post(self, request: Request, booking_id: UUID) -> Response:
        serializer = SubmitCompletionRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = cast(User, request.user)
        profile = _partner_profile(user)
        booking = _partner_booking(booking_id, profile)
        key = _required_key(request)

        def command() -> tuple[int, ResponseBody]:
            completion_services.submit_completion(
                booking_id=booking.id,
                partner_id=profile.id,
                notes=serializer.validated_data["notes"],
                safety_damage_declared=serializer.validated_data["safety_damage_declared"],
                outcomes=[
                    completion_services.OutcomeInput(
                        work_task_id=item["work_task_id"],
                        outcome=item["outcome"],
                        quantity=item.get("quantity", 0),
                        reason=item.get("reason", ""),
                    )
                    for item in serializer.validated_data["outcomes"]
                ],
                expected_version=serializer.validated_data["expected_version"],
                idempotency_key=key,
            )
            return status.HTTP_200_OK, _partner_projection(booking.id)

        result = execute_idempotent(
            actor=user,
            operation="fulfilment.submit_completion",
            key=key,
            request_payload={"booking_id": str(booking.id), **serializer.validated_data},
            command=command,
        )
        return _replayable(result, lambda: _partner_projection(booking.id))


class PartnerContactAttemptView(APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=[FULFILMENT_TAG],
        operation_id="partner_booking_contact_attempt",
        request=CustomerContactAttemptRequestSerializer,
        responses={201: PartnerBookingSerializer, **_ERRORS_4XX},
    )
    def post(self, request: Request, booking_id: UUID) -> Response:
        serializer = CustomerContactAttemptRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        profile = _partner_profile(cast(User, request.user))
        booking = _partner_booking(booking_id, profile)
        record_customer_contact_attempt(
            booking_id=booking.id,
            partner_id=profile.id,
            outcome=serializer.validated_data["outcome"],
        )
        return Response(_partner_projection(booking.id), status=status.HTTP_201_CREATED)


class PartnerEvidenceUploadView(APIView):
    """Mint a signed grant; the bytes never pass through Django on the way in.

    The same three-step shape FE-07 established for KYC — request a grant, PUT to the bucket,
    finalize by object key — for the same reason: streaming megabytes of site photographs
    through the API server buys nothing and costs availability.
    """

    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=[FULFILMENT_TAG],
        operation_id="partner_booking_evidence_upload",
        request=EvidenceUploadRequestSerializer,
        responses={201: EvidenceUploadGrantSerializer, **_ERRORS_4XX},
    )
    def post(self, request: Request, booking_id: UUID) -> Response:
        serializer = EvidenceUploadRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = cast(User, request.user)
        profile = _partner_profile(user)
        booking = _partner_booking(booking_id, profile)
        grant = request_work_evidence_upload(
            booking_id=booking.id,
            requested_by=user,
            kind=serializer.validated_data["kind"],
            content_type=serializer.validated_data["content_type"],
            size_bytes=serializer.validated_data["size_bytes"],
        )
        return Response(
            EvidenceUploadGrantSerializer(
                {
                    "object_key": grant.object_key,
                    "upload_url": grant.signed.upload_url,
                    "upload_token": grant.signed.upload_token,
                    "resumable_url": grant.signed.resumable_url,
                    "method": grant.signed.method,
                    "expires_at": grant.signed.expires_at,
                }
            ).data,
            status=status.HTTP_201_CREATED,
        )


class PartnerEvidenceFinalizeView(APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=[FULFILMENT_TAG],
        operation_id="partner_booking_evidence_finalize",
        request=EvidenceFinalizeRequestSerializer,
        responses={201: WorkEvidenceSerializer, **_ERRORS_4XX},
    )
    def post(self, request: Request, booking_id: UUID) -> Response:
        serializer = EvidenceFinalizeRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = cast(User, request.user)
        profile = _partner_profile(user)
        booking = _partner_booking(booking_id, profile)
        with transaction.atomic():
            evidence = record_work_evidence(
                booking_id=booking.id,
                uploaded_by=user,
                kind=serializer.validated_data["kind"],
                object_key=serializer.validated_data["object_key"],
                content_type=serializer.validated_data["content_type"],
                size_bytes=serializer.validated_data["size_bytes"],
                sha256=serializer.validated_data["sha256"],
                work_task_id=serializer.validated_data.get("work_task_id"),
            )
        return Response(WorkEvidenceSerializer(evidence).data, status=status.HTTP_201_CREATED)
