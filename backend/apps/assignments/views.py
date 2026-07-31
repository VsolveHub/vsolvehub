from typing import cast
from uuid import UUID

from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.assignments.models import PartnerOffer
from apps.assignments.serializers import ManualOfferSerializer, OfferSerializer
from apps.assignments.services import (
    accept_offer,
    advance_search,
    commit_offer,
    create_manual_offer,
    decline_or_undo_offer,
    start_partner_search,
)
from apps.carts.models import CheckoutSession
from apps.identity.models import User
from apps.partners.permissions import IsOperationsUser, IsPartnerUser
from apps.partners.selectors import partner_profile_for_user


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

    @extend_schema(tags=["Partner"], responses={200: OfferSerializer(many=True)})
    def get(self, request: Request) -> Response:
        profile = partner_profile_for_user(cast(User, request.user))
        if profile is None:
            return Response([])
        offers = PartnerOffer.objects.filter(partner=profile).exclude(
            status__in=(
                PartnerOffer.Status.DECLINED,
                PartnerOffer.Status.UNDONE,
                PartnerOffer.Status.EXPIRED,
            )
        )
        return Response(OfferSerializer(offers, many=True).data)


class PartnerOfferCommandView(APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["Partner"], request=None, responses={200: OfferSerializer(allow_null=True)}
    )
    def post(self, request: Request, offer_id: str, action: str) -> Response:
        profile = partner_profile_for_user(cast(User, request.user))
        if profile is None:
            raise ValidationError("No Partner profile exists.")
        try:
            if action == "accept":
                result: PartnerOffer | None = accept_offer(offer_id=UUID(offer_id), partner=profile)
            elif action == "commit":
                offer = get_object_or_404(PartnerOffer, id=offer_id, partner=profile)
                result = commit_offer(offer_id=offer.id)
            elif action in {"decline", "undo"}:
                result = decline_or_undo_offer(
                    offer_id=UUID(offer_id), partner=profile, undo=action == "undo"
                )
            else:
                raise ValidationError("Unknown offer action.")
        except ValueError as exc:
            raise ValidationError(str(exc), code="offer_invalid") from exc
        return Response(OfferSerializer(result).data)


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


class AdvanceSearchView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["Checkout"], request=None, responses={200: OfferSerializer(allow_null=True)}
    )
    def post(self, request: Request, checkout_id: str) -> Response:
        checkout = get_object_or_404(CheckoutSession, id=checkout_id, customer=request.user)
        result = advance_search(checkout_id=checkout.id)
        return Response(OfferSerializer(result).data)
