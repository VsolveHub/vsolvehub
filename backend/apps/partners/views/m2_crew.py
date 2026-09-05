"""M2 (proposal 0013): the Partner's crew roster.

Add a worker, edit their skills, take them off the roster, and mark one person off for one date —
the other half of the registration surface whose wave banner sits at the top of `m2_registration`.
The same rule applies here: object-level authorization is per record, and a membership belonging to
another Partner answers `404`, never `403`.
"""

import uuid
from dataclasses import asdict
from http import HTTPStatus
from typing import cast

from django.conf import settings
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.models import ServiceVariant
from apps.foundation.services import execute_idempotent
from apps.identity.models import User
from apps.partners.capabilities import (
    add_crew_to_roster,
    archive_crew_member,
    crew_roster,
    set_crew_availability,
    update_crew_member,
)
from apps.partners.crew_documents import start_crew_document_upload, submit_crew_document
from apps.partners.exceptions import CapabilityNotApprovedError, PartnerDomainError
from apps.partners.models import (
    PartnerCapability,
    PartnerCrewMembership,
    PartnerProfile,
    Skill,
)
from apps.partners.permissions import IsPartnerUser
from apps.partners.serializers import (
    CrewAvailabilitySerializer,
    CrewAvailabilityWriteSerializer,
    CrewDocumentSubmitSerializer,
    CrewDocumentUploadGrantSerializer,
    CrewDocumentUploadRequestSerializer,
    CrewListSerializer,
    CrewMemberCreateSerializer,
    CrewMemberSerializer,
    CrewMemberUpdateSerializer,
)
from common.errors.serializers import ApiErrorSerializer
from common.schema import IDEMPOTENCY_KEY_HEADER
from common.throttling import ThrottledWriteMixin

from .base import (
    _idempotency_key,
    _partner_profile_or_404,
    _partner_profile_or_none,
    _raise_api_error,
)


