"""Seed the priced Technician, Beautician, Home and Pet task catalog.

## Why this is a second command

`seed_technician_catalog` is the six-service M1 fixture the test suite is built on, and it ends
by pausing every service outside its own list and by writing a compatibility rule for every pair
of variants it seeded. Folding two hundred services into it would pause nothing but itself, and
would generate tens of thousands of pair rules on every test that calls it.

So this command adds; it never prunes. **Run order matters**: `seed_technician_catalog` first
(it pauses everything it does not know about), then this one.

## What "task based" means here

One visit, one verified professional, a scope fixed before anybody travels. That is the only
thing `A1_TASK_VISIT` can honestly price, so the source list is filtered rather than imported:

* `Sqft` and `Rft` rows are excluded — wiring priced per square foot needs a site measurement,
  and a fixed price for one would be a number nobody can honour.
* `Project` and `Package` rows are excluded — a range like 3,000-25,000 is a quote, not a price.
* `BASIC VISIT CHARGE` rows are excluded — the visit fee is a pricing-policy concern, and
  seeding it would let somebody book "a visit charge" as though it were work.
* Rows with no price in the source list are excluded, which is why Solar, Lift and Watch Repair
  are absent from an otherwise complete Technician list.

Diagnostic `Visit` rows (`Power Issue Check`, `General Plumbing Check`, `RO Repair`) are kept:
they are dispatchable, fixed-price and finish in one visit, which is the test.

## Prices

Technician and Beautician come from the reviewed source list. Home and Pet do **not** — that
list prices neither of them, so every Home and Pet figure is a proposal, flagged again at the
block that defines them.

Where a source range exists, `unit_price_paise` is its **lower bound**, rounded down to the ₹x9
the rest of the catalog uses — 199-349 becomes ₹199, 3000-8000 becomes ₹2,999. It reads as
"from", which is the only honest thing to show before a professional has seen the job.

## Durations are estimates, and are the one invented number here

The source list carries no durations, and `TaskRate` needs `base_duration_minutes` plus
`marginal_duration_minutes` to quote at all. Setup time is per trade — travel-in, laying out
tools, protecting the floor — because it is a property of the trade rather than the task. Work
time is per task. Both are first-pass estimates to be corrected against real visit data; nothing
downstream treats them as authoritative, and the grid re-derives arrival windows from whatever
they end up being.

## Equipment and unsafe conditions are per trade, not per task

An electrician carries the same bag to a fan repair and a fuse replacement. Writing two hundred
bespoke lists would be two hundred opportunities to invent a detail nobody reviewed; one list
per trade is both true and reviewable.

## No compatibility rules

Deliberate. Without a rule, `carts.planning` falls back to independent visits, which is the safe
answer for two services nobody has confirmed one person can do back to back. Pair rules are a
reviewed decision per pair, not a bulk import.
"""

from dataclasses import dataclass
from datetime import UTC, datetime
from itertools import combinations
from uuid import UUID

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Count, F, Q

from apps.carts.models import ServiceCompatibilityRule
from apps.catalog.models import (
    A1VariantConfiguration,
    Category,
    Service,
    ServicePolicy,
    ServiceVariant,
    Subcategory,
)
from apps.catalog.seed_content import (
    SERVICE_VARIANTS,
    VariantSeed,
    category_for_trade,
    content_for_trade,
)
from apps.locations.models import ServiceArea, ServiceAreaService
from apps.pricing.models import ServiceRate, TaskRate

SEED_RATE_EFFECTIVE_FROM = datetime(2026, 1, 1, tzinfo=UTC)


@dataclass(frozen=True, slots=True)
class TaskSeed:
    """One bookable task. `minutes` is hands-on work; the trade adds its own setup time."""

    name: str
    slug: str
    price_paise: int
    minutes: int


@dataclass(frozen=True, slots=True)
class TradeSeed:
    """One subcategory. `slug` is also the `required_skill_code` dispatch matches on."""

    name: str
    slug: str
    setup_minutes: int
    equipment: tuple[str, ...]
    unsafe: tuple[str, ...]
    tasks: tuple[TaskSeed, ...]


ELECTRICAL_KIT = (
    "insulated screwdriver set",
    "voltage tester",
    "combination pliers",
    "wire cutter",
)
ELECTRICAL_UNSAFE = (
    "live exposed conductors",
    "signs of fire or burning smell",
    "water ingress near the circuit",
    "no accessible isolation point",
)
PLUMBING_KIT = ("adjustable wrench", "pipe wrench", "plumber tape", "sealant")
PLUMBING_UNSAFE = (
    "uncontrolled water flow with no shut-off",
    "sewage exposure",
    "corroded pipe at risk of failure",
)

