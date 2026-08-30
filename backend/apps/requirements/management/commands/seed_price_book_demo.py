"""Load a demonstrable price book: an electrical + painting catalog with material recipes,
reference rates for one city, an active guardrail policy, and one saved rate per demo partner.

## Why this exists

`seed_m2_demo` already stands up the `hyderabad-500032` service area and the
`electrician`/`painter` `Skill` rows for the A3 day-rate demo — this command adds the
item-wise catalog beside them, so a Partner rate-card screen, the estimate composer and the
ops console have something real to show without hand-writing rows in a database client.

## What the electrician catalog carries (2026-08-29 redesign)

Every work item has a **group** (the composer's tab), a **material recipe** (what one unit
consumes, so the estimate hands the Customer a shopping list — materials are always the
Customer's to buy) and **bundle quantities** (the 1/2/3 BHK quick sets). Labour-day items
(Electrician, Helper) carry no recipe: a day of a person consumes nothing the Customer buys.

## Three doors, matching `seed_m2_demo` exactly

Same guard, same reasoning: `settings.DEBUG` must be true, and
`--i-understand-this-is-dev-only` is required even under `DEBUG` because a shared
development database can already hold a catalog somebody published on purpose.

## What is a placeholder and what is not

Every reference rate here, every recipe quantity and every guardrail percentage is invented
for the demo — none of it is a market survey or an owner-approved policy. Rates are marked
`DEV SEED — not an owner decision` the same way `seed_m2_demo` marks its A3 cards, so a real
published catalog is never silently overwritten by a second run of this command, and it is
obvious on inspection which rows are real.

## Idempotent

Work items upsert on (skill, name) — a re-run refreshes group, recipe and bundles so an
authored change here reaches the database, exactly as `seed_m2_demo` refreshes questions.
A `WorkItemRate` is published once and left alone after. Running twice changes nothing.

## Prerequisite

Run `seed_m2_demo --i-understand-this-is-dev-only` first (or pass `--with-m2-demo` to
have this command run it for you).
"""

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError, CommandParser
from django.db import transaction

from apps.identity.models import User
from apps.locations.models import ServiceArea
from apps.partners.models import PartnerProfile, PartnerSkill, Skill
from apps.requirements import price_book
from apps.requirements.models import (
    PartnerRateItem,
    QuoteGuardrailPolicy,
    WorkItem,
    WorkItemRate,
    band_for_item_in_area,
)

DEV_SEED_MARKER = "DEV SEED — not an owner decision"
SERVICE_AREA_SLUG = "hyderabad-500032"
GUARDRAIL_POLICY_VERSION = 1


#: `pack_size`/`pack_unit` round a material total up to what a shop sells; blank means raw units.
def _material(
    title: str,
    spec: str,
    unit: str,
    per_unit: str,
    *,
    pack_size: str = "",
    pack_unit: str = "",
) -> dict[str, str]:
    return {
        "title": title,
        "spec": spec,
        "unit": unit,
        "per_unit": per_unit,
        "pack_size": pack_size,
        "pack_unit": pack_unit,
    }


@dataclass(frozen=True, slots=True)
class ItemSeed:
    name: str
    unit: str
    description: str
    reference_rate_paise: int
    group: str = ""
    recipe: tuple[dict[str, str], ...] = ()
    bundles: dict[str, int] = field(default_factory=dict)


# Shared consumables, named once so every point's recipe reads identically on the list.
WIRE_15 = "1.5 sq mm FR copper wire"
WIRE_25 = "2.5 sq mm FR copper wire"
WIRE_40 = "4 sq mm FR copper wire"
WIRE_SPEC = "ISI, FR grade (Finolex / Polycab class)"
COIL = {"pack_size": "90", "pack_unit": "coil (90 m)"}
CONDUIT_20 = "20 mm PVC conduit"
CONDUIT_25 = "25 mm PVC conduit"
CONDUIT_SPEC = "ISI, medium duty"
CONDUIT_LENGTH = {"pack_size": "3", "pack_unit": "length (3 m)"}

