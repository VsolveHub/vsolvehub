"""Assistant HTTP API: start a conversation, read it, send a message.

Usable signed out — searching the catalogue needs no account — but every booking step asks the
Customer to log in, and a conversation then belongs to that Customer only.
"""

import logging
from typing import cast

from django.conf import settings
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.identity.models import User
from common.errors.serializers import ApiErrorSerializer
from common.throttling import ThrottledWriteMixin

from .agent import run_turn
from .exceptions import AssistantUnavailableApiError
from .llm import AssistantNotConfiguredError, ChatModel, chat_model_from_settings
from .models import AssistantSession
from .serializers import (
    AssistantConversationCreatedSerializer,
    AssistantConversationSerializer,
    AssistantMessageCreateSerializer,
    AssistantTurnSerializer,
)
from .services import (
    create_session,
    has_open_booking,
    recent_visible_messages,
    session_for,
    sync_progress,
    turn_lease,
)

logger = logging.getLogger(__name__)

TOKEN_HEADER = "X-Assistant-Token"  # noqa: S105 - a header name, not a secret
ASSISTANT_TOKEN_HEADER = OpenApiParameter(
    name=TOKEN_HEADER,
    type=OpenApiTypes.STR,
    location=OpenApiParameter.HEADER,
    required=True,
    description="The conversation token returned when the conversation was started.",
)


def _user(request: Request) -> User | None:
    user = request.user
    return user if isinstance(user, User) and user.is_authenticated else None


def _chat_model() -> ChatModel:
    if not settings.ASSISTANT_ENABLED:
        raise AssistantUnavailableApiError
    try:
        return chat_model_from_settings()
    except AssistantNotConfiguredError as exc:
        logger.error("assistant.not_configured", extra={"detail": str(exc)})
        raise AssistantUnavailableApiError from exc


def _cart_session_key(request: Request) -> str:
    request.session.save()
    key = request.session.session_key
    if not key:
        raise AssistantUnavailableApiError
    return key


def _conversation(session: AssistantSession, *, user: User | None) -> dict[str, object]:
    session.refresh_from_db(fields=("busy_until",))
    return {
        "messages": recent_visible_messages(session),
        "is_answering": bool(session.busy_until and session.busy_until > timezone.now()),
        "signed_in": user is not None,
        "has_open_booking": has_open_booking(session),
    }


class AssistantConversationCreateView(ThrottledWriteMixin, APIView):
    """Start a conversation. The token in the response is shown once."""

    permission_classes = (AllowAny,)
    throttle_scope = "assistant_conversation"

    @extend_schema(
        tags=["Assistant"],
        operation_id="assistant_conversation_create",
        request=None,
        responses={201: AssistantConversationCreatedSerializer, 503: ApiErrorSerializer},
    )
    def post(self, request: Request) -> Response:
        _chat_model()
        user = _user(request)
        session, token = create_session(user=user)
        body: dict[str, object] = {
            "conversation_token": token,
            "conversation": _conversation(session, user=user),
        }
        return Response(
            AssistantConversationCreatedSerializer(body).data, status=status.HTTP_201_CREATED
        )


class AssistantConversationView(APIView):
    """The conversation so far. Safe to poll: it also posts booking progress as it happens."""

    permission_classes = (AllowAny,)

    @extend_schema(
        tags=["Assistant"],
        operation_id="assistant_conversation_retrieve",
        parameters=[ASSISTANT_TOKEN_HEADER],
        responses={200: AssistantConversationSerializer, 404: ApiErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        user = _user(request)
        session = session_for(token=request.headers.get(TOKEN_HEADER, ""), user=user)
        if has_open_booking(session):
            with turn_lease(session, required=False) as acquired:
                if acquired:
                    sync_progress(session)
        return Response(AssistantConversationSerializer(_conversation(session, user=user)).data)


class AssistantMessageCreateView(ThrottledWriteMixin, APIView):
    """Send one message and receive the assistant's answer to it."""

    permission_classes = (AllowAny,)
    throttle_scope = "assistant_message"

    @extend_schema(
        tags=["Assistant"],
        operation_id="assistant_message_create",
        parameters=[ASSISTANT_TOKEN_HEADER],
        request=AssistantMessageCreateSerializer,
        responses={
            200: AssistantTurnSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
            429: ApiErrorSerializer,
            503: ApiErrorSerializer,
        },
    )
    def post(self, request: Request) -> Response:
        chat_model = _chat_model()
        serializer = AssistantMessageCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = _user(request)
        session = session_for(token=request.headers.get(TOKEN_HEADER, ""), user=user)
        cart_session_key = _cart_session_key(request)
        with turn_lease(session):
            messages = run_turn(
                session=session,
                user=user,
                cart_session_key=cart_session_key,
                text=cast(str, serializer.validated_data["text"]).strip(),
                client_message_id=cast(str, serializer.validated_data["client_message_id"]),
                chat_model=chat_model,
            )
        return Response(AssistantTurnSerializer({"messages": messages}).data)
