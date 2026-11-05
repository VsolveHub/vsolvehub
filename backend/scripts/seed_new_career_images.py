"""Standalone script to seed new career listing images for all job opportunities across Web and Expo customer portals."""

from __future__ import annotations

import os
import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")

import django
django.setup()

from apps.listings.management.commands.seed_new_career_images import (
    Command,
    sync_images_to_destinations,
)

if __name__ == "__main__":
    print("Starting career images synchronization and database seeding...")
    cmd = Command()
    cmd.handle()
    print("Done!")

