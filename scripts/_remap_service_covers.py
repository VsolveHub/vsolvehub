"""Remap SUBCATEGORY_COVER_URLS to live Images/Service Cover assets.

Category cards stay on Images/Icons/. Bookable service detail covers stay on
action photographs in SERVICE_COVER_URLS / SEED_IMAGE_POOLS. These Service
Cover renders are only the browse-tile covers.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
SEED = ROOT / "backend" / "apps" / "catalog" / "seed_images.py"
R2 = json.loads((ROOT / "scripts" / "r2_image_urls.json").read_text(encoding="utf-8"))
PUBLIC_BASE = R2["public_base"]

COVERS = {
    row["filename"]: row
    for row in R2["live"]
    if row["folder"] == "Service Cover"
}


def url_for(filename: str) -> str:
    if filename not in COVERS:
        raise KeyError(filename)
    key = COVERS[filename]["key"]
    encoded = "/".join(quote(part, safe="") for part in key.split("/"))
    return f"{PUBLIC_BASE}/{encoded}"


# Explicit subcategory slug -> Service Cover filename.
# AC tiles have no Service Cover asset yet; they keep photographic covers.
SUBCATEGORY_TO_COVER: dict[str, str] = {
    "switch-socket": "Switch_and_socket_icon_generation_202608271407.jpeg",
    "fans": "Ceiling_fan_3D_icon_generation_202608271407.jpeg",
    "lighting": "Chandelier_glowing_bulbs_service\u2026_202608271407.jpeg",
    "mcb-fuse-inverter": "Electrical_distribution_board_ge\u2026_202608271407.jpeg",
    "motors-pumps": "Motor_and_pump_icon_rendering_202608271407.jpeg",
    "doorbell-security": "Smart_video_doorbell_on_wall_202608271407.jpeg",
    "power-problems": "Electrical_multimeter_representi\u2026_202608271407.jpeg",
    "taps-showers": "Plumbing_fixtures_generating_ser\u2026_202608271407.jpeg",
    "bathroom-fittings": "Bathroom_toilet_and_plumbing_fit\u2026_202608271407.jpeg",
    "blockage-drainage": "Drain_and_plumbing_pipe_icon_202608271407.jpeg",
    "leaks-pressure": "Plumbing_pipe_leaking_water_202608271407.jpeg",
    "tanks-motors": "Water_tank_and_motor_202608271407.jpeg",
    "carpenter": "Carpenter_tool_belt_rendering_202608271407.jpeg",
    "ro-technician": "Reverse-osmosis_water_purifier_icon_202608271407.jpeg",
    "internet-technician": "Wi-Fi_router_with_ethernet_cable_202608271407.jpeg",
    "gas-stove-technician": "Gas_stove_icon_generation_prompt_202608271407.jpeg",
    "computer-technician": "Laptop_technician_icon_generation_202608271407.jpeg",
    "mobile-technician": "Smartphone_internal_components_g\u2026_202608271407.jpeg",
    "cctv-technician": "CCTV_cameras_icon_generation_202608271407.jpeg",
    "locksmith": "Locksmith_tools_and_door_lock_202608271407.jpeg",
    "home-automation-technician": "Smart_speaker_3D_icon_generation_202608271407.jpeg",
    "fire-safety-technician": "Fire_safety_equipment_generation_202608271407.jpeg",
    "face-care": "Facial_care_setup_3D_icon_202608271407.jpeg",
    "bleach-detan": "Skincare_treatment_setup_icon_ge\u2026_202608271407.jpeg",
    "waxing": "Waxing_service_icon_generation_p\u2026_202608271407.jpeg",
    "threading": "Eyebrow_threading_service_icon_g\u2026_202608271407.jpeg",
    "hair-services": "Woman_hair_salon_services_icon_202608271407.jpeg",
    "manicure-pedicure": "Manicure_and_pedicure_setup_202608271407.jpeg",
    "makeup": "Makeup_collection_3D_icon_genera\u2026_202608271407.jpeg",
    "mehendi": "Woman_displaying_mehendi_design_202608271407.jpeg",
    "body-care": "Creating_body_care_icon_202608271407.jpeg",
    "advanced-skin-care": "Advanced_skincare_icon_generation_202608271407.jpeg",
    "home-cleaning": "Cleaning_spray_bottle_icon_creation_202608271407.jpeg",
    "sofa-carpet-cleaning": "Machine_cleaning_sofa_and_carpet_202608271407.jpeg",
    "pest-control": "Pest_control_spray_applicator_icon_202608271407.jpeg",
    "water-tank-cleaning": "Water_tank_cleaning_icon_generation_202608271407.jpeg",
    "septic-tank-services": "Septic_tank_access_cover_rendering_202608271407.jpeg",
    "laundry-services": "Washing_machine_with_folded_laundry_202608271407.jpeg",
    "gardening": "Gardening_tools_and_plants_icon_202608271407.jpeg",
    "swimming-pool-services": "Swimming_pool_services_icon_gene\u2026_202608271407.jpeg",
    "chimney-exhaust": "Chimney_exhaust_icon_generation_202608271407.jpeg",
    "home-organization": "Home_organization_storage_system\u2026_202608271407.jpeg",
    "home-inspection": "Home_inspection_toolkit_rendering_202608271407.jpeg",
    "home-maintenance": "Home_maintenance_toolkit_icon_ge\u2026_202608271407.jpeg",
    "pet-grooming": "Dog_grooming_icon_generation_202608271407.jpeg",
    "veterinary": "Veterinary_cat_examination_icon_\u2026_202608271407.jpeg",
    "pet-walking": "Dog_walking_service_icon_202608271407.jpeg",
    "pet-sitting": "Dog_sitting_service_icon_202608271407.jpeg",
    "pet-training": "Dog_training_icon_generation_202608271407.jpeg",
    "pet-photography": "Dog_posing_for_pet_photography_202608271407.jpeg",
    # M2 / adopted browse tiles (only when the cover clearly matches the tile)
    "interior-fit-outs": "Interior_fit-out_service_icon_ge\u2026_202608271407.jpeg",
    "renovation-projects": "Renovation_project_icon_generation_202608271407.jpeg",
    "consultation": "Electrical_blueprint_consultatio\u2026_202608271407.jpeg",
    "bridal-events": "Bridal_beauty_icon_generation_pr\u2026_202608271407.jpeg",
    "demolition": "Excavator_removing_concrete_section_202608271407.jpeg",
    "tiling-flooring": "Tiling_and_flooring_icon_generation_202608271407.jpeg",
    "waterproofing": "Building_surface_with_water_drop\u2026_202608271407.jpeg",
    "construction-labour": "Construction_workers_generating_\u2026_202608271407.jpeg",
    "lighting-decor": "Chandelier_glowing_bulbs_service\u2026_202608271407.jpeg",
    "hire-by-the-day": "Electrician_tool_belt_icon_gener\u2026_202608271407.jpeg",
    "event-staff": "Renovation_toolkit_service_icon_\u2026_202608271407.jpeg",
}


def main() -> None:
    missing_files = sorted(set(SUBCATEGORY_TO_COVER.values()) - set(COVERS))
    if missing_files:
        raise SystemExit(f"filenames not in live inventory: {missing_files}")

    unused = sorted(set(COVERS) - set(SUBCATEGORY_TO_COVER.values()))
    print("mapped subcategories", len(SUBCATEGORY_TO_COVER))
    print("unused covers (kept for future tiles):")
    for name in unused:
        print(" ", name)

    text = SEED.read_text(encoding="utf-8")
    match = re.search(
        r"SUBCATEGORY_COVER_URLS: Final\[dict\[str, str\]\] = \{.*?\n\}",
        text,
        flags=re.S,
    )
    if not match:
        raise SystemExit("SUBCATEGORY_COVER_URLS block not found")

    existing: dict = {}
    exec(compile(text, str(SEED), "exec"), existing)
    old = existing["SUBCATEGORY_COVER_URLS"]

    new_map: dict[str, str] = {}
    for slug, filename in sorted(SUBCATEGORY_TO_COVER.items()):
        new_map[slug] = url_for(filename)

    # AC tiles have no Service Cover asset; keep existing photographs.
    for slug, url in old.items():
        if slug.startswith("ac-") and slug not in new_map:
            new_map[slug] = url
            print("kept photo for", slug)

    lines = ["SUBCATEGORY_COVER_URLS: Final[dict[str, str]] = {"]
    for slug, url in sorted(new_map.items()):
        lines.append(f'    "{slug}": "{url}",')
    lines.append("}")
    replacement = "\n".join(lines)

    # Update module docstring note about asset kinds.
    updated = text[: match.start()] + replacement + text[match.end() :]
    updated = updated.replace(
        "- **Sub-service photographs** — the action photos keyed by service slug and\n"
        "  by browse-tile (subcategory) slug. ``image_for(subject)`` remains for the\n"
        "  handful of seed call sites that still name a visual subject rather than a\n"
        "  slug; those subjects now resolve to the same R2 photographs.",
        "- **Browse-tile covers** — the 3D Service Cover renders in ``Images/Service Cover/``,\n"
        "  keyed by subcategory slug (AC tiles still use photographs until covers exist).\n"
        "- **Sub-service photographs** — action photos keyed by bookable service slug.\n"
        "  ``image_for(subject)`` remains for seed call sites that still name a visual\n"
        "  subject rather than a slug.",
    )

    SEED.write_text(updated, encoding="utf-8")
    print("wrote", SEED)


if __name__ == "__main__":
    main()
