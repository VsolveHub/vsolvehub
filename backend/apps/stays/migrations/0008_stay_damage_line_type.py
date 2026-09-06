from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("stays", "0007_stay_id_document_hash")]

    operations = [
        migrations.AlterField(
            model_name="stayreservationline",
            name="kind",
            field=models.CharField(
                choices=[
                    ("ROOM_CHARGE", "Room charge"),
                    ("MAINTENANCE_FEE", "Maintenance fee"),
                    ("SECURITY_DEPOSIT", "Refundable security deposit"),
                    ("ONE_TIME_CHARGE", "One-time agreement / verification fee"),
                    ("TAX", "Tax"),
                    ("DISCOUNT", "Discount"),
                    ("DAMAGE_SETTLEMENT", "Damage settlement recovery"),
                ],
                default="ROOM_CHARGE",
                max_length=24,
            ),
        ),
    ]
