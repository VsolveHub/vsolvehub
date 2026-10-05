"""Give rental item details (color, material, ...) starter choices as dropdown options."""

from django.db import migrations

from apps.rental.field_options import with_suggestions


def add_suggestions(apps, schema_editor):  # noqa: ARG001
    config_model = apps.get_model("catalog", "A7VariantConfiguration")
    for config in config_model.objects.all():
        updated = with_suggestions(config.asset_schema or {})
        if updated != config.asset_schema:
            config.asset_schema = updated
            config.save(update_fields=("asset_schema",))


class Migration(migrations.Migration):
    dependencies = [
        ("rental", "0013_rental_platform_fee"),
        ("catalog", "0023_a9_price_period_enquiry_only"),
    ]

    operations = [migrations.RunPython(add_suggestions, migrations.RunPython.noop)]
