from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("rentals", "0004_asset_reservation_quantity")]

    operations = [
        migrations.AlterField(
            model_name="rentalbookingline",
            name="line_type",
            field=models.CharField(
                choices=[
                    ("BASE_RENTAL", "Base rental fee"),
                    ("DELIVERY_FEE", "Delivery fee"),
                    ("DEPOSIT_HOLD", "Security deposit hold"),
                    ("TAX", "Tax"),
                    ("EXTENSION", "Extension fee"),
                    ("DAMAGE_SETTLEMENT", "Damage settlement recovery"),
                ],
                max_length=24,
            ),
        ),
    ]
