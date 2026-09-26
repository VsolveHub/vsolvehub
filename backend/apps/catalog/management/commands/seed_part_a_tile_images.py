import textwrap
from django.core.management.base import BaseCommand
from django.db import transaction
from apps.catalog.models import Category, Subcategory

class Command(BaseCommand):
    help = textwrap.dedent("""
    Seeds local tile image URLs for Part A categories and their specific subcategories.
    Sets image_url to /catalog/tiles/<slug>.png only if the field is currently blank.
    """)

    def handle(self, *args, **options):
        # Define target categories and their specific subcategories (or None for all)
        targets = {
            "career-jobs": None,  # None means all subcategories
            "rental-services": ["home-appliance-rental", "tools-machinery"],
            "rooms-pg-hostel-hotels": ["hostels", "pg-accommodation", "short-stay"],
        }

        updated_categories = 0
        updated_subcategories = 0

        with transaction.atomic():
            for cat_slug, subcat_slugs in targets.items():
                try:
                    category = Category.objects.get(slug=cat_slug)
                except Category.DoesNotExist:
                    self.stderr.write(self.style.WARNING(f"Category '{cat_slug}' not found, skipping."))
                    continue
                
                # Update Category
                if not category.image_url:
                    category.image_url = f"/catalog/tiles/{category.slug}.png"
                    category.save(update_fields=["image_url", "updated_at"])
                    updated_categories += 1
                    self.stdout.write(f"Updated category: {category.slug}")
                
                # Update Subcategories
                if subcat_slugs is None:
                    # All subcategories
                    subcategories = category.subcategories.all()
                else:
                    # Specific subcategories
                    subcategories = category.subcategories.filter(slug__in=subcat_slugs)
                
                for subcategory in subcategories:
                    if not subcategory.image_url:
                        subcategory.image_url = f"/catalog/tiles/{subcategory.slug}.png"
                        subcategory.save(update_fields=["image_url", "updated_at"])
                        updated_subcategories += 1
                        self.stdout.write(f"Updated subcategory: {subcategory.slug}")

        self.stdout.write(
            self.style.SUCCESS(
                f"Successfully updated {updated_categories} categories and {updated_subcategories} subcategories."
            )
        )
