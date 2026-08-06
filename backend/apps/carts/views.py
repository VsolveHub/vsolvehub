from typing import cast
from uuid import UUID

from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.pagination import CursorPagination
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.assignments.group_services import cancel_booking_group
from apps.carts.compatibility import (
    activate_compatibility_rule,
    compatibility_rules,
    create_compatibility_rule_draft,
    reject_compatibility_rule,
    retire_compatibility_rule,
)
from apps.carts.exceptions import CartVersionConflictApiError
from apps.carts.models import (
    BookingGroup,
    Cart,
    CartItem,
    FulfilmentPlan,
    FulfilmentPlanSet,
    Quote,
    ServiceCompatibilityRule,
)
from apps.carts.planning import (
    cart_suggestion_service_ids,
    create_fulfilment_plan_set,
    create_plan_quote,
    resolve_cart_service_area,
    scheduling_groups,
)
from apps.carts.serializers import (
    AssistedCheckoutCreateSerializer,
    BookingGroupCancelSerializer,
    BookingGroupPageSerializer,
    BookingGroupSerializer,
    BookingWindowsRequestSerializer,
    BookingWindowsSerializer,
    CartItemCreateSerializer,
    CartItemInputSerializer,
    CartItemRemoveSerializer,
    CartItemSerializer,
    CartItemUpdateSerializer,
    CartMergeSerializer,
    CartSerializer,
    CartSuggestionsSerializer,
    CheckoutCreateSerializer,
    CheckoutSerializer,
    CompatibilityRuleDraftSerializer,
    CompatibilityRuleListQuerySerializer,
    CompatibilityRulePageSerializer,
    CompatibilityRuleRetireSerializer,
    CompatibilityRuleReviewSerializer,
    CompatibilityRuleSerializer,
    FulfilmentPlanSetCreateSerializer,
    FulfilmentPlanSetSerializer,
    GroupQuoteSerializer,
    PlanQuoteCreateSerializer,
    QuoteCreateSerializer,
    QuoteSerializer,
    SchedulingGroupsRequestSerializer,
    SchedulingGroupsSerializer,
)
from apps.carts.services import (
    _cart_for,
    add_cart_item,
    create_booking_windows,
    create_checkout,
    create_quote,
    merge_session_cart,
    remove_cart_item,
    replace_cart_item,
    resolve_session_cart_merge,
    update_cart_item,
)
from apps.catalog.selectors import public_services_by_id
from apps.foundation.services import CommandResult, execute_idempotent
from apps.identity.models import User
from apps.locations.models import Address
from apps.partners.permissions import IsOperationsUser
from common.errors.serializers import ApiErrorSerializer
from common.observability.context import get_request_id
from common.pagination import (
    BoundedCursorQuerySerializer,
    StrictCursorPagination,
    reject_invalid_cursor_query,
)
from common.schema import IDEMPOTENCY_KEY_HEADER


def _session_key(request: Request) -> str:
    request.session.save()
    if not request.session.session_key:
        raise RuntimeError("Unable to establish cart session.")
    return request.session.session_key


class CompatibilityRuleCursorPagination(CursorPagination):
    page_size = 50
    ordering = ("-created_at", "-id")


class BookingGroupCursorPagination(StrictCursorPagination):
    page_size = 25
    ordering = ("-created_at", "-id")


class BookingGroupCollectionView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["Booking Groups"],
        operation_id="booking_group_list",
        parameters=[BoundedCursorQuerySerializer],
        responses={
            200: BookingGroupPageSerializer,
            400: ApiErrorSerializer,
            403: ApiErrorSerializer,
        },
    )
    def get(self, request: Request) -> Response:
        reject_invalid_cursor_query(request)
        queryset = (
            BookingGroup.objects.filter(customer=cast(User, request.user))
            # `checkout` and `order` are reverse one-to-ones read by the payment
            # entry fields (proposal 0011); without them the list costs two extra
            # queries per row.
            .select_related("quote", "checkout", "order")
            .prefetch_related("units__lines", "units__offers", "units__reservations")
        )
        paginator = BookingGroupCursorPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(BookingGroupSerializer(page, many=True).data)


