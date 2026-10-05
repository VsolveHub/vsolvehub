"""Give every existing room type a photo, so the switch to room-first search hides nothing.

Search now shows room types and leaves out those without a photo. Room types created
before room photos existed get their property's cover; the owner can replace it.
"""

from django.db import migrations


def copy_cover(apps, schema_editor):  # noqa: ARG001
    Unit = apps.get_model("stay", "Unit")
    UnitMedia = apps.get_model("stay", "UnitMedia")
    PropertyMedia = apps.get_model("stay", "PropertyMedia")
    for unit in Unit.objects.filter(media__isnull=True).iterator():
        cover = (
            PropertyMedia.objects.filter(property_id=unit.property_id)
            .order_by("display_order", "created_at")
            .first()
        )
        if cover is not None:
            UnitMedia.objects.create(unit=unit, url=cover.url, display_order=0)


class Migration(migrations.Migration):
    dependencies = [("stay", "0018_unit_photos")]

    operations = [migrations.RunPython(copy_cover, migrations.RunPython.noop)]
