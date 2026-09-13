import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("cases", "0002_m2_recovery_and_operations"),
        ("listings", "0001_initial"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="operationscase",
            name="cases_exactly_one_subject",
        ),
        migrations.AddField(
            model_name="operationscase",
            name="listing",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="operations_cases",
                to="listings.listing",
            ),
        ),
        migrations.AddField(
            model_name="operationscase",
            name="application",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="operations_cases",
                to="listings.application",
            ),
        ),
        migrations.AlterField(
            model_name="operationscase",
            name="kind",
            field=models.CharField(
                choices=[
                    ("ASSIGNMENT", "Assignment or recovery"),
                    ("LATE_NO_SHOW", "Late or no-show"),
                    ("CUSTOMER_UNAVAILABLE", "Customer unavailable"),
                    ("PARTIAL_WORK", "Partial or aborted work"),
                    ("QUALITY", "Quality or warranty"),
                    ("SAFETY", "Safety or damage"),
                    ("PAYMENT", "Payment ambiguity"),
                    ("REFUND", "Refund ambiguity"),
                    ("PAYOUT", "Payout ambiguity"),
                    ("CANCELLATION_CONFLICT", "Conflicting cancellation claims"),
                    ("ATTENDANCE", "Disputed attendance"),
                    ("STAGE", "Disputed stage or milestone"),
                    ("OFF_PLATFORM", "Off-platform payment claim"),
                    ("CHARGEBACK", "Chargeback on a platform fee"),
                    ("LISTING_ABUSE", "Listing abuse"),
                    ("APPLICATION_ABUSE", "Application abuse"),
                ],
                max_length=24,
            ),
        ),
        migrations.AddConstraint(
            model_name="operationscase",
            constraint=models.CheckConstraint(
                condition=(
                    models.Q(
                        booking__isnull=False,
                        order__isnull=True,
                        partner__isnull=True,
                        requirement__isnull=True,
                        engagement__isnull=True,
                        listing__isnull=True,
                        application__isnull=True,
                    )
                    | models.Q(
                        booking__isnull=True,
                        order__isnull=False,
                        partner__isnull=True,
                        requirement__isnull=True,
                        engagement__isnull=True,
                        listing__isnull=True,
                        application__isnull=True,
                    )
                    | models.Q(
                        booking__isnull=True,
                        order__isnull=True,
                        partner__isnull=False,
                        requirement__isnull=True,
                        engagement__isnull=True,
                        listing__isnull=True,
                        application__isnull=True,
                    )
                    | models.Q(
                        booking__isnull=True,
                        order__isnull=True,
                        partner__isnull=True,
                        requirement__isnull=False,
                        engagement__isnull=True,
                        listing__isnull=True,
                        application__isnull=True,
                    )
                    | models.Q(
                        booking__isnull=True,
                        order__isnull=True,
                        partner__isnull=True,
                        requirement__isnull=True,
                        engagement__isnull=False,
                        listing__isnull=True,
                        application__isnull=True,
                    )
                    | models.Q(
                        booking__isnull=True,
                        order__isnull=True,
                        partner__isnull=True,
                        requirement__isnull=True,
                        engagement__isnull=True,
                        listing__isnull=False,
                        application__isnull=True,
                    )
                    | models.Q(
                        booking__isnull=True,
                        order__isnull=True,
                        partner__isnull=True,
                        requirement__isnull=True,
                        engagement__isnull=True,
                        listing__isnull=True,
                        application__isnull=False,
                    )
                ),
                name="cases_exactly_one_subject",
            ),
        ),
    ]