class BookingGroupDetailView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["Booking Groups"],
        operation_id="booking_group_retrieve",
        responses={
            200: BookingGroupSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
        },
    )
    def get(self, request: Request, group_id: UUID) -> Response:
        group = get_object_or_404(
            BookingGroup.objects.select_related("checkout", "order").prefetch_related(
                "units__lines", "units__offers", "units__reservations"
            ),
            id=group_id,
            customer=request.user,
        )
        return Response(BookingGroupSerializer(group).data)


class BookingGroupCancelView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["Booking Groups"],
        operation_id="booking_group_cancel",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=BookingGroupCancelSerializer,
        responses={
            200: BookingGroupSerializer,
            400: ApiErrorSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, group_id: UUID) -> Response:
        get_object_or_404(BookingGroup, id=group_id, customer=request.user)
        serializer = BookingGroupCancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        key = request.headers.get("Idempotency-Key")
        if not key:
            raise ValidationError(
                {"Idempotency-Key": "This header is required."},
                code="idempotency_key_required",
            )

        def command() -> tuple[int, dict[str, object]]:
            group = cancel_booking_group(
                customer_id=cast(User, request.user).id,
                group_id=group_id,
                expected_version=serializer.validated_data["expected_version"],
            )
            return status.HTTP_200_OK, cast(dict[str, object], BookingGroupSerializer(group).data)

        result = execute_idempotent(
            actor=cast(User, request.user),
            operation="booking_group.cancel",
            key=key,
            request_payload={"group_id": group_id, **serializer.validated_data},
            command=command,
        )
        return Response(result.body, status=result.status_code)


