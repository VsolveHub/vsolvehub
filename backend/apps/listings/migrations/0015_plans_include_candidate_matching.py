"""Matching candidates became a paid-plan feature (free employers see only applicants).

Existing paid plans get the CANDIDATE_MATCHING capability so no paying employer loses it.
"""

from django.db import migrations

CAPABILITY = "CANDIDATE_MATCHING"


def add_capability(apps, schema_editor):  # noqa: ARG001
    plan_model = apps.get_model("listings", "VendorSubscriptionPlan")
    for plan in plan_model.objects.filter(price_paise__gt=0):
        capabilities = list(plan.premium_capabilities or [])
        if CAPABILITY not in capabilities:
            capabilities.append(CAPABILITY)
            plan.premium_capabilities = capabilities
            plan.save(update_fields=["premium_capabilities"])


def remove_capability(apps, schema_editor):  # noqa: ARG001
    plan_model = apps.get_model("listings", "VendorSubscriptionPlan")
    for plan in plan_model.objects.all():
        capabilities = [c for c in (plan.premium_capabilities or []) if c != CAPABILITY]
        if capabilities != list(plan.premium_capabilities or []):
            plan.premium_capabilities = capabilities
            plan.save(update_fields=["premium_capabilities"])


class Migration(migrations.Migration):
    dependencies = [("listings", "0014_interviews_and_views")]

    operations = [migrations.RunPython(add_capability, remove_capability)]
