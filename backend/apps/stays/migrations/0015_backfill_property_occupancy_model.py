# Wave 2 step 2 (plan SS4): backfill occupancy_model from property_type for every existing
# Property row using the mapping table in plan SS3.1. Staging seed data only at this point --
# no production data exists yet per milestones.md, so this is a clean backfill.

from django.db import migrations

SHARED_TYPES = {"PG", "HOSTEL", "CO_LIVING"}
ENTIRE_UNIT_TYPES = {"VILLA", "APARTMENT", "STUDIO_APT", "INDEPENDENT_HOUSE", "COMMERCIAL"}


def _occupancy_model_for(property_type: str) -> str:
    if property_type in SHARED_TYPES:
        return "SHARED"
    if property_type in ENTIRE_UNIT_TYPES:
        return "ENTIRE_UNIT"
    # Conservative fallback for any unmapped/future property_type.
    return "ENTIRE_UNIT"


def backfill_occupancy_model(apps, schema_editor):
    Property = apps.get_model("stays", "Property")
    for prop in Property.objects.all().iterator():
        Property.objects.filter(id=prop.id).update(
            occupancy_model=_occupancy_model_for(prop.property_type)
        )


def noop_reverse(apps, schema_editor):
    Property = apps.get_model("stays", "Property")
    Property.objects.update(occupancy_model=None)


class Migration(migrations.Migration):

    dependencies = [
        ("stays", "0014_occupancy_model_and_capacity_nullable"),
    ]

    operations = [
        migrations.RunPython(backfill_occupancy_model, noop_reverse),
    ]