#: Every trade that started life under Technician, in one place. Which category each ends up
#: in is decided below by `CATEGORY_FOR_TRADE`, not by which tuple it is written in — the map
#: is shared with `seed_technician_catalog`, and a trade listed in one and moved in the other
#: is exactly the drift that would duplicate a subcategory.
_TECHNICIAN_SOURCE: tuple[TradeSeed, ...] = (
    TradeSeed(
        "Electrician",
        "electrician",
        10,
        (*ELECTRICAL_KIT, "drill", "ladder"),
        ELECTRICAL_UNSAFE,
        (
            TaskSeed("General Electrical Works", "electrician-general-works", 9_900, 30),
            TaskSeed("Switch Board Repair", "electrician-switch-board-repair", 12_900, 30),
            TaskSeed(
                "Switch Board Replacement", "electrician-switch-board-replacement", 14_900, 45
            ),
            TaskSeed("Plug Point Fixing", "electrician-plug-point-fixing", 9_900, 30),
            TaskSeed("Door Bell Installation", "electrician-door-bell-installation", 9_900, 30),
            TaskSeed("Wall Fan Installation", "electrician-wall-fan-installation", 19_900, 45),
            TaskSeed(
                "Exhaust Fan Installation", "electrician-exhaust-fan-installation", 14_900, 45
            ),
            TaskSeed("Fan Repair", "electrician-fan-repair", 14_900, 45),
            TaskSeed(
                "Decorative Light Installation",
                "electrician-decorative-light-installation",
                49_900,
                90,
            ),
            TaskSeed("Chandelier Installation", "electrician-chandelier-installation", 49_900, 90),
            TaskSeed("Junction Box Fixing", "electrician-junction-box-fixing", 9_900, 30),
            TaskSeed("DB Board Installation", "electrician-db-board-installation", 49_900, 90),
            TaskSeed("DB Board Repair", "electrician-db-board-repair", 29_900, 60),
            TaskSeed("MCB Installation", "electrician-mcb-installation", 14_900, 30),
            TaskSeed("Fuse Replacement", "electrician-fuse-replacement", 9_900, 20),
            TaskSeed("Main Board Installation", "electrician-main-board-installation", 49_900, 90),
            TaskSeed("Load Distribution Setup", "electrician-load-distribution-setup", 79_900, 120),
            TaskSeed("Water Motor Wiring", "electrician-water-motor-wiring", 29_900, 60),
            TaskSeed("Pump Connection", "electrician-pump-connection", 29_900, 60),
            TaskSeed("Bore Motor Connection", "electrician-bore-motor-connection", 49_900, 90),
            TaskSeed("Starter Panel Setup", "electrician-starter-panel-setup", 59_900, 90),
            TaskSeed("Inverter Installation", "electrician-inverter-installation", 49_900, 90),
            TaskSeed("UPS Setup", "electrician-ups-setup", 39_900, 60),
            TaskSeed("Generator Connection", "electrician-generator-connection", 99_900, 120),
            TaskSeed("Power Issue Check", "electrician-power-issue-check", 14_900, 30),
            TaskSeed("Short Circuit Fix", "electrician-short-circuit-fix", 19_900, 45),
            TaskSeed("Voltage Issue Fix", "electrician-voltage-issue-fix", 14_900, 45),
            TaskSeed("Trip Problem Fix", "electrician-trip-problem-fix", 14_900, 45),
        ),
    ),
    TradeSeed(
        "Plumber",
        "plumber",
        10,
        (*PLUMBING_KIT, "drain auger", "bucket and floor sheet"),
        PLUMBING_UNSAFE,
        (
            TaskSeed("Tap Replacement", "plumber-tap-replacement", 19_900, 45),
            TaskSeed("Pipe Leakage Fix", "plumber-pipe-leakage-fix", 14_900, 45),
            TaskSeed("Pipe Joint Repair", "plumber-pipe-joint-repair", 14_900, 45),
            TaskSeed("Shower Repair", "plumber-shower-repair", 14_900, 45),
            TaskSeed("Drain Block Removal", "plumber-drain-block-removal", 19_900, 60),
            TaskSeed("Tap Installation", "plumber-tap-installation", 14_900, 30),
            TaskSeed("Shower Installation", "plumber-shower-installation", 14_900, 45),
            TaskSeed("WC Installation", "plumber-wc-installation", 49_900, 120),
            TaskSeed("Basin Installation", "plumber-basin-installation", 29_900, 90),
            TaskSeed("Sink Installation", "plumber-sink-installation", 29_900, 90),
            TaskSeed(
                "Health Faucet Installation", "plumber-health-faucet-installation", 14_900, 30
            ),
            TaskSeed("Overhead Tank Connection", "plumber-overhead-tank-connection", 39_900, 90),
            TaskSeed("Bore Connection", "plumber-bore-connection", 49_900, 120),
            TaskSeed("Full Bathroom Plumbing", "plumber-full-bathroom-plumbing", 99_900, 240),
            TaskSeed("Geyser Pipe Connection", "plumber-geyser-pipe-connection", 29_900, 60),
            TaskSeed("Bathroom Fitting Setup", "plumber-bathroom-fitting-setup", 99_900, 240),
            TaskSeed("Chamber Cleaning", "plumber-chamber-cleaning", 29_900, 60),
            TaskSeed("Water Pressure Fix", "plumber-water-pressure-fix", 19_900, 45),
            TaskSeed("Tank Overflow Fix", "plumber-tank-overflow-fix", 19_900, 45),
            TaskSeed("General Plumbing Check", "plumber-general-check", 14_900, 30),
            TaskSeed("Motor Installation", "plumber-motor-installation", 49_900, 120),
            TaskSeed("Motor Repair", "plumber-motor-repair", 49_900, 120),
        ),
    ),
    TradeSeed(
        "Carpenter",
        "carpenter",
        10,
        ("cordless drill", "screwdriver set", "spirit level", "measuring tape", "chisel set"),
        (
            "structurally unsound fixing point",
            "concealed wiring behind the drilling line",
            "unsafe working height with no anchor",
        ),
        (
            TaskSeed("Door Repair", "carpenter-door-repair", 19_900, 60),
            TaskSeed("Window Repair", "carpenter-window-repair", 19_900, 60),
            TaskSeed("Lock Fitting", "carpenter-lock-fitting", 14_900, 45),
            TaskSeed("Door Installation", "carpenter-door-installation", 49_900, 120),
            TaskSeed("Window Installation", "carpenter-window-installation", 49_900, 120),
            TaskSeed("Shelf Installation", "carpenter-shelf-installation", 19_900, 60),
            TaskSeed("Curtain Rod Installation", "carpenter-curtain-rod-installation", 14_900, 30),
            TaskSeed("Glass Fixing", "carpenter-glass-fixing", 29_900, 60),
            TaskSeed("Bed Assembly", "carpenter-bed-assembly", 29_900, 90),
            TaskSeed("Table Assembly", "carpenter-table-assembly", 19_900, 45),
            TaskSeed("Chair Assembly", "carpenter-chair-assembly", 19_900, 30),
            TaskSeed("TV Unit Installation", "carpenter-tv-unit-installation", 49_900, 90),
            TaskSeed(
                "Modular Kitchen Installation",
                "carpenter-modular-kitchen-installation",
                199_900,
                480,
            ),
            TaskSeed("Cabinet Installation", "carpenter-cabinet-installation", 49_900, 120),
        ),
    ),
    TradeSeed(
        "AC Technician",
        "ac-technician",
        15,
        ("gauge manifold", "vacuum pump", "flaring tool", "drill", "ladder", "jet wash pump"),
        (
            "refrigerant leak in an unventilated room",
            "unsafe mounting bracket or wall condition",
            "live exposed conductors at the isolator",
        ),
        (
            TaskSeed("Split AC Installation", "ac-split-installation", 149_900, 120),
            TaskSeed("Window AC Installation", "ac-window-installation", 99_900, 90),
            TaskSeed("AC Uninstallation", "ac-uninstallation", 49_900, 60),
            TaskSeed("AC Reinstallation", "ac-reinstallation", 149_900, 120),
            TaskSeed("AC General Service", "ac-general-service", 49_900, 60),
            TaskSeed("AC Deep Cleaning", "ac-deep-cleaning", 99_900, 90),
            TaskSeed("AC Jet Wash", "ac-jet-wash", 119_900, 90),
            TaskSeed("Gas Filling", "ac-gas-filling", 249_900, 90),
            TaskSeed("Cooling Issue Repair", "ac-cooling-issue-repair", 29_900, 60),
            TaskSeed("Water Leakage Fix", "ac-water-leakage-fix", 29_900, 60),
            TaskSeed("AC Shifting", "ac-shifting", 199_900, 180),
        ),
    ),
    TradeSeed(
        "RO Technician",
        "ro-technician",
        10,
        ("filter spanner", "TDS meter", "teflon tape", "screwdriver set"),
        ("contaminated inlet supply", "electrical fitting in a wet zone"),
        (
            TaskSeed("RO Installation", "ro-installation", 49_900, 90),
            TaskSeed("RO Service", "ro-service", 29_900, 60),
            TaskSeed("RO Filter Replacement", "ro-filter-replacement", 29_900, 45),
            TaskSeed("RO Repair", "ro-repair", 29_900, 60),
        ),
    ),
    TradeSeed(
        "Internet & WiFi Technician",
        "internet-technician",
        10,
        ("crimping tool", "LAN tester", "laptop", "drill"),
        ("unsafe working height", "live conductors along the cable route"),
        (
            TaskSeed("Router Installation", "internet-router-installation", 29_900, 60),
            TaskSeed("Router Configuration", "internet-router-configuration", 19_900, 45),
            TaskSeed("WiFi Setup", "internet-wifi-setup", 29_900, 60),
            TaskSeed("Network Setup", "internet-network-setup", 49_900, 120),
            TaskSeed("Signal Issue Fix", "internet-signal-issue-fix", 29_900, 60),
            TaskSeed("WiFi Range Extender Setup", "internet-range-extender-setup", 49_900, 60),
            TaskSeed(
                "Access Point Installation", "internet-access-point-installation", 99_900, 120
            ),
        ),
    ),
    TradeSeed(
        "Gas Stove Technician",
        "gas-stove-technician",
        10,
        ("spanner set", "leak detection solution", "screwdriver set", "burner cleaning kit"),
        (
            "active gas leak",
            "damaged or expired regulator hose",
            "ignition source near the leak",
        ),
        (
            TaskSeed("Gas Stove Repair", "gas-stove-repair", 19_900, 45),
            TaskSeed("Gas Leakage Fix", "gas-leakage-fix", 29_900, 60),
            TaskSeed("Gas Pipeline Installation", "gas-pipeline-installation", 49_900, 120),
            TaskSeed("Regulator Installation", "gas-regulator-installation", 14_900, 30),
            TaskSeed("Burner Cleaning", "gas-burner-cleaning", 19_900, 45),
            TaskSeed("Burner Replacement", "gas-burner-replacement", 29_900, 45),
            TaskSeed("Auto Ignition Repair", "gas-auto-ignition-repair", 29_900, 60),
        ),
    ),
    TradeSeed(
        "Computer & Laptop Technician",
        "computer-technician",
        10,
        ("precision screwdriver set", "anti-static strap", "bootable media", "thermal paste"),
        ("liquid damage with power still connected", "swollen or leaking battery"),
        (
            TaskSeed("OS Installation", "computer-os-installation", 39_900, 90),
            TaskSeed("Software Installation", "computer-software-installation", 19_900, 45),
            TaskSeed("Virus Removal", "computer-virus-removal", 29_900, 60),
            TaskSeed("System Formatting", "computer-system-formatting", 39_900, 90),
            TaskSeed("RAM Upgrade", "computer-ram-upgrade", 19_900, 30),
            TaskSeed("SSD Installation", "computer-ssd-installation", 29_900, 45),
            TaskSeed("Laptop Screen Replacement", "computer-screen-replacement", 99_900, 90),
            TaskSeed("Keyboard Replacement", "computer-keyboard-replacement", 49_900, 60),
            TaskSeed("Motherboard Repair", "computer-motherboard-repair", 99_900, 180),
            TaskSeed("Printer Setup", "computer-printer-setup", 19_900, 45),
            TaskSeed("Data Recovery", "computer-data-recovery", 99_900, 180),
        ),
    ),
    TradeSeed(
        "Mobile Technician",
        "mobile-technician",
        10,
        ("precision screwdriver set", "heat gun", "opening picks", "anti-static mat"),
        ("swollen or punctured battery", "liquid damage with the device still powered"),
        (
            TaskSeed("Mobile Screen Replacement", "mobile-screen-replacement", 29_900, 60),
            TaskSeed("Mobile Battery Replacement", "mobile-battery-replacement", 19_900, 45),
            TaskSeed("Charging Issue Repair", "mobile-charging-issue-repair", 29_900, 60),
            TaskSeed("Speaker Repair", "mobile-speaker-repair", 19_900, 45),
            TaskSeed("Microphone Repair", "mobile-microphone-repair", 19_900, 45),
            TaskSeed("Mobile Camera Repair", "mobile-camera-repair", 29_900, 60),
            TaskSeed("Water Damage Repair", "mobile-water-damage-repair", 49_900, 120),
            TaskSeed("Software Flashing", "mobile-software-flashing", 29_900, 60),
        ),
    ),
    TradeSeed(
        "CCTV & Security Technician",
        "cctv-technician",
        15,
        ("drill", "ladder", "crimping tool", "test monitor", "cable tester"),
        (
            "unsafe working height with no anchor",
            "live conductors along the cable route",
            "unstable mounting surface",
        ),
        (
            TaskSeed("CCTV Camera Installation", "cctv-camera-installation", 89_900, 90),
            TaskSeed("DVR Installation", "cctv-dvr-installation", 49_900, 60),
            TaskSeed("NVR Installation", "cctv-nvr-installation", 79_900, 90),
            TaskSeed("Mobile Viewing Setup", "cctv-mobile-viewing-setup", 29_900, 45),
            TaskSeed("CCTV Camera Repair", "cctv-camera-repair", 29_900, 60),
            TaskSeed("Biometric Installation", "cctv-biometric-installation", 99_900, 120),
            TaskSeed(
                "Video Door Phone Installation", "cctv-video-door-phone-installation", 149_900, 120
            ),
        ),
    ),
    TradeSeed(
        "Locksmith",
        "locksmith",
        10,
        ("lock pick set", "cordless drill", "key cutting gauge", "chisel set"),
        (
            "no proof the caller may open this door",
            "door or frame damage that will not re-secure",
        ),
        (
            TaskSeed("Lock Repair", "locksmith-lock-repair", 19_900, 45),
            TaskSeed("Lock Installation", "locksmith-lock-installation", 29_900, 60),
            TaskSeed("Key Duplication", "locksmith-key-duplication", 9_900, 20),
            TaskSeed("Door Unlock Service", "locksmith-door-unlock", 29_900, 45),
            TaskSeed("Car Lock Opening", "locksmith-car-lock-opening", 49_900, 45),
            TaskSeed(
                "Digital Lock Installation", "locksmith-digital-lock-installation", 99_900, 90
            ),
            TaskSeed("Smart Lock Installation", "locksmith-smart-lock-installation", 149_900, 120),
        ),
    ),
    TradeSeed(
        "Home Automation & Sound",
        "home-automation-technician",
        15,
        ("voltage tester", "screwdriver set", "drill", "laptop", "cable tester"),
        ("live exposed conductors", "no neutral wire at the switch box"),
        (
            TaskSeed(
                "Smart Switch Installation", "automation-smart-switch-installation", 29_900, 60
            ),
            TaskSeed(
                "Home Theatre Installation", "automation-home-theatre-installation", 99_900, 150
            ),
            TaskSeed("Speaker Setup", "automation-speaker-setup", 49_900, 90),
            TaskSeed("Alexa Integration", "automation-alexa-integration", 99_900, 60),
            TaskSeed("Smart Curtain Setup", "automation-smart-curtain-setup", 99_900, 120),
        ),
    ),
    TradeSeed(
        "Fire Safety Technician",
        "fire-safety-technician",
        15,
        ("pressure gauge", "drill", "spanner set", "signage kit"),
        ("blocked or locked emergency exit", "discharged system with no standby cover"),
        (
            TaskSeed(
                "Fire Extinguisher Installation", "fire-extinguisher-installation", 29_900, 45
            ),
            TaskSeed("Fire Alarm Setup", "fire-alarm-setup", 99_900, 120),
            TaskSeed("Sprinkler Installation", "fire-sprinkler-installation", 149_900, 180),
            TaskSeed("Fire Safety Inspection", "fire-safety-inspection", 49_900, 60),
            TaskSeed("Extinguisher Refilling", "fire-extinguisher-refilling", 29_900, 45),
            TaskSeed("Emergency Exit Sign Installation", "fire-exit-sign-installation", 49_900, 60),
        ),
    ),
)

