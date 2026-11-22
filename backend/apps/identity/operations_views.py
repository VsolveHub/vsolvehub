"""Operations: account deletion and data-copy requests.

The queue Operations works from (`GET /operations/privacy-requests/`), the decisions it can make
on one request, and filing a deletion on somebody's behalf when they reach support instead of
the app. Every decision lives in `apps.identity.account_deletion`; these views only translate.
"""

import uuid
from typing import Any, cast

from django.db.models import Case, IntegerField, Value, When
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers, status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.identity.account_deletion import (
    HOLD_MONEY_OWED,
    HOLD_OPEN_WORK,
    HOLD_WALLET_BALANCE,
    AccountDeletionHeldError,
    AccountDeletionRefusedError,
    AccountDeletionStateError,
    cancel_deletion,
    complete_access_request,
    deletion_holds,
    erase_account,
    hold_deletion,
    reject_privacy_request,
    release_deletion,
    request_account_deletion,
)
from apps.identity.exceptions import AccountDeletionHeldApiError, AccountDeletionRefusedApiError
from apps.identity.models import PrivacyRequest, User
from apps.partners.permissions import HasRecentOperationsStepUp, IsOperationsUser
from common.errors.serializers import ApiErrorSerializer

#: The queue is worked, not browsed: the newest few hundred are always enough.
_LIST_LIMIT = 200


class PrivacyRequestHoldSerializer(serializers.Serializer[object]):
    kind = serializers.ChoiceField(
        choices=(HOLD_OPEN_WORK, HOLD_MONEY_OWED, HOLD_WALLET_BALANCE),
        help_text="What must be settled before the account can be erased.",
    )
    detail = serializers.CharField(help_text="Plain words an operator can act on or relay.")


class PrivacyRequestPersonSerializer(serializers.Serializer[object]):
    user_id = serializers.UUIDField()
    name = serializers.CharField(help_text="Empty once erased.")
    phone_number = serializers.CharField(help_text="An `erased-…` placeholder once erased.")
    roles = serializers.ListField(child=serializers.CharField())
    partner_id = serializers.UUIDField(allow_null=True)


class OperationsPrivacyRequestSerializer(serializers.Serializer[object]):
    id = serializers.UUIDField()
    kind = serializers.ChoiceField(choices=PrivacyRequest.Kind.choices)
    status = serializers.ChoiceField(choices=PrivacyRequest.Status.choices)
    requested_at = serializers.DateTimeField()
    scheduled_for = serializers.DateTimeField(allow_null=True)
    completed_at = serializers.DateTimeField(allow_null=True)
    cancelled_at = serializers.DateTimeField(allow_null=True)
    notes = serializers.CharField(allow_blank=True)
    handled_by_name = serializers.CharField(
        allow_null=True, help_text="The operator who last decided something about it."
    )
    held_by_operations = serializers.BooleanField(
        help_text=(
            "IN_REVIEW only. True when an operator placed the hold, so only a release restarts "
            "it; false when the scheduled sweep did, which re-checks it every run."
        )
    )
    person = PrivacyRequestPersonSerializer()
    holds = PrivacyRequestHoldSerializer(
        many=True,
        help_text="Open ERASURE requests only, worked out now. Empty means it can be erased.",
    )


class PrivacyRequestReasonSerializer(serializers.Serializer[object]):
    reason = serializers.CharField(max_length=480, help_text="Kept in the request's history.")


class PrivacyRequestNoteSerializer(serializers.Serializer[object]):
    note = serializers.CharField(
        max_length=480, help_text="How the copy was sent, kept in the request's history."
    )


def _person(user: User) -> dict[str, Any]:
    partner = getattr(user, "partner_profile", None)
    customer = getattr(user, "customer_profile", None)
    name = (
        user.full_name
        or (partner.display_name if partner is not None else "")
        or (customer.display_name if customer is not None else "")
    )
    roles = sorted(
        {grant.role.code for grant in user.userrole_set.all() if grant.revoked_at is None}
    )
    return {
        "user_id": user.id,
        "name": name,
        "phone_number": user.phone_number,
        "roles": roles,
        "partner_id": partner.id if partner is not None else None,
    }


