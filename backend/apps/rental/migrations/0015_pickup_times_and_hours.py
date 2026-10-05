"""Rentals by date *and* time, and each partner's pickup hours.

Existing holds were whole days (start inclusive, end exclusive). They get 10:00
local on both ends, which keeps every old overlap exactly as it was.
"""

import datetime

import django.db.models.deletion
from django.db import migrations, models
from django.utils import timezone

LEGACY_HANDOVER = datetime.time(10, 0)


def _at(day: datetime.date) -> datetime.datetime:
    return timezone.make_aware(datetime.datetime.combine(day, LEGACY_HANDOVER))


def backfill(apps, schema_editor):
    for name in ("AssetReservation", "RentalBooking"):
        model = apps.get_model("rental", name)
        for row in model.objects.filter(pickup_at__isnull=True).iterator():
            row.pickup_at = _at(row.start_date)
            row.return_at = _at(row.end_date)
            row.save(update_fields=("pickup_at", "return_at"))


class Migration(migrations.Migration):
    dependencies = [
        ("partners", "0023_partnerapplication_employer_track"),
        ("rental", "0014_asset_field_suggestions"),
    ]

    operations = [
        migrations.AddField(
            model_name="assetreservation",
            name="pickup_at",
            field=models.DateTimeField(null=True),
        ),
        migrations.AddField(
            model_name="assetreservation",
            name="return_at",
            field=models.DateTimeField(null=True),
        ),
        migrations.AddField(
            model_name="rentalbooking",
            name="pickup_at",
            field=models.DateTimeField(null=True),
        ),
        migrations.AddField(
            model_name="rentalbooking",
            name="return_at",
            field=models.DateTimeField(null=True),
        ),
        migrations.RunPython(backfill, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="assetreservation",
            name="pickup_at",
            field=models.DateTimeField(),
        ),
        migrations.AlterField(
            model_name="assetreservation",
            name="return_at",
            field=models.DateTimeField(),
        ),
        migrations.AlterField(
            model_name="rentalbooking",
            name="pickup_at",
            field=models.DateTimeField(),
        ),
        migrations.AlterField(
            model_name="rentalbooking",
            name="return_at",
            field=models.DateTimeField(),
        ),
        migrations.AddIndex(
            model_name="assetreservation",
            index=models.Index(
                fields=["asset", "status", "pickup_at", "return_at"],
                name="rental_asse_asset_i_1240ae_idx",
            ),
        ),
        migrations.CreateModel(
            name="RentalPickupHours",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True, primary_key=True, serialize=False, verbose_name="ID"
                    ),
                ),
                ("open_days", models.JSONField(default=list)),
                ("opens_at", models.TimeField(default=datetime.time(9, 0))),
                ("closes_at", models.TimeField(default=datetime.time(20, 0))),
                ("min_notice_minutes", models.PositiveIntegerField(default=120)),
                ("max_advance_days", models.PositiveSmallIntegerField(default=60)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "partner",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="rental_pickup_hours",
                        to="partners.partnerprofile",
                    ),
                ),
            ],
        ),
    ]
