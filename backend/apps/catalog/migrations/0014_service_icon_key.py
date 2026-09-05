from django.db import migrations, models


ICON_BY_SUBCATEGORY = {
    "electrician": "electrical",
    "plumber": "plumbing",
    "carpenter": "carpentry",
    "ac-technician": "air-conditioning",
    "ro-technician": "water-purifier",
    "internet-technician": "internet-wifi",
    "gas-stove-technician": "gas-stove",
    "computer-technician": "computer",
    "mobile-technician": "mobile",
    "cctv-technician": "security-camera",
    "locksmith": "locksmith",
    "home-automation-technician": "home-automation",
    "fire-safety-technician": "fire-safety",
    "face-care": "face-care",
    "bleach-detan": "beauty-treatment",
    "waxing": "waxing",
    "threading": "threading",
    "hair-services": "hair-care",
    "manicure-pedicure": "nail-care",
    "makeup": "makeup",
    "mehendi": "mehendi",
    "body-care": "body-care",
    "advanced-skin-care": "skin-care",
    "home-cleaning": "home-cleaning",
    "sofa-carpet-cleaning": "sofa-carpet",
    "pest-control": "pest-control",
    "water-tank-cleaning": "water-tank",
    "septic-tank-services": "septic-tank",
    "laundry-services": "laundry",
    "gardening": "gardening",
    "swimming-pool-services": "swimming-pool",
    "chimney-exhaust": "chimney-exhaust",
    "home-organization": "home-organization",
    "home-inspection": "home-inspection",
    "home-maintenance": "home-maintenance",
    "pet-grooming": "pet-grooming",
    "veterinary": "veterinary",
    "pet-walking": "pet-walking",
    "pet-sitting": "pet-sitting",
    "pet-training": "pet-training",
    "pet-photography": "pet-photography",
}

ICON_CHOICES = (
    ("service", "Generic service"),
    ("electrical", "Electrical"),
    ("plumbing", "Plumbing"),
    ("carpentry", "Carpentry"),
    ("air-conditioning", "Air conditioning"),
    ("water-purifier", "Water purifier"),
    ("internet-wifi", "Internet and Wi-Fi"),
    ("gas-stove", "Gas stove"),
    ("computer", "Computer"),
    ("mobile", "Mobile"),
    ("security-camera", "Security camera"),
    ("locksmith", "Locksmith"),
    ("home-automation", "Home automation"),
    ("fire-safety", "Fire safety"),
    ("face-care", "Face care"),
    ("beauty-treatment", "Beauty treatment"),
    ("waxing", "Waxing"),
    ("threading", "Threading"),
    ("hair-care", "Hair care"),
    ("nail-care", "Nail care"),
    ("makeup", "Makeup"),
    ("mehendi", "Mehendi"),
    ("body-care", "Body care"),
    ("skin-care", "Advanced skin care"),
    ("home-cleaning", "Home cleaning"),
    ("sofa-carpet", "Sofa and carpet cleaning"),
    ("pest-control", "Pest control"),
    ("water-tank", "Water tank"),
    ("septic-tank", "Septic tank"),
    ("laundry", "Laundry"),
    ("gardening", "Gardening"),
    ("swimming-pool", "Swimming pool"),
    ("chimney-exhaust", "Chimney and exhaust"),
    ("home-organization", "Home organization"),
    ("home-inspection", "Home inspection"),
    ("home-maintenance", "Home maintenance"),
    ("pet-grooming", "Pet grooming"),
    ("veterinary", "Veterinary"),
    ("pet-walking", "Pet walking"),
    ("pet-sitting", "Pet sitting"),
    ("pet-training", "Pet training"),
    ("pet-photography", "Pet photography"),
    ("workforce", "Workforce"),
    ("custom-project", "Custom project"),
)
SUPPORTED_ICON_KEYS = tuple(value for value, _label in ICON_CHOICES)


def assign_service_icons(apps, _schema_editor) -> None:  # type: ignore[no-untyped-def]
    Service = apps.get_model("catalog", "Service")
    for subcategory_slug, icon_key in ICON_BY_SUBCATEGORY.items():
        Service.objects.filter(subcategory__slug=subcategory_slug).update(icon_key=icon_key)
    Service.objects.filter(slug="construction-helpers").update(icon_key="workforce")
    Service.objects.filter(slug="interior-fit-out-project").update(icon_key="custom-project")


class Migration(migrations.Migration):
    dependencies = [
        ("catalog", "0013_m2_recovery_and_operations"),
    ]

    operations = [
        migrations.AddField(
            model_name="service",
            name="icon_key",
            field=models.CharField(
                choices=ICON_CHOICES,
                default="service",
                max_length=40,
            ),
        ),
        migrations.RunPython(assign_service_icons, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name="service",
            constraint=models.CheckConstraint(
                condition=models.Q(icon_key__in=SUPPORTED_ICON_KEYS),
                name="catalog_service_icon_key_supported",
            ),
        ),
    ]