ELECTRICAL_ITEMS: tuple[ItemSeed, ...] = (
    # ---- Points ----------------------------------------------------------------------------
    ItemSeed(
        "Light point",
        "each",
        "One ceiling or wall light point, wired and terminated.",
        150_00,
        group="Points",
        recipe=(
            _material(WIRE_15, WIRE_SPEC, "m", "24", **COIL),
            _material(CONDUIT_20, CONDUIT_SPEC, "m", "6", **CONDUIT_LENGTH),
            _material("6A modular switch", "one module", "no", "1"),
            _material("Junction box", "3x3 in, PVC", "no", "1"),
            _material("Ceiling rose / holder", "", "no", "1"),
        ),
        bundles={"1bhk": 6, "2bhk": 9, "3bhk": 13},
    ),
    ItemSeed(
        "Fan point",
        "each",
        "One ceiling fan point with regulator, wired and terminated.",
        200_00,
        group="Points",
        recipe=(
            _material(WIRE_15, WIRE_SPEC, "m", "24", **COIL),
            _material(CONDUIT_20, CONDUIT_SPEC, "m", "6", **CONDUIT_LENGTH),
            _material("Fan regulator", "modular, step type", "no", "1"),
            _material("6A modular switch", "one module", "no", "1"),
            _material("Fan hook box", "", "no", "1"),
        ),
        bundles={"1bhk": 2, "2bhk": 3, "3bhk": 4},
    ),
    ItemSeed(
        "6A socket",
        "each",
        "One 6A power socket with its switch, wired and terminated.",
        100_00,
        group="Points",
        recipe=(
            _material(WIRE_15, WIRE_SPEC, "m", "18", **COIL),
            _material(CONDUIT_20, CONDUIT_SPEC, "m", "4", **CONDUIT_LENGTH),
            _material("6A socket", "modular", "no", "1"),
            _material("6A modular switch", "one module", "no", "1"),
        ),
        bundles={"1bhk": 4, "2bhk": 6, "3bhk": 8},
    ),
    ItemSeed(
        "16A socket",
        "each",
        "One 16A power socket with its switch — geyser, microwave, washing machine.",
        150_00,
        group="Points",
        recipe=(
            _material(WIRE_25, WIRE_SPEC, "m", "18", **COIL),
            _material(CONDUIT_20, CONDUIT_SPEC, "m", "4", **CONDUIT_LENGTH),
            _material("16A socket + switch", "modular set", "set", "1"),
        ),
        bundles={"1bhk": 2, "2bhk": 4, "3bhk": 5},
    ),
    ItemSeed(
        "AC point (32A)",
        "each",
        "Dedicated air-conditioner point with its own MCB, wired with the correct rating.",
        350_00,
        group="Points",
        recipe=(
            _material(WIRE_40, WIRE_SPEC, "m", "30", **COIL),
            _material(CONDUIT_25, CONDUIT_SPEC, "m", "8", **CONDUIT_LENGTH),
            _material("32A double-pole MCB", "C curve", "no", "1"),
            _material("20A socket + switch", "modular set", "set", "1"),
        ),
        bundles={"1bhk": 1, "2bhk": 2, "3bhk": 3},
    ),
    ItemSeed(
        "TV / DTH point",
        "each",
        "One television or DTH point.",
        180_00,
        group="Points",
        recipe=(
            _material("Coaxial cable", "RG6", "m", "10", **COIL),
            _material(CONDUIT_20, CONDUIT_SPEC, "m", "6", **CONDUIT_LENGTH),
            _material("TV socket module", "", "no", "1"),
        ),
        bundles={"1bhk": 1, "2bhk": 1, "3bhk": 2},
    ),
    ItemSeed(
        "Data / telephone point",
        "each",
        "One internet or telephone point.",
        180_00,
        group="Points",
        recipe=(
            _material("CAT6 cable", "", "m", "10", **COIL),
            _material(CONDUIT_20, CONDUIT_SPEC, "m", "6", **CONDUIT_LENGTH),
            _material("RJ45 module", "", "no", "1"),
        ),
        bundles={"1bhk": 1, "2bhk": 2, "3bhk": 2},
    ),
    ItemSeed(
        "Exhaust fan point",
        "each",
        "One kitchen or bathroom exhaust point.",
        150_00,
        group="Points",
        recipe=(
            _material(WIRE_15, WIRE_SPEC, "m", "18", **COIL),
            _material(CONDUIT_20, CONDUIT_SPEC, "m", "4", **CONDUIT_LENGTH),
            _material("6A modular switch", "one module", "no", "1"),
        ),
        bundles={"1bhk": 2, "2bhk": 3, "3bhk": 4},
    ),
    ItemSeed(
        "Bell point",
        "each",
        "One doorbell point with its push.",
        80_00,
        group="Points",
        recipe=(
            _material(WIRE_15, WIRE_SPEC, "m", "12", **COIL),
            _material("Bell push", "modular", "no", "1"),
        ),
        bundles={"1bhk": 1, "2bhk": 1, "3bhk": 1},
    ),
    # ---- Boards ----------------------------------------------------------------------------
    ItemSeed(
        "Switchboard fixing",
        "each",
        "One modular switchboard (up to 8 modules) fixed and connected.",
        120_00,
        group="Boards",
        recipe=(
            _material("Modular gang box", "by module count", "no", "1"),
            _material("Modular front plate", "by module count", "no", "1"),
        ),
        bundles={"1bhk": 6, "2bhk": 9, "3bhk": 12},
    ),
    ItemSeed(
        "Junction box fixing",
        "each",
        "One junction box fixed and connected.",
        60_00,
        group="Boards",
        recipe=(_material("Junction box", "4x4 in, PVC", "no", "1"),),
    ),
    # ---- MCB / DB --------------------------------------------------------------------------
    ItemSeed(
        "MCB fixing",
        "each",
        "One MCB fitted into an existing board and connected.",
        120_00,
        group="MCB / DB",
        recipe=(_material("Single-pole MCB", "6 to 32A, C curve", "no", "1"),),
    ),
    ItemSeed(
        "RCCB / isolator fixing",
        "each",
        "One RCCB or isolator fitted and connected.",
        250_00,
        group="MCB / DB",
        recipe=(_material("RCCB", "40A, 30 mA", "no", "1"),),
    ),
    ItemSeed(
        "DB box fixing",
        "each",
        "One distribution board fixed, wired and labelled (MCBs priced separately).",
        900_00,
        group="MCB / DB",
        recipe=(
            _material("Distribution board", "8 to 12 way, metal, double door", "no", "1"),
            _material("Busbar and earth link", "", "set", "1"),
        ),
        bundles={"1bhk": 1, "2bhk": 1, "3bhk": 1},
    ),
    ItemSeed(
        "Main line: meter to DB",
        "each",
        "The main supply run from the meter to the distribution board.",
        1_200_00,
        group="MCB / DB",
        recipe=(
            _material("6 sq mm FR copper wire", WIRE_SPEC, "m", "40", **COIL),
            _material(CONDUIT_25, CONDUIT_SPEC, "m", "15", **CONDUIT_LENGTH),
            _material("Main isolator", "63A double pole", "no", "1"),
        ),
        bundles={"1bhk": 1, "2bhk": 1, "3bhk": 1},
    ),
    # ---- Conduit & wiring ------------------------------------------------------------------
    ItemSeed(
        "Conduit laying — concealed",
        "running_ft",
        "Chasing and laying concealed PVC conduit, per running foot.",
        12_00,
        group="Conduit",
        recipe=(_material(CONDUIT_20, CONDUIT_SPEC, "m", "0.3", **CONDUIT_LENGTH),),
    ),
    ItemSeed(
        "Conduit laying — open / casing",
        "running_ft",
        "Surface conduit or PVC casing-capping, per running foot.",
        8_00,
        group="Conduit",
        recipe=(_material("PVC casing-capping", "20 mm", "m", "0.3", **CONDUIT_LENGTH),),
    ),
    ItemSeed(
        "Rewiring in existing conduit",
        "each",
        "Pulling new wire through an existing conduit run, per point.",
        120_00,
        group="Conduit",
        recipe=(_material(WIRE_15, WIRE_SPEC, "m", "20", **COIL),),
    ),
    # ---- Fixtures --------------------------------------------------------------------------
    ItemSeed(
        "Ceiling fan installation",
        "each",
        "Fan hung and connected, fan supplied by the customer.",
        250_00,
        group="Fixtures",
    ),
    ItemSeed(
        "Light fixture installation",
        "each",
        "A light fitting fixed and connected, fitting supplied by the customer.",
        150_00,
        group="Fixtures",
    ),
    ItemSeed(
        "Chandelier installation",
        "each",
        "A chandelier hung, secured and connected.",
        800_00,
        group="Fixtures",
    ),
    ItemSeed(
        "Geyser wiring",
        "each",
        "Dedicated geyser point, wired with the correct rating.",
        350_00,
        group="Fixtures",
        recipe=(
            _material(WIRE_25, WIRE_SPEC, "m", "18", **COIL),
            _material("16A socket + switch", "modular set", "set", "1"),
        ),
    ),
    ItemSeed(
        "Inverter wiring",
        "each",
        "Inverter connected and the backup circuit separated at the board.",
        600_00,
        group="Fixtures",
        recipe=(
            _material(WIRE_40, WIRE_SPEC, "m", "20", **COIL),
            _material("Changeover switch", "32A", "no", "1"),
        ),
    ),
    ItemSeed(
        "Earthing pit",
        "each",
        "One earthing pit or rod, installed and tested.",
        1_500_00,
        group="Fixtures",
        recipe=(
            _material("Earthing rod", "GI or copper-bonded, 2 m", "no", "1"),
            _material("Earthing compound", "", "bag", "1"),
            _material("Earth pit cover", "", "no", "1"),
        ),
    ),
    ItemSeed(
        "Fault finding and repair",
        "hour",
        "Diagnosing and fixing an existing fault, per hour on site.",
        300_00,
        group="Fixtures",
    ),
    # ---- Labour (day) ----------------------------------------------------------------------
    ItemSeed(
        "Electrician",
        "day",
        "One electrician for a full working day.",
        1_100_00,
        group="Labour",
    ),
    ItemSeed(
        "Helper",
        "day",
        "One helper for a full working day.",
        700_00,
        group="Labour",
    ),
)

#: From the painter flow's own material/labour split — labour-only items in the
#: item-wise vocabulary this catalog serves; the painter measurement estimator itself
#: (Phase B) is a separate, unbuilt piece.
# Painting consumables per square foot of wall. Litres and kilos come from typical coverage
# (emulsion ~80 sq ft per litre per two coats, putty ~20 sq ft per kg for two coats) and round
# up to the packs a paint shop sells.
PAINT_SPEC = "Asian / Berger / Nerolac class"
EMULSION_PACK = {"pack_size": "10", "pack_unit": "bucket (10 L)"}
PUTTY_PACK = {"pack_size": "20", "pack_unit": "bag (20 kg)"}

PAINTING_ITEMS: tuple[ItemSeed, ...] = (
    # ---- Preparation -----------------------------------------------------------------------
    ItemSeed(
        "Wall putty - two coats",
        "sq_ft",
        "Two coats of wall putty, sanded smooth.",
        12_00,
        group="Preparation",
        recipe=(
            _material(
                "Wall putty", "acrylic or cement based, " + PAINT_SPEC, "kg", "0.05", **PUTTY_PACK
            ),
            _material("Sandpaper", "120 / 180 grit", "sheet", "0.02"),
        ),
        bundles={"1bhk": 2400, "2bhk": 3600, "3bhk": 5000},
    ),
    ItemSeed(
        "Surface sanding",
        "sq_ft",
        "Sanding an existing painted surface before repainting.",
        6_00,
        group="Preparation",
        recipe=(_material("Sandpaper", "120 grit", "sheet", "0.02"),),
    ),
    ItemSeed(
        "Crack filling",
        "running_ft",
        "Filling and sealing a wall crack, per running foot.",
        20_00,
        group="Preparation",
        recipe=(_material("Crack filler", "acrylic, 1 kg tub", "kg", "0.1"),),
    ),
    ItemSeed(
        "Masking and protection",
        "sq_ft",
        "Masking fixtures, floors and fittings before painting.",
        4_00,
        group="Preparation",
        recipe=(
            _material("Masking tape", "1 in, 50 m roll", "roll", "0.005"),
            _material("Plastic sheet", "floor and furniture cover", "m", "0.01"),
        ),
        bundles={"1bhk": 2400, "2bhk": 3600, "3bhk": 5000},
    ),
    # ---- Paint -----------------------------------------------------------------------------
    ItemSeed(
        "Primer coat",
        "sq_ft",
        "One coat of primer, brush or roller.",
        8_00,
        group="Paint",
        recipe=(_material("Wall primer", PAINT_SPEC, "litre", "0.01", **EMULSION_PACK),),
        bundles={"1bhk": 2400, "2bhk": 3600, "3bhk": 5000},
    ),
    ItemSeed(
        "Emulsion - standard, two coats",
        "sq_ft",
        "Two coats of standard interior emulsion.",
        15_00,
        group="Paint",
        recipe=(
            _material(
                "Interior emulsion", "standard, " + PAINT_SPEC, "litre", "0.0125", **EMULSION_PACK
            ),
        ),
        bundles={"1bhk": 2400, "2bhk": 3600, "3bhk": 5000},
    ),
    ItemSeed(
        "Emulsion - premium, two coats",
        "sq_ft",
        "Two coats of premium washable emulsion.",
        22_00,
        group="Paint",
        recipe=(
            _material(
                "Interior emulsion",
                "premium washable, " + PAINT_SPEC,
                "litre",
                "0.0125",
                **EMULSION_PACK,
            ),
        ),
    ),
    ItemSeed(
        "Ceiling - two coats",
        "sq_ft",
        "Two coats of ceiling white.",
        12_00,
        group="Paint",
        recipe=(
            _material(
                "Ceiling emulsion", "white, " + PAINT_SPEC, "litre", "0.0125", **EMULSION_PACK
            ),
        ),
        bundles={"1bhk": 500, "2bhk": 800, "3bhk": 1100},
    ),
    ItemSeed(
        "Enamel - doors, windows and grills",
        "sq_ft",
        "Two coats of enamel on wood or metal.",
        18_00,
        group="Paint",
        recipe=(
            _material(
                "Enamel paint", PAINT_SPEC, "litre", "0.017", pack_size="1", pack_unit="tin (1 L)"
            ),
        ),
        bundles={"1bhk": 120, "2bhk": 200, "3bhk": 300},
    ),
    ItemSeed(
        "Exterior - two coats",
        "sq_ft",
        "Two coats of exterior emulsion.",
        18_00,
        group="Paint",
        recipe=(
            _material(
                "Exterior emulsion",
                PAINT_SPEC,
                "litre",
                "0.0125",
                pack_size="20",
                pack_unit="bucket (20 L)",
            ),
        ),
    ),
    ItemSeed(
        "Waterproof exterior coat",
        "sq_ft",
        "One coat of exterior waterproofing paint.",
        25_00,
        group="Paint",
        recipe=(
            _material(
                "Exterior waterproof coating",
                PAINT_SPEC,
                "litre",
                "0.025",
                pack_size="20",
                pack_unit="bucket (20 L)",
            ),
        ),
    ),
    ItemSeed(
        "Texture or designer wall",
        "sq_ft",
        "One decorative texture or stencil finish.",
        35_00,
        group="Paint",
        recipe=(
            _material(
                "Texture paste", PAINT_SPEC, "kg", "0.1", pack_size="25", pack_unit="bag (25 kg)"
            ),
        ),
    ),
    # ---- Labour ----------------------------------------------------------------------------
    ItemSeed("Painter", "day", "One painter for a full working day.", 800_00, group="Labour"),
    ItemSeed("Helper", "day", "One helper for a full working day.", 600_00, group="Labour"),
)

