"""OTP and session API endpoints."""

import uuid
from typing import cast

from django.conf import settings
from django.middleware.csrf import get_token
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.exceptions import AuthenticationFailed, NotFound, PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.identity.auth_cookies import mark_auth_cookies_for_clearing
from apps.identity.delivery import OtpDeliveryError
from apps.identity.exceptions import (
    InvalidOtpApiError,
    NoAccountForRoleApiError,
    OtpThrottled,
    OtpUnavailableApiError,
)
from apps.identity.firebase_auth import verify_firebase_login
from apps.identity.hashing import keyed_hash
from apps.identity.models import User, UserSession
from apps.identity.serializers import (
    ActiveRoleSerializer,
    AuthenticatedSessionSerializer,
    CommunicationPreferenceSerializer,
    ConsentReceiptCreateSerializer,
    ConsentReceiptSerializer,
    CsrfTokenSerializer,
    CustomerProfileUpdateSerializer,
    FirebasePrecheckSerializer,
    FirebaseVerifySerializer,
    OtpIssuedSerializer,
    OtpRequestSerializer,
    OtpVerifySerializer,
    PrivacyRequestCreateSerializer,
    PrivacyRequestSerializer,
    RoleSwitchSerializer,
    SessionStateSerializer,
    StepUpSessionSerializer,
    UserSerializer,
    UserSessionSerializer,
)
from apps.identity.services import (
    NoAccountForRoleError,
    OtpRateLimitError,
    OtpVerificationError,
    check_firebase_precheck,
    create_authenticated_session,
    create_privacy_request,
    issue_login_otp,
    mark_session_step_up,
    record_consent,
    revoke_current_session,
    set_communication_preference,
    switch_active_role,
    update_customer_profile,
    verify_login_otp,
)
from common.errors.serializers import ApiErrorSerializer
from common.observability.context import get_request_id
from common.schema import OTP_RATE_LIMIT_EXAMPLE, SESSION_EXPIRED_EXAMPLE


def _request_ip(request: Request) -> str:
    value = request.META.get("REMOTE_ADDR")
    return str(value) if value else "unknown"


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfCookieView(APIView):
    authentication_classes = ()
    permission_classes = (AllowAny,)

    @extend_schema(
        tags=["Authentication"],
        responses={200: CsrfTokenSerializer},
    )
    def get(self, request: Request) -> Response:
        return Response({"csrf_token": get_token(request._request)})


class OtpRequestView(APIView):
    authentication_classes = ()
    permission_classes = (AllowAny,)

    @extend_schema(
        tags=["Authentication"],
        request=OtpRequestSerializer,
        responses={
            202: OtpIssuedSerializer,
            404: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`intended_role` was set and this number holds no such account.",
            ),
            429: OpenApiResponse(
                response=ApiErrorSerializer,
                examples=[OTP_RATE_LIMIT_EXAMPLE],
            ),
            503: ApiErrorSerializer,
        },
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
                intended_role=data.get("intended_role", ""),
            )
        except OtpRateLimitError as exc:
            raise OtpThrottled(wait=exc.retry_after_seconds) from exc
        except OtpDeliveryError as exc:
            raise OtpUnavailableApiError from exc
        except NoAccountForRoleError as exc:
            raise NoAccountForRoleApiError from exc

        payload: dict[str, object] = {
            "challenge_id": issued.challenge.id,
            "expires_in_seconds": settings.OTP_TTL_SECONDS,
            "resend_after_seconds": settings.OTP_RESEND_COOLDOWN_SECONDS,
            "code_length": settings.OTP_CODE_LENGTH,
            "development_code": issued.development_code,
        }

        return Response(payload, status=status.HTTP_202_ACCEPTED)


class OtpVerifyView(APIView):
    authentication_classes = ()
    permission_classes = (AllowAny,)

    @extend_schema(
        tags=["Authentication"],
        request=OtpVerifySerializer,
        responses={200: AuthenticatedSessionSerializer, 400: ApiErrorSerializer},
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
                referral_code=data.get("referral_code", ""),
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
            "active_role": session.active_role.code if session.active_role else None,
            "session_expires_at": session.expires_at,
        }
        return Response(response_data)