BEAUTY_KIT = ("sanitised single-use tools", "disposable towels", "professional product kit")
BEAUTY_UNSAFE = (
    "open wound or active skin infection at the treatment site",
    "declared allergy to the products required",
    "recent cosmetic procedure at the same site",
)


def _trades_for(category_slug: str) -> tuple[TradeSeed, ...]:
    """The Technician-origin trades that belong to one category."""

    return tuple(
        trade
        for trade in _TECHNICIAN_SOURCE
        if category_for_trade(trade.slug, "technician") == category_slug
    )


ELECTRICIAN_TRADES = _trades_for("electrician")
PLUMBER_TRADES = _trades_for("plumber")
AC_TRADES = _trades_for("ac-services")
TECHNICIAN_TRADES = _trades_for("technician")


BEAUTICIAN_TRADES: tuple[TradeSeed, ...] = (
    TradeSeed(
        "Face Care",
        "face-care",
        10,
        (
            *BEAUTY_KIT,
            "steamer",
        ),
        BEAUTY_UNSAFE,
        (
            TaskSeed("Face Cleanup", "beauty-face-cleanup", 29_900, 45),
            TaskSeed("Basic Facial", "beauty-basic-facial", 49_900, 60),
            TaskSeed("Fruit Facial", "beauty-fruit-facial", 59_900, 60),
            TaskSeed("Gold Facial", "beauty-gold-facial", 79_900, 75),
            TaskSeed("Diamond Facial", "beauty-diamond-facial", 99_900, 75),
            TaskSeed("Pearl Facial", "beauty-pearl-facial", 89_900, 75),
            TaskSeed("Anti-Aging Facial", "beauty-anti-aging-facial", 149_900, 90),
            TaskSeed("Acne Treatment Facial", "beauty-acne-treatment-facial", 99_900, 75),
            TaskSeed("Whitening Facial", "beauty-whitening-facial", 99_900, 75),
            TaskSeed("Hydrating Facial", "beauty-hydrating-facial", 99_900, 75),
            TaskSeed("Brightening Facial", "beauty-brightening-facial", 99_900, 75),
            TaskSeed("Skin Polishing", "beauty-skin-polishing", 149_900, 90),
        ),
    ),
    TradeSeed(
        "Bleach & Detan",
        "bleach-detan",
        10,
        BEAUTY_KIT,
        (
            *BEAUTY_UNSAFE,
            "no patch test tolerated",
        ),
        (
            TaskSeed("Face Bleach", "beauty-face-bleach", 19_900, 30),
            TaskSeed("Neck Bleach", "beauty-neck-bleach", 14_900, 20),
            TaskSeed("Full Body Bleach", "beauty-full-body-bleach", 99_900, 90),
            TaskSeed("Detan Face", "beauty-detan-face", 29_900, 30),
            TaskSeed("Detan Neck", "beauty-detan-neck", 19_900, 20),
            TaskSeed("Detan Full Body", "beauty-detan-full-body", 149_900, 90),
        ),
    ),
    TradeSeed(
        "Waxing",
        "waxing",
        10,
        (
            *BEAUTY_KIT,
            "wax heater",
        ),
        (
            *BEAUTY_UNSAFE,
            "sunburn or recently waxed skin",
        ),
        (
            TaskSeed("Full Arms Wax", "beauty-full-arms-wax", 29_900, 30),
            TaskSeed("Half Arms Wax", "beauty-half-arms-wax", 19_900, 20),
            TaskSeed("Full Legs Wax", "beauty-full-legs-wax", 39_900, 45),
            TaskSeed("Half Legs Wax", "beauty-half-legs-wax", 24_900, 30),
            TaskSeed("Underarms Wax", "beauty-underarms-wax", 14_900, 15),
            TaskSeed("Full Body Wax", "beauty-full-body-wax", 99_900, 90),
            TaskSeed("Bikini Wax", "beauty-bikini-wax", 79_900, 45),
            TaskSeed("Face Wax", "beauty-face-wax", 19_900, 20),
        ),
    ),
    TradeSeed(
        "Threading",
        "threading",
        5,
        BEAUTY_KIT,
        BEAUTY_UNSAFE,
        (
            TaskSeed("Eyebrow Threading", "beauty-eyebrow-threading", 4_900, 15),
            TaskSeed("Upper Lip Threading", "beauty-upper-lip-threading", 4_900, 10),
            TaskSeed("Forehead Threading", "beauty-forehead-threading", 4_900, 10),
            TaskSeed("Chin Threading", "beauty-chin-threading", 4_900, 10),
            TaskSeed("Full Face Threading", "beauty-full-face-threading", 19_900, 30),
        ),
    ),
    TradeSeed(
        "Hair Services",
        "hair-services",
        10,
        (*BEAUTY_KIT, "professional dryer", "sectioning clips", "colour bowl and brush"),
        (
            *BEAUTY_UNSAFE,
            "scalp infection or open sores",
        ),
        (
            TaskSeed("Hair Cut", "beauty-hair-cut", 19_900, 45),
            TaskSeed("Hair Trim", "beauty-hair-trim", 14_900, 30),
            TaskSeed("Hair Styling", "beauty-hair-styling", 29_900, 45),
            TaskSeed("Blow Dry", "beauty-blow-dry", 29_900, 30),
            TaskSeed("Global Hair Color", "beauty-global-hair-color", 99_900, 120),
            TaskSeed("Root Touch-up", "beauty-root-touch-up", 79_900, 60),
            TaskSeed("Highlights", "beauty-highlights", 149_900, 150),
            TaskSeed("Balayage", "beauty-balayage", 299_900, 180),
            TaskSeed("Ombre", "beauty-ombre", 299_900, 180),
            TaskSeed("Hair Spa", "beauty-hair-spa", 99_900, 60),
            TaskSeed("Dandruff Treatment", "beauty-dandruff-treatment", 99_900, 60),
            TaskSeed("Hair Fall Treatment", "beauty-hair-fall-treatment", 99_900, 60),
            TaskSeed("Scalp Treatment", "beauty-scalp-treatment", 99_900, 60),
            TaskSeed("Hair Smoothening", "beauty-hair-smoothening", 299_900, 180),
            TaskSeed("Hair Straightening", "beauty-hair-straightening", 399_900, 180),
            TaskSeed("Keratin Treatment", "beauty-keratin-treatment", 399_900, 180),
            TaskSeed("Botox Treatment", "beauty-hair-botox-treatment", 499_900, 180),
            TaskSeed("Hair Rebonding", "beauty-hair-rebonding", 399_900, 210),
            TaskSeed("Hair Extension", "beauty-hair-extension", 499_900, 180),
        ),
    ),
    TradeSeed(
        "Manicure & Pedicure",
        "manicure-pedicure",
        10,
        (*BEAUTY_KIT, "soaking tub", "nail file set"),
        (
            *BEAUTY_UNSAFE,
            "nail or nail-bed infection",
        ),
        (
            TaskSeed("Basic Manicure", "beauty-basic-manicure", 29_900, 45),
            TaskSeed("Basic Pedicure", "beauty-basic-pedicure", 39_900, 60),
            TaskSeed("Spa Manicure", "beauty-spa-manicure", 59_900, 60),
            TaskSeed("Spa Pedicure", "beauty-spa-pedicure", 79_900, 75),
            TaskSeed("Foot Spa", "beauty-foot-spa", 49_900, 45),
            TaskSeed("Gel Nail Polish", "beauty-gel-nail-polish", 49_900, 60),
            TaskSeed("Nail Art", "beauty-nail-art", 19_900, 45),
        ),
    ),
    TradeSeed(
        "Makeup",
        "makeup",
        15,
        (*BEAUTY_KIT, "professional makeup kit", "ring light", "airbrush unit"),
        BEAUTY_UNSAFE,
        (
            TaskSeed("Light Makeup", "beauty-light-makeup", 99_900, 60),
            TaskSeed("Party Makeup", "beauty-party-makeup", 199_900, 90),
            TaskSeed("Engagement Makeup", "beauty-engagement-makeup", 299_900, 120),
            TaskSeed("Bridal Makeup", "beauty-bridal-makeup", 499_900, 180),
            TaskSeed("HD Makeup", "beauty-hd-makeup", 699_900, 180),
            TaskSeed("Airbrush Makeup", "beauty-airbrush-makeup", 999_900, 180),
            TaskSeed("Reception Makeup", "beauty-reception-makeup", 299_900, 120),
        ),
    ),
    TradeSeed(
        "Mehendi",
        "mehendi",
        10,
        ("fresh henna cones", "disposable liners", "stencil set"),
        (
            *BEAUTY_UNSAFE,
            "declared sensitivity to henna",
        ),
        (
            TaskSeed("Simple Mehendi", "beauty-simple-mehendi", 19_900, 45),
            TaskSeed("Arabic Mehendi", "beauty-arabic-mehendi", 49_900, 60),
            TaskSeed("Full Hand Mehendi", "beauty-full-hand-mehendi", 79_900, 90),
            TaskSeed("Bridal Mehendi", "beauty-bridal-mehendi", 199_900, 180),
            TaskSeed("Leg Mehendi", "beauty-leg-mehendi", 99_900, 90),
        ),
    ),
    TradeSeed(
        "Body Care",
        "body-care",
        10,
        (*BEAUTY_KIT, "massage couch cover", "warm towel kit"),
        (
            *BEAUTY_UNSAFE,
            "recent surgery or unhealed injury",
        ),
        (
            TaskSeed("Body Polishing", "beauty-body-polishing", 149_900, 90),
            TaskSeed("Body Scrub", "beauty-body-scrub", 99_900, 60),
            TaskSeed("Body Massage", "beauty-body-massage", 99_900, 60),
            TaskSeed("Full Body Detan", "beauty-full-body-detan", 149_900, 90),
        ),
    ),
    TradeSeed(
        "Advanced Skin Care",
        "advanced-skin-care",
        15,
        (*BEAUTY_KIT, "hydra device", "pH-controlled peel kit"),
        (
            *BEAUTY_UNSAFE,
            "active dermatological treatment without clearance",
        ),
        (
            TaskSeed("Acne Treatment", "beauty-acne-treatment", 99_900, 60),
            TaskSeed("Pigmentation Treatment", "beauty-pigmentation-treatment", 199_900, 75),
            TaskSeed("Skin Glow Treatment", "beauty-skin-glow-treatment", 149_900, 60),
            TaskSeed("Anti-Aging Treatment", "beauty-anti-aging-treatment", 199_900, 75),
            TaskSeed("Dark Spot Removal", "beauty-dark-spot-removal", 99_900, 60),
            TaskSeed("Hydra Facial", "beauty-hydra-facial", 249_900, 90),
            TaskSeed("Chemical Peel", "beauty-chemical-peel", 199_900, 75),
        ),
    ),
)