# Tiling. Tiles are bought by the box; adhesive and grout by the bag. One square foot of floor
# needs about 1.1 sq ft of tile after cuts and breakage.
TILE_BOX_2x2 = {"pack_size": "16", "pack_unit": "box (4 tiles, 2 x 2 ft)"}
TILE_BOX_1x2 = {"pack_size": "12", "pack_unit": "box (6 tiles, 1 x 2 ft)"}
ADHESIVE = _material(
    "Tile adhesive",
    "cement based, 20 kg bag",
    "kg",
    "0.35",
    pack_size="20",
    pack_unit="bag (20 kg)",
)
GROUT = _material(
    "Tile grout",
    "epoxy or cement, colour to match",
    "kg",
    "0.02",
    pack_size="1",
    pack_unit="pack (1 kg)",
)
SPACERS = _material("Tile spacers", "2 mm, pack of 100", "pack", "0.01")

TILING_ITEMS: tuple[ItemSeed, ...] = (
    ItemSeed(
        "Floor tiling",
        "sq_ft",
        "Laying floor tiles on a prepared bed, grouted and cleaned, per square foot.",
        45_00,
        group="Floor",
        recipe=(
            _material("Floor tiles", "vitrified, 2 x 2 ft", "sq ft", "1.1", **TILE_BOX_2x2),
            ADHESIVE,
            GROUT,
            SPACERS,
        ),
        bundles={"small": 120, "medium": 400, "large": 1200},
    ),
    ItemSeed(
        "Marble or granite laying",
        "sq_ft",
        "Laying natural stone with a cement bed, per square foot.",
        70_00,
        group="Floor",
        recipe=(
            _material("Marble or granite", "slab, as chosen", "sq ft", "1.1"),
            _material(
                "Cement", "OPC 43, 50 kg bag", "kg", "0.5", pack_size="50", pack_unit="bag (50 kg)"
            ),
            _material("River sand", "", "cft", "0.05"),
        ),
    ),
    ItemSeed(
        "Skirting",
        "running_ft",
        "Skirting tiles along the wall base, per running foot.",
        30_00,
        group="Floor",
        recipe=(
            _material("Skirting tile strip", "4 in, to match the floor", "running ft", "1.05"),
            ADHESIVE,
        ),
        bundles={"small": 40, "medium": 120, "large": 300},
    ),
    ItemSeed(
        "Wall tiling",
        "sq_ft",
        "Fixing wall tiles in a bathroom or kitchen, grouted, per square foot.",
        55_00,
        group="Wall",
        recipe=(
            _material("Wall tiles", "ceramic, 1 x 2 ft", "sq ft", "1.1", **TILE_BOX_1x2),
            ADHESIVE,
            GROUT,
            SPACERS,
        ),
        bundles={"small": 150, "medium": 400, "large": 900},
    ),
    ItemSeed(
        "Kitchen dado tiling",
        "sq_ft",
        "Tiles above the counter, per square foot.",
        55_00,
        group="Wall",
        recipe=(
            _material("Dado tiles", "ceramic, 1 x 2 ft", "sq ft", "1.1", **TILE_BOX_1x2),
            ADHESIVE,
            GROUT,
        ),
    ),
    ItemSeed(
        "Old tile removal",
        "sq_ft",
        "Breaking and clearing existing tiles, per square foot.",
        15_00,
        group="Preparation",
        recipe=(_material("Debris bags", "woven, 50 kg", "bag", "0.03"),),
        bundles={"small": 120, "medium": 400, "large": 1200},
    ),
    ItemSeed(
        "Floor levelling",
        "sq_ft",
        "Cement screed to level the floor before tiling, per square foot.",
        18_00,
        group="Preparation",
        recipe=(
            _material(
                "Cement", "OPC 43, 50 kg bag", "kg", "0.4", pack_size="50", pack_unit="bag (50 kg)"
            ),
            _material("River sand", "", "cft", "0.04"),
        ),
    ),
    ItemSeed(
        "Re-grouting",
        "sq_ft",
        "Raking out and re-grouting existing tiles, per square foot.",
        12_00,
        group="Preparation",
        recipe=(GROUT,),
    ),
    ItemSeed("Tiler", "day", "One tile mason for a full working day.", 1_100_00, group="Labour"),
    ItemSeed("Helper", "day", "One helper for a full working day.", 650_00, group="Labour"),
)

# Waterproofing. Coatings by the litre or kilo, rounded to the drum or bag.
WATERPROOFING_ITEMS: tuple[ItemSeed, ...] = (
    ItemSeed(
        "Terrace coating - two coats",
        "sq_ft",
        "Acrylic or PU waterproof coating on a terrace, two coats, per square foot.",
        28_00,
        group="Terrace",
        recipe=(
            _material(
                "Acrylic waterproof coating",
                "Dr. Fixit / Asian class",
                "litre",
                "0.05",
                pack_size="20",
                pack_unit="drum (20 L)",
            ),
            _material("Fibre mesh", "reinforcing, 1 m roll", "m", "0.1"),
        ),
        bundles={"small": 200, "medium": 600, "large": 1500},
    ),
    ItemSeed(
        "Terrace surface prep",
        "sq_ft",
        "Cleaning, scraping and priming the terrace before coating.",
        8_00,
        group="Terrace",
        recipe=(
            _material(
                "Waterproofing primer", "", "litre", "0.02", pack_size="5", pack_unit="can (5 L)"
            ),
        ),
        bundles={"small": 200, "medium": 600, "large": 1500},
    ),
    ItemSeed(
        "Bathroom waterproofing",
        "sq_ft",
        "Two-component cementitious coating on floor and walls up to 1 m, per square foot.",
        45_00,
        group="Bathroom",
        recipe=(
            _material(
                "Cementitious waterproof compound",
                "two component, 20 kg kit",
                "kg",
                "0.5",
                pack_size="20",
                pack_unit="kit (20 kg)",
            ),
        ),
        bundles={"small": 80, "medium": 160, "large": 320},
    ),
    ItemSeed(
        "Water tank waterproofing",
        "sq_ft",
        "Food-safe cementitious coating inside a tank, per square foot.",
        50_00,
        group="Tank",
        recipe=(
            _material(
                "Cementitious waterproof compound",
                "potable-water grade, 20 kg kit",
                "kg",
                "0.5",
                pack_size="20",
                pack_unit="kit (20 kg)",
            ),
        ),
    ),
    ItemSeed(
        "Crack treatment",
        "running_ft",
        "Cutting, filling and sealing a structural crack, per running foot.",
        60_00,
        group="Repairs",
        recipe=(
            _material(
                "Crack seal / PU sealant",
                "",
                "litre",
                "0.05",
                pack_size="1",
                pack_unit="tube (1 L)",
            ),
        ),
        bundles={"small": 10, "medium": 30, "large": 60},
    ),
    ItemSeed(
        "Injection grouting",
        "each",
        "One pressure-grouting point for an active leak.",
        400_00,
        group="Repairs",
        recipe=(
            _material(
                "PU injection grout", "", "kg", "0.5", pack_size="1", pack_unit="pack (1 kg)"
            ),
        ),
    ),
    ItemSeed(
        "Drain outlet (khurra) treatment",
        "each",
        "Sealing one terrace drain outlet.",
        350_00,
        group="Repairs",
        recipe=(
            _material(
                "Waterproof sealant", "", "litre", "0.25", pack_size="1", pack_unit="tube (1 L)"
            ),
        ),
    ),
    ItemSeed(
        "Waterproofing applicator",
        "day",
        "One applicator for a full working day.",
        1_000_00,
        group="Labour",
    ),
    ItemSeed("Helper", "day", "One helper for a full working day.", 650_00, group="Labour"),
)

