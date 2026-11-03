"""The in-app notification feed, and the kill switches that can stop sending.

## The feed

Three routes, all scoped to the session: read your notices, count the unread ones, mark them read.
Every M2 actor uses the same three — a Customer, a labour lead and an operator differ in what they
are told, not in how they read it, so a role segment in the path would be three copies of one
surface.

The badge count is deliberately its own endpoint. It is polled on every authenticated screen in
both apps while the feed itself is read only when somebody opens the panel, and making the cheap
question carry the expensive answer is how a poll quietly becomes a page fetch every few seconds.

## The kill switches

Operations-only and audited by `IsOperationsUser`. No step-up on engage — the moment you need to
stop sending is the moment you cannot wait for anything, and a control that is hard to reach in
an incident is a control nobody uses. Releasing is equally light for the same reason.

The audit lives in the row itself: actor, reason and timestamp for both directions.
"""

import logging
import uuid
from typing import cast

from django.conf import settings
from django.db.models import Q
from django.utils import timezone
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.exceptions import APIException, NotFound, PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.identity.models import User
from apps.notifications import onesignal
from apps.notifications.feed import (
    NotificationNotFoundError,
    mark_all_read,
    mark_read,
    notification_feed,
    unread_count,
)
from apps.notifications.models import (
    CustomerPushSubscription,
    KillSwitch,
    PushNotificationPreference,
)
from apps.notifications.serializers import (
    CustomerPushSubscriptionResponseSerializer,
    CustomerPushSubscriptionSyncSerializer,
    CustomerPushSubscriptionUpdateSerializer,
    EngageKillSwitchRequestSerializer,
    KillSwitchSerializer,
    MarkNotificationReadRequestSerializer,
    NotificationPageSerializer,
    NotificationSerializer,
    PushPreferencesSerializer,
    PushPreferenceUpdateSerializer,
    ReleaseKillSwitchRequestSerializer,
    UnreadNotificationCountSerializer,
)
from apps.notifications.services import (
    engage_kill_switch,
    release_kill_switch,
    sync_customer_push_subscription,
)
from apps.partners.permissions import IsOperationsUser
from common.errors.serializers import ApiErrorSerializer
from common.pagination import (
    BoundedCursorQuerySerializer,
    StrictCursorPagination,
    reject_invalid_cursor_query,
)
from common.throttling import ThrottledWriteMixin

logger = logging.getLogger(__name__)

OPERATIONS_TAG = "Operations"
NOTIFICATIONS_TAG = "Notifications"


class NotificationApiException(APIException):
    """Carries a feed refusal into `common.errors.handler` with its code intact.

    The same bridge `M2ApiException` provides for the requirement domain, defined here rather than
    imported because `apps.notifications` must not depend on `apps.requirements` — the dependency
    runs the other way, and closing that loop would be an import cycle.
    """

    def __init__(self, error: NotificationNotFoundError) -> None:
        self.status_code = error.status_code
        self.default_code = error.code
        self.retryable = error.retryable
        super().__init__(detail=error.message, code=error.code)


class NotificationCursorPagination(StrictCursorPagination):
    """`ordering` is declared here, not left to the queryset.

    `CursorPagination` reads its ordering from itself and defaults to `-created`, a field this
    model does not have, so a paginator relying on the queryset's own `Meta.ordering` never
    finishes its setup. Matches `NotificationIntent.Meta.ordering` exactly.
    """

    page_size = 20
    ordering = ("-created_at", "id")


class KillSwitchListView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=[OPERATIONS_TAG],
        operation_id="operations_kill_switches_list",
        responses={200: KillSwitchSerializer(many=True), 403: ApiErrorSerializer},
    )
    def get(self, _request: Request) -> Response:
        switches = KillSwitch.objects.all().order_by("scope", "target")
        return Response(KillSwitchSerializer(switches, many=True).data)

    @extend_schema(
        tags=[OPERATIONS_TAG],
        operation_id="operations_kill_switch_engage",
        request=EngageKillSwitchRequestSerializer,
        responses={200: KillSwitchSerializer, 400: ApiErrorSerializer, 403: ApiErrorSerializer},
    )
    def post(self, request: Request) -> Response:
        serializer = EngageKillSwitchRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        switch = engage_kill_switch(
            scope=serializer.validated_data["scope"],
            target=serializer.validated_data["target"],
            reason=serializer.validated_data["reason"],
            actor=cast(User, request.user),
        )
        return Response(KillSwitchSerializer(switch).data)


