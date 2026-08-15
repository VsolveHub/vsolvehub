"""Three small Partner-side surfaces that stand outside the enquiry itself.

The A5 visit-slot grid a vendor books a slot from, the workspace grants that decide which product
a Partner may work at all, and the masked demand preview shown to an account with no KYC. Kept in
one module because each is a handful of shapes with the same audience; the banners below name the
three seams.
"""

from typing import Any

from rest_framework import serializers

from apps.catalog.models import ServiceVariant

from .base import VISIT_NO_SHOW_PARTIES, VISIT_NO_SHOW_REASONS
from .engagements import VisitPlanShareSerializer
from .enquiries import SiteVisitSerializer

# ---------------------------------------------------------------------------
# Partner: A5 visit slots
# ---------------------------------------------------------------------------


class VisitSlotSerializer(serializers.Serializer[dict[str, Any]]):
    """One candidate start, in `booking/windows/` field order and with one field removed.

    `capacity` is deliberately absent. The A1 grid publishes it to a Customer choosing between
    Partners; this grid is scoped to the **one invited vendor**, so a capacity number here would be
    a live readout of that vendor's own diary depth and nothing a slot picker needs.
    """

    id = serializers.CharField(read_only=True)
    starts_at = serializers.DateTimeField(read_only=True)
    ends_at = serializers.DateTimeField(read_only=True)
    is_available = serializers.BooleanField(read_only=True)
    unavailable_reason = serializers.ChoiceField(
        choices=("PAST", "TOO_SOON", "OUTSIDE_OPERATING_WINDOW", "NO_CAPACITY"),
        read_only=True,
        allow_null=True,
    )


class VisitSlotDaySerializer(serializers.Serializer[dict[str, Any]]):
    date = serializers.DateField(read_only=True)
    is_today = serializers.BooleanField(read_only=True)
    slots = VisitSlotSerializer(many=True, read_only=True)


class VisitSlotGridSerializer(serializers.Serializer[dict[str, Any]]):
    """Candidate visit starts for one invited vendor.

    The Partner-side twin of `POST /api/v1/booking/windows/`, drawn from the same
    `carts.availability` snapshot and the same window loop. **The browser never computes
    availability** — it renders these slots and posts back an `id`, which is a signed token bound
    to this invitation and this start.
    """

    server_now = serializers.DateTimeField(read_only=True)
    visit_duration_minutes = serializers.IntegerField(read_only=True)
    availability_is_preliminary = serializers.BooleanField(read_only=True)
    timezone = serializers.CharField(read_only=True)
    days = VisitSlotDaySerializer(many=True, read_only=True)


class VisitSlotConfirmSerializer(serializers.Serializer[dict[str, Any]]):
    #: The opaque `id` of a slot this grid returned. Signed and bound to the invitation, so a
    #: vendor cannot book a competitor's slot or a time the grid never offered.
    slot_id = serializers.CharField(max_length=2000)


class VisitSlotConfirmationSerializer(serializers.Serializer[dict[str, Any]]):
    visit = SiteVisitSerializer(read_only=True)
    share = VisitPlanShareSerializer(read_only=True)
    #: True when this confirmation is the one that opens the Customer's plan checkout. The vendor
    #: sees a held slot rather than a scheduled one until that payment is verified, and the copy
    #: has to say so — the hold lapses harmlessly if the Customer never pays.
    opens_plan_checkout = serializers.BooleanField(read_only=True)
    server_now = serializers.DateTimeField(read_only=True)


class VisitArrivalSerializer(serializers.Serializer[dict[str, Any]]):
    """Arrival on the non-OTP fallback. No body: presence is the assertion, and who made it is
    the session."""


class VisitNoShowSerializer(serializers.Serializer[dict[str, Any]]):
    """Report that a scheduled visit did not happen.

    `party` decides the settlement and `reason_code` decides nothing — see `VISIT_NO_SHOW_REASONS`.
    The reason is still required, because "nobody turned up" without a cause is a row Operations
    cannot act on and a vendor cannot appeal.
    """

    party = serializers.ChoiceField(choices=VISIT_NO_SHOW_PARTIES)
    reason_code = serializers.ChoiceField(choices=VISIT_NO_SHOW_REASONS)


# ---------------------------------------------------------------------------
# Partner: workspace grants
# ---------------------------------------------------------------------------


class WorkspaceGrantSerializer(serializers.Serializer[dict[str, Any]]):
    """`{workspace_key, commercial_mode, actions[]}` and nothing else.

    No routes, no labels, no icons: the backend authorises, the frontend owns presentation. The
    key is opaque — a client that does not recognise one renders nothing rather than a generic
    tab, because a tab whose screens are not in the bundle is an unrecoverable dead end.
    """

    workspace_key = serializers.ChoiceField(
        choices=ServiceVariant.BookingArchetype.choices,
        read_only=True,
    )
    #: Read, never derived. ADR-0007 fixes A3 as LEAD_ONLY and A5 as MANAGED_PAYMENT_REQUIRED,
    #: which makes inferring it from the key tempting and wrong: this is the field that decides
    #: whether the UI promises Vsolve protection or tells a Partner to collect directly, and a
    #: client that computes it keeps promising protection straight through a policy change.
    commercial_mode = serializers.CharField(read_only=True)
    actions = serializers.ListField(child=serializers.CharField(), read_only=True)


class WorkspaceGrantListSerializer(serializers.Serializer[dict[str, Any]]):
    #: An empty list is a real, common state — registered but not yet reviewed — and must reach
    #: the client as `200 {"workspaces": []}` rather than a 403 that renders as an error.
    workspaces = WorkspaceGrantSerializer(many=True, read_only=True)


# ---------------------------------------------------------------------------
# Partner: masked demand preview
# ---------------------------------------------------------------------------


class DemandSummarySerializer(serializers.Serializer[dict[str, Any]]):
    """**This payload goes to a Partner who has completed no KYC.**

    An explicit field list, like `QuoteTeaserSerializer` and for the mirrored reason. Absent by
    requirement, not by omission: customer name, phone, full address, building number, the exact
    budget, and any identifier that resolves to a requirement this Partner was not invited to.

    `id` is a keyed hash rather than the requirement's primary key. An unapproved account holding
    real requirement ids is one lookup away from the record the moment any endpoint accepts one, and
    "no endpoint accepts one today" is not a property that survives the next endpoint.
    """

    id = serializers.CharField(read_only=True)
    headline = serializers.CharField(read_only=True)
    area_label = serializers.CharField(read_only=True)
    starts_on = serializers.DateField(read_only=True, allow_null=True)
    workspace_key = serializers.CharField(read_only=True)
    is_eligible = serializers.BooleanField(read_only=True)
    eligibility_hint = serializers.CharField(read_only=True)


class DemandPreviewSerializer(serializers.Serializer[dict[str, Any]]):
    #: Empty is a real answer. No demand in a Partner's city is `200` with `[]`, never a `404`.
    summaries = DemandSummarySerializer(many=True, read_only=True)
    matched_service_count = serializers.IntegerField(read_only=True)
    server_now = serializers.DateTimeField(read_only=True)
