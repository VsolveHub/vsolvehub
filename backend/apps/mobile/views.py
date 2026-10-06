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

        http_request.vsolve_bearer = True  # type: ignore[attr-defined]
        session = create_authenticated_session(
            request=http_request,
            user=user,
            device_identifier=data["device_identifier"],
            device_label=data.get("device_label", ""),
        )
        session_key = http_request.session.session_key
        if not session_key:
            raise RuntimeError("Django did not create a session key.")
        return Response(
            {
                "user": UserSerializer(user).data,
                "active_role": session.active_role.code if session.active_role else None,
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
