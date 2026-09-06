from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("rentals", "0003_rentalassetcategoryprofile")]

    operations = [
        migrations.AddField(
            model_name="assetreservation",
            name="reserved_quantity",
            field=models.PositiveIntegerField(
                default=1,
                help_text="Number of physical units held from a fungible pool; always 1 for serialized assets.",
            ),
        ),
        migrations.AddField(
            model_name="rentalbooking",
            name="quantity",
            field=models.PositiveIntegerField(default=1),
        ),
        migrations.AddConstraint(
            model_name="assetreservation",
            constraint=models.CheckConstraint(
                condition=models.Q(("reserved_quantity__gt", 0)),
                name="rentals_reservation_quantity_positive",
            ),
        ),
    ]
