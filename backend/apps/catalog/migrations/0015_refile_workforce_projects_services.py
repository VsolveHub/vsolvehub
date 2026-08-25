"""Re-file the M2 services under trade categories and retire "Workforce and projects".

The umbrella category was a booking-model noun, not a customer noun: nobody looking for a
bathroom renovation starts by thinking "workforce and projects". Placement is merchandising
only — the archetype stays on `ServiceVariant.booking_archetype` and dispatch stays on
`required_skill_code` — so this is a data move, not a behaviour change.

Data-only and idempotent. Every lookup is by slug and every write is an upsert or a guarded
save, so an environment that never ran `seed_m2_demo` is untouched, and one that already
re-filed (a rerun, or a fresh seed after this landed) changes nothing. The legacy category is
deactivated, never deleted: `Subcategory.category` is PROTECT, and a dev database may hold
requirement rows whose service history reads through it.
"""

from django.db import migrations

#: service slug -> (category slug, subcategory slug, subcategory name, subcategory order).
#: Must stay in agreement with `seed_m2_demo.A5_PROJECT_SEEDS` / its A3 call — the seed is the
#: authority for fresh databases, this map is the same decision applied to existing ones.
SERVICE_TO_HOME = {
    "construction-helpers": ("construction", "construction-labour", "Construction labour", 10),
    "interior-fit-out-project": ("construction", "interior-fit-outs", "Interior fit-outs", 20),
    "full-bathroom-renovation": ("plumber", "renovation-projects", "Renovation projects", 30),
    "full-home-rewiring": ("electrician", "renovation-projects", "Renovation projects", 30),
    "modular-kitchen-fit-out": ("technician", "renovation-projects", "Renovation projects", 30),
    "full-home-painting": ("home-services", "renovation-projects", "Renovation projects", 30),
    "event-catering": ("events", "event-services", "Event services", 40),
}

#: category slug -> (name, description, icon_key, display_order). The trade rows copy
#: `seed_task_catalog.CATALOG` so an update_or_create merges rather than diverges.
CATEGORY_DEFAULTS = {
    "technician": (
        "Technician",
        "Reviewed one-person Technician task visits.",
        "wrench",
        1,
    ),
    "electrician": (
        "Electrician",
        "Wiring, fittings, fans and power faults, fixed in one visit.",
        "zap",
        2,
    ),
    "plumber": (
        "Plumber",
        "Taps, leaks, drains and fittings, fixed in one visit.",
        "droplet",
        3,
    ),
    "home-services": (
        "Home Services",
        "Cleaning, pest control and upkeep delivered at your address.",
        "home",
        6,
    ),
    "construction": (
        "Construction",
        "Site labour and construction projects, priced on site.",
        "hard-hat",
        8,
    ),
    "events": (
        "Events",
        "Catering and event services, priced per plate or per event.",
        "party-popper",
        9,
    ),
}

LEGACY_CATEGORY_SLUG = "workforce-and-projects"


def refile(apps, schema_editor):
    Category = apps.get_model("catalog", "Category")
    Subcategory = apps.get_model("catalog", "Subcategory")
    Service = apps.get_model("catalog", "Service")

    for service_slug, (category_slug, sub_slug, sub_name, sub_order) in SERVICE_TO_HOME.items():
        service = Service.objects.filter(slug=service_slug).first()
        if service is None:
            continue  # this environment never seeded it
        name, description, icon_key, order = CATEGORY_DEFAULTS[category_slug]
        category, _ = Category.objects.update_or_create(
            slug=category_slug,
            defaults={
                "name": name,
                "description": description,
                "icon_key": icon_key,
                "display_order": order,
                "is_active": True,
            },
        )
        subcategory, _ = Subcategory.objects.update_or_create(
            category=category,
            slug=sub_slug,
            defaults={"name": sub_name, "display_order": sub_order, "is_active": True},
        )
        if service.subcategory_id != subcategory.id:
            service.subcategory = subcategory
            service.save(update_fields=["subcategory", "updated_at"])

    legacy = Category.objects.filter(slug=LEGACY_CATEGORY_SLUG).first()
    if legacy is None:
        return
    # Only subcategories that no longer hold any service go dark; one that still does means an
    # unmapped service exists and hiding it would read as lost data, not a tidy-up.
    Subcategory.objects.filter(category=legacy, services__isnull=True).update(is_active=False)
    if not Service.objects.filter(subcategory__category=legacy).exists():
        legacy.is_active = False
        legacy.save(update_fields=["is_active", "updated_at"])


class Migration(migrations.Migration):
    dependencies = [
        ("catalog", "0014_service_icon_key"),
    ]

    operations = [
        migrations.RunPython(refile, migrations.RunPython.noop),
    ]
