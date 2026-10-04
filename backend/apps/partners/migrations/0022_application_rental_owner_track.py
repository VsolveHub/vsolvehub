"""Add RENTAL_OWNER to PartnerApplication.Track choices.

Mirrors STAY_HOST — an owner who rents out items goes through the same simplified
onboarding (name, agreements, ID) and gets A7_RENTAL capability on approval.
"""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("partners", "0021_application_track"),
    ]

    operations = [
        migrations.AlterField(
            model_name="partnerapplication",
            name="track",
            field=models.CharField(
                choices=[
                    ("SERVICES", "Offer services"),
                    ("STAY_HOST", "List my property"),
                    ("RENTAL_OWNER", "Rent out items"),
                ],
                default="SERVICES",
                max_length=16,
            ),
        ),
    ]