# Demolition. Almost no materials - the customer buys debris bags, and a truck trip is a
# named charge the vendor prices.
DEMOLITION_ITEMS: tuple[ItemSeed, ...] = (
    ItemSeed(
        "Brick wall demolition",
        "sq_ft",
        "Breaking a brick partition wall, per square foot of wall.",
        25_00,
        group="Walls & floors",
        recipe=(_material("Debris bags", "woven, 50 kg", "bag", "0.08"),),
        bundles={"small": 100, "medium": 300, "large": 800},
    ),
    ItemSeed(
        "Floor breaking",
        "sq_ft",
        "Breaking floor tiles or screed, per square foot.",
        18_00,
        group="Walls & floors",
        recipe=(_material("Debris bags", "woven, 50 kg", "bag", "0.05"),),
        bundles={"medium": 200, "large": 800},
    ),
    ItemSeed(
        "Ceiling or false-ceiling removal",
        "sq_ft",
        "Bringing down a false ceiling or plaster, per square foot.",
        12_00,
        group="Walls & floors",
        recipe=(_material("Debris bags", "woven, 50 kg", "bag", "0.03"),),
    ),
    ItemSeed(
        "Bathroom strip-out",
        "each",
        "Removing fittings, tiles and pipes from one bathroom.",
        6_000_00,
        group="Rooms",
        recipe=(_material("Debris bags", "woven, 50 kg", "bag", "25"),),
        bundles={"small": 1},
    ),
    ItemSeed(
        "Kitchen strip-out",
        "each",
        "Removing cabinets, counter, tiles and plumbing from one kitchen.",
        7_000_00,
        group="Rooms",
        recipe=(_material("Debris bags", "woven, 50 kg", "bag", "30"),),
    ),
    ItemSeed(
        "Door or window frame removal",
        "each",
        "Cutting out one door or window frame.",
        600_00,
        group="Rooms",
    ),
    ItemSeed(
        "Debris loading and truck trip",
        "each",
        "Loading and one truck trip to the dump yard.",
        2_500_00,
        group="Debris",
        bundles={"small": 1, "medium": 2, "large": 5},
    ),
    ItemSeed(
        "Demolition mason",
        "day",
        "One demolition mason for a full working day.",
        1_000_00,
        group="Labour",
    ),
    ItemSeed("Helper", "day", "One helper for a full working day.", 650_00, group="Labour"),
)

# Construction helpers by the day - the A3 catalogue is labour and a few named shifting jobs.
HELPER_ITEMS: tuple[ItemSeed, ...] = (
    ItemSeed("Helper", "day", "One helper for an eight-hour day.", 700_00, group="Labour"),
    ItemSeed("Supervisor", "day", "One working supervisor for the crew.", 1_100_00, group="Labour"),
    ItemSeed(
        "Loading or unloading",
        "job",
        "One vehicle loaded or unloaded by hand.",
        1_500_00,
        group="Shifting",
    ),
    ItemSeed(
        "Material shifting per floor",
        "job",
        "Carrying one vehicle-load up one floor without a lift.",
        800_00,
        group="Shifting",
    ),
    ItemSeed(
        "Site clearing",
        "hour",
        "Clearing rubble and sweeping down, per crew hour.",
        400_00,
        group="Shifting",
    ),
    ItemSeed(
        "Packing",
        "hour",
        "Packing goods for a shift, per crew hour.",
        350_00,
        group="Shifting",
        recipe=(
            _material("Packing boxes", "5-ply, 18 x 18 x 18 in", "no", "3"),
            _material("Bubble wrap", "1 m x 50 m roll", "roll", "0.1"),
            _material("Packing tape", "2 in, 65 m", "roll", "0.5"),
        ),
    ),
)

# Air-conditioning and ducting. Copper, drain pipe and duct by the metre; brackets and stands
# by the piece. The units themselves are the customer's purchase.
AC_ITEMS: tuple[ItemSeed, ...] = (
    ItemSeed(
        "Split AC installation",
        "each",
        "One split AC installed with 3 m of copper piping, bracket and drain.",
        1_800_00,
        group="Units",
        recipe=(
            _material("Copper pipe set", "1/4 + 3/8 in with insulation, 3 m", "set", "1"),
            _material("Outdoor bracket", "powder coated", "no", "1"),
            _material(
                "Drain pipe", "PVC, 3/4 in", "m", "4", pack_size="3", pack_unit="length (3 m)"
            ),
            _material(
                "Electrical wire 3 core",
                "2.5 sq mm",
                "m",
                "5",
                pack_size="90",
                pack_unit="coil (90 m)",
            ),
        ),
        bundles={"small": 1, "medium": 3, "large": 6},
    ),
    ItemSeed(
        "Cassette AC installation",
        "each",
        "One ceiling cassette unit installed with piping and drain.",
        4_500_00,
        group="Units",
        recipe=(
            _material("Copper pipe set", "1/4 + 1/2 in with insulation, 5 m", "set", "1"),
            _material(
                "Drain pipe", "PVC, 3/4 in", "m", "6", pack_size="3", pack_unit="length (3 m)"
            ),
            _material("Suspension rods and clamps", "", "set", "1"),
        ),
    ),
    ItemSeed(
        "Ducted unit installation",
        "each",
        "One ducted indoor unit hung and connected.",
        9_000_00,
        group="Units",
        recipe=(_material("Suspension rods and clamps", "heavy duty", "set", "1"),),
    ),
    ItemSeed(
        "Ducting",
        "running_ft",
        "GI duct with insulation, fabricated and fixed, per running foot.",
        350_00,
        group="Ducting",
        recipe=(
            _material("GI duct", "24 gauge, fabricated to size", "running ft", "1"),
            _material("Duct insulation", "nitrile or glass wool, 13 mm", "sq ft", "3"),
        ),
        bundles={"medium": 60, "large": 200},
    ),
    ItemSeed(
        "Supply or return grille",
        "each",
        "One grille or diffuser fitted to the duct.",
        900_00,
        group="Ducting",
        recipe=(_material("Grille or diffuser", "aluminium, as sized", "no", "1"),),
        bundles={"medium": 6, "large": 20},
    ),
    ItemSeed(
        "Extra copper piping",
        "metre",
        "Copper piping beyond the included 3 m, per metre.",
        450_00,
        group="Piping",
        recipe=(_material("Copper pipe with insulation", "1/4 + 3/8 in", "m", "1"),),
    ),
    ItemSeed(
        "Core drilling",
        "each",
        "One wall core cut for piping.",
        500_00,
        group="Piping",
    ),
    ItemSeed(
        "Outdoor unit stand",
        "each",
        "A floor stand for an outdoor unit.",
        600_00,
        group="Piping",
        recipe=(_material("Outdoor unit stand", "powder coated", "no", "1"),),
    ),
    ItemSeed(
        "Gas charging",
        "each",
        "Vacuuming and charging one unit with refrigerant.",
        2_500_00,
        group="Service",
        recipe=(_material("Refrigerant", "R32 or R410A as per the unit", "kg", "1.2"),),
    ),
    ItemSeed("AC deep service", "each", "Jet-wash service of one unit.", 800_00, group="Service"),
    ItemSeed(
        "AC technician",
        "day",
        "One AC technician for a full working day.",
        1_300_00,
        group="Labour",
    ),
    ItemSeed("Helper", "day", "One helper for a full working day.", 700_00, group="Labour"),
)

