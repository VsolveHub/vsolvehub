"""OTP and session API endpoints."""

import uuid
from typing import cast

from django.conf import settings
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.exceptions import NotFound, Throttled
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.identity.delivery import OtpDeliveryError
from apps.identity.exceptions import InvalidOtpApiError, OtpUnavailableApiError
from apps.identity.hashing import keyed_hash
from apps.identity.models import User, UserSession
from apps.identity.serializers import (
    AuthenticatedSessionSerializer,
    OtpIssuedSerializer,
    OtpRequestSerializer,
    OtpVerifySerializer,
    UserSerializer,
    UserSessionSerializer,
)
from apps.identity.services import (
    OtpRateLimitError,
    OtpVerificationError,
    create_authenticated_session,
    issue_login_otp,
    revoke_current_session,
    verify_login_otp,
)


def _request_ip(request: Request) -> str:
    value = request.META.get("REMOTE_ADDR")
    return str(value) if value else "unknown"


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfCookieView(APIView):
    authentication_classes = ()
    permission_classes = (AllowAny,)

    @extend_schema(
        tags=["Authentication"],
        responses={200: OpenApiResponse(description="A CSRF cookie has been set.")},
    )
    def get(self, _request: Request) -> Response:
        return Response({"status": "ok"})


class OtpRequestView(APIView):
    authentication_classes = ()
    permission_classes = (AllowAny,)

    @extend_schema(
        tags=["Authentication"],
        request=OtpRequestSerializer,
        responses={202: OtpIssuedSerializer},
    )
    def post(self, request: Request) -> Response:
        serializer = OtpRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            issued = issue_login_otp(
                phone_number=data["phone_number"],
                request_ip=_request_ip(request),
                device_identifier=data.get("device_identifier", ""),
            )
        except OtpRateLimitError as exc:
            raise Throttled(wait=exc.retry_after_seconds) from exc
        except OtpDeliveryError as exc:
            raise OtpUnavailableApiError from exc

        payload: dict[str, object] = {
            "challenge_id": issued.challenge.id,
            "expires_in_seconds": settings.OTP_TTL_SECONDS,
            "resend_after_seconds": settings.OTP_RESEND_COOLDOWN_SECONDS,
        }
        if issued.development_code is not None:
            payload["development_code"] = issued.development_code

        return Response(payload, status=status.HTTP_202_ACCEPTED)


class OtpVerifyView(APIView):
    authentication_classes = ()
    permission_classes = (AllowAny,)

    @extend_schema(
        tags=["Authentication"],
        request=OtpVerifySerializer,
        responses={200: AuthenticatedSessionSerializer},
    )
    def post(self, request: Request) -> Response:
        serializer = OtpVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            user = verify_login_otp(
                challenge_id=data["challenge_id"],
                phone_number=data["phone_number"],
                code=data["code"],
            )
        except OtpVerificationError as exc:
            raise InvalidOtpApiError from exc

        session = create_authenticated_session(
            request=request._request,
            user=user,
            device_identifier=data.get("device_identifier", ""),
            device_label=data.get("device_label", ""),
        )
        response_data = {
            "user": UserSerializer(user).data,
            "session_expires_at": session.expires_at,
        }
        return Response(response_data)


class CurrentSessionView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(tags=["Authentication"], responses={200: UserSerializer})
    def get(self, request: Request) -> Response:
        user = cast(User, request.user)
        return Response(UserSerializer(user).data)


class LogoutView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["Authentication"],
        request=None,
        responses={204: OpenApiResponse(description="The current session was revoked.")},
    )
    def post(self, request: Request) -> Response:
        revoke_current_session(request._request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class SessionListView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(tags=["Authentication"], responses={200: UserSessionSerializer(many=True)})
    def get(self, request: Request) -> Response:
        user = cast(User, request.user)
        current_key = request.session.session_key
        current_hash = keyed_hash(current_key) if current_key else ""
        sessions = (
            UserSession.objects.filter(
                user=user,
                revoked_at__isnull=True,
                expires_at__gt=timezone.now(),
            )
            .select_related("device")
            .order_by("-last_seen_at")
        )
        serializer = UserSessionSerializer(
            sessions,
            many=True,
            context={"current_session_hash": current_hash},
        )
        return Response(serializer.data)


class SessionRevokeView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["Authentication"],
        request=None,
        responses={204: OpenApiResponse(description="The selected session was revoked.")},
    )
    def delete(self, request: Request, session_id: uuid.UUID) -> Response:
        user = cast(User, request.user)
        session = UserSession.objects.filter(
            id=session_id,
            user=user,
            revoked_at__isnull=True,
        ).first()
        if session is None:
            raise NotFound("Session was not found.")

        current_key = request.session.session_key
        is_current = bool(current_key and session.session_key_hash == keyed_hash(current_key))
        if is_current:
            revoke_current_session(request._request)
        else:
            session.revoked_at = timezone.now()
            session.save(update_fields=("revoked_at",))
        return Response(status=status.HTTP_204_NO_CONTENT)