class PartnerCrewCollectionView(ThrottledWriteMixin, APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)
    throttle_scope = "m2_partner_registration"

    @extend_schema(
        tags=["M2 - Partner crew"],
        operation_id="m2_partner_crew_list",
        description=(
            "This Partner's roster. Publishes **no `crew_member_id`** — identity is global, and "
            "handing the global id to one agency would let two agencies compare rosters and "
            "discover a worker is on both. `phone_masked` shows four digits; the number itself is "
            "never stored, so this is not a redaction but the whole of what exists."
        ),
        responses={200: CrewListSerializer, 403: ApiErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        profile = _partner_profile_or_none(request)
        members = [asdict(entry) for entry in crew_roster(profile)] if profile else []
        return Response(CrewListSerializer({"members": members}).data)

    @extend_schema(
        tags=["M2 - Partner crew"],
        operation_id="m2_partner_crew_add",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=CrewMemberCreateSerializer,
        description=(
            "Add a worker. **`201` for a new membership, `200` for a reinstated one**, so the UI "
            'can say "we put Ramesh back on your roster" instead of silently succeeding on a name '
            "the Partner thought was gone."
        ),
        responses={
            200: CrewMemberSerializer,
            201: CrewMemberSerializer,
            400: ApiErrorSerializer,
            403: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_capability_not_approved` when the Partner holds no approved "
                "workforce capability. The roster is not a general address book.",
            ),
            404: ApiErrorSerializer,
        },
    )
    def post(self, request: Request) -> Response:
        serializer = CrewMemberCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        actor = cast(User, request.user)
        profile = _partner_profile_or_404(request)
        key = _idempotency_key(request)

        # The roster exists from the moment a Partner holds an approved workforce capability, and
        # not before. Checked here rather than in the domain because it is an authorization rule
        # about this surface: `add_crew_to_roster` is also reachable from Operations-assisted paths
        # that legitimately predate approval.
        if not PartnerCapability.objects.filter(
            partner=profile,
            status=PartnerCapability.Status.APPROVED,
            archetype=ServiceVariant.BookingArchetype.A3_TIME_BLOCK,
        ).exists():
            _raise_api_error(CapabilityNotApprovedError())

        skills = list(Skill.objects.filter(code__in=values.get("skill_codes") or []))

        def command() -> tuple[int, dict[str, object]]:
            try:
                change = add_crew_to_roster(
                    partner=profile,
                    display_name=values["display_name"],
                    phone_e164=values["phone_e164"],
                    skills=skills,
                    is_supervisor=values.get("is_supervisor", False),
                    gender=values.get("gender", ""),
                )
            except PartnerDomainError as exc:
                _raise_api_error(exc)

            status_code = HTTPStatus.CREATED if change.was_created else HTTPStatus.OK
            return int(status_code), _crew_entry(
                profile=profile, membership_id=change.membership.id
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.crew.add",
            key=key,
            request_payload={
                "display_name": values["display_name"],
                "phone_e164": values["phone_e164"],
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)


class PartnerCrewDetailView(APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Partner crew"],
        operation_id="m2_partner_crew_update",
        request=CrewMemberUpdateSerializer,
        description=(
            "The name this agency uses, their skills, the supervisor flag and `gender`.\n\n"
            "`display_name` writes a **per-roster label** (`PartnerCrewMembership.display_name`) "
            "and never the shared `CrewMember`, so correcting a typo cannot rename the person on "
            "another agency's roster. Blank clears the override and falls back to the global "
            "record. It used to be read-only for that cross-agency reason, which left a typo "
            "unfixable: re-adding resolves by `identity_hash` and returns the same wrong name.\n\n"
            "`gender` is on the shared crew record on purpose -- a Customer's men/women split is "
            "checked against it at accept and again at assignment, so it cannot be per-roster "
            "without two agencies staffing one wedding from two answers.\n\n"
            "**It is editable whenever this Partner is the only agency holding the worker**, which "
            "is the ordinary case. The refusal exists to stop one agency flipping another's "
            "roster, so it applies only when there *is* another agency: a contradicting write is "
            "then answered `m2_crew_gender_conflict` and settled by Operations "
            "(`m2_operations_crew_gender_correct`). Clients should offer the field unconditionally "
            "and surface the refusal -- the server does not publish whether a worker is on another "
            "roster, because that is the fact `crew_roster` suppresses `crew_member_id` to hide. "
            "There is no way to clear a recorded gender; `UNDISCLOSED` is what a worker who "
            "declined to say is."
        ),
        responses={
            200: CrewMemberSerializer,
            400: ApiErrorSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_crew_gender_conflict` when another agency has this person "
                "recorded as a different gender.",
            ),
        },
    )
    def patch(self, request: Request, membership_id: uuid.UUID) -> Response:
        serializer = CrewMemberUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        profile = _partner_profile_or_404(request)
        membership = _crew_membership_or_404(profile=profile, membership_id=membership_id)

        skills = (
            list(Skill.objects.filter(code__in=values["skill_codes"]))
            if "skill_codes" in values
            else None
        )
        try:
            update_crew_member(
                membership=membership,
                skills=skills,
                is_supervisor=values.get("is_supervisor"),
                gender=values.get("gender", ""),
                display_name=values.get("display_name"),
            )
        except PartnerDomainError as exc:
            _raise_api_error(exc)
        return Response(_crew_entry(profile=profile, membership_id=membership_id))


class PartnerCrewArchiveView(APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Partner crew"],
        operation_id="m2_partner_crew_archive",
        request=None,
        description=(
            "Take a worker off this roster. "
            "**Refuses with `m2_crew_conflict` when the worker is booked on a future shift-day**, "
            "naming the dates (proposal 0013, acceptance criterion 9). Until Wave C4 built the "
            "per-stage assignment table there was nothing to read here, and archiving a name that "
            "a Customer was expecting on Thursday left the roster and the shift-day disagreeing "
            "silently. Replace them on those shifts first."
        ),
        responses={
            200: CrewMemberSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, membership_id: uuid.UUID) -> Response:
        profile = _partner_profile_or_404(request)
        membership = _crew_membership_or_404(profile=profile, membership_id=membership_id)
        try:
            archive_crew_member(membership=membership)
        except PartnerDomainError as exc:
            _raise_api_error(exc)
        return Response(_crew_entry(profile=profile, membership_id=membership_id))


class PartnerCrewDocumentView(ThrottledWriteMixin, APIView):
    """Identity evidence for one worker: declare a file, then say the bytes landed.

    The upload is a signed PUT straight to private storage — the file never passes through
    Django. Two calls rather than one because the object has to be checked *after* it exists:
    `POST` issues the grant against declared size, media type and digest, and `PUT` verifies the
    stored object matches before a reviewer can ever see it.
    """

    permission_classes = (IsAuthenticated, IsPartnerUser)
    throttle_scope = "m2_partner_registration"

    @extend_schema(
        tags=["M2 - Partner crew"],
        operation_id="m2_partner_crew_document_upload",
        request=CrewDocumentUploadRequestSerializer,
        description=(
            "Ask for somewhere to put one identity document. Returns a short-lived signed URL to "
            "`PUT` the file to, and the `document_id` to send back afterwards.\n\n"
            "Nothing is visible to a reviewer yet. Declaring metadata first is what lets "
            "`m2_partner_crew_document_submit` compare the stored object against it — a client "
            "that declares a clean PDF and uploads something else fails there, not at a "
            "reviewer's desk."
        ),
        responses={
            201: CrewDocumentUploadGrantSerializer,
            400: ApiErrorSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, membership_id: uuid.UUID) -> Response:
        serializer = CrewDocumentUploadRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        profile = _partner_profile_or_404(request)
        membership = _crew_membership_or_404(profile=profile, membership_id=membership_id)
        try:
            grant = start_crew_document_upload(
                membership=membership,
                kind=values["kind"],
                content_type=values["content_type"],
                size_bytes=values["size_bytes"],
                sha256=values["sha256"],
            )
        except PartnerDomainError as exc:
            _raise_api_error(exc)
        return Response(
            CrewDocumentUploadGrantSerializer(
                {
                    "document_id": grant.document.id,
                    "kind": grant.document.kind,
                    "upload_url": grant.signed.upload_url,
                    "upload_token": grant.signed.upload_token,
                    "expires_at": grant.document.upload_expires_at,
                    "max_bytes": settings.MAX_CREW_DOCUMENT_SIZE_BYTES,
                }
            ).data,
            status=HTTPStatus.CREATED,
        )

    @extend_schema(
        tags=["M2 - Partner crew"],
        operation_id="m2_partner_crew_document_submit",
        request=CrewDocumentSubmitSerializer,
        description=(
            "The upload finished. The stored object is streamed back through the storage boundary "
            "and its real size, media type and SHA-256 compared against what was declared; on a "
            "match the document joins the Operations review queue.\n\n"
            "**Verified rather than trusted**, because the party claiming the upload succeeded is "
            "the party that benefits from the claim. An approved earlier version is left approved "
            "until this replacement is itself approved, so re-uploading does not silently "
            "un-verify a worker who is already on next Tuesday's shift."
        ),
        responses={
            200: CrewMemberSerializer,
            400: ApiErrorSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
        },
    )
    def put(self, request: Request, membership_id: uuid.UUID) -> Response:
        serializer = CrewDocumentSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        profile = _partner_profile_or_404(request)
        membership = _crew_membership_or_404(profile=profile, membership_id=membership_id)
        try:
            submit_crew_document(
                membership=membership,
                document_id=serializer.validated_data["document_id"],
            )
        except PartnerDomainError as exc:
            _raise_api_error(exc)
        return Response(_crew_entry(profile=profile, membership_id=membership_id))


class PartnerCrewAvailabilityView(APIView):
    """A dated statement that one worker is, or is not, available (`M2-BE-107`)."""

    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Partner crew"],
        operation_id="m2_partner_crew_availability_set",
        request=CrewAvailabilityWriteSerializer,
        description=(
            "Mark one worker off, or back on, for one date. Exception-shaped rather than a weekly "
            "calendar because that is what a supervisor actually knows: the default is available, "
            "and what gets recorded is the wedding on the 14th. `assert_crew_available` refuses an "
            "assignment on a day marked unavailable, naming the person."
        ),
        responses={
            200: CrewAvailabilitySerializer,
            400: ApiErrorSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
        },
    )
    def put(self, request: Request, membership_id: uuid.UUID) -> Response:
        serializer = CrewAvailabilityWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        profile = _partner_profile_or_404(request)
        membership = _crew_membership_or_404(profile=profile, membership_id=membership_id)
        record = set_crew_availability(
            membership=membership,
            on_day=values["date"],
            is_available=values["is_available"],
            reason=values.get("reason", ""),
        )
        return Response(CrewAvailabilitySerializer(record).data)


def _crew_membership_or_404(
    *,
    profile: PartnerProfile,
    membership_id: uuid.UUID,
) -> PartnerCrewMembership:
    """Scoped to the caller's own roster. A stranger's membership is `404`, never `403`."""
    membership = PartnerCrewMembership.objects.filter(
        id=membership_id,
        partner=profile,
    ).first()
    if membership is None:
        raise NotFound("Crew member was not found.")
    return membership


def _crew_entry(*, profile: PartnerProfile, membership_id: uuid.UUID) -> dict[str, object]:
    entry = next(item for item in crew_roster(profile) if item.membership_id == membership_id)
    return cast(dict[str, object], CrewMemberSerializer(asdict(entry)).data)
