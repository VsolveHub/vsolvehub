"""Partner: crew offers.

The supply side of the rate card. A lead reads the offers they can still answer — each carrying
their own number and never the Customer's — accepts one or declines it with a reason the alarm
reads. Operations' own rate-card routes follow, under the banner they arrived with.
"""

import uuid
from dataclasses import asdict
from typing import cast

from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.foundation.services import execute_idempotent
from apps.identity.models import User
from apps.locations.models import ServiceArea
from apps.partners.capabilities import assert_kyc_complete
from apps.partners.exceptions import PartnerDomainError
from apps.partners.models import Skill
from apps.partners.permissions import IsOperationsUser, IsPartnerUser
from apps.requirements import crew_brief, crew_dispatch, crew_mix, rate_cards
from apps.requirements.exceptions import RequirementDomainError, RequirementNotFoundError
from apps.requirements.models import RateCardBooking, VendorInvitation
from apps.requirements.selectors import invitation_for_partner
from apps.requirements.serializers import (
    CrewOfferAcceptedSerializer,
    CrewOfferDeclineSerializer,
    CrewOfferListSerializer,
    CrewOfferSerializer,
    RateCardDeclineAlarmListSerializer,
    RateCardListSerializer,
    RateCardPublishSerializer,
    RateCardSerializer,
)
from apps.requirements.views.base import _idempotency_key, _partner_profile, _raise_api_error
from common.errors.serializers import ApiErrorSerializer
from common.schema import IDEMPOTENCY_KEY_HEADER
from common.throttling import ThrottledWriteMixin


def _crew_offer_payload(offer: crew_dispatch.CrewOffer) -> dict[str, object]:
    invitation = offer.invitation
    requirement = invitation.requirement
    area = requirement.service_area
    return {
        "invitation_id": invitation.id,
        "requirement_id": requirement.id,
        "status": invitation.status,
        "decline_reason_code": invitation.decline_reason_code,
        "headcount": offer.headcount,
        "days": offer.days,
        "lead_day_receipt_paise": offer.lead_day_receipt_paise,
        "lead_total_receipt_paise": offer.lead_total_receipt_paise,
        "standard_day_hours": offer.standard_day_hours,
        "overtime_hourly_paise": offer.overtime_hourly_paise,
        "inclusions": offer.inclusions,
        "responds_by": offer.responds_by,
        "verified_roster_size": offer.verified_roster_size,
        "requested_start": requirement.requested_start,
        "area_label": area.name if area is not None else "",
        "brief": [asdict(line) for line in offer.brief],
        "server_now": timezone.now(),
    }


