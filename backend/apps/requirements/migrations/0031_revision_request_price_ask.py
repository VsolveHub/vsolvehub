"""The price ask: a Customer may say what they hope to pay.

Additive. No existing row moves — every `RevisionRequest` written before this carries a non-PRICE
reason code, and both new columns are null on all of them, which is exactly what the new
constraint requires of a non-price ask.

The two check constraints are the ones that keep the invariant honest: a discount figure exists on
a `PRICE` ask and nowhere else, and neither figure may exceed the 15% cap. Without the first, a
"leave the ceiling out" request could carry a number, and a number on a request nobody reads as
priced is how an ask silently becomes an offer.
"""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("requirements", "0030_allow_zero_rate_card_supervision"),
    ]

    operations = [
        migrations.AddField(
            model_name="revisionrequest",
            name="requested_discount_bps",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="revisionrequest",
            name="countered_discount_bps",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name="revisionrequest",
            name="reason_code",
            field=models.CharField(
                choices=[
                    ("LEAVE_OUT", "Leave something out"),
                    ("CHANGE_MATERIALS", "Change materials or finish"),
                    ("PHASE_WORK", "Split the work into phases"),
                    ("PRICE", "Asked about the price"),
                    ("OTHER", "Something else"),
                ],
                max_length=20,
            ),
        ),
        migrations.AddConstraint(
            model_name="revisionrequest",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    ("reason_code", "PRICE"),
                    ("requested_discount_bps__gte", 1),
                    ("requested_discount_bps__lte", 1500),
                )
                | models.Q(("reason_code", "PRICE"), _negated=True)
                & models.Q(("requested_discount_bps__isnull", True)),
                name="requirements_revision_request_discount_only_on_price_ask",
            ),
        ),
        migrations.AddConstraint(
            model_name="revisionrequest",
            constraint=models.CheckConstraint(
                condition=models.Q(("countered_discount_bps__isnull", True))
                | models.Q(
                    ("countered_discount_bps__gte", 0),
                    ("countered_discount_bps__lte", 1500),
                ),
                name="requirements_revision_request_counter_within_cap",
            ),
        ),
    ]
