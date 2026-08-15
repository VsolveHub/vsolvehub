"""M2 (proposal 0013): the Partner registration surface.

The business profile, the capability options list and the capability lifecycle a Partner drives
themselves (request, submit, withdraw), the worker-insurance declaration, the progressive gate list
and the declared working languages. The crew roster half of the same wave lives in `m2_crew`.
"""

import uuid
from dataclasses import asdict
from http import HTTPStatus
from typing import cast

from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.models import ServiceVariant
from apps.foundation.services import execute_idempotent
from apps.identity.models import User
from apps.locations.models import ServiceArea
from apps.partners.capabilities import (
    declare_insurance,
    gate_states,
    live_insurance_declaration,
    request_capability,
    set_partner_languages,
    submit_capability_for_review,
    transition_capability,
    upsert_business_profile,
)
from apps.partners.capability_options import (
    BUSINESS_TYPE_OPTIONS,
    capability_options,
    capability_records,
)
from apps.partners.exceptions import PartnerDomainError
from apps.partners.gates import GATE_BLOCKS, GATE_COPY, GateState
from apps.partners.models import PartnerCapability, PartnerLanguage, PartnerProfile
from apps.partners.permissions import IsPartnerUser
from apps.partners.selectors import partner_profile_for_user
from apps.partners.serializers import (
    CapabilityOptionsSerializer,
    CapabilityRequestSerializer,
    CapabilitySubmitSerializer,
    PartnerBusinessProfileSerializer,
    PartnerBusinessProfileWriteSerializer,
    PartnerCapabilityListSerializer,
    PartnerCapabilitySerializer,
    PartnerInsuranceSerializer,
    PartnerInsuranceWriteSerializer,
    PartnerLanguageListSerializer,
    PartnerLanguageWriteSerializer,
    ProgressiveGateListSerializer,
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

# ---------------------------------------------------------------------------
# M2 (proposal 0013): the registration surface
#
# Thin, like the rest of this file. Every view below authorises the actor, resolves records the
# caller owns, calls one command in `apps.partners.capabilities` and translates a refusal. The
# domain here was built and tested on 10 August; until now none of it was reachable.
#
# Object-level authorization is per record. A capability or membership belonging to another Partner
# answers `404`, never `403`.
# ---------------------------------------------------------------------------


def _unmet_gates() -> list[dict[str, object]]:
    """Every gate, unsatisfied, for a caller with no Partner profile yet.

    Built from the same `GATE_COPY` table `gate_states` reads, so the sentences an account sees
    before it exists are the sentences it sees afterwards.
    """
    return [
        asdict(
            GateState(
                gate=gate,
                is_satisfied=False,
                blocks=GATE_BLOCKS[gate],
                reason=reason,
                next_action=next_action,
            )
        )
        for gate, reason, next_action in GATE_COPY.values()
    ]


class PartnerBusinessProfileView(APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Partner registration"],
        operation_id="m2_partner_business_profile_read",
        description=(
            "The Partner's business identity. **`404` when none exists, and that is the ordinary "
            "state for every M1 Partner** — the client renders the individual default and offers "
            "the step rather than showing an error."
        ),
        responses={
            200: PartnerBusinessProfileSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
        },
    )
    def get(self, request: Request) -> Response:
        profile = _partner_profile_or_404(request)
        business = getattr(profile, "business_profile", None)
        if business is None:
            raise NotFound("No business profile has been declared.")
        return Response(PartnerBusinessProfileSerializer(business).data)

    @extend_schema(
        tags=["M2 - Partner registration"],
        operation_id="m2_partner_business_profile_replace",
        description=(
            "Create or replace. A `PUT` rather than a `PATCH` because the three business types "
            "have genuinely different required fields, and a partial update is how a Partner "
            "switching "
            "from agency to individual keeps a registration number the database forbids."
        ),
        request=PartnerBusinessProfileWriteSerializer,
        responses={
            200: PartnerBusinessProfileSerializer,
            400: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_business_type_invalid` for a registration number on an "
                "`INDIVIDUAL`, or a GSTIN without `gst_registered`. Both are model constraints.",
            ),
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
        },
    )
    def put(self, request: Request) -> Response:
        serializer = PartnerBusinessProfileWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        profile = _partner_profile_or_404(request)
        try:
            business = upsert_business_profile(
                partner=profile,
                business_type=values["business_type"],
                legal_name=values.get("legal_name", ""),
                registration_number=values.get("registration_number", ""),
                gst_registered=values.get("gst_registered", False),
                gstin=values.get("gstin", ""),
                years_in_operation=values.get("years_in_operation", 0),
                upi_vpa=values.get("upi_vpa", ""),
            )
        except PartnerDomainError as exc:
            _raise_api_error(exc)
        return Response(PartnerBusinessProfileSerializer(business).data)


class PartnerCapabilityOptionListView(APIView):
    """What this Partner may ask to be considered for.

    `IsPartnerUser` and nothing more. This answers for an account with no application, no documents
    and no approved capability — that is the account the screen exists for, and a gate here would
    break the flow-weight budget `M2-FE-101` sets from the server side.
    """

    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Partner registration"],
        operation_id="m2_partner_capability_option_list",
        description=(
            "Business types with their consequences, and the lifecycle capabilities open for "
            "request. All copy is server-authored: `lifecycle_explanation` is the sentence that "
            "decides whether a Partner understands what they are signing up to, and `asks_for` "
            "names the fields one form should render so the client needs no archetype branch."
        ),
        responses={200: CapabilityOptionsSerializer, 403: ApiErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        profile = _partner_profile_or_none(request)
        options = [asdict(option) for option in capability_options(profile)] if profile else []
        return Response(
            CapabilityOptionsSerializer(
                {
                    # Catalog copy that does not depend on the caller, so it is published even
                    # to an account with no profile yet — the account deciding which type it is.
                    "business_types": [
                        {"value": value, "label": label, "consequence": consequence}
                        for value, label, consequence in BUSINESS_TYPE_OPTIONS
                    ],
                    "capabilities": options,
                    "server_now": timezone.now(),
                }
            ).data
        )


class PartnerCapabilityCollectionView(ThrottledWriteMixin, APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)
    throttle_scope = "m2_partner_registration"

    @extend_schema(
        tags=["M2 - Partner registration"],
        operation_id="m2_partner_capability_list",
        description=(
            "Every capability this Partner holds, in any status. **This is the read that tells "
            '"not applied" from "under review" from "suspended"** — an empty workspace-grant list '
            "cannot, and inferring a review banner from one would show it to every existing M1 "
            "Partner. `REJECTED` is Operations' refusal; `WITHDRAWN` is the Partner's own exit."
        ),
        responses={200: PartnerCapabilityListSerializer, 403: ApiErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        profile = _partner_profile_or_none(request)
        records = [asdict(record) for record in capability_records(profile)] if profile else []
        return Response(
            PartnerCapabilityListSerializer(
                {"capabilities": records, "server_now": timezone.now()}
            ).data
        )

    @extend_schema(
        tags=["M2 - Partner registration"],
        operation_id="m2_partner_capability_request",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=CapabilityRequestSerializer,
        responses={
            201: PartnerCapabilitySerializer,
            400: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_lifecycle_not_supported` when the variant carries no A3/A5 "
                'archetype. Show "we do not cover this yet" and return to the options list, not a '
                "field error. `m2_business_type_invalid` when the registration answers do not "
                "satisfy the variant's published question schema, or when a requested service area "
                "is not one the Partner works in — the capability can only narrow their coverage, "
                "never add to it.",
            ),
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_capability_already_requested` when a live request exists for this "
                'variant — the recovery is "open the one you have", not "try something else". '
                "`idempotency_in_progress` means wait and re-read, never resend under a new key.",
            ),
        },
    )
    def post(self, request: Request) -> Response:
        serializer = CapabilityRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        actor = cast(User, request.user)
        profile = _partner_profile_or_404(request)
        key = _idempotency_key(request)
        variant = get_object_or_404(
            ServiceVariant.objects.select_related("service"),
            id=values["variant_id"],
            is_active=True,
        )
        area_ids = list(values.get("service_area_ids") or [])
        # Resolved here rather than in the command so an unknown id is a `404` on the id the caller
        # sent, not a domain refusal about coverage they never asked for.
        areas = list(ServiceArea.objects.filter(id__in=area_ids)) if area_ids else []
        if len(areas) != len(set(area_ids)):
            raise NotFound("One of those service areas was not found.")

        def command() -> tuple[int, dict[str, object]]:
            try:
                capability = request_capability(
                    partner=profile,
                    variant=variant,
                    max_crew_size=values.get("max_crew_size"),
                    max_project_value_paise=values.get("max_project_value_paise"),
                    service_areas=areas,
                    registration_answers=values.get("registration_answers") or {},
                )
            except PartnerDomainError as exc:
                _raise_api_error(exc)

            return HTTPStatus.CREATED, cast(
                dict[str, object],
                PartnerCapabilitySerializer(
                    _capability_record(profile=profile, capability_id=capability.id)
                ).data,
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.capability.request",
            key=key,
            request_payload={
                "variant_id": str(values["variant_id"]),
                "service_area_ids": sorted(str(area_id) for area_id in area_ids),
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)


class PartnerCapabilitySubmitView(ThrottledWriteMixin, APIView):
    """The Partner's own submit and resubmit (`M2-BE-110`).

    The button that was missing. Until now a capability sitting in `CHANGES_REQUIRED` could only be
    moved by Operations, so a Partner who fixed exactly what was asked had no way to say so and
    the correction cycle depended on somebody noticing. Reaching `UNDER_REVIEW` from `REQUESTED` is
    the first submit and from `CHANGES_REQUIRED` the resubmit; they are one command because they
    are one act.
    """

    permission_classes = (IsAuthenticated, IsPartnerUser)
    throttle_scope = "m2_partner_registration"

    @extend_schema(
        tags=["M2 - Partner registration"],
        operation_id="m2_partner_capability_submit",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=CapabilitySubmitSerializer,
        responses={
            200: PartnerCapabilitySerializer,
            400: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_business_type_invalid` when the registration answers do not "
                "satisfy the variant's published question schema.",
            ),
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_capability_transition_not_allowed` from any status other than "
                "`REQUESTED` or `CHANGES_REQUIRED`. A capability already `UNDER_REVIEW` returns "
                "`200` unchanged rather than refusing — resubmitting is not an error.",
            ),
        },
    )
    def post(self, request: Request, capability_id: uuid.UUID) -> Response:
        serializer = CapabilitySubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        answers = serializer.validated_data.get("registration_answers")
        actor = cast(User, request.user)
        profile = _partner_profile_or_404(request)
        key = _idempotency_key(request)
        capability = PartnerCapability.objects.filter(id=capability_id, partner=profile).first()
        if capability is None:
            raise NotFound("Capability was not found.")

        def command() -> tuple[int, dict[str, object]]:
            try:
                submit_capability_for_review(
                    capability_id=capability.id,
                    actor=actor,
                    registration_answers=answers,
                )
            except PartnerDomainError as exc:
                _raise_api_error(exc)

            return HTTPStatus.OK, cast(
                dict[str, object],
                PartnerCapabilitySerializer(
                    _capability_record(profile=profile, capability_id=capability.id)
                ).data,
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.capability.submit",
            key=key,
            request_payload={"capability_id": str(capability_id)},
            command=command,
        )
        return Response(result.body, status=result.status_code)


class PartnerCapabilityWithdrawView(ThrottledWriteMixin, APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)
    throttle_scope = "m2_partner_registration"

    @extend_schema(
        tags=["M2 - Partner registration"],
        operation_id="m2_partner_capability_withdraw",
        request=None,
        description=(
            "The Partner's own exit. Distinct from Operations' `REJECTED` refusal, which the "
            "Partner cannot cause and this route cannot reach. Neither status blocks a fresh "
            "request for the same variant."
        ),
        responses={
            200: PartnerCapabilitySerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, capability_id: uuid.UUID) -> Response:
        profile = _partner_profile_or_404(request)
        capability = PartnerCapability.objects.filter(id=capability_id, partner=profile).first()
        if capability is None:
            raise NotFound("Capability was not found.")
        try:
            transition_capability(
                capability_id=capability.id,
                to_status=PartnerCapability.Status.WITHDRAWN,
                actor=cast(User, request.user),
                reason_code="partner_withdrew",
            )
        except PartnerDomainError as exc:
            _raise_api_error(exc)
        return Response(
            PartnerCapabilitySerializer(
                _capability_record(profile=profile, capability_id=capability.id)
            ).data
        )


class PartnerInsuranceView(APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Partner registration"],
        operation_id="m2_partner_insurance_read",
        description=(
            "The worker-insurance declaration in force today. **`404` when none is declared, which "
            "is the ordinary state and not an error.** `verified_at` is read-only and set only by "
            "Operations: a client must render an unverified declaration as *declared*, never as "
            "*insured*, because the difference is who carries the liability if a worker is hurt."
        ),
        responses={
            200: PartnerInsuranceSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
        },
    )
    def get(self, request: Request) -> Response:
        profile = _partner_profile_or_404(request)
        declaration = live_insurance_declaration(profile)
        if declaration is None:
            raise NotFound("No insurance declaration is on record.")
        return Response(PartnerInsuranceSerializer(declaration).data)

    @extend_schema(
        tags=["M2 - Partner registration"],
        operation_id="m2_partner_insurance_replace",
        request=PartnerInsuranceWriteSerializer,
        description=(
            "Declare or replace. A replacement clears `verified_at`: swapping a checked policy for "
            "an unchecked one must not keep the badge."
        ),
        responses={
            200: PartnerInsuranceSerializer,
            400: ApiErrorSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
        },
    )
    def put(self, request: Request) -> Response:
        serializer = PartnerInsuranceWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        profile = _partner_profile_or_404(request)
        try:
            declaration = declare_insurance(
                partner=profile,
                insurer_name=values["insurer_name"],
                policy_reference=values["policy_reference"],
                coverage_paise=values["coverage_paise"],
                covers_workmen_compensation=values.get("covers_workmen_compensation", False),
                valid_from=values["valid_from"],
                valid_to=values["valid_to"],
            )
        except PartnerDomainError as exc:
            _raise_api_error(exc)
        return Response(PartnerInsuranceSerializer(declaration).data)


class PartnerGateListView(APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Partner registration"],
        operation_id="m2_partner_gate_list",
        description=(
            "The three progressive gates, each with the reason it is being asked for and the one "
            "action that clears it. **Advisory**: the commands enforce these at the moment they "
            "run, and this read only decides what the UI explains beforehand. A client treating it "
            "as authoritative would block somebody whose KYC completed thirty seconds ago. "
            "`blocks` names actions, never screens — an unsatisfied gate never hides demand."
        ),
        responses={200: ProgressiveGateListSerializer, 403: ApiErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        profile = _partner_profile_or_none(request)
        # No profile means no gate is satisfied, which is the truth rather than a refusal: nothing
        # has been proved, and this screen's job is to say which three things will be asked for.
        gates = [asdict(gate) for gate in gate_states(profile)] if profile else _unmet_gates()
        return Response(
            ProgressiveGateListSerializer({"gates": gates, "server_now": timezone.now()}).data
        )


class PartnerLanguageView(APIView):
    """The languages this vendor can actually work in (`M2-BE-301`).

    Eligibility input, not profile decoration. A requirement carries the language its answers and
    voice note are in, and sending it to a vendor who cannot read it produces a silent non-response
    that looks exactly like a dead account. **Declaring nothing is not a mismatch** — matching only
    excludes on a declaration that contradicts the requirement, so no existing Partner is dropped
    from a pool for never having filled this in.
    """

    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Partner registration"],
        operation_id="m2_partner_language_list",
        responses={200: PartnerLanguageListSerializer, 403: ApiErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        profile = partner_profile_for_user(cast(User, request.user))
        tags = (
            sorted(
                PartnerLanguage.objects.filter(partner=profile, is_active=True).values_list(
                    "language_tag", flat=True
                )
            )
            if profile is not None
            else []
        )
        return Response(PartnerLanguageListSerializer({"language_tags": tags}).data)

    @extend_schema(
        tags=["M2 - Partner registration"],
        operation_id="m2_partner_language_set",
        request=PartnerLanguageWriteSerializer,
        description=(
            "Replace the whole set. A merge would make removing a language impossible from the "
            "only screen that edits them. Tags are compared on their primary subtag, so `te-IN` "
            "and `te` are one language."
        ),
        responses={200: PartnerLanguageListSerializer, 400: ApiErrorSerializer},
    )
    def put(self, request: Request) -> Response:
        serializer = PartnerLanguageWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        profile = _partner_profile_or_404(request)
        rows = set_partner_languages(
            partner=profile,
            language_tags=serializer.validated_data["language_tags"],
        )
        return Response(
            PartnerLanguageListSerializer(
                {"language_tags": sorted(row.language_tag for row in rows)}
            ).data
        )


def _capability_record(
    *,
    profile: PartnerProfile,
    capability_id: uuid.UUID,
) -> dict[str, object]:
    """One capability as a serializer-ready dict.

    Read back through `capability_records` rather than serialized from the model directly, so the
    write paths and the list read publish the same shape. A second projection for the response of a
    command is how a created record and a listed record start disagreeing.
    """
    record = next(item for item in capability_records(profile) if item.id == capability_id)
    return asdict(record)
