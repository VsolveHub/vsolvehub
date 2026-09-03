"""Wave C2: the A3 unlock.

The paywall and everything immediately behind it: the A3 unlock read and checkout, the A5 visit
plan and its single charge, and then the full quote list with the two things a Customer may do to
one — reject it, or ask for it to be re-validated. The banners that introduced the visit plan and
the quote routes are carried below, where each starts.
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
from apps.requirements import access, pricing, proposals, purchase_gates
from apps.requirements.exceptions import RequirementDomainError
from apps.requirements.models import SiteVisit, VisitPlan
from apps.requirements.selectors import customer_readable_proposals, requirement_for_customer
from apps.requirements.serializers import (
    AccessCheckoutSerializer,
    CustomerProposalSerializer,
    CustomerQuoteListSerializer,
    ProposalRejectSerializer,
    RevisionRequestCreateSerializer,
    RevisionRequestSerializer,
    UnlockStateSerializer,
    VisitPlanChooseSerializer,
    VisitPlanSerializer,
    VisitPlanStateSerializer,
)
from apps.requirements.views.base import (
    _checkout_payload,
    _idempotency_key,
    _optional_policy,
    _proposal_for_customer,
    _raise_api_error,
)
from common.errors.serializers import ApiErrorSerializer
from common.schema import IDEMPOTENCY_KEY_HEADER
from common.throttling import ThrottledWriteMixin


class RequirementUnlockView(ThrottledWriteMixin, APIView):
    """The A3 paywall. Read it to know whether it can be bought; post to start buying it."""

    permission_classes = (IsAuthenticated,)
    throttle_scope = "m2_money"

    @extend_schema(
        tags=["M2 - Access"],
        operation_id="m2_unlock_read",
        description=(
            "The unlock state for one A3 request. `unlock` is `null` until a checkout has been "
            "started, and reaching `ACTIVE` requires a **verified provider callback** — a client "
            "redirect saying the payment succeeded never grants access. `price_paise` is `null` "
            "when Operations has loaded no effective price, which is a real state while the tier "
            "prices are an open owner decision: the screen says we cannot offer this yet rather "
            "than showing a number nobody approved."
        ),
        responses={200: UnlockStateSerializer, 404: ApiErrorSerializer},
    )
    def get(self, request: Request, requirement_id: uuid.UUID) -> Response:
        try:
            requirement = requirement_for_customer(
                customer=cast(User, request.user),
                requirement_id=requirement_id,
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)

        price = _optional_policy(pricing.unlock_price)
        unlock = access.active_unlock(requirement) or access.latest_unlock(requirement)
        return Response(
            UnlockStateSerializer(
                {
                    "unlock": unlock,
                    "is_available": access.unlock_availability(requirement),
                    "price_paise": price.amount_paise if price is not None else None,
                    "usable_quote_count": len(access.usable_proposals(requirement)),
                    "can_read_full_quotes": access.customer_may_read_full_quotes(requirement),
                    "server_now": timezone.now(),
                }
            ).data
        )

    @extend_schema(
        tags=["M2 - Access"],
        operation_id="m2_unlock_checkout_create",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=None,
        description=(
            "Start the charge that unlocks delivered quotes. **A3 only**, and refused unless at "
            "least one usable quote is live at this instant — that is what makes 'paid but nothing "
            "happened' unreachable rather than merely unlikely. Repeating the call while a "
            "previous attempt is still pending returns that attempt rather than starting a second "
            "charge."
        ),
        responses={
            201: AccessCheckoutSerializer,
            400: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_lifecycle_not_supported` on an A5 request, which uses a visit "
                "plan and has no unlock.",
            ),
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_unlock_not_available` when no usable quote exists yet or the "
                "request is already unlocked; `m2_access_price_unavailable` when Operations has "
                "loaded no effective price — this **fails closed** rather than charging a guess.",
            ),
        },
    )
    def post(self, request: Request, requirement_id: uuid.UUID) -> Response:
        customer = cast(User, request.user)
        key = _idempotency_key(request)
        try:
            requirement = requirement_for_customer(customer=customer, requirement_id=requirement_id)
        except RequirementDomainError as exc:
            _raise_api_error(exc)

        def command() -> tuple[int, dict[str, object]]:
            try:
                _unlock, attempt = access.create_unlock_checkout(
                    requirement_id=requirement.id,
                    actor=customer,
                    idempotency_key=key,
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_201_CREATED, cast(
                dict[str, object], AccessCheckoutSerializer(_checkout_payload(attempt)).data
            )

        result = execute_idempotent(
            actor=customer,
            operation="m2.unlock.checkout",
            key=key,
            request_payload={"requirement_id": str(requirement_id)},
            command=command,
        )
        return Response(result.body, status=result.status_code)


# ---------------------------------------------------------------------------
# Wave C2: the A5 visit plan
# ---------------------------------------------------------------------------


class RequirementVisitPlanView(ThrottledWriteMixin, APIView):
    """The A5 front door: the tier chooser before a plan exists, the tracker after."""

    permission_classes = (IsAuthenticated,)
    throttle_scope = "m2_quote_action"

    @extend_schema(
        tags=["M2 - Access"],
        operation_id="m2_visit_plan_read",
        description=(
            "The visit plan for one A5 request. Before a plan is chosen this carries "
            "`available_tiers` — the priced options for the review screen's chooser, and an "
            "**empty list is the honest answer** while the owner has priced no tier. After a plan "
            "exists it carries the plan, its per-slot shares and the confirmed visits with their "
            "scheduled times. Choosing a plan charges nothing; the whole plan is charged once, at "
            "the first confirmed visit slot."
        ),
        responses={200: VisitPlanStateSerializer, 404: ApiErrorSerializer},
    )
    def get(self, request: Request, requirement_id: uuid.UUID) -> Response:
        try:
            requirement = requirement_for_customer(
                customer=cast(User, request.user),
                requirement_id=requirement_id,
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)

        plan = (
            VisitPlan.objects.select_related("payment_attempt")
            .filter(requirement=requirement)
            .prefetch_related("shares")
            .first()
        )
        # `M2-BE-810`. `choose_visit_plan` is one of the three gated doors, so while a pause is
        # engaged the chooser offers nothing rather than offering tiers the next tap will refuse.
        # An empty `available_tiers` is already the published honest answer for "no tier is priced
        # yet", and this is the second reason it can be empty — which is why the pause is a *read*
        # on the existing field rather than a new one: no client changes, and no screen offers a
        # purchase that cannot be made. A plan already chosen is untouched, and its tracker below
        # renders exactly as before.
        paused = not purchase_gates.new_purchases_allowed(variant_id=requirement.variant_id)
        tiers = (
            []
            if paused
            else [
                {"plan_size": tier.row.plan_size, "price_paise": tier.amount_paise}
                for tier in pricing.available_visit_plan_tiers()
            ]
        )
        visits = SiteVisit.objects.filter(
            requirement=requirement,
            plan_share__isnull=False,
        ).order_by("plan_share__position", "created_at")
        return Response(
            VisitPlanStateSerializer(
                {
                    "plan": plan,
                    "available_tiers": tiers,
                    "visits": visits,
                    "checkout_available": access.visit_plan_checkout_availability(requirement),
                    "can_read_full_estimates": access.customer_may_read_full_quotes(requirement),
                    "server_now": timezone.now(),
                }
            ).data
        )

    @extend_schema(
        tags=["M2 - Access"],
        operation_id="m2_visit_plan_choose",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=VisitPlanChooseSerializer,
        description=(
            "Choose how many verified professionals will visit and estimate on site: one, two or "
            "three. **This charges nothing** — it bounds the invitation wave and snapshots the "
            "price the Customer was shown, so a price loaded between choosing and the first vendor "
            "confirming cannot silently become what they pay. Re-choosing is allowed while no "
            "vendor has committed to a slot. A5 only; an A3 request has no visit plan."
        ),
        responses={
            200: VisitPlanSerializer,
            400: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_lifecycle_not_supported` on an A3 request.",
            ),
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_access_price_unavailable` when this tier has no effective price; "
                "`m2_requirement_transition_not_allowed` once a vendor has committed to a visit, "
                "because resizing a plan somebody is already travelling for is not a choice.",
            ),
        },
    )
    def post(self, request: Request, requirement_id: uuid.UUID) -> Response:
        serializer = VisitPlanChooseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        customer = cast(User, request.user)
        key = _idempotency_key(request)
        try:
            requirement = requirement_for_customer(customer=customer, requirement_id=requirement_id)
        except RequirementDomainError as exc:
            _raise_api_error(exc)

        def command() -> tuple[int, dict[str, object]]:
            try:
                plan = access.choose_visit_plan(
                    requirement_id=requirement.id,
                    plan_size=serializer.validated_data["plan_size"],
                    actor=customer,
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_200_OK, cast(dict[str, object], VisitPlanSerializer(plan).data)

        result = execute_idempotent(
            actor=customer,
            operation="m2.visit_plan.choose",
            key=key,
            request_payload={
                "requirement_id": str(requirement_id),
                **serializer.validated_data,
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)


class RequirementVisitPlanCheckoutView(ThrottledWriteMixin, APIView):
    permission_classes = (IsAuthenticated,)
    throttle_scope = "m2_money"

    @extend_schema(
        tags=["M2 - Access"],
        operation_id="m2_visit_plan_checkout_create",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=None,
        description=(
            "Pay for the whole visit plan, once, against a slot a vendor has actually committed "
            "to. The first vendor's slot is held while this completes and **lapses harmlessly if "
            "the Customer never pays** — nothing was charged and the vendor's time returns to the "
            "availability grid. The held slot hardens to `SCHEDULED` only on the verified provider "
            "callback. Later vendors book without any further payment."
        ),
        responses={
            201: AccessCheckoutSerializer,
            400: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_visit_plan_not_chargeable` when no vendor holds a slot yet, when "
                "the plan is already paid for, or when a reclassification credit already covers "
                "it; `m2_visit_plan_required` when no plan has been chosen.",
            ),
        },
    )
    def post(self, request: Request, requirement_id: uuid.UUID) -> Response:
        customer = cast(User, request.user)
        key = _idempotency_key(request)
        try:
            requirement = requirement_for_customer(customer=customer, requirement_id=requirement_id)
        except RequirementDomainError as exc:
            _raise_api_error(exc)

        def command() -> tuple[int, dict[str, object]]:
            try:
                _plan, attempt = access.create_visit_plan_checkout(
                    requirement_id=requirement.id,
                    actor=customer,
                    idempotency_key=key,
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_201_CREATED, cast(
                dict[str, object], AccessCheckoutSerializer(_checkout_payload(attempt)).data
            )

        result = execute_idempotent(
            actor=customer,
            operation="m2.visit_plan.checkout",
            key=key,
            request_payload={"requirement_id": str(requirement_id)},
            command=command,
        )
        return Response(result.body, status=result.status_code)


# ---------------------------------------------------------------------------
# Wave C2: reading, rejecting and re-validating quotes
# ---------------------------------------------------------------------------


class RequirementQuoteListView(APIView):
    """Full quotes and estimates, for a Customer who has paid to read them."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Quotes"],
        operation_id="m2_quote_list",
        description=(
            "Every quote (A3) or on-site estimate (A5) in full: scope, line items, stages, taxes, "
            "validity and the vendor's identity. **Entitlement is enforced here, not hidden in the "
            "UI** — an A3 request needs an active unlock and an A5 request needs a charged visit "
            "plan, and without one this refuses rather than returning a shortened payload. "
            "Contact details are not in this response at any status; they are released by the "
            "engagement, not by the fee."
        ),
        responses={
            200: CustomerQuoteListSerializer,
            403: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_unlock_required` — the A3 quotes are still behind the unlock.",
            ),
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_visit_plan_required` — no A5 visit plan has been charged, so no "
                "estimate has been bought yet.",
            ),
        },
    )
    def get(self, request: Request, requirement_id: uuid.UUID) -> Response:
        try:
            requirement = requirement_for_customer(
                customer=cast(User, request.user),
                requirement_id=requirement_id,
            )
            access.assert_customer_may_read_full_quotes(requirement)
        except RequirementDomainError as exc:
            _raise_api_error(exc)

        cap = _optional_policy(lambda: pricing.non_responsive_rejection_cap(requirement))
        used = proposals.non_responsive_rejection_count(requirement)
        return Response(
            CustomerQuoteListSerializer(
                {
                    "quotes": customer_readable_proposals(requirement),
                    "non_responsive_rejections_remaining": (
                        max(cap - used, 0) if cap is not None else None
                    ),
                    "server_now": timezone.now(),
                }
            ).data
        )


