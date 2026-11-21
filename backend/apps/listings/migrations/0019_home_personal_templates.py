"""Household job templates: help for a home, open to every employer.

Same shape as `0012_seed_job_templates`. Operations can edit or add templates afterwards.
"""

from django.db import migrations

CATEGORY = "Home & Personal"

# (role, skills, duties, job_type, shift, work_mode, min ₹, max ₹)
TEMPLATES = [
    ("House Help / Maid", ["Cleaning", "Washing utensils", "Laundry"], ["Clean the house", "Wash utensils", "Fold clothes"], "FULL_TIME", "DAY", "ON_SITE", 8000, 15000),
    ("Home Cook", ["Cooking", "South Indian", "North Indian", "Hygiene"], ["Cook daily meals", "Keep the kitchen clean", "Plan the menu"], "FULL_TIME", "DAY", "ON_SITE", 10000, 20000),
    ("Personal / Family Driver", ["Driving licence", "Safe driving", "Route knowledge"], ["Drive the family safely", "Keep the car clean"], "FULL_TIME", "DAY", "FIELD", 15000, 22000),
    ("Elderly Caretaker", ["Patient care", "Patience", "Hygiene"], ["Help with daily needs", "Give medicines on time", "Keep company"], "FULL_TIME", "ROTATIONAL", "ON_SITE", 12000, 20000),
    ("Babysitter / Nanny", ["Child care", "Patience", "Hygiene"], ["Look after the child", "Feed and bathe", "Play and teach"], "FULL_TIME", "DAY", "ON_SITE", 10000, 18000),
    ("Patient Attendant (at home)", ["Patient care", "First aid", "Hygiene"], ["Help the patient move", "Give medicines", "Record vitals"], "FULL_TIME", "ROTATIONAL", "ON_SITE", 12000, 20000),
    ("Home Tutor", ["Subject knowledge", "Patience", "Communication"], ["Teach at home", "Give practice work", "Track progress"], "PART_TIME", "FLEXIBLE", "ON_SITE", 5000, 15000),
    ("Gardener", ["Gardening", "Plant care", "Physical work"], ["Water and trim plants", "Keep the garden clean"], "PART_TIME", "DAY", "ON_SITE", 6000, 12000),
    ("Watchman (home)", ["Alertness", "Visitor management"], ["Guard the gate", "Check visitors", "Keep the register"], "FULL_TIME", "ROTATIONAL", "ON_SITE", 10000, 15000),
]


def seed(apps, schema_editor):  # noqa: ARG001
    template = apps.get_model("listings", "JobRoleTemplate")
    for order, (name, skills, duties, job_type, shift, mode, low, high) in enumerate(
        TEMPLATES, start=1
    ):
        template.objects.update_or_create(
            category=CATEGORY,
            name=name,
            defaults={
                "skills": skills,
                "responsibilities": duties,
                "job_type": job_type,
                "shift": shift,
                "work_mode": mode,
                "salary_min_rupees": low,
                "salary_max_rupees": high,
                "display_order": order,
            },
        )


class Migration(migrations.Migration):
    dependencies = [("listings", "0018_application_hired_status")]

    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
