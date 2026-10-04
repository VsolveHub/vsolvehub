from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("rental", "0011_rentaldisputephoto"),
    ]

    operations = [
        migrations.AddField(
            model_name="rentaldeposit",
            name="requested_consume_paise",
            field=models.PositiveIntegerField(
                blank=True,
                help_text=(
                    "Amount the partner asked to keep. Empty until a dispute is raised. "
                    "Money stays held until Operations decides."
                ),
                null=True,
            ),
        ),
    ]