class RequirementQuoteRejectView(ThrottledWriteMixin, APIView):
    permission_classes = (IsAuthenticated,)
    throttle_scope = "m2_quote_action"

    @extend_schema(
        tags=["M2 - Quotes"],
        operation_id="m2_quote_reject",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=ProposalRejectSerializer,
        description=(
            "Refuse a quote. `NOT_CHOSEN` is bookkeeping — the Customer preferred somebody else "
            "and nothing further happens. `NON_RESPONSIVE` is the control against slot squatting: "
            "it releases the vendor's slot and buys a replacement **at no extra charge** — a new "
            "quote slot on A3, a free replacement visit on A5 — up to a configured cap."
        ),
        responses={
            200: CustomerProposalSerializer,
            400: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_rejection_cap_reached` when every free replacement has been "
                "used; `m2_proposal_not_selectable` when the quote is no longer live; "
                "`m2_policy_unavailable` when the owner has not set the cap — the free "
                "replacement is refused rather than promised on a rule that does not exist.",
            ),
        },
    )
    def post(self, request: Request, requirement_id: uuid.UUID, proposal_id: uuid.UUID) -> Response:
        serializer = ProposalRejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        customer = cast(User, request.user)
        key = _idempotency_key(request)
        try:
            requirement = requirement_for_customer(customer=customer, requirement_id=requirement_id)
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        proposal = _proposal_for_customer(requirement=requirement, proposal_id=proposal_id)

        def command() -> tuple[int, dict[str, object]]:
            try:
                rejected = proposals.reject_proposal(
                    requirement_id=requirement.id,
                    proposal_id=proposal.id,
                    reason=serializer.validated_data["reason"],
                    actor=customer,
                    note=serializer.validated_data["note"],
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_200_OK, cast(
                dict[str, object], CustomerProposalSerializer(rejected).data
            )

        result = execute_idempotent(
            actor=customer,
            operation="m2.quote.reject",
            key=key,
            request_payload={
                "requirement_id": str(requirement_id),
                "proposal_id": str(proposal_id),
                **serializer.validated_data,
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)


class RequirementQuoteRevisionRequestView(ThrottledWriteMixin, APIView):
    permission_classes = (IsAuthenticated,)
    throttle_scope = "m2_quote_action"

    @extend_schema(
        tags=["M2 - Quotes"],
        operation_id="m2_quote_revision_request",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=RevisionRequestCreateSerializer,
        description=(
            "Ask the professional behind one live estimate for a different one, with the reason "
            "attached: leave named lines out, change materials, split the work into phases, ask "
            "whether they can move on price, or something else in a sentence. "
            "**`requested_discount_bps` is what the Customer hopes to pay, never what the work "
            "costs** — it changes no total, obliges nobody, and the estimate stays live and "
            "selectable at the price as sent. The vendor answers by superseding the estimate, "
            "which lands under the same entitlement. One open request per estimate; a second call "
            "re-reads the first. A price may be asked about once per estimate."
        ),
        responses={
            201: RevisionRequestSerializer,
            400: ApiErrorSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_proposal_not_selectable` when the estimate is no longer live, "
                "when the request already has a chosen vendor, or when the caller has not "
                "unlocked these quotes.",
            ),
        },
    )
    def post(self, request: Request, requirement_id: uuid.UUID, proposal_id: uuid.UUID) -> Response:
        serializer = RevisionRequestCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        customer = cast(User, request.user)
        key = _idempotency_key(request)
        try:
            requirement = requirement_for_customer(customer=customer, requirement_id=requirement_id)
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        proposal = _proposal_for_customer(requirement=requirement, proposal_id=proposal_id)
        data = serializer.validated_data

        def command() -> tuple[int, dict[str, object]]:
            try:
                asked = proposals.request_revision(
                    requirement_id=requirement.id,
                    proposal_id=proposal.id,
                    actor=customer,
                    reason_code=str(data["reason_code"]),
                    excluded_items=list(data["excluded_items"]),
                    note=str(data["note"]),
                    requested_discount_bps=data["requested_discount_bps"],
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_201_CREATED, cast(
                dict[str, object], RevisionRequestSerializer(asked).data
            )

        result = execute_idempotent(
            actor=customer,
            operation="m2.quote.revision_request",
            key=key,
            request_payload={
                "requirement_id": str(requirement_id),
                "proposal_id": str(proposal_id),
                "reason_code": str(data["reason_code"]),
                "excluded_items": "|".join(data["excluded_items"]),
                "note": str(data["note"]),
                # In the replay fingerprint: asking for 3% and asking for 5% are different
                # requests, and a shared key would serve the first answer to the second ask.
                "requested_discount_bps": str(data["requested_discount_bps"]),
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)


class RequirementQuoteRevalidateView(ThrottledWriteMixin, APIView):
    permission_classes = (IsAuthenticated,)
    throttle_scope = "m2_quote_action"

    @extend_schema(
        tags=["M2 - Quotes"],
        operation_id="m2_quote_revalidate",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=None,
        description=(
            "Ask this vendor to put a fresh price on a quote whose validity has passed. **This "
            "charges nothing and reuses the unlock or visit plan already paid for** — expiry must "
            "not be a dead end that forces a second purchase. The vendor answers by superseding "
            "the quote; the expired revision stays readable and stays unselectable, because only "
            "a vendor can state a price."
        ),
        responses={
            200: CustomerProposalSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_proposal_not_selectable` when the quote has not expired, when "
                "the request already has a chosen vendor, or when the caller has not unlocked "
                "these quotes at all.",
            ),
        },
    )
    def post(self, request: Request, requirement_id: uuid.UUID, proposal_id: uuid.UUID) -> Response:
        customer = cast(User, request.user)
        key = _idempotency_key(request)
        try:
            requirement = requirement_for_customer(customer=customer, requirement_id=requirement_id)
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        proposal = _proposal_for_customer(requirement=requirement, proposal_id=proposal_id)

        def command() -> tuple[int, dict[str, object]]:
            try:
                asked = proposals.request_revalidation(
                    requirement_id=requirement.id,
                    proposal_id=proposal.id,
                    actor=customer,
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_200_OK, cast(
                dict[str, object], CustomerProposalSerializer(asked).data
            )

        result = execute_idempotent(
            actor=customer,
            operation="m2.quote.revalidate",
            key=key,
            request_payload={
                "requirement_id": str(requirement_id),
                "proposal_id": str(proposal_id),
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)
