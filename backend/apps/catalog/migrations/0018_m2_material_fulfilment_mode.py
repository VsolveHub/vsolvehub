from django.db import migrations, models


def populate_material_fulfilment_mode(apps, _schema_editor):
    configuration_model = apps.get_model("catalog", "M2VariantConfiguration")
    for configuration in configuration_model.objects.select_related("variant__service").all():
        archetype = configuration.variant.booking_archetype
        service_slug = configuration.variant.service.slug
        if archetype == "A3_TIME_BLOCK":
            mode = "NOT_APPLICABLE"
        elif service_slug == "event-lighting-decor":
            mode = "PARTNER_TURNKEY"
        else:
            mode = "CUSTOMER_PROCURES"
        configuration.material_fulfilment_mode = mode
        configuration.save(update_fields=("material_fulfilment_mode",))


class Migration(migrations.Migration):
    dependencies = [
        ("catalog", "0017_m2_configuration_pricing_skill"),
    ]

    operations = [
        migrations.AddField(
            model_name="m2variantconfiguration",
            name="material_fulfilment_mode",
            field=models.CharField(
                choices=[
                    ("NOT_APPLICABLE", "Not applicable"),
                    ("CUSTOMER_PROCURES", "Customer procures"),
                    ("PARTNER_TURNKEY", "Partner supplies turnkey"),
                ],
                max_length=24,
                null=True,
            ),
        ),
        migrations.RunPython(populate_material_fulfilment_mode, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="m2variantconfiguration",
            name="material_fulfilment_mode",
            field=models.CharField(
                choices=[
                    ("NOT_APPLICABLE", "Not applicable"),
                    ("CUSTOMER_PROCURES", "Customer procures"),
                    ("PARTNER_TURNKEY", "Partner supplies turnkey"),
                ],
                max_length=24,
            ),
        ),
    ]
