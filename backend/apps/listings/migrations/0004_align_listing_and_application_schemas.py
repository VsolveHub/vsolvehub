from django.db import migrations


def migrate_listing_and_schemas_forward(apps, _schema_editor):
    Listing = apps.get_model("listings", "Listing")
    Application = apps.get_model("listings", "Application")
    A10VariantConfiguration = apps.get_model("catalog", "A10VariantConfiguration")

    # 1. Migrate Listing structured_fields keys (pay_range -> salary_range, work_mode -> shift)
    for listing in Listing.objects.all():
        fields = listing.structured_fields or {}
        modified = False
        if "pay_range" in fields:
            if "salary_range" not in fields:
                fields["salary_range"] = fields["pay_range"]
            del fields["pay_range"]
            modified = True
        if "work_mode" in fields:
            if "shift" not in fields:
                fields["shift"] = fields["work_mode"]
            del fields["work_mode"]
            modified = True
        if modified:
            listing.structured_fields = fields
            listing.save(update_fields=["structured_fields"])

    # 2. Migrate Application applicant_snapshot keys (portfolio_url -> resume_url)
    for app in Application.objects.all():
        snapshot = app.applicant_snapshot or {}
        if "portfolio_url" in snapshot:
            if "resume_url" not in snapshot:
                snapshot["resume_url"] = snapshot["portfolio_url"]
            del snapshot["portfolio_url"]
            app.applicant_snapshot = snapshot
            app.save(update_fields=["applicant_snapshot"])

    # 3. Update existing A10VariantConfiguration schemas
    default_listing_schema = {
        "type": "object",
        "properties": {
            "role_type": {
                "type": "string",
                "title": "Role Type / Employment",
                "enum": ["Full-Time", "Part-Time", "Contract", "Internship"],
            },
            "salary_range": {
                "type": "string",
                "title": "Pay Range / Compensation",
            },
            "experience_years": {
                "type": "string",
                "title": "Experience Required",
            },
            "shift": {
                "type": "string",
                "title": "Workplace Mode / Shift",
                "enum": [
                    "On-site",
                    "Hybrid",
                    "Remote",
                    "Day",
                    "Night",
                    "Rotational",
                ],
            },
        },
    }
    default_app_schema = {
        "type": "object",
        "properties": {
            "experience": {
                "type": "string",
                "title": "Experience / Qualification",
            },
            "resume_url": {
                "type": "string",
                "title": "Resume Link / Portfolio URL",
            },
        },
    }

    for config in A10VariantConfiguration.objects.all():
        config.listing_type_schema = default_listing_schema
        config.application_schema = default_app_schema
        config.save(update_fields=["listing_type_schema", "application_schema"])


def migrate_listing_and_schemas_backward(apps, _schema_editor):
    Listing = apps.get_model("listings", "Listing")
    for listing in Listing.objects.all():
        fields = listing.structured_fields or {}
        modified = False
        if "salary_range" in fields:
            if "pay_range" not in fields:
                fields["pay_range"] = fields["salary_range"]
            del fields["salary_range"]
            modified = True
        if "shift" in fields:
            if "work_mode" not in fields:
                fields["work_mode"] = fields["shift"]
            del fields["shift"]
            modified = True
        if modified:
            listing.structured_fields = fields
            listing.save(update_fields=["structured_fields"])


class Migration(migrations.Migration):
    dependencies = [  # noqa: RUF012
        ("catalog", "0020_a10variantconfiguration"),
        ("listings", "0003_listing_premium_payment_attempt"),
    ]

    operations = [  # noqa: RUF012
        migrations.RunPython(
            migrate_listing_and_schemas_forward,
            migrate_listing_and_schemas_backward,
        ),
    ]