def _row(privacy_request: PrivacyRequest) -> dict[str, Any]:
    is_open_erasure = (
        privacy_request.kind == PrivacyRequest.Kind.ERASURE
        and privacy_request.status in PrivacyRequest.OPEN_STATUSES
    )
    holds = deletion_holds(privacy_request.user) if is_open_erasure else []
    handled_by = privacy_request.handled_by
    return {
        "id": privacy_request.id,
        "kind": privacy_request.kind,
        "status": privacy_request.status,
        "requested_at": privacy_request.requested_at,
        "scheduled_for": privacy_request.scheduled_for,
        "completed_at": privacy_request.completed_at,
        "cancelled_at": privacy_request.cancelled_at,
        "notes": privacy_request.notes,
        "handled_by_name": (handled_by.full_name or handled_by.phone_number)
        if handled_by is not None
        else None,
        "held_by_operations": privacy_request.status == PrivacyRequest.Status.IN_REVIEW
        and handled_by is not None,
        "person": _person(privacy_request.user),
        "holds": [{"kind": hold.kind, "detail": hold.detail} for hold in holds],
    }


def _response(privacy_request: PrivacyRequest) -> Response:
    fresh = _queryset().get(id=privacy_request.id)
    return Response(OperationsPrivacyRequestSerializer(_row(fresh)).data)


def _queryset() -> Any:
    return PrivacyRequest.objects.select_related(
        "user", "user__partner_profile", "user__customer_profile", "handled_by"
    ).prefetch_related("user__userrole_set__role")


def _state_error(exc: AccountDeletionStateError) -> ValidationError:
    return ValidationError({"detail": [str(exc)]}, code="privacy_request_state")


