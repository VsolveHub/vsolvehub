"""Customer: requirement capture.

The draft a Customer writes, submits and reads back — creation, update, submission, the duplicate
check, the timeline and the two pre-purchase disclosure reads (A3 quote teasers, A5 vendor cards).
Attachments and clarification, which are the rest of the same capture section, are in
`clarifications`.
"""

import uuid
from dataclasses import asdict
from typing import cast

from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.models import ServiceVariant
from apps.foundation.services import execute_idempotent
from apps.identity.models import User
from apps.locations.models import Address
from apps.locations.services import check_serviceability
from apps.requirements import proposals, services
from apps.requirements.exceptions import LifecycleNotSupportedError, RequirementDomainError
from apps.requirements.models import CustomerRequirement, Proposal
from apps.requirements.selectors import (
    customer_requirements,
    requirement_for_customer,
    requirement_summary_text,
    requirement_timeline,
    vendor_cards,
)
from apps.requirements.serializers import (
    DuplicateCheckQuerySerializer,
    ProbableDuplicateListSerializer,
    QuoteTeaserListSerializer,
    RequirementCreateSerializer,
    RequirementDraftSerializer,
    RequirementSubmitSerializer,
    RequirementSubmittedSerializer,
    RequirementSummaryPageSerializer,
    RequirementSummarySerializer,
    RequirementTimelineSerializer,
    RequirementUpdateSerializer,
    VendorCardListSerializer,
)
from apps.requirements.views.base import (
    RequirementCursorPagination,
    _draft_response,
    _idempotency_key,
    _raise_api_error,
)
from common.errors.serializers import ApiErrorSerializer
from common.pagination import BoundedCursorQuerySerializer, reject_invalid_cursor_query
from common.schema import IDEMPOTENCY_KEY_HEADER