# Catering: priced per plate and per counter. No recipes - the caterer buys the food.
CATERING_ITEMS: tuple[ItemSeed, ...] = (
    ItemSeed(
        "Veg plate - standard",
        "each",
        "Standard vegetarian menu, per plate.",
        350_00,
        group="Plates",
        bundles={"small": 50, "medium": 150, "large": 400},
    ),
    ItemSeed(
        "Veg plate - premium",
        "each",
        "Premium vegetarian menu with dessert counter, per plate.",
        550_00,
        group="Plates",
    ),
    ItemSeed(
        "Non-veg plate - standard",
        "each",
        "Standard menu with chicken or fish, per plate.",
        450_00,
        group="Plates",
    ),
    ItemSeed(
        "Non-veg plate - premium",
        "each",
        "Premium menu with mutton, chicken and seafood, per plate.",
        750_00,
        group="Plates",
    ),
    ItemSeed(
        "Breakfast plate",
        "each",
        "South or North Indian breakfast, per plate.",
        180_00,
        group="Plates",
    ),
    ItemSeed(
        "Hi-tea plate",
        "each",
        "Snacks, sweets and tea or coffee, per plate.",
        220_00,
        group="Plates",
    ),
    ItemSeed(
        "Live counter",
        "each",
        "One live counter - dosa, chaat, pasta - with its cook.",
        6_000_00,
        group="Counters",
        bundles={"medium": 2, "large": 4},
    ),
    ItemSeed("Dessert counter", "each", "Ice cream or sweets counter.", 4_000_00, group="Counters"),
    ItemSeed(
        "Beverage counter", "each", "Mocktails, juices and water.", 3_500_00, group="Counters"
    ),
    ItemSeed(
        "Buffet setup",
        "each",
        "Buffet tables, chafing dishes and skirting.",
        5_000_00,
        group="Setup",
        bundles={"small": 1, "medium": 1, "large": 2},
    ),
    ItemSeed(
        "Crockery and cutlery",
        "each",
        "Plates, cutlery and glasses, per guest.",
        25_00,
        group="Setup",
        bundles={"small": 50, "medium": 150, "large": 400},
    ),
    ItemSeed(
        "Serving staff",
        "day",
        "One server for the event day.",
        900_00,
        group="Labour",
        bundles={"small": 2, "medium": 6, "large": 15},
    ),
    ItemSeed("Cleanup staff", "day", "One cleanup hand for the event day.", 800_00, group="Labour"),
)

# Bridal and event makeup: per person and per session. No recipes - the artist's kit is theirs.
MAKEUP_ITEMS: tuple[ItemSeed, ...] = (
    ItemSeed(
        "Bridal makeup - HD",
        "each",
        "HD bridal makeup with hairstyling and draping.",
        15_000_00,
        group="Bride",
        bundles={"small": 1, "medium": 1, "large": 1},
    ),
    ItemSeed(
        "Bridal makeup - airbrush",
        "each",
        "Airbrush bridal makeup with hairstyling and draping.",
        25_000_00,
        group="Bride",
    ),
    ItemSeed(
        "Reception look",
        "each",
        "Reception or sangeet makeup with hairstyling.",
        8_000_00,
        group="Bride",
        bundles={"medium": 1, "large": 1},
    ),
    ItemSeed(
        "Engagement look", "each", "Engagement makeup with hairstyling.", 7_000_00, group="Bride"
    ),
    ItemSeed(
        "Trial session",
        "each",
        "A pre-wedding trial of the chosen look.",
        3_000_00,
        group="Bride",
        bundles={"medium": 1, "large": 1},
    ),
    ItemSeed(
        "Family or guest makeup",
        "each",
        "Party makeup for one family member or guest.",
        2_500_00,
        group="Family",
        bundles={"small": 2, "medium": 4, "large": 8},
    ),
    ItemSeed("Hairstyling only", "each", "Hairstyling for one person.", 1_500_00, group="Family"),
    ItemSeed(
        "Saree or lehenga draping",
        "each",
        "Draping for one person.",
        800_00,
        group="Family",
        bundles={"small": 2, "medium": 4, "large": 8},
    ),
    ItemSeed("Groom grooming", "each", "Groom's makeup and hair.", 3_000_00, group="Family"),
    ItemSeed(
        "Early call or outstation",
        "each",
        "Before-6-am call or travel outside the city.",
        2_000_00,
        group="Extras",
    ),
    ItemSeed(
        "Assistant artist", "day", "One assistant for the event day.", 2_500_00, group="Labour"
    ),
)


# Plumbing consumables, named once. The fittings themselves (tap, WC, basin, geyser) are on the
# list too - the plumber fixes what the customer bought, and the recipe says exactly what to buy.
CPVC_SPEC = "CPVC, ISI (Astral / Ashirvad class)"
UPVC_SPEC = "UPVC SWR, ISI"
PIPE_LENGTH = {"pack_size": "3", "pack_unit": "length (3 m)"}
TEFLON = _material("Teflon tape", "12 mm", "roll", "1")
CPVC_SOLVENT = _material("CPVC solvent cement", "", "tin (50 ml)", "0.25")

PLUMBER_ITEMS: tuple[ItemSeed, ...] = (
    # ---- Taps & showers --------------------------------------------------------------------
    ItemSeed(
        "Tap fixing",
        "each",
        "One pillar or bib tap fixed and sealed, tap supplied by the customer.",
        120_00,
        group="Taps & showers",
        recipe=(
            _material("Tap", "brass, 15 mm - pillar or bib cock", "no", "1"),
            _material("Extension nipple", "15 mm, brass", "no", "1"),
            TEFLON,
        ),
        bundles={"1bhk": 4, "2bhk": 6, "3bhk": 8},
    ),
    ItemSeed(
        "Wall mixer fixing",
        "each",
        "One hot-and-cold wall mixer with spout fixed and sealed.",
        250_00,
        group="Taps & showers",
        recipe=(
            _material("Wall mixer", "with spout, 15 mm", "no", "1"),
            _material("Extension nipple", "15 mm, brass", "no", "2"),
            TEFLON,
        ),
        bundles={"1bhk": 1, "2bhk": 2, "3bhk": 3},
    ),
    ItemSeed(
        "Overhead shower fixing",
        "each",
        "One overhead shower with arm, fixed and sealed.",
        150_00,
        group="Taps & showers",
        recipe=(
            _material("Overhead shower with arm", "", "no", "1"),
            TEFLON,
        ),
        bundles={"1bhk": 1, "2bhk": 2, "3bhk": 3},
    ),
    ItemSeed(
        "Health faucet fixing",
        "each",
        "One health faucet with its angle cock and hose.",
        120_00,
        group="Taps & showers",
        recipe=(
            _material("Health faucet set", "with hose and holder", "set", "1"),
            _material("Angle cock", "15 mm, brass", "no", "1"),
            TEFLON,
        ),
        bundles={"1bhk": 1, "2bhk": 2, "3bhk": 3},
    ),
    ItemSeed(
        "Angle cock fixing",
        "each",
        "One angle cock fixed at a wall outlet.",
        80_00,
        group="Taps & showers",
        recipe=(_material("Angle cock", "15 mm, brass", "no", "1"), TEFLON),
        bundles={"1bhk": 4, "2bhk": 6, "3bhk": 9},
    ),
    # ---- WC & basin ------------------------------------------------------------------------
    ItemSeed(
        "WC fixing - floor mounted",
        "each",
        "One floor-mounted WC with cistern, set, sealed and connected.",
        600_00,
        group="WC & basin",
        recipe=(
            _material("WC with cistern", "floor mounted, S-trap or P-trap as on site", "no", "1"),
            _material("Cistern connection pipe", "flexible, 15 mm", "no", "1"),
            _material("WC fixing kit", "bolts, seal ring, wax", "set", "1"),
            _material("Angle cock", "15 mm, brass", "no", "1"),
        ),
        bundles={"1bhk": 1, "2bhk": 2, "3bhk": 3},
    ),
    ItemSeed(
        "WC fixing - wall hung",
        "each",
        "One wall-hung WC on a concealed cistern frame, set and connected.",
        1_200_00,
        group="WC & basin",
        recipe=(
            _material("Wall-hung WC", "with seat cover", "no", "1"),
            _material("Concealed cistern with frame", "", "no", "1"),
            _material("Flush plate", "", "no", "1"),
        ),
    ),
    ItemSeed(
        "Basin fixing",
        "each",
        "One wash basin with trap and connections, fixed and sealed.",
        350_00,
        group="WC & basin",
        recipe=(
            _material("Wash basin", "pedestal, counter-top or wall hung as on site", "no", "1"),
            _material("Basin tap", "15 mm", "no", "1"),
            _material("Bottle trap", "32 mm, chrome", "no", "1"),
            _material("Waste coupling", "32 mm", "no", "1"),
            _material("Connection pipe", "flexible, 15 mm", "no", "2"),
            _material("Angle cock", "15 mm, brass", "no", "2"),
        ),
        bundles={"1bhk": 1, "2bhk": 2, "3bhk": 3},
    ),
    ItemSeed(
        "Kitchen sink fixing",
        "each",
        "One kitchen sink with trap and tap connections.",
        350_00,
        group="WC & basin",
        recipe=(
            _material("Kitchen sink", "stainless steel, single or double bowl", "no", "1"),
            _material("Sink tap", "15 mm, swan neck", "no", "1"),
            _material("Waste coupling", "40 mm", "no", "1"),
            _material("Bottle trap", "40 mm", "no", "1"),
            _material("Angle cock", "15 mm, brass", "no", "1"),
        ),
        bundles={"1bhk": 1, "2bhk": 1, "3bhk": 1},
    ),
    # ---- Pipes & lines ---------------------------------------------------------------------
    ItemSeed(
        "Concealed water line - per point",
        "each",
        "One concealed hot or cold supply point, chased, piped and tested.",
        450_00,
        group="Pipes & lines",
        recipe=(
            _material("CPVC pipe 3/4 in", CPVC_SPEC, "m", "5", **PIPE_LENGTH),
            _material("CPVC elbow 3/4 in", CPVC_SPEC, "no", "3"),
            _material("CPVC tee 3/4 in", CPVC_SPEC, "no", "1"),
            _material("CPVC brass elbow 1/2 in", "wall outlet", "no", "1"),
            CPVC_SOLVENT,
        ),
        bundles={"1bhk": 8, "2bhk": 12, "3bhk": 16},
    ),
    ItemSeed(
        "Geyser line",
        "each",
        "Hot and cold lines to one geyser, with its connections.",
        500_00,
        group="Pipes & lines",
        recipe=(
            _material("CPVC pipe 3/4 in", CPVC_SPEC, "m", "4", **PIPE_LENGTH),
            _material("CPVC elbow 3/4 in", CPVC_SPEC, "no", "4"),
            _material("Geyser connection pipe", "flexible, 15 mm", "no", "2"),
            _material("Angle cock", "15 mm, brass", "no", "2"),
            CPVC_SOLVENT,
        ),
        bundles={"1bhk": 1, "2bhk": 2, "3bhk": 3},
    ),
    ItemSeed(
        "CPVC line laying",
        "running_ft",
        "Open or concealed CPVC supply line, per running foot.",
        35_00,
        group="Pipes & lines",
        recipe=(_material("CPVC pipe 3/4 in", CPVC_SPEC, "m", "0.3", **PIPE_LENGTH),),
    ),
    ItemSeed(
        "UPVC drain line laying",
        "running_ft",
        "UPVC waste or soil line, per running foot.",
        45_00,
        group="Pipes & lines",
        recipe=(_material("UPVC pipe 75 mm", UPVC_SPEC, "m", "0.3", **PIPE_LENGTH),),
    ),
    ItemSeed(
        "Pipe leak repair",
        "job",
        "Finding and fixing one leaking joint or pipe section.",
        350_00,
        group="Pipes & lines",
        recipe=(_material("CPVC coupler / elbow", CPVC_SPEC, "no", "2"), CPVC_SOLVENT),
    ),
    # ---- Drainage --------------------------------------------------------------------------
    ItemSeed(
        "Floor trap fixing",
        "each",
        "One floor trap with grating, set in the floor.",
        200_00,
        group="Drainage",
        recipe=(
            _material("Floor trap", "PVC, 100 mm", "no", "1"),
            _material("Floor grating", "stainless, 5 in", "no", "1"),
        ),
        bundles={"1bhk": 2, "2bhk": 3, "3bhk": 4},
    ),
    ItemSeed(
        "Drain block clearing",
        "job",
        "Clearing one blocked sink, floor trap or line by rod or machine.",
        400_00,
        group="Drainage",
    ),
    ItemSeed(
        "Chamber cleaning",
        "job",
        "Opening and clearing one inspection chamber.",
        500_00,
        group="Drainage",
    ),
    # ---- Tank & motor ----------------------------------------------------------------------
    ItemSeed(
        "Overhead tank connection",
        "each",
        "Inlet, outlet and overflow connected to one overhead tank.",
        600_00,
        group="Tank & motor",
        recipe=(
            _material("Float valve", "brass, 3/4 in", "no", "1"),
            _material("Ball valve", "brass, 3/4 in", "no", "2"),
            _material("CPVC pipe 3/4 in", CPVC_SPEC, "m", "6", **PIPE_LENGTH),
            _material("Tank nipple / fittings", "3/4 in", "set", "1"),
        ),
    ),
    ItemSeed(
        "Water motor installation",
        "each",
        "One monoblock or booster motor connected with valves, motor supplied by the customer.",
        700_00,
        group="Tank & motor",
        recipe=(
            _material("Foot valve", "1 in", "no", "1"),
            _material("Non-return valve", "1 in", "no", "1"),
            _material("Ball valve", "brass, 1 in", "no", "1"),
            _material("GI / CPVC pipe 1 in", "", "m", "3", **PIPE_LENGTH),
        ),
    ),
    ItemSeed(
        "Sump or bore connection",
        "job",
        "Connecting a sump or bore line to the motor and tank.",
        900_00,
        group="Tank & motor",
    ),
    ItemSeed(
        "Water pressure fix",
        "job",
        "Diagnosing and fixing low pressure at a tap or a line.",
        350_00,
        group="Tank & motor",
    ),
    # ---- Labour (day) ----------------------------------------------------------------------
    ItemSeed("Plumber", "day", "One plumber for a full working day.", 1_000_00, group="Labour"),
    ItemSeed("Helper", "day", "One helper for a full working day.", 650_00, group="Labour"),
)

