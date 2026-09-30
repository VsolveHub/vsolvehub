"""Readable page addresses: add ``slug`` and fill it for existing rows."""

from typing import Any

from django.db import migrations, models

from apps.foundation.slugs import slug_base, unique_slug


def fill_slugs(apps: Any, _schema_editor: Any) -> None:
    model = apps.get_model("rental", "RentalAsset")
    for row in model.objects.filter(slug__isnull=True).order_by("created_at").iterator():
        base = slug_base(row.title, row.location_text, fallback="rental")
        row.slug = unique_slug(model, base, exclude_pk=row.pk)
        row.save(update_fields=["slug"])


class Migration(migrations.Migration):
    dependencies = [
        ("rental", "0007_backfill_handover_pin_hash"),
    ]

    operations = [
        migrations.AddField(
            model_name="rentalasset",
            name="slug",
            field=models.SlugField(editable=False, max_length=100, null=True, unique=True),
        ),
        migrations.RunPython(fill_slugs, migrations.RunPython.noop),
    ]
