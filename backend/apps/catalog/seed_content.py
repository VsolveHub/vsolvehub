"""Per-trade service content and the variants a service is genuinely sold in.

## Why content is per trade

"How this visit works" is a property of the trade, not the task. Inspecting a switch and
inspecting a tap are the same five steps with a different noun in them, and writing three
hundred bespoke copies would be three hundred chances to contradict ourselves. Each trade points
at one template; a service that genuinely differs gets an override rather than a fork.

## Why variants are not added to everything

A variant is a real choice with a real price difference — a 16-amp switch against a 32-amp one,
a 1 BHK against a 4 BHK. Most tasks have exactly one honest way to be sold, and giving those a
second variant would invent a decision for the customer to make and a price for us to defend.

So variants are declared per service, and a service with none keeps its single `standard`
variant. That also keeps the booking flow intact: `/book/[service]` resolves `?variant=<code>`
and falls back to the first variant, so a service that gains variants gains options, and one
that does not behaves exactly as it does today.
"""

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class ProcessStep:
    title: str
    text: str


@dataclass(frozen=True, slots=True)
class VariantSeed:
    """One priced way to buy a service. `code` is what `?variant=` carries."""

    name: str
    code: str
    price_paise: int
    minutes: int
    description: str = ""


@dataclass(frozen=True, slots=True)
class TradeContent:
    process: tuple[ProcessStep, ...]
    included: tuple[str, ...]
    excluded: tuple[str, ...]


#: The repair shape: look first, price it, then fix — and say what happens if it cannot be fixed.
#: The quote gate is the load-bearing step. Without it the customer discovers the real price
#: after the work has started, which is the complaint every repair marketplace is built on.
REPAIR = TradeContent(
    process=(
        ProcessStep("Inspection", "We inspect the fault and prepare a repair quote for you."),
        ProcessStep(
            "Quote approval",
            "Approve the quote to go ahead, or decline and pay only the visit charge.",
        ),
        ProcessStep(
            "Repair and spare parts",
            "Where parts are needed we source them locally and show you the cost first.",
        ),
        ProcessStep(
            "Replacement, if needed",
            "If the part cannot be repaired we replace it, again only once you have approved.",
        ),
        ProcessStep(
            "Warranty activation",
            "The workmanship is covered for 30 days from the day the visit is completed.",
        ),
    ),
    included=(
        "Inspection and diagnosis of the reported fault",
        "Labour for the approved repair",
        "Standard consumables such as tape, sealant and fixings",
        "Testing before the professional leaves",
        "30-day warranty on the workmanship",
    ),
    excluded=(
        "Spare parts and replacement units, quoted separately once approved",
        "Faults found in other appliances or circuits during the visit",
        "Civil work such as wall cutting, tiling or repainting",
        "Work that needs scaffolding or a licence this visit is not staffed for",
    ),
)

#: Cleaning is not a repair — nothing is diagnosed and nothing is quoted mid-visit. The step that
#: matters instead is the walkthrough, because "is this done" is the only disputed question.
CLEANING = TradeContent(
    process=(
        ProcessStep("Walkthrough", "We walk the space with you and agree what is in scope."),
        ProcessStep("Protection", "Furniture and fittings are covered before anything starts."),
        ProcessStep("Cleaning", "The agreed areas are cleaned with the equipment listed below."),
        ProcessStep("Your inspection", "You check the work and point out anything missed."),
        ProcessStep("Touch-up", "Anything you flag is redone before the professional leaves."),
    ),
    included=(
        "All cleaning equipment, machines and materials",
        "Labour for the areas agreed at the walkthrough",
        "Moving light furniture to reach surfaces",
        "Removal of collected waste to your building's bin point",
    ),
    excluded=(
        "Moving heavy furniture, appliances or anything mounted to a wall",
        "Cleaning outside the areas agreed at the walkthrough",
        "Stain or damage that predates the visit and cannot be cleaned",
        "Pest treatment, which is booked separately",
    ),
)

