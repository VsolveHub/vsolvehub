from django.db import migrations, models


def clean_pending_partner_documents(apps, schema_editor):
    PartnerDocument = apps.get_model("partners", "PartnerDocument")
    PartnerDocument.objects.filter(scan_status="PENDING").update(scan_status="CLEAN")


class Migration(migrations.Migration):

    dependencies = [
        ("partners", "0024_partner_application_declined"),
    ]

    operations = [
        migrations.AlterField(
            model_name="partnerdocument",
            name="scan_status",
            field=models.CharField(
                choices=[
                    ("PENDING", "Pending scan"),
                    ("CLEAN", "Clean"),
                    ("REJECTED", "Rejected"),
                    ("FAILED", "Scan failed"),
                ],
                default="CLEAN",
                max_length=16,
            ),
        ),
        migrations.RunPython(
            clean_pending_partner_documents,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
