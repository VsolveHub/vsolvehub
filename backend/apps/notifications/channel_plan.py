"""Which notices also go out on WhatsApp or SMS, and exactly what each one says.

## One table for the whole app

Every notice in the app is written once, through `request_notification`, as an in-app notice (or,
for a few, a push). `channel_router` copies a notice onto WhatsApp or SMS when, and only when, its
template code is a key here. Nothing else in the codebase decides which notices reach a phone, so
moving a notice between channels is an edit to this table and nothing more. The split was agreed
in the notification channel plan (WhatsApp for money, confirmations and decisions with a deadline;
SMS for the few that must land without data; everything else stays in-app and push).

## The text is the approved template

`Route.text` is the text submitted to Meta (WhatsApp) or registered on DLT (SMS), with `{name}`
for each value. It is written out here rather than derived from the in-app copy on purpose: an
approved template cannot change when somebody rewords a feed notice. `manage.py
channel_templates` prints every entry in the form each provider asks for.

- **WhatsApp.** Each `{name}` becomes `{{1}}`, `{{2}}` … in order of appearance; a name that
  appears twice takes two numbers and is sent twice. Every text starts with "V Solve Hub:" because
  Meta refuses a template that starts with a value. Optional fragments of the in-app copy (a
  host's note, a reason) are left out: Meta refuses an empty value.
- **SMS.** Each `{name}` is one DLT variable (`{#var#}`), at most 30 characters, sent to MSG91
  under the same name. The MSG91 template id comes from `settings.MSG91_TEMPLATE_IDS`.

Every `{name}` must be a value the source notice already carries. `tests/notifications/
test_channel_plan.py` checks that against the in-app and push copy, so a route can never ask for
a value its notice does not have.
"""

import re
from dataclasses import dataclass
from typing import Final

from .models import NotificationIntent

__all__ = ["PLAN", "Route", "route_for"]

WHATSAPP: Final[str] = NotificationIntent.Channel.WHATSAPP
SMS: Final[str] = NotificationIntent.Channel.SMS

_PLACEHOLDER = re.compile(r"\{([a-z0-9_]+)\}")


@dataclass(frozen=True, slots=True)
class Route:
    """One notice's copy on one more channel."""

    channel: str
    #: The approved template text, `{name}` for each value. See the module docstring.
    text: str

    @property
    def variables(self) -> tuple[str, ...]:
        """The context keys the text needs, in order of appearance, repeats included."""

        return tuple(_PLACEHOLDER.findall(self.text))


