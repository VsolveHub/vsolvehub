# Wave 2 step 1 (plan Django_Next.js_Plan/M3/05-a9-stay-property-type-remediation.md SS4):
# add the two new fields nullable first; backfilled by 0015/0016, then occupancy_model is
# made non-nullable in 0017.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("stays", "0013_propertyvisitrequest_and_more"),
    ]

    operations = [
        migrations.AddField(
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
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="unittype",
            name="occupancy_capacity",
            field=models.PositiveSmallIntegerField(
                blank=True,
                help_text=(
                    "'Sleeps up to N' -- required for ENTIRE_UNIT properties, left null for "
                    "SHARED (a PG bed always sleeps 1 occupant of that bed, not a customer-"
                    "facing concept). See plan SS3.2."
                ),
                null=True,
            ),
        ),
        migrations.AlterField(
            model_name="unittype",
            name="bhk",
            field=models.CharField(
                blank=True,
                default=None,
                help_text=(
                    "BHK/layout label for ENTIRE_UNIT properties (e.g. '2 BHK'). Meaningless "
                    "for SHARED (PG/Hostel) rooms -- leave unset there; card display falls "
                    "back to the sharing_type label instead of the old 'Studio' default."
                ),
                max_length=20,
                null=True,
            ),
        ),
    ]