#: Personal care. The patch test is the step that exists for the customer's safety rather than
#: for scheduling, so it is stated rather than assumed.
PERSONAL_CARE = TradeContent(
    process=(
        ProcessStep("Consultation", "We discuss what you want and check for anything to avoid."),
        ProcessStep("Patch test", "Where products require it, a patch test is done first."),
        ProcessStep("Setup", "Single-use tools are opened in front of you and the area is set."),
        ProcessStep("Service", "The service is carried out with the products listed below."),
        ProcessStep("Aftercare", "We explain how to look after the result and what to expect."),
    ),
    included=(
        "Professional-grade products for the booked service",
        "Sanitised and single-use tools, opened in front of you",
        "Setup and clean-up of the area used",
        "Aftercare guidance",
    ),
    excluded=(
        "Take-home products, unless the service description says otherwise",
        "Additional services added on the day, which are priced separately",
        "Treatment on skin with an open wound or active infection",
        "Results that depend on a course of sessions rather than one visit",
    ),
)

#: Pets. Consent and the animal's tolerance govern the visit, so the stop condition is explicit:
#: a distressed animal ends the appointment rather than being worked through.
PET_CARE = TradeContent(
    process=(
        ProcessStep("Meet and settle", "We let your pet get used to us before anything starts."),
        ProcessStep("Health check", "A quick check for injury, parasites or signs of distress."),
        ProcessStep("Your approval", "We confirm exactly what will be done, and what will not."),
        ProcessStep("Service", "The service is carried out at your pet's pace."),
        ProcessStep(
            "Handover",
            "We tell you how it went, including anything we chose to stop short of.",
        ),
    ),
    included=(
        "All handling equipment and pet-safe products",
        "A health and temperament check before starting",
        "The booked service, carried out at your pet's pace",
        "A handover covering anything we noticed",
    ),
    excluded=(
        "Veterinary treatment, medication or diagnosis unless a vet visit was booked",
        "Any step your pet will not tolerate — we stop rather than restrain",
        "Grooming a coat that is matted beyond safe clipping, which needs a vet",
        "Transport of your pet, which is booked separately",
    ),
)

#: The trades that follow the repair shape. Everything absent from this map falls back by
#: category in `content_for_trade`.
REPAIR_TRADES = frozenset(
    {
        "electrician",
        "plumber",
        "carpenter",
        "ac-technician",
        "ro-technician",
        "internet-technician",
        "gas-stove-technician",
        "computer-technician",
        "mobile-technician",
        "cctv-technician",
        "locksmith",
        "home-automation-technician",
        "fire-safety-technician",
        "home-maintenance",
    }
)
CLEANING_TRADES = frozenset(
    {
        "home-cleaning",
        "sofa-carpet-cleaning",
        "pest-control",
        "water-tank-cleaning",
        "septic-tank-services",
        "laundry-services",
        "gardening",
        "swimming-pool-services",
        "chimney-exhaust",
        "home-organization",
        "home-inspection",
    }
)
PET_TRADES = frozenset(
    {"pet-grooming", "veterinary", "pet-walking", "pet-sitting", "pet-training", "pet-photography"}
)


def content_for_trade(trade_slug: str) -> TradeContent:
    """The process, inclusions and exclusions a trade publishes.

    Personal care is the fallback rather than a default-of-convenience: every remaining trade is
    a Beautician one, and a repair script on a facial would describe a visit that does not
    happen.
    """

    if trade_slug in REPAIR_TRADES:
        return REPAIR
    if trade_slug in CLEANING_TRADES:
        return CLEANING
    if trade_slug in PET_TRADES:
        return PET_CARE
    return PERSONAL_CARE