class OperationsCompatibilityRuleCollectionView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["Operations - Compatibility"],
        operation_id="operations_compatibility_rule_list",
        parameters=[CompatibilityRuleListQuerySerializer],
        responses={200: CompatibilityRulePageSerializer, 403: ApiErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        serializer = CompatibilityRuleListQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        queryset = compatibility_rules()
        lifecycle_status = serializer.validated_data.get("lifecycle_status")
        if lifecycle_status is not None:
            queryset = queryset.filter(lifecycle_status=lifecycle_status)
        variant_id = serializer.validated_data.get("variant_id")
        if variant_id is not None:
            queryset = queryset.filter(
                Q(left_variant_id=variant_id) | Q(right_variant_id=variant_id)
            )
        paginator = CompatibilityRuleCursorPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(CompatibilityRuleSerializer(page, many=True).data)

    @extend_schema(
        tags=["Operations - Compatibility"],
        operation_id="operations_compatibility_rule_create_draft",
        request=CompatibilityRuleDraftSerializer,
        responses={
            201: CompatibilityRuleSerializer,
            400: ApiErrorSerializer,
            403: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def post(self, request: Request) -> Response:
        serializer = CompatibilityRuleDraftSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        rule = create_compatibility_rule_draft(
            actor=cast(User, request.user),
            request_id=get_request_id() or "",
            **serializer.validated_data,
        )
        return Response(
            CompatibilityRuleSerializer(rule).data,
            status=status.HTTP_201_CREATED,
        )


class OperationsCompatibilityRuleDetailView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["Operations - Compatibility"],
        operation_id="operations_compatibility_rule_retrieve",
        responses={
            200: CompatibilityRuleSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
        },
    )
    def get(self, _request: Request, rule_id: UUID) -> Response:
        rule = get_object_or_404(compatibility_rules(), id=rule_id)
        return Response(CompatibilityRuleSerializer(rule).data)


class OperationsCompatibilityRuleActivateView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["Operations - Compatibility"],
        operation_id="operations_compatibility_rule_activate",
        request=CompatibilityRuleReviewSerializer,
        responses={
            200: CompatibilityRuleSerializer,
            400: ApiErrorSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, rule_id: UUID) -> Response:
        get_object_or_404(ServiceCompatibilityRule, id=rule_id)
        serializer = CompatibilityRuleReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        rule = activate_compatibility_rule(
            actor=cast(User, request.user),
            rule_id=rule_id,
            request_id=get_request_id() or "",
            **serializer.validated_data,
        )
        return Response(CompatibilityRuleSerializer(rule).data)


class OperationsCompatibilityRuleRejectView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["Operations - Compatibility"],
        operation_id="operations_compatibility_rule_reject",
        request=CompatibilityRuleReviewSerializer,
        responses={
            200: CompatibilityRuleSerializer,
            400: ApiErrorSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, rule_id: UUID) -> Response:
        get_object_or_404(ServiceCompatibilityRule, id=rule_id)
        serializer = CompatibilityRuleReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        rule = reject_compatibility_rule(
            actor=cast(User, request.user),
            rule_id=rule_id,
            request_id=get_request_id() or "",
            **serializer.validated_data,
        )
        return Response(CompatibilityRuleSerializer(rule).data)


class OperationsCompatibilityRuleRetireView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["Operations - Compatibility"],
        operation_id="operations_compatibility_rule_retire",
        request=CompatibilityRuleRetireSerializer,
        responses={
            200: CompatibilityRuleSerializer,
            400: ApiErrorSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, rule_id: UUID) -> Response:
        get_object_or_404(ServiceCompatibilityRule, id=rule_id)
        serializer = CompatibilityRuleRetireSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        rule = retire_compatibility_rule(
            actor=cast(User, request.user),
            rule_id=rule_id,
            request_id=get_request_id() or "",
            **serializer.validated_data,
        )
        return Response(CompatibilityRuleSerializer(rule).data)


class CartView(APIView):
    permission_classes = (AllowAny,)

    @staticmethod
    def _cart(*, request: Request, user: User | None) -> Cart:
        session_key = _session_key(request)
        if user is not None:
            return merge_session_cart(user=user, session_key=session_key)
        return _cart_for(user=None, session_key=session_key)

    @extend_schema(tags=["Cart"], responses={200: CartSerializer})
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
        return Response(CartSerializer(cart).data)

    @extend_schema(
        tags=["Cart"],
        request=CartItemInputSerializer,
        responses={200: CartItemSerializer, 409: ApiErrorSerializer},
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
            self._cart(request=request, user=user)
            item = replace_cart_item(
                user=user, session_key=_session_key(request), **serializer.validated_data
            )
        except ValueError as exc:
            raise ValidationError(str(exc), code="cart_invalid") from exc
        return Response(CartItemSerializer(item).data)


class CartItemCollectionView(APIView):
    permission_classes = (AllowAny,)

    @extend_schema(
        tags=["Cart"],
        request=CartItemCreateSerializer,
        responses={201: CartSerializer, 409: ApiErrorSerializer},
    )
    def post(self, request: Request) -> Response:
        serializer = CartItemCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = (
            request.user
            if isinstance(request.user, User) and request.user.is_authenticated
            else None
        )
        try:
            item = add_cart_item(
                user=user,
                session_key=_session_key(request),
                **serializer.validated_data,
            )
        except ValueError as exc:
            raise ValidationError(str(exc), code="cart_invalid") from exc
        return Response(CartSerializer(item.cart).data, status=status.HTTP_201_CREATED)


class CartMergeView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["Cart"],
        request=CartMergeSerializer,
        responses={200: CartSerializer, 409: ApiErrorSerializer},
    )
    def post(self, request: Request) -> Response:
        serializer = CartMergeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        decision_rows = cast(
            list[dict[str, object]],
            serializer.validated_data["decisions"],
        )
        decisions = {
            cast(UUID, row["session_item_id"]): cast(str, row["action"]) for row in decision_rows
        }
        cart = resolve_session_cart_merge(
            user=cast(User, request.user),
            session_key=_session_key(request),
            expected_customer_cart_version=serializer.validated_data[
                "expected_customer_cart_version"
            ],
            expected_session_cart_version=serializer.validated_data[
                "expected_session_cart_version"
            ],
            decisions=decisions,
        )
        return Response(CartSerializer(cart).data)


def _caller_cart(request: Request) -> Cart:
    """Resolve the caller's own cart, authenticated or anonymous.

    Every cart command starts here, so an item id is only ever addressed against
    the cart the caller already owns.  Another Customer's item id is therefore not
    a row this request can reach, rather than a row it is refused.
    """
    user = (
        request.user if isinstance(request.user, User) and request.user.is_authenticated else None
    )
    try:
        if user is not None:
            return merge_session_cart(user=user, session_key=_session_key(request))
        return _cart_for(user=None, session_key=_session_key(request))
    except ValueError as exc:
        raise ValidationError(str(exc), code="cart_merge_conflict") from exc


def _remove_cart_item_response(*, request: Request, item_id: UUID) -> Response:
    """The single removal path behind both the POST command and the legacy DELETE."""
    serializer = CartItemRemoveSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    cart = remove_cart_item(
        cart=_caller_cart(request),
        item_id=item_id,
        **serializer.validated_data,
    )
    return Response(CartSerializer(cart).data)


CART_ITEM_REMOVE_RESPONSES = {
    200: CartSerializer,
    400: ApiErrorSerializer,
    409: ApiErrorSerializer,
}


class CartItemRemoveView(APIView):
    """`POST /cart/items/{item_id}/remove/` — the publishable removal command.

    drf-spectacular does not emit a `requestBody` for DELETE, so the optimistic
    version pair Django requires was unreachable from a generated client.  This
    sibling publishes the same body, calls the same domain service and returns the
    same complete Cart.  No `Idempotency-Key` is required: the version pair is the
    replay protection, because a repeat of an accepted removal can no longer match
    a live row.
    """

    permission_classes = (AllowAny,)

    @extend_schema(
        tags=["Cart"],
        operation_id="cart_items_remove",
        request=CartItemRemoveSerializer,
        responses=CART_ITEM_REMOVE_RESPONSES,
    )
    def post(self, request: Request, item_id: UUID) -> Response:
        return _remove_cart_item_response(request=request, item_id=item_id)


class CartItemDetailView(APIView):
    permission_classes = (AllowAny,)

    @staticmethod
    def _cart(request: Request) -> Cart:
        return _caller_cart(request)

    @extend_schema(
        tags=["Cart"],
        request=CartItemUpdateSerializer,
        responses={200: CartSerializer, 409: ApiErrorSerializer},
    )
    def patch(self, request: Request, item_id: UUID) -> Response:
        serializer = CartItemUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        cart = self._cart(request)
        try:
            item = update_cart_item(
                cart=cart,
                item_id=item_id,
                **serializer.validated_data,
            )
        except CartItem.DoesNotExist as exc:
            raise ValidationError("Cart item not found.", code="cart_item_not_found") from exc
        except ValueError as exc:
            raise ValidationError(str(exc), code="cart_invalid") from exc
        return Response(CartSerializer(item.cart).data)

    @extend_schema(
        tags=["Cart"],
        request=CartItemRemoveSerializer,
        responses=CART_ITEM_REMOVE_RESPONSES,
    )
    def delete(self, request: Request, item_id: UUID) -> Response:
        """Retained for callers already sending a DELETE body.

        The request shape is still dropped from the published document by the
        schema generator, so generated clients must use the POST sibling.  This
        method exists only so existing hand-written callers keep working, and it
        runs the same `remove_cart_item` command with no removal logic of its own.
        """
        return _remove_cart_item_response(request=request, item_id=item_id)


class BookingWindowsView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["Checkout"],
        operation_id="booking_windows_create",
        request=BookingWindowsRequestSerializer,
        responses={
            200: BookingWindowsSerializer,
            400: ApiErrorSerializer,
            404: ApiErrorSerializer,
        },
    )
    def post(self, request: Request) -> Response:
        serializer = BookingWindowsRequestSerializer(data=request.data)
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
            windows = create_booking_windows(
                customer=user,
                cart=cart,
                address=address,
            )
        except PermissionError as exc:
            raise PermissionDenied(str(exc)) from exc
        except ValueError as exc:
            raise ValidationError(str(exc), code="booking_windows_invalid") from exc
        return Response(BookingWindowsSerializer(windows).data)


class CartSuggestionsView(APIView):
    """Services one Partner could add to a visit this cart already has.

    `POST` rather than `GET` because the answer is derived from the caller's own
    cart, which is resolved from the session rather than the URL. A `GET` would
    imply a cacheable address for something that differs per caller.

    Open to anonymous callers for the same reason the cart itself is: a suggestion
    is a catalog read, and asking someone to log in before we will tell them what
    else a professional could do is a worse product for no privacy gain.
    """

    permission_classes = (AllowAny,)

    @extend_schema(
        tags=["Cart"],
        operation_id="cart_suggestions_create",
        request=None,
        responses={200: CartSuggestionsSerializer},
    )
    def post(self, request: Request) -> Response:
        user = (
            request.user
            if isinstance(request.user, User) and request.user.is_authenticated
            else None
        )
        session_key = _session_key(request)
        try:
            cart = (
                merge_session_cart(user=user, session_key=session_key)
                if user is not None
                else _cart_for(user=None, session_key=session_key)
            )
        except ValueError as exc:
            raise ValidationError(str(exc), code="cart_merge_conflict") from exc
        service_ids = cart_suggestion_service_ids(cart=cart)
        return Response(
            CartSuggestionsSerializer(
                {
                    "cart_version": cart.version,
                    "suggestions": public_services_by_id(service_ids),
                }
            ).data
        )


class CartSchedulingGroupsView(APIView):
    """How the current cart splits into separately-schedulable visits.

    A read, not a command: nothing is reserved, priced or persisted. It exists
    because the Customer has to be shown *how many* start times to pick before
    picking any, and the plan-set command cannot answer that — it takes the times
    as input.

    Serviceability is resolved here for the same reason the planner resolves it: a
    cart that straddles two service areas, or contains something this address
    cannot be served, has no visits rather than empty ones. The refusal carries the
    same per-item reasons the planner raises, so one screen renders both.
    """

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["Cart"],
        operation_id="cart_scheduling_groups_create",
        request=SchedulingGroupsRequestSerializer,
        responses={
            200: SchedulingGroupsSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def post(self, request: Request) -> Response:
        serializer = SchedulingGroupsRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = cast(User, request.user)
        try:
            cart = merge_session_cart(user=user, session_key=_session_key(request))
        except ValueError as exc:
            raise ValidationError(str(exc), code="cart_merge_conflict") from exc
        if cart.version != serializer.validated_data["expected_cart_version"]:
            raise CartVersionConflictApiError(current_version=cart.version)
        address = get_object_or_404(
            Address,
            id=serializer.validated_data["address_id"],
            customer=user,
            archived_at__isnull=True,
        )
        try:
            area = resolve_cart_service_area(cart=cart, address=address)
            groups = scheduling_groups(cart=cart, area=area)
        except ValueError as exc:
            # An empty cart, or one over the planning limit. Both are states the
            # Customer can see and fix, not server faults.
            raise ValidationError(str(exc), code="cart_not_schedulable") from exc
        return Response(
            SchedulingGroupsSerializer(
                {
                    "cart_version": cart.version,
                    "groups": [
                        {
                            "key": group.key,
                            "label": group.label,
                            "estimated_duration_minutes": group.estimated_duration_minutes,
                            "cart_item_ids": list(group.cart_item_ids),
                        }
                        for group in groups
                    ],
                }
            ).data
        )


class FulfilmentPlanSetView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["Fulfilment Planning"],
        request=FulfilmentPlanSetCreateSerializer,
        parameters=[IDEMPOTENCY_KEY_HEADER],
        responses={201: FulfilmentPlanSetSerializer, 409: ApiErrorSerializer},
    )
    def post(self, request: Request) -> Response:
        serializer = FulfilmentPlanSetCreateSerializer(data=request.data)
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
        key = request.headers.get("Idempotency-Key")
        if not key:
            raise ValidationError(
                {"Idempotency-Key": "This header is required."},
                code="idempotency_key_required",
            )

        def command() -> tuple[int, dict[str, object]]:
            try:
                plan_set = create_fulfilment_plan_set(
                    customer=user,
                    cart=cart,
                    address=address,
                    expected_cart_version=serializer.validated_data["expected_cart_version"],
                    preferred_starts={
                        entry["group_key"]: entry["starts_at"]
                        for entry in serializer.validated_data["preferred_starts"]
                    },
                )
            except PermissionError as exc:
                raise PermissionDenied(str(exc)) from exc
            except ValueError as exc:
                raise ValidationError(str(exc), code="fulfilment_plan_invalid") from exc
            return status.HTTP_201_CREATED, FulfilmentPlanSetSerializer(plan_set).data

        result = execute_idempotent(
            actor=user,
            operation="fulfilment_plan_set.create",
            key=key,
            request_payload=serializer.validated_data,
            command=command,
        )
        response = Response(result.body, status=result.status_code)
        if result.replayed:
            response["Idempotent-Replay"] = "true"
        return response


class FulfilmentPlanSetDetailView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["Fulfilment Planning"],
        responses={200: FulfilmentPlanSetSerializer},
    )
    def get(self, request: Request, plan_set_id: UUID) -> Response:
        user = cast(User, request.user)
        plan_set = get_object_or_404(
            FulfilmentPlanSet.objects.prefetch_related("plans__units__items"),
            id=plan_set_id,
            cart__customer=user,
        )
        return Response(FulfilmentPlanSetSerializer(plan_set).data)