class PartnerCrewOfferListView(APIView):
    """Live crew offers for this lead, each carrying **their own** number."""

    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Rate card"],
        operation_id="m2_crew_offer_list",
        description=(
            "Crew offers this lead can still answer, on the M1 dispatch clock — `responds_by` is "
            "wall-clock and minutes away, not a business-hours deadline.\n\n"
            "**Every offer carries the lead's own number**: what they receive per day for the "
            "requested crew, paid directly by the Customer at day end. The Customer's "
            "all-inclusive rate is not in this payload at any status, because it contains this "
            "platform's booking fee and showing a vendor money they do not receive is how a "
            "published rate starts an argument on site."
        ),
        responses={200: CrewOfferListSerializer, 403: ApiErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        profile = _partner_profile(request)
        crew_dispatch.reconcile_lapsed_offers(partner=profile)
        now = timezone.now()
        invitations = (
            VendorInvitation.objects.filter(
                partner=profile,
                status=VendorInvitation.Status.INVITED,
                requirement__rate_card_booking__isnull=False,
                # Answerable **now**, not merely un-swept. `INVITED` alone is a status the sweep
                # has not caught up with yet: the offer timeout is wall-clock minutes and the beat
                # runs on its own schedule, so between the two there is a window in which a lapsed
                # offer still reads as live. A lead who opens one in that window is told a race
                # happened. Filtering on the deadline itself closes the window at the source
                # rather than asking every client to remember.
                responds_by__gt=now,
                # And the job must still be one the cascade is dispatching. Exhaust and cancel
                # withdraw outstanding offers, but this makes a missed withdrawal invisible rather
                # than answerable.
                requirement__rate_card_booking__status__in=(RateCardBooking.DISPATCHABLE_STATUSES),
            )
            # The configuration is what turns stored answer codes into the brief's labels; without
            # it here every offer in the list costs its own lookup.
            .select_related("requirement__service_area", "requirement__configuration", "partner")
            .order_by("responds_by", "created_at")
        )
        offers = [
            _crew_offer_payload(offer)
            for offer in (crew_dispatch.crew_offer_for(item) for item in invitations)
            if offer is not None
        ]
        return Response(
            CrewOfferListSerializer({"offers": offers, "server_now": timezone.now()}).data
        )


class PartnerCrewOfferAcceptView(ThrottledWriteMixin, APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)
    throttle_scope = "m2_partner_response"

    @extend_schema(
        tags=["M2 - Rate card"],
        operation_id="m2_crew_offer_accept",
        request=None,
        description=(
            "Take the job at the published rate. **First accept wins** — a rate-card request has "
            "exactly one slot, so the second lead to arrive is refused with "
            "`m2_invitation_slots_exhausted` rather than losing a race.\n\n"
            "Accepting takes a soft capacity hold for the requested dates, records this lead's "
            "acceptance of the published card, and holds the job while the Customer pays the "
            "booking fee. If they never pay, the hold lapses, the vendor keeps their standing, "
            "and the cascade moves on.\n\n"
            "Refused with `m2_roster_insufficient` when the lead's **verified** roster is smaller "
            "than the headcount. Crews are never aggregated across vendors: one lead is "
            "accountable for the whole crew."
        ),
        responses={
            200: CrewOfferAcceptedSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_roster_insufficient`, `m2_invitation_slots_exhausted` when "
                "another lead took the job, `m2_capacity_unavailable` when this lead is already "
                "committed on those dates, or `m2_invitation_expired`.",
            ),
        },
    )
    def post(self, request: Request, invitation_id: uuid.UUID) -> Response:
        profile = _partner_profile(request)
        try:
            invitation = invitation_for_partner(partner=profile, invitation_id=invitation_id)
            assert_kyc_complete(profile)
            booking = crew_dispatch.accept_crew_offer(invitation_id=invitation.id)
        except (RequirementDomainError, PartnerDomainError) as exc:
            _raise_api_error(exc)
        return Response(
            CrewOfferAcceptedSerializer(
                {
                    "booking_id": booking.id,
                    "requirement_id": booking.requirement_id,
                    "status": booking.status,
                    "headcount": booking.headcount,
                    "days": booking.days,
                    "lead_day_receipt_paise": booking.lead_day_receipt_paise,
                    "lead_receipt_paise": booking.lead_receipt_paise,
                    "standard_day_hours": booking.standard_day_hours,
                    "overtime_hourly_paise": booking.overtime_hourly_paise,
                    "add_on_rates": booking.add_on_rates,
                    "inclusions": booking.inclusions,
                    "hold_expires_at": booking.hold_expires_at,
                    "requested_start": invitation.requirement.requested_start,
                    "brief": [
                        asdict(line) for line in crew_brief.brief_lines(invitation.requirement)
                    ],
                    # The mix the lead must check against their own roster before accepting.
                    "crew_mix": [
                        {**asdict(line), "total": line.total}
                        for line in crew_mix.mix_lines(invitation.requirement)
                    ],
                    "server_now": timezone.now(),
                }
            ).data
        )


class PartnerCrewOfferDeclineView(ThrottledWriteMixin, APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)
    throttle_scope = "m2_partner_response"

    @extend_schema(
        tags=["M2 - Rate card"],
        operation_id="m2_crew_offer_decline",
        request=CrewOfferDeclineSerializer,
        description=(
            "Pass on a crew offer. **The reason is required and is read by the decline-rate "
            "alarm.** `RATE_TOO_LOW` is the answer that matters most: a published rate below the "
            "street rate makes leads decline everything and the instant product dies quietly, so "
            "a sustained decline rate pages Operations rather than appearing in a monthly report.\n"
            "\nDeclining releases the slot and moves the cascade to its next, wider wave."
        ),
        responses={
            200: CrewOfferSerializer,
            400: ApiErrorSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, invitation_id: uuid.UUID) -> Response:
        profile = _partner_profile(request)
        serializer = CrewOfferDeclineSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            invitation = invitation_for_partner(partner=profile, invitation_id=invitation_id)
            declined = crew_dispatch.decline_crew_offer(
                invitation_id=invitation.id,
                reason_code=str(serializer.validated_data["reason_code"]),
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        offer = crew_dispatch.crew_offer_for(declined)
        if offer is None:
            _raise_api_error(RequirementNotFoundError())
        return Response(CrewOfferSerializer(_crew_offer_payload(offer)).data)


# ---------------------------------------------------------------------------
# Operations: publishing rate cards
# ---------------------------------------------------------------------------


class OperationsRateCardView(APIView):
    """Publish and review the day rates this platform sets."""

    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["M2 - Rate card"],
        operation_id="m2_rate_card_list",
        parameters=[
            OpenApiParameter(
                name="service_area",
                type=OpenApiTypes.UUID,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Narrow to one city.",
            )
        ],
        description=(
            "Every published card, newest effective date first. This is the monthly review "
            "calendar's read and the only surface that publishes the three components, because "
            "reviewing a rate against the wage floor means seeing the wage part of it."
        ),
        responses={200: RateCardListSerializer, 403: ApiErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        raw_area = request.query_params.get("service_area")
        area_id: uuid.UUID | None = None
        if raw_area:
            try:
                area_id = uuid.UUID(raw_area)
            except ValueError as exc:
                raise ValidationError(
                    {"service_area": "Must be a UUID."}, code="invalid_service_area"
                ) from exc
        cards = rate_cards.published_rate_cards(service_area_id=area_id)
        return Response(
            RateCardListSerializer({"rate_cards": cards, "server_now": timezone.now()}).data
        )

    @extend_schema(
        tags=["M2 - Rate card"],
        operation_id="m2_rate_card_publish",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=RateCardPublishSerializer,
        description=(
            "Publish a day rate for one city and one statutory skill, effective from a date. A "
            "card is **loaded, never edited**: a booking made last week reconciles against the "
            "number it was made at, and raising a rate is one more row.\n\n"
            "Two refusals are the point of this endpoint. The wage component is checked against "
            "the statutory floor with the same fail-closed guard vendor quotes pass — a platform "
            "that refuses a vendor's rate for being below the floor and publishes its own below "
            "it has no rule at all. And a card cannot be **backdated under a live booking**, "
            "because that would retroactively change the number a live booking was priced at."
        ),
        responses={
            201: RateCardSerializer,
            400: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_proposal_below_wage_floor` when the wage component is under the "
                "statutory floor for that state and skill.",
            ),
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_wage_floor_unavailable` when no floor is loaded for the area's "
                "state and this skill, or when the area carries no state code — the check fails "
                "closed rather than being skipped. "
                "`m2_requirement_transition_not_allowed` when the effective date would land on or "
                "before a live booking made at the current rate.",
            ),
        },
    )
    def post(self, request: Request) -> Response:
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        serializer = RateCardPublishSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        def command() -> tuple[int, dict[str, object]]:
            try:
                card = rate_cards.publish_rate_card(
                    service_area_id=data["service_area_id"],
                    skill_id=data["skill_id"],
                    worker_day_wage_paise=int(data["worker_day_wage_paise"]),
                    supervision_margin_paise=int(data["supervision_margin_paise"]),
                    booking_fee_paise=int(data["booking_fee_paise"]),
                    standard_day_hours=int(data["standard_day_hours"]),
                    overtime_hourly_paise=int(data["overtime_hourly_paise"]),
                    inclusions=list(data["inclusions"]),
                    add_on_rates=dict(data["add_on_rates"]),
                    effective_from=data["effective_from"],
                    actor=actor,
                    source_reference=str(data["source_reference"]),
                )
            except (RequirementDomainError, PartnerDomainError) as exc:
                _raise_api_error(exc)
            except (ServiceArea.DoesNotExist, Skill.DoesNotExist) as exc:
                raise NotFound("That service area or skill does not exist.") from exc
            return status.HTTP_201_CREATED, cast(dict[str, object], RateCardSerializer(card).data)

        result = execute_idempotent(
            actor=actor,
            operation="m2.rate_card.publish",
            key=key,
            request_payload={key_name: str(value) for key_name, value in sorted(data.items())},
            command=command,
        )
        return Response(result.body, status=result.status_code)


class OperationsDeclineAlarmView(APIView):
    """The A3 decline-rate alarm, as a reading (`M2-BE-434`, `M2-BE-806`).

    Built in Wave C7 to close a hole that had no owner: the decline data was recorded from C4, the
    threshold has been an owner-blocked configuration column since C2R, and
    `sweep_rate_card_decline_alarm` has been paging Operations by email — but **nothing published a
    reading**, so the one signal that says A3 supply is failing could not be looked at on a screen.
    The Operations panel built against that gap correctly refused to show a green state, which is
    the right behaviour for a missing endpoint and a bad thing to leave permanently true.
    """

    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["M2 - Rate card"],
        operation_id="m2_operations_decline_alarm_read",
        description=(
            "Every live rate card's crew-offer decline rate over the alarm window, **including "
            "the cards no alarm can fire on**.\n\n"
            "`armed` is the field to build the panel around. `armed: false` means owner decision "
            "13 is still open for that card's skill and no alarm will ever fire for it — the rate "
            "is still measured and published, because measurement never waits on the owner, but "
            "rendering it as a healthy card would be a lie. `armed: true, breached: false` is the "
            "only green state, and `offers` below `minimum_offers` means a threshold exists and "
            "not enough offers have gone out for the rate to mean anything yet.\n\n"
            "The denominator is offers **sent**, not offers answered: a lead who ignores an offer "
            "until it expires is saying the same thing as one who declines it, and a rate measured "
            "only over explicit declines looks healthy in exactly the market where every lead has "
            "stopped answering.\n\n"
            "An empty `readings` list means no card is published at all, which is a different and "
            "worse state than every card being quiet."
        ),
        responses={200: RateCardDeclineAlarmListSerializer, 403: ApiErrorSerializer},
    )
    def get(self, _request: Request) -> Response:
        readings = crew_dispatch.decline_rate_readings(
            window_hours=crew_dispatch.DECLINE_ALARM_WINDOW_HOURS
        )
        return Response(
            RateCardDeclineAlarmListSerializer(
                {
                    "readings": readings,
                    "window_hours": crew_dispatch.DECLINE_ALARM_WINDOW_HOURS,
                    "armed_cards": sum(1 for reading in readings if reading.armed),
                    "breached_cards": sum(1 for reading in readings if reading.breached),
                    "server_now": timezone.now(),
                }
            ).data
        )
