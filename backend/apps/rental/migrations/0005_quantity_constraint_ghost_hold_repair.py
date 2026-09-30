"""Enforce quantity_available >= 1 and release ghost AssetReservation holds."""

from django.db import migrations, models


def repair_ghost_holds(apps, schema_editor):
    AssetReservation = apps.get_model("rental", "AssetReservation")
    # CANCELLED/RETURNED bookings that still hold CONFIRMED/TENTATIVE reservations
    # block stock (live orphan example: booking 9c07c4ca…).
    AssetReservation.objects.filter(
        status__in=("TENTATIVE", "CONFIRMED"),
        booking__status__in=("CANCELLED", "RETURNED"),
    ).update(status="RELEASED")


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("rental", "0004_rentalphotoupload"),
    ]

    operations = [
        migrations.RunPython(repair_ghost_holds, noop_reverse),
        migrations.AddConstraint(
            model_name="rentalasset",
            constraint=models.CheckConstraint(
                condition=models.Q(quantity_available__gte=1),
                name="rental_asset_quantity_available_gte_1",
            ),
        ),
    ]