# ----------------------------------------------------------------------------------------------
# Home and Pet services
#
# UNREVIEWED PRICING. Every price below is a proposal, not a figure from the source list — that
# list carries no price and no unit for any Home or Pet row. They are Hyderabad market rates in
# the same "from" and charm-price shape as the rest of the catalog, and they are the numbers most
# likely to be wrong in this file. Correct them here; nothing computes a price from anything else.
#
# The same task-visit filter applies, and it removes more here than it did for the trades above:
#
# * Maid Services and Elder Care are recurring placements of a person, not a fixed visit. Selling
#   "Full Time Maid" as a one-off task visit would promise something the dispatch engine cannot
#   deliver, and the money model behind it is a different one.
# * Home Shifting and Pet Taxi are priced by volume and distance, which nobody knows before a
#   survey.
# * Storage Services and Pet Boarding rent space by the night; that is the accommodation model.
# * Borewell work needs a rig and is priced by depth.
# * Annual Maintenance Contract is a subscription.
# * Pet Shop is retail, Pet Adoption is not a paid service, and Pet Insurance is advice.
# ----------------------------------------------------------------------------------------------

CLEANING_KIT = (
    "vacuum cleaner",
    "microfibre cloths",
    "scrubbing pads",
    "graded cleaning agents",
    "step ladder",
)
CLEANING_UNSAFE = (
    "unsafe working height with no anchor",
    "live electrical fitting in the wet zone",
    "visible mould or biohazard requiring specialist clearance",
)
PET_KIT = ("sanitised grooming tools", "non-slip mat", "pet-safe products", "muzzle and lead")
PET_UNSAFE = (
    "aggressive animal that cannot be safely handled alone",
    "visible injury, distress or suspected illness",
    "no vaccination record available",
)

