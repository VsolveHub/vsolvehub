from django.db import migrations, models


def mask_existing_document_numbers(apps, schema_editor):
    stay_check_in = apps.get_model("stays", "StayCheckIn")
    for record in stay_check_in.objects.exclude(id_document_number="").iterator():
        raw = record.id_document_number.strip()
        if raw.startswith("****"):
            continue
        import hashlib

        record.id_document_hash = hashlib.sha256(raw.encode("utf-8")).hexdigest()
        record.id_document_number = f"****{raw[-4:]}"
        record.save(update_fields=("id_document_hash", "id_document_number"))


class Migration(migrations.Migration):
    dependencies = [("stays", "0006_stay_condition_evidence")]

    operations = [
        migrations.AddField(
            model_name="staycheckin",
            name="id_document_hash",
            field=models.CharField(blank=True, max_length=64),
        ),
        migrations.RunPython(mask_existing_document_numbers, migrations.RunPython.noop),
    ]
