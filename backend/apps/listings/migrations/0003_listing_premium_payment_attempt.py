import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("commerce", "0012_a10_payment_purposes"),
        ("listings", "0002_application_duplicate_of_application_withdrawn_at_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="listing",
            name="payment_attempt",
            field=models.OneToOneField(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="premium_listing",
                to="commerce.paymentattempt",
            ),
        ),
        migrations.AddField(
            model_name="vendorsubscriptionplan",
            name="premium_price_paise",
            field=models.PositiveBigIntegerField(default=49900),
        ),
    ]