HOME_TRADES: tuple[TradeSeed, ...] = (
    TradeSeed(
        "Home Cleaning",
        "home-cleaning",
        15,
        CLEANING_KIT,
        CLEANING_UNSAFE,
        (
            TaskSeed("Basic Home Cleaning", "home-basic-cleaning", 149_900, 180),
            TaskSeed("Deep Home Cleaning", "home-deep-cleaning", 299_900, 300),
            TaskSeed("Move In Cleaning", "home-move-in-cleaning", 349_900, 300),
            TaskSeed("Move Out Cleaning", "home-move-out-cleaning", 349_900, 300),
            TaskSeed("Villa Cleaning", "home-villa-cleaning", 499_900, 360),
            TaskSeed("Apartment Cleaning", "home-apartment-cleaning", 199_900, 210),
            TaskSeed("Office Cleaning", "home-office-cleaning", 249_900, 240),
            TaskSeed("Kitchen Deep Cleaning", "home-kitchen-deep-cleaning", 149_900, 150),
            TaskSeed("Bathroom Deep Cleaning", "home-bathroom-deep-cleaning", 79_900, 90),
            TaskSeed("Balcony Cleaning", "home-balcony-cleaning", 59_900, 60),
            TaskSeed("Terrace Cleaning", "home-terrace-cleaning", 99_900, 90),
            TaskSeed("Window Cleaning", "home-window-cleaning", 49_900, 60),
            TaskSeed("Glass Cleaning", "home-glass-cleaning", 49_900, 60),
            TaskSeed("Fan Cleaning", "home-fan-cleaning", 29_900, 45),
            TaskSeed("Wall Cleaning", "home-wall-cleaning", 99_900, 120),
            TaskSeed("Floor Scrubbing", "home-floor-scrubbing", 149_900, 150),
            TaskSeed("Marble Polishing", "home-marble-polishing", 299_900, 240),
            TaskSeed("Tile Cleaning", "home-tile-cleaning", 129_900, 120),
        ),
    ),
    TradeSeed(
        "Sofa & Carpet Cleaning",
        "sofa-carpet-cleaning",
        15,
        (*CLEANING_KIT, "upholstery extractor", "shampoo applicator"),
        CLEANING_UNSAFE,
        (
            TaskSeed("Sofa Shampooing", "sofa-shampooing", 99_900, 90),
            TaskSeed("Carpet Cleaning", "carpet-cleaning", 79_900, 75),
            TaskSeed("Curtain Cleaning", "curtain-cleaning", 59_900, 60),
            TaskSeed("Mattress Cleaning", "mattress-cleaning", 79_900, 60),
            TaskSeed("Upholstery Cleaning", "upholstery-cleaning", 89_900, 75),
        ),
    ),
    TradeSeed(
        "Pest Control",
        "pest-control",
        15,
        ("licensed pesticide kit", "sprayer", "respirator and gloves", "bait stations"),
        (
            "infant, pregnancy or medical condition in the treated space",
            "no ventilation for the chemicals required",
            "food preparation area that cannot be cleared",
        ),
        (
            TaskSeed("Cockroach Control", "pest-cockroach-control", 89_900, 60),
            TaskSeed("Termite Control", "pest-termite-control", 299_900, 180),
            TaskSeed("Bed Bug Control", "pest-bed-bug-control", 149_900, 90),
            TaskSeed("Mosquito Control", "pest-mosquito-control", 99_900, 60),
            TaskSeed("Ant Control", "pest-ant-control", 79_900, 45),
            TaskSeed("Rat Control", "pest-rat-control", 99_900, 60),
            TaskSeed("Lizard Control", "pest-lizard-control", 79_900, 45),
            TaskSeed("General Pest Control", "pest-general-control", 129_900, 90),
        ),
    ),
    TradeSeed(
        "Water Tank Cleaning",
        "water-tank-cleaning",
        15,
        ("submersible pump", "pressure washer", "sanitising agent", "confined-space lighting"),
        (
            "confined space with no second person present",
            "structural damage to the tank",
            "no safe means of draining the tank",
        ),
        (
            TaskSeed("Overhead Tank Cleaning", "tank-overhead-cleaning", 99_900, 90),
            TaskSeed("Underground Tank Cleaning", "tank-underground-cleaning", 149_900, 120),
            TaskSeed("Sump Cleaning", "tank-sump-cleaning", 129_900, 105),
        ),
    ),
    TradeSeed(
        "Septic Tank Services",
        "septic-tank-services",
        20,
        ("suction hose", "protective suit and respirator", "drain rods", "high-pressure jet"),
        (
            "confined space entry without a permit",
            "gas build-up in the chamber",
            "no safe disposal route for the waste",
        ),
        (
            TaskSeed("Septic Tank Cleaning", "septic-tank-cleaning", 299_900, 150),
            TaskSeed("Drain Cleaning", "septic-drain-cleaning", 99_900, 90),
            TaskSeed("Sewer Line Cleaning", "septic-sewer-line-cleaning", 199_900, 120),
        ),
    ),
    TradeSeed(
        "Laundry Services",
        "laundry-services",
        10,
        ("collection bags", "garment tags", "stain treatment kit"),
        ("garment with no care label and a delicate finish", "items already colour-bleeding"),
        (
            TaskSeed("Washing", "laundry-washing", 9_900, 30),
            TaskSeed("Ironing", "laundry-ironing", 4_900, 20),
            TaskSeed("Dry Cleaning", "laundry-dry-cleaning", 19_900, 30),
            TaskSeed("Steam Iron", "laundry-steam-iron", 7_900, 20),
            TaskSeed("Shoe Cleaning", "laundry-shoe-cleaning", 29_900, 45),
            TaskSeed("Bag Cleaning", "laundry-bag-cleaning", 34_900, 45),
        ),
    ),
    TradeSeed(
        "Gardening",
        "gardening",
        15,
        ("secateurs", "lawn mower", "rake and shears", "green waste bags"),
        (
            "tree work near live overhead lines",
            "unsafe working height with no anchor",
            "unstable ground or retaining wall",
        ),
        (
            TaskSeed("Garden Cleaning", "garden-cleaning", 79_900, 90),
            TaskSeed("Lawn Mowing", "garden-lawn-mowing", 59_900, 60),
            TaskSeed("Plant Maintenance", "garden-plant-maintenance", 49_900, 60),
            TaskSeed("Tree Trimming", "garden-tree-trimming", 149_900, 120),
            TaskSeed("Landscape Maintenance", "garden-landscape-maintenance", 199_900, 180),
        ),
    ),
    TradeSeed(
        "Swimming Pool Services",
        "swimming-pool-services",
        20,
        ("pool vacuum", "skimmer net", "water test kit", "dosing chemicals"),
        (
            "unfenced pool with children present",
            "electrical fault in the pump housing",
            "water chemistry outside safe handling limits",
        ),
        (
            TaskSeed("Pool Cleaning", "pool-cleaning", 199_900, 120),
            TaskSeed("Pool Maintenance", "pool-maintenance", 299_900, 150),
            TaskSeed("Pool Water Treatment", "pool-water-treatment", 149_900, 90),
        ),
    ),
    TradeSeed(
        "Chimney & Exhaust",
        "chimney-exhaust",
        15,
        ("degreasing agent", "scraper set", "drop sheets", "screwdriver set"),
        ("gas appliance that cannot be isolated", "unsafe working height over a hob"),
        (
            TaskSeed("Chimney Cleaning", "chimney-cleaning", 89_900, 90),
            TaskSeed("Kitchen Exhaust Cleaning", "kitchen-exhaust-cleaning", 69_900, 75),
        ),
    ),
    TradeSeed(
        "Home Organization",
        "home-organization",
        10,
        ("labelling kit", "storage boxes", "measuring tape"),
        ("items the customer has not authorised anyone to move or discard",),
        (
            TaskSeed("Wardrobe Organization", "organize-wardrobe", 99_900, 120),
            TaskSeed("Kitchen Organization", "organize-kitchen", 119_900, 150),
            TaskSeed("Store Room Organization", "organize-store-room", 99_900, 120),
            TaskSeed("Decluttering Service", "organize-decluttering", 149_900, 180),
        ),
    ),
    TradeSeed(
        "Home Inspection",
        "home-inspection",
        15,
        ("moisture meter", "torch", "measuring tape", "camera"),
        (
            "structurally unsafe area that cannot be entered",
            "no access to the areas being reported on",
        ),
        (
            TaskSeed("Property Inspection", "inspection-property", 199_900, 120),
            TaskSeed("Pre-Purchase Home Inspection", "inspection-pre-purchase", 299_900, 180),
            TaskSeed("Rental Inspection", "inspection-rental", 149_900, 90),
        ),
    ),
    TradeSeed(
        "Home Maintenance",
        "home-maintenance",
        10,
        ("general tool kit", "cordless drill", "sealant and fixings"),
        ("work requiring a licensed trade the visit is not staffed for",),
        (
            TaskSeed("Handyman Service", "handyman-service", 49_900, 60),
            TaskSeed("Emergency Home Service", "handyman-emergency-service", 79_900, 60),
        ),
    ),
)

