import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    """After 0021 gave every room and photo a look, the look is required.

    A separate migration so the column change does not share a transaction with 0021's row
    updates (PostgreSQL refuses ALTER TABLE with pending trigger events).
    """

    dependencies = [
        ("stay", "0021_room_looks"),
    ]

    operations = [
        migrations.AlterField(
            model_name="room",
            name="look",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="rooms",
                to="stay.roomlook",
            ),
        ),
        migrations.AlterField(
            model_name="unitmedia",
            name="look",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="media",
                to="stay.roomlook",
            ),
        ),
    ]
