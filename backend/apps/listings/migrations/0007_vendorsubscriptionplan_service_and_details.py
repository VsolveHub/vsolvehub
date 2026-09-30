from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0021_a7_a9_archetypes"),
        ("listings", "0006_listing_salary_max_paise_listing_salary_min_paise_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="vendorsubscriptionplan",
            name="service",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="vendor_subscription_plans",
                to="catalog.service",
            ),
        ),
        migrations.AddField(
            model_name="vendorsubscriptionplan",
            name="details",
            field=models.TextField(blank=True),
        ),
    ]
