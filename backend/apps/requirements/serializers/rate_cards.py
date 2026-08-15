"""Wave C2R / revision 4: the rate-card A3 front door.

Operations publishes the card and watches its decline alarm; the Customer previews a price and
books at it; the lead receives the offer and accepts or declines. The boundary is the disclosure
rule in the banner below — the two audiences read the same booking through different shapes, and
neither shape may carry the other side's number.
"""

from typing import Any

from rest_framework import serializers

from apps.requirements.models import BookingFee, RateCard, RateCardBooking, VendorInvitation

from .base import VISIT_NO_SHOW_PARTIES

# ---------------------------------------------------------------------------
# Wave C2R / revision 4: the rate-card A3 front door.
#
# One disclosure rule runs through every shape below and it is the mirror of the teaser rule at the
# top of this file: **the Customer's screen never shows the lead's wage split, and the lead's
# screen never shows the Customer's all-inclusive rate.** The Customer is entitled to the whole
# number they pay and to how it divides between "paid to the crew" and "paid to Vsolve"; they are
# not entitled to the supervision margin, which is the mestri's livelihood. The lead is entitled to
# their own number and to nothing that includes this platform's fee, because a vendor shown a
# number they do not receive is a vendor who will argue about it on site.
# ---------------------------------------------------------------------------


class RateCardSerializer(serializers.ModelSerializer[RateCard]):
    """One published card, as Operations reads it back.

    The three components are published **on this surface only**. It is the Operations review
    calendar's read and the wage-floor cross-check happens against the same numbers, so hiding the
    split here would make the monthly review a screen you cannot review from.
    """

    lead_day_receipt_paise = serializers.IntegerField(read_only=True)

    class Meta:
        model = RateCard
        fields = (
            "id",
            "service_area",
            "skill",
            "worker_day_wage_paise",
            "supervision_margin_paise",
            "booking_fee_paise",
            "customer_day_rate_paise",
            "lead_day_receipt_paise",
            "standard_day_hours",
            "overtime_hourly_paise",
            "add_on_rates",
            "inclusions",
            "effective_from",
            "source_reference",
            "created_at",
        )
        read_only_fields = fields


class RateCardPublishSerializer(serializers.Serializer[dict[str, Any]]):
    """Operations publishes a card. Every value is required; none has a default.

    A default on any of these would be this file deciding a price, a shift length or an overtime
    rate. `effective_from` is required for the same reason: "today" is the one value a publisher
    should never get by omission, because it is the value that lands under live bookings.
    """

    service_area_id = serializers.UUIDField()
    skill_id = serializers.UUIDField()
    worker_day_wage_paise = serializers.IntegerField(min_value=1)
    supervision_margin_paise = serializers.IntegerField(min_value=1)
    booking_fee_paise = serializers.IntegerField(min_value=1)
    standard_day_hours = serializers.IntegerField(min_value=1, max_value=24)
    overtime_hourly_paise = serializers.IntegerField(min_value=1)
    #: What the preset's scope includes, in the Customer's words. Printed on the booking screen and
    #: frozen onto every booking made against this card.
    inclusions = serializers.ListField(child=serializers.CharField(max_length=200), min_length=1)
    #: Published add-on rates, keyed by add-on code, in paise. Extras run through the amendment
    #: engine at exactly these numbers.
    add_on_rates = serializers.DictField(child=serializers.IntegerField(min_value=1), default=dict)
    effective_from = serializers.DateField()
    source_reference = serializers.CharField(max_length=200, allow_blank=True, default="")


class RateCardListSerializer(serializers.Serializer[dict[str, Any]]):
    #: Empty is the honest answer while Operations has published nothing, and the reason instant
    #: booking is refused everywhere. Never a 404.
    rate_cards = RateCardSerializer(many=True, read_only=True)
    server_now = serializers.DateTimeField(read_only=True)


