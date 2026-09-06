from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("stays", "0010_propertypolicy_effective_from_and_more")]

    operations = [
        migrations.AlterField(
            model_name="property",
            name="rating",
            field=models.DecimalField(decimal_places=1, default=0, max_digits=3),
        ),
        migrations.AlterField(
            model_name="property",
            name="reviews_count",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="stayreservation",
            name="primary_tenant_name",
            field=models.CharField(blank=True, max_length=160),
        ),
        migrations.AddField(
            model_name="stayreservation",
            name="guest_phone_snapshot",
            field=models.CharField(blank=True, max_length=32),
        ),
        migrations.AddField(
            model_name="stayreservation",
            name="guest_email_snapshot",
            field=models.EmailField(blank=True, max_length=254),
        ),
        migrations.AddField(
            model_name="stayreservation",
            name="emergency_contact_name",
            field=models.CharField(blank=True, max_length=160),
        ),
        migrations.AddField(
            model_name="stayreservation",
            name="emergency_contact_phone",
            field=models.CharField(blank=True, max_length=32),
        ),
        migrations.AddField(
            model_name="stayreservation",
            name="agreement_version",
            field=models.CharField(blank=True, max_length=40),
        ),
        migrations.AddField(
            model_name="stayreservation",
            name="agreement_accepted_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="stayreservation",
            name="kyc_document",
            field=models.FileField(blank=True, upload_to="private/stays/kyc/"),
        ),
    ]
