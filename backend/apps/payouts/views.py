"""Ledger and payout surfaces: the Partner's own earnings, and Operations' payout runs.

## Two step-up gates, both deliberate

`approve` and `pay` both require `HasRecentOperationsStepUp` — a fresh OTP on the session before
money leaves. Maker-checker already means two different people are involved; the step-up means
neither of them can be a stolen session sitting open on an unlocked laptop. Approving a payout
run is the single largest money-moving action in the platform, and it is the one place where
being slower is obviously correct.

Proposing and cancelling do not require step-up. Proposing moves nothing, and cancelling only
returns money to the pool — making the *safe* direction harder than the dangerous one would
train people to leave batches sitting approved.

## The Partner sees their own ledger and nothing else

`/partner/earnings/` and `/partner/ledger/` resolve the Partner from the session. There is no
`partner_id` parameter to get wrong, which is the same reasoning that keeps `booking_group_id`
off the Partner booking projection: the safest filter is the one that cannot be supplied.
"""

from typing import Any, cast
from uuid import UUID

from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.foundation.services import ResponseBody, execute_idempotent
from apps.identity.models import User
from apps.partners.models import PartnerProfile
from apps.partners.permissions import (
    HasRecentOperationsStepUp,
    IsOperationsUser,
    IsPartnerUser,
)
from apps.payouts.models import PartnerLedgerEntry, PartnerPayoutAccount, PayoutBatch
from apps.payouts.serializers import (
    LedgerAdjustmentRequestSerializer,
    PartnerBalanceSerializer,
    PartnerLedgerEntrySerializer,
    PartnerLedgerPageSerializer,
    PartnerPayoutAccountSerializer,
    PayoutBatchListSerializer,
    PayoutBatchPageSerializer,
    PayoutBatchSerializer,
    ProposePayoutBatchRequestSerializer,
    UnpayablePartnerSerializer,
    VersionedBatchCommandSerializer,
)
from apps.payouts.services import (
    approve_payout_batch,
    cancel_payout_batch,
    partner_balance_paise,
    propose_payout_batch,
    record_adjustment,
    start_paying_batch,
    unpayable_partner_ids,
)
from common.errors.serializers import ApiErrorSerializer
from common.pagination import StrictCursorPagination
from common.schema import IDEMPOTENCY_KEY_HEADER


class LedgerCursorPagination(StrictCursorPagination):
    """See `CaseCursorPagination`: ordering belongs to the paginator, not the queryset."""

    page_size = 50
    ordering = ("-created_at", "-id")


class PayoutBatchCursorPagination(StrictCursorPagination):
    page_size = 50
    ordering = ("-created_at", "-id")


PARTNER_TAG = "Partner"
OPERATIONS_TAG = "Operations"

_ERRORS = {
    400: ApiErrorSerializer,
    403: ApiErrorSerializer,
    404: ApiErrorSerializer,
    409: ApiErrorSerializer,
}


def _required_key(request: Request) -> str:
    key = request.headers.get("Idempotency-Key")
    if not key:
        raise ValidationError(
            {"Idempotency-Key": "This header is required."}, code="idempotency_key_required"
        )
    return key


def _partner_profile(user: User) -> PartnerProfile:
    profile = PartnerProfile.objects.filter(user=user).first()
    if profile is None:
        raise PermissionDenied("This account has no Partner profile.")
    return profile


def _batch_projection(batch_id: UUID) -> ResponseBody:
    batch = PayoutBatch.objects.prefetch_related("items").get(id=batch_id)
    return cast(ResponseBody, PayoutBatchSerializer(batch).data)


# --------------------------------------------------------------------------------------------
# Partner
# --------------------------------------------------------------------------------------------


