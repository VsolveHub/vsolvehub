"""Wave C2: A5 visit slots — the read the whole Partner picker depends on.

The candidate-start grid and the confirmation that redeems one of its tokens, then the two shared
site-visit outcome routes: arrival, and a no-show reported by the party who turned up. The Partner
workspace-grant and demand-preview reads follow, under the banner they arrived with.
"""

import uuid
from dataclasses import asdict
from typing import Any, cast

from django.utils import timezone
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.foundation.services import execute_idempotent
from apps.identity.models import User
from apps.partners.capabilities import assert_kyc_complete, workspace_grants
from apps.partners.exceptions import PartnerDomainError
from apps.partners.permissions import IsPartnerUser
from apps.partners.selectors import partner_profile_for_user
from apps.requirements import access, visit_slots
from apps.requirements.exceptions import (
    RequirementDomainError,
    RequirementNotFoundError,
    RequirementTransitionError,
)
from apps.requirements.models import SiteVisit
from apps.requirements.selectors import (
    demand_preview,
    invitation_for_partner,
    site_visit_for_participant,
)
from apps.requirements.serializers import (
    DemandPreviewSerializer,
    SiteVisitSerializer,
    VisitArrivalCodeEntrySerializer,
    VisitArrivalCodeSerializer,
    VisitArrivalSerializer,
    VisitNoShowSerializer,
    VisitSlotConfirmationSerializer,
    VisitSlotConfirmSerializer,
    VisitSlotGridSerializer,
    WorkspaceGrantListSerializer,
)
from apps.requirements.views.base import _idempotency_key, _partner_profile, _raise_api_error
from common.errors.serializers import ApiErrorSerializer
from common.schema import IDEMPOTENCY_KEY_HEADER
from common.throttling import ThrottledWriteMixin


