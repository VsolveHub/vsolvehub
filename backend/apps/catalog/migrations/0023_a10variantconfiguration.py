import django.db.models.deletion
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("catalog", "0022_a7variantconfiguration_asset_profile_schema")]

    operations = [
        migrations.AlterField(
            model_name="servicevariant",
            name="booking_archetype",
            field=models.CharField(
                choices=[
                    ("LEGACY", "Legacy"),
                    ("A1_TASK_VISIT", "A1 task visit"),
                    ("A3_TIME_BLOCK", "A3 time block"),
                    ("A5_CUSTOM_PROJECT", "A5 custom project"),
                    ("A7_RENTAL", "A7 rental"),
                    ("A9_STAY", "A9 stay"),
                    ("A10_LISTING", "A10 listing"),
                ],
                default="LEGACY",
                max_length=24,
            ),
        ),
        migrations.CreateModel(
            name="A10VariantConfiguration",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("version", models.PositiveIntegerField(default=1)),
                ("status", models.CharField(choices=[("DRAFT", "Draft"), ("ACTIVE", "Active"), ("RETIRED", "Retired")], default="ACTIVE", max_length=16)),
                ("listing_type_schema", models.JSONField(blank=True, default=dict)),
                ("application_schema", models.JSONField(blank=True, default=dict)),
                ("application_cooldown_hours", models.PositiveSmallIntegerField(default=24)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("variant", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="a10_configurations", to="catalog.servicevariant")),
            ],
            options={"ordering": ("variant", "-version")},
        ),
        migrations.AddConstraint(
            model_name="a10variantconfiguration",
            constraint=models.UniqueConstraint(fields=("variant", "version"), name="catalog_unique_a10_variant_configuration_version"),
        ),
        migrations.AddConstraint(
            model_name="a10variantconfiguration",
            constraint=models.UniqueConstraint(condition=models.Q(("status", "ACTIVE")), fields=("variant",), name="catalog_unique_active_a10_variant_configuration"),
        ),
    ]
