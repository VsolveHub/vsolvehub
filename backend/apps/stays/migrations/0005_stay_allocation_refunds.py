from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("stays", "0004_property_policy_no_show")]

    operations = [
        migrations.AddField(
            model_name="staypaymentallocation",
            name="refunded_paise",
            field=models.PositiveBigIntegerField(default=0),
        ),
        migrations.AddConstraint(
            model_name="staypaymentallocation",
            constraint=models.CheckConstraint(
                condition=models.Q(("refunded_paise__lte", models.F("amount_paise"))),
                name="stays_allocation_refund_lte_amount",
            ),
        ),
    ]
