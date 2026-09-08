import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("cases", "0005_operations_settlement_approval"),
        ("listings", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RemoveConstraint(model_name="operationscase", name="cases_exactly_one_subject"),
        migrations.AddField(
            model_name="operationscase",
            name="listing",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="operations_cases", to="listings.listing"),
        ),
        migrations.AddField(
            model_name="operationscase",
            name="application",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="operations_cases", to="listings.application"),
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
                    ("RENTAL_ASSET_RECOVERY", "Rental asset recovery"),
                    ("RENTAL_DEPOSIT_DISPUTE", "Rental deposit dispute"),
                    ("STAY_UNIT_RECOVERY", "Stay unit recovery"),
                    ("STAY_DAMAGE_DISPUTE", "Stay damage dispute"),
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
                    models.Q(("booking__isnull", False), ("engagement__isnull", True), ("order__isnull", True), ("partner__isnull", True), ("rental_booking__isnull", True), ("requirement__isnull", True), ("stay_reservation__isnull", True), ("listing__isnull", True), ("application__isnull", True))
                    | models.Q(("booking__isnull", True), ("engagement__isnull", True), ("order__isnull", False), ("partner__isnull", True), ("rental_booking__isnull", True), ("requirement__isnull", True), ("stay_reservation__isnull", True), ("listing__isnull", True), ("application__isnull", True))
                    | models.Q(("booking__isnull", True), ("engagement__isnull", True), ("order__isnull", True), ("partner__isnull", False), ("rental_booking__isnull", True), ("requirement__isnull", True), ("stay_reservation__isnull", True), ("listing__isnull", True), ("application__isnull", True))
                    | models.Q(("booking__isnull", True), ("engagement__isnull", True), ("order__isnull", True), ("partner__isnull", True), ("rental_booking__isnull", True), ("requirement__isnull", False), ("stay_reservation__isnull", True), ("listing__isnull", True), ("application__isnull", True))
                    | models.Q(("booking__isnull", True), ("engagement__isnull", False), ("order__isnull", True), ("partner__isnull", True), ("rental_booking__isnull", True), ("requirement__isnull", True), ("stay_reservation__isnull", True), ("listing__isnull", True), ("application__isnull", True))
                    | models.Q(("booking__isnull", True), ("engagement__isnull", True), ("order__isnull", True), ("partner__isnull", True), ("rental_booking__isnull", False), ("requirement__isnull", True), ("stay_reservation__isnull", True), ("listing__isnull", True), ("application__isnull", True))
                    | models.Q(("booking__isnull", True), ("engagement__isnull", True), ("order__isnull", True), ("partner__isnull", True), ("rental_booking__isnull", True), ("requirement__isnull", True), ("stay_reservation__isnull", False), ("listing__isnull", True), ("application__isnull", True))
                    | models.Q(("booking__isnull", True), ("engagement__isnull", True), ("order__isnull", True), ("partner__isnull", True), ("rental_booking__isnull", True), ("requirement__isnull", True), ("stay_reservation__isnull", True), ("listing__isnull", False), ("application__isnull", True))
                    | models.Q(("booking__isnull", True), ("engagement__isnull", True), ("order__isnull", True), ("partner__isnull", True), ("rental_booking__isnull", True), ("requirement__isnull", True), ("stay_reservation__isnull", True), ("listing__isnull", True), ("application__isnull", False))
                ),
                name="cases_exactly_one_subject",
            ),
        ),
    ]