class PartnerEnquiryVisitSlotView(ThrottledWriteMixin, APIView):
    """Candidate visit starts for this vendor, and the command that books one.

    The read and the write sit on one path deliberately. `confirm_visit_slot` redeems a token this
    grid issued, so publishing the write without the read would have left the Partner slot picker
    with nothing to render — the browser must never compute availability, and the A1 checkout
    already ships that rule as `POST /booking/windows/`.
    """

    permission_classes = (IsAuthenticated, IsPartnerUser)
    throttle_scope = "m2_partner_response"

    @extend_schema(
        tags=["M2 - Visit slots"],
        operation_id="m2_visit_slot_list",
        description=(
            "The visit times this vendor may confirm, drawn from the **same `carts.availability` "
            "grid the A1 technician flow reads** and narrowed to this one invited vendor. Same "
            "payload shape as `POST /api/v1/booking/windows/` minus `capacity`, which on a "
            "single-vendor grid would be a readout of that vendor's own diary depth.\n\n"
            "Each `id` is a **signed token** bound to this invitation and this start; it is the "
            "only thing the confirm command accepts, so a vendor cannot book a time the grid never "
            "offered or a slot drawn for a competitor. Tokens expire, so a picker left open must "
            "re-read rather than post a stale one.\n\n"
            "An ineligible vendor receives a grid in which every slot reads `NO_CAPACITY` rather "
            "than an error — that is the truth and it is renderable, where a refusal would leave "
            "the screen with nothing to say."
        ),
        responses={
            200: VisitSlotGridSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_policy_unavailable` when the owner has not set how long a visit "
                "takes for this service — the grid cannot be drawn at an invented width; "
                "`m2_visit_slot_unavailable` when the request has no serviceable area.",
            ),
        },
    )
    def get(self, request: Request, invitation_id: uuid.UUID) -> Response:
        try:
            invitation = invitation_for_partner(
                partner=_partner_profile(request),
                invitation_id=invitation_id,
            )
            grid = visit_slots.candidate_visit_starts(invitation=invitation)
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        return Response(VisitSlotGridSerializer(visit_slots.as_wire(grid)).data)

    @extend_schema(
        tags=["M2 - Visit slots"],
        operation_id="m2_visit_slot_confirm",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=VisitSlotConfirmSerializer,
        description=(
            "Commit to being on site at a specific time. **This is A5 acceptance** — it takes the "
            "quote slot and the soft capacity hold, and then a hard slot on the shared "
            "availability grid, so a visit and an A1 booking cannot double-book the same vendor.\n"
            "\nThe **first** confirmation on an unpaid plan holds its slot and opens the "
            "Customer's checkout (`opens_plan_checkout: true`); the visit reads `REQUESTED` until "
            "that payment is verified, and the hold lapses harmlessly if it never is. Later slots "
            "on a paid plan are confirmed outright."
        ),
        responses={
            201: VisitSlotConfirmationSerializer,
            400: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_lifecycle_not_supported` — only project requests book visit "
                "slots.",
            ),
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_visit_slot_unavailable` when the slot has gone, the token is "
                "stale or the start has passed — the availability grid's exclusion constraint is "
                "the final authority and this is what losing that race reads as; "
                "`m2_visit_plan_required` when no plan is live; `m2_capacity_unavailable` and "
                "`m2_invitation_slots_exhausted` from the acceptance underneath.",
            ),
        },
    )
    def post(self, request: Request, invitation_id: uuid.UUID) -> Response:
        serializer = VisitSlotConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        try:
            profile = _partner_profile(request)
            invitation = invitation_for_partner(partner=profile, invitation_id=invitation_id)
            # The same progressive gate the plain accept applies, for the same reason: confirming a
            # visit slot *is* acceptance on A5, and taking a slot away from another vendor is what
            # proving identity buys.
            assert_kyc_complete(profile)
        except (RequirementDomainError, PartnerDomainError) as exc:
            _raise_api_error(exc)

        def command() -> tuple[int, dict[str, object]]:
            try:
                confirmation = access.confirm_visit_slot(
                    invitation_id=invitation.id,
                    slot_id=serializer.validated_data["slot_id"],
                )
            except (RequirementDomainError, PartnerDomainError) as exc:
                _raise_api_error(exc)
            return status.HTTP_201_CREATED, cast(
                dict[str, object],
                VisitSlotConfirmationSerializer(
                    {
                        "visit": confirmation.visit,
                        "share": confirmation.share,
                        "opens_plan_checkout": confirmation.opens_plan_checkout,
                        "server_now": timezone.now(),
                    }
                ).data,
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.visit_slot.confirm",
            key=key,
            request_payload={
                "invitation_id": str(invitation_id),
                **serializer.validated_data,
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)


class SiteVisitArrivalView(APIView):
    """Arrival on the non-OTP fallback, which is the default path in M2."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Site visits"],
        operation_id="m2_site_visit_arrival_confirm",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=VisitArrivalSerializer,
        description=(
            "Record that the vendor is on site. Either party may confirm it. M2 uses the "
            "**non-OTP fallback** as the default path rather than as a degraded one — the start "
            "OTP is M3 activation — and `arrival_method` is stored so every historical arrival "
            "still says truthfully how it was proved once the OTP path is switched on."
        ),
        responses={
            200: SiteVisitSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_requirement_transition_not_allowed` when the visit is not "
                "scheduled — a visit whose plan payment has not been verified is still held, not "
                "scheduled, and nobody has arrived at it.",
            ),
        },
    )
    def post(self, request: Request, site_visit_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        try:
            visit = site_visit_for_participant(user=actor, site_visit_id=site_visit_id)
        except RequirementDomainError as exc:
            _raise_api_error(exc)

        def command() -> tuple[int, dict[str, object]]:
            try:
                arrived = access.confirm_visit_arrival(site_visit_id=visit.id, actor=actor)
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_200_OK, cast(dict[str, object], SiteVisitSerializer(arrived).data)

        result = execute_idempotent(
            actor=actor,
            operation="m2.site_visit.arrival",
            key=key,
            request_payload={"site_visit_id": str(site_visit_id)},
            command=command,
        )
        return Response(result.body, status=result.status_code)


class SiteVisitNoShowView(APIView):
    """A scheduled visit did not happen, reported by the party who turned up."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Site visits"],
        operation_id="m2_site_visit_no_show_report",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=VisitNoShowSerializer,
        description=(
            "Report that the other party did not turn up. **You report the other side's absence, "
            "never your own** — a Customer reports `VENDOR`, a vendor reports `CUSTOMER` — because "
            "the report is a statement by the party who was there.\n\n"
            "The two settle differently. A vendor no-show costs the Customer nothing: the slot "
            "goes back to owing a **free replacement visit**. A customer no-show still pays the "
            "vendor their visit payout — they travelled — and only the platform's share is in "
            "question, which is an owner decision read fail-closed."
        ),
        responses={
            200: SiteVisitSerializer,
            403: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_requirement_transition_not_allowed` when a party reports its own "
                "no-show.",
            ),
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_requirement_transition_not_allowed` when the visit was never "
                "scheduled; `m2_policy_unavailable` when the owner has not decided how a customer "
                "no-show settles the platform share.",
            ),
        },
    )
    def post(self, request: Request, site_visit_id: uuid.UUID) -> Response:
        serializer = VisitNoShowSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        party = serializer.validated_data["party"]
        try:
            visit = site_visit_for_participant(user=actor, site_visit_id=site_visit_id)
        except RequirementDomainError as exc:
            _raise_api_error(exc)

        reporter_is_customer = visit.requirement.customer_id == actor.id
        if (party == "VENDOR") != reporter_is_customer:
            _raise_api_error(
                RequirementTransitionError(
                    "Report the other party's absence; we ask them separately about yours.",
                )
            )

        def command() -> tuple[int, dict[str, object]]:
            try:
                reported = access.report_visit_no_show(
                    site_visit_id=visit.id,
                    party=party,
                    reason_code=serializer.validated_data["reason_code"],
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_200_OK, cast(dict[str, object], SiteVisitSerializer(reported).data)

        result = execute_idempotent(
            actor=actor,
            operation="m2.site_visit.no_show",
            key=key,
            request_payload={
                "site_visit_id": str(site_visit_id),
                **serializer.validated_data,
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)


# ---------------------------------------------------------------------------
# Partner: workspace grants
#
# Lives here rather than in `apps.partners.views` only because the M2 URL module is here; the
# read model itself is `partners.capabilities.workspace_grants`.
# ---------------------------------------------------------------------------


class PartnerWorkspaceListView(APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Partner workspaces"],
        operation_id="m2_partner_workspace_list",
        description=(
            "The Partner's approved lifecycle capabilities as `{workspace_key, commercial_mode, "
            "actions[]}`. Drives navigation and nothing else: no routes, no labels, no icons. "
            'A Partner with no approved capability receives `200 {"workspaces": []}` — that is '
            "a real, common state (registered, not yet reviewed), not an error. Suspension is "
            "expressed by omitting the workspace or reducing its actions, never by an error, so "
            "navigation degrades in place rather than blanking mid-session."
        ),
        responses={200: WorkspaceGrantListSerializer, 403: ApiErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        profile = partner_profile_for_user(cast(User, request.user))
        grants = workspace_grants(profile) if profile is not None else []
        return Response(WorkspaceGrantListSerializer({"workspaces": grants}).data)


class PartnerDemandPreviewView(APIView):
    """Masked live demand, for a Partner who has proved nothing yet.

    Lives in this module rather than `apps.partners.views` because it reads `CustomerRequirement`,
    and `apps.requirements` already depends on `apps.partners`. Putting it the other way round would
    make the two apps import each other.

    `IsPartnerUser` rather than `IsAuthenticated`: a Partner who has begun registering holds the
    role before any document is verified, so the gate here is "is a vendor" and not "is vetted" —
    which is the whole point of the screen.
    """

    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Partner workspaces"],
        operation_id="m2_partner_demand_preview",
        description=(
            "Live requirement summaries in the areas this Partner serves, masked. **Customer "
            "name, phone, full address, building number and the exact budget are absent from the "
            "response.** `id` is a preview identifier — a keyed hash, not a requirement primary "
            "key — and resolves on no other route. Ineligible demand is returned with a hint "
            "rather than hidden: hiding it would make an empty screen the first thing most new "
            'Partners see. An empty list is a real answer ("nothing in your area right now"), '
            "never a `404`."
        ),
        responses={200: DemandPreviewSerializer, 403: ApiErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        profile = partner_profile_for_user(cast(User, request.user))
        summaries: list[dict[str, Any]] = []
        matched = 0
        if profile is not None:
            found, matched = demand_preview(profile)
            summaries = [asdict(summary) for summary in found]
        return Response(
            DemandPreviewSerializer(
                {
                    "summaries": summaries,
                    "matched_service_count": matched,
                    "server_now": timezone.now(),
                }
            ).data
        )


class SiteVisitArrivalCodeView(APIView):
    """`GET`/`POST /site-visits/{id}/arrival-code/` — the Customer's half of the arrival proof.

    Scoped to the Customer alone, and that is the whole security property. The vendor must *not*
    be able to read this code: a code the party entering it can also fetch proves nothing, and
    would turn the arrival record into the same unverified tap it replaced. Which is also why the
    code is not a field on `SiteVisitSerializer` — that serializer is read by both roles.

    `GET` is the page load and issues nothing. `POST` mints a new code and retires the previous
    one, which is both the "get a new code" control and the recovery for a display copy the cache
    has evicted.
    """

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Site visits"],
        operation_id="m2_site_visit_arrival_code_read",
        description=(
            "The live arrival code for this visit, for the Customer to read out. `code` is null "
            "when no challenge is live, and also when one is live but the short-lived display "
            "copy has expired from cache — in both cases the client offers to issue a new one "
            "rather than showing digits that would be refused."
        ),
        responses={
            200: VisitArrivalCodeSerializer,
            404: ApiErrorSerializer,
        },
    )
    def get(self, request: Request, site_visit_id: uuid.UUID) -> Response:
        customer = cast(User, request.user)
        visit = SiteVisit.objects.filter(
            pk=site_visit_id,
            requirement__customer=customer,
        ).first()
        if visit is None:
            _raise_api_error(RequirementNotFoundError())
        live = access.live_visit_arrival_code(visit)
        return Response(
            VisitArrivalCodeSerializer(
                {
                    "code": None if live is None else live.digits,
                    "expires_at": None if live is None else live.expires_at,
                    "can_issue": visit.status == SiteVisit.Status.SCHEDULED,
                    "server_now": timezone.now(),
                }
            ).data
        )

    @extend_schema(
        tags=["M2 - Site visits"],
        operation_id="m2_site_visit_arrival_code_issue",
        request=None,
        description=(
            "Mint a fresh arrival code and retire any predecessor, so only one code can ever open "
            "a visit."
        ),
        responses={
            201: VisitArrivalCodeSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_requirement_transition_not_allowed` when the visit has no "
                "confirmed time, or has already started.",
            ),
            429: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_arrival_code_too_soon` — a code was issued moments ago. The "
                "existing one is still valid; read it from the `GET`.",
            ),
        },
    )
    def post(self, request: Request, site_visit_id: uuid.UUID) -> Response:
        customer = cast(User, request.user)
        try:
            issued = access.issue_visit_arrival_code(
                site_visit_id=site_visit_id,
                customer=customer,
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        return Response(
            VisitArrivalCodeSerializer(
                {
                    "code": issued.digits,
                    "expires_at": issued.expires_at,
                    "can_issue": True,
                    "server_now": timezone.now(),
                }
            ).data,
            status=status.HTTP_201_CREATED,
        )


class SiteVisitArrivalWithCodeView(APIView):
    """`POST /partner/site-visits/{id}/arrival/` — the vendor types in what the Customer read out.

    Separate from `SiteVisitArrivalView` rather than an optional field on it. That route is the
    audited fallback either party may use when a phone is dead or a site has no signal, and
    folding the code into it as optional would make the strong path opt-in on the request body —
    which is to say, not a requirement at all. Two routes, two `arrival_method` values, and the
    stored method says forever which of them proved any given visit.
    """

    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Site visits"],
        operation_id="m2_site_visit_arrival_with_code",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=VisitArrivalCodeEntrySerializer,
        description=(
            "Confirm arrival by entering the code the Customer is holding. Records "
            "`arrival_method=START_OTP`. A wrong code spends one of the challenge's attempts and "
            "the spend survives the refusal, so the attempt limit cannot be reset by retrying."
        ),
        responses={
            200: SiteVisitSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
            422: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_arrival_code_invalid` — wrong, expired, already used, or too "
                "many wrong attempts. Deliberately one code for all four: telling the entering "
                "party which it was is what makes an attempt limit worth guessing against.",
            ),
        },
    )
    def post(self, request: Request, site_visit_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        serializer = VisitArrivalCodeEntrySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        code = str(serializer.validated_data["code"])

        def command() -> tuple[int, dict[str, object]]:
            try:
                arrived = access.confirm_visit_arrival_with_code(
                    site_visit_id=site_visit_id,
                    vendor_user=actor,
                    code=code,
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_200_OK, cast(dict[str, object], SiteVisitSerializer(arrived).data)

        result = execute_idempotent(
            actor=actor,
            operation="m2.site_visit.arrival_with_code",
            key=key,
            request_payload={"site_visit_id": str(site_visit_id)},
            command=command,
        )
        return Response(result.body, status=result.status_code)
