"""Partner: enquiries, and the site-visit routes both roles share.

A vendor's inbox — the invitation list, its detail, accept, decline, a question, the Customer's
attachments while the slot is held, and the request for a paid site visit — followed by the two
site-visit routes that resolve by participation rather than by role. The banner that introduced
those is carried below, where they start.
"""

import uuid
from typing import cast

from django.utils import timezone
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.foundation.services import execute_idempotent
from apps.identity.models import User
from apps.partners.capabilities import assert_capability_active, assert_kyc_complete
from apps.partners.exceptions import PartnerDomainError
from apps.partners.permissions import IsPartnerUser
from apps.requirements import attachments, matching, proposals
from apps.requirements.exceptions import RequirementDomainError, RequirementNotFoundError
from apps.requirements.models import SiteVisit
from apps.requirements.selectors import (
    invitation_for_partner,
    partner_invitations,
    site_visit_for_participant,
)
from apps.requirements.serializers import (
    EnquiryDeclineSerializer,
    EnquiryDetailSerializer,
    EnquirySummaryPageSerializer,
    EnquirySummarySerializer,
    QuestionCreateSerializer,
    RequirementQuestionSerializer,
    SiteVisitCompleteSerializer,
    SiteVisitRequestSerializer,
    SiteVisitScheduleSerializer,
    SiteVisitSerializer,
    VendorAttachmentListSerializer,
)
from apps.requirements.views.base import (
    EnquiryCursorPagination,
    _idempotency_key,
    _partner_profile,
    _raise_api_error,
)
from common.errors.serializers import ApiErrorSerializer
from common.pagination import BoundedCursorQuerySerializer, reject_invalid_cursor_query
from common.schema import IDEMPOTENCY_KEY_HEADER
from common.throttling import ThrottledWriteMixin


class PartnerEnquiryCollectionView(APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Partner enquiries"],
        operation_id="m2_partner_enquiry_list",
        parameters=[BoundedCursorQuerySerializer],
        responses={
            200: EnquirySummaryPageSerializer,
            400: ApiErrorSerializer,
            403: ApiErrorSerializer,
        },
    )
    def get(self, request: Request) -> Response:
        reject_invalid_cursor_query(request)
        try:
            profile = _partner_profile(request)
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        queryset = partner_invitations(profile)
        paginator = EnquiryCursorPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(EnquirySummarySerializer(page, many=True).data)


class PartnerEnquiryDetailView(APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Partner enquiries"],
        operation_id="m2_partner_enquiry_read",
        responses={200: EnquiryDetailSerializer, 403: ApiErrorSerializer, 404: ApiErrorSerializer},
    )
    def get(self, request: Request, invitation_id: uuid.UUID) -> Response:
        try:
            invitation = invitation_for_partner(
                partner=_partner_profile(request),
                invitation_id=invitation_id,
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        return Response(EnquiryDetailSerializer(invitation).data)


class PartnerEnquiryAcceptView(ThrottledWriteMixin, APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)
    throttle_scope = "m2_partner_response"

    @extend_schema(
        tags=["M2 - Partner enquiries"],
        operation_id="m2_partner_enquiry_accept",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=None,
        responses={
            200: EnquiryDetailSerializer,
            403: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_kyc_required` — identity verification is gated here, at the "
                "first accept, rather than at registration. `m2_capability_not_approved` and "
                "`m2_capability_suspended` when the lifecycle capability is not live.",
            ),
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_invitation_expired`, `m2_invitation_slots_exhausted`, "
                "`m2_proposal_slot_conflict` when a linked account already holds a slot, or "
                "`m2_capacity_unavailable` when the vendor already has work booked on these "
                "dates — either another M2 enquiry they accepted or an A1 booking on the shared "
                "availability grid.",
            ),
        },
    )
    def post(self, request: Request, invitation_id: uuid.UUID) -> Response:
        key = _idempotency_key(request)
        actor = cast(User, request.user)
        try:
            profile = _partner_profile(request)
            invitation = invitation_for_partner(partner=profile, invitation_id=invitation_id)
            # The progressive-registration gate fires at the moment it becomes necessary. A
            # Partner browses masked demand freely; proving who they are is the price of taking
            # a slot away from another vendor, not the price of looking.
            assert_kyc_complete(profile)
            requirement = invitation.requirement
            assert_capability_active(
                partner=profile,
                variant=requirement.variant,
                # Coverage and calendar are checked here, at the moment a slot is taken, rather
                # than only when the wave was built. A vendor's areas and days off move between
                # the two, and the invitation is the point where a stale answer costs a Customer
                # a quote slot.
                service_area=requirement.service_area,
                on_day=(
                    requirement.requested_start.date()
                    if requirement.requested_start is not None
                    else None
                ),
            )
        except (RequirementDomainError, PartnerDomainError) as exc:
            _raise_api_error(exc)

        def command() -> tuple[int, dict[str, object]]:
            try:
                accepted = matching.accept_invitation(invitation_id=invitation.id)
            except RequirementDomainError as exc:
                _raise_api_error(exc)

            return status.HTTP_200_OK, cast(
                dict[str, object], EnquiryDetailSerializer(accepted).data
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.enquiry.accept",
            key=key,
            request_payload={"invitation_id": str(invitation_id)},
            command=command,
        )
        return Response(result.body, status=result.status_code)