class RateCardDeclineAlarmSerializer(serializers.Serializer[Any]):
    """One card's decline-rate reading, and whether an alarm can fire on it at all.

    `armed` is the field the panel is built around, and it is published rather than inferred. Three
    states need three different sentences and only two of them are about the numbers:

    * `armed: true, breached: false` — a threshold is set and the rate is under it. Green.
    * `armed: false` — owner decision 13 is open for this card's skill, so **no alarm can ever
      fire**. The rate is still measured and published, because measurement never waits on the
      owner; only the judgement does. Rendering this as green would be a lie.
    * `armed: true, offers < minimum_offers` — a threshold is set and too few offers have gone out
      for a rate to mean anything. Quiet, but not yet evidence of anything.

    `threshold_basis_points` and `minimum_offers` are nullable precisely because an unarmed card has
    neither, and a zero in their place would read as "alarm on everything".
    """

    rate_card_id = serializers.UUIDField(source="card.id", read_only=True)
    service_area_slug = serializers.CharField(source="card.service_area.slug", read_only=True)
    skill_code = serializers.CharField(source="card.skill.code", read_only=True)
    skill_name = serializers.CharField(source="card.skill.name", read_only=True)
    customer_day_rate_paise = serializers.IntegerField(
        source="card.customer_day_rate_paise", read_only=True
    )
    armed = serializers.BooleanField(read_only=True)
    offers = serializers.IntegerField(read_only=True)
    declines = serializers.IntegerField(read_only=True)
    rate_basis_points = serializers.IntegerField(read_only=True)
    threshold_basis_points = serializers.IntegerField(read_only=True, allow_null=True)
    minimum_offers = serializers.IntegerField(read_only=True, allow_null=True)
    breached = serializers.BooleanField(read_only=True)


class RateCardDeclineAlarmListSerializer(serializers.Serializer[dict[str, Any]]):
    """The whole alarm board, plus the window every rate on it was measured over.

    `window_hours` is published rather than assumed by the client for the same reason the constant
    moved out of `tasks.py`: a screen showing a 24-hour rate beside a threshold that pages on a
    different window is worse than no screen.

    `armed_cards` is a count and not a filter. An operator's first question on the day A3 supply
    fails is "is anything watching this", and a list they have to count themselves answers it worse
    than a number does.
    """

    readings = RateCardDeclineAlarmSerializer(many=True, read_only=True)
    window_hours = serializers.IntegerField(read_only=True)
    armed_cards = serializers.IntegerField(read_only=True)
    breached_cards = serializers.IntegerField(read_only=True)
    server_now = serializers.DateTimeField(read_only=True)


class RatePreviewSerializer(serializers.Serializer[dict[str, Any]]):
    """What instant booking would cost, on the screen the Customer reads **before** booking.

    `total_customer_paise = lead_receipt_paise + booking_fee_paise`, server-calculated, so the two
    sentences the screen shows always add to the one number the Customer agrees to. The
    supervision margin is deliberately not here: the split the Customer needs is "to the crew" and
    "to Vsolve", not the lead's own business.
    """

    is_available = serializers.BooleanField(read_only=True)
    rate_card_id = serializers.UUIDField(read_only=True, allow_null=True)
    headcount = serializers.IntegerField(read_only=True, allow_null=True)
    days = serializers.IntegerField(read_only=True, allow_null=True)
    day_rate_paise = serializers.IntegerField(read_only=True, allow_null=True)
    total_customer_paise = serializers.IntegerField(read_only=True, allow_null=True)
    #: Paid directly to the lead at day end. **Vsolve never holds this money** and the screen must
    #: not imply otherwise — an A3 booking is not wage-protected and saying so is the promise this
    #: platform cannot keep.
    lead_receipt_paise = serializers.IntegerField(read_only=True, allow_null=True)
    booking_fee_paise = serializers.IntegerField(read_only=True, allow_null=True)
    standard_day_hours = serializers.IntegerField(read_only=True, allow_null=True)
    overtime_hourly_paise = serializers.IntegerField(read_only=True, allow_null=True)
    add_on_rates = serializers.DictField(
        child=serializers.IntegerField(), read_only=True, allow_null=True
    )
    inclusions = serializers.ListField(
        child=serializers.CharField(), read_only=True, allow_null=True
    )
    #: Why instant booking is unavailable, when it is. `m2_rate_card_unavailable` or
    #: `m2_policy_unavailable` — published as a state on a `200` rather than as an error, because
    #: the Customer can still submit this request; it will simply collect quotes instead.
    unavailable_code = serializers.CharField(read_only=True, allow_null=True)
    unavailable_reason = serializers.CharField(read_only=True, allow_null=True)
    server_now = serializers.DateTimeField(read_only=True)


class RateCardBookSerializer(serializers.Serializer[dict[str, Any]]):
    #: The same explicit override `POST /requirements/{id}/submit/` takes. A Customer who has been
    #: shown a probable duplicate and wants both is making a decision, not an error.
    allow_duplicate = serializers.BooleanField(default=False)


class RateCardBookingSerializer(serializers.ModelSerializer[RateCardBooking]):
    """The Customer's booking, frozen at the rate it was made at."""

    class Meta:
        model = RateCardBooking
        fields = (
            "id",
            "status",
            "headcount",
            "days",
            "day_rate_paise",
            "total_customer_paise",
            "lead_receipt_paise",
            "booking_fee_paise",
            "standard_day_hours",
            "overtime_hourly_paise",
            "add_on_rates",
            "inclusions",
            "wave",
            "hold_expires_at",
            "fallback_reason_code",
            "fell_back_at",
            "confirmed_at",
            "created_at",
        )
        read_only_fields = fields


