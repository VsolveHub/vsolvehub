from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("catalog", "0021_alter_servicevariant_booking_archetype_and_more")]

    operations = [
        migrations.AddField(
            model_name="a7variantconfiguration",
            name="asset_profile_schema",
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text="JSON Schema for category-specific rental asset attributes.",
            ),
        ),
    ]
