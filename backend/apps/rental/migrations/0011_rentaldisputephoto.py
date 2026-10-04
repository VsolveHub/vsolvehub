import uuid

import django.db.models.deletion
from django.db import migrations, models

import apps.foundation.storage
import apps.rental.models


class Migration(migrations.Migration):

    dependencies = [
        ("partners", "0018_a7_a9_archetypes"),
        ("rental", "0010_rentalasset_paused_status"),
    ]

    operations = [
        migrations.CreateModel(
            name="RentalDisputePhoto",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4, editable=False, primary_key=True, serialize=False
                    ),
                ),
                (
                    "stored_file",
                    models.FileField(
                        storage=apps.foundation.storage.private_file_storage,
                        upload_to=apps.rental.models.rental_dispute_upload_to,
                    ),
                ),
                ("original_name", models.CharField(max_length=180)),
                ("content_type", models.CharField(max_length=80)),
                ("size_bytes", models.PositiveIntegerField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "booking",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="dispute_photos",
                        to="rental.rentalbooking",
                    ),
                ),
                (
                    "partner",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="rental_dispute_photos",
                        to="partners.partnerprofile",
                    ),
                ),
            ],
            options={
                "ordering": ("created_at",),
            },
        ),
    ]