class BookingFeeSerializer(serializers.ModelSerializer[BookingFee]):
    """The one online charge, and how it was settled.

    The forfeit split is published because the Customer is entitled to know where their money went
    when a booking they missed was settled: a travel-compensation share to the crew that travelled,
    and the remainder to Vsolve. Publishing zero for both on an unsettled fee is not a placeholder
    — it is the true amount so far.
    """

    class Meta:
        model = BookingFee
        fields = (
            "id",
            "status",
            "amount_paise",
            "travel_compensation_paise",
            "platform_share_paise",
            "receipt_series",
            "receipt_sequence",
            "settlement_reason_code",
            "failure_code",
            "activated_at",
            "earned_at",
            "settled_at",
        )
        read_only_fields = fields


class RateCardStateSerializer(serializers.Serializer[dict[str, Any]]):
    """The whole A3 instant path as one read: the price before, the crew and the fee after.

    One endpoint rather than three, for the reason `VisitPlanStateSerializer` gives: the screen
    that offers instant booking and the screen that tracks it are the same screen at two moments,
    and two endpoints would let them disagree about which booking the Customer has.
    """

    preview = RatePreviewSerializer(read_only=True)
    booking = RateCardBookingSerializer(read_only=True, allow_null=True)
    booking_fee = BookingFeeSerializer(read_only=True, allow_null=True)
    #: Mirrors `create_booking_fee_checkout`'s guard so the pay button can be disabled — never so
    #: the client can decide. The command re-checks under the booking's row lock.
    checkout_available = serializers.BooleanField(read_only=True)
    #: The lead holding this job, named only once the fee is verified. Before that the Customer
    #: sees that *a* crew is holding it and not who — vendor identity is released by the
    #: confirmation, not by the hold.
    confirmed_partner_id = serializers.UUIDField(read_only=True, allow_null=True)
    confirmed_partner_name = serializers.CharField(read_only=True, allow_null=True)
    server_now = serializers.DateTimeField(read_only=True)


class CrewOfferSerializer(serializers.Serializer[dict[str, Any]]):
    """One crew offer as the **lead** sees it (`M2-BE-435`).

    An explicit field list, like the teaser, and the omission is the point: there is no
    `total_customer_paise` and no `booking_fee_paise` here at any status. ADR-0009 fixes the offer
    screen as "what they receive per day for the requested crew, paid directly by the customer at
    day end", and a lead shown the Customer's all-inclusive number would reasonably expect to
    receive it.
    """

    invitation_id = serializers.UUIDField(read_only=True)
    requirement_id = serializers.UUIDField(read_only=True)
    #: The invitation's own status, published as the enum it has always been rather than as a bare
    #: string. `VendorInvitationStatusEnum` has been in the schema since 1.21.0; this field
    #: predates nothing and simply failed to say which vocabulary it speaks, so a client had to
    #: hardcode the values it was already generated types for.
    status = serializers.ChoiceField(
        choices=VendorInvitation.Status.choices,
        read_only=True,
    )
    #: Why this offer was declined, **as recorded**, once it has been. Empty on a live offer.
    #: Published so a decline confirmation can show what the server wrote rather than echoing what
    #: the client sent — the two are the same today and the point is that a screen should not have
    #: to assume so.
    decline_reason_code = serializers.CharField(read_only=True, allow_blank=True)
    headcount = serializers.IntegerField(read_only=True)
    days = serializers.IntegerField(read_only=True)
    #: **Your** number: what you receive per day for the whole requested crew.
    lead_day_receipt_paise = serializers.IntegerField(read_only=True)
    lead_total_receipt_paise = serializers.IntegerField(read_only=True)
    standard_day_hours = serializers.IntegerField(read_only=True)
    overtime_hourly_paise = serializers.IntegerField(read_only=True)
    inclusions = serializers.ListField(child=serializers.CharField(), read_only=True)
    #: Wall-clock, minutes away. A crew offer runs on the M1 dispatch clock, not business hours.
    responds_by = serializers.DateTimeField(read_only=True, allow_null=True)
    #: Your verified roster size, published so the refusal is explainable before it happens rather
    #: than after: an offer you cannot accept should say why on the screen that offers it.
    verified_roster_size = serializers.IntegerField(read_only=True)
    requested_start = serializers.DateTimeField(read_only=True, allow_null=True)
    area_label = serializers.CharField(read_only=True, allow_blank=True)
    server_now = serializers.DateTimeField(read_only=True)