class OperationsPrivacyRequestCollectionView(APIView):
    """Deletion and data-copy requests. `?state=open` (default) is the working queue."""

    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["Operations"],
        operation_id="operations_privacy_requests_list",
        parameters=[
            OpenApiParameter(
                "state",
                str,
                enum=["open", "closed", "all"],
                description="`open`: RECEIVED or IN_REVIEW, soonest deletion first.",
            ),
            OpenApiParameter("kind", str, enum=["ERASURE", "ACCESS"]),
        ],
        responses={200: OperationsPrivacyRequestSerializer(many=True), 403: ApiErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        state = request.query_params.get("state", "open")
        kind = request.query_params.get("kind", "")
        queryset = _queryset()
        if kind in PrivacyRequest.Kind.values:
            queryset = queryset.filter(kind=kind)
        if state == "open":
            queryset = queryset.filter(status__in=PrivacyRequest.OPEN_STATUSES).order_by(
                # Held first (somebody has to act), then by when deletion is due.
                Case(
                    When(status=PrivacyRequest.Status.IN_REVIEW, then=Value(0)),
                    default=Value(1),
                    output_field=IntegerField(),
                ),
                "scheduled_for",
                "requested_at",
            )
        elif state == "closed":
            queryset = queryset.exclude(status__in=PrivacyRequest.OPEN_STATUSES).order_by(
                "-requested_at"
            )
        else:
            queryset = queryset.order_by("-requested_at")
        rows = [_row(item) for item in queryset[:_LIST_LIMIT]]
        return Response(OperationsPrivacyRequestSerializer(rows, many=True).data)


class _PrivacyRequestCommandView(APIView):
    permission_classes: tuple[type[BasePermission], ...] = (IsAuthenticated, IsOperationsUser)

    @staticmethod
    def _exists(privacy_request_id: uuid.UUID) -> None:
        if not PrivacyRequest.objects.filter(id=privacy_request_id).exists():
            raise NotFound("No such request.")


_COMMAND_RESPONSES = {
    200: OperationsPrivacyRequestSerializer,
    400: ApiErrorSerializer,
    403: ApiErrorSerializer,
    404: ApiErrorSerializer,
}


class OperationsPrivacyRequestHoldView(_PrivacyRequestCommandView):
    """Stop the clock on a deletion (a dispute, a legal request). Waits for a release."""

    @extend_schema(
        tags=["Operations"],
        operation_id="operations_privacy_request_hold",
        request=PrivacyRequestReasonSerializer,
        responses=_COMMAND_RESPONSES,
    )
    def post(self, request: Request, privacy_request_id: uuid.UUID) -> Response:
        self._exists(privacy_request_id)
        body = PrivacyRequestReasonSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            item = hold_deletion(
                privacy_request_id=privacy_request_id,
                actor=cast(User, request.user),
                reason=body.validated_data["reason"],
            )
        except AccountDeletionStateError as exc:
            raise _state_error(exc) from exc
        return _response(item)


class OperationsPrivacyRequestReleaseView(_PrivacyRequestCommandView):
    """Put a held deletion back on its schedule. Past its date, the next hourly run erases it."""

    @extend_schema(
        tags=["Operations"],
        operation_id="operations_privacy_request_release",
        request=None,
        responses=_COMMAND_RESPONSES,
    )
    def post(self, request: Request, privacy_request_id: uuid.UUID) -> Response:
        self._exists(privacy_request_id)
        try:
            item = release_deletion(
                privacy_request_id=privacy_request_id, actor=cast(User, request.user)
            )
        except AccountDeletionStateError as exc:
            raise _state_error(exc) from exc
        return _response(item)


class OperationsPrivacyRequestCancelView(_PrivacyRequestCommandView):
    """The person asked support to keep their account."""

    @extend_schema(
        tags=["Operations"],
        operation_id="operations_privacy_request_cancel",
        request=PrivacyRequestReasonSerializer,
        responses=_COMMAND_RESPONSES,
    )
    def post(self, request: Request, privacy_request_id: uuid.UUID) -> Response:
        self._exists(privacy_request_id)
        body = PrivacyRequestReasonSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            item = cancel_deletion(
                privacy_request_id=privacy_request_id,
                actor=cast(User, request.user),
                reason=body.validated_data["reason"],
            )
        except AccountDeletionStateError as exc:
            raise _state_error(exc) from exc
        return _response(item)


class OperationsPrivacyRequestRejectView(_PrivacyRequestCommandView):
    """Refuse a request, with the reason the person will be told."""

    @extend_schema(
        tags=["Operations"],
        operation_id="operations_privacy_request_reject",
        request=PrivacyRequestReasonSerializer,
        responses=_COMMAND_RESPONSES,
    )
    def post(self, request: Request, privacy_request_id: uuid.UUID) -> Response:
        self._exists(privacy_request_id)
        body = PrivacyRequestReasonSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            item = reject_privacy_request(
                privacy_request_id=privacy_request_id,
                actor=cast(User, request.user),
                reason=body.validated_data["reason"],
            )
        except AccountDeletionStateError as exc:
            raise _state_error(exc) from exc
        return _response(item)


class OperationsPrivacyRequestCompleteView(_PrivacyRequestCommandView):
    """Record that a data copy was sent. ACCESS requests only."""

    @extend_schema(
        tags=["Operations"],
        operation_id="operations_privacy_request_complete",
        request=PrivacyRequestNoteSerializer,
        responses=_COMMAND_RESPONSES,
    )
    def post(self, request: Request, privacy_request_id: uuid.UUID) -> Response:
        self._exists(privacy_request_id)
        body = PrivacyRequestNoteSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            item = complete_access_request(
                privacy_request_id=privacy_request_id,
                actor=cast(User, request.user),
                note=body.validated_data["note"],
            )
        except AccountDeletionStateError as exc:
            raise _state_error(exc) from exc
        return _response(item)


class OperationsPrivacyRequestEraseView(_PrivacyRequestCommandView):
    """Erase now, without waiting for the date. Irreversible, so it needs a fresh step-up."""

    permission_classes = (IsAuthenticated, IsOperationsUser, HasRecentOperationsStepUp)

    @extend_schema(
        tags=["Operations"],
        operation_id="operations_privacy_request_erase",
        request=None,
        responses={
            **_COMMAND_RESPONSES,
            409: ApiErrorSerializer,
        },
        description=(
            "Refused with 409 `account_deletion_held` while something is unsettled; the "
            "message lists what. 403 without a recent Operations step-up."
        ),
    )
    def post(self, request: Request, privacy_request_id: uuid.UUID) -> Response:
        self._exists(privacy_request_id)
        try:
            erase_account(privacy_request_id=privacy_request_id, actor=cast(User, request.user))
        except AccountDeletionHeldError as exc:
            raise AccountDeletionHeldApiError(detail=str(exc)) from exc
        except AccountDeletionStateError as exc:
            raise _state_error(exc) from exc
        return _response(PrivacyRequest.objects.get(id=privacy_request_id))


class OperationsUserDeletionRequestView(APIView):
    """File a deletion for somebody who asked support (they could not use the app or website).

    Support checks it is them first; the reason records how. The person is signed out
    everywhere and gets the same grace period as a request they filed themselves.
    """

    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["Operations"],
        operation_id="operations_user_deletion_request",
        request=PrivacyRequestReasonSerializer,
        responses={
            201: OperationsPrivacyRequestSerializer,
            400: ApiErrorSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, user_id: uuid.UUID) -> Response:
        user = User.objects.filter(id=user_id).first()
        if user is None:
            raise NotFound("No such account.")
        body = PrivacyRequestReasonSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            item = request_account_deletion(
                user=user,
                current_session_key=None,
                actor=cast(User, request.user),
                reason=body.validated_data["reason"],
            )
        except AccountDeletionRefusedError as exc:
            raise AccountDeletionRefusedApiError(detail=exc.message, code=exc.code) from exc
        fresh = _queryset().get(id=item.id)
        return Response(
            OperationsPrivacyRequestSerializer(_row(fresh)).data, status=status.HTTP_201_CREATED
        )
