"""Operations Customers: find a customer, read their record, block or unblock them."""

import uuid
from typing import cast

from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers, status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.identity.models import User
from apps.identity.services import AccountBlockError, set_account_blocked
from apps.partners.models import PartnerProfile
from apps.partners.permissions import IsOperationsUser
from common.errors.serializers import ApiErrorSerializer
from common.pagination import (
    CURSOR_PARAMETER,
    OperationsNewestFirstPagination,
    page_serializer,
    paginated,
)

from .customers import (
    customer_record,
    operations_customer,
    operations_customer_directory,
    partner_activity,
)


class OperationsCustomerRowSerializer(serializers.ModelSerializer[User]):
    is_blocked = serializers.SerializerMethodField()
    is_partner = serializers.BooleanField(read_only=True)

    class Meta:
        model = User
        fields = ("id", "full_name", "phone_number", "date_joined", "is_blocked", "is_partner")
        read_only_fields = fields

    def get_is_blocked(self, user: User) -> bool:
        return not user.is_active


class CustomerDirectoryPagination(OperationsNewestFirstPagination):
    ordering = ("-date_joined", "-id")


class OperationsCustomerBookingSerializer(serializers.Serializer[object]):
    kind = serializers.ChoiceField(
        choices=(
            ("HOME_VISIT", "Home-service visit"),
            ("RENTAL", "Rental"),
            ("STAY", "Stay"),
            ("REQUEST", "Crew or project request"),
        )
    )
    id = serializers.UUIDField()
    title = serializers.CharField()
    status = serializers.CharField()
    status_label = serializers.CharField()
    when = serializers.DateTimeField(help_text="Visit time, start date, check-in or request date.")
    total_paise = serializers.IntegerField(allow_null=True)


class OperationsCustomerCaseSerializer(serializers.Serializer[object]):
    id = serializers.UUIDField()
    summary = serializers.CharField()
    kind = serializers.CharField()
    status = serializers.CharField()
    created_at = serializers.DateTimeField()


class OperationsCustomerQuoteSerializer(serializers.Serializer[object]):
    id = serializers.UUIDField()
    title = serializers.CharField()
    total_paise = serializers.IntegerField()
    created_at = serializers.DateTimeField()
    expires_at = serializers.DateTimeField()


class OperationsCustomerBlockSerializer(serializers.Serializer[object]):
    reason = serializers.CharField(allow_blank=True)
    at = serializers.DateTimeField()
    by = serializers.CharField(allow_blank=True)


class OperationsCustomerRecordSerializer(serializers.Serializer[object]):
    id = serializers.UUIDField()
    full_name = serializers.CharField(allow_blank=True)
    phone_number = serializers.CharField()
    email = serializers.CharField(allow_blank=True)
    date_joined = serializers.DateTimeField()
    is_blocked = serializers.BooleanField()
    block = OperationsCustomerBlockSerializer(
        allow_null=True, help_text="Why and by whom, while blocked."
    )
    partner_id = serializers.UUIDField(
        allow_null=True, help_text="Set when this person is also a partner."
    )
    wallet_balance_paise = serializers.IntegerField()
    coins_spendable = serializers.IntegerField()
    bookings = OperationsCustomerBookingSerializer(
        many=True, help_text="The 25 most recent, every kind."
    )
    open_quotes = OperationsCustomerQuoteSerializer(
        many=True, help_text="Unpaid, unexpired quotes Operations can check out for them."
    )
    open_cases = OperationsCustomerCaseSerializer(many=True)


class OperationsCustomerBlockRequestSerializer(serializers.Serializer[object]):
    blocked = serializers.BooleanField(help_text="`true` blocks, `false` unblocks.")
    reason = serializers.CharField(max_length=480, help_text="Kept in the account's history.")


class OperationsCustomerCollectionView(APIView):
    """Every customer, newest first. `?q=` a name, or a mobile number however it was typed."""

    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["Operations"],
        operation_id="operations_customers_list",
        parameters=[OpenApiParameter("q", str, OpenApiParameter.QUERY), CURSOR_PARAMETER],
        responses={
            200: page_serializer(OperationsCustomerRowSerializer, "OperationsCustomerPage"),
            403: ApiErrorSerializer,
        },
    )
    def get(self, request: Request) -> Response:
        return paginated(
            request,
            self,
            operations_customer_directory(request.query_params.get("q") or ""),
            OperationsCustomerRowSerializer,
            pagination=CustomerDirectoryPagination,
        )


def _customer_or_404(customer_id: uuid.UUID) -> User:
    customer = operations_customer(customer_id)
    if customer is None:
        raise NotFound("No customer with that id.")
    return customer


class OperationsCustomerDetailView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["Operations"],
        operation_id="operations_customer_retrieve",
        responses={
            200: OperationsCustomerRecordSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
        },
    )
    def get(self, _request: Request, customer_id: uuid.UUID) -> Response:
        return Response(
            OperationsCustomerRecordSerializer(customer_record(_customer_or_404(customer_id))).data
        )


class OperationsCustomerBlockView(APIView):
    """Block or unblock an account. Blocking signs the person out everywhere."""

    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["Operations"],
        operation_id="operations_customer_block",
        request=OperationsCustomerBlockRequestSerializer,
        responses={
            200: OperationsCustomerRecordSerializer,
            400: ApiErrorSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, customer_id: uuid.UUID) -> Response:
        customer = _customer_or_404(customer_id)
        body = OperationsCustomerBlockRequestSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            customer = set_account_blocked(
                actor=cast(User, request.user),
                user_id=customer.id,
                blocked=body.validated_data["blocked"],
                reason=body.validated_data["reason"],
            )
        except AccountBlockError as exc:
            raise ValidationError({"reason": [str(exc)]}, code="account_block_refused") from exc
        return Response(
            OperationsCustomerRecordSerializer(customer_record(customer)).data,
            status=status.HTTP_200_OK,
        )


class OperationsPartnerBalanceSerializer(serializers.Serializer[object]):
    available_paise = serializers.IntegerField(
        help_text="Payable now. Negative when refunds exceed it."
    )
    withdrawable_paise = serializers.IntegerField()
    clearing_paise = serializers.IntegerField(help_text="Earned, waiting out the dispute window.")
    held_paise = serializers.IntegerField(help_text="Frozen by a dispute or case.")
    pending_paise = serializers.IntegerField()
    reserved_paise = serializers.IntegerField(help_text="In a payout not yet settled.")
    paid_paise = serializers.IntegerField()


class OperationsPartnerActivitySerializer(serializers.Serializer[object]):
    balance = OperationsPartnerBalanceSerializer()
    bookings = OperationsCustomerBookingSerializer(many=True, help_text="The 25 most recent.")


class OperationsPartnerActivityView(APIView):
    """A partner's recent work across services and what they are owed, for the partner record."""

    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["Operations"],
        operation_id="operations_partner_activity",
        responses={
            200: OperationsPartnerActivitySerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
        },
    )
    def get(self, _request: Request, partner_id: uuid.UUID) -> Response:
        partner = PartnerProfile.objects.filter(id=partner_id).first()
        if partner is None:
            raise NotFound("No partner with that id.")
        return Response(OperationsPartnerActivitySerializer(partner_activity(partner)).data)