class CrewOfferListSerializer(serializers.Serializer[dict[str, Any]]):
    #: Empty is a real answer — no live offers is the ordinary state — and must be `200 []`.
    offers = CrewOfferSerializer(many=True, read_only=True)
    server_now = serializers.DateTimeField(read_only=True)


class CrewOfferAcceptedSerializer(serializers.Serializer[dict[str, Any]]):
    """The job a lead just took, at **their** disclosure — not the Customer's booking row.

    This replaces `RateCardBooking` on the accept response, and the replacement is the point.
    `RateCardBooking` carries `total_customer_paise`, `booking_fee_paise` and `day_rate_paise` —
    the Customer's all-inclusive numbers, which include this platform's fee — and the crew-offer
    *list* is scrupulous about withholding all three. Returning them one call later, at the moment
    the lead commits, left the discipline resting on the client choosing not to render them.
    ADR-0009 fixes the offer screen as "what they receive per day for the requested crew"; a lead
    shown the Customer's total would reasonably expect to receive it, and that expectation is an
    argument on a site.

    Everything a lead needs to work the job is here. Nothing that describes what Vsolve charges is.
    """

    booking_id = serializers.UUIDField(read_only=True)
    requirement_id = serializers.UUIDField(read_only=True)
    status = serializers.ChoiceField(
        choices=RateCardBooking.Status.choices,
        read_only=True,
    )
    headcount = serializers.IntegerField(read_only=True)
    days = serializers.IntegerField(read_only=True)
    #: **Your** number, per day and for the whole job. Paid directly by the Customer at day end;
    #: Vsolve never holds it.
    lead_day_receipt_paise = serializers.IntegerField(read_only=True)
    lead_receipt_paise = serializers.IntegerField(read_only=True)
    standard_day_hours = serializers.IntegerField(read_only=True)
    overtime_hourly_paise = serializers.IntegerField(read_only=True)
    add_on_rates = serializers.DictField(child=serializers.IntegerField(), read_only=True)
    inclusions = serializers.ListField(child=serializers.CharField(), read_only=True)
    #: How long this job is yours while the Customer pays the booking fee. If they never do, the
    #: hold lapses, your standing is untouched and the cascade moves on.
    hold_expires_at = serializers.DateTimeField(read_only=True, allow_null=True)
    requested_start = serializers.DateTimeField(read_only=True, allow_null=True)
    server_now = serializers.DateTimeField(read_only=True)


#: Why a lead passed on a crew offer. Published as its own vocabulary rather than reusing
#: `INVITATION_DECLINE_REASONS`, because these answers are what the decline-rate alarm reads and
#: the one that matters most has no equivalent on a quote enquiry: **the rate is below the street
#: rate this week.** A vendor who can only say "no capacity" cannot tell Operations their price is
#: wrong, which is the single signal ADR-0009 says the instant product lives or dies on.
CREW_OFFER_DECLINE_REASONS = (
    ("RATE_TOO_LOW", "The published rate is below the going rate"),
    ("NO_CREW_AVAILABLE", "No crew free on those dates"),
    ("TOO_FAR", "Too far to travel"),
    ("SITE_UNSUITABLE", "The site or the work is not something we do"),
    ("OTHER", "Another reason"),
)


class CrewOfferDeclineSerializer(serializers.Serializer[dict[str, Any]]):
    #: Required. A decline with no reason is a data point that cannot distinguish "your price is
    #: wrong" from "I am on holiday", and the alarm depends on telling those apart.
    reason_code = serializers.ChoiceField(choices=CREW_OFFER_DECLINE_REASONS)
    note = serializers.CharField(max_length=500, allow_blank=True, default="")


#: What happened on day one. About the **fact**, never the settlement — `party` decides the money
#: and no dropdown may, which is the rule `VISIT_NO_SHOW_REASONS` established at 1.26.0.
CREW_NO_SHOW_REASONS = (
    ("customer_no_show", "Nobody was at the site"),
    ("gate_locked", "The site was locked"),
    ("vendor_no_show", "The crew did not arrive"),
)


class CrewNoShowSerializer(serializers.Serializer[dict[str, Any]]):
    #: Who was not there. **This field decides the money** — a vendor no-show refunds in full and
    #: re-dispatches free, a customer no-show forfeits and splits — which is why it is a required
    #: choice with no default and why the reason code below cannot move it.
    party = serializers.ChoiceField(choices=VISIT_NO_SHOW_PARTIES)
    reason_code = serializers.ChoiceField(choices=CREW_NO_SHOW_REASONS)
