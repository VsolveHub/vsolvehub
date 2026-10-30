from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('carts', '0008_booking_fulfilment_extensions'),
    ]

    operations = [
        migrations.AddField(
            model_name='bookinggroup',
            name='booking_mode',
            field=models.CharField(
                choices=[('INSTANT', 'Instant'), ('SCHEDULED', 'Scheduled')],
                default='SCHEDULED',
                max_length=16,
            ),
        ),
    ]
