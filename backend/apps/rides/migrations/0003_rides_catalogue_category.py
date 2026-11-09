from django.db import migrations

# Home-screen entry point for Rides. The customer app routes slug "rides" to the
# Rides flow instead of the normal catalogue pages.
SLUG = "rides"


def add_category(apps, schema_editor):
    Category = apps.get_model("catalog", "Category")
    Category.objects.get_or_create(
        slug=SLUG,
        defaults={
            "name": "Rides",
            "description": "Bike, auto and cab rides.",
            "display_order": 10,
            "image_url": "https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?auto=format&fit=crop&w=800&q=70",
        },
    )


def remove_category(apps, schema_editor):
    apps.get_model("catalog", "Category").objects.filter(slug=SLUG).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("catalog", "0024_promo_banner"),
        ("rides", "0002_ride_rate_card"),
    ]

    operations = [migrations.RunPython(add_category, remove_category)]
