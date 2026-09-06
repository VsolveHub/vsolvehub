import uuid
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('rentals', '0002_remove_assetreservation_rentals_active_asset_reservation_no_overlap_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='RentalAssetCategoryProfile',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('attributes', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('asset', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='category_profile', to='rentals.rentalasset')),
            ],
        ),
    ]
