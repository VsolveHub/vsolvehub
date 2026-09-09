# Wave 2 step 3 (plan SS4): for every UnitType where property.occupancy_model == ENTIRE_UNIT
# and sharing_type == ENTIRE_PLACE, set occupancy_capacity from a reasonable default derived
# from bhk (1 BHK -> 2, 2 BHK -> 4, 3 BHK -> 6, Studio -> 2, fallback 2). These are starting
# values flagged for the seed script maintainer to review and correct with real per-property
# numbers -- see plan SS4 step 3.

from django.db import migrations

BHK_TO_CAPACITY = {
    "1 RK": 2,
    "1 BHK": 2,
    "2 BHK": 4,
    "3 BHK": 6,
    "4 BHK": 8,
    "STUDIO": 2,
    "STUDIO_APT": 2,
}
DEFAULT_CAPACITY = 2


def _capacity_for_bhk(bhk: str | None) -> int:
    if not bhk:
        return DEFAULT_CAPACITY
    key = bhk.strip().upper()
    for label, capacity in BHK_TO_CAPACITY.items():
        if label.upper() == key:
            return capacity
    if "STUDIO" in key:
        return 2
    if "1" in key:
        return 2
    if "2" in key:
        return 4
    if "3" in key:
        return 6
    if "4" in key:
        return 8
    return DEFAULT_CAPACITY


def backfill_occupancy_capacity(apps, schema_editor):
    UnitType = apps.get_model("stays", "UnitType")
    queryset = UnitType.objects.filter(
        property__occupancy_model="ENTIRE_UNIT",
        sharing_type="ENTIRE_PLACE",
    ).select_related("property")
    for unit_type in queryset.iterator():
        UnitType.objects.filter(id=unit_type.id).update(
            occupancy_capacity=_capacity_for_bhk(unit_type.bhk)
        )


def noop_reverse(apps, schema_editor):
    UnitType = apps.get_model("stays", "UnitType")
    UnitType.objects.filter(
        property__occupancy_model="ENTIRE_UNIT",
        sharing_type="ENTIRE_PLACE",
    ).update(occupancy_capacity=None)


class Migration(migrations.Migration):

    dependencies = [
        ("stays", "0015_backfill_property_occupancy_model"),
    ]

    operations = [
        migrations.RunPython(backfill_occupancy_capacity, noop_reverse),
    ]