class PartnerEarningsView(APIView):
    """What the Partner is owed, split by state.

    One number would be a lie: money held behind an open quality case is not money you can plan
    around. `05-pricing-payments-and-settlement.md` also rules out on-demand withdrawal in M1, so
    this deliberately publishes no "withdraw" affordance — payouts run as a reviewed batch, and a
    button that implied otherwise would be promising something the platform does not do.
    """

    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=[PARTNER_TAG],
        operation_id="partner_earnings_retrieve",
        responses={200: PartnerBalanceSerializer, 403: ApiErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        profile = _partner_profile(cast(User, request.user))
        balance = partner_balance_paise(profile)
        return Response(
            PartnerBalanceSerializer(
                {**balance, "currency": "INR", "server_now": timezone.now()}
            ).data
        )


class PartnerLedgerView(APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=[PARTNER_TAG],
        operation_id="partner_ledger_list",
        parameters=[OpenApiParameter("cursor", str, description="Opaque page cursor.")],
        responses={200: PartnerLedgerPageSerializer, 403: ApiErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        profile = _partner_profile(cast(User, request.user))
        queryset = PartnerLedgerEntry.objects.filter(partner=profile)
        paginator = LedgerCursorPagination()
        page = paginator.paginate_queryset(queryset, request, self)
        return paginator.get_paginated_response(
            PartnerLedgerEntrySerializer(page or [], many=True).data
        )


class PartnerPayoutAccountView(APIView):
    """The Partner's own account, masked.

    Read-only here on purpose. Registering or changing an account starts a cooling period and is
    the event an account-takeover investigation begins from, so it goes through the reviewed
    onboarding path rather than a self-service PATCH nobody watches.
    """

    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=[PARTNER_TAG],
        operation_id="partner_payout_account_retrieve",
        responses={
            200: PartnerPayoutAccountSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
        },
    )
    def get(self, request: Request) -> Response:
        profile = _partner_profile(cast(User, request.user))
        account = (
            PartnerPayoutAccount.objects.filter(partner=profile)
            .exclude(status=PartnerPayoutAccount.Status.REPLACED)
            .order_by("-created_at")
            .first()
        )
        if account is None:
            return Response(
                {"detail": "No payout account is registered."}, status=status.HTTP_404_NOT_FOUND
            )
        return Response(PartnerPayoutAccountSerializer(account).data)


# --------------------------------------------------------------------------------------------
# Operations
# --------------------------------------------------------------------------------------------


class PayoutBatchListView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=[OPERATIONS_TAG],
        operation_id="operations_payout_batches_list",
        parameters=[
            OpenApiParameter("status", str, description="Filter by batch status."),
            OpenApiParameter("cursor", str, description="Opaque page cursor."),
        ],
        responses={200: PayoutBatchPageSerializer, 403: ApiErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        queryset = PayoutBatch.objects.all()
        if value := request.query_params.get("status"):
            queryset = queryset.filter(status=value)
        paginator = PayoutBatchCursorPagination()
        page = paginator.paginate_queryset(queryset, request, self)
        return paginator.get_paginated_response(
            PayoutBatchListSerializer(page or [], many=True).data
        )

    @extend_schema(
        tags=[OPERATIONS_TAG],
        operation_id="operations_payout_batch_propose",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=ProposePayoutBatchRequestSerializer,
        responses={201: PayoutBatchSerializer, **_ERRORS},
    )
    def post(self, request: Request) -> Response:
        serializer = ProposePayoutBatchRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        actor = cast(User, request.user)
        key = _required_key(request)
        data = serializer.validated_data

        def command() -> tuple[int, ResponseBody]:
            batch = propose_payout_batch(
                reference=data["reference"],
                period_start=data["period_start"],
                period_end=data["period_end"],
                actor=actor,
            )
            return status.HTTP_201_CREATED, _batch_projection(batch.id)

        result = execute_idempotent(
            actor=actor,
            operation="payouts.propose_batch",
            key=key,
            request_payload=dict(data),
            command=command,
        )
        return Response(result.body, status=result.status_code)


class PayoutBatchDetailView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=[OPERATIONS_TAG],
        operation_id="operations_payout_batch_retrieve",
        responses={200: PayoutBatchSerializer, 403: ApiErrorSerializer, 404: ApiErrorSerializer},
    )
    def get(self, _request: Request, batch_id: UUID) -> Response:
        get_object_or_404(PayoutBatch, id=batch_id)
        return Response(_batch_projection(batch_id))


class PayoutBatchApproveView(APIView):
    """Maker-checker plus a fresh OTP.

    Two different people is a control against one person acting alone. The step-up is a control
    against neither of them actually being present — an unlocked laptop with an Operations
    session open should not be able to release a week of payouts.
    """

    permission_classes = (IsAuthenticated, IsOperationsUser, HasRecentOperationsStepUp)

    @extend_schema(
        tags=[OPERATIONS_TAG],
        operation_id="operations_payout_batch_approve",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=VersionedBatchCommandSerializer,
        responses={200: PayoutBatchSerializer, 401: ApiErrorSerializer, **_ERRORS},
    )
    def post(self, request: Request, batch_id: UUID) -> Response:
        serializer = VersionedBatchCommandSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        actor = cast(User, request.user)
        batch = get_object_or_404(PayoutBatch, id=batch_id)
        key = _required_key(request)

        def command() -> tuple[int, ResponseBody]:
            approve_payout_batch(
                batch_id=batch.id,
                expected_version=serializer.validated_data["expected_version"],
                actor=actor,
            )
            return status.HTTP_200_OK, _batch_projection(batch.id)

        result = execute_idempotent(
            actor=actor,
            operation="payouts.approve_batch",
            key=key,
            request_payload={"batch_id": str(batch.id), **serializer.validated_data},
            command=command,
        )
        return Response(result.body, status=result.status_code)


class PayoutBatchPayView(APIView):
    """The moment money starts leaving. Step-up again, because approval and payment can be
    hours apart and the second decision deserves its own proof of presence."""

    permission_classes = (IsAuthenticated, IsOperationsUser, HasRecentOperationsStepUp)

    @extend_schema(
        tags=[OPERATIONS_TAG],
        operation_id="operations_payout_batch_pay",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=VersionedBatchCommandSerializer,
        responses={200: PayoutBatchSerializer, 401: ApiErrorSerializer, **_ERRORS},
    )
    def post(self, request: Request, batch_id: UUID) -> Response:
        serializer = VersionedBatchCommandSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        actor = cast(User, request.user)
        batch = get_object_or_404(PayoutBatch, id=batch_id)
        key = _required_key(request)

        def command() -> tuple[int, ResponseBody]:
            start_paying_batch(
                batch_id=batch.id,
                expected_version=serializer.validated_data["expected_version"],
            )
            return status.HTTP_200_OK, _batch_projection(batch.id)

        result = execute_idempotent(
            actor=actor,
            operation="payouts.pay_batch",
            key=key,
            request_payload={"batch_id": str(batch.id), **serializer.validated_data},
            command=command,
        )
        return Response(result.body, status=result.status_code)


class PayoutBatchCancelView(APIView):
    """No step-up: cancelling only returns money to the pool.

    Making the safe direction as heavy as the dangerous one trains people to leave batches
    sitting approved rather than cancel a bad one.
    """

    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=[OPERATIONS_TAG],
        operation_id="operations_payout_batch_cancel",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=VersionedBatchCommandSerializer,
        responses={200: PayoutBatchSerializer, **_ERRORS},
    )
    def post(self, request: Request, batch_id: UUID) -> Response:
        serializer = VersionedBatchCommandSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        actor = cast(User, request.user)
        batch = get_object_or_404(PayoutBatch, id=batch_id)
        key = _required_key(request)

        def command() -> tuple[int, ResponseBody]:
            cancel_payout_batch(
                batch_id=batch.id,
                expected_version=serializer.validated_data["expected_version"],
                actor=actor,
            )
            return status.HTTP_200_OK, _batch_projection(batch.id)

        result = execute_idempotent(
            actor=actor,
            operation="payouts.cancel_batch",
            key=key,
            request_payload={"batch_id": str(batch.id), **serializer.validated_data},
            command=command,
        )
        return Response(result.body, status=result.status_code)


class UnpayablePartnersView(APIView):
    """Who is owed money and cannot be paid. The list a run is chased from."""

    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=[OPERATIONS_TAG],
        operation_id="operations_unpayable_partners",
        parameters=[
            OpenApiParameter("period_start", str, required=True),
            OpenApiParameter("period_end", str, required=True),
        ],
        responses={200: UnpayablePartnerSerializer, 400: ApiErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        start = parse_datetime(request.query_params.get("period_start", "") or "")
        end = parse_datetime(request.query_params.get("period_end", "") or "")
        if start is None or end is None:
            raise ValidationError({"period": "period_start and period_end are required."})
        return Response(
            UnpayablePartnerSerializer(
                {"partner_ids": unpayable_partner_ids(period_start=start, period_end=end)}
            ).data
        )


class LedgerAdjustmentView(APIView):
    """Correct the ledger by adding to it. Step-up, because an adjustment moves what is owed."""

    permission_classes = (IsAuthenticated, IsOperationsUser, HasRecentOperationsStepUp)

    @extend_schema(
        tags=[OPERATIONS_TAG],
        operation_id="operations_ledger_adjust",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=LedgerAdjustmentRequestSerializer,
        responses={201: PartnerLedgerEntrySerializer, 401: ApiErrorSerializer, **_ERRORS},
    )
    def post(self, request: Request) -> Response:
        serializer = LedgerAdjustmentRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        actor = cast(User, request.user)
        key = _required_key(request)
        data: dict[str, Any] = serializer.validated_data

        entry = record_adjustment(
            partner_id=data["partner_id"],
            corrects_id=data.get("corrects_id"),
            net_paise=data["net_paise"],
            reason=data["reason"],
            actor=actor,
            idempotency_key=key,
        )
        return Response(PartnerLedgerEntrySerializer(entry).data, status=status.HTTP_201_CREATED)
