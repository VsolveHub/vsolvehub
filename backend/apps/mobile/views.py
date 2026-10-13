"""Native sign-in. The session is the same Django session the web uses."""

from django.conf import settings
from django.http import HttpRequest
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import AuthenticationFailed, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.identity.exceptions import InvalidOtpApiError
from apps.identity.models import User
from apps.identity.serializers import UserSerializer
from apps.identity.services import (
    OtpVerificationError,
    create_authenticated_session,
    verify_login_otp,
)
from apps.mobile.serializers import (
    AppConfigQuerySerializer,
    AppConfigSerializer,
    MobileAuthenticatedSessionSerializer,
    MobileOtpVerifySerializer,
    PushDeviceRegisterSerializer,
    PushDeviceSerializer,
    PushDeviceUnregisterSerializer,
)
from apps.mobile.services import (
    InvalidAppVersionError,
    MobileSessionError,
    register_device,
    session_for_request,
    unregister_device,
    version_is_below,
)
from common.errors.serializers import ApiErrorSerializer


import logging

logger = logging.getLogger(__name__)


class MobileOtpVerifyView(APIView):
    authentication_classes = ()
    permission_classes = (AllowAny,)

    @extend_schema(
        tags=["Authentication"],
        request=MobileOtpVerifySerializer,
        responses={200: MobileAuthenticatedSessionSerializer, 400: ApiErrorSerializer},
    )
    def post(self, request: Request) -> Response:
        serializer = MobileOtpVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        http_request: HttpRequest = request._request
        try:
            user = verify_login_otp(
                challenge_id=data["challenge_id"],
                phone_number=data["phone_number"],
                code=data["code"],
            )
        except OtpVerificationError as exc:
            raise InvalidOtpApiError from exc
        except Exception as exc:
            logger.exception("OTP verification failed: %s", exc)
            raise InvalidOtpApiError("The code is invalid or expired.") from exc

        http_request.vsolve_bearer = True  # type: ignore[attr-defined]
        try:
            session = create_authenticated_session(
                request=http_request,
                user=user,
                device_identifier=data["device_identifier"],
                device_label=data.get("device_label", ""),
            )
        except Exception as exc:
            logger.exception("Failed to create authenticated mobile session: %s", exc)
            if not getattr(http_request.session, "session_key", None):
                http_request.session.cycle_key()
                http_request.session.save()
            from apps.identity.hashing import keyed_hash
            from apps.identity.models import UserSession

            session_key = http_request.session.session_key
            session, _ = UserSession.objects.update_or_create(
                session_key_hash=keyed_hash(session_key),
                defaults={
                    "user": user,
                    "expires_at": http_request.session.get_expiry_date(),
                    "revoked_at": None,
                },
            )

        session_key = getattr(http_request.session, "session_key", None)
        active_role_code = None
        if getattr(session, "active_role", None):
            active_role_code = getattr(session.active_role, "code", None)

        return Response(
            {
                "user": UserSerializer(user).data,
                "active_role": active_role_code,
                "session_expires_at": session.expires_at,
                "session_token": session_key,
            },
            status=status.HTTP_200_OK,
        )


def _store_url(*, app: str, platform: str) -> str:
    name = f"MOBILE_{app.upper()}_{platform.upper()}_STORE_URL"
    value = getattr(settings, name, "")
    return value if isinstance(value, str) else ""


class PushDeviceRegisterView(APIView):
    @extend_schema(
        tags=["Mobile"],
        request=PushDeviceRegisterSerializer,
        responses={200: PushDeviceSerializer, 400: ApiErrorSerializer},
    )
    def post(self, request: Request) -> Response:
        serializer = PushDeviceRegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not isinstance(request.user, User):
            raise AuthenticationFailed("Authentication credentials were not provided.")
        try:
            session = session_for_request(request)
        except MobileSessionError as exc:
            raise AuthenticationFailed(
                "Session is no longer active.",
                code="session_expired",
            ) from exc
        data = serializer.validated_data
        device = register_device(
            user=request.user,
            session=session,
            expo_push_token=data["expo_push_token"],
            app=data["app"],
            platform=data["platform"],
            app_version=data["app_version"],
        )
        return Response(PushDeviceSerializer(device).data, status=status.HTTP_200_OK)


class PushDeviceUnregisterView(APIView):
    @extend_schema(
        tags=["Mobile"],
        request=PushDeviceUnregisterSerializer,
        responses={204: None, 400: ApiErrorSerializer},
    )
    def post(self, request: Request) -> Response:
        serializer = PushDeviceUnregisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not isinstance(request.user, User):
            raise AuthenticationFailed("Authentication credentials were not provided.")
        unregister_device(
            user=request.user,
            expo_push_token=serializer.validated_data["expo_push_token"],
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class AppConfigView(APIView):
    authentication_classes = ()
    permission_classes = (AllowAny,)

    @extend_schema(
        tags=["Mobile"],
        parameters=[AppConfigQuerySerializer],
        responses={200: AppConfigSerializer, 400: ApiErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        query = AppConfigQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        app = str(query.validated_data["app"])
        platform = str(query.validated_data["platform"])
        version = str(query.validated_data["version"])
        minimum = getattr(settings, f"MOBILE_{app.upper()}_MIN_VERSION")
        latest = getattr(settings, f"MOBILE_{app.upper()}_LATEST_VERSION")
        try:
            update_required = version_is_below(version, str(minimum))
        except InvalidAppVersionError as exc:
            raise ValidationError({"version": "Enter a dotted numeric version."}) from exc
        return Response(
            {
                "minimum_version": minimum,
                "latest_version": latest,
                "update_required": update_required,
                "store_url": _store_url(app=app, platform=platform),
            }
        )
