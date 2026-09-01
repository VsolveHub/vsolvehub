from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("catalog", "0018_m2_material_fulfilment_mode"),
    ]

    operations = [
        migrations.AddField(
            model_name="m2variantconfiguration",
            name="fixed_visit_offer_timeout_seconds",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
    ]
