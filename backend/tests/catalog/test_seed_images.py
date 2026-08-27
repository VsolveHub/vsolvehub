"""The catalog asset map: category icons vs sub-service photographs."""

from apps.catalog.management.commands.seed_task_catalog import CATALOG
from apps.catalog.seed_images import (
    CATEGORY_ICON_URLS,
    R2_PUBLIC_BASE,
    SERVICE_COVER_URLS,
    SUBCATEGORY_COVER_URLS,
    category_icon_url,
    cover_for_service,
    image_for,
    subcategory_image_url,
)

ICON_MARKER = "Images/Icons/"
PHOTO_HOST = "r2.dev/Images/"


def test_every_catalog_category_has_a_dedicated_icon() -> None:
    for slug, *_rest in CATALOG:
        url = category_icon_url(slug)
        assert ICON_MARKER in url, slug
        assert url == CATEGORY_ICON_URLS[slug]


def test_construction_and_events_also_have_icons() -> None:
    for slug in ("construction", "events"):
        assert ICON_MARKER in category_icon_url(slug)


def test_every_catalog_task_has_a_cover_photograph() -> None:
    slugs = {task.slug for entry in CATALOG for trade in entry[5] for task in trade.tasks}
    missing = slugs - set(SERVICE_COVER_URLS)
    assert missing == set()
    for slug in slugs:
        url = cover_for_service(slug)
        assert PHOTO_HOST in url, slug
        assert ICON_MARKER not in url, slug
        assert "unsplash" not in url, slug


def test_semantic_covers_match_the_named_service() -> None:
    assert "leaking_tap" in cover_for_service("tap-repair")
    assert "water_pipe" in cover_for_service("plumber-pipe-leakage-fix")
    assert "water_pressure" in cover_for_service("plumber-water-pressure-fix")
    assert "replacing_switch_board" in cover_for_service("electrician-switch-board-replacement")
    assert "testing_electrical" in cover_for_service("electrician-power-issue-check")
    assert "ceiling_fan" in cover_for_service("fan-installation")
    assert "bridal" in cover_for_service("beauty-bridal-makeup")
    assert "brushing_dog" in cover_for_service("pet-dog-grooming")
    assert "distribut" in cover_for_service("electrician-db-board-installation")
    assert "distribut" in cover_for_service("electrician-db-board-repair")
    assert "home_inve" in cover_for_service("electrician-inverter-installation")
    assert "backup_ge" in cover_for_service("electrician-generator-connection")
    assert "circuit_breaker" in cover_for_service("electrician-short-circuit-fix")
    assert "wall_switch" in cover_for_service("automation-smart-switch-installation")
    assert "connecting_water_tank" in cover_for_service("plumber-overhead-tank-connection")
    assert "repairing_water_tank" in cover_for_service("plumber-tank-overflow-fix")
    assert "dismantling" in cover_for_service("demolition")
    assert "floor_tiles" in cover_for_service("tiling")
    assert "wedding_venue" in cover_for_service("catering")
    assert "wall_for_re" in cover_for_service("house-painting")
    assert "Nail_artist" not in cover_for_service("house-painting")
    assert "RO_water" in cover_for_service("ro-installation")
    assert "RO_purifier" in cover_for_service("ro-repair")
    assert "fire_alarm" not in cover_for_service("ro-installation")


def test_audit_remaps_use_exact_service_subjects() -> None:
    assert "cabinet_fixture" in cover_for_service("carpenter-cabinet-installation")
    assert "hair_color_roots" in cover_for_service("beauty-root-touch-up")
    assert "Mehendi" not in cover_for_service("beauty-root-touch-up")
    assert "massaging_client_hands" in cover_for_service("beauty-spa-manicure")
    assert "hair_spa" not in cover_for_service("beauty-spa-manicure")
    assert "face_threa" in cover_for_service("beauty-full-face-threading")
    assert "facial_waxing" in cover_for_service("beauty-face-wax")
    assert "cutting_hair" in cover_for_service("beauty-hair-cut")
    assert "hair_extensions" in cover_for_service("beauty-hair-extension")
    assert "waterproofin" in cover_for_service("terrace-waterproofing")
    assert "cleaning_residential_terrace" not in cover_for_service("terrace-waterproofing")
    assert "overhead_wat" in cover_for_service("tank-overhead-cleaning")
    assert "sorting_household" in cover_for_service("organize-decluttering")
    assert "Veterinarian_examining" in cover_for_service("vet-surgery-consultation")
    assert "laptop_keyb" in cover_for_service("computer-keyboard-replacement")
    assert "malware" in cover_for_service("computer-virus-removal")
    assert "installing_CCTV" in cover_for_service("cctv-camera-installation")
    assert "repairing_CCTV" in cover_for_service("cctv-camera-repair")
    assert "leather_shoes" in cover_for_service("laundry-shoe-cleaning")
    assert "brightening" in cover_for_service("beauty-brightening-facial")
    assert "hydrating_fa" in cover_for_service("beauty-hydrating-facial")
    assert "applying_che" in cover_for_service("beauty-chemical-peel")
    assert "applying_dar" in cover_for_service("beauty-pigmentation-treatment")
    assert "mattress_for" in cover_for_service("pest-bed-bug-control")
    assert "operating_" in cover_for_service("computer-os-installation")
    assert "hair_salon" in subcategory_image_url("hair-services")
    assert "Home_organization" in subcategory_image_url("home-organization")


def test_water_tanks_do_not_reuse_septic_photography() -> None:
    for slug in (
        "tank-overhead-cleaning",
        "tank-sump-cleaning",
        "tank-underground-cleaning",
    ):
        assert "septic" not in cover_for_service(slug).lower(), slug
    assert "septic" not in subcategory_image_url("water-tank-cleaning").lower()


def test_every_mapped_url_is_on_the_public_r2_host() -> None:
    for url in (
        *CATEGORY_ICON_URLS.values(),
        *SERVICE_COVER_URLS.values(),
        *SUBCATEGORY_COVER_URLS.values(),
    ):
        assert url.startswith(R2_PUBLIC_BASE), url


def test_subcategory_tiles_use_service_cover_icons() -> None:
    """Browse tiles use Images/Service Cover/ (AC still photographic until covers exist)."""

    for slug, url in SUBCATEGORY_COVER_URLS.items():
        assert PHOTO_HOST in url, slug
        assert ICON_MARKER not in url, slug
        if slug.startswith("ac-"):
            assert "AC%20Services" in url or "AC Services" in url, slug
        else:
            assert "Service%20Cover" in url or "Service Cover" in url, slug
    assert "Plumbing_fixtures" in subcategory_image_url("taps-showers")
    assert "sink_tap" in image_for("faucet")
    assert "Eyebrow_threading" in subcategory_image_url("threading")
    assert "Electrical_multimeter" in subcategory_image_url("power-problems")
    assert "Locksmith_tools" in subcategory_image_url("locksmith")
    assert "AC%20Services" not in subcategory_image_url("threading")
    assert "AC%20Services" not in subcategory_image_url("power-problems")