# Carpentry consumables, named once. Boards and laminates are what the customer buys; the
# carpenter cuts and fits them.
PLY_SPEC = "BWR grade, ISI (Century / Greenply class)"
LAMINATE_SPEC = "1 mm, 8 x 4 ft sheet"
HINGE = _material("Soft-close hinge", "Hettich / Ebco class", "no", "4")
SCREWS = _material("Screws and fixings", "assorted, 1 to 2 in", "box", "0.2")

CARPENTER_ITEMS: tuple[ItemSeed, ...] = (
    # ---- Kitchen ---------------------------------------------------------------------------
    ItemSeed(
        "Base unit - per running foot",
        "running_ft",
        "Modular base cabinet with shutters, made and fitted, per running foot.",
        1_400_00,
        group="Kitchen",
        recipe=(
            _material("Plywood 18 mm", PLY_SPEC, "sheet (8 x 4 ft)", "0.35"),
            _material("Laminate", LAMINATE_SPEC, "sheet", "0.35"),
            _material("Soft-close hinge", "Hettich / Ebco class", "no", "1.5"),
            _material("Handle", "", "no", "0.75"),
            SCREWS,
        ),
        bundles={"1bhk": 8, "2bhk": 10, "3bhk": 14},
    ),
    ItemSeed(
        "Wall unit - per running foot",
        "running_ft",
        "Modular wall cabinet with shutters, made and fitted, per running foot.",
        1_100_00,
        group="Kitchen",
        recipe=(
            _material("Plywood 18 mm", PLY_SPEC, "sheet (8 x 4 ft)", "0.25"),
            _material("Laminate", LAMINATE_SPEC, "sheet", "0.3"),
            _material("Soft-close hinge", "Hettich / Ebco class", "no", "1.5"),
            _material("Handle", "", "no", "0.75"),
            SCREWS,
        ),
        bundles={"1bhk": 6, "2bhk": 8, "3bhk": 12},
    ),
    ItemSeed(
        "Tall unit",
        "each",
        "One floor-to-ceiling pantry or appliance tower.",
        9_000_00,
        group="Kitchen",
        recipe=(
            _material("Plywood 18 mm", PLY_SPEC, "sheet (8 x 4 ft)", "2"),
            _material("Laminate", LAMINATE_SPEC, "sheet", "2"),
            _material("Soft-close hinge", "Hettich / Ebco class", "no", "6"),
            SCREWS,
        ),
        bundles={"2bhk": 1, "3bhk": 1},
    ),
    ItemSeed(
        "Drawer with channel",
        "each",
        "One drawer box on soft-close channels, fitted into a unit.",
        900_00,
        group="Kitchen",
        recipe=(
            _material("Drawer channel", "soft-close, 18 in", "pair", "1"),
            _material("Plywood 12 mm", PLY_SPEC, "sheet (8 x 4 ft)", "0.15"),
        ),
        bundles={"1bhk": 3, "2bhk": 4, "3bhk": 6},
    ),
    ItemSeed(
        "Loft unit - per running foot",
        "running_ft",
        "Loft storage above the wall units, per running foot.",
        800_00,
        group="Kitchen",
        recipe=(
            _material("Plywood 18 mm", PLY_SPEC, "sheet (8 x 4 ft)", "0.2"),
            _material("Laminate", LAMINATE_SPEC, "sheet", "0.2"),
            SCREWS,
        ),
    ),
    # ---- Wardrobes & storage ---------------------------------------------------------------
    ItemSeed(
        "Wardrobe - per running foot",
        "running_ft",
        "Hinged wardrobe with shelves and hanging rod, made and fitted, per running foot.",
        2_200_00,
        group="Wardrobes",
        recipe=(
            _material("Plywood 18 mm", PLY_SPEC, "sheet (8 x 4 ft)", "0.6"),
            _material("Laminate", LAMINATE_SPEC, "sheet", "0.6"),
            _material("Soft-close hinge", "Hettich / Ebco class", "no", "3"),
            _material("Hanging rod", "chrome, per ft", "ft", "1"),
            SCREWS,
        ),
        bundles={"1bhk": 6, "2bhk": 12, "3bhk": 18},
    ),
    ItemSeed(
        "Sliding wardrobe - per running foot",
        "running_ft",
        "Sliding-door wardrobe on a track, made and fitted, per running foot.",
        2_600_00,
        group="Wardrobes",
        recipe=(
            _material("Plywood 18 mm", PLY_SPEC, "sheet (8 x 4 ft)", "0.6"),
            _material("Laminate", LAMINATE_SPEC, "sheet", "0.6"),
            _material("Sliding track set", "top and bottom, per ft", "ft", "1"),
            SCREWS,
        ),
    ),
    ItemSeed(
        "Loft above wardrobe - per running foot",
        "running_ft",
        "Loft storage above a wardrobe, per running foot.",
        900_00,
        group="Wardrobes",
        recipe=(
            _material("Plywood 18 mm", PLY_SPEC, "sheet (8 x 4 ft)", "0.25"),
            _material("Laminate", LAMINATE_SPEC, "sheet", "0.25"),
            SCREWS,
        ),
    ),
    ItemSeed(
        "Shoe rack / storage bench",
        "each",
        "One shoe rack or storage bench, made and fitted.",
        5_500_00,
        group="Wardrobes",
        recipe=(
            _material("Plywood 18 mm", PLY_SPEC, "sheet (8 x 4 ft)", "1"),
            _material("Laminate", LAMINATE_SPEC, "sheet", "1"),
            HINGE,
        ),
    ),
    # ---- Furniture -------------------------------------------------------------------------
    ItemSeed(
        "TV unit - wall panel",
        "each",
        "Wall-mounted TV panel with one or two shelves.",
        7_500_00,
        group="Furniture",
        recipe=(
            _material("Plywood 18 mm", PLY_SPEC, "sheet (8 x 4 ft)", "1.5"),
            _material("Laminate", LAMINATE_SPEC, "sheet", "1.5"),
            SCREWS,
        ),
        bundles={"1bhk": 1, "2bhk": 1, "3bhk": 1},
    ),
    ItemSeed(
        "TV unit - floor console",
        "each",
        "Floor-standing TV console with drawers or shutters.",
        9_500_00,
        group="Furniture",
        recipe=(
            _material("Plywood 18 mm", PLY_SPEC, "sheet (8 x 4 ft)", "2"),
            _material("Laminate", LAMINATE_SPEC, "sheet", "2"),
            _material("Drawer channel", "soft-close, 18 in", "pair", "2"),
            SCREWS,
        ),
    ),
    ItemSeed(
        "Study table or desk",
        "each",
        "One study table with a drawer, made and fitted.",
        6_500_00,
        group="Furniture",
        recipe=(
            _material("Plywood 18 mm", PLY_SPEC, "sheet (8 x 4 ft)", "1.25"),
            _material("Laminate", LAMINATE_SPEC, "sheet", "1.25"),
            _material("Drawer channel", "soft-close, 18 in", "pair", "1"),
            SCREWS,
        ),
    ),
    ItemSeed(
        "Bed with storage",
        "each",
        "Queen or king box bed with hydraulic or drawer storage, headboard included.",
        18_000_00,
        group="Furniture",
        recipe=(
            _material("Plywood 18 mm", PLY_SPEC, "sheet (8 x 4 ft)", "4"),
            _material("Laminate", LAMINATE_SPEC, "sheet", "3"),
            _material("Hydraulic lift set", "for box bed", "set", "1"),
            SCREWS,
        ),
    ),
    ItemSeed(
        "Bookshelf / display unit",
        "each",
        "One open shelf unit, made and fitted.",
        5_000_00,
        group="Furniture",
        recipe=(
            _material("Plywood 18 mm", PLY_SPEC, "sheet (8 x 4 ft)", "1"),
            _material("Laminate", LAMINATE_SPEC, "sheet", "1"),
            SCREWS,
        ),
    ),
    # ---- Doors & repairs -------------------------------------------------------------------
    ItemSeed(
        "Door fitting",
        "each",
        "One door hung on its frame with hinges and lock, door supplied by the customer.",
        800_00,
        group="Doors & repairs",
        recipe=(
            _material("Door", "flush, panel or WPC as chosen", "no", "1"),
            _material("Door hinge", "4 in, stainless", "no", "3"),
            _material("Mortise lock set", "", "set", "1"),
            SCREWS,
        ),
    ),
    ItemSeed(
        "Shutter or hinge repair",
        "each",
        "Realigning a shutter or replacing its hinges.",
        350_00,
        group="Doors & repairs",
        recipe=(HINGE,),
    ),
    ItemSeed(
        "Polishing - per sq ft",
        "sq_ft",
        "Melamine or PU polish on existing woodwork, per square foot.",
        45_00,
        group="Doors & repairs",
        recipe=(
            _material("Melamine polish", "", "litre", "0.05"),
            _material("Sandpaper", "assorted grit", "sheet", "0.1"),
        ),
    ),
    # ---- Labour (day) ----------------------------------------------------------------------
    ItemSeed("Carpenter", "day", "One carpenter for a full working day.", 1_200_00, group="Labour"),
    ItemSeed("Helper", "day", "One helper for a full working day.", 650_00, group="Labour"),
)

