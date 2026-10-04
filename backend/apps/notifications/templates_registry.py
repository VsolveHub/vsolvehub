"""What each notification says, and the one place it is written.

## Why copy is not stored on the row

`NotificationIntent.context` deliberately holds the values a template needs and never the rendered
message. That decision has a consequence this module exists to serve: a feed row must be rendered
on the way **out**, from today's copy, not on the way in. A body frozen into a row in August is a
body still being shown in December, after the product stopped working that way — and it would put
a customer's address and a vendor's name into a table that has no need to hold either.

## Why an unknown template is refused at write time

Rendering happens while somebody is looking at their feed, which is the worst possible moment to
discover that a `template_code` was mistyped four weeks ago. `assert_template_registered` is
therefore called by `request_notification` when the channel is in-app: the write fails loudly at
the call site that got it wrong, and the read can never fail. The same reasoning as the outbox's
"a missing handler is a code defect, not a transient fault".

## Why a missing context key raises rather than degrading

A body reading "A crew is holding your dates for {headcount}" is worse than no notification at
all: it is visibly broken in the one surface whose whole job is to be trusted. `str.format` raising
`KeyError` here is the desired behaviour, re-raised as `NotificationTemplateError` so a caller can
tell a template fault from any other `KeyError`.
"""

from typing import Any, NamedTuple

__all__ = [
    "NotificationTemplateError",
    "RenderedNotification",
    "UnknownTemplateError",
    "assert_template_registered",
    "registered_template_codes",
    "render_notification",
]


class NotificationTemplateError(RuntimeError):
    """A notification could not be rendered from its stored context."""


class UnknownTemplateError(NotificationTemplateError):
    """A `template_code` that no registered template answers to."""

    def __init__(self, template_code: str) -> None:
        super().__init__(f"No notification template registered for {template_code!r}.")
        self.template_code = template_code


class RenderedNotification(NamedTuple):
    """One notification as a person reads it."""

    title: str
    body: str


