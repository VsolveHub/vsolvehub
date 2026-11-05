"""Standalone script to seed new rental images into RentalAssetMedia."""

from __future__ import annotations

import os
import sys
from pathlib import Path

# Setup Django environment
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")

import django

django.setup()

from django.core.management import call_command

if __name__ == "__main__":
    call_command("seed_new_rental_images")
