import django.core.serializers.json
from django.db import migrations, models


def populate_proposal_material_fulfilment_mode(apps, _schema_editor):
    proposal_model = apps.get_model("requirements", "Proposal")
    for proposal in proposal_model.objects.select_related(
        "requirement__configuration",
        "requirement__variant__service",
    ).all():
        configuration = proposal.requirement.configuration
        if configuration is not None and configuration.material_fulfilment_mode:
            mode = configuration.material_fulfilment_mode
        elif proposal.requirement.archetype == "A3_TIME_BLOCK":
            mode = "NOT_APPLICABLE"
        elif proposal.requirement.variant.service.slug == "event-lighting-decor":
            mode = "PARTNER_TURNKEY"
        else:
            mode = "CUSTOMER_PROCURES"
        proposal.material_fulfilment_mode = mode
        proposal.save(update_fields=("material_fulfilment_mode",))


class Migration(migrations.Migration):
    dependencies = [
        ("catalog", "0018_m2_material_fulfilment_mode"),
        ("requirements", "0027_price_book_shopping_list"),
    ]

    operations = [
        migrations.AddField(
            model_name="proposal",
            name="included_supply_list",
            field=models.JSONField(
                blank=True,
                default=list,
                encoder=django.core.serializers.json.DjangoJSONEncoder,
            ),
        ),
        migrations.AddField(
            model_name="proposal",
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
        migrations.RunPython(
            populate_proposal_material_fulfilment_mode,
            migrations.RunPython.noop,
        ),
        migrations.AlterField(
            model_name="proposal",
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
