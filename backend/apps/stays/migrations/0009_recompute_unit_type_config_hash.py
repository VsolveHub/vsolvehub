import hashlib

from django.db import migrations


def recompute_config_hashes(apps, schema_editor):
    UnitType = apps.get_model("stays", "UnitType")
    for unit_type in UnitType.objects.all().iterator():
        raw = "|".join(
            str(value)
            for value in (
                unit_type.sharing_type,
                unit_type.sharing_count,
                unit_type.is_ac,
                unit_type.bathroom_type,
                unit_type.furnishing_status,
                unit_type.food_included,
                unit_type.bhk,
                unit_type.bathrooms,
                unit_type.built_up_sqft,
            )
        )
        UnitType.objects.filter(id=unit_type.id).update(
            config_hash=hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]
        )


class Migration(migrations.Migration):
    dependencies = [("stays", "0008_stay_damage_line_type")]

    operations = [migrations.RunPython(recompute_config_hashes, migrations.RunPython.noop)]
