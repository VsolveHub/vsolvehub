from typing import Any, cast
from uuid import UUID

from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.pagination import CursorPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.assignments.exceptions import OfferCommandInvalidApiError
from apps.assignments.group_services import (
    accept_unit_offer,
    commit_unit_offer,
    create_manual_unit_offer,
    decline_or_undo_unit_offer,
)
from apps.assignments.models import PartnerOffer
from apps.assignments.serializers import (
    ManualOfferSerializer,
    OfferPageSerializer,
    OfferSerializer,
)
from apps.assignments.services import (
    accept_offer,
    advance_search,
    commit_offer,
    create_manual_offer,
    decline_or_undo_offer,
    start_partner_search,
)
from apps.carts.models import CheckoutSession
from apps.foundation.services import ResponseBody, execute_idempotent
from apps.identity.models import User
from apps.partners.models import PartnerProfile
from apps.partners.permissions import IsOperationsUser, IsPartnerUser
from apps.partners.selectors import partner_profile_for_user
from common.errors.serializers import ApiErrorSerializer
from common.schema import IDEMPOTENCY_KEY_HEADER, OFFER_ACTION_PATH_PARAMETER, OFFER_ACTIONS

PARTNER_OFFER_COMMAND_OPERATION = "partner_offer.command"


class PartnerOfferCursorPagination(CursorPagination):
    page_size = 50
    ordering = ("-created_at", "-id")

    def get_paginated_response(self, data: Any) -> Response:
        return Response(
            {
                "next": self.get_next_link(),
                "previous": self.get_previous_link(),
                "results": data,
                "server_now": timezone.now(),
            }
        )


class StartSearchView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["Checkout"], request=None, responses={201: OfferSerializer(allow_null=True)}
    )
    def post(self, request: Request, checkout_id: str) -> Response:
        checkout = get_object_or_404(CheckoutSession, id=checkout_id, customer=request.user)
        try:
            offer = start_partner_search(checkout=checkout)
        except ValueError as exc:
            raise ValidationError(str(exc), code="search_invalid") from exc
        return Response(OfferSerializer(offer).data, status=status.HTTP_201_CREATED)


class PartnerOfferListView(APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["Partner"],
        operation_id="partner_offer_list",
        responses={200: OfferPageSerializer},
    )
    def get(self, request: Request) -> Response:
        profile = partner_profile_for_user(cast(User, request.user))
        if profile is None:
            return Response(
                {
                    "next": None,
                    "previous": None,
                    "results": [],
                    "server_now": timezone.now(),
                }
            )
        offers = (
            PartnerOffer.objects.filter(partner=profile)
            .exclude(
                status__in=(
                    PartnerOffer.Status.DECLINED,
                    PartnerOffer.Status.UNDONE,
                    PartnerOffer.Status.EXPIRED,
                    PartnerOffer.Status.REVOKED,
                )
            )
            .select_related("fulfilment_unit")
            .prefetch_related("fulfilment_unit__lines")
        )
        paginator = PartnerOfferCursorPagination()
        page = paginator.paginate_queryset(offers, request, view=self)
        return paginator.get_paginated_response(OfferSerializer(page, many=True).data)


def _offer_projection(offer_id: UUID) -> dict[str, Any]:
    """Read the commanded offer back as the answer to the command.

    Every command answers with the same offer the Partner acted on, so a replay and a
    first call are the same projection of the same row. A decline still advances
    dispatch to the next candidate, but that candidate's offer belongs to them.
    """
    offer = (
        PartnerOffer.objects.select_related("fulfilment_unit")
        .prefetch_related("fulfilment_unit__lines")
        .get(id=offer_id)
    )
    return cast(dict[str, Any], OfferSerializer(offer).data)