class FirebasePrecheckView(APIView):
    """Pre-check rate limits and intended role gate before requesting Firebase SMS.

    Note that this is a UX/rate-limit aid and verify is the real gate.
    """

    authentication_classes = ()
    permission_classes = (AllowAny,)

    @extend_schema(
        tags=["Authentication"],
        request=FirebasePrecheckSerializer,
        responses={
            204: OpenApiResponse(
                description="Precheck allowed; client may proceed with Firebase SMS.",
            ),
            400: ApiErrorSerializer,
            404: OpenApiResponse(
                response=ApiErrorSerializer,
                description=(
                    "Firebase auth is disabled or `intended_role` was set and this number "
                    "holds no such account."
                ),
            ),
            429: OpenApiResponse(
                response=ApiErrorSerializer,
                examples=[OTP_RATE_LIMIT_EXAMPLE],
            ),
        },
    )
    def post(self, request: Request) -> Response:
        if not getattr(settings, "FIREBASE_AUTH_ENABLED", False):
            raise NotFound("Firebase authentication is disabled.")

        serializer = FirebasePrecheckSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            check_firebase_precheck(
                phone_number=data["phone_number"],
                request_ip=_request_ip(request),
                intended_role=data.get("intended_role", ""),
            )
        except OtpRateLimitError as exc:
            raise OtpThrottled(wait=exc.retry_after_seconds) from exc
        except NoAccountForRoleError as exc:
            raise NoAccountForRoleApiError from exc
        except OtpVerificationError as exc:
            raise InvalidOtpApiError from exc

        return Response(status=status.HTTP_204_NO_CONTENT)


class FirebaseVerifyView(APIView):
    """Verify Firebase ID token, provision the user session, and issue auth cookies."""

    authentication_classes = ()
    permission_classes = (AllowAny,)
    throttle_classes = (ScopedRateThrottle,)
    throttle_scope = "firebase_verify"

    @extend_schema(
        tags=["Authentication"],
        request=FirebaseVerifySerializer,
        responses={
            200: AuthenticatedSessionSerializer,
            400: ApiErrorSerializer,
            404: OpenApiResponse(
                response=ApiErrorSerializer,
                description=(
                    "Firebase auth is disabled or `intended_role` was set and this number "
                    "holds no such account."
                ),
            ),
            429: OpenApiResponse(
                response=ApiErrorSerializer,
                description="Rate limit exceeded.",
            ),
        },
    )
    def post(self, request: Request) -> Response:
        if not getattr(settings, "FIREBASE_AUTH_ENABLED", False):
            raise NotFound("Firebase authentication is disabled.")

        serializer = FirebaseVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            user = verify_firebase_login(
                id_token=data["id_token"],
                intended_role=data.get("intended_role", ""),
                referral_code=data.get("referral_code", ""),
                request_ip=_request_ip(request),
                request_id=get_request_id() or "",
            )
        except NoAccountForRoleError as exc:
            raise NoAccountForRoleApiError from exc
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
            "active_role": session.active_role.code if session.active_role else None,
            "session_expires_at": session.expires_at,
        }
        return Response(response_data)


class CurrentSessionView(APIView):
    permission_classes = (AllowAny,)

    @extend_schema(
        tags=["Authentication"],
        responses={
            200: SessionStateSerializer,
            403: OpenApiResponse(
                response=ApiErrorSerializer,
                examples=[SESSION_EXPIRED_EXAMPLE],
            ),
        },
    )
    def get(self, request: Request) -> Response:
        if not isinstance(request.user, User) or not request.user.is_authenticated:
            return Response(
                {
                    "user": None,
                    "active_role": None,
                    "session_expires_at": None,
                }
            )

        user = request.user
        session_key = request.session.session_key
        if not session_key:
            return Response(
                {
                    "user": None,
                    "active_role": None,
                    "session_expires_at": None,
                }
            )
        session = (
            UserSession.objects.select_related("active_role")
            .filter(
                user=user,
                session_key_hash=keyed_hash(session_key),
                revoked_at__isnull=True,
                expires_at__gt=timezone.now(),
            )
            .first()
        )
        if session is None:
            raise AuthenticationFailed(
                "Session is no longer active.",
                code="session_expired",
            )
        return Response(
            {
                "user": UserSerializer(user).data,
                "active_role": session.active_role.code if session.active_role else None,
                "session_expires_at": session.expires_at,
            }
        )