def _charm(paise: int) -> int:
    """Round a scaled price down to the ₹x9 the rest of the catalog uses.

    Scaled prices land on numbers nobody would choose — ₹419.86 — and a ladder that reads as
    arithmetic rather than as pricing invites the reader to reverse the multiplier.
    """

    return (paise // 1000) * 1000 + 900


def _ladder(
    prefix: str,
    base_paise: int,
    base_minutes: int,
    steps: tuple[tuple[str, str, int, int], ...],
) -> tuple[VariantSeed, ...]:
    """A priced ladder over one axis.

    The multipliers live with the ladder rather than in each entry so the whole thing moves when
    a base price is corrected — these bases are proposals, and a hand-written ladder would have
    to be re-derived by hand every time one changed.
    """

    return tuple(
        VariantSeed(
            name=f"{prefix} — {label}",
            code=code,
            price_paise=_charm(base_paise * price_pct // 100),
            minutes=max(1, base_minutes * minute_pct // 100),
            description=description,
        )
        for label, code, price_pct, minute_pct, description in (
            (label, code, price_pct, minute_pct, "") for label, code, price_pct, minute_pct in steps
        )
    )


#: Hair length. The axis every salon actually prices colour and treatment on, because product
#: quantity and time both scale with it and neither scales with anything else on the menu.
HAIR_LENGTH_STEPS = (
    ("Short hair", "short", 100, 100),
    ("Medium hair", "medium", 130, 130),
    ("Long hair", "long", 165, 165),
)

#: Wax type. Taken from the source list, which names Normal, Rica and Chocolate against every
#: waxing service and prices them only as "Included" and "Extra Premium" — a real choice the
#: document already makes, with the numbers left for us to set.
WAX_TYPE_STEPS = (
    ("Normal wax", "normal", 100, 100),
    ("Chocolate wax", "chocolate", 140, 115),
    ("Rica wax", "rica", 170, 115),
)


def _bhk(prefix: str, base_paise: int, base_minutes: int) -> tuple[VariantSeed, ...]:
    """A home-size ladder for one cleaning service.

    Size is the only thing that actually changes what a cleaning visit costs, so it is the only
    thing offered. The multipliers are proposals like the base prices they scale, and are applied
    here rather than written out so the whole ladder moves when a base price is corrected.
    """

    steps = (
        ("1 BHK", "1-bhk", 100, 100),
        ("2 BHK", "2-bhk", 140, 135),
        ("3 BHK", "3-bhk", 185, 175),
        ("4 BHK", "4-bhk", 235, 220),
        ("Duplex or villa", "villa", 300, 280),
    )
    return tuple(
        VariantSeed(
            name=f"{prefix} — {label}",
            code=code,
            # Rounded to the ₹x9 the rest of the catalog uses, so a scaled price still looks
            # like a price somebody chose.
            price_paise=((base_paise * price_pct // 100) // 1000) * 1000 + 900,
            minutes=base_minutes * minute_pct // 100,
            description=f"For a {label.replace('-', ' ')} home.",
        )
        for label, code, price_pct, minute_pct in steps
    )


#: Variants keyed by the service slug they belong to. A service absent from this map keeps its
#: single `standard` variant, which is the honest answer for a task with one way to buy it.
SERVICE_VARIANTS: dict[str, tuple[VariantSeed, ...]] = {
    # The example that prompted this: a switch job is genuinely three different jobs at three
    # prices, and selling one price for all three is what made the catalog feel wrong.
    "switch-socket-repair": (
        VariantSeed("Repair", "repair", 6_900, 30, "Repair the existing switch or socket."),
        VariantSeed(
            "Replacement — 6A switch",
            "replace-6a",
            8_900,
            30,
            "Replace a standard 6-amp switch or socket.",
        ),
        VariantSeed(
            "Replacement — 16A power point",
            "replace-16a",
            12_900,
            45,
            "Replace a 16-amp power point for a heavy appliance.",
        ),
        VariantSeed(
            "Replacement — 32A power point",
            "replace-32a",
            17_900,
            60,
            "Replace a 32-amp point for an air conditioner or geyser.",
        ),
    ),
    "electrician-switch-board-repair": (
        VariantSeed("Up to 4 modules", "upto-4", 12_900, 30),
        VariantSeed("5 to 8 modules", "upto-8", 17_900, 45),
        VariantSeed("9 or more modules", "over-8", 24_900, 60),
    ),
    "electrician-fan-repair": (
        VariantSeed("Ceiling fan", "ceiling", 14_900, 45),
        VariantSeed("Wall or pedestal fan", "wall", 12_900, 30),
        VariantSeed("Exhaust fan", "exhaust", 12_900, 30),
    ),
    # Tonnage is what an AC visit is actually priced on.
    "ac-general-service": (
        VariantSeed("Up to 1 ton", "1-ton", 49_900, 60),
        VariantSeed("1.5 ton", "1-5-ton", 59_900, 70),
        VariantSeed("2 ton and above", "2-ton", 69_900, 80),
    ),
    "ac-deep-cleaning": (
        VariantSeed("Up to 1 ton", "1-ton", 99_900, 90),
        VariantSeed("1.5 ton", "1-5-ton", 119_900, 100),
        VariantSeed("2 ton and above", "2-ton", 139_900, 110),
    ),
    "ac-gas-filling": (
        VariantSeed("Up to 1 ton", "1-ton", 249_900, 90),
        VariantSeed("1.5 ton", "1-5-ton", 289_900, 100),
        VariantSeed("2 ton and above", "2-ton", 339_900, 110),
    ),
    # Coat and size are what a grooming visit is priced on, and they change how long it takes
    # far more than the breed name does.
    "pet-dog-grooming": (
        VariantSeed("Small breed", "small", 99_900, 75, "Up to 10 kg."),
        VariantSeed("Medium breed", "medium", 129_900, 90, "10 to 25 kg."),
        VariantSeed("Large breed", "large", 169_900, 120, "Over 25 kg."),
    ),
    "pet-cat-grooming": (
        VariantSeed("Short coat", "short-coat", 89_900, 60),
        VariantSeed("Long coat", "long-coat", 119_900, 90),
    ),
    "plumber-drain-block-removal": (
        VariantSeed("Sink or basin", "sink", 19_900, 45),
        VariantSeed("Bathroom or floor trap", "bathroom", 29_900, 60),
        VariantSeed("Main line", "main-line", 49_900, 90),
    ),
    # ---- Electrician -------------------------------------------------------------------------
    # Module count is what a board job is actually measured in, and it is the number the
    # customer can read off their own wall before booking.
    "electrician-switch-board-replacement": (
        VariantSeed("Up to 4 modules", "upto-4", 14_900, 45),
        VariantSeed("5 to 8 modules", "upto-8", 21_900, 60),
        VariantSeed("9 to 12 modules", "upto-12", 29_900, 75),
    ),
    # Fitting type, not brand: a bulb swap and a panel light are different amounts of work.
    "light-led-installation": (
        VariantSeed("Bulb or tube light", "bulb", 12_900, 30),
        VariantSeed("Panel or downlight", "panel", 19_900, 45),
        VariantSeed("Cove or profile light", "cove", 34_900, 75),
    ),
    # Weight decides whether this is a one-person job and whether the ceiling needs an anchor.
    "electrician-chandelier-installation": (
        VariantSeed("Up to 10 kg", "upto-10kg", 49_900, 90),
        VariantSeed("10 to 25 kg", "upto-25kg", 89_900, 120),
        VariantSeed("Over 25 kg", "over-25kg", 149_900, 180),
    ),
    # Way count is stamped on the box.
    "electrician-db-board-installation": (
        VariantSeed("4 way", "4-way", 49_900, 90),
        VariantSeed("8 way", "8-way", 69_900, 105),
        VariantSeed("12 way and above", "12-way", 99_900, 135),
    ),
    "electrician-mcb-installation": (
        VariantSeed("Single pole MCB", "single-pole", 14_900, 30),
        VariantSeed("Double pole MCB", "double-pole", 19_900, 40),
        VariantSeed("RCCB or isolator", "rccb", 29_900, 60),
    ),
    "electrician-inverter-installation": (
        VariantSeed("Up to 900 VA", "upto-900va", 49_900, 90),
        VariantSeed("1 to 1.5 KVA", "upto-1-5kva", 69_900, 110),
        VariantSeed("Above 1.5 KVA", "above-1-5kva", 99_900, 140),
    ),
    # Motor horsepower changes the cable, the starter and the time.
    "electrician-water-motor-wiring": (
        VariantSeed("Up to 1 HP", "upto-1hp", 29_900, 60),
        VariantSeed("1 to 2 HP", "upto-2hp", 39_900, 75),
        VariantSeed("Above 2 HP", "above-2hp", 54_900, 100),
    ),
    "electrician-bore-motor-connection": (
        VariantSeed("Up to 1 HP", "upto-1hp", 49_900, 90),
        VariantSeed("1 to 3 HP", "upto-3hp", 69_900, 115),
        VariantSeed("Above 3 HP", "above-3hp", 99_900, 150),
    ),
    # ---- Plumber -----------------------------------------------------------------------------
    "tap-repair": (
        VariantSeed("Basin or sink tap", "basin", 19_900, 45),
        VariantSeed("Wall mixer", "mixer", 24_900, 55),
        VariantSeed("Diverter or concealed valve", "diverter", 39_900, 90),
    ),
    "plumber-tap-installation": (
        VariantSeed("Standard tap", "standard", 14_900, 30),
        VariantSeed("Wall mixer", "mixer", 24_900, 50),
        VariantSeed("Sensor tap", "sensor", 39_900, 75),
    ),
    # A concealed cistern means opening the wall panel; an external one does not.
    "wc-flush-repair": (
        VariantSeed("External cistern", "external", 24_900, 45),
        VariantSeed("Concealed cistern", "concealed", 44_900, 90),
    ),
    "plumber-wc-installation": (
        VariantSeed("Floor mounted", "floor-mounted", 49_900, 120),
        VariantSeed("Wall hung with frame", "wall-hung", 99_900, 180),
    ),
    "plumber-basin-installation": (
        VariantSeed("Pedestal basin", "pedestal", 29_900, 90),
        VariantSeed("Counter-top basin", "counter-top", 39_900, 105),
        VariantSeed("Wall hung basin", "wall-hung", 49_900, 120),
    ),
    "plumber-motor-installation": (
        VariantSeed("Up to 1 HP", "upto-1hp", 49_900, 120),
        VariantSeed("1 to 2 HP", "upto-2hp", 69_900, 145),
        VariantSeed("Above 2 HP", "above-2hp", 99_900, 180),
    ),
    # ---- Carpenter ---------------------------------------------------------------------------
    "carpenter-door-installation": (
        VariantSeed("Flush door", "flush", 49_900, 120),
        VariantSeed("Panel or moulded door", "panel", 69_900, 150),
        VariantSeed("WPC or PVC door", "wpc", 89_900, 180),
    ),
    "carpenter-bed-assembly": (
        VariantSeed("Single bed", "single", 29_900, 75),
        VariantSeed("Double or queen bed", "double", 39_900, 100),
        VariantSeed("King bed with storage", "king-storage", 59_900, 140),
    ),
    "carpenter-tv-unit-installation": (
        VariantSeed("Wall mount only", "wall-mount", 49_900, 75),
        VariantSeed("Floor-standing unit", "floor-unit", 79_900, 120),
    ),
    # ---- AC ----------------------------------------------------------------------------------
    "ac-split-installation": (
        VariantSeed("Up to 1 ton", "1-ton", 149_900, 120),
        VariantSeed("1.5 ton", "1-5-ton", 169_900, 135),
        VariantSeed("2 ton and above", "2-ton", 199_900, 150),
    ),
    "ac-window-installation": (
        VariantSeed("Up to 1 ton", "1-ton", 99_900, 90),
        VariantSeed("1.5 ton and above", "1-5-ton", 119_900, 105),
    ),
    "ac-uninstallation": (
        VariantSeed("Window AC", "window", 49_900, 45),
        VariantSeed("Split AC", "split", 69_900, 75),
    ),
    "ac-jet-wash": (
        VariantSeed("Up to 1 ton", "1-ton", 119_900, 90),
        VariantSeed("1.5 ton", "1-5-ton", 139_900, 100),
        VariantSeed("2 ton and above", "2-ton", 159_900, 110),
    ),
    "ac-shifting": (
        VariantSeed("Window AC", "window", 199_900, 150),
        VariantSeed("Split AC", "split", 299_900, 210),
    ),
    # ---- RO ----------------------------------------------------------------------------------
    "ro-installation": (
        VariantSeed("Wall mounted", "wall-mounted", 49_900, 90),
        VariantSeed("Under the sink", "under-sink", 79_900, 120),
    ),
    "ro-filter-replacement": (
        VariantSeed("Sediment or carbon filter", "sediment-carbon", 29_900, 45),
        VariantSeed("RO membrane", "membrane", 59_900, 60),
        VariantSeed("Full filter set", "full-set", 99_900, 90),
    ),
    # ---- Gas stove ---------------------------------------------------------------------------
    "gas-stove-repair": (
        VariantSeed("2 burner", "2-burner", 19_900, 45),
        VariantSeed("3 burner", "3-burner", 24_900, 55),
        VariantSeed("4 burner and above", "4-burner", 34_900, 70),
    ),
    # ---- CCTV --------------------------------------------------------------------------------
    # Channel count is on the unit and decides the wiring run.
    "cctv-dvr-installation": (
        VariantSeed("4 channel", "4-channel", 49_900, 60),
        VariantSeed("8 channel", "8-channel", 69_900, 80),
        VariantSeed("16 channel", "16-channel", 99_900, 110),
    ),
    # ---- Mobile ------------------------------------------------------------------------------
    # Device tier, because the part dominates the price and a single figure would be a guess
    # for most phones. Still a "from" price — the exact part is quoted after inspection.
    "mobile-screen-replacement": (
        VariantSeed("Budget phone", "budget", 29_900, 60),
        VariantSeed("Mid-range phone", "mid-range", 79_900, 60),
        VariantSeed("Flagship phone", "flagship", 199_900, 75),
    ),
    # ---- Fire safety -------------------------------------------------------------------------
    "fire-extinguisher-refilling": (
        VariantSeed("Up to 4 kg", "upto-4kg", 29_900, 45),
        VariantSeed("6 to 9 kg", "upto-9kg", 44_900, 55),
        VariantSeed("Above 9 kg", "above-9kg", 69_900, 70),
    ),
    # ---- Beautician ---------------------------------------------------------------------------
    # Hair length and wax type are handled as ladders below. These are the remaining Beautician
    # services whose axis is neither: area for a facial, and hands against feet for nails.
    "beauty-face-cleanup": (
        VariantSeed("Face", "face", 29_900, 45),
        VariantSeed("Face and neck", "face-neck", 39_900, 60),
        VariantSeed("Face, neck and back", "face-neck-back", 59_900, 90),
    ),
    "beauty-gel-nail-polish": (
        VariantSeed("Hands", "hands", 49_900, 60),
        VariantSeed("Feet", "feet", 49_900, 60),
        VariantSeed("Hands and feet", "hands-feet", 89_900, 105),
    ),
    "beauty-nail-art": (
        VariantSeed("Two nails", "two-nails", 19_900, 30),
        VariantSeed("Full set", "full-set", 59_900, 75),
    ),
    "beauty-body-massage": (
        VariantSeed("60 minutes", "60-min", 99_900, 60),
        VariantSeed("90 minutes", "90-min", 139_900, 90),
    ),
    # ---- Home services ------------------------------------------------------------------------
    # Size ladders live below; these are the axes that are not size.
    "pest-bed-bug-control": (
        VariantSeed("1 room", "1-room", 149_900, 90),
        VariantSeed("2 rooms", "2-rooms", 209_900, 120),
        VariantSeed("3 rooms or more", "3-rooms", 279_900, 165),
    ),
    # Seats, not rooms. It is the number the owner can count.
    "sofa-shampooing": (
        VariantSeed("Up to 3 seats", "upto-3-seat", 99_900, 90),
        VariantSeed("4 to 5 seats", "upto-5-seat", 139_900, 120),
        VariantSeed("6 to 8 seats", "upto-8-seat", 189_900, 150),
    ),
    "carpet-cleaning": (
        VariantSeed("Small rug", "small", 79_900, 60),
        VariantSeed("Medium carpet", "medium", 119_900, 90),
        VariantSeed("Large carpet", "large", 169_900, 120),
    ),
    "mattress-cleaning": (
        VariantSeed("Single", "single", 79_900, 60),
        VariantSeed("Double or queen", "double", 109_900, 75),
        VariantSeed("King", "king", 139_900, 90),
    ),
    "home-kitchen-deep-cleaning": (
        VariantSeed("Standard kitchen", "standard", 149_900, 150),
        VariantSeed("Large or modular kitchen", "large", 219_900, 210),
    ),
    "home-office-cleaning": (
        VariantSeed("Up to 10 seats", "upto-10-seat", 249_900, 240),
        VariantSeed("11 to 30 seats", "upto-30-seat", 449_900, 360),
        VariantSeed("Above 30 seats", "above-30-seat", 799_900, 480),
    ),
    # Chimney type decides whether the filters come out or the whole hood does.
    "chimney-cleaning": (
        VariantSeed("Wall mounted", "wall-mounted", 89_900, 90),
        VariantSeed("Island or auto-clean", "island", 129_900, 120),
    ),
    "garden-lawn-mowing": (
        VariantSeed("Up to 500 sq ft", "upto-500sqft", 59_900, 60),
        VariantSeed("500 to 1,500 sq ft", "upto-1500sqft", 99_900, 90),
        VariantSeed("Above 1,500 sq ft", "above-1500sqft", 159_900, 135),
    ),
    # Height, because above about fifteen feet this stops being a ladder job.
    "garden-tree-trimming": (
        VariantSeed("Up to 10 feet", "upto-10ft", 149_900, 120),
        VariantSeed("10 to 20 feet", "upto-20ft", 249_900, 180),
        VariantSeed("Above 20 feet", "above-20ft", 399_900, 240),
    ),
    # Garment type, because a blanket and a shirt are not the same machine or the same time.
    "laundry-dry-cleaning": (
        VariantSeed("Shirt or trousers", "shirt", 19_900, 30),
        VariantSeed("Saree or suit", "saree-suit", 39_900, 40),
        VariantSeed("Coat or sherwani", "coat", 59_900, 50),
        VariantSeed("Blanket or quilt", "blanket", 79_900, 60),
    ),
    "inspection-property": (
        VariantSeed("Up to 2 BHK", "upto-2bhk", 199_900, 120),
        VariantSeed("3 BHK", "3-bhk", 269_900, 150),
        VariantSeed("4 BHK or villa", "4-bhk", 379_900, 195),
    ),
    "inspection-pre-purchase": (
        VariantSeed("Up to 2 BHK", "upto-2bhk", 299_900, 180),
        VariantSeed("3 BHK", "3-bhk", 399_900, 225),
        VariantSeed("4 BHK or villa", "4-bhk", 549_900, 285),
    ),
    # ---- Pet services -------------------------------------------------------------------------
    # Duration, which is the whole of what is being bought.
    "pet-dog-walking": (
        VariantSeed("30 minutes", "30-min", 29_900, 30),
        VariantSeed("60 minutes", "60-min", 44_900, 60),
    ),
    "pet-home-sitting": (
        VariantSeed("Half day", "half-day", 79_900, 240),
        VariantSeed("Full day", "full-day", 139_900, 480),
    ),
    # Vaccine, not pet: the dose is the cost, and an owner books a named shot.
    "vet-vaccination": (
        VariantSeed("Core vaccine", "core", 69_900, 30),
        VariantSeed("Rabies", "rabies", 59_900, 30),
        VariantSeed("Annual booster", "booster", 89_900, 30),
    ),
}

#: Home Cleaning services sold by home size. Kept apart from `SERVICE_VARIANTS` only so the
#: ladder is generated once rather than written out five times per service.
#: Hair services sold by length. Cuts, colour, treatments and chemical work all scale with it;
#: a blow dry and a trim are short enough that length changes the price less than the booking
#: overhead does, so they keep one price.
for _slug, _label, _price, _minutes in (
    ("beauty-hair-cut", "Hair cut", 19_900, 45),
    ("beauty-hair-styling", "Hair styling", 29_900, 45),
    ("beauty-global-hair-color", "Global colour", 99_900, 120),
    ("beauty-root-touch-up", "Root touch-up", 79_900, 60),
    ("beauty-highlights", "Highlights", 149_900, 150),
    ("beauty-balayage", "Balayage", 299_900, 180),
    ("beauty-ombre", "Ombre", 299_900, 180),
    ("beauty-hair-spa", "Hair spa", 99_900, 60),
    ("beauty-dandruff-treatment", "Dandruff treatment", 99_900, 60),
    ("beauty-hair-fall-treatment", "Hair fall treatment", 99_900, 60),
    ("beauty-scalp-treatment", "Scalp treatment", 99_900, 60),
    ("beauty-hair-smoothening", "Smoothening", 299_900, 180),
    ("beauty-hair-straightening", "Straightening", 399_900, 180),
    ("beauty-keratin-treatment", "Keratin", 399_900, 180),
    ("beauty-hair-botox-treatment", "Hair botox", 499_900, 180),
    ("beauty-hair-rebonding", "Rebonding", 399_900, 210),
    ("beauty-hair-extension", "Extension", 499_900, 180),
):
    SERVICE_VARIANTS[_slug] = _ladder(_label, _price, _minutes, HAIR_LENGTH_STEPS)

#: Home size for pest control. Flatter than the cleaning ladder on purpose: treatment scales with
#: the area sprayed, but the callout, the mixing and the safety briefing do not, so a 4 BHK is
#: not four times a 1 BHK.
PEST_SIZE_STEPS = (
    ("1 BHK", "1-bhk", 100, 100),
    ("2 BHK", "2-bhk", 130, 125),
    ("3 BHK", "3-bhk", 160, 150),
    ("4 BHK or villa", "4-bhk", 200, 180),
)

#: Tank and pool capacity. The only thing that changes a cleaning visit to a vessel is how much
#: is in it and how long it takes to drain, refill and sanitise.
CAPACITY_STEPS = (
    ("Up to 1,000 litres", "upto-1000l", 100, 100),
    ("1,000 to 3,000 litres", "upto-3000l", 145, 140),
    ("Above 3,000 litres", "above-3000l", 200, 185),
)

#: Pet size. Coat area and handling time both scale with it, and it is the thing an owner can
#: state accurately without being asked to name a breed.
PET_SIZE_STEPS = (
    ("Small breed", "small", 100, 100),
    ("Medium breed", "medium", 130, 120),
    ("Large breed", "large", 170, 155),
)


#: Waxing sold by wax type, the choice the source list already names.
for _slug, _label, _price, _minutes in (
    ("beauty-full-arms-wax", "Full arms", 29_900, 30),
    ("beauty-half-arms-wax", "Half arms", 19_900, 20),
    ("beauty-full-legs-wax", "Full legs", 39_900, 45),
    ("beauty-half-legs-wax", "Half legs", 24_900, 30),
    ("beauty-underarms-wax", "Underarms", 14_900, 15),
    ("beauty-full-body-wax", "Full body", 99_900, 90),
    ("beauty-bikini-wax", "Bikini", 79_900, 45),
    ("beauty-face-wax", "Face", 19_900, 20),
):
    SERVICE_VARIANTS[_slug] = _ladder(_label, _price, _minutes, WAX_TYPE_STEPS)

#: Pest treatment sold by home size.
for _slug, _label, _price, _minutes in (
    ("pest-cockroach-control", "Cockroach control", 89_900, 60),
    ("pest-termite-control", "Termite control", 299_900, 180),
    ("pest-mosquito-control", "Mosquito control", 99_900, 60),
    ("pest-ant-control", "Ant control", 79_900, 45),
    ("pest-rat-control", "Rat control", 99_900, 60),
    ("pest-lizard-control", "Lizard control", 79_900, 45),
    ("pest-general-control", "General pest control", 129_900, 90),
):
    SERVICE_VARIANTS[_slug] = _ladder(_label, _price, _minutes, PEST_SIZE_STEPS)

#: Vessels sold by capacity.
for _slug, _label, _price, _minutes in (
    ("tank-overhead-cleaning", "Overhead tank", 99_900, 90),
    ("tank-underground-cleaning", "Underground tank", 149_900, 120),
    ("tank-sump-cleaning", "Sump", 129_900, 105),
    ("septic-tank-cleaning", "Septic tank", 299_900, 150),
    ("pool-cleaning", "Pool cleaning", 199_900, 120),
    ("pool-maintenance", "Pool maintenance", 299_900, 150),
):
    SERVICE_VARIANTS[_slug] = _ladder(_label, _price, _minutes, CAPACITY_STEPS)

#: Grooming sold by pet size.
for _slug, _label, _price, _minutes in (
    ("pet-bath-and-spa", "Bath and spa", 69_900, 60),
    ("pet-hair-trimming", "Hair trimming", 59_900, 45),
):
    SERVICE_VARIANTS[_slug] = _ladder(_label, _price, _minutes, PET_SIZE_STEPS)

for _slug, _label, _price, _minutes in (
    ("home-basic-cleaning", "Basic cleaning", 149_900, 180),
    ("home-deep-cleaning", "Deep cleaning", 299_900, 300),
    ("home-move-in-cleaning", "Move-in cleaning", 349_900, 300),
    ("home-move-out-cleaning", "Move-out cleaning", 349_900, 300),
    ("home-apartment-cleaning", "Apartment cleaning", 199_900, 210),
):
    SERVICE_VARIANTS[_slug] = _bhk(_label, _price, _minutes)