def _run_offer_command(*, offer: PartnerOffer, partner: PartnerProfile, action: str) -> None:
    try:
        if offer.fulfilment_unit_id is not None:
            if action == "accept":
                accept_unit_offer(offer_id=offer.id, partner=partner)
            elif action == "commit":
                commit_unit_offer(offer_id=offer.id, partner=partner)
            else:
                decline_or_undo_unit_offer(
                    offer_id=offer.id, partner=partner, undo=action == "undo"
                )
        elif action == "accept":
            accept_offer(offer_id=offer.id, partner=partner)
        elif action == "commit":
            commit_offer(offer_id=offer.id)
        else:
            decline_or_undo_offer(offer_id=offer.id, partner=partner, undo=action == "undo")
    except PermissionError as exc:
        raise PermissionDenied(str(exc)) from exc
    except ValueError as exc:
        raise OfferCommandInvalidApiError(reason=str(exc)) from exc


class PartnerOfferCommandView(APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["Partner"],
        operation_id="partner_offers_create",
        parameters=[OFFER_ACTION_PATH_PARAMETER, IDEMPOTENCY_KEY_HEADER],
        request=None,
        responses={
            200: OfferSerializer,
            400: ApiErrorSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, offer_id: UUID, action: str) -> Response:
        user = cast(User, request.user)
        profile = partner_profile_for_user(user)
        if profile is None:
            raise PermissionDenied("No Partner profile exists.")
        # Scoping the read to the caller's Partner is the authorization boundary: another
        # Partner's offer is never visible, let alone commandable.
        offer = get_object_or_404(PartnerOffer, id=offer_id, partner=profile)
        if action not in OFFER_ACTIONS:
            raise ValidationError({"action": "Unknown offer action."}, code="offer_action_invalid")
        key = request.headers.get("Idempotency-Key")
        if not key:
            raise ValidationError(
                {"Idempotency-Key": "This header is required."},
                code="idempotency_key_required",
            )

        def command() -> tuple[int, ResponseBody]:
            _run_offer_command(offer=offer, partner=profile, action=action)
            return status.HTTP_200_OK, _offer_projection(offer.id)

        result = execute_idempotent(
            actor=user,
            operation=PARTNER_OFFER_COMMAND_OPERATION,
            key=key,
            request_payload={
                "partner_id": str(profile.id),
                "offer_id": str(offer.id),
                "action": action,
            },
            command=command,
        )
        if not result.replayed:
            return Response(result.body, status=result.status_code)
        # A replay answers with the offer's current truth rather than the frozen body:
        # `expires_at`, `undo_deadline` and `server_now` drive live countdowns, and a
        # stale `server_now` would silently overstate how much of the undo window is left.
        response = Response(_offer_projection(offer.id), status=result.status_code)
        response["Idempotent-Replay"] = "true"
        return response


class ManualOfferView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["Operations"], request=ManualOfferSerializer, responses={201: OfferSerializer}
    )
    def post(self, request: Request, checkout_id: str) -> Response:
        serializer = ManualOfferSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            offer = create_manual_offer(
                checkout_id=UUID(checkout_id), partner_id=serializer.validated_data["partner_id"]
            )
        except ValueError as exc:
            raise ValidationError(str(exc), code="offer_invalid") from exc
        return Response(OfferSerializer(offer).data, status=status.HTTP_201_CREATED)


class ManualUnitOfferView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["Operations"],
        operation_id="operations_fulfilment_unit_offer_create",
        request=ManualOfferSerializer,
        responses={201: OfferSerializer},
    )
    def post(self, request: Request, unit_id: str) -> Response:
        serializer = ManualOfferSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            offer = create_manual_unit_offer(
                unit_id=UUID(unit_id),
                partner_id=serializer.validated_data["partner_id"],
            )
        except ValueError as exc:
            raise ValidationError(str(exc), code="offer_invalid") from exc
        return Response(OfferSerializer(offer).data, status=status.HTTP_201_CREATED)


class AdvanceSearchView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["Checkout"], request=None, responses={200: OfferSerializer(allow_null=True)}
    )
    def post(self, request: Request, checkout_id: str) -> Response:
        checkout = get_object_or_404(CheckoutSession, id=checkout_id, customer=request.user)
        result = advance_search(checkout_id=checkout.id)
        return Response(OfferSerializer(result).data)