class PlanQuoteView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["Fulfilment Planning"],
        request=PlanQuoteCreateSerializer,
        parameters=[IDEMPOTENCY_KEY_HEADER],
        responses={201: GroupQuoteSerializer, 409: ApiErrorSerializer},
    )
    def post(self, request: Request) -> Response:
        serializer = PlanQuoteCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = cast(User, request.user)
        plan = get_object_or_404(
            FulfilmentPlan,
            id=serializer.validated_data["plan_id"],
            plan_set__cart__customer=user,
        )
        key = request.headers.get("Idempotency-Key")
        if not key:
            raise ValidationError(
                {"Idempotency-Key": "This header is required."},
                code="idempotency_key_required",
            )

        def command() -> tuple[int, dict[str, object]]:
            try:
                quote = create_plan_quote(customer=user, plan=plan)
            except PermissionError as exc:
                raise PermissionDenied(str(exc)) from exc
            except ValueError as exc:
                raise ValidationError(str(exc), code="plan_quote_invalid") from exc
            quote = Quote.objects.prefetch_related("units__lines__plan_unit_item").get(id=quote.id)
            return status.HTTP_201_CREATED, GroupQuoteSerializer(quote).data

        result = execute_idempotent(
            actor=user,
            operation="plan_quote.create",
            key=key,
            request_payload=serializer.validated_data,
            command=command,
        )
        response = Response(result.body, status=result.status_code)
        if result.replayed:
            response["Idempotent-Replay"] = "true"
        return response


