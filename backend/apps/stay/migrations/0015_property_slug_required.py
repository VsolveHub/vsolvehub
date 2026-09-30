"""Every row has a slug now (previous migration); require it."""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("stay", "0014_property_slug"),
    ]

    operations = [
        migrations.AlterField(
            model_name="property",
            name="slug",
            field=models.SlugField(editable=False, max_length=100, unique=True),
        ),
    ]
