# ruff: noqa: RUF012

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("requirements", "0015_proposal_json_encoder"),
    ]

    operations = [
        migrations.AddConstraint(
            model_name="sitevisit",
            constraint=models.UniqueConstraint(
                fields=("requirement", "scheduled_for"),
                condition=models.Q(
                    plan_share__isnull=False,
                    scheduled_for__isnull=False,
                    status__in=("REQUESTED", "SCHEDULED", "IN_PROGRESS", "COMPLETED"),
                ),
                name="requirements_one_plan_visit_per_time",
            ),
        ),
    ]