#: template code -> the one extra channel it goes out on. Grouped by area; each comment says who
#: receives it and its priority in the channel plan.
PLAN: Final[dict[str, Route]] = {
    # --- Jobs ------------------------------------------------------------------------------------
    # Job seeker · High priority
    "job_interview_invite": Route(
        WHATSAPP,
        "V Solve Hub: Interview invitation: {job_title}\n\n{business_name} invited you for "
        "an interview on {when} ({mode}). Accept or ask for another time.",
    ),
    # Employer · Medium priority
    "job_interview_reschedule": Route(
        WHATSAPP,
        "V Solve Hub: {candidate_name} asked for another time\n\nFor {job_title} on {when}. "
        "Propose a new time.",
    ),
    # Job seeker · Medium priority
    "job_invite": Route(
        WHATSAPP,
        "V Solve Hub: {business_name} invited you to apply\n\n{job_title} in {place}. Open "
        "the job to apply in one tap.",
    ),
    # --- M2 crews --------------------------------------------------------------------------------
    # Customer · High priority
    "m2_booking_fee_charged_customer": Route(
        WHATSAPP,
        "V Solve Hub: Your crew is confirmed\n\n{partner_name} is booked. Pay the crew "
        "directly at the end of each day, at the published rate you agreed.",
    ),
    # Partner · High priority
    "m2_booking_fee_charged_partner": Route(
        WHATSAPP,
        "V Solve Hub: The customer paid — this job is yours\n\nThe booking fee cleared, so "
        "this job is confirmed. Do not travel before the agreed day.",
    ),
    # Partner · Medium priority
    "m2_booking_fee_forfeited_partner": Route(
        WHATSAPP,
        "V Solve Hub: {amount} travel compensation added\n\nThe customer cancelled late or "
        "did not show. Part of their booking fee is yours for the wasted trip; it lands in "
        "your earnings.",
    ),
    # Partner · High priority
    "m2_booking_fee_waived_partner": Route(
        WHATSAPP,
        "V Solve Hub: Confirmed — this job is yours\n\nYou are the replacement crew on this "
        "job. There is no booking fee on a replacement, so nothing is waiting on the "
        "customer. The address is on the job page.",
    ),
    # Partner · High priority
    "m2_cash_demand_reported_partner": Route(
        WHATSAPP,
        "V Solve Hub: A report was filed on this job\n\nThe customer reported being asked "
        "for money outside the published rate. Support will call you. Anything owed on this "
        "job is held until they have.",
    ),
    # Customer · High priority
    "m2_crew_offer_accepted": Route(
        WHATSAPP,
        "V Solve Hub: A crew is holding your dates\n\n{partner_name} can send {headcount} "
        "for your job. They are holding the dates while you pay the booking fee — the hold "
        "does not last long.",
    ),
    # Customer · High priority
    "m2_crew_vendor_no_show": Route(
        WHATSAPP,
        "V Solve Hub: Your crew did not arrive\n\nWe have refunded your booking fee in full "
        "and started looking for another crew at no extra cost.",
    ),
    # Partner · Medium priority
    "m2_crew_vendor_no_show_partner": Route(
        WHATSAPP,
        "V Solve Hub: Reported as not arrived\n\nThe customer says your crew did not come. "
        "The job has gone to another lead and this is recorded against your standing. If "
        "that is wrong, support can look at it.",
    ),
    # Partner · High priority
    "m2_engagement_opened_partner_crew": Route(
        WHATSAPP,
        "V Solve Hub: Confirmed — address unlocked\n\nThe customer paid the booking fee. "
        "Open the job for the address and their number, and name the crew for day one.",
    ),
    # Customer · Medium priority
    "m2_rate_card_exhausted": Route(
        WHATSAPP,
        "V Solve Hub: No partner available right now\n\nNobody accepted your job at the "
        "published rate. Nothing has been charged — open it to search wider, get quotes "
        "instead, or cancel.",
    ),
    # Partner · Medium priority
    "m2_shift_attendance_disputed_partner": Route(
        WHATSAPP,
        "V Solve Hub: The customer disagrees with today's count\n\nToday's day is not "
        "agreed. Support will call both of you; nothing changes on the other days.",
    ),
    # Customer · Medium priority
    "m2_shift_shortfall": Route(
        WHATSAPP,
        "V Solve Hub: Fewer workers arrived than agreed\n\n{workers_present} of "
        "{workers_expected} turned up. What you owe for the day has been adjusted to match "
        "what actually arrived.",
    ),
    # --- M2 projects -----------------------------------------------------------------------------
    # Customer + Partner · High priority
    "m2_safety_incident_reported": Route(
        SMS,
        "V Solve Hub: A safety incident was reported on your job. Our team is on it and work "
        "may pause. Open the app for details.",
    ),
    # Customer + Partner · Medium priority
    "m2_amendment_authorized": Route(
        WHATSAPP,
        "V Solve Hub: The scope and price changed\n\nA change to this job was authorised. "
        "The agreed amount has moved accordingly.",
    ),
    # Customer + Partner · High priority
    "m2_cancellation_evaluated": Route(
        WHATSAPP,
        "V Solve Hub: A cancellation needs your answer\n\nThe other party asked to cancel "
        "this job. Confirm it or dispute it — if you do nothing, it goes ahead when the "
        "window closes.",
    ),
    # Customer + Partner · High priority
    "m2_cancellation_executed": Route(
        WHATSAPP,
        "V Solve Hub: The cancellation went through\n\nThis job is cancelled. Any refund it "
        "earned has been issued.",
    ),
    # Customer · High priority
    "m2_engagement_capability_suspended": Route(
        WHATSAPP,
        "V Solve Hub: We had to pause your professional\n\nThis vendor has been suspended. "
        "Anything you funded that nobody earned has been returned and we are arranging a "
        "replacement.",
    ),
    # Customer · High priority
    "m2_engagement_completing_customer": Route(
        WHATSAPP,
        "V Solve Hub: The work is finished\n\n{partner_name} marked this job complete. "
        "Accept it or raise a problem — if you do nothing, it closes on its own when the "
        "window ends.",
    ),
    # Customer · High priority
    "m2_engagement_opened_customer": Route(
        WHATSAPP,
        "V Solve Hub: Your job is live\n\nEverything is agreed with {partner_name} and the "
        "job is open.",
    ),
    # Partner · High priority
    "m2_engagement_opened_partner": Route(
        WHATSAPP,
        "V Solve Hub: You won this job\n\nThe customer chose your quote and the job is open "
        "— there is nothing to confirm. You can start work as the agreed schedule allows.",
    ),
    # Customer · High priority
    "m2_engagement_redispatched": Route(
        WHATSAPP,
        "V Solve Hub: We found you another professional\n\nThe previous vendor could not "
        "continue, so {partner_name} is taking this job on at the same rate. Nothing extra "
        "is charged.",
    ),
    # Customer · Medium priority
    "m2_project_delay_claimed": Route(
        WHATSAPP,
        "V Solve Hub: {partner_name} asked for more time\n\nThey have claimed "
        "{extension_days} extra day(s) on this project. Accept it or dispute it on the job "
        "page.",
    ),
    # Customer · Medium priority
    "m2_project_handover_submitted": Route(
        WHATSAPP,
        "V Solve Hub: Your deliverables are ready to review\n\n{partner_name} submitted "
        "{deliverables} for your approval. Review them on the job page.",
    ),
    # Customer · High priority
    "m2_project_terminated_customer": Route(
        WHATSAPP,
        "V Solve Hub: This project was ended\n\nThe project is closed. Anything you funded "
        "that nobody had earned has been refunded.",
    ),
    # Partner · High priority
    "m2_project_terminated_partner": Route(
        WHATSAPP,
        "V Solve Hub: This project was ended\n\nThe project is closed. Anything you had "
        "already earned stays yours.",
    ),
    # Customer · High priority
    "m2_project_transfer_proposed": Route(
        WHATSAPP,
        "V Solve Hub: A replacement professional is proposed\n\nWe have found someone who "
        "can take this project over. Review the change before it goes ahead — nothing moves "
        "until you answer.",
    ),
    # Customer · Medium priority
    "m2_project_transferred_customer": Route(
        WHATSAPP,
        "V Solve Hub: Your project moved to another professional\n\n{partner_name} has taken "
        "it over. Anything the previous vendor had not earned has been returned to you.",
    ),
    # Partner · Medium priority
    "m2_project_transferred_partner": Route(
        WHATSAPP,
        "V Solve Hub: This project has been transferred\n\nIt has moved to another vendor. "
        "Nothing further is expected from you on it.",
    ),
    # Customer · High priority
    "m2_stage_awaiting_review": Route(
        WHATSAPP,
        "V Solve Hub: Work is waiting for your review\n\n{partner_name} submitted work for "
        "your approval. If you do not answer, it is approved automatically when the review "
        "window closes and the money is released.",
    ),
    # Partner · High priority
    "m2_stage_disputed": Route(
        WHATSAPP,
        "V Solve Hub: The customer raised a dispute\n\nWork on this job is disputed, so its "
        "payment is on hold until it is resolved.",
    ),
    # Partner · High priority
    "m2_visit_booked_partner": Route(
        WHATSAPP,
        "V Solve Hub: The customer paid — your visit is confirmed\n\nThe exact address is "
        "now in your visit workspace. Do not travel before the visit time.",
    ),
    # Customer · High priority
    "m2_visit_plan_charged": Route(
        WHATSAPP,
        "V Solve Hub: Your site visits are booked\n\nYour visit plan is paid and "
        "{visit_count} scheduled. Each professional will estimate on site.",
    ),
    # --- Partner account -------------------------------------------------------------------------
    # Partner · Medium priority
    "partner_account_offboarded": Route(
        WHATSAPP,
        "V Solve Hub: Your partner account is closed\n\nYou will not get new work, and your "
        "listings are hidden. Contact support if you have questions.",
    ),
    # Partner · Medium priority
    "partner_account_reinstated": Route(
        WHATSAPP,
        "V Solve Hub: Your partner account is active again\n\nYou can take work again, and "
        "your listings are back on the app.",
    ),
    # Partner · High priority
    "partner_account_suspended": Route(
        WHATSAPP,
        "V Solve Hub: Your partner account is paused\n\nYou will not get new work, and your "
        "listings are hidden, until it is reinstated. Contact support to find out more.",
    ),
    # --- Partner onboarding ----------------------------------------------------------------------
    # Partner applicant · High priority
    "partner_application_approved": Route(
        WHATSAPP,
        "V Solve Hub: You are approved\n\nYour Vsolve Hub partner account is active. Open "
        "the app to set up and start taking work.",
    ),
    # Partner applicant · High priority
    "partner_application_changes_required": Route(
        WHATSAPP,
        "V Solve Hub: Changes needed on your application\n\nOperations asked for changes: "
        "“{reason}”. Open your application, fix them and send it again.",
    ),
    # Partner applicant · Medium priority
    "partner_application_declined": Route(
        WHATSAPP,
        "V Solve Hub: Your application was not approved\n\nWe cannot approve your partner "
        "application. If you think this is a mistake, contact support.",
    ),
    # Partner applicant · High priority
    "partner_document_rejected": Route(
        WHATSAPP,
        "V Solve Hub: Replace your {document}\n\n{reason}. Open your application to upload a "
        "new file.",
    ),
    # --- Rentals ---------------------------------------------------------------------------------
    # Customer · High priority
    "rental_out_for_delivery": Route(
        SMS,
        "V Solve Hub: {asset_title} is out for delivery. Keep your handover PIN ready.",
    ),
    # Customer · High priority
    "rental_overdue_return_customer": Route(
        SMS,
        "V Solve Hub: Your rental of {asset_title} was due back on {end_date}. Please return "
        "it to the owner as soon as you can.",
    ),
    # Owner · Medium priority
    "rental_admin_claim_decision_owner": Route(
        WHATSAPP,
        "V Solve Hub: Damage claim decided\n\nAdmin approved ₹{approved_amount} from the "
        "deposit on {asset_title}. The amount has been credited to your earnings.",
    ),
    # Customer · High priority
    "rental_booking_cancelled_customer": Route(
        WHATSAPP,
        "V Solve Hub: Rental booking cancelled\n\nYour booking for {asset_title} "
        "({start_date} to {end_date}) was cancelled. Anything you paid will be refunded.",
    ),
    # Owner · Medium priority
    "rental_booking_cancelled_owner": Route(
        WHATSAPP,
        "V Solve Hub: Booking cancelled: {asset_title}\n\nThe booking for {asset_title} from "
        "{start_date} to {end_date} was cancelled. Those dates are free again.",
    ),
    # Customer · High priority
    "rental_booking_confirmed": Route(
        WHATSAPP,
        "V Solve Hub: Booking confirmed\n\nYour rental of {asset_title} is confirmed from "
        "{start_date} to {end_date}. Your handover PIN is {pin}. Show it at handover.",
    ),
    # Customer · High priority
    "rental_claim_decided_customer": Route(
        WHATSAPP,
        "V Solve Hub: Damage claim resolved\n\n₹{refund_amount} of your deposit on "
        "{asset_title} has been refunded. ₹{deducted_amount} was approved for damage.",
    ),
    # Customer · High priority
    "rental_claim_raised": Route(
        WHATSAPP,
        "V Solve Hub: The owner reported damage\n\nThe owner of {asset_title} reported "
        "damage and is asking ₹{amount_asked} from your deposit. Our team will review it and "
        "let you know the decision.",
    ),
    # Customer · Medium priority
    "rental_claim_rejected_customer": Route(
        WHATSAPP,
        "V Solve Hub: Damage claim turned down\n\nOur team reviewed the owner's claim on "
        "{asset_title} and turned it down. Your full deposit of ₹{deposit_amount} is being "
        "refunded.",
    ),
    # Customer · Medium priority
    "rental_delivery_declined": Route(
        WHATSAPP,
        "V Solve Hub: Delivery not available\n\nThe owner can't deliver {asset_title}. You "
        "can switch to self pickup or cancel. Nothing has been charged.",
    ),
    # Customer · Medium priority
    "rental_delivery_quoted": Route(
        WHATSAPP,
        "V Solve Hub: Delivery price received\n\nThe owner quoted ₹{quote_amount} to deliver "
        "{asset_title}. Accept it to pay and confirm, or turn it down.",
    ),
    # Owner · High priority
    "rental_delivery_requested": Route(
        WHATSAPP,
        "V Solve Hub: Delivery requested: {asset_title}\n\nA customer wants {asset_title} "
        "delivered. Send your transport price before the request expires.",
    ),
    # Customer · Medium priority
    "rental_handed_over_customer": Route(
        WHATSAPP,
        "V Solve Hub: Your rental has started\n\n{asset_title} has been handed over to you. "
        "Please return it by {end_date}. Open the app for the rental details.",
    ),
    # Owner · High priority
    "rental_new_booking": Route(
        WHATSAPP,
        "V Solve Hub: New booking: {asset_title}\n\n{customer_name} booked {asset_title} "
        "from {start_date} to {end_date}. Check the booking for their contact details.",
    ),
    # Owner · High priority
    "rental_new_enquiry": Route(
        WHATSAPP,
        "V Solve Hub: New rental enquiry\n\n{customer_name} wants to rent {asset_title} from "
        "{start_date} to {end_date}. Open the enquiry to call them.",
    ),
    # Owner · Medium priority
    "rental_overdue_return_owner": Route(
        WHATSAPP,
        "V Solve Hub: Please confirm return\n\n{asset_title} was due back on {end_date}. Tap "
        "to confirm the return or report damage.",
    ),
    # Customer · Medium priority
    "rental_owner_not_available": Route(
        WHATSAPP,
        "V Solve Hub: Owner is not available\n\nThe owner of {asset_title} is not available "
        "for your requested dates.",
    ),
    # Owner · High priority
    "rental_quote_paid": Route(
        WHATSAPP,
        "V Solve Hub: Quote accepted — booking confirmed\n\n{customer_name} paid your quote "
        "for {asset_title}. Check the booking for details.",
    ),
    # Customer · High priority
    "rental_quote_received": Route(
        WHATSAPP,
        "V Solve Hub: You've received a quote\n\nThe owner quoted ₹{total_amount} for "
        "{asset_title}. Tap to review and pay.",
    ),
    # Customer · High priority
    "rental_return_confirmed": Route(
        WHATSAPP,
        "V Solve Hub: Return confirmed — deposit refunded\n\nThe owner confirmed the return "
        "of {asset_title}. Your deposit of ₹{deposit_amount} has been refunded.",
    ),
    # --- Service bookings ------------------------------------------------------------------------
    # Customer · High priority
    "customer_visit_arrived": Route(
        SMS,
        "V Solve Hub: {partner_name} has arrived. Open your booking in the app for the start code.",
    ),
    # Customer · High priority
    "customer_visit_en_route": Route(
        SMS,
        "V Solve Hub: {partner_name} is on the way for your {service}. Please keep your "
        "phone close.",
    ),
    # Partner · High priority
    "partner_job_cancelled": Route(
        SMS,
        "V Solve Hub: A job you were holding has been cancelled. Please do not travel to it. "
        "Open the app for details.",
    ),
    # Partner · High priority
    "partner_visit_time_to_leave": Route(
        SMS,
        "V Solve Hub: Time to leave for {service}. The visit starts at {time}. Open the app "
        "for the address and route.",
    ),
    # Customer · High priority
    "booking_downgraded_to_scheduled": Route(
        WHATSAPP,
        "V Solve Hub: Instant booking moved to scheduled\n\nNo technician was available for "
        "immediate dispatch. Your booking #{booking_id} has been moved to our next available "
        "scheduled slot.",
    ),
    # Customer · High priority
    "customer_booking_confirmed": Route(
        WHATSAPP,
        "V Solve Hub: Booking confirmed: {service}\n\nPayment received. {partner_name} will "
        "visit on {when}. Open the app for your booking details.",
    ),
    # Customer · High priority
    "customer_booking_unstaffable": Route(
        WHATSAPP,
        "V Solve Hub: We could not find a professional\n\nOpen your booking to see your options.",
    ),
    # Customer · High priority
    "customer_visit_work_submitted": Route(
        WHATSAPP,
        "V Solve Hub: Check the work and confirm\n\n{partner_name} has finished your "
        "{service}. Confirm it, or tell us if something is wrong.",
    ),
    # Partner · High priority
    "partner_booking_confirmed": Route(
        WHATSAPP,
        "V Solve Hub: Booking confirmed: {service}\n\n{when}. The customer has paid. Open "
        "the job for the details.",
    ),
    # --- Stays -----------------------------------------------------------------------------------
    # Guest · High priority
    "stay_enquiry_confirmed": Route(
        WHATSAPP,
        "V Solve Hub: Your stay is booked\n\n{host_name} marked your enquiry for "
        "{property_title} as booked from {check_in}. Open the app for the stay details.",
    ),
    # Guest · Medium priority
    "stay_enquiry_declined": Route(
        WHATSAPP,
        "V Solve Hub: {property_title} isn't available\n\n{host_name} can't host you from "
        "{check_in}. You can look for another stay in the app.",
    ),
    # Host · High priority
    "stay_enquiry_received": Route(
        WHATSAPP,
        "V Solve Hub: New enquiry for {property_title}\n\n{guest_name} wants to stay from "
        "{check_in}. Open the enquiry to call them.",
    ),
    # Guest · Medium priority
    "stay_enquiry_responded": Route(
        WHATSAPP,
        "V Solve Hub: Host responded to your enquiry for {property_title}\n\n{host_name} "
        'replied: "{response_text}" Open the enquiry in the app to answer.',
    ),
    # Guest · High priority
    "stay_visit_accepted": Route(
        WHATSAPP,
        "V Solve Hub: Your visit has been accepted\n\n{host_name} accepted your visit to "
        "{property_title} on {visit_date}, {visit_time}. Open the app for the address and details.",
    ),
    # Host · Medium priority
    "stay_visit_cancelled": Route(
        WHATSAPP,
        "V Solve Hub: A visit was cancelled\n\n{guest_name} cancelled their visit to "
        "{property_title} on {visit_date}, {visit_time}. Open the app for details.",
    ),
    # Guest · Medium priority
    "stay_visit_declined": Route(
        WHATSAPP,
        "V Solve Hub: Schedule not accepted\n\nThe owner has not accepted your visit to "
        "{property_title} on {visit_date}. You can request another time in the app.",
    ),
    # Host · High priority
    "stay_visit_requested": Route(
        WHATSAPP,
        "V Solve Hub: New visit request for {property_title}\n\n{guest_name} wants to visit "
        "on {visit_date}, {visit_time}. Accept or decline it.",
    ),
}


def route_for(template_code: str) -> Route | None:
    return PLAN.get(template_code)
