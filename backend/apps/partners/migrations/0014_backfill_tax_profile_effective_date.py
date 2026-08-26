from django.db import migrations


def backfill_effective_date(apps, schema_editor):
    business_profile = apps.get_model("partners", "PartnerBusinessProfile")
    for profile in business_profile.objects.filter(tax_profile_effective_from__isnull=True).iterator():
        profile.tax_profile_effective_from = profile.created_at.date()
        profile.save(update_fields=("tax_profile_effective_from",))


class Migration(migrations.Migration):
    dependencies = [
        ("partners", "0013_partnerbusinessprofile_gstin_verified_at_and_more"),
    ]

    operations = [
        migrations.RunPython(backfill_effective_date, migrations.RunPython.noop),
    ]