class LogoutView(APIView):
    # Not ``RevocableSessionAuthentication``. A dead session record raises before
    # this view would run, so Sign Out could never flush the cookie that is
    # causing the failure. Django's own session user is enough to revoke, and
    # an already-anonymous caller still needs the cookies expired.
    authentication_classes = ()
    permission_classes = (AllowAny,)

    @extend_schema(
        tags=["Authentication"],
        request=None,
        responses={204: OpenApiResponse(description="The current session was revoked.")},
    )
    def post(self, request: Request) -> Response:
        revoke_current_session(request._request)
        mark_auth_cookies_for_clearing(request._request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class CustomerProfileView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(tags=["Authentication"], responses={200: UserSerializer})
    def get(self, request: Request) -> Response:
        return Response(UserSerializer(cast(User, request.user)).data)

    @extend_schema(
        tags=["Authentication"],
        request=CustomerProfileUpdateSerializer,
        responses={200: UserSerializer, 400: ApiErrorSerializer},
    )
    def patch(self, request: Request) -> Response:
        serializer = CustomerProfileUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        user = update_customer_profile(
            user=cast(User, request.user),
            display_name=cast(str | None, data.get("display_name")),
            full_name=cast(str | None, data.get("full_name")),
            email=cast(str | None, data.get("email")),
        )
        return Response(UserSerializer(user).data)


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


class RoleSwitchView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["Authentication"],
        request=RoleSwitchSerializer,
        responses={200: ActiveRoleSerializer},
    )
    def post(self, request: Request) -> Response:
        serializer = RoleSwitchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        session_key = request.session.session_key
        if not session_key:
            raise PermissionDenied("Session is no longer active.")
        try:
            session = switch_active_role(
                user=cast(User, request.user),
                session_key=session_key,
                role_code=serializer.validated_data["role"],
            )
        except (PermissionError, UserSession.DoesNotExist) as exc:
            raise PermissionDenied("The requested role is unavailable.") from exc
        return Response({"active_role": session.active_role.code if session.active_role else None})


class FinanceStepUpView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["Authentication"],
        request=OtpVerifySerializer,
        responses={200: StepUpSessionSerializer},
    )
    def post(self, request: Request) -> Response:
        serializer = OtpVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            verified_user = verify_login_otp(
                challenge_id=data["challenge_id"],
                phone_number=data["phone_number"],
                code=data["code"],
            )
        except OtpVerificationError as exc:
            raise InvalidOtpApiError from exc
        user = cast(User, request.user)
        session_key = request.session.session_key
        if verified_user.pk != user.pk or not session_key:
            raise PermissionDenied("Step-up verification did not match the current session.")
        session = mark_session_step_up(user=user, session_key=session_key)
        return Response({"stepped_up_at": session.stepped_up_at})


class ConsentReceiptView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["Privacy"],
        request=ConsentReceiptCreateSerializer,
        responses={201: ConsentReceiptSerializer},
    )
    def post(self, request: Request) -> Response:
        serializer = ConsentReceiptCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        receipt = record_consent(user=cast(User, request.user), **serializer.validated_data)
        return Response(ConsentReceiptSerializer(receipt).data, status=status.HTTP_201_CREATED)


class CommunicationPreferenceView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(tags=["Privacy"], responses={200: CommunicationPreferenceSerializer(many=True)})
    def get(self, request: Request) -> Response:
        preferences = cast(User, request.user).communication_preferences.order_by(
            "channel", "purpose"
        )
        return Response(CommunicationPreferenceSerializer(preferences, many=True).data)

    @extend_schema(
        tags=["Privacy"],
        request=CommunicationPreferenceSerializer,
        responses={200: CommunicationPreferenceSerializer},
    )
    def put(self, request: Request) -> Response:
        serializer = CommunicationPreferenceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        preference = set_communication_preference(
            user=cast(User, request.user),
            **serializer.validated_data,
        )
        return Response(CommunicationPreferenceSerializer(preference).data)


class PrivacyRequestView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(tags=["Privacy"], responses={200: PrivacyRequestSerializer(many=True)})
    def get(self, request: Request) -> Response:
        requests = cast(User, request.user).privacy_requests.all()
        return Response(PrivacyRequestSerializer(requests, many=True).data)

    @extend_schema(
        tags=["Privacy"],
        request=PrivacyRequestCreateSerializer,
        responses={201: PrivacyRequestSerializer},
    )
    def post(self, request: Request) -> Response:
        serializer = PrivacyRequestCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        privacy_request = create_privacy_request(
            user=cast(User, request.user),
            kind=serializer.validated_data["kind"],
        )
        return Response(
            PrivacyRequestSerializer(privacy_request).data, status=status.HTTP_201_CREATED
        )