PET_TRADES: tuple[TradeSeed, ...] = (
    TradeSeed(
        "Pet Grooming",
        "pet-grooming",
        15,
        (*PET_KIT, "clippers", "pet dryer"),
        PET_UNSAFE,
        (
            TaskSeed("Dog Grooming", "pet-dog-grooming", 99_900, 90),
            TaskSeed("Cat Grooming", "pet-cat-grooming", 89_900, 75),
            TaskSeed("Pet Bath & Spa", "pet-bath-and-spa", 69_900, 60),
            TaskSeed("Pet Hair Trimming", "pet-hair-trimming", 59_900, 45),
            TaskSeed("Pet Nail Clipping", "pet-nail-clipping", 29_900, 20),
            TaskSeed("Pet Ear Cleaning", "pet-ear-cleaning", 29_900, 20),
            TaskSeed("Pet Teeth Cleaning", "pet-teeth-cleaning", 49_900, 30),
        ),
    ),
    TradeSeed(
        "Veterinary",
        "veterinary",
        15,
        ("veterinary bag", "thermometer and stethoscope", "cold chain vaccine carrier"),
        (
            *PET_UNSAFE,
            "condition needing clinic equipment a home visit does not carry",
        ),
        (
            TaskSeed("General Check-up", "vet-general-checkup", 49_900, 30),
            TaskSeed("Vaccination", "vet-vaccination", 69_900, 30),
            TaskSeed("Emergency Vet Visit", "vet-emergency-visit", 149_900, 60),
            TaskSeed("Surgery Consultation", "vet-surgery-consultation", 99_900, 45),
            TaskSeed("Deworming", "vet-deworming", 39_900, 20),
        ),
    ),
    TradeSeed(
        "Pet Walking",
        "pet-walking",
        5,
        ("lead and harness", "waste bags", "water bottle"),
        PET_UNSAFE,
        (TaskSeed("Dog Walking", "pet-dog-walking", 29_900, 45),),
    ),
    TradeSeed(
        "Pet Sitting",
        "pet-sitting",
        10,
        ("feeding schedule", "waste bags", "emergency contact sheet"),
        PET_UNSAFE,
        (TaskSeed("Home Pet Sitting", "pet-home-sitting", 79_900, 240),),
    ),
    TradeSeed(
        "Pet Training",
        "pet-training",
        10,
        ("clicker", "training treats", "long lead"),
        PET_UNSAFE,
        (
            TaskSeed("Dog Training", "pet-dog-training", 99_900, 60),
            TaskSeed("Puppy Training", "pet-puppy-training", 89_900, 60),
        ),
    ),
    TradeSeed(
        "Pet Photography",
        "pet-photography",
        15,
        ("camera and lens kit", "portable lighting", "backdrop", "treats"),
        PET_UNSAFE,
        (TaskSeed("Pet Photoshoot", "pet-photoshoot", 249_900, 90),),
    ),
)