#: `template_code` → (title, body). Both are `str.format` templates over the intent's context.
#:
#: House style for the copy itself: say what happened and what it means for the reader, in that
#: order, and never make the title carry the only information. A title is what arrives in a push
#: notification later; a body is what is read in the feed.
_TEMPLATES: dict[str, tuple[str, str]] = {
    # ---- A3: rate-card crews -------------------------------------------------------------
    #: The lead's push. Everything needed to say yes is in the title, because the offer lapses
    #: in minutes and a body is a tap away.
    "m2_crew_offer_invited": (
        "New job: {crew_size} · {days} days · {amount} to you",
        "Open it now — the first lead to answer gets it.",
    ),
    "m2_booking_fee_forfeited_partner": (
        "{amount} travel compensation added",
        "The customer cancelled late or did not show. Part of their booking fee is yours for "
        "the wasted trip; it lands in your earnings.",
    ),
    "m2_booking_fee_waived_partner": (
        "Confirmed — this job is yours",
        "You are the replacement crew on this job. There is no booking fee on a replacement, so "
        "nothing is waiting on the customer. The address is on the job page.",
    ),
    "m2_crew_vendor_no_show_partner": (
        "Reported as not arrived",
        "The customer says your crew did not come. The job has gone to another lead and this is "
        "recorded against your standing. If that is wrong, support can look at it.",
    ),
    "m2_engagement_opened_partner_crew": (
        "Confirmed — address unlocked",
        "The customer paid the booking fee. Open the job for the address and their number, and "
        "name the crew for day one.",
    ),
    "m2_shift_attendance_confirmed_partner": (
        "{workers_present} of {workers_expected} confirmed — collect {amount}",
        "The customer agreed today's count. Collect {amount} from them directly, then tap "
        '"Got paid" on the day.',
    ),
    "m2_shift_attendance_disputed_partner": (
        "The customer disagrees with today's count",
        "Today's day is not agreed. Support will call both of you; nothing changes on the other "
        "days.",
    ),
    "m2_cash_demand_reported_partner": (
        "A report was filed on this job",
        "The customer reported being asked for money outside the published rate. Support will "
        "call you. Anything owed on this job is held until they have.",
    ),
    "m2_crew_offer_accepted": (
        "A crew is holding your dates",
        "{partner_name} can send {headcount} for your job. They are holding the dates while you "
        "pay the booking fee — the hold does not last long.",
    ),
    "m2_booking_fee_charged_customer": (
        "Your crew is confirmed",
        "{partner_name} is booked. Pay the crew directly at the end of each day, at the published "
        "rate you agreed.",
    ),
    "m2_booking_fee_charged_partner": (
        "The customer paid — this job is yours",
        "The booking fee cleared, so this job is confirmed. Do not travel before the agreed day.",
    ),
    "m2_crew_vendor_no_show": (
        "Your crew did not arrive",
        "We have refunded your booking fee in full and started looking for another crew at no "
        "extra cost.",
    ),
    "m2_rate_card_fell_back": (
        "No crew accepted — moving you to quotes",
        "We could not confirm a crew at the published rate. Nothing has been charged. Vendors can "
        "now send you quotes instead.",
    ),
    # Sent where `m2_rate_card_fell_back` used to be sent automatically. The difference is the
    # whole point: this one reports a **pause**, not a product change, so the body has to say that
    # the request is untouched and name the ways out without picking one.
    "m2_rate_card_exhausted": (
        "No partner available right now",
        "Nobody accepted your job at the published rate. Nothing has been charged — open it to "
        "search wider, get quotes instead, or cancel.",
    ),
    # ---- A5: visit-first projects --------------------------------------------------------
    "m2_invitation_received": (
        "New customer enquiry",
        "A customer has sent a new enquiry. Open it now to accept or quote before the slot moves "
        "on.",
    ),
    #: The fixed-visit push. Like the crew offer's, the title carries everything needed to say
    #: yes, because the offer is first-accept-wins and a body is a tap away.
    "m2_fixed_visit_offer_received": (
        "New visit offer: {amount} to you",
        "A customer picked a visit time near you. First professional to take it gets it — open "
        "it now.",
    ),
    "m2_quote_wave_thin_supply": (
        "Fewer quotes than promised, for now",
        "We have invited every available professional and are still short of your quote count. "
        "The quotes already in are real — we keep inviting as professionals free up.",
    ),
    "m2_visit_plan_charged": (
        "Your site visits are booked",
        "Your visit plan is paid and {visit_count} scheduled. Each professional will estimate on "
        "site.",
    ),
    "m2_visit_booked_partner": (
        "The customer paid — your visit is confirmed",
        "The exact address is now in your visit workspace. Do not travel before the visit time.",
    ),
    "m2_proposal_rejected": (
        "Your quote was not selected",
        "The customer went another way on this request. Your slot is free again.",
    ),
    # ---- The shared engagement spine -----------------------------------------------------
    "m2_engagement_opened_customer": (
        "Your job is live",
        "Everything is agreed with {partner_name} and the job is open.",
    ),
    "m2_engagement_opened_partner": (
        "You won this job",
        "The customer chose your quote and the job is open — there is nothing to confirm. You can "
        "start work as the agreed schedule allows.",
    ),
    "m2_stage_awaiting_review": (
        "Work is waiting for your review",
        "{partner_name} submitted work for your approval. If you do not answer, it is approved "
        "automatically when the review window closes and the money is released.",
    ),
    "m2_stage_disputed": (
        "The customer raised a dispute",
        "Work on this job is disputed, so its payment is on hold until it is resolved.",
    ),
    "m2_amendment_authorized": (
        "The scope and price changed",
        "A change to this job was authorised. The agreed amount has moved accordingly.",
    ),
    "m2_cancellation_evaluated": (
        "A cancellation needs your answer",
        "The other party asked to cancel this job. Confirm it or dispute it — if you do nothing, "
        "it goes ahead when the window closes.",
    ),
    "m2_requirement_closed": (
        "Your request is closed",
        "This request has ended. Anything you paid that was not used has been refunded.",
    ),
    # ---- Capture and matching, the half the Customer used to hear nothing about --------------
    #
    # Everything from here down was added because the Customer's feed stayed empty through the
    # part of the journey they are most anxious during: they send a request, three vendors accept
    # it, quotes arrive — and nothing at all is said until money moves. Two of these notices
    # (`m2_invitation_accepted`, `m2_proposal_submitted`) needed a domain event to be emitted
    # before they could exist; see `matching.accept_invitation` and `proposals._announce_proposal`.
    "m2_requirement_submitted": (
        "Your request is on its way",
        "We are sending it to professionals near you. You will hear as soon as someone accepts, "
        "and nothing is charged for asking.",
    ),
    "m2_invitation_accepted": (
        "{partner_name} accepted your request",
        "They are taking one of the quote slots on this job. Nothing is charged yet — you choose "
        "who to go with once the quotes are in.",
    ),
    #: The one notice the whole A5 product turns on. It must say what arrived *and* what the
    #: Customer has to do next, because the price is deliberately a band until they unlock.
    "m2_proposal_submitted": (
        "{partner_name} sent you a quote",
        "Open your request to see the price, then unlock to read the full quote and contact them "
        "directly.",
    ),
    "m2_unlock_activated": (
        "Your quotes are unlocked",
        "You can now read every quote in full, see who sent it and contact them directly.",
    ),
    "m2_requirement_reclassified": (
        "We moved your request",
        "This job is a better fit for a different kind of service, so we have moved it. "
        "Everything you entered is still here and nothing extra is charged.",
    ),
    "m2_booking_fee_waived": (
        "No booking fee on this job",
        "We have waived the booking fee. Nothing has been charged for it.",
    ),
    # ---- A3: the working day -----------------------------------------------------------------
    "m2_shift_crew_assigned": (
        "Your crew for {shift_date} is named",
        "{partner_name} has assigned {crew_size} to that day. You can see who is coming on the "
        "job page.",
    ),
    "m2_shift_arrival_confirmed": (
        "Your crew has arrived",
        "Arrival is confirmed on site and the day has started.",
    ),
    "m2_shift_shortfall": (
        "Fewer workers arrived than agreed",
        "{workers_present} of {workers_expected} turned up. What you owe for the day has been "
        "adjusted to match what actually arrived.",
    ),
    "m2_shift_day_settled_customer": (
        "Today is settled",
        "You and {partner_name} both confirmed the day at {amount}. Pay the crew directly at the "
        "rate you agreed.",
    ),
    "m2_shift_day_settled_partner": (
        "The day is settled",
        "Both sides confirmed today at {amount}. Collect from the customer directly, as agreed.",
    ),
    # ---- A5: the project ---------------------------------------------------------------------
    "m2_project_handover_submitted": (
        "Your deliverables are ready to review",
        "{partner_name} submitted {deliverables} for your approval. Review them on the job page.",
    ),
    "m2_project_delay_claimed": (
        "{partner_name} asked for more time",
        "They have claimed {extension_days} extra day(s) on this project. Accept it or dispute it "
        "on the job page.",
    ),
    "m2_project_transfer_proposed": (
        "A replacement professional is proposed",
        "We have found someone who can take this project over. Review the change before it goes "
        "ahead — nothing moves until you answer.",
    ),
    "m2_project_transferred_customer": (
        "Your project moved to another professional",
        "{partner_name} has taken it over. Anything the previous vendor had not earned has been "
        "returned to you.",
    ),
    "m2_project_transferred_partner": (
        "This project has been transferred",
        "It has moved to another vendor. Nothing further is expected from you on it.",
    ),
    "m2_project_terminated_customer": (
        "This project was ended",
        "The project is closed. Anything you funded that nobody had earned has been refunded.",
    ),
    "m2_project_terminated_partner": (
        "This project was ended",
        "The project is closed. Anything you had already earned stays yours.",
    ),
    # ---- Endings and trouble -----------------------------------------------------------------
    "m2_cancellation_executed": (
        "The cancellation went through",
        "This job is cancelled. Any refund it earned has been issued.",
    ),
    "m2_cancellation_disputed": (
        "The cancellation is disputed",
        "Our team is looking at it. Nothing moves and no money changes hands until they decide.",
    ),
    "m2_engagement_completing_customer": (
        "The work is finished",
        "{partner_name} marked this job complete. Accept it or raise a problem — if you do "
        "nothing, it closes on its own when the window ends.",
    ),
    "m2_engagement_completing_partner": (
        "You marked this job complete",
        "The customer has been asked to accept it. If they do nothing, it closes when the review "
        "window ends.",
    ),
    "m2_engagement_redispatched": (
        "We found you another professional",
        "The previous vendor could not continue, so {partner_name} is taking this job on at the "
        "same rate. Nothing extra is charged.",
    ),
    "m2_engagement_capability_suspended": (
        "We had to pause your professional",
        "This vendor has been suspended. Anything you funded that nobody earned has been returned "
        "and we are arranging a replacement.",
    ),
    "m2_safety_incident_reported": (
        "A safety incident was reported",
        "It is logged and our team is on it. Work here may pause while they look into it.",
    ),
    "m2_proposal_revalidation_requested": (
        "Confirm your quote is still good",
        "This quote has been open a while. Reconfirm it so the customer can still choose it.",
    ),
    "booking_completed": (
        "Your booking is complete",
        "Your booking #{booking_id} is completed. Thank you for choosing V Solve Hub.",
    ),
    "stay_enquiry_responded": (
        "Host responded to your enquiry for {property_title}",
        "{host_name} replied: {response_text}",
    ),
    "stay_enquiry_confirmed": (
        "Your stay is booked",
        "{host_name} marked your enquiry for {property_title} as booked from {check_in}.",
    ),
    "stay_enquiry_received": (
        "New enquiry for {property_title}",
        "{guest_name} wants to stay from {check_in}. Open the enquiry to call them.",
    ),
    "stay_enquiry_declined": (
        "{property_title} isn't available",
        "{host_name} can't host you from {check_in}.{host_note}",
    ),
    "stay_enquiry_withdrawn": (
        "An enquiry was withdrawn",
        "{guest_name} withdrew their enquiry for {property_title}.",
    ),
    "stay_visit_requested": (
        "New visit request for {property_title}",
        "{guest_name} wants to visit on {visit_date}, {visit_time}. Accept or decline it.",
    ),
    "stay_visit_accepted": (
        "Your visit has been accepted",
        "{host_name} accepted your visit to {property_title} on {visit_date}, {visit_time}.",
    ),
    "stay_visit_declined": (
        "Schedule not accepted",
        "The owner has not accepted your visit to {property_title} on {visit_date}.{reason_text}",
    ),
    "stay_visit_cancelled": (
        "A visit was cancelled",
        "{guest_name} cancelled their visit to {property_title} on {visit_date}, {visit_time}.",
    ),
    # ---- A7: rentals -----------------------------------------------------------------
    #: Owner notifications
    "rental_new_booking": (
        "New booking: {asset_title}",
        "{customer_name} booked {asset_title} from {start_date} to {end_date}. "
        "Check the booking for their contact details.",
    ),
    "rental_new_enquiry": (
        "New rental enquiry",
        "{customer_name} wants to rent {asset_title} from {start_date} to {end_date}. "
        "Open the enquiry to call them.",
    ),
    "rental_quote_paid": (
        "Quote accepted — booking confirmed",
        "{customer_name} paid your quote for {asset_title}. Check the booking for details.",
    ),
    "rental_customer_claim_reply": (
        "Customer replied to your damage claim",
        "The customer replied to the damage claim on {asset_title}. Admin will review both sides.",
    ),
    "rental_admin_claim_decision_owner": (
        "Damage claim decided",
        "Admin approved ₹{approved_amount} from the deposit on {asset_title}. "
        "The amount has been credited to your earnings.",
    ),
    "rental_overdue_return_owner": (
        "Please confirm return",
        "{asset_title} was due back on {end_date}. Tap to confirm the return or report damage.",
    ),
    #: Customer notifications
    "rental_booking_confirmed": (
        "Booking confirmed",
        "Your rental of {asset_title} is confirmed from {start_date} to {end_date}. "
        "Your handover PIN is {pin}.",
    ),
    "rental_quote_received": (
        "You've received a quote",
        "The owner quoted ₹{total_amount} for {asset_title}. Tap to review and pay.",
    ),
    "rental_owner_not_available": (
        "Owner is not available",
        "The owner of {asset_title} is not available for your requested dates.",
    ),
    "rental_return_confirmed": (
        "Return confirmed — deposit refunded",
        "The owner confirmed the return of {asset_title}. Your deposit of ₹{deposit_amount} "
        "has been refunded.",
    ),
    "rental_claim_raised": (
        "The owner reported damage",
        "The owner of {asset_title} reported damage and is asking ₹{amount_asked}. "
        "You can reply with your own photos and note. Admin will make the final decision.",
    ),
    "rental_claim_decided_customer": (
        "Damage claim resolved",
        "₹{refund_amount} of your deposit on {asset_title} has been refunded. "
        "₹{deducted_amount} was approved for damage.",
    ),
    "rental_overdue_return_customer": (
        "Return overdue",
        "Your rental of {asset_title} was due back on {end_date}. If the return is not "
        "confirmed soon, your deposit will be refunded automatically.",
    ),
    #: Admin notifications
    "rental_new_claim": (
        "New damage claim to review",
        "A damage claim has been raised on {asset_title}. The owner is asking ₹{amount_asked}.",
    ),
    "rental_overdue_for_admin": (
        "Overdue rental return",
        "{asset_title} was due back on {end_date} and the owner has not confirmed the return.",
    ),
}


def registered_template_codes() -> frozenset[str]:
    """Every template code the feed can render. Used by tests to keep the registry honest."""

    return frozenset(_TEMPLATES)


def assert_template_registered(template_code: str) -> None:
    """Refuse a template code the feed could not render later.

    Raises `UnknownTemplateError`, which is a code defect rather than a runtime condition — see
    the module docstring for why it is refused here rather than at read time.
    """

    if template_code not in _TEMPLATES:
        raise UnknownTemplateError(template_code)


def render_notification(*, template_code: str, context: dict[str, Any]) -> RenderedNotification:
    """Render one notification from today's copy and the values stored with it."""

    assert_template_registered(template_code)
    title_template, body_template = _TEMPLATES[template_code]
    try:
        return RenderedNotification(
            title=title_template.format(**context),
            body=body_template.format(**context),
        )
    except KeyError as missing:
        raise NotificationTemplateError(
            f"Notification template {template_code!r} needs context key {missing.args[0]!r}."
        ) from missing
