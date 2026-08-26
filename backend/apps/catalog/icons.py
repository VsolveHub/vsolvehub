"""Controlled semantic icons for public service discovery.

The API publishes these stable product meanings, not React component names. Frontends map the
values exhaustively into their own approved icon set, so a library upgrade can never rewrite
catalog data and no client has to guess an icon from a translated service name.
"""

from typing import Final

from django.db import models


class ServiceIconKey(models.TextChoices):
    SERVICE = "service", "Generic service"
    ELECTRICAL = "electrical", "Electrical"
    PLUMBING = "plumbing", "Plumbing"
    CARPENTRY = "carpentry", "Carpentry"
    AIR_CONDITIONING = "air-conditioning", "Air conditioning"
    WATER_PURIFIER = "water-purifier", "Water purifier"
    INTERNET_WIFI = "internet-wifi", "Internet and Wi-Fi"
    GAS_STOVE = "gas-stove", "Gas stove"
    COMPUTER = "computer", "Computer"
    MOBILE = "mobile", "Mobile"
    SECURITY_CAMERA = "security-camera", "Security camera"
    LOCKSMITH = "locksmith", "Locksmith"
    HOME_AUTOMATION = "home-automation", "Home automation"
    FIRE_SAFETY = "fire-safety", "Fire safety"
    FACE_CARE = "face-care", "Face care"
    BEAUTY_TREATMENT = "beauty-treatment", "Beauty treatment"
    WAXING = "waxing", "Waxing"
    THREADING = "threading", "Threading"
    HAIR_CARE = "hair-care", "Hair care"
    NAIL_CARE = "nail-care", "Nail care"
    MAKEUP = "makeup", "Makeup"
    MEHENDI = "mehendi", "Mehendi"
    BODY_CARE = "body-care", "Body care"
    SKIN_CARE = "skin-care", "Advanced skin care"
    HOME_CLEANING = "home-cleaning", "Home cleaning"
    SOFA_CARPET = "sofa-carpet", "Sofa and carpet cleaning"
    PEST_CONTROL = "pest-control", "Pest control"
    WATER_TANK = "water-tank", "Water tank"
    SEPTIC_TANK = "septic-tank", "Septic tank"
    LAUNDRY = "laundry", "Laundry"
    GARDENING = "gardening", "Gardening"
    SWIMMING_POOL = "swimming-pool", "Swimming pool"
    CHIMNEY_EXHAUST = "chimney-exhaust", "Chimney and exhaust"
    HOME_ORGANIZATION = "home-organization", "Home organization"
    HOME_INSPECTION = "home-inspection", "Home inspection"
    HOME_MAINTENANCE = "home-maintenance", "Home maintenance"
    PET_GROOMING = "pet-grooming", "Pet grooming"
    VETERINARY = "veterinary", "Veterinary"
    PET_WALKING = "pet-walking", "Pet walking"
    PET_SITTING = "pet-sitting", "Pet sitting"
    PET_TRAINING = "pet-training", "Pet training"
    PET_PHOTOGRAPHY = "pet-photography", "Pet photography"
    WORKFORCE = "workforce", "Workforce"
    CUSTOM_PROJECT = "custom-project", "Custom project"


SERVICE_ICON_BY_SUBCATEGORY: Final[dict[str, ServiceIconKey]] = {
    "electrician": ServiceIconKey.ELECTRICAL,
    "plumber": ServiceIconKey.PLUMBING,
    "carpenter": ServiceIconKey.CARPENTRY,
    "ac-technician": ServiceIconKey.AIR_CONDITIONING,
    # Browse tiles of the split trades. Same glyph family as their trade — the icon says
    # what kind of work it is, and a per-tile glyph set is the client's concern, not data.
    "switch-socket": ServiceIconKey.ELECTRICAL,
    "fans": ServiceIconKey.ELECTRICAL,
    "lighting": ServiceIconKey.ELECTRICAL,
    "mcb-fuse-inverter": ServiceIconKey.ELECTRICAL,
    "motors-pumps": ServiceIconKey.ELECTRICAL,
    "doorbell-security": ServiceIconKey.ELECTRICAL,
    "power-problems": ServiceIconKey.ELECTRICAL,
    "taps-showers": ServiceIconKey.PLUMBING,
    "bathroom-fittings": ServiceIconKey.PLUMBING,
    "blockage-drainage": ServiceIconKey.PLUMBING,
    "leaks-pressure": ServiceIconKey.PLUMBING,
    "tanks-motors": ServiceIconKey.PLUMBING,
    "ac-service-cleaning": ServiceIconKey.AIR_CONDITIONING,
    "ac-repair-gas": ServiceIconKey.AIR_CONDITIONING,
    "ac-install-shifting": ServiceIconKey.AIR_CONDITIONING,
    "ro-technician": ServiceIconKey.WATER_PURIFIER,
    "internet-technician": ServiceIconKey.INTERNET_WIFI,
    "gas-stove-technician": ServiceIconKey.GAS_STOVE,
    "computer-technician": ServiceIconKey.COMPUTER,
    "mobile-technician": ServiceIconKey.MOBILE,
    "cctv-technician": ServiceIconKey.SECURITY_CAMERA,
    "locksmith": ServiceIconKey.LOCKSMITH,
    "home-automation-technician": ServiceIconKey.HOME_AUTOMATION,
    "fire-safety-technician": ServiceIconKey.FIRE_SAFETY,
    "face-care": ServiceIconKey.FACE_CARE,
    "bleach-detan": ServiceIconKey.BEAUTY_TREATMENT,
    "waxing": ServiceIconKey.WAXING,
    "threading": ServiceIconKey.THREADING,
    "hair-services": ServiceIconKey.HAIR_CARE,
    "manicure-pedicure": ServiceIconKey.NAIL_CARE,
    "makeup": ServiceIconKey.MAKEUP,
    "mehendi": ServiceIconKey.MEHENDI,
    "body-care": ServiceIconKey.BODY_CARE,
    "advanced-skin-care": ServiceIconKey.SKIN_CARE,
    "home-cleaning": ServiceIconKey.HOME_CLEANING,
    "sofa-carpet-cleaning": ServiceIconKey.SOFA_CARPET,
    "pest-control": ServiceIconKey.PEST_CONTROL,
    "water-tank-cleaning": ServiceIconKey.WATER_TANK,
    "septic-tank-services": ServiceIconKey.SEPTIC_TANK,
    "laundry-services": ServiceIconKey.LAUNDRY,
    "gardening": ServiceIconKey.GARDENING,
    "swimming-pool-services": ServiceIconKey.SWIMMING_POOL,
    "chimney-exhaust": ServiceIconKey.CHIMNEY_EXHAUST,
    "home-organization": ServiceIconKey.HOME_ORGANIZATION,
    "home-inspection": ServiceIconKey.HOME_INSPECTION,
    "home-maintenance": ServiceIconKey.HOME_MAINTENANCE,
    "pet-grooming": ServiceIconKey.PET_GROOMING,
    "veterinary": ServiceIconKey.VETERINARY,
    "pet-walking": ServiceIconKey.PET_WALKING,
    "pet-sitting": ServiceIconKey.PET_SITTING,
    "pet-training": ServiceIconKey.PET_TRAINING,
    "pet-photography": ServiceIconKey.PET_PHOTOGRAPHY,
}


def service_icon_for_subcategory(subcategory_slug: str) -> ServiceIconKey:
    """Return an authored trade icon, with one explicit generic value for new trades."""

    return SERVICE_ICON_BY_SUBCATEGORY.get(subcategory_slug, ServiceIconKey.SERVICE)
