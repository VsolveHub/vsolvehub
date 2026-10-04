"""Add PAUSED to RentalAsset.ModerationStatus choices.

Lets an owner temporarily hide an ad without losing moderation approval.
Active bookings on the asset continue unaffected.
"""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("rental", "0009_rentalasset_slug_required"),
    ]

    operations = [
        migrations.AlterField(
            model_name="rentalasset",
            name="moderation_status",
            field=models.CharField(
                choices=[
                    ("DRAFT", "Draft"),
                    ("PENDING", "Pending"),
                    ("APPROVED", "Approved"),
                    ("REJECTED", "Rejected"),
                    ("REMOVED", "Removed"),
                    ("PAUSED", "Paused"),
                ],
                default="DRAFT",
                max_length=16,
            ),
        ),
    ]