CATALOG: tuple[tuple[str, str, str, str, str, tuple[TradeSeed, ...]], ...] = (
    (
        "technician",
        "Technician",
        "Reviewed one-person Technician task visits.",
        "wrench",
        "technician-home-service",
        TECHNICIAN_TRADES,
    ),
    (
        "electrician",
        "Electrician",
        "Wiring, fittings, fans and power faults, fixed in one visit.",
        "zap",
        "technician-home-service",
        ELECTRICIAN_TRADES,
    ),
    (
        "plumber",
        "Plumber",
        "Taps, leaks, drains and fittings, fixed in one visit.",
        "droplet",
        "technician-home-service",
        PLUMBER_TRADES,
    ),
    (
        "ac-services",
        "AC Services",
        "Installation, servicing, gas and repair for split and window units.",
        "wind",
        "technician-home-service",
        AC_TRADES,
    ),
    (
        "beautician",
        "Beautician",
        "Salon-grade beauty and grooming services delivered at home.",
        "sparkles",
        "beauty-personal-care",
        BEAUTICIAN_TRADES,
    ),
    (
        "home-services",
        "Home Services",
        "Cleaning, pest control and upkeep delivered at your address.",
        "home",
        "home-care-service",
        HOME_TRADES,
    ),
    (
        "pet-services",
        "Pet Services",
        "Grooming, veterinary and care visits for pets at home.",
        "paw-print",
        "pet-care-service",
        PET_TRADES,
    ),
)


