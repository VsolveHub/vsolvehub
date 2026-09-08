from django.db import migrations, models


A10_PURPOSES = (
    "SCOPE_AMENDMENT_REVISION",
    "M2_QUOTE_UNLOCK",
    "M2_VISIT_PLAN",
    "M2_SITE_VISIT_FEE",
    "M2_STAGE_FUNDING",
    "M2_MATERIAL_ADVANCE",
    "M2_SCOPE_AMENDMENT",
    "M2_BOOKING_FEE",
    "A7_RENTAL_BOOKING",
    "A7_DEPOSIT_HOLD",
    "A7_DAMAGE_SETTLEMENT",
    "A7_EXTENSION",
    "A9_STAY_RESERVATION",
    "A9_DEPOSIT_HOLD",
    "A9_DAMAGE_SETTLEMENT",
    "A9_EXTENSION",
    "A10_VENDOR_SUBSCRIPTION",
    "A10_PREMIUM_LISTING",
)


class Migration(migrations.Migration):
    dependencies = [("commerce", "0013_remove_paymentattempt_commerce_payment_attempt_checkout_matches_purpose_and_more")]

    operations = [
        migrations.RemoveConstraint(
            model_name="paymentattempt",
            name="commerce_payment_attempt_checkout_matches_purpose",
        ),
        migrations.AlterField(
            model_name="paymentattempt",
            name="purpose",
            field=models.CharField(
                choices=[
                    ("BOOKING_GROUP", "Booking group"),
                    ("SCOPE_AMENDMENT_REVISION", "Scope amendment revision"),
                    ("M2_QUOTE_UNLOCK", "M2 quote unlock"),
                    ("M2_VISIT_PLAN", "M2 visit plan"),
                    ("M2_SITE_VISIT_FEE", "M2 site visit fee"),
                    ("M2_STAGE_FUNDING", "M2 stage funding"),
                    ("M2_MATERIAL_ADVANCE", "M2 material advance"),
                    ("M2_SCOPE_AMENDMENT", "M2 engagement scope amendment"),
                    ("M2_BOOKING_FEE", "M2 booking fee"),
                    ("A7_RENTAL_BOOKING", "A7 rental booking"),
                    ("A7_DEPOSIT_HOLD", "A7 deposit hold"),
                    ("A7_DAMAGE_SETTLEMENT", "A7 damage settlement"),
                    ("A7_EXTENSION", "A7 extension"),
                    ("A9_STAY_RESERVATION", "A9 stay reservation"),
                    ("A9_DEPOSIT_HOLD", "A9 deposit hold"),
                    ("A9_DAMAGE_SETTLEMENT", "A9 damage settlement"),
                    ("A9_EXTENSION", "A9 extension"),
                    ("A10_VENDOR_SUBSCRIPTION", "A10 vendor subscription"),
                    ("A10_PREMIUM_LISTING", "A10 premium listing"),
                ],
                default="BOOKING_GROUP",
                max_length=24,
            ),
        ),
        migrations.AddConstraint(
            model_name="paymentattempt",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    models.Q(("checkout__isnull", False), ("purpose", "BOOKING_GROUP")),
                    models.Q(("checkout__isnull", True), ("purpose__in", A10_PURPOSES)),
                    _connector="OR",
                ),
                name="commerce_payment_attempt_checkout_matches_purpose",
            ),
        ),
    ]
