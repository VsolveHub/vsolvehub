from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("stays", "0005_stay_allocation_refunds")]

    operations = [
        migrations.AddField(
            model_name="staycheckin",
            name="condition_photo_urls",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="staycheckout",
            name="condition_photo_urls",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
