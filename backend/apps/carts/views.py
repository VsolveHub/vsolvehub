from typing import cast

from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.carts.models import Cart, CartItem, Quote
from apps.carts.serializers import (
    AssistedCheckoutCreateSerializer,
    CartItemInputSerializer,
    CartItemSerializer,
    CheckoutCreateSerializer,
    CheckoutSerializer,
    QuoteCreateSerializer,
    QuoteSerializer,
)
from apps.carts.services import (
    _cart_for,
    create_checkout,
    create_quote,
    merge_session_cart,
    replace_cart_item,
)
from apps.foundation.services import CommandResult, execute_idempotent
from apps.identity.models import User
from apps.locations.models import Address
from apps.partners.permissions import IsOperationsUser
from common.schema import IDEMPOTENCY_KEY_HEADER


def _session_key(request: Request) -> str:
    request.session.save()
    if not request.session.session_key:
        raise RuntimeError("Unable to establish cart session.")
    return request.session.session_key


class CartView(APIView):
    permission_classes = (AllowAny,)

    @staticmethod
    def _cart(*, request: Request, user: User | None) -> Cart:
        session_key = _session_key(request)
        if user is not None:
            return merge_session_cart(user=user, session_key=session_key)
        return _cart_for(user=None, session_key=session_key)

    @extend_schema(tags=["Cart"], responses={200: CartItemSerializer(allow_null=True)})
    def get(self, request: Request) -> Response:
        user = (
            request.user
            if isinstance(request.user, User) and request.user.is_authenticated
            else None
        )
        try:
            cart = self._cart(request=request, user=user)
        except ValueError as exc:
            raise ValidationError(str(exc), code="cart_merge_conflict") from exc
        item = CartItem.objects.filter(cart=cart).first()
        return Response(CartItemSerializer(item).data)

    @extend_schema(
        tags=["Cart"], request=CartItemInputSerializer, responses={200: CartItemSerializer}
    )
    def put(self, request: Request) -> Response:
        serializer = CartItemInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = (
            request.user
            if isinstance(request.user, User) and request.user.is_authenticated
            else None
        )
        try:
            cart = self._cart(request=request, user=user)
            item = replace_cart_item(
                user=user, session_key=_session_key(request), **serializer.validated_data
            )
            if item.cart_id != cart.id:
                raise RuntimeError("Cart ownership mismatch.")
        except ValueError as exc:
            raise ValidationError(str(exc), code="cart_invalid") from exc
        return Response(CartItemSerializer(item).data)


class QuoteView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["Checkout"], request=QuoteCreateSerializer, responses={201: QuoteSerializer}
    )
    def post(self, request: Request) -> Response:
        serializer = QuoteCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = cast(User, request.user)
        try:
            cart = merge_session_cart(user=user, session_key=_session_key(request))
        except ValueError as exc:
            raise ValidationError(str(exc), code="cart_merge_conflict") from exc
        address = get_object_or_404(
            Address,
            id=serializer.validated_data["address_id"],
            customer=user,
            archived_at__isnull=True,
        )
        try:
            quote = create_quote(
                customer=user,
                cart=cart,
                address=address,
                requested_start=serializer.validated_data["requested_start"],
            )
        except PermissionError as exc:
            raise PermissionDenied(str(exc)) from exc
        except ValueError as exc:
            raise ValidationError(str(exc), code="quote_invalid") from exc
        return Response(QuoteSerializer(quote).data, status=status.HTTP_201_CREATED)


class CheckoutView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["Checkout"],
        request=CheckoutCreateSerializer,
        parameters=[IDEMPOTENCY_KEY_HEADER],
        responses={201: CheckoutSerializer},
    )
    def post(self, request: Request) -> Response:
        serializer = CheckoutCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = cast(User, request.user)
        quote = get_object_or_404(
            Quote, id=serializer.validated_data["quote_id"], cart_item__cart__customer=user
        )
        result = _create_idempotent_checkout(request=request, customer=user, quote=quote)
        response = Response(result.body, status=result.status_code)
        if result.replayed:
            response["Idempotent-Replay"] = "true"
        return response


def _create_idempotent_checkout(
    *,
    request: Request,
    customer: User,
    quote: Quote,
    assisted_by: User | None = None,
    consent_purpose: str = "",
    consent_version: str = "",
) -> CommandResult:
    key = request.headers.get("Idempotency-Key")
    if not key:
        raise ValidationError(
            {"Idempotency-Key": "This header is required."}, code="idempotency_key_required"
        )

    def command() -> tuple[int, dict[str, object]]:
        try:
            checkout = create_checkout(
                customer=customer,
                quote=quote,
                assisted_by=assisted_by,
                consent_purpose=consent_purpose,
                consent_version=consent_version,
            )
        except PermissionError as exc:
            raise PermissionDenied(str(exc)) from exc
        except ValueError as exc:
            raise ValidationError(str(exc), code="checkout_invalid") from exc
        return status.HTTP_201_CREATED, CheckoutSerializer(checkout).data

    return execute_idempotent(
        actor=assisted_by or customer,
        operation="checkout.create.assisted" if assisted_by else "checkout.create",
        key=key,
        request_payload={
            "customer_id": str(customer.id),
            "quote_id": str(quote.id),
            "assisted_by": str(assisted_by.id) if assisted_by else None,
        },
        command=command,
    )


class AssistedCheckoutView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["Operations"],
        request=AssistedCheckoutCreateSerializer,
        parameters=[IDEMPOTENCY_KEY_HEADER],
        responses={201: CheckoutSerializer},
    )
    def post(self, request: Request) -> Response:
        serializer = AssistedCheckoutCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        actor = cast(User, request.user)
        customer = get_object_or_404(
            User, id=serializer.validated_data["customer_id"], is_active=True
        )
        quote = get_object_or_404(
            Quote,
            id=serializer.validated_data["quote_id"],
            cart_item__cart__customer=customer,
        )
        result = _create_idempotent_checkout(
            request=request,
            customer=customer,
            quote=quote,
            assisted_by=actor,
            consent_purpose=serializer.validated_data["consent_purpose"],
            consent_version=serializer.validated_data["consent_version"],
        )
        response = Response(result.body, status=result.status_code)
        if result.replayed:
            response["Idempotent-Replay"] = "true"
        return response
