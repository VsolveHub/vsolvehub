from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("stays", "0003_stay_reservation_calendar_hold")]

    operations = [
        migrations.AddField(
            model_name="propertypolicy",
            name="no_show_grace_minutes",
            field=models.PositiveSmallIntegerField(default=120),
        ),
        migrations.AddField(
            model_name="propertypolicy",
            name="no_show_first_night_charge_basis_points",
            field=models.PositiveSmallIntegerField(default=10000),
        ),
        migrations.AddField(
            model_name="propertypolicy",
            name="no_show_deposit_forfeit_basis_points",
            field=models.PositiveSmallIntegerField(default=0),
        ),
        migrations.AddConstraint(
            model_name="propertypolicy",
            constraint=models.CheckConstraint(
                condition=models.Q(("no_show_first_night_charge_basis_points__lte", 10000)),
                name="stays_no_show_night_bps_lte_10000",
            ),
        ),
        migrations.AddConstraint(
            model_name="propertypolicy",
            constraint=models.CheckConstraint(
                condition=models.Q(("no_show_deposit_forfeit_basis_points__lte", 10000)),
                name="stays_no_show_deposit_bps_lte_10000",
            ),
        ),
    ]