class KillSwitchReleaseView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=[OPERATIONS_TAG],
        operation_id="operations_kill_switch_release",
        request=ReleaseKillSwitchRequestSerializer,
        responses={200: KillSwitchSerializer, 403: ApiErrorSerializer, 404: ApiErrorSerializer},
    )
    def post(self, request: Request) -> Response:
        serializer = ReleaseKillSwitchRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        switch = release_kill_switch(
            scope=serializer.validated_data["scope"],
            target=serializer.validated_data["target"],
            actor=cast(User, request.user),
        )
        if switch is None:
            return Response({"detail": "No such kill switch."}, status=status.HTTP_404_NOT_FOUND)
        return Response(KillSwitchSerializer(switch).data)


class NotificationFeedView(APIView):
    """What this person has been told.

    Scoped to `request.user` and to nothing else — there is no recipient parameter to get wrong,
    which is the same reasoning that keeps `partner_id` off the partner ledger.
    """

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=[NOTIFICATIONS_TAG],
        operation_id="notification_feed_list",
        parameters=[BoundedCursorQuerySerializer],
        responses={
            200: NotificationPageSerializer,
            400: ApiErrorSerializer,
            403: ApiErrorSerializer,
        },
    )
    def get(self, request: Request) -> Response:
        reject_invalid_cursor_query(request)
        queryset = notification_feed(cast(User, request.user))
        paginator = NotificationCursorPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(NotificationSerializer(page or [], many=True).data)


class NotificationUnreadCountView(APIView):
    """The badge number.

    Its own endpoint rather than a field on the feed page, because the badge is polled on every
    authenticated screen and the feed is read only when somebody opens the panel. Making the cheap
    question carry the expensive answer is how a poll becomes a page fetch every few seconds.
    """

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=[NOTIFICATIONS_TAG],
        operation_id="notification_unread_count",
        responses={200: UnreadNotificationCountSerializer, 403: ApiErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        return Response({"unread": unread_count(cast(User, request.user))})


class NotificationReadView(ThrottledWriteMixin, APIView):
    """Mark one notice read, or all of them.

    `ThrottledWriteMixin` exempts safe methods, so mounting a scope here costs the polled reads
    above nothing while still bounding a script hammering the write.
    """

    permission_classes = (IsAuthenticated,)
    throttle_scope = "m2_notification_read"

    @extend_schema(
        tags=[NOTIFICATIONS_TAG],
        operation_id="notification_mark_read",
        request=MarkNotificationReadRequestSerializer,
        responses={
            200: UnreadNotificationCountSerializer,
            400: ApiErrorSerializer,
            403: ApiErrorSerializer,
            404: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`notification_not_found` when the notice is not this person's.",
            ),
        },
    )
    def post(self, request: Request) -> Response:
        serializer = MarkNotificationReadRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        recipient = cast(User, request.user)
        if serializer.validated_data.get("all"):
            mark_all_read(recipient=recipient)
        else:
            try:
                mark_read(
                    recipient=recipient,
                    notification_id=serializer.validated_data["notification_id"],
                )
            except NotificationNotFoundError as error:
                raise NotificationApiException(error) from error
        return Response({"unread": unread_count(recipient)})


class DevOneSignalTestPushView(APIView):
    """Local development only: send a test push to yourself.

    Exists only while `DEBUG` is on — never by an environment label, which once defaulted it open
    — and only to the signed-in caller, so it can never be used to push to someone else.
    """

    permission_classes = (IsAuthenticated,)

    def post(self, request: Request) -> Response:

        if not settings.DEBUG:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        heading = request.data.get("heading", "Test job alert")
        body = request.data.get("body", "This is a test Instant booking notification.")
        data = request.data.get("data", {"type": "DEV_TEST"})
        url = request.data.get("url")

        result = onesignal.send_push_to_external_ids(
            external_ids=[str(request.user.id)],
            heading=heading,
            body=body,
            data=data,
            url=url,
        )
        return Response(
            result, status=status.HTTP_200_OK if result["success"] else status.HTTP_400_BAD_REQUEST
        )


