"""Record which side of the platform each notice speaks to, and label the notices already sent.

One person can be a Customer and a Partner. Until now a notice recorded only its recipient, so the
customer app showed that person's partner notices too. New notices carry an audience from the code
that creates them; this migration labels the existing rows:

1. A template only ever written to one side gets that side. The map is taken from the M2 routes
   (`apps.requirements.notifications.NOTIFICATION_ROUTES`) and from each remaining call site.
   Templates sent to both sides (amendments, cancellations, safety incidents) are not in it.
2. Anything still unlabelled goes to CUSTOMER when its recipient holds no partner role: that is the
   only side they can be on.

Whatever is left (a shared template for someone who is both) stays blank, and the feed shows a
blank row on both sides rather than hide a notice nobody can place.
"""

from typing import Any

from django.db import migrations, models

CUSTOMER = "CUSTOMER"
PARTNER = "PARTNER"
OPERATIONS = "OPERATIONS"

ONE_SIDED_TEMPLATES: dict[str, str] = {
    # M2 routes (customer_template / partner_template / lead_only_partner_template).
    "m2_booking_fee_charged_customer": CUSTOMER,
    "m2_booking_fee_charged_partner": PARTNER,
    "m2_booking_fee_forfeited_partner": PARTNER,
    "m2_booking_fee_waived": CUSTOMER,
    "m2_booking_fee_waived_partner": PARTNER,
    "m2_cash_demand_reported_partner": PARTNER,
    "m2_crew_offer_accepted": CUSTOMER,
    "m2_crew_offer_invited": PARTNER,
    "m2_crew_vendor_no_show": CUSTOMER,
    "m2_crew_vendor_no_show_partner": PARTNER,
    "m2_engagement_capability_suspended": CUSTOMER,
    "m2_engagement_completing_customer": CUSTOMER,
    "m2_engagement_completing_partner": PARTNER,
    "m2_engagement_opened_customer": CUSTOMER,
    "m2_engagement_opened_partner": PARTNER,
    "m2_engagement_opened_partner_crew": PARTNER,
    "m2_engagement_redispatched": CUSTOMER,
    "m2_fixed_visit_offer_received": PARTNER,
    "m2_invitation_accepted": CUSTOMER,
    "m2_invitation_received": PARTNER,
    "m2_project_delay_claimed": CUSTOMER,
    "m2_project_handover_submitted": CUSTOMER,
    "m2_project_terminated_customer": CUSTOMER,
    "m2_project_terminated_partner": PARTNER,
    "m2_project_transfer_proposed": CUSTOMER,
    "m2_project_transferred_customer": CUSTOMER,
    "m2_project_transferred_partner": PARTNER,
    "m2_proposal_rejected": PARTNER,
    "m2_proposal_revalidation_requested": PARTNER,
    "m2_proposal_submitted": CUSTOMER,
    "m2_quote_wave_thin_supply": CUSTOMER,
    "m2_rate_card_exhausted": CUSTOMER,
    "m2_rate_card_fell_back": CUSTOMER,
    "m2_requirement_closed": CUSTOMER,
    "m2_requirement_reclassified": CUSTOMER,
    "m2_requirement_submitted": CUSTOMER,
    "m2_shift_arrival_confirmed": CUSTOMER,
    "m2_shift_attendance_confirmed_partner": PARTNER,
    "m2_shift_attendance_disputed_partner": PARTNER,
    "m2_shift_crew_assigned": CUSTOMER,
    "m2_shift_day_settled_customer": CUSTOMER,
    "m2_shift_day_settled_partner": PARTNER,
    "m2_shift_shortfall": CUSTOMER,
    "m2_stage_awaiting_review": CUSTOMER,
    "m2_stage_disputed": PARTNER,
    "m2_unlock_activated": CUSTOMER,
    "m2_visit_booked_partner": PARTNER,
    "m2_visit_plan_charged": CUSTOMER,
    # Operations alarms.
    "m2_chargeback_rate_alarm": OPERATIONS,
    "m2_rate_card_decline_alarm": OPERATIONS,
    "rental_overdue_for_admin": OPERATIONS,
    # Bookings and dispatch.
    "booking_completed": CUSTOMER,
    "booking_downgraded_to_scheduled": CUSTOMER,
    "customer_booking_unstaffable": CUSTOMER,
    "partner_offer_created": PARTNER,
    "partner_dispatch_offer": PARTNER,
    "partner_job_assigned": PARTNER,
    "partner_job_cancelled": PARTNER,
    # Partner onboarding and account.
    "partner_application_submitted": PARTNER,
    "partner_application_review_started": PARTNER,
    "partner_application_changes_required": PARTNER,
    "partner_application_approved": PARTNER,
    "partner_application_declined": PARTNER,
    "partner_document_rejected": PARTNER,
    "partner_account_suspended": PARTNER,
    "partner_account_reinstated": PARTNER,
    "partner_account_offboarded": PARTNER,
    # Job listings: the employer is the partner, the job seeker the customer.
    "job_application_received": PARTNER,
    "job_candidates_digest": PARTNER,
    "job_interview_accepted": PARTNER,
    "job_interview_declined": PARTNER,
    "job_application_update": CUSTOMER,
    "job_interview_invite": CUSTOMER,
    "job_invite": CUSTOMER,
    "job_match_new": CUSTOMER,
    # Rentals: the owner is the partner.
    "rental_new_booking": PARTNER,
    "rental_new_enquiry": PARTNER,
    "rental_quote_paid": PARTNER,
    "rental_overdue_return_owner": PARTNER,
    "rental_admin_claim_decision_owner": PARTNER,
    "rental_booking_confirmed": CUSTOMER,
    "rental_quote_received": CUSTOMER,
    "rental_owner_not_available": CUSTOMER,
    "rental_overdue_return_customer": CUSTOMER,
    "rental_claim_decided_customer": CUSTOMER,
    # Stays: the host is the partner.
    "stay_enquiry_received": PARTNER,
    "stay_enquiry_withdrawn": PARTNER,
    "stay_visit_requested": PARTNER,
    "stay_visit_cancelled": PARTNER,
    "stay_enquiry_confirmed": CUSTOMER,
    "stay_enquiry_declined": CUSTOMER,
    "stay_enquiry_responded": CUSTOMER,
    "stay_visit_accepted": CUSTOMER,
    "stay_visit_declined": CUSTOMER,
}


def label_existing_notices(apps: Any, schema_editor: Any) -> None:
    intent_model = apps.get_model("notifications", "NotificationIntent")
    user_role_model = apps.get_model("identity", "UserRole")
    unlabelled = intent_model.objects.filter(audience="")
    for template_code, audience in ONE_SIDED_TEMPLATES.items():
        unlabelled.filter(template_code=template_code).update(audience=audience)
    partner_users = user_role_model.objects.filter(
        role__code="partner", revoked_at__isnull=True
    ).values("user_id")
    intent_model.objects.filter(audience="").exclude(recipient_id__in=partner_users).update(
        audience=CUSTOMER
    )


class Migration(migrations.Migration):
    dependencies = [
        ("identity", "0005_alter_communicationpreference_channel"),
        ("notifications", "0007_pushnotificationpreference"),
    ]

    operations = [
        migrations.AddField(
            model_name="notificationintent",
            name="audience",
            field=models.CharField(
                blank=True,
                choices=[
                    ("CUSTOMER", "Customer"),
                    ("PARTNER", "Partner"),
                    ("OPERATIONS", "Operations"),
                ],
                default="",
                max_length=10,
            ),
        ),
        migrations.RunPython(label_existing_notices, migrations.RunPython.noop),
    ]