class PartnerEnquiryDeclineView(ThrottledWriteMixin, APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)
    throttle_scope = "m2_partner_response"

    @extend_schema(
        tags=["M2 - Partner enquiries"],
        operation_id="m2_partner_enquiry_decline",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=EnquiryDeclineSerializer,
        responses={
            200: EnquiryDetailSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, invitation_id: uuid.UUID) -> Response:
        serializer = EnquiryDeclineSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        key = _idempotency_key(request)
        actor = cast(User, request.user)
        try:
            invitation = invitation_for_partner(
                partner=_partner_profile(request),
                invitation_id=invitation_id,
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)

        def command() -> tuple[int, dict[str, object]]:
            try:
                declined = matching.decline_invitation(
                    invitation_id=invitation.id,
                    reason_code=serializer.validated_data["reason_code"],
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)

            return status.HTTP_200_OK, cast(
                dict[str, object], EnquiryDetailSerializer(declined).data
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.enquiry.decline",
            key=key,
            request_payload={
                "invitation_id": str(invitation_id),
                **serializer.validated_data,
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)


class PartnerEnquiryQuestionView(ThrottledWriteMixin, APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)
    throttle_scope = "m2_clarification"

    @extend_schema(
        tags=["M2 - Partner enquiries"],
        operation_id="m2_partner_enquiry_question_create",
        request=QuestionCreateSerializer,
        responses={
            201: RequirementQuestionSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, invitation_id: uuid.UUID) -> Response:
        serializer = QuestionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            invitation = invitation_for_partner(
                partner=_partner_profile(request),
                invitation_id=invitation_id,
            )
            question = proposals.ask_question(
                invitation_id=invitation.id,
                asked_by=cast(User, request.user),
                question=serializer.validated_data["question"],
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        return Response(
            RequirementQuestionSerializer(question).data,
            status=status.HTTP_201_CREATED,
        )


class PartnerEnquiryAttachmentListView(APIView):
    """The Customer's site photographs, for one vendor, while they are still entitled to them."""

    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Partner enquiries"],
        operation_id="m2_partner_enquiry_attachment_list",
        description=(
            "Short-lived signed links to the requirement's **checked** attachments. Access lasts "
            "as long as the invitation holds a quote slot, and ends when it is declined, expired "
            "or withdrawn — only the selected vendor keeps it. Expiry is reported as "
            "`has_access: false` on a `200`, not as an error: the vendor still owns their enquiry "
            "record, and an empty list without that flag would read as 'the Customer attached "
            "nothing'. No link is minted once access has lapsed, because a signed URL is a bearer "
            "credential and hiding a button is not revocation."
        ),
        responses={
            200: VendorAttachmentListSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            503: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_attachment_unavailable` when the storage adapter is down.",
            ),
        },
    )
    def get(self, request: Request, invitation_id: uuid.UUID) -> Response:
        try:
            invitation = invitation_for_partner(
                partner=_partner_profile(request),
                invitation_id=invitation_id,
            )
            access = attachments.vendor_attachments(invitation=invitation)
        except RequirementDomainError as exc:
            _raise_api_error(exc)

        return Response(
            VendorAttachmentListSerializer(
                {
                    "has_access": access.has_access,
                    "attachments": [
                        {
                            "id": granted.attachment.id,
                            "kind": granted.attachment.kind,
                            "size_bytes": granted.attachment.size_bytes,
                            "language": granted.attachment.transcript_language,
                            "download_url": granted.download_url,
                            "expires_at": granted.expires_at,
                        }
                        for granted in access.attachments
                    ],
                    "server_now": timezone.now(),
                }
            ).data
        )


class PartnerEnquirySiteVisitView(APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Partner enquiries"],
        operation_id="m2_partner_site_visit_request",
        description=(
            "Request a paid site visit. The fee is what makes a vendor willing to travel before "
            "winning the job; free visits are not offered. Charging the fee is not built until "
            "BE4 — this records the request and its fee."
        ),
        request=SiteVisitRequestSerializer,
        responses={
            201: SiteVisitSerializer,
            400: ApiErrorSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, invitation_id: uuid.UUID) -> Response:
        serializer = SiteVisitRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            invitation = invitation_for_partner(
                partner=_partner_profile(request),
                invitation_id=invitation_id,
            )
            visit = proposals.request_site_visit(
                invitation_id=invitation.id,
                fee_paise=serializer.validated_data["fee_paise"],
                adjusts_against_final_price=serializer.validated_data[
                    "adjusts_against_final_price"
                ],
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        return Response(SiteVisitSerializer(visit).data, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# Site visits, shared by both roles
#
# A visit has two participants and both need to move it, so these routes sit outside the
# `partner/` and `requirements/` prefixes and resolve by participation rather than by role. Wave C0
# published `request_site_visit` only, which left a paid visit that could be asked for and never
# scheduled or closed.
# ---------------------------------------------------------------------------


class SiteVisitScheduleView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Site visits"],
        operation_id="m2_site_visit_schedule",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        description=(
            "Put a time on a requested visit, or move one already scheduled. Either party may "
            "call it: the vendor proposes a slot they can travel in, the Customer confirms a time "
            "somebody will be on site, and neither can do it alone."
        ),
        request=SiteVisitScheduleSerializer,
        responses={
            200: SiteVisitSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_requirement_transition_not_allowed` once the visit is completed "
                "or cancelled.",
            ),
        },
    )
    def post(self, request: Request, site_visit_id: uuid.UUID) -> Response:
        serializer = SiteVisitScheduleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        actor = cast(User, request.user)
        key = _idempotency_key(request)

        try:
            visit = site_visit_for_participant(user=actor, site_visit_id=site_visit_id)
        except RequirementDomainError as exc:
            _raise_api_error(exc)

        def command() -> tuple[int, dict[str, object]]:
            try:
                scheduled = proposals.schedule_site_visit(
                    site_visit_id=visit.id,
                    scheduled_for=serializer.validated_data["scheduled_for"],
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)

            return status.HTTP_200_OK, cast(dict[str, object], SiteVisitSerializer(scheduled).data)

        result = execute_idempotent(
            actor=actor,
            operation="m2.site_visit.schedule",
            key=key,
            request_payload={
                "site_visit_id": str(site_visit_id),
                "scheduled_for": serializer.validated_data["scheduled_for"].isoformat(),
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)


class SiteVisitCompleteView(APIView):
    """Only the vendor closes a visit, because only the vendor attended it.

    Scheduling takes both parties; completion is a report of what happened, and the party that
    travelled is the one who can make it. A Customer who disagrees with the outcome has the
    clarification timeline and, from Wave C6, a case — not a competing completion.
    """

    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Site visits"],
        operation_id="m2_site_visit_complete",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=SiteVisitCompleteSerializer,
        responses={
            200: SiteVisitSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_requirement_transition_not_allowed` when the visit was never "
                "scheduled. A visit with no agreed time cannot have happened.",
            ),
        },
    )
    def post(self, request: Request, site_visit_id: uuid.UUID) -> Response:
        serializer = SiteVisitCompleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        actor = cast(User, request.user)
        key = _idempotency_key(request)

        try:
            profile = _partner_profile(request)
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        visit = SiteVisit.objects.filter(
            id=site_visit_id,
            invitation__partner=profile,
        ).first()
        if visit is None:
            _raise_api_error(RequirementNotFoundError())

        def command() -> tuple[int, dict[str, object]]:
            try:
                completed = proposals.complete_site_visit(
                    site_visit_id=visit.id,
                    outcome_notes=serializer.validated_data.get("outcome_notes", ""),
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)

            return status.HTTP_200_OK, cast(dict[str, object], SiteVisitSerializer(completed).data)

        result = execute_idempotent(
            actor=actor,
            operation="m2.site_visit.complete",
            key=key,
            request_payload={
                "site_visit_id": str(site_visit_id),
                **serializer.validated_data,
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)
