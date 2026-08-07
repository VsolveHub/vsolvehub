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
}

#: Home Cleaning services sold by home size. Kept apart from `SERVICE_VARIANTS` only so the
#: ladder is generated once rather than written out five times per service.
for _slug, _label, _price, _minutes in (
    ("home-basic-cleaning", "Basic cleaning", 149_900, 180),
    ("home-deep-cleaning", "Deep cleaning", 299_900, 300),
    ("home-move-in-cleaning", "Move-in cleaning", 349_900, 300),
    ("home-move-out-cleaning", "Move-out cleaning", 349_900, 300),
    ("home-apartment-cleaning", "Apartment cleaning", 199_900, 210),
):
    SERVICE_VARIANTS[_slug] = _bhk(_label, _price, _minutes)
