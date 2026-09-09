# Wave 2 step 4 (plan SS4): make Property.occupancy_model non-nullable after backfill (0015).

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("stays", "0016_backfill_unittype_occupancy_capacity"),
    ]

    operations = [
        migrations.AlterField(
            model_name="property",
            name="occupancy_model",
            field=models.CharField(
                choices=[
                    ("SHARED", "Shared occupancy (PG / Hostel / Co-Living)"),
                    ("ENTIRE_UNIT", "Entire unit (Apartment / Villa / etc.)"),
                    ("HOTEL_ROOM", "Hotel room (reserved -- unused by any code path yet)"),
                ],
                help_text=(
                    "Derived from property_type at create/update time -- SHARED for PG/Hostel/"
                    "Co-Living, ENTIRE_UNIT for Apartment/Villa/Studio/Independent House/Commercial. "
                    "Every filter, form, and seed consumer reads this instead of re-deriving it."
                ),
                max_length=16,
            ),
        ),
    ]
