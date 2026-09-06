import django.contrib.postgres.constraints
import django.contrib.postgres.fields.ranges
from django.contrib.postgres.operations import BtreeGistExtension
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("stays", "0011_stay_checkout_details")]

    operations = [
        BtreeGistExtension(),
        migrations.AlterField(
            model_name="propertypolicy",
            name="property",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="policies",
                to="stays.property",
            ),
        ),
        migrations.AddConstraint(
            model_name="propertypolicy",
            constraint=models.UniqueConstraint(
                fields=("property", "version"),
                name="stays_unique_property_policy_version",
            ),
        ),
        migrations.AddConstraint(
            model_name="propertypolicy",
            constraint=models.UniqueConstraint(
                condition=models.Q(("is_active", True)),
                fields=("property", "effective_from"),
                name="stays_one_active_property_policy",
            ),
        ),
        migrations.AddConstraint(
            model_name="unitpricingrule",
            constraint=django.contrib.postgres.constraints.ExclusionConstraint(
                condition=models.Q(("is_active", True)),
                expressions=(
                    ("unit_type", "="),
                    ("duration_mode", "="),
                    (
                        models.Func(
                            models.F("effective_from"),
                            models.F("effective_to"),
                            models.Value("[]"),
                            function="DATERANGE",
                            output_field=django.contrib.postgres.fields.ranges.DateRangeField(),
                        ),
                        "&&",
                    ),
                ),
                name="stays_pricing_rule_no_effective_overlap",
            ),
        ),
    ]