class Command(BaseCommand):
    help = "Seed the priced Technician, Beautician, Home and Pet task catalog. Adds; never prunes."

    @transaction.atomic
    def handle(self, *_args: object, **_options: object) -> None:
        variants: list[ServiceVariant] = []

        for category_order, entry in enumerate(CATALOG, start=1):
            slug, name, description, icon_key, tax_code, trades = entry
            category, _ = Category.objects.update_or_create(
                slug=slug,
                defaults={
                    "name": name,
                    "description": description,
                    "icon_key": icon_key,
                    "display_order": category_order,
                    "is_active": True,
                },
            )
            for trade_order, trade in enumerate(trades, start=1):
                subcategory, _ = Subcategory.objects.update_or_create(
                    category=category,
                    slug=trade.slug,
                    defaults={
                        "name": trade.name,
                        "display_order": trade_order,
                        "is_active": True,
                    },
                )
                for task_order, task in enumerate(trade.tasks, start=1):
                    variants.extend(
                        self._seed_task(
                            subcategory=subcategory,
                            trade=trade,
                            task=task,
                            order=task_order,
                            tax_code=tax_code,
                        )
                    )

        variants.extend(self._adopt_services_owned_elsewhere())
        self._retire_stale_task_codes()
        self._retire_empty_subcategories()
        self._link_service_area(variants)
        rules = self._seed_within_trade_compatibility()
        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded {len(variants)} task-priced services across "
                f"{sum(len(entry[5]) for entry in CATALOG)} trades, "
                f"{rules} within-trade compatibility rules."
            )
        )

    def _seed_task(
        self,
        *,
        subcategory: Subcategory,
        trade: TradeSeed,
        task: TaskSeed,
        order: int,
        tax_code: str,
    ) -> list[ServiceVariant]:
        description = f"{task.name} carried out at your address by a verified {trade.name}."
        service, _ = Service.objects.update_or_create(
            slug=task.slug,
            defaults={
                "subcategory": subcategory,
                "name": task.name,
                "short_description": description,
                "description": description,
                "status": Service.Status.ACTIVE,
                "display_order": order,
            },
        )
        self._seed_service_content(service=service, trade=trade)

        # A service with declared variants is sold as those and nothing else; one without keeps
        # the single `standard` variant it has always had. `/book/[service]` resolves
        # `?variant=<code>` and falls back to the first, so both shapes book identically.
        options = SERVICE_VARIANTS.get(task.slug) or (
            VariantSeed("Standard service", "standard", task.price_paise, task.minutes),
        )
        variants = [
            self._seed_variant(
                service=service,
                trade=trade,
                task=task,
                option=option,
                position=position,
                tax_code=tax_code,
                fallback_description=description,
            )
            for position, option in enumerate(options, start=1)
        ]
        # Anything left from an earlier run with a different variant set is retired rather than
        # deleted: a variant may already be referenced by a quote or a booking, and PROTECT would
        # refuse the delete anyway. Deactivating takes it out of the catalog and leaves history
        # explicable.
        ServiceVariant.objects.filter(service=service).exclude(
            code__in=[option.code for option in options]
        ).update(is_active=False)
        return variants

    def _seed_variant(
        self,
        *,
        service: Service,
        trade: TradeSeed,
        task: TaskSeed,
        option: VariantSeed,
        position: int,
        tax_code: str,
        fallback_description: str,
        # Read off the existing variant when adopting a service another command owns, so
        # adding options never silently re-routes which trade gets dispatched.
        skill_code: str | None = None,
    ) -> ServiceVariant:
        variant, _ = ServiceVariant.objects.update_or_create(
            service=service,
            code=option.code,
            defaults={
                "name": option.name,
                "description": option.description or fallback_description,
                "display_order": position,
                "pricing_strategy": ServiceVariant.PricingStrategy.FIXED,
                "booking_archetype": ServiceVariant.BookingArchetype.A1_TASK_VISIT,
                "minimum_duration_minutes": option.minutes,
                "recommended_duration_minutes": option.minutes,
                "duration_increment_minutes": option.minutes,
                "maximum_duration_minutes": option.minutes,
                # Dispatch matches on this. It is the subcategory slug, so a Partner who holds
                # the "electrician" skill is eligible for every electrician task and nothing else.
                "required_skill_code": skill_code or trade.slug,
                "tax_category_code": tax_code,
                "is_active": True,
            },
        )
        ServiceRate.objects.update_or_create(
            variant=variant,
            effective_from=SEED_RATE_EFFECTIVE_FROM,
            defaults={
                "amount_paise": option.price_paise,
                "currency": "INR",
                "effective_to": None,
                "is_active": True,
            },
        )
        TaskRate.objects.update_or_create(
            variant=variant,
            # The service slug, for every variant. `current_task_rate` filters on the variant
            # *and* this code, so each variant already gets its own priced row — the code does
            # not need to be unique across them, and making it unique broke the lookup: a
            # suffixed code meant `_validated_variant_inputs` found no rate and every
            # multi-variant service refused to go in the cart at all.
            task_code=task.slug,
            effective_from=SEED_RATE_EFFECTIVE_FROM,
            defaults={
                "unit_price_paise": option.price_paise,
                # Setup is charged once for the visit; the work time repeats per unit ordered,
                # so two taps cost one trip and two jobs' worth of work.
                "base_duration_minutes": trade.setup_minutes,
                "marginal_duration_minutes": option.minutes,
                "currency": "INR",
                "effective_to": None,
                "is_active": True,
            },
        )
        A1VariantConfiguration.objects.update_or_create(
            variant=variant,
            version=1,
            defaults={
                "status": A1VariantConfiguration.Status.ACTIVE,
                "scope_schema": {
                    "version": 1,
                    "questions": [
                        {"code": "quantity", "kind": "INTEGER", "required": True, "minimum": 1},
                    ],
                },
                "required_equipment": list(trade.equipment),
                "out_of_scope_rules": list(trade.unsafe),
                "evidence_policy": {
                    "before_photos_required": True,
                    "after_photos_required": True,
                    "completion_checklist_required": True,
                },
            },
        )
        return variant

    def _adopt_services_owned_elsewhere(self) -> list[ServiceVariant]:
        """Give the six `seed_technician_catalog` services the same content and variants.

        Those predate this command and are deliberately not re-declared here — the test suite is
        built on their slugs and prices, and duplicating them would be two definitions of one
        service. But a customer does not know which command wrote a page, and "Switch / Socket
        Repair" showing no process, no inclusions and one price while every neighbouring service
        shows all three is the catalog contradicting itself.

        So content is written for every active service this command did not seed, and variants
        are applied where `SERVICE_VARIANTS` declares them. The skill and tax codes are read off
        the existing variant rather than guessed, so nothing about how the service dispatches or
        is taxed changes.
        """

        owned = {task.slug for entry in CATALOG for trade in entry[5] for task in trade.tasks}
        adopted: list[ServiceVariant] = []

        for service in (
            Service.objects.filter(status=Service.Status.ACTIVE)
            .exclude(slug__in=owned)
            .select_related("subcategory")
        ):
            existing = service.variants.filter(is_active=True).order_by("display_order").first()
            if existing is None:
                continue
            rate = TaskRate.objects.filter(variant=existing, is_active=True).first()
            if rate is None:
                continue

            trade = TradeSeed(
                name=service.subcategory.name,
                slug=service.subcategory.slug,
                setup_minutes=rate.base_duration_minutes,
                equipment=(),
                unsafe=(),
                tasks=(),
            )
            self._seed_service_content(service=service, trade=trade)

            options = SERVICE_VARIANTS.get(service.slug)
            if options is None:
                continue
            task = TaskSeed(
                name=service.name,
                slug=service.slug,
                price_paise=rate.unit_price_paise,
                minutes=existing.recommended_duration_minutes,
            )
            for position, option in enumerate(options, start=1):
                adopted.append(
                    self._seed_variant(
                        service=service,
                        trade=trade,
                        task=task,
                        option=option,
                        position=position,
                        tax_code=existing.tax_category_code,
                        fallback_description=service.short_description,
                        skill_code=existing.required_skill_code,
                    )
                )
            # The original `standard` variant is retired only once a replacement set exists, so
            # a service is never left with nothing bookable.
            service.variants.exclude(code__in=[option.code for option in options]).update(
                is_active=False
            )

        return adopted

    @staticmethod
    def _retire_stale_task_codes() -> None:
        """Switch off any rate whose code is not its service's slug.

        An earlier run suffixed the code with the variant (`switch-socket-repair:replace-32a`),
        which `current_task_rate` could never match — it looks up the variant *and* the service
        slug. Those rows are left behind by a corrected run, and an active rate nobody can find
        is exactly the state that made the service unbookable, so they are retired here rather
        than left for the next person to puzzle over.

        Deactivated, not deleted: a rate is what somebody was charged, and `TaskRate` is
        referenced by quotes that must stay explicable.
        """

        TaskRate.objects.filter(is_active=True).exclude(
            task_code=F("variant__service__slug")
        ).update(is_active=False)

    @staticmethod
    def _seed_within_trade_compatibility() -> int:
        """Declare that one Partner can do two jobs from the same trade in one visit.

        Cart suggestions read `SAME_PARTNER_SEQUENTIAL` rules and nothing else, deliberately —
        the heading promises the same professional in the same visit, so the platform's own merge
        decision is the only thing entitled to fill it. With no rules there is nothing to
        suggest, which is why 501 of 507 services suggested nothing at all: only the six M1
        services had ever been paired.

        Within a trade this is not a merchandising guess. `required_skill_code` is the trade
        slug, so a Partner approved for a trade is already eligible for every service in it —
        the rule restates a fact dispatch and the availability grid both rely on. It is also the
        rule `seed_technician_catalog` already applies to its six: same subcategory, sequential.

        Cross-trade pairs are still not seeded. `PARALLEL_ALLOWED` means a *second* Partner and
        therefore a second visit and a second minimum-visit floor, and asserting that an
        electrician and a beautician should share a booking is a decision per pair, not a bulk
        import. Absent a rule the planner falls back to independent visits, which is the safe
        answer.

        Bounded by construction: pairs are formed inside a trade, never across the catalog. All
        509 variants paired freely would be 129,286 rules; by trade it is a few thousand.
        """

        created = 0
        variants = list(
            ServiceVariant.objects.filter(
                is_active=True, service__status=Service.Status.ACTIVE
            ).select_related("service")
        )
        by_trade: dict[UUID, list[ServiceVariant]] = {}
        for variant in variants:
            by_trade.setdefault(variant.service.subcategory_id, []).append(variant)

        for trade_variants in by_trade.values():
            for first, second in combinations(trade_variants, 2):
                # Two variants of the *same* service are alternatives, not companions. Pairing
                # them would let the planner merge "short hair" with "long hair" into one visit
                # and suggest a service the cart already holds.
                if first.service_id == second.service_id:
                    continue
                # Ordered by id so a rerun updates the row it wrote rather than adding its
                # mirror image.
                left, right = sorted((first, second), key=lambda variant: str(variant.id))
                _, was_created = ServiceCompatibilityRule.objects.update_or_create(
                    left_variant=left,
                    right_variant=right,
                    version=1,
                    defaults={
                        "mode": ServiceCompatibilityRule.Mode.SAME_PARTNER_SEQUENTIAL,
                        "dependency": ServiceCompatibilityRule.Dependency.NONE,
                        "conditions": {},
                        "effective_from": SEED_RATE_EFFECTIVE_FROM,
                        "effective_to": None,
                        "is_active": True,
                        "lifecycle_status": ServiceCompatibilityRule.LifecycleStatus.ACTIVE,
                        "change_reason": "Same trade: one Partner holds the skill for both.",
                        "review_reason": "Derived from required_skill_code, not reviewed per pair.",
                    },
                )
                created += int(was_created)
        return created

    @staticmethod
    def _retire_empty_subcategories() -> None:
        """Switch off any subcategory left with nothing active in it.

        Moving Electrician, Plumber and AC out of Technician left their old rows behind: the
        subcategory is unique on `(category, slug)`, so seeding them under a new category creates
        a new row and re-points the services, and the original stays as an empty duplicate slug.
        A category page would then render a heading with no services under it.

        Deactivated rather than deleted, because `Service.subcategory` is `PROTECT` and because a
        subcategory that once held a service is part of how an old booking is explained. Written
        as "empty means off" rather than as a list of the three that moved, so the next move
        cleans up after itself.
        """

        Subcategory.objects.annotate(
            live=Count(
                "services",
                filter=Q(services__status=Service.Status.ACTIVE),
            )
        ).filter(live=0, is_active=True).update(is_active=False)

    @staticmethod
    def _seed_service_content(*, service: Service, trade: TradeSeed) -> None:
        """The process steps, inclusions and exclusions shown on the service page.

        Rewritten on every run rather than merged. This copy is a template the trade owns, so a
        line that disappears from the template must disappear from the page — a merge would
        leave a retired promise on screen with nothing generating it.

        `is_active=False` rather than a delete, because a policy line is the wording a customer
        was shown when they booked, and a dispute is argued from it.
        """

        content = content_for_trade(trade.slug)
        ServicePolicy.objects.filter(service=service).update(is_active=False)

        rows: list[tuple[str, str, str, int]] = [
            (ServicePolicy.Kind.PROCESS, step.title, step.text, order)
            for order, step in enumerate(content.process, start=1)
        ]
        rows += [
            (ServicePolicy.Kind.INCLUDED, "", text, order)
            for order, text in enumerate(content.included, start=1)
        ]
        rows += [
            (ServicePolicy.Kind.EXCLUDED, "", text, order)
            for order, text in enumerate(content.excluded, start=1)
        ]
        rows.append(
            (
                ServicePolicy.Kind.GOOD_TO_KNOW,
                "",
                "Extra time or parts are charged only after your approval.",
                1,
            )
        )

        for kind, title, text, order in rows:
            ServicePolicy.objects.update_or_create(
                service=service,
                kind=kind,
                display_order=order,
                defaults={"title": title, "text": text, "is_active": True},
            )

    @staticmethod
    def _link_service_area(variants: list[ServiceVariant]) -> None:
        """Offer every seeded task in the reviewed M1 area.

        Skipped rather than guessed when the area does not exist: this command adds to a catalog,
        and inventing a service area would put services on sale somewhere nobody reviewed.
        """

        area = ServiceArea.objects.filter(slug="hyderabad-500032").first()
        if area is None:
            return
        for variant in variants:
            ServiceAreaService.objects.update_or_create(
                service_area=area,
                variant=variant,
                defaults={"is_active": True},
            )