class CustomerPushSubscriptionSyncView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["Customer push subscriptions"],
        request=CustomerPushSubscriptionSyncSerializer,
        responses={
            200: CustomerPushSubscriptionResponseSerializer,
            201: CustomerPushSubscriptionResponseSerializer,
            400: ApiErrorSerializer,
            401: ApiErrorSerializer,
            403: ApiErrorSerializer,
        },
    )
    def post(self, request: Request) -> Response:
        serializer = CustomerPushSubscriptionSyncSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        subscription, is_created = sync_customer_push_subscription(
            user=cast(User, request.user),
            **serializer.validated_data,
        )
        return Response(
            CustomerPushSubscriptionResponseSerializer(subscription).data,
            status=status.HTTP_201_CREATED if is_created else status.HTTP_200_OK,
        )


class CustomerPushSubscriptionDetailView(APIView):
    permission_classes = (IsAuthenticated,)

    def _get_subscription(self, request: Request, subscription_id: str) -> CustomerPushSubscription:

        is_uuid = False
        try:
            uuid.UUID(subscription_id)
            is_uuid = True
        except ValueError:
            pass

        if is_uuid:
            sub = CustomerPushSubscription.objects.filter(
                Q(id=subscription_id) | Q(onesignal_subscription_id=subscription_id)
            ).first()
        else:
            sub = CustomerPushSubscription.objects.filter(
                onesignal_subscription_id=subscription_id
            ).first()

        if sub is None:
            raise NotFound("Customer push subscription was not found.")

        if sub.user_id != request.user.id:
            raise PermissionDenied("This push subscription belongs to another user account.")

        return sub

    @extend_schema(
        tags=["Customer push subscriptions"],
        request=CustomerPushSubscriptionUpdateSerializer,
        responses={
            200: CustomerPushSubscriptionResponseSerializer,
            400: ApiErrorSerializer,
            401: ApiErrorSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
        },
    )
    def patch(self, request: Request, subscription_id: str) -> Response:
        sub = self._get_subscription(request, subscription_id)
        serializer = CustomerPushSubscriptionUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        now = timezone.now()
        update_fields = ["last_verified_at", "updated_at"]
        sub.last_verified_at = now

        if "is_active" in data:
            sub.is_active = data["is_active"]
            update_fields.append("is_active")
        if "opted_in" in data:
            sub.opted_in = data["opted_in"]
            update_fields.append("opted_in")
        if "permission_state" in data:
            sub.permission_state = data["permission_state"]
            update_fields.append("permission_state")
            if sub.permission_state.lower() == "denied":
                sub.is_active = False
                if "is_active" not in update_fields:
                    update_fields.append("is_active")
        if "user_agent" in data:
            sub.user_agent = data["user_agent"]
            update_fields.append("user_agent")

        # If opted_in is False, also deactivate
        if sub.opted_in is False and sub.is_active:
            sub.is_active = False
            if "is_active" not in update_fields:
                update_fields.append("is_active")

        # If becoming active WEB, deactivate other active WEB subscriptions for same customer
        if sub.is_active and sub.platform == CustomerPushSubscription.Platform.WEB:
            CustomerPushSubscription.objects.filter(
                user=cast(User, request.user),
                platform=CustomerPushSubscription.Platform.WEB,
                is_active=True,
            ).exclude(id=sub.id).update(is_active=False, updated_at=now)

        sub.save(update_fields=update_fields)

        event = (
            "customer_push_subscription_updated"
            if sub.is_active
            else "customer_push_subscription_deactivated"
        )
        logger.info(
            event,
            extra={
                "user_id": str(request.user.id),
                "role": "CUSTOMER",
                "platform": sub.platform,
                "permission_state": sub.permission_state,
                "subscription_id": sub.onesignal_subscription_id,
                "sync_status": "SUCCESS",
                "failure_reason": "",
            },
        )
        return Response(
            CustomerPushSubscriptionResponseSerializer(sub).data, status=status.HTTP_200_OK
        )

    @extend_schema(
        tags=["Customer push subscriptions"],
        responses={
            204: OpenApiResponse(description="Subscription deactivated successfully."),
            401: ApiErrorSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
        },
    )
    def delete(self, request: Request, subscription_id: str) -> Response:
        sub = self._get_subscription(request, subscription_id)
        now = timezone.now()
        sub.is_active = False
        sub.opted_in = False
        sub.last_verified_at = now
        sub.save(update_fields=["is_active", "opted_in", "last_verified_at", "updated_at"])

        logger.info(
            "customer_push_subscription_deactivated",
            extra={
                "user_id": str(request.user.id),
                "role": "CUSTOMER",
                "platform": sub.platform,
                "permission_state": sub.permission_state,
                "subscription_id": sub.onesignal_subscription_id,
                "sync_status": "SUCCESS",
                "failure_reason": "",
            },
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class BasePushNotificationPreferencesView(APIView):
    permission_classes = [IsAuthenticated]
    role: str = ""

    @extend_schema(
        tags=["Notification preferences"],
        responses={200: PushPreferencesSerializer},
    )
    def get(self, request: Request) -> Response:
        role = self.role
        user = cast(User, request.user)
        metadata = PushNotificationPreference.CATEGORY_METADATA.get(role, {})
        existing = {
            p.category: p.is_enabled
            for p in PushNotificationPreference.objects.filter(user=user, role=role)
        }

        preferences = []
        for cat_key, meta in metadata.items():
            is_enabled = existing.get(cat_key, meta.get("default_enabled", True))
            preferences.append(
                {
                    "category": cat_key,
                    "label": meta.get("label", cat_key),
                    "description": meta.get("description", ""),
                    "is_enabled": is_enabled,
                    "is_mutable": meta.get("is_mutable", True),
                }
            )

        return Response(
            {
                "role": role,
                "preferences": preferences,
            },
            status=status.HTTP_200_OK,
        )

    @extend_schema(
        tags=["Notification preferences"],
        request=PushPreferenceUpdateSerializer,
        responses={
            200: PushPreferencesSerializer,
            400: OpenApiResponse(
                description="Invalid request or attempt to disable immutable category."
            ),
        },
    )
    def patch(self, request: Request) -> Response:
        role = self.role
        user = cast(User, request.user)
        metadata = PushNotificationPreference.CATEGORY_METADATA.get(role, {})
        data = request.data

        updates: dict[str, bool] = {}

        if isinstance(data, list):
            for item in data:
                if isinstance(item, dict) and "category" in item and "is_enabled" in item:
                    updates[item["category"]] = bool(item["is_enabled"])
        elif isinstance(data, dict):
            if "category" in data and "is_enabled" in data:
                updates[data["category"]] = bool(data["is_enabled"])
            elif "preferences" in data:
                prefs = data["preferences"]
                if isinstance(prefs, dict):
                    for k, v in prefs.items():
                        updates[k] = bool(v)
                elif isinstance(prefs, list):
                    for item in prefs:
                        if isinstance(item, dict) and "category" in item and "is_enabled" in item:
                            updates[item["category"]] = bool(item["is_enabled"])
            else:
                for k, v in data.items():
                    if k in metadata:
                        updates[k] = bool(v)

        if not updates:
            return Response(
                {"error": "No valid preferences provided to update."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        for cat, enabled in updates.items():
            if cat not in metadata:
                return Response(
                    {"error": f"Unknown category '{cat}' for role '{role}'."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            meta = metadata[cat]
            if not meta.get("is_mutable", True) and not enabled:
                return Response(
                    {
                        "error": f"Category '{cat}' is critical and cannot be disabled.",
                        "category": cat,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        for cat, enabled in updates.items():
            PushNotificationPreference.objects.update_or_create(
                user=user,
                role=role,
                category=cat,
                defaults={"is_enabled": enabled},
            )

        logger.info(
            "push_notification_preferences_updated",
            extra={
                "user_id": str(user.id),
                "role": role,
                "updates": updates,
            },
        )

        return self.get(request)


class CustomerPushNotificationPreferencesView(BasePushNotificationPreferencesView):
    role = PushNotificationPreference.Role.CUSTOMER


class PartnerPushNotificationPreferencesView(BasePushNotificationPreferencesView):
    role = PushNotificationPreference.Role.PARTNER