# Event decor: the decorator's labour and setup priced per element, and the flowers, fabric and
# lights the customer buys against it. Sizes are the quick sets: small (a home function),
# medium (a hall), large (a lawn or a wedding).
DECOR_ITEMS: tuple[ItemSeed, ...] = (
    ItemSeed(
        "Stage backdrop - per running foot",
        "running_ft",
        "Stage or photo backdrop framed, draped and dressed, per running foot of width.",
        900_00,
        group="Stage",
        recipe=(
            _material("Backdrop fabric", "satin or net, 44 in width", "m", "1.5"),
            _material("Fresh flowers", "marigold or roses, by season", "kg", "0.5"),
            _material("Fairy lights", "10 m string", "string", "0.5"),
        ),
        bundles={"small": 8, "medium": 12, "large": 20},
    ),
    ItemSeed(
        "Mandap or ceremony frame",
        "each",
        "A four-pillar mandap or ceremony frame, dressed.",
        12_000_00,
        group="Stage",
        recipe=(
            _material("Drape fabric", "satin, 44 in width", "m", "40"),
            _material("Fresh flowers", "marigold or roses, by season", "kg", "8"),
            _material("Fairy lights", "10 m string", "string", "6"),
        ),
        bundles={"large": 1},
    ),
    ItemSeed(
        "Entrance arch",
        "each",
        "One flower or balloon arch at the entrance.",
        3_500_00,
        group="Entrance",
        recipe=(
            _material("Fresh flowers", "marigold or roses, by season", "kg", "4"),
            _material("Fairy lights", "10 m string", "string", "2"),
        ),
        bundles={"small": 1, "medium": 1, "large": 1},
    ),
    ItemSeed(
        "Walkway with stands - per running foot",
        "running_ft",
        "Pathway lined with flower stands or lanterns, per running foot.",
        250_00,
        group="Entrance",
        recipe=(_material("Fresh flowers", "marigold or roses, by season", "kg", "0.2"),),
        bundles={"medium": 20, "large": 40},
    ),
    ItemSeed(
        "Welcome board and name board",
        "each",
        "Welcome board with the names, on a stand.",
        1_500_00,
        group="Entrance",
        recipe=(_material("Foam board with print", "3 x 2 ft", "no", "1"),),
        bundles={"small": 1, "medium": 1, "large": 1},
    ),
    ItemSeed(
        "Ceiling drapes - per sq ft",
        "sq_ft",
        "Ceiling draping with fairy lights, per square foot of ceiling.",
        18_00,
        group="Drapes & ceiling",
        recipe=(
            _material("Drape fabric", "net or satin, 44 in width", "m", "0.15"),
            _material("Fairy lights", "10 m string", "string", "0.02"),
        ),
        bundles={"medium": 800, "large": 2000},
    ),
    ItemSeed(
        "Table centrepiece",
        "each",
        "One centrepiece per table.",
        450_00,
        group="Tables",
        recipe=(_material("Fresh flowers", "mixed, by season", "kg", "0.3"),),
        bundles={"medium": 10, "large": 25},
    ),
    ItemSeed(
        "Chair cover with bow",
        "each",
        "Chair cover and sash, fitted, per chair.",
        40_00,
        group="Tables",
        recipe=(_material("Chair cover with sash", "hire or buy", "no", "1"),),
        bundles={"medium": 100, "large": 250},
    ),
    ItemSeed(
        "Balloon backdrop",
        "each",
        "Balloon garland backdrop for a birthday or baby shower.",
        4_000_00,
        group="Balloons",
        recipe=(
            _material("Balloons", "12 in, assorted, pack of 100", "pack", "3"),
            _material("Balloon strip and glue dots", "", "set", "1"),
        ),
        bundles={"small": 1},
    ),
    ItemSeed(
        "Balloon ceiling fill",
        "each",
        "Helium or ceiling balloon fill for one room.",
        2_500_00,
        group="Balloons",
        recipe=(_material("Balloons", "12 in, assorted, pack of 100", "pack", "2"),),
    ),
    ItemSeed(
        "Building outline lighting - per running foot",
        "running_ft",
        "Serial or rope lighting along a building outline, per running foot.",
        30_00,
        group="Lighting",
        recipe=(_material("Rope light", "LED, per 10 m", "roll (10 m)", "0.03"),),
        bundles={"large": 200},
    ),
    ItemSeed(
        "Focus and par lights",
        "each",
        "One focus or par light on a stand, wired.",
        600_00,
        group="Lighting",
        bundles={"medium": 4, "large": 8},
    ),
    ItemSeed(
        "Photo booth corner",
        "each",
        "A dressed selfie corner with props.",
        3_000_00,
        group="Extras",
        recipe=(
            _material("Backdrop fabric", "satin or net, 44 in width", "m", "6"),
            _material("Fairy lights", "10 m string", "string", "2"),
        ),
        bundles={"medium": 1, "large": 1},
    ),
    ItemSeed(
        "Setup and teardown crew",
        "day",
        "A decorator crew day for setting up and clearing the venue.",
        3_500_00,
        group="Labour",
    ),
)

