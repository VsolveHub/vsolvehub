from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("rentals", "0005_rental_damage_line_type")]

    operations = [
        migrations.AddField(
            model_name="rentalbooking",
            name="policy_snapshot",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
