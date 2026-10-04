"""Give every existing room type its numbered rooms.

A type that said "5 rooms" gets Room 1 ... Room 5 (numbered across the whole property, so two
types never both have a "Room 1"). The host renames them. A type the host had marked full gets
its rooms switched off, so nothing that was hidden from guests reappears.
"""

from django.db import migrations


def backfill_rooms(apps, schema_editor):  # noqa: ARG001
    unit_model = apps.get_model("stay", "Unit")
    room_model = apps.get_model("stay", "Room")
    property_model = apps.get_model("stay", "Property")
    for prop in property_model.objects.all().iterator():
        next_number = 1
        for unit in unit_model.objects.filter(property=prop).order_by("created_at", "id"):
            quantity = max(int(unit.quantity or 1), 1)
            status = "AVAILABLE" if unit.is_active else "UNAVAILABLE"
            room_model.objects.bulk_create(
                [
                    room_model(
                        property=prop,
                        unit=unit,
                        number=f"Room {next_number + offset}",
                        status=status,
                    )
                    for offset in range(quantity)
                ]
            )
            next_number += quantity
            unit.quantity = quantity
            unit.available_count = quantity if unit.is_active else 0
            unit.save(update_fields=("quantity", "available_count"))


class Migration(migrations.Migration):
    dependencies = [
        ("stay", "0016_rooms_and_visits"),
    ]

    operations = [
        migrations.RunPython(backfill_rooms, migrations.RunPython.noop),
    ]