class PlanQuoteDetailView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(tags=["Fulfilment Planning"], responses={200: GroupQuoteSerializer})
    def get(self, request: Request, quote_id: UUID) -> Response:
        user = cast(User, request.user)
        quote = get_object_or_404(
            Quote.objects.prefetch_related("units__lines__plan_unit_item"),
            id=quote_id,
            fulfilment_plan__plan_set__cart__customer=user,
        )
        if quote.status == Quote.Status.ACTIVE and quote.expires_at <= timezone.now():
            Quote.objects.filter(id=quote.id, status=Quote.Status.ACTIVE).update(
                status=Quote.Status.EXPIRED
            )
            quote.status = Quote.Status.EXPIRED
        return Response(GroupQuoteSerializer(quote).data)


class QuoteView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["Checkout"],
        request=QuoteCreateSerializer,
        responses={201: QuoteSerializer, 409: ApiErrorSerializer},
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
                window_id=serializer.validated_data["window_id"],
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
            Quote.objects.filter(
                Q(cart_item__cart__customer=user)
                | Q(fulfilment_plan__plan_set__cart__customer=user)
            ),
            id=serializer.validated_data["quote_id"],
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
            Quote.objects.filter(
                Q(cart_item__cart__customer=customer)
                | Q(fulfilment_plan__plan_set__cart__customer=customer)
            ),
            id=serializer.validated_data["quote_id"],
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
