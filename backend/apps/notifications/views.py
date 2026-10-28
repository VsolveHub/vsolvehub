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

from typing import cast

from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.identity.models import User
from apps.notifications.feed import (
    NotificationNotFoundError,
    mark_all_read,
    mark_read,
    notification_feed,
    unread_count,
)
from apps.notifications.models import KillSwitch
from apps.notifications.serializers import (
    EngageKillSwitchRequestSerializer,
    KillSwitchSerializer,
    MarkNotificationReadRequestSerializer,
    NotificationPageSerializer,
    NotificationSerializer,
    ReleaseKillSwitchRequestSerializer,
    UnreadNotificationCountSerializer,
)
from apps.notifications.services import engage_kill_switch, release_kill_switch
from apps.partners.permissions import IsOperationsUser
from common.errors.serializers import ApiErrorSerializer
from common.pagination import (
    BoundedCursorQuerySerializer,
    StrictCursorPagination,
    reject_invalid_cursor_query,
)
from common.throttling import ThrottledWriteMixin

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
    """Local development & testing endpoint to verify OneSignal push delivery to an external_id."""

    authentication_classes = ()
    permission_classes = ()

    def post(self, request: Request) -> Response:
        from django.conf import settings
        from apps.notifications.onesignal import send_push_to_external_ids

        is_dev_enabled = settings.DEBUG or getattr(settings, "ONESIGNAL_ENV", "") == "local"

        if not is_dev_enabled:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        external_id = request.data.get("external_id")
        heading = request.data.get("heading", "Test job alert")
        body = request.data.get("body", "This is a test Instant booking notification.")
        data = request.data.get("data", {"type": "DEV_TEST"})
        url = request.data.get("url")

        if not external_id:
            return Response(
                {"error": "external_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        result = send_push_to_external_ids(
            external_ids=[str(external_id)],
            heading=heading,
            body=body,
            data=data,
            url=url,
        )
        return Response(result, status=status.HTTP_200_OK if result["success"] else status.HTTP_400_BAD_REQUEST)

