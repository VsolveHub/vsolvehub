from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("requirements", "0029_stage_crew_role_code"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="ratecard",
            name="requirements_rate_card_components_positive",
        ),
        migrations.AddConstraint(
            model_name="ratecard",
            constraint=models.CheckConstraint(
                condition=(
                    models.Q(worker_day_wage_paise__gt=0)
                    & models.Q(supervision_margin_paise__gte=0)
                    & models.Q(booking_fee_paise__gt=0)
                ),
                name="requirements_rate_card_components_positive",
            ),
        ),
    ]