class RequirementCollectionView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Requirements"],
        operation_id="m2_requirement_list",
        parameters=[BoundedCursorQuerySerializer],
        responses={
            200: RequirementSummaryPageSerializer,
            400: ApiErrorSerializer,
            403: ApiErrorSerializer,
        },
    )
    def get(self, request: Request) -> Response:
        reject_invalid_cursor_query(request)
        queryset = customer_requirements(cast(User, request.user))
        paginator = RequirementCursorPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(RequirementSummarySerializer(page, many=True).data)

    @extend_schema(
        tags=["M2 - Requirements"],
        operation_id="m2_requirement_create",
        request=RequirementCreateSerializer,
        responses={
            200: OpenApiResponse(
                response=RequirementDraftSerializer,
                description="The Customer already had an editable draft for this service; the "
                "same draft is returned so the client can resume it.",
            ),
            201: RequirementDraftSerializer,
            400: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_lifecycle_not_supported` when the service has no active A3/A5 "
                "configuration. The Customer sees 'we do not cover this yet' and a route back to "
                "the catalog, not a validation error on a field they cannot see.",
            ),
            403: ApiErrorSerializer,
        },
    )
    def post(self, request: Request) -> Response:
        serializer = RequirementCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        variant = get_object_or_404(
            ServiceVariant.objects.select_related("service"),
            id=serializer.validated_data["variant_id"],
            is_active=True,
        )
        try:
            requirement, created = services.get_or_create_draft(
                customer=cast(User, request.user),
                variant=variant,
                answers=serializer.validated_data.get("answers") or {},
                language=serializer.validated_data["language"],
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        return _draft_response(
            requirement,
            http_status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class RequirementDetailView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Requirements"],
        operation_id="m2_requirement_read",
        responses={200: RequirementDraftSerializer, 404: ApiErrorSerializer},
    )
    def get(self, request: Request, requirement_id: uuid.UUID) -> Response:
        try:
            requirement = requirement_for_customer(
                customer=cast(User, request.user),
                requirement_id=requirement_id,
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        return _draft_response(requirement)

    @extend_schema(
        tags=["M2 - Requirements"],
        operation_id="m2_requirement_update",
        request=RequirementUpdateSerializer,
        responses={
            200: RequirementDraftSerializer,
            400: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_requirement_locked` once the requirement has left DRAFT and "
                "vendors have seen it.",
            ),
        },
    )
    def patch(self, request: Request, requirement_id: uuid.UUID) -> Response:
        serializer = RequirementUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        customer = cast(User, request.user)

        try:
            requirement = requirement_for_customer(
                customer=customer,
                requirement_id=requirement_id,
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)

        address: Address | None = None
        service_area = None
        if values.get("address_id") is not None:
            # Scoped to the caller's own addresses: an address id is guessable, and resolving one
            # the Customer does not own would attach a stranger's location to a live requirement.
            address = get_object_or_404(
                Address,
                id=values["address_id"],
                customer=customer,
                archived_at__isnull=True,
            )
            # The same serviceability check the A1 cart uses, so the two cannot disagree about
            # which area covers a postal code.
            decision = check_serviceability(
                postal_code=address.postal_code,
                variant_id=requirement.variant_id,
            )
            service_area = decision.service_area

        try:
            requirement = services.update_draft(
                requirement=requirement,
                answers=values.get("answers"),
                address=address,
                service_area=service_area,
                requested_start=values.get("requested_start"),
                flexibility_days=values.get("flexibility_days"),
                service_by=values.get("service_by"),
                budget_min_paise=values.get("budget_min_paise"),
                budget_max_paise=values.get("budget_max_paise"),
                additional_details=values.get("additional_details"),
                language=values.get("language"),
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        return _draft_response(requirement)


class RequirementSubmitView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Requirements"],
        operation_id="m2_requirement_submit",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=RequirementSubmitSerializer,
        responses={
            202: RequirementSubmittedSerializer,
            400: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_requirement_duplicate` (show the duplicate and offer a merge "
                "before allowing `allow_duplicate`), `m2_requirement_expired`, or "
                "`idempotency_in_progress` — wait and re-read, never resend under a new key.",
            ),
        },
    )
    def post(self, request: Request, requirement_id: uuid.UUID) -> Response:
        serializer = RequirementSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        customer = cast(User, request.user)
        key = _idempotency_key(request)

        try:
            requirement = requirement_for_customer(
                customer=customer,
                requirement_id=requirement_id,
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)

        def command() -> tuple[int, dict[str, object]]:
            try:
                submitted = services.submit_requirement(
                    requirement=requirement,
                    actor=customer,
                    allow_duplicate=serializer.validated_data["allow_duplicate"],
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)

            body = RequirementSubmittedSerializer(
                {
                    "id": submitted.id,
                    "status": submitted.status,
                    "service_by": submitted.service_by,
                    "quote_delivery_deadline_at": submitted.quotes_due_at,
                    # Read from the server that enforces it. A hardcoded `true` in a screen is a
                    # promise that outlives the policy it describes.
                    "is_free": True,
                    "server_now": timezone.now(),
                }
            ).data
            return status.HTTP_202_ACCEPTED, cast(dict[str, object], body)

        result = execute_idempotent(
            actor=customer,
            operation="m2.requirement.submit",
            key=key,
            request_payload={
                "requirement_id": str(requirement_id),
                "allow_duplicate": serializer.validated_data["allow_duplicate"],
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)


class RequirementDuplicateCheckView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Requirements"],
        operation_id="m2_requirement_duplicate_check",
        parameters=[DuplicateCheckQuerySerializer],
        responses={200: ProbableDuplicateListSerializer, 400: ApiErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        query = DuplicateCheckQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        customer = cast(User, request.user)

        variant = get_object_or_404(
            ServiceVariant, id=query.validated_data["variant_id"], is_active=True
        )
        address = get_object_or_404(
            Address, id=query.validated_data["address_id"], customer=customer
        )
        match = services.find_probable_duplicate(
            customer=customer,
            variant=variant,
            address=address,
            requested_start=query.validated_data["requested_start"],
        )

        duplicates: list[dict[str, object]] = []
        if match is not None:
            existing = CustomerRequirement.objects.select_related("variant__service").get(
                pk=match.requirement_id
            )
            duplicates.append(
                {
                    "id": existing.id,
                    "created_at": existing.created_at,
                    "summary": requirement_summary_text(existing),
                    "status": existing.status,
                    "mergeable": existing.status in CustomerRequirement.LIVE_STATUSES,
                }
            )
        return Response(ProbableDuplicateListSerializer({"probable_duplicates": duplicates}).data)


class RequirementTimelineView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Requirements"],
        operation_id="m2_requirement_timeline",
        responses={200: RequirementTimelineSerializer, 404: ApiErrorSerializer},
    )
    def get(self, request: Request, requirement_id: uuid.UUID) -> Response:
        try:
            requirement = requirement_for_customer(
                customer=cast(User, request.user),
                requirement_id=requirement_id,
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        return Response(
            RequirementTimelineSerializer(
                {
                    "events": requirement_timeline(requirement),
                    "server_now": timezone.now(),
                }
            ).data
        )


class RequirementTeaserListView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Quotes"],
        operation_id="m2_quote_teaser_list",
        description=(
            "Pre-unlock quote teasers. This payload is sent to a Customer who has paid nothing, "
            "so vendor name, contact, scope, line items and the exact total are absent from the "
            "response — not merely unrendered."
        ),
        responses={200: QuoteTeaserListSerializer, 404: ApiErrorSerializer},
    )
    def get(self, request: Request, requirement_id: uuid.UUID) -> Response:
        try:
            requirement = requirement_for_customer(
                customer=cast(User, request.user),
                requirement_id=requirement_id,
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)

        teasers = proposals.teasers_for(requirement)
        usable = [teaser for teaser in teasers if teaser.usability == Proposal.Usability.USABLE]
        payload = [
            {
                "proposal_id": teaser.proposal_id,
                "vendor_type": teaser.vendor_type,
                "is_verified": teaser.is_verified,
                "price_band_low_paise": teaser.price_band_low_paise,
                "price_band_high_paise": teaser.price_band_high_paise,
                "is_out_of_budget": teaser.usability == Proposal.Usability.OUT_OF_BUDGET,
            }
            for teaser in teasers
        ]
        return Response(
            QuoteTeaserListSerializer(
                {
                    "teasers": payload,
                    "usable_quote_count": len(usable),
                    # Fee after value, in one expression: the unlock is offered only once a quote
                    # worth unlocking exists. The unlock command re-checks this in BE4; a client
                    # holding a stale `true` still cannot buy.
                    "unlock_available": bool(usable),
                    "server_now": timezone.now(),
                }
            ).data
        )


class RequirementVendorCardListView(APIView):
    """The A5 responding pool, on the disclosure ladder (`M2-FE-419`)."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Access"],
        operation_id="m2_vendor_card_list",
        description=(
            "The professionals responding to one A5 request. **A5 only** — an A3 request's "
            "pre-unlock surface is the quote teaser, and a second one would be a way around the "
            "unlock.\n\n"
            "The ladder, exactly: verification badge, vendor type and a coarse distance band for "
            "every responding vendor; the vendor's **name once they have committed to a visit "
            "slot**, because somebody entering a home has to be nameable; and **no contact "
            "details at any status**, which the engagement releases and the plan fee does not.\n\n"
            "`distance_band_km` is the 5 km band the matcher ranked on, read back from the "
            "invitation's own provenance rather than recomputed, and is `null` when we have no "
            "fresh position for that vendor — the ordinary case for an agency that never runs the "
            "technician app. **No rating is published**: this platform has no review model, and a "
            "number with nothing behind it is worse than none."
        ),
        responses={
            200: VendorCardListSerializer,
            400: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_lifecycle_not_supported` on an A3 request.",
            ),
            404: ApiErrorSerializer,
        },
    )
    def get(self, request: Request, requirement_id: uuid.UUID) -> Response:
        try:
            requirement = requirement_for_customer(
                customer=cast(User, request.user),
                requirement_id=requirement_id,
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)

        if requirement.archetype != ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT:
            _raise_api_error(
                LifecycleNotSupportedError(
                    "Workforce requests show quote teasers rather than professional cards.",
                )
            )

        return Response(
            VendorCardListSerializer(
                {
                    "vendor_cards": [asdict(card) for card in vendor_cards(requirement)],
                    "server_now": timezone.now(),
                }
            ).data
        )