CATALOG: tuple[tuple[str, tuple[ItemSeed, ...]], ...] = (
    ("electrician", ELECTRICAL_ITEMS),
    ("painter", PAINTING_ITEMS),
    ("plumber", PLUMBER_ITEMS),
    ("carpenter", CARPENTER_ITEMS),
    ("event-lighting-decor", DECOR_ITEMS),
    ("tiling-flooring-work", TILING_ITEMS),
    ("terrace-waterproofing", WATERPROOFING_ITEMS),
    ("home-demolition", DEMOLITION_ITEMS),
    ("construction-helper", HELPER_ITEMS),
    ("ac-technician", AC_ITEMS),
    ("event-catering", CATERING_ITEMS),
    ("bridal-event-makeup", MAKEUP_ITEMS),
)

#: A fixed, past instant — so a second run's `activate_guardrail_policy` short-circuits
#: on the version-already-active check rather than trying to reactivate a retired row.
GUARDRAIL_EFFECTIVE_FROM = datetime(2026, 1, 1, tzinfo=UTC)


class Command(BaseCommand):
    help = (
        "Load a demonstrable price book: an electrical + painting work-item catalog with "
        "material recipes and quick sets, Hyderabad reference rates, an active guardrail "
        "policy, and one saved rate per demo partner. Development only."
    )

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--i-understand-this-is-dev-only",
            action="store_true",
            dest="acknowledged",
        )
        parser.add_argument(
            "--with-m2-demo",
            action="store_true",
            dest="with_m2_demo",
            help=(
                "Run `seed_m2_demo --i-understand-this-is-dev-only` first, so the "
                "service area, skills and demo partners this command needs exist. "
                "Skip this if you have already run it."
            ),
        )

    @transaction.atomic
    def handle(self, *_args: Any, **options: Any) -> None:
        self._assert_dev_only(acknowledged=bool(options["acknowledged"]))

        if options["with_m2_demo"]:
            call_command("seed_m2_demo", i_understand_this_is_dev_only=True)

        area = self._require_service_area()
        actor = self._require_seed_actor()

        policy = self._seed_guardrail_policy(actor=actor)

        items_created = 0
        rates_published = 0
        rates_saved_for_demo_partners = 0
        for skill_code, items in CATALOG:
            skill = self._require_skill(skill_code)
            for order, seed in enumerate(items, start=1):
                item, created = self._seed_work_item(skill=skill, seed=seed, order=order)
                items_created += int(created)
                rate_published = self._seed_reference_rate(
                    item=item, area=area, reference_rate_paise=seed.reference_rate_paise
                )
                rates_published += int(rate_published)
                rates_saved_for_demo_partners += int(
                    self._seed_demo_partner_rate(item=item, area=area, skill=skill)
                )

        self.stdout.write(
            self.style.SUCCESS(
                f"Guardrail policy: version {policy.version} active. "
                f"Work items: {items_created} created. "
                f"Reference rates: {rates_published} published. "
                f"Demo partner rates saved: {rates_saved_for_demo_partners}."
            )
        )

    # -- guards --------------------------------------------------------------

    def _assert_dev_only(self, *, acknowledged: bool) -> None:
        if not settings.DEBUG:
            raise CommandError(
                "seed_price_book_demo writes a placeholder catalog and guardrail policy and "
                "is forbidden outside local development. settings.DEBUG is False."
            )
        if not acknowledged:
            raise CommandError(
                "Pass --i-understand-this-is-dev-only. Every reference rate and every "
                "guardrail percentage this command writes is invented for the demo, not an "
                "owner-approved policy."
            )

    def _require_service_area(self) -> ServiceArea:
        area = ServiceArea.objects.filter(slug=SERVICE_AREA_SLUG).first()
        if area is None:
            raise CommandError(
                f"No service area '{SERVICE_AREA_SLUG}' exists. Run "
                "`seed_m2_demo --i-understand-this-is-dev-only` first, or pass --with-m2-demo."
            )
        return area

    def _require_skill(self, code: str) -> Skill:
        skill = Skill.objects.filter(code=code).first()
        if skill is None:
            raise CommandError(
                f"No skill '{code}' exists. Run `seed_m2_demo --i-understand-this-is-dev-only` "
                "first, or pass --with-m2-demo."
            )
        return skill

    def _require_seed_actor(self) -> User:
        """Someone to record as `published_by`/`approved_by`. The first staff user, if any.

        Not a demo partner's user — publishing a catalog and activating a policy are both
        Operations actions, and attributing them to a vendor account would misstate who
        made the decision, invented as it is for this demo.
        """
        actor = User.objects.filter(is_staff=True).order_by("date_joined").first()
        if actor is not None:
            return actor
        actor = User.objects.order_by("date_joined").first()
        if actor is None:
            raise CommandError(
                "No user exists to attribute these seed rows to. Create one (or run "
                "`seed_m2_demo` first, which creates several) and try again."
            )
        return actor

    # -- catalog ---------------------------------------------------------------

    def _seed_work_item(self, *, skill: Skill, seed: ItemSeed, order: int) -> tuple[WorkItem, bool]:
        """Upsert on (skill, name), refreshing the authored shape every run.

        Group, recipe, bundles, unit and order come from this file — a change here must reach
        the database on the next run, or the composer keeps showing last week's tabs. Only
        the money (`WorkItemRate`) is publish-once.
        """
        item, created = WorkItem.objects.update_or_create(
            skill=skill,
            name=seed.name,
            defaults={
                "unit": seed.unit,
                "description": f"{seed.description} {DEV_SEED_MARKER}.",
                "status": WorkItem.Status.ACTIVE,
                "sort_order": order,
                "group": seed.group,
                "material_recipe": list(seed.recipe),
                "bundle_quantities": dict(seed.bundles),
            },
        )
        return item, created

    def _seed_reference_rate(
        self, *, item: WorkItem, area: ServiceArea, reference_rate_paise: int
    ) -> bool:
        """Publish version 1 if none is published yet. Never republishes over a real rate.

        A `WorkItemRate` this command wrote always has `published_by` set to the seed
        actor and no way to tell a real publish from a seeded one except that fact and
        the item's own `DEV SEED` marker — so the check is simply "does a published
        version already exist", matching `seed_m2_demo`'s own "never overwrite" rule in
        spirit: this command only ever fills a gap, never supersedes an existing rate.
        """
        existing = WorkItemRate.objects.filter(
            work_item=item, service_area=area, status=WorkItemRate.Status.PUBLISHED
        ).exists()
        if existing:
            return False
        price_book.publish_reference_rate(
            actor=self._require_seed_actor(),
            work_item_id=item.id,
            service_area_id=area.id,
            reference_rate_paise=reference_rate_paise,
        )
        return True

    def _seed_demo_partner_rate(self, *, item: WorkItem, area: ServiceArea, skill: Skill) -> bool:
        """Save the reference rate as one demo partner's own rate, so the rate-card screen
        and composer autofill have something to show without a manual save."""
        link = (
            PartnerSkill.objects.filter(skill=skill, is_active=True)
            .select_related("partner")
            .order_by("partner_id")
            .first()
        )
        if link is None:
            return False
        partner = PartnerProfile.objects.get(pk=link.partner_id)
        if PartnerRateItem.objects.filter(partner=partner, work_item=item).exists():
            return False
        band = band_for_item_in_area(
            work_item=item, service_area=area, policy=self._active_policy()
        )
        if band is None:
            return False
        PartnerRateItem.objects.create(
            partner=partner,
            work_item=item,
            rate_paise=band["reference_rate_paise"],
            is_active=True,
        )
        return True

    def _active_policy(self) -> QuoteGuardrailPolicy:
        return price_book.active_guardrail_policy()

    # -- guardrail policy --------------------------------------------------------

    def _seed_guardrail_policy(self, *, actor: User) -> QuoteGuardrailPolicy:
        """Version 1: -20%/+30% band. The misc/margin/custom-share caps are kept on the row
        because the policy table requires them, but nothing enforces them any more — custom
        items go out with the estimate (owner decision, 2026-08-29)."""
        return price_book.activate_guardrail_policy(
            actor=actor,
            version=GUARDRAIL_POLICY_VERSION,
            approval_reference=f"{DEV_SEED_MARKER} — Phase A demo",
            effective_from=GUARDRAIL_EFFECTIVE_FROM,
            default_band_below_bps=2_000,
            default_band_above_bps=3_000,
            misc_cap_bps=1_000,
            margin_cap_bps=2_500,
            custom_share_cap_bps=2_000,
            per_skill_bands={},
        )
