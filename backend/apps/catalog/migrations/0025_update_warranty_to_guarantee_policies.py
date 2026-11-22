from django.db import migrations


def update_warranty_to_guarantee(apps, schema_editor):
    ServicePolicy = apps.get_model("catalog", "ServicePolicy")
    ServicePolicy.objects.filter(title="Warranty activation").update(title="Service guarantee activation")
    ServicePolicy.objects.filter(text="30-day warranty on the workmanship").update(text="30-day workmanship guarantee")


def reverse_update(apps, schema_editor):
    ServicePolicy = apps.get_model("catalog", "ServicePolicy")
    ServicePolicy.objects.filter(title="Service guarantee activation").update(title="Warranty activation")
    ServicePolicy.objects.filter(text="30-day workmanship guarantee").update(text="30-day warranty on the workmanship")


class Migration(migrations.Migration):
    dependencies = [
        ("catalog", "0024_promo_banner"),
    ]

    operations = [
        migrations.RunPython(update_warranty_to_guarantee, reverse_code=reverse_update),
    ]

