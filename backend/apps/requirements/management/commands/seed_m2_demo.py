"""Load placeholder M2 configuration so both walkthroughs can be run by hand.

## Why this exists

Every owner-blocked M2 value fails closed, exactly as
`Django_Next.js_Plan/M2/07-state-machines-and-permissions.md` §9 requires: no price, no clock and
no cap has a default in code. There are nine of them and none has been decided, so a correct
platform is also an unusable one — the A3 unlock answers `m2_access_price_unavailable`, the A5 plan
chooser offers no tier, every A3 quote answers `m2_wage_floor_unavailable`, and proposing an
amendment is refused outright because `ScopeAmendment.expires_at` cannot be null.

This command is how a demo gets values. **It is not, and must never become, a code default.**
Everything it writes goes into the same tables `apps.requirements.pricing` and
`apps.partners.capabilities` already read — `M2AccessPrice`, `M2VariantConfiguration`,
`MinimumWageFloor`, `ServiceArea.state_code` — so the fail-closed readers stay fail-closed and the
only thing that changed is that a row now exists. If making the demo work ever seems to require
editing `pricing.py`, that is the change this command exists to avoid.

## Three doors, all of which must be open

1. `settings.DEBUG` must be true. `production.py` never sets it, and the precedent is
   `PAYMENTS_ALLOW_SIMULATED_CAPTURE`, which production refuses to boot with.
2. `--i-understand-this-is-dev-only` must be passed. Required *even under* `DEBUG`, because a
   shared development database can already hold prices somebody loaded on purpose, and this
   command writes money values into the table those live in.
3. Any row it would overwrite must carry `DEV SEED — not an owner decision` in its
   `source_reference`. A row without the marker is somebody's real decision and is left exactly as
   it is, with a warning naming it.

## What is a placeholder and what is not

Every money value, every clock and every cap below stands in for one of the twelve open owner
decisions in `Django_Next.js_Plan/M2/task.md` §P0. **INR 149, INR 49/99/199 and the 60/40 visit
split are proposals in `README.md`, not approvals**, and they are written with the marker so that
when the owner loads real prices it is obvious which rows were invented.

The catalog, area, partner and roster rows are a different kind of placeholder: they are ordinary
non-production fixtures in the shape the existing `seed_*` commands already use, and they carry the
same `.test`-host and reserved-phone-block conventions.

## Idempotent

Every write is an upsert on a natural key and every effective-dated row uses one fixed date, so a
second run changes nothing. The date is deliberately in the past and deliberately early: a real
price loaded later has a later `effective_from` and wins on the same ordering
`pricing._effective_price` already uses, with no need to delete anything first.
"""

from dataclasses import dataclass
from datetime import date, time, timedelta
from typing import Any

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError, CommandParser
from django.db import transaction
from django.utils import timezone

from apps.cases.models import OperationsCase
from apps.cases.services import open_case
from apps.catalog.icons import ServiceIconKey
from apps.catalog.models import (
    Category,
    M2VariantConfiguration,
    Service,
    ServiceMedia,
    ServicePolicy,
    ServiceQuestion,
    ServiceQuestionOption,
    ServiceVariant,
    Subcategory,
)
from apps.catalog.seed_images import fill_blank_image, image_for
from apps.identity.models import Role, User, UserRole
from apps.locations.models import (
    PostalCode,
    ServiceArea,
    ServiceAreaOperatingWindow,
    ServiceAreaPostalCode,
    ServiceAreaService,
)
from apps.partners.capabilities import add_crew_to_roster, request_capability, transition_capability
from apps.partners.models import (
    MinimumWageFloor,
    PartnerApplication,
    PartnerAvailabilityRule,
    PartnerBusinessProfile,
    PartnerCapability,
    PartnerConsent,
    PartnerConsentDocument,
    PartnerDocument,
    PartnerLanguage,
    PartnerOnlineSession,
    PartnerProfile,
    PartnerService,
    PartnerServiceArea,
    PartnerSkill,
    Skill,
)
from apps.payouts.models import PartnerPayoutAccount
from apps.requirements.models import M2AccessPrice, RateCard
from apps.requirements.rate_cards import publish_rate_card

#: The words that make an invented value identifiable forever. Written into `source_reference` on
#: every effective-dated row this command creates, and checked before overwriting one.
DEV_SEED_MARKER = "DEV SEED — not an owner decision"

#: One fixed date for every effective-dated row, so a rerun updates rather than stacks, and so a
#: real price loaded on any later date supersedes these without anybody deleting them first.
DEV_SEED_EFFECTIVE_FROM = date(2026, 1, 1)

#: Its own phone block, like every other seed command. `+9170100` is `seed_trade_partners`,
#: `+9170200` is `seed_replacement_partner`, `+9195…` is the console demo and `+9199…` is density.
PHONE_PREFIX = "+9170300"

SERVICE_AREA_SLUG = "hyderabad-500032"
POSTAL_CODE = "500032"
#: Must match whatever code Operations loads `MinimumWageFloor` rows under. Blank on a real area
#: until they map it, and the wage-floor guard fails closed while it is blank.
STATE_CODE = "TG"

#: Retired 2026-08-26. The umbrella meant nothing to a customer — "Full bathroom renovation"
#: belongs beside the plumber, not inside a noun only this codebase understood. The category row
#: is deactivated by `catalog.0015_refile_workforce_projects_services`; this constant survives
#: only so the migration and this command agree on what to retire.
LEGACY_CATEGORY_SLUG = "workforce-and-projects"

#: slug -> (name, description, icon_key, display_order, seed-image subject).
#:
#: The trade rows are byte-for-byte copies of `seed_task_catalog.CATALOG`, because
#: `Category.objects.update_or_create` merges on slug: two commands that disagree about what
#: "plumber" is called would fight over the row, last writer winning. The two new rows are
#: customer-comprehensible nouns replacing the retired umbrella.
M2_CATEGORY_SEEDS: dict[str, tuple[str, str, str, int, str]] = {
    "technician": (
        "Technician",
        "Reviewed one-person Technician task visits.",
        "wrench",
        1,
        "technician",
    ),
    "electrician": (
        "Electrician",
        "Wiring, fittings, fans and power faults, fixed in one visit.",
        "zap",
        2,
        "electrician",
    ),
    "plumber": (
        "Plumber",
        "Taps, leaks, drains and fittings, fixed in one visit.",
        "droplet",
        3,
        "plumber",
    ),
    "ac-services": (
        "AC Services",
        "Installation, servicing, gas and repair for split and window units.",
        "wind",
        4,
        "air-conditioner",
    ),
    "beautician": (
        "Beautician",
        "Salon-grade beauty and grooming services delivered at home.",
        "sparkles",
        5,
        "beautician",
    ),
    "home-services": (
        "Home Services",
        "Cleaning, pest control and upkeep delivered at your address.",
        "home",
        6,
        "home-cleaning",
    ),
    "construction": (
        "Construction",
        "Site labour and construction projects, priced on site.",
        "hard-hat",
        8,
        "construction",
    ),
    "events": (
        "Events",
        "Catering and event services, priced per plate or per event.",
        "party-popper",
        9,
        "catering",
    ),
}

A3_SERVICE_SLUG = "construction-helpers"
A5_SERVICE_SLUG = "interior-fit-out-project"

SHIFT_START = time(8)
SHIFT_END = time(20)
SEED_DOCUMENT_VERSION = 1

# ---------------------------------------------------------------------------
# The questions, authored once for both schemas.
#
# `frontend-execution-plan.md` §7 records this split as a live trap: the Customer's screen 1
# renders `catalog.ServiceQuestion` rows and `services.submit_requirement` validates against
# `M2VariantConfiguration.question_schema`, and their vocabularies differ (`NUMBER`/`SINGLE_CHOICE`
# against `INTEGER`/`SELECT`). A seed that wrote one and not the other would produce a flow whose
# fourth screen refuses what its first screen collected — invisible until somebody pressed Send.
# So both are derived from this one table, and the mapping below is the assertion §7 asked for.
# ---------------------------------------------------------------------------

#: The mapping itself. `ServiceQuestion.Kind` is the catalogue's vocabulary and
#: `carts.item_inputs.validate_scope` accepts a different one; a question authored in either alone
#: is a question the other half of the flow cannot handle.
_SCOPE_KIND_BY_QUESTION_KIND: dict[str, str] = {
    ServiceQuestion.Kind.NUMBER: "INTEGER",
    ServiceQuestion.Kind.TEXT: "TEXT",
    ServiceQuestion.Kind.BOOLEAN: "BOOLEAN",
    ServiceQuestion.Kind.SINGLE_CHOICE: "SELECT",
}

#: One authored option: `(code, label, description)`.
QuestionOptionSeed = tuple[str, str, str]

#: One authored question: `(code, prompt, catalogue kind, required, minimum, options)`.
QuestionSeed = tuple[str, str, str, bool, int | None, tuple[QuestionOptionSeed, ...] | None]

#: `help_text` for the questions that have one, keyed by code.
#:
#: A separate map rather than a seventh tuple element, so the questions that need no help stay
#: three lines instead of four. The words matter: a stepper labelled "People" beside a live price
#: invites "do I count the supervisor?", and a Customer who answers that wrong books a crew one
#: person short. The catalogue is where that sentence belongs — the booking screen renders whatever
#: help the server publishes and authors none of its own.
QUESTION_HELP: dict[str, str] = {
    "worker_count": "A supervisor is included with every crew.",
    "duration_days": "Consecutive days, 8-hour shifts.",
    "floor_area_sqft": "A rough number is fine. Vendors measure on the visit.",
    "fittings_count": "Taps, showers, WCs, basins.",
    "counter_length_ft": "Along the counter walls. A rough number is fine.",
    "point_count": "Switches, sockets and light points together.",
    "guest_count": "Sets the quantity on every dish.",
    # Event staff roles. The help is the one line a customer reads to tell two roles apart, so it
    # names the work rather than repeating the label.
    "waiter_count": "Serving, clearing, refills and buffet counters.",
    "bar_staff_count": "Soft drinks, mocktails and counters. No licensed liquor service.",
    "hostess_count": "Welcoming guests, seating and the gifts desk.",
    "kitchen_helper_count": "Plating, dish return and pantry support for your caterer.",
    "cleanup_count": "Keeping the venue and washrooms presentable through the event.",
    "setup_count": "Furniture, decor and equipment before and after.",
    "staff_meal_provided": "Customary for shifts over six hours.",
}

#: `(code, prompt, kind, required, minimum)`. The A3 set answers `services.infer_archetype`'s
#: workforce branch — a headcount and a duration — and the A5 set answers its project branch, an
#: outcome. They are deliberately disjoint: an answer set carrying both is ambiguous by definition
#: and is left on the variant's own archetype for Operations to reclassify.
#
#: The order of this tuple **is** `display_order`, and `display_order` is the order the booking
#: screen renders in — the client takes the catalogue's sequence and never re-sorts it. So the
#: sequence is a product decision made here: what the crew will do comes first, because it is the
#: question a Customer can answer without thinking, and the two numbers that move the price follow
#: it. Asking "how many people?" before "to do what?" is the order that makes somebody guess.
A3_QUESTIONS: tuple[QuestionSeed, ...] = (
    # Picked, not described. `work_description` was a free-text box asking a Customer to write a
    # job spec for people they have not met, and it is the field they abandon the form on: it is
    # optional, so most leave it blank, and a lead then reads "3 people, 2 days" and has no idea
    # what to bring. A named list answers both — the Customer taps once, and the offer a lead
    # receives says what the work actually is.
    #
    # The vocabulary is authored **here**, on the same versioned question schema A5's fit-out
    # picker uses, so the codes are the server's and the client only decorates them.
    (
        "work_type",
        "What will they be doing?",
        ServiceQuestion.Kind.SINGLE_CHOICE,
        True,
        None,
        (
            (
                "loading-unloading",
                "Loading and unloading",
                "Moving material off and onto vehicles, stacking and carrying by hand.",
            ),
            (
                "material-shifting",
                "Material shifting on site",
                "Carrying cement, sand, bricks and tools between floors and store rooms.",
            ),
            (
                "site-clearing",
                "Site clearing and debris removal",
                "Clearing rubble and waste, sweeping down and preparing a space to work in.",
            ),
            (
                "masonry-helper",
                "Masonry and concreting helper",
                "Mixing, carrying and feeding a mason or a concreting crew.",
            ),
            (
                "painting-helper",
                "Painting and finishing helper",
                "Surface preparation, masking, sanding and assisting a painter.",
            ),
            (
                "demolition-support",
                "Demolition support",
                "Breaking out, bagging and clearing away under a supervisor's direction.",
            ),
            (
                "general-labour",
                "General site labour",
                "A mix of the above, directed on the day by your site supervisor.",
            ),
            (
                "other",
                "Something else",
                "Tell us in a sentence and we will pass it to the supervisor with the offer.",
            ),
        ),
    ),
    ("worker_count", "People", ServiceQuestion.Kind.NUMBER, True, 1, None),
    ("duration_days", "Days", ServiceQuestion.Kind.NUMBER, True, 1, None),
    # Kept, and now doing one job instead of two: the free text behind "Something else". Optional
    # by design — a Customer who picked a named task has already said enough, and asking them to
    # write it out again is the friction this change exists to remove.
    (
        "work_description",
        "Tell us what the work is",
        ServiceQuestion.Kind.TEXT,
        False,
        None,
        None,
    ),
)
A5_QUESTIONS: tuple[QuestionSeed, ...] = (
    (
        "fit_out_style",
        "What kind of fit-out do you need?",
        ServiceQuestion.Kind.SINGLE_CHOICE,
        True,
        None,
        (
            (
                "office-fit-out",
                "Office fit-out",
                "Open desks, meeting rooms, power and data, with a tidy move-in finish.",
            ),
            (
                "retail-fit-out",
                "Retail fit-out",
                "Shopfronts, display walls, lighting and customer flow.",
            ),
            (
                "hospitality-fit-out",
                "Hospitality fit-out",
                "Counters, seating zones and durable guest-facing finishes.",
            ),
            (
                "shell-core-completion",
                "Shell and core completion",
                "Partitions, ceilings, flooring and services brought together for a bare shell.",
            ),
        ),
    ),
    # The three facts a vendor needs before deciding whether to spend half a day
    # visiting, and the three a Customer can answer without thinking.
    #
    # They were absent, which meant the brief a professional received said what
    # kind of fit-out and nothing about the size, the setting or the money —
    # so the first question on every enquiry was one of these three, asked by
    # phone, days later. Asking them here costs four taps and a number.
    (
        "space_type",
        "The space",
        ServiceQuestion.Kind.SINGLE_CHOICE,
        True,
        None,
        (
            ("home", "Home", ""),
            ("office", "Office", ""),
            ("shop", "Shop", ""),
        ),
    ),
    ("floor_area_sqft", "Roughly how big?", ServiceQuestion.Kind.NUMBER, True, 1, None),
    # **Not required, and "Not sure" is a real option rather than a way to skip.**
    # A Customer who does not know their budget is the ordinary case on a project
    # nobody has priced yet, and forcing a band would make them invent one —
    # which is worse than silence, because a vendor quotes against it.
    (
        "budget_band",
        "Budget in mind",
        ServiceQuestion.Kind.SINGLE_CHOICE,
        False,
        None,
        (
            ("under-5l", "Under ₹5L", ""),
            # An en dash, which is the correct character for a numeric range and
            # what the customer sees. RUF001 flags it as confusable with a
            # hyphen, which is true of identifiers and irrelevant to display copy.
            ("5l-15l", "₹5–15L", ""),  # noqa: RUF001
            ("over-15l", "₹15L+", ""),
            ("not-sure", "Not sure", ""),
        ),
    ),
)


#: One authored A5 project service: everything `_seed_variant` needs beyond the questions.
#:
#: The icon key is a member of the controlled `ServiceIconKey` vocabulary, never a guess — where
#: no trade glyph exists (painting, catering) the honest generic beats a wrong pictogram, which is
#: the FE-9 rule. Subcategory display orders start above the trade subcategories seeded by
#: `seed_task_catalog`, so a project section always lists after the priced task visits inside the
#: same trade category.
@dataclass(frozen=True)
class ProjectSeed:
    slug: str
    name: str
    variant_name: str
    icon_key: str
    #: A key of `M2_CATEGORY_SEEDS` — the trade category the customer browses, never a
    #: booking-model noun. Placement is merchandising only; the archetype stays on the variant.
    category_slug: str
    subcategory_slug: str
    subcategory_name: str
    subcategory_display_order: int
    questions: tuple[QuestionSeed, ...]
    #: Key into `catalog.seed_images.SEED_IMAGE_POOLS` for the tile photo and this
    #: service's cover. Blank seeds no photo and the client falls back to the icon.
    image_subject: str = ""
    #: The sentence on the service card and at the top of the brief. Author it —
    #: a customer never reads "(development fixture)".
    short_description: str = ""


#: Every A5 project the demo catalogue publishes. The design walkthrough follows
#: `full-bathroom-renovation`, whose three questions are the M2 artboard's "What needs doing?"
#: screen verbatim — a choice rendered as icon tiles, a number on the keypad card, a Yes/No pair.
#: **No `TEXT` questions here**: the Customer brief is facts-only (task.md, "The Customer never
#: describes anything"), and a text question seeded on an A5 variant would put a keyboard back
#: into a flow that removed every one.
A5_PROJECT_SEEDS: tuple[ProjectSeed, ...] = (
    ProjectSeed(
        slug=A5_SERVICE_SLUG,
        name="Interior fit-out project",
        variant_name="Fit-out, priced on site",
        icon_key=ServiceIconKey.CUSTOM_PROJECT,
        category_slug="construction",
        subcategory_slug="interior-fit-outs",
        subcategory_name="Interior fit-outs",
        subcategory_display_order=20,
        questions=A5_QUESTIONS,
        image_subject="interior-fit-out",
        short_description=(
            "A full interior fit-out, measured on site and priced in writing by up to "
            "three verified professionals."
        ),
    ),
    ProjectSeed(
        slug="full-bathroom-renovation",
        name="Full bathroom renovation",
        variant_name="Renovation, priced on site",
        icon_key=ServiceIconKey.PLUMBING,
        category_slug="plumber",
        subcategory_slug="renovation-projects",
        subcategory_name="Renovation projects",
        subcategory_display_order=30,
        questions=(
            (
                "rooms_scope",
                "Which rooms are we working on?",
                ServiceQuestion.Kind.SINGLE_CHOICE,
                True,
                None,
                (
                    ("one-bathroom", "One bathroom", ""),
                    ("two-bathrooms", "Two bathrooms", ""),
                    ("bathrooms-kitchen", "Bathrooms + kitchen", ""),
                    ("whole-flat", "Whole flat", ""),
                ),
            ),
            (
                "fittings_count",
                "How many fittings need installing?",
                ServiceQuestion.Kind.NUMBER,
                True,
                1,
                None,
            ),
            (
                "water_supply_working",
                "Is the water supply working?",
                ServiceQuestion.Kind.BOOLEAN,
                True,
                None,
                None,
            ),
        ),
        image_subject="bathroom-renovation",
        short_description=(
            "Strip-out to finish: your bathroom rebuilt, measured on site and priced in "
            "writing before any work starts."
        ),
    ),
    ProjectSeed(
        slug="full-home-painting",
        name="Full home painting",
        variant_name="Painting, priced on site",
        icon_key=ServiceIconKey.CUSTOM_PROJECT,
        category_slug="home-services",
        subcategory_slug="renovation-projects",
        subcategory_name="Renovation projects",
        subcategory_display_order=30,
        questions=(
            (
                "paint_scope",
                "What are we painting?",
                ServiceQuestion.Kind.SINGLE_CHOICE,
                True,
                None,
                (
                    ("interior-only", "Interior only", "Walls and ceilings inside the home."),
                    ("exterior-only", "Exterior only", "Outside walls, grills and gates."),
                    (
                        "interior-exterior",
                        "Interior + exterior",
                        "The whole property, inside and out.",
                    ),
                ),
            ),
            (
                "home_size",
                "How big is the home?",
                ServiceQuestion.Kind.SINGLE_CHOICE,
                True,
                None,
                (
                    ("1bhk", "1 BHK", ""),
                    ("2bhk", "2 BHK", ""),
                    ("3bhk", "3 BHK", ""),
                    ("villa-duplex", "Villa or duplex", ""),
                ),
            ),
            (
                "repaint_over_existing",
                "Is this a repaint over existing paint?",
                ServiceQuestion.Kind.BOOLEAN,
                True,
                None,
                None,
            ),
        ),
        image_subject="painting",
        short_description=(
            "Whole-home painting, measured on site — surface prep, paint and finish "
            "priced in writing before a brush touches a wall."
        ),
    ),
    ProjectSeed(
        slug="modular-kitchen-fit-out",
        name="Modular kitchen fit-out",
        variant_name="Kitchen, priced on site",
        icon_key=ServiceIconKey.CARPENTRY,
        category_slug="technician",
        subcategory_slug="renovation-projects",
        subcategory_name="Renovation projects",
        subcategory_display_order=30,
        questions=(
            (
                "kitchen_layout",
                "What shape is the kitchen?",
                ServiceQuestion.Kind.SINGLE_CHOICE,
                True,
                None,
                (
                    ("l-shaped", "L-shaped", ""),
                    ("u-shaped", "U-shaped", ""),
                    ("parallel", "Parallel", ""),
                    ("straight", "Straight", ""),
                ),
            ),
            (
                "counter_length_ft",
                "Counter length in feet",
                ServiceQuestion.Kind.NUMBER,
                True,
                1,
                None,
            ),
            (
                "appliances_included",
                "Should built-in appliances be included?",
                ServiceQuestion.Kind.BOOLEAN,
                True,
                None,
                None,
            ),
        ),
        image_subject="modular-kitchen",
        short_description=(
            "A modular kitchen designed around your layout, measured on site and priced "
            "in writing per unit and finish."
        ),
    ),
    ProjectSeed(
        slug="full-home-rewiring",
        name="Full home rewiring",
        variant_name="Rewiring, priced on site",
        icon_key=ServiceIconKey.ELECTRICAL,
        category_slug="electrician",
        subcategory_slug="renovation-projects",
        subcategory_name="Renovation projects",
        subcategory_display_order=30,
        questions=(
            (
                "property_type",
                "What is being rewired?",
                ServiceQuestion.Kind.SINGLE_CHOICE,
                True,
                None,
                (
                    ("apartment", "Apartment", ""),
                    ("independent-house", "Independent house", ""),
                    ("commercial-space", "Shop or office", ""),
                ),
            ),
            ("point_count", "How many points?", ServiceQuestion.Kind.NUMBER, True, 1, None),
            (
                "supply_live",
                "Is the mains supply on at the site?",
                ServiceQuestion.Kind.BOOLEAN,
                True,
                None,
                None,
            ),
        ),
        image_subject="house-wiring",
        short_description=(
            "Complete rewiring for a home or shop — points, boards and safety checks, "
            "measured on site and priced in writing."
        ),
    ),
    ProjectSeed(
        slug="event-catering",
        name="Event catering",
        variant_name="Menu, priced per plate",
        icon_key=ServiceIconKey.SERVICE,
        category_slug="events",
        subcategory_slug="event-services",
        subcategory_name="Event services",
        subcategory_display_order=40,
        questions=(
            (
                "meal_type",
                "Which meal are we serving?",
                ServiceQuestion.Kind.SINGLE_CHOICE,
                True,
                None,
                (
                    ("breakfast", "Breakfast", ""),
                    ("lunch", "Lunch", ""),
                    ("dinner", "Dinner", ""),
                ),
            ),
            ("guest_count", "Guests", ServiceQuestion.Kind.NUMBER, True, 1, None),
            (
                "menu_preference",
                "What kind of menu?",
                ServiceQuestion.Kind.SINGLE_CHOICE,
                True,
                None,
                (
                    ("veg", "Pure veg", ""),
                    ("veg-nonveg", "Veg + non-veg", ""),
                ),
            ),
        ),
        image_subject="catering",
        short_description=(
            "Menus priced per plate for your guest count — caterers visit, taste-plan "
            "with you and quote in writing."
        ),
    ),
    # ------------------------------------------------------------------
    # 2026-08-26: quote-priced work in EVERY category, so no trade is a
    # fixed-price-only storefront. Same icon-tile question discipline: choices,
    # numbers and yes/no only — the customer never types a description.
    # ------------------------------------------------------------------
    ProjectSeed(
        slug="electrician-consultation",
        name="Book an electrician consultation",
        variant_name="On-site consultation and estimate",
        icon_key=ServiceIconKey.ELECTRICAL,
        category_slug="electrician",
        subcategory_slug="consultation",
        subcategory_name="Book a consultation",
        subcategory_display_order=99,
        questions=(
            (
                "work_type",
                "What kind of work is it?",
                ServiceQuestion.Kind.SINGLE_CHOICE,
                True,
                None,
                (
                    ("new-wiring", "New wiring or points", ""),
                    ("repairs", "Repairs and faults", ""),
                    ("renovation", "Renovation work", ""),
                    ("not-sure", "Not sure yet", ""),
                ),
            ),
            (
                "property_type",
                "What is the property?",
                ServiceQuestion.Kind.SINGLE_CHOICE,
                True,
                None,
                (
                    ("apartment", "Apartment", ""),
                    ("independent-house", "Independent house", ""),
                    ("shop-office", "Shop or office", ""),
                ),
            ),
        ),
        image_subject="consultation",
        short_description=(
            "Not sure what the job needs? A verified electrician visits, inspects and "
            "gives you a written estimate — the visit fee is all you pay."
        ),
    ),
    ProjectSeed(
        slug="plumber-consultation",
        name="Book a plumber consultation",
        variant_name="On-site consultation and estimate",
        icon_key=ServiceIconKey.PLUMBING,
        category_slug="plumber",
        subcategory_slug="consultation",
        subcategory_name="Book a consultation",
        subcategory_display_order=99,
        questions=(
            (
                "work_type",
                "What kind of work is it?",
                ServiceQuestion.Kind.SINGLE_CHOICE,
                True,
                None,
                (
                    ("new-plumbing", "New plumbing lines", ""),
                    ("repairs", "Repairs and leaks", ""),
                    ("renovation", "Bathroom or kitchen renovation", ""),
                    ("not-sure", "Not sure yet", ""),
                ),
            ),
            (
                "property_type",
                "What is the property?",
                ServiceQuestion.Kind.SINGLE_CHOICE,
                True,
                None,
                (
                    ("apartment", "Apartment", ""),
                    ("independent-house", "Independent house", ""),
                    ("shop-office", "Shop or office", ""),
                ),
            ),
        ),
        image_subject="consultation",
        short_description=(
            "Not sure what the job needs? A verified plumber visits, inspects and gives "
            "you a written estimate — the visit fee is all you pay."
        ),
    ),
    ProjectSeed(
        slug="custom-furniture-work",
        name="Custom furniture & woodwork",
        variant_name="Furniture, priced on site",
        icon_key=ServiceIconKey.CARPENTRY,
        category_slug="technician",
        subcategory_slug="renovation-projects",
        subcategory_name="Renovation projects",
        subcategory_display_order=30,
        questions=(
            (
                "furniture_type",
                "What are we building?",
                ServiceQuestion.Kind.SINGLE_CHOICE,
                True,
                None,
                (
                    ("wardrobe", "Wardrobe", ""),
                    ("tv-unit", "TV unit", ""),
                    ("study-table", "Study table or desk", ""),
                    ("full-set", "Several pieces", ""),
                ),
            ),
            (
                "material_preference",
                "Which material?",
                ServiceQuestion.Kind.SINGLE_CHOICE,
                True,
                None,
                (
                    ("plywood", "Plywood with laminate", ""),
                    ("mdf", "MDF", ""),
                    ("solid-wood", "Solid wood", ""),
                    ("not-sure", "Not sure yet", ""),
                ),
            ),
            ("piece_count", "How many pieces?", ServiceQuestion.Kind.NUMBER, True, 1, None),
        ),
        image_subject="carpentry",
        short_description=(
            "Wardrobes, units and tables built to your measurements — a carpenter "
            "measures on site and quotes in writing per piece."
        ),
    ),
    ProjectSeed(
        slug="central-ac-ducting",
        name="Central AC & ducting work",
        variant_name="Ducted cooling, priced on site",
        icon_key=ServiceIconKey.AIR_CONDITIONING,
        category_slug="ac-services",
        subcategory_slug="ac-projects",
        subcategory_name="AC projects",
        subcategory_display_order=30,
        questions=(
            (
                "property_type",
                "Where is the system going?",
                ServiceQuestion.Kind.SINGLE_CHOICE,
                True,
                None,
                (
                    ("home", "Home", ""),
                    ("office", "Office", ""),
                    ("shop", "Shop or showroom", ""),
                ),
            ),
            ("area_sqft", "Roughly how big, in sq ft?", ServiceQuestion.Kind.NUMBER, True, 1, None),
            (
                "existing_ducting",
                "Is there existing ducting?",
                ServiceQuestion.Kind.BOOLEAN,
                True,
                None,
                None,
            ),
        ),
        image_subject="hvac-duct",
        short_description=(
            "Ducted and multi-room cooling designed for your space — surveyed on site "
            "and priced in writing per tonne and run."
        ),
    ),
    ProjectSeed(
        slug="bridal-event-makeup",
        name="Bridal & event makeup",
        variant_name="Package, priced after consultation",
        icon_key=ServiceIconKey.MAKEUP,
        category_slug="beautician",
        subcategory_slug="bridal-events",
        subcategory_name="Bridal & events",
        subcategory_display_order=90,
        questions=(
            (
                "occasion",
                "What is the occasion?",
                ServiceQuestion.Kind.SINGLE_CHOICE,
                True,
                None,
                (
                    ("wedding", "Wedding", ""),
                    ("reception", "Reception", ""),
                    ("engagement", "Engagement", ""),
                    ("party", "Party or shoot", ""),
                ),
            ),
            ("people_count", "For how many people?", ServiceQuestion.Kind.NUMBER, True, 1, None),
            (
                "trial_needed",
                "Do you want a trial session first?",
                ServiceQuestion.Kind.BOOLEAN,
                True,
                None,
                None,
            ),
        ),
        image_subject="bridal-makeup",
        short_description=(
            "Bridal and occasion makeup as a package — artists consult first, then quote "
            "in writing for the day, trials included if you want them."
        ),
    ),
    ProjectSeed(
        slug="home-demolition",
        name="Demolition & debris removal",
        variant_name="Demolition, priced on site",
        icon_key=ServiceIconKey.CUSTOM_PROJECT,
        category_slug="construction",
        subcategory_slug="demolition",
        subcategory_name="Demolition",
        subcategory_display_order=40,
        questions=(
            (
                "demolition_scope",
                "What is coming down?",
                ServiceQuestion.Kind.SINGLE_CHOICE,
                True,
                None,
                (
                    ("single-wall", "A wall or two", ""),
                    ("one-room", "One room", ""),
                    ("full-floor", "A full floor", ""),
                    ("full-structure", "A full structure", ""),
                ),
            ),
            (
                "debris_removal",
                "Should we take the debris away?",
                ServiceQuestion.Kind.BOOLEAN,
                True,
                None,
                None,
            ),
        ),
        image_subject="demolition",
        short_description=(
            "Safe demolition with optional debris removal — assessed on site and priced "
            "in writing before anything comes down."
        ),
    ),
    ProjectSeed(
        slug="tiling-flooring-work",
        name="Tiling & flooring work",
        variant_name="Tiling, priced on site",
        icon_key=ServiceIconKey.CUSTOM_PROJECT,
        category_slug="construction",
        subcategory_slug="tiling-flooring",
        subcategory_name="Tiling & flooring",
        subcategory_display_order=50,
        questions=(
            (
                "surface",
                "What are we tiling?",
                ServiceQuestion.Kind.SINGLE_CHOICE,
                True,
                None,
                (
                    ("floor", "Floors", ""),
                    ("wall", "Walls", ""),
                    ("both", "Floors and walls", ""),
                ),
            ),
            ("area_sqft", "Roughly how big, in sq ft?", ServiceQuestion.Kind.NUMBER, True, 1, None),
            (
                "material_provided",
                "Are you supplying the tiles?",
                ServiceQuestion.Kind.BOOLEAN,
                True,
                None,
                None,
            ),
        ),
        image_subject="tiling",
        short_description=(
            "Floor and wall tiling measured on site — laying, grouting and finishing "
            "priced in writing per square foot."
        ),
    ),
    ProjectSeed(
        slug="terrace-waterproofing",
        name="Terrace & bathroom waterproofing",
        variant_name="Waterproofing, priced on site",
        icon_key=ServiceIconKey.CUSTOM_PROJECT,
        category_slug="construction",
        subcategory_slug="waterproofing",
        subcategory_name="Waterproofing",
        subcategory_display_order=60,
        questions=(
            (
                "surface",
                "Where is the problem?",
                ServiceQuestion.Kind.SINGLE_CHOICE,
                True,
                None,
                (
                    ("terrace", "Terrace or roof", ""),
                    ("bathroom", "Bathroom", ""),
                    ("water-tank", "Water tank", ""),
                    ("basement", "Basement or wall", ""),
                ),
            ),
            ("area_sqft", "Roughly how big, in sq ft?", ServiceQuestion.Kind.NUMBER, True, 1, None),
            (
                "leakage_active",
                "Is it leaking right now?",
                ServiceQuestion.Kind.BOOLEAN,
                True,
                None,
                None,
            ),
        ),
        image_subject="terrace",
        short_description=(
            "Leaks found and sealed for good — terrace, bathroom or tank waterproofing, "
            "inspected on site and priced in writing."
        ),
    ),
    ProjectSeed(
        slug="event-lighting-decor",
        name="Event lighting & decor",
        variant_name="Decor, priced per event",
        icon_key=ServiceIconKey.SERVICE,
        category_slug="events",
        subcategory_slug="lighting-decor",
        subcategory_name="Lighting & decor",
        subcategory_display_order=50,
        questions=(
            (
                "event_type",
                "What is the event?",
                ServiceQuestion.Kind.SINGLE_CHOICE,
                True,
                None,
                (
                    ("wedding", "Wedding", ""),
                    ("birthday", "Birthday", ""),
                    ("corporate", "Corporate event", ""),
                    ("festival", "Festival or pooja", ""),
                ),
            ),
            ("guest_count", "Roughly how many guests?", ServiceQuestion.Kind.NUMBER, True, 1, None),
            (
                "venue_booked",
                "Is the venue already booked?",
                ServiceQuestion.Kind.BOOLEAN,
                True,
                None,
                None,
            ),
        ),
        image_subject="event-decor",
        short_description=(
            "Lighting, stage and decor planned around your venue — decorators visit and "
            "quote in writing for the whole event."
        ),
    ),
)


#: The vendor's own registration questions for the A3 capability (`M2-BE-106`), on the same
#: versioned schema and the same validator.
A3_REGISTRATION_QUESTIONS: tuple[QuestionSeed, ...] = (
    (
        "crew_capacity",
        "How many workers can you field in a day?",
        ServiceQuestion.Kind.NUMBER,
        True,
        1,
        None,
    ),
)
A3_REGISTRATION_ANSWERS: dict[str, object] = {"crew_capacity": 12}


def _question_schema(questions: tuple[QuestionSeed, ...]) -> dict[str, object]:
    return {
        "questions": [
            {
                "code": code,
                "label": prompt,
                "kind": _SCOPE_KIND_BY_QUESTION_KIND[kind],
                "required": required,
                **({"minimum": minimum} if minimum is not None else {}),
                **(
                    {
                        "options": [
                            {"code": option_code, "label": label, "description": description}
                            for option_code, label, description in options
                        ]
                    }
                    if options is not None
                    else {}
                ),
            }
            for code, prompt, kind, required, minimum, options in questions
        ]
    }


# ---------------------------------------------------------------------------
# Every placeholder value, in one table, so a reader can see the whole invented surface at once.
# The comment on each names the owner decision it stands in for.
# ---------------------------------------------------------------------------

#: `README.md` proposes INR 149 for the A3 unlock. A proposal, not an approval — owner decision 1.
A3_UNLOCK_PAISE = 14_900

#: `README.md` proposes INR 49 / 99 / 199 for the one-, two- and three-visit tiers, and the
#: per-slot split percentage is explicitly undecided. 6000 basis points sends 60% of each consumed
#: slot to the vendor who visited and estimated; the remaining 40% is the Vsolve platform share.
#: Both numbers are inventions of this file — owner decision 1.
A5_TIER_PAISE: dict[int, int] = {1: 4_900, 2: 9_900, 3: 19_900}
A5_VENDOR_PAYOUT_BASIS_POINTS = 6_000

#: Owner decision 7. INR 600 a day is a plausible unskilled-helper figure for Telangana and is not
#: a statutory citation; the real value comes from a gazette Operations loads, which is why
#: `source_reference` on a real row is where the citation belongs.
WAGE_FLOOR_PAISE_PER_DAY = 60_000

#: Owner decision 2, both archetypes.
FIRST_QUOTE_SLA_HOURS = 24
QUOTE_DELIVERY_SLA_HOURS = 72
FIRST_VISIT_SLA_HOURS = 24
VISIT_PLAN_FILL_SLA_HOURS = 72
POST_VISIT_ESTIMATE_WINDOW_HOURS = 48
#: How long an A5 plan visit occupies the vendor on the shared availability grid. No owner decision
#: names it; there is simply no defensible default for "how long does a site visit take".
VISIT_DURATION_MINUTES = 60

#: Owner decision 3. The vendor's visit payout is always paid because they travelled; this decides
#: only the platform share, and `False` keeps it.
CUSTOMER_NO_SHOW_REFUNDS_PLATFORM_SHARE = False

#: Pre-phase decision list. Two free replacements before the mechanism stops reopening a slot.
NON_RESPONSIVE_REJECTION_CAP = 2
MAX_QUOTES = 3

#: Owner decision 4, in both halves — the rate and whether it is shown inside the quoted price.
COMMISSION_BASIS_POINTS = 1_000
COMMISSION_TREATMENT = "INSIDE_QUOTED_PRICE"

#: Wave C3's three clocks. Unset, they mean respectively: no stage ever auto-approves, no stage
#: payout releases on a clock, and **an amendment cannot be proposed at all**.
STAGE_REVIEW_WINDOW_HOURS = 48
STAGE_PAYOUT_HOLD_HOURS = 24
AMENDMENT_RESPONSE_HOURS = 48

# ---------------------------------------------------------------------------
# Wave C2R / revision 4 (ADR-0009): the A3 rate card and its cascade.
#
# **Every number below is invented.** ADR-0009 says a real card is seeded by an Operations phone
# survey of ten to fifteen contractors per launch city, cross-checked against the wage floor. No
# contractor was called. These stand in for owner decisions 12 and 13 and are written with the
# dev-seed marker so it is obvious which rows were guessed when real ones arrive.
# ---------------------------------------------------------------------------

#: The three components of the published day rate, per worker per eight-hour day, in paise. The
#: wage clears `WAGE_FLOOR_PAISE_PER_DAY` above **by construction**: publish refuses a card below
#: the floor, so a seed that ignored it would fail rather than write a bad row — which is the guard
#: working. Owner decision 13 for the survey, decision 7 for the floor beneath it.
RATE_CARD_WORKER_DAY_WAGE_PAISE = 70_000
RATE_CARD_SUPERVISION_MARGIN_PAISE = 15_000
#: Owner decision 12. Per worker-day, because it is one of three parts of a per-worker-day price;
#: the fee actually charged is this over the whole booking.
RATE_CARD_BOOKING_FEE_PAISE = 5_000
#: What counts as a day, and what an hour past it costs.
RATE_CARD_STANDARD_DAY_HOURS = 8
RATE_CARD_OVERTIME_HOURLY_PAISE = 12_000
#: The printed inclusion list and the published add-on rates. Extras run through the amendment
#: engine at exactly these numbers, which is what leaves the on-site renegotiation nowhere to live.
RATE_CARD_INCLUSIONS = (
    "One 8-hour shift per worker, including a 30-minute break.",
    "Loading, carrying and unloading on the ground and first floor.",
    "The supervisor is on site for the whole shift.",
    "Overtime is charged only after you approve it in the app.",
)
RATE_CARD_ADD_ON_RATES: dict[str, int] = {
    "floor_above_first_per_worker_day": 5_000,
    "no_lift_per_worker_day": 7_500,
    "carry_distance_over_50m_per_worker_day": 5_000,
    "packing_materials_per_worker_day": 10_000,
}

#: The A3 preset: the price-moving facts ADR-0009 names for shifting work. Without these the
#: instant path refuses — an instant booking whose scope was never pinned down is the "third floor,
#: no lift? Extra, bhaiya" the rate card exists to prevent.
A3_PRESET_QUESTIONS: tuple[QuestionSeed, ...] = (
    ("floor_number", "Which floor?", ServiceQuestion.Kind.NUMBER, True, 0, None),
    ("has_lift", "Is there a working lift?", ServiceQuestion.Kind.BOOLEAN, True, None, None),
    (
        "carry_distance_m",
        "How far from the vehicle to the door, in metres?",
        ServiceQuestion.Kind.NUMBER,
        True,
        0,
        None,
    ),
    (
        "needs_packing",
        "Do you need packing as well?",
        ServiceQuestion.Kind.BOOLEAN,
        True,
        None,
        None,
    ),
)

#: The cascade's shape. Pre-phase decision list, all four of them. A wave of three, widening by two
#: each time, four waves before the fallback, and a two-minute offer timeout on the M1 dispatch
#: clock — deliberately minutes rather than business hours, because that is the whole difference
#: between an instant product and a quote.
CREW_WAVE_SIZE = 3
CREW_WAVE_WIDENING_STEP = 2
CREW_OFFER_TIMEOUT_SECONDS = 120
CREW_CASCADE_MAX_WAVES = 4
#: How long an accepted offer holds the job while the Customer pays. Fifteen minutes, matching the
#: order of magnitude of `M2_VISIT_PLAN_HOLD_SECONDS`.
CREW_OFFER_HOLD_SECONDS = 900

#: Owner decision 12. Twelve hours of free cancellation, and 60% of a forfeited fee to the lead as
#: travel compensation with the remaining 40% as the platform share. Both invented; the split
#: percentage mirrors the shape of the A5 visit split above rather than any decision.
BOOKING_FEE_FREE_CANCEL_HOURS = 12
BOOKING_FEE_TRAVEL_COMPENSATION_BASIS_POINTS = 6_000

#: Owner decision 13. Page Operations when more than 60% of offers at a rate are declined or
#: ignored, once at least five have gone out. Unset, **no alarm fires at all**.
CREW_DECLINE_ALARM_BASIS_POINTS = 6_000
CREW_DECLINE_ALARM_MIN_OFFERS = 5

# ---------------------------------------------------------------------------
# Wave C4 / revision 4 (ADR-0009): the shift-day's own policy values.
#
# Four more inventions, and they are the four Wave C4 reads fail-closed. Two of them decide
# nothing until they are set — the standing thresholds gate a background consequence, so unset
# means no demotion and no removal ever fires while the events still accumulate. One of them
# **refuses a command** while unset, and that asymmetry is the point: the retroactive overtime
# window decides whether work that has already been done gets paid for, and there is no safe
# direction to guess it in.
# ---------------------------------------------------------------------------

#: How long after a shift ends the Customer may still approve overtime that was already worked
#: (`M2-BE-531`). Two hours: long enough for a supervisor to ask on the way out, short enough that
#: nobody is approving hours at midnight that nobody can now check. Pre-phase decision list.
OVERTIME_RETROACTIVE_WINDOW_MINUTES = 120

#: How many short shift-days or cash-demand reports make a pattern, and the window they are
#: counted in (`M2-BE-537`, `539`). Three and three inside ninety days, all three invented. The
#: window is the load-bearing one — "three reports" without "three reports since when" is not a
#: rule at all — which is why an unset window disables both patterns and an unset threshold
#: disables only its own.
CREW_SHORTFALL_STANDING_THRESHOLD = 3
CASH_DEMAND_REMOVAL_THRESHOLD = 3
VENDOR_STANDING_WINDOW_DAYS = 90

#: The lead's UPI handle for the evening "Day settled?" convenience link (`M2-BE-536`). A `.test`
#: handle for the same reason every seeded phone is in a reserved block: this is a **peer-to-peer**
#: address the Customer's own UPI app sends money to, and a real-looking one in a development
#: fixture is a real-looking one somebody eventually pays.
DEMO_UPI_VPA_DOMAIN = "vsolvedemo.test"

# ---------------------------------------------------------------------------
# Wave C5 / A5 projects: the warranty pair, and the payout account without which the whole A5
# money story stops one step short of visible.
# ---------------------------------------------------------------------------

#: Pre-phase decision list ("retention percentage, warranty window"). Five per cent held back for
#: ninety days is an ordinary shape for fit-out work and is **not** an approval — like everything
#: else in this file it stands in for a decision nobody has made. Unset, both of them refuse an
#: estimate that advertises a warranty (`M2-BE-546`), which is a variant that cannot back its own
#: promise rather than a bug.
WARRANTY_RETENTION_BASIS_POINTS = 500
WARRANTY_WINDOW_DAYS = 90

#: A **verified payout account** per demo vendor, and it is the difference between an A5
#: walkthrough that ends at "earned" and one that ends at "payable".
#:
#: `payouts.payable_account` gates every M2 payout release there is — the visit share
#: (`access.release_visit_payout_hold`), the approved stage (`stages.release_stage_payout`) and
#: now the warranty retention (`stages.close_warranty_window`). It has always had three readers in
#: M2 and **no writer in this seed**, so in every development environment every M2 earning sat
#: `PENDING` for ever and the last step of the money story — the vendor's share of a consumed
#: visit actually becoming payable — could not be seen at all. Blank is a legitimate *production*
#: state, because a vendor who has not added bank details has genuinely earned money they cannot
#: yet be paid; it is not a legitimate demo state.
#:
#: No account number is invented, because none is stored: `PartnerPayoutAccount` keeps four digits
#: and a provider token, and the number itself lives with the payout provider. `effective_from` is
#: backdated past the cooling period so the walkthrough does not wait on it.
PAYOUT_ACCOUNT_LAST4 = "0000"
PAYOUT_ACCOUNT_IFSC = "HDFC0000001"

# ---------------------------------------------------------------------------
# Wave C6 / recovery: the case clocks, the chargeback alarm and the touch budget.
#
# Five more inventions, on the rule every wave since C2R has followed: **every configuration
# column M2 adds gets a writer in this command.** That rule is what the C2R post-mortem cost, and
# it is why the reader-with-no-writer sweep is run again every wave rather than trusted.
#
# The directions they fail in differ, and each one is stated where the column is defined:
# a missing response window leaves a case with no party deadline (it still opens); a missing
# appeal window refuses an appeal against a resolved case; a missing chargeback threshold fires no
# alarm while still recording every chargeback; a missing touch budget still emits the metric and
# simply declines to judge it.
# ---------------------------------------------------------------------------

#: Two working days for a party to answer a case about them, and seven to appeal a decision.
#: Both invented, both business hours through the service area's own calendar.
CASE_RESPONSE_WINDOW_HOURS = 16
CASE_APPEAL_WINDOW_HOURS = 56

#: Page Operations when more than 2% of M2 fee charges on a variant are charged back, once at least
#: `CHARGEBACK_ALARM_MIN_CHARGES` have been taken. The shape mirrors `CREW_DECLINE_ALARM_*`
#: deliberately: a rate plus a minimum count, because a rate over three charges is not a rate.
CHARGEBACK_ALARM_BASIS_POINTS = 200
#: **Lowered from 20 to 2 in Wave C7, and the reason is the seed's own purpose rather than the
#: alarm's design.** At 20 the alarm was unreachable by hand: a walkthrough produces one or two real
#: charges, so the branch could never be demonstrated and the whole `M2-BE-708` path was shipped
#: unexercised in every environment — which is the state this file exists to prevent for prices and
#: clocks and is no better for an alarm.
#:
#: A minimum of 2 is still a minimum: one chargeback out of one charge is 10,000 basis points and
#: means nothing, and refusing to alarm on a population of one is the real point of the knob. A
#: production threshold would be a much larger number over a much larger population, and the owner
#: sets it; **this is a dev-seed placeholder and is marked as one**, exactly like the INR 149 unlock
#: sitting twenty lines above it.
CHARGEBACK_ALARM_MIN_CHARGES = 2

#: The approved unit-economics budget `M2-BE-715` measures against. Two touches per request is a
#: stand-in for decision 10 and nothing more — for A3 the real check is against the booking fee's
#: platform share, which is published on the rate card rather than duplicated here.
OPERATIONS_TOUCH_BUDGET_PER_REQUEST = 2

#: The demo Operations queue. One case to work, one refund to inspect, one held payout and one
#: stuck-state queue with something in it — `M2-BE-703`, `707`, `709` and `714` each need a row
#: before their screen shows anything but an empty state, and an Operations workspace that can
#: only be demonstrated empty is one nobody can review.
DEMO_CASE_SUMMARY = "Demo: attendance disputed on day one"
DEMO_CASE_DETAIL = (
    "Seeded by seed_m2_demo so the Operations queue, the evidence trail and the payout hold have "
    "something to show. Not a real report."
)
#: A partner-subject case needs no requirement, which is what lets the seed write one without
#: fabricating a whole booking. `QUALITY` because it is a payout-holding kind, so the held-payout
#: card on the Operations home screen has a row too.
DEMO_CASE_KIND = "QUALITY"

#: Written onto **both** variant configurations, because a case, an appeal and a chargeback are
#: not archetype-specific. Held as one mapping rather than repeated in two `extra` dictionaries,
#: so the two configurations cannot drift — which is the same reason the constraint tuples in
#: `catalog.models` exist.
_C6_RECOVERY_POLICY: dict[str, Any] = {
    "case_response_window_hours": CASE_RESPONSE_WINDOW_HOURS,
    "case_appeal_window_hours": CASE_APPEAL_WINDOW_HOURS,
    "chargeback_alarm_basis_points": CHARGEBACK_ALARM_BASIS_POINTS,
    "chargeback_alarm_min_charges": CHARGEBACK_ALARM_MIN_CHARGES,
    "operations_touch_budget_per_request": OPERATIONS_TOUCH_BUDGET_PER_REQUEST,
}


#: One A3 day-hire service: the catalog placement plus the money rows (skill, wage floor,
#: rate card) the instant path fails closed without. **Every money figure is an invention**
#: standing in for the ADR-0009 phone survey, exactly like the construction-helper constants
#: above — the per-trade spreads (an electrician's day costs more than a helper's) are shaped
#: plausibly so the demo reads sensibly, and nothing more.
#:
#: ## Everything the customer reads is per service, never shared
#:
#: The first cut of this table shared `A3_QUESTIONS`, `RATE_CARD_INCLUSIONS` and the shifting
#: add-ons across all five services — so "Event staff by the day" opened on "What will they be
#: doing?" with masonry and demolition cards, and its rate promised "loading, carrying and
#: unloading". A customer who picked a specific trade already answered the work question by
#: picking it: only the generic helpers service keeps a work chooser, and every service carries
#: its own questions, its own rate inclusions, its own included/excluded policy copy and its own
#: add-on rates. The booking flow renders whatever is published here, so wrong words in this
#: table ARE the broken screen.
@dataclass(frozen=True)
class DaySeed:
    slug: str
    name: str
    variant_name: str
    icon_key: str
    category_slug: str
    subcategory_slug: str
    subcategory_name: str
    subcategory_display_order: int
    image_subject: str
    skill_code: str
    skill_name: str
    skill_description: str
    wage_floor_paise: int
    worker_day_wage_paise: int
    supervision_margin_paise: int
    overtime_hourly_paise: int
    #: What the customer is asked. Must include `worker_count` and `duration_days` — the two
    #: codes `rate_cards.preset_size`, matching and the shift-day engine all read.
    questions: tuple[QuestionSeed, ...]
    #: Price-moving facts for the instant path. Empty publishes `{"questions": []}` — a real,
    #: present preset with nothing extra to ask — never `{}`, which the reader refuses.
    preset_questions: tuple[QuestionSeed, ...]
    #: Printed on the rate card and echoed on the customer's live-rate screen.
    rate_inclusions: tuple[str, ...]
    #: Published extras priced through the amendment engine. Empty means no billable extras.
    add_on_rates: dict[str, int]
    #: The catalogue's What's-included / What's-not page for this service.
    short_description: str
    included: tuple[str, ...]
    excluded: tuple[str, ...]


#: The two sizing questions every day-hire form ends with, labelled per trade. The codes are
#: load-bearing (`preset_size` reads exactly these); only the label varies.
def _size_questions(people_label: str) -> tuple[QuestionSeed, ...]:
    return (
        (
            "worker_count",
            people_label,
            ServiceQuestion.Kind.NUMBER,
            True,
            1,
            None,
        ),
        ("duration_days", "Days", ServiceQuestion.Kind.NUMBER, True, 1, None),
    )


#: Event staff is the one day-hire that "picking the service" does NOT answer: a waiter, a bar
#: hand, a hostess and a cleanup crew are different people at different stations, and a lead
#: staffing a wedding needs the occasion, the crowd and the dress code before they can say yes.
#:
#: The per-role counts are optional NUMBER questions with a floor of zero. `worker_count` stays
#: required and is the sum of them — the booking screen keeps it in step — because `preset_size`,
#: matching and the shift-day engine all read that one code and nothing else. Order here is the
#: order the screens ask in: the occasion, the crew, then how they should turn up.
EVENT_STAFF_QUESTIONS: tuple[QuestionSeed, ...] = (
    (
        "event_type",
        "What's the occasion?",
        ServiceQuestion.Kind.SINGLE_CHOICE,
        True,
        None,
        (
            ("wedding", "Wedding", "Reception, sangeet, haldi or the wedding day itself."),
            (
                "corporate",
                "Corporate event",
                "Conferences, launches, office parties and client dinners.",
            ),
            ("birthday", "Birthday party", "For kids or adults, at home or at a venue."),
            (
                "house-function",
                "House or religious function",
                "Housewarming, pooja, naming ceremony or a festival gathering.",
            ),
            (
                "other",
                "Something else",
                "Tell us in a sentence and we will pass it to the supervisor.",
            ),
        ),
    ),
    ("event_description", "Tell us about the event", ServiceQuestion.Kind.TEXT, False, None, None),
    (
        "guest_band",
        "How many guests?",
        ServiceQuestion.Kind.SINGLE_CHOICE,
        True,
        None,
        (
            ("under-50", "Under 50", ""),
            ("50-100", "50 to 100", ""),
            ("100-200", "100 to 200", ""),
            ("200-plus", "200 or more", ""),
        ),
    ),
    (
        "service_style",
        "How is food served?",
        ServiceQuestion.Kind.SINGLE_CHOICE,
        True,
        None,
        (
            ("buffet", "Buffet", "Guests walk up to the counters."),
            ("sit-down", "Sit-down service", "Served at the table, course by course."),
            ("passed", "Snacks and drinks passed around", "Trays circulating through the room."),
            ("no-food", "No food service", "Setup, reception and support only."),
        ),
    ),
    ("waiter_count", "Waiters and serving staff", ServiceQuestion.Kind.NUMBER, False, 0, None),
    ("bar_staff_count", "Bar and beverage staff", ServiceQuestion.Kind.NUMBER, False, 0, None),
    ("hostess_count", "Guest reception", ServiceQuestion.Kind.NUMBER, False, 0, None),
    (
        "kitchen_helper_count",
        "Kitchen and pantry helpers",
        ServiceQuestion.Kind.NUMBER,
        False,
        0,
        None,
    ),
    ("cleanup_count", "Cleanup and housekeeping", ServiceQuestion.Kind.NUMBER, False, 0, None),
    ("setup_count", "Setup and teardown crew", ServiceQuestion.Kind.NUMBER, False, 0, None),
    ("worker_count", "Staff", ServiceQuestion.Kind.NUMBER, True, 1, None),
    ("duration_days", "Days", ServiceQuestion.Kind.NUMBER, True, 1, None),
    (
        "dress_code",
        "Dress code",
        ServiceQuestion.Kind.SINGLE_CHOICE,
        True,
        None,
        (
            ("black-white", "Black and white formal", ""),
            ("traditional", "Traditional or ethnic", ""),
            ("safari", "Safari suit", ""),
            ("client-uniform", "We will provide uniforms", ""),
        ),
    ),
    (
        "staff_meal_provided",
        "Will you provide a meal for the staff?",
        ServiceQuestion.Kind.BOOLEAN,
        True,
        None,
        None,
    ),
    (
        "staff_preference",
        "Staff preference",
        ServiceQuestion.Kind.SINGLE_CHOICE,
        False,
        None,
        (
            ("any", "Any", ""),
            ("female", "Female staff", ""),
            ("male", "Male staff", ""),
        ),
    ),
)


A3_DAY_SEEDS: tuple[DaySeed, ...] = (
    DaySeed(
        slug=A3_SERVICE_SLUG,
        name="Construction helpers",
        variant_name="Helpers by the day",
        icon_key=ServiceIconKey.WORKFORCE,
        category_slug="construction",
        subcategory_slug="construction-labour",
        subcategory_name="Construction labour",
        subcategory_display_order=10,
        image_subject="construction",
        skill_code="construction-helper",
        skill_name="Construction helper",
        skill_description="Unskilled site labour. A wage classification, not a trade slug.",
        wage_floor_paise=WAGE_FLOOR_PAISE_PER_DAY,
        worker_day_wage_paise=RATE_CARD_WORKER_DAY_WAGE_PAISE,
        supervision_margin_paise=RATE_CARD_SUPERVISION_MARGIN_PAISE,
        overtime_hourly_paise=RATE_CARD_OVERTIME_HOURLY_PAISE,
        # Generic labour is the ONE service where "what will they be doing?" is a real
        # question — helpers shift, clear, mix and carry, and the lead needs to know which.
        questions=A3_QUESTIONS,
        preset_questions=A3_PRESET_QUESTIONS,
        rate_inclusions=RATE_CARD_INCLUSIONS,
        add_on_rates=dict(RATE_CARD_ADD_ON_RATES),
        short_description=(
            "General site labour by the day — loading, shifting, clearing and helper work, "
            "with a supervisor on site for the whole shift."
        ),
        included=(
            "One 8-hour shift per worker, including a 30-minute break.",
            "A working supervisor on site for the whole shift.",
            "Loading, carrying, clearing and helper work as directed by you.",
            "Basic hand tools — crowbars, shovels, gamelas and ropes.",
        ),
        excluded=(
            "Skilled trade work — masonry, electrical, plumbing and carpentry are their own "
            "services.",
            "Transport vehicles and debris haulage — the crew loads, you arrange the vehicle.",
            "Materials and consumables of any kind.",
        ),
    ),
    DaySeed(
        slug="electrician-by-the-day",
        name="Electrician by the day",
        variant_name="Full-day electrician",
        icon_key=ServiceIconKey.ELECTRICAL,
        category_slug="electrician",
        subcategory_slug="hire-by-the-day",
        subcategory_name="Hire by the day",
        subcategory_display_order=95,
        image_subject="electrician",
        skill_code="electrician",
        skill_name="Electrician",
        skill_description="Licensed electrical trade work, hired by the day.",
        wage_floor_paise=90_000,
        worker_day_wage_paise=110_000,
        supervision_margin_paise=20_000,
        overtime_hourly_paise=20_000,
        # No work chooser: the customer picked "Electrician by the day", and that IS the work.
        questions=_size_questions("Electricians"),
        preset_questions=(),
        rate_inclusions=(
            "One 8-hour day per electrician, including a 30-minute break.",
            "Own hand tools, tester and multimeter.",
            "Minor consumables — insulation tape, wire connectors, screws.",
            "Overtime is charged only after you approve it in the app.",
        ),
        add_on_rates={},
        short_description=(
            "A verified electrician at your site for a full working day — wiring, fittings, "
            "repairs and finishing work under your direction."
        ),
        included=(
            "One 8-hour day per electrician, including a 30-minute break.",
            "Wiring, fitting, repair and finishing work as you direct it on site.",
            "Own hand tools, tester and multimeter.",
            "Minor consumables like insulation tape and connectors.",
        ),
        excluded=(
            "Wires, switches, MCBs, lights and other materials — you buy them, or the "
            "electrician buys them with your approval.",
            "Civil work such as wall chasing beyond minor cutting.",
            "Electricity-board liaison for new connections or load changes.",
        ),
    ),
    DaySeed(
        slug="plumber-by-the-day",
        name="Plumber by the day",
        variant_name="Full-day plumber",
        icon_key=ServiceIconKey.PLUMBING,
        category_slug="plumber",
        subcategory_slug="hire-by-the-day",
        subcategory_name="Hire by the day",
        subcategory_display_order=95,
        image_subject="plumber",
        skill_code="plumber",
        skill_name="Plumber",
        skill_description="Plumbing trade work, hired by the day.",
        wage_floor_paise=85_000,
        worker_day_wage_paise=100_000,
        supervision_margin_paise=20_000,
        overtime_hourly_paise=18_000,
        questions=_size_questions("Plumbers"),
        preset_questions=(),
        rate_inclusions=(
            "One 8-hour day per plumber, including a 30-minute break.",
            "Own hand tools — wrenches, cutters, sealing kit.",
            "Minor consumables — thread tape, sealant.",
            "Overtime is charged only after you approve it in the app.",
        ),
        add_on_rates={},
        short_description=(
            "A verified plumber at your site for a full working day — lines, fittings, "
            "repairs and bathroom work under your direction."
        ),
        included=(
            "One 8-hour day per plumber, including a 30-minute break.",
            "Pipe, fitting, repair and installation work as you direct it on site.",
            "Own hand tools and sealing kit.",
            "Minor consumables like thread tape and sealant.",
        ),
        excluded=(
            "Pipes, taps, sanitaryware and other materials — you buy them, or the plumber "
            "buys them with your approval.",
            "Civil work such as breaking tiles or walls beyond minor cutting.",
            "Water-board liaison for new connections.",
        ),
    ),
    DaySeed(
        slug="painter-by-the-day",
        name="Painter by the day",
        variant_name="Full-day painter",
        icon_key=ServiceIconKey.CUSTOM_PROJECT,
        category_slug="home-services",
        subcategory_slug="hire-by-the-day",
        subcategory_name="Hire by the day",
        subcategory_display_order=95,
        image_subject="painting",
        skill_code="painter",
        skill_name="Painter",
        skill_description="Wall and surface painting work, hired by the day.",
        wage_floor_paise=70_000,
        worker_day_wage_paise=80_000,
        supervision_margin_paise=15_000,
        overtime_hourly_paise=14_000,
        questions=_size_questions("Painters"),
        preset_questions=(),
        rate_inclusions=(
            "One 8-hour day per painter, including a 30-minute break.",
            "Brushes, rollers and trays.",
            "Masking and floor protection with your materials.",
            "Overtime is charged only after you approve it in the app.",
        ),
        add_on_rates={},
        short_description=(
            "A verified painter at your site for a full working day — preparation, "
            "painting and finishing with the paint you choose."
        ),
        included=(
            "One 8-hour day per painter, including a 30-minute break.",
            "Surface preparation, masking, painting and finishing as you direct it.",
            "Brushes, rollers and trays.",
        ),
        excluded=(
            "Paint, putty, primer and masking materials — you buy them, or the painter "
            "buys them with your approval.",
            "Exterior work at height needing scaffolding.",
            "Wall repairs beyond minor filling.",
        ),
    ),
    DaySeed(
        slug="event-staff-by-the-day",
        name="Event staff by the day",
        variant_name="Full-day event staff",
        icon_key=ServiceIconKey.SERVICE,
        category_slug="events",
        subcategory_slug="event-staff",
        subcategory_name="Event staff",
        subcategory_display_order=60,
        image_subject="event-staff",
        skill_code="event-staff",
        skill_name="Event staff",
        skill_description="Serving and support staff for events, hired by the day.",
        wage_floor_paise=60_000,
        worker_day_wage_paise=70_000,
        supervision_margin_paise=15_000,
        overtime_hourly_paise=12_000,
        questions=EVENT_STAFF_QUESTIONS,
        preset_questions=(),
        rate_inclusions=(
            "One 8-hour day per staff member, including a 30-minute break.",
            "Clean, presentable dress code.",
            "Serving, clearing, guest support and setup help through the event.",
            "Overtime is charged only after you approve it in the app.",
        ),
        add_on_rates={},
        short_description=(
            "Trained serving and support staff for your event, by the day — serving, "
            "clearing, setup and guest support, with a supervisor on duty."
        ),
        included=(
            "One 8-hour day per staff member, including a 30-minute break.",
            "Serving, clearing, guest support and setup or teardown help.",
            "A supervisor on duty for the whole event.",
            "Clean, presentable dress code.",
        ),
        excluded=(
            "Food, beverages and catering — see Event catering for that.",
            "Crockery, cutlery, furniture and decor.",
            "Bartending with licensed liquor service.",
        ),
    ),
)


def _matches_seeded_rate(card: RateCard, seed: DaySeed) -> bool:
    """Whether a published card already carries exactly what this seed would write.

    The words are compared as well as the money: the printed inclusions render verbatim on
    the customer's live-rate screen, so a card whose components match but whose inclusions
    still describe another trade's day ("loading and unloading" on event staff) is a card
    this seed exists to correct — skipping it would leave the wrong promise published.
    """
    return (
        card.worker_day_wage_paise == seed.worker_day_wage_paise
        and card.supervision_margin_paise == seed.supervision_margin_paise
        and card.booking_fee_paise == RATE_CARD_BOOKING_FEE_PAISE
        and card.standard_day_hours == RATE_CARD_STANDARD_DAY_HOURS
        and card.overtime_hourly_paise == seed.overtime_hourly_paise
        and list(card.inclusions) == list(seed.rate_inclusions)
        and dict(card.add_on_rates) == dict(seed.add_on_rates)
    )


class Command(BaseCommand):
    help = (
        "Load placeholder M2 configuration (prices, clocks, caps, wage floor) plus the catalog, "
        "area and vendors both walkthroughs need. Development only; never a code default."
    )

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--i-understand-this-is-dev-only",
            action="store_true",
            dest="acknowledged",
            help=(
                "Required. Every money value this command writes is a placeholder standing in for "
                "an open owner decision."
            ),
        )
        parser.add_argument(
            "--vendors",
            type=int,
            default=3,
            help=(
                "How many M2 vendors to seed. Defaults to 3, which is the A3 quote ceiling and the "
                "largest A5 visit plan, so both walkthroughs can fill every slot."
            ),
        )

    @transaction.atomic
    def handle(self, *_args: Any, **options: Any) -> None:
        self._assert_dev_only(acknowledged=bool(options["acknowledged"]))

        # Skills and published consent documents are prerequisites for a complete application, and
        # this command creates Partners. Idempotent on its own side, and it never clobbers a
        # published consent — see its docstring.
        call_command("seed_partner_reference_data")

        area = self._seed_service_area()

        # Day-hire (A3) in every category that can honestly sell a day of one trade. Each
        # seed carries its own wage classification, floor and rate card, because the instant
        # path fails closed per skill: a card for helpers says nothing about electricians.
        a3_variants: list[ServiceVariant] = []
        skills: list[Skill] = []
        wage_floors_written = 0
        rate_cards_published = 0
        for day in A3_DAY_SEEDS:
            skill = self._seed_skill(day)
            skills.append(skill)
            a3_variant = self._seed_variant(
                service_slug=day.slug,
                service_name=day.name,
                variant_name=day.variant_name,
                archetype=ServiceVariant.BookingArchetype.A3_TIME_BLOCK,
                questions=day.questions,
                icon_key=day.icon_key,
                category_slug=day.category_slug,
                subcategory_slug=day.subcategory_slug,
                subcategory_name=day.subcategory_name,
                subcategory_display_order=day.subcategory_display_order,
                image_subject=day.image_subject,
                short_description=day.short_description,
            )
            a3_variants.append(a3_variant)
            self._seed_service_policies(
                service=a3_variant.service,
                included=day.included,
                excluded=day.excluded,
            )
            self._seed_a3_configuration(
                variant=a3_variant,
                skill=skill,
                preset_questions=day.preset_questions,
                questions=day.questions,
            )
            wage_floors_written += int(self._seed_wage_floor(skill=skill, seed=day))
            rate_cards_published += int(self._seed_rate_card(area=area, skill=skill, seed=day))

        # Every A5 project in the catalogue, not just the fit-out. One variant, one area
        # activation and one ACTIVE configuration each — a project seeded without any one of the
        # three renders in the catalogue and then refuses at the brief, which reads as a broken
        # flow rather than missing data.
        a5_variants = tuple(
            self._seed_variant(
                service_slug=project.slug,
                service_name=project.name,
                variant_name=project.variant_name,
                archetype=ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT,
                questions=project.questions,
                icon_key=project.icon_key,
                category_slug=project.category_slug,
                subcategory_slug=project.subcategory_slug,
                subcategory_name=project.subcategory_name,
                subcategory_display_order=project.subcategory_display_order,
                image_subject=project.image_subject,
                short_description=project.short_description,
            )
            for project in A5_PROJECT_SEEDS
        )
        for variant in (*a3_variants, *a5_variants):
            ServiceAreaService.objects.update_or_create(
                service_area=area,
                variant=variant,
                defaults={"is_active": True},
            )

        for a5_variant, project in zip(a5_variants, A5_PROJECT_SEEDS, strict=True):
            self._seed_a5_configuration(variant=a5_variant, questions=project.questions)
        prices_written, prices_skipped = self._seed_access_prices()

        vendors = self._seed_vendors(
            area=area,
            variants=(*a3_variants, *a5_variants),
            skills=tuple(skills),
            count=max(1, int(options["vendors"])),
        )

        self._report(
            wage_floors_written=wage_floors_written,
            rate_cards_published=rate_cards_published,
            prices_written=prices_written,
            prices_skipped=prices_skipped,
            vendors=vendors,
        )

    # -- guards ------------------------------------------------------------

    def _assert_dev_only(self, *, acknowledged: bool) -> None:
        """Refuse anywhere that is not obviously a developer's own machine.

        Two independent conditions rather than one, and neither rescues the other. `DEBUG` is the
        environment's own statement about itself and `production.py` never sets it; the flag is the
        operator's statement about their intent, and it is required even under `DEBUG` because a
        shared development database can already hold prices somebody loaded deliberately.
        """
        if not settings.DEBUG:
            raise CommandError(
                "seed_m2_demo writes placeholder prices and policy values and is forbidden "
                "outside local development. settings.DEBUG is False."
            )
        if not acknowledged:
            raise CommandError(
                "Pass --i-understand-this-is-dev-only. Every money value this command writes — "
                "the INR 149 unlock, the INR 49/99/199 visit tiers, the 60/40 visit split and the "
                "wage floor — is a placeholder standing in for an owner decision that has not "
                "been made. See docs/runbooks/m2-demo-seed.md."
            )

    def _may_overwrite(self, *, existing_reference: str | None, label: str) -> bool:
        """Never overwrite a value somebody loaded on purpose.

        A row whose `source_reference` does not carry the marker is a real decision — an operator's
        gazette citation, an approved price — and silently replacing it with a placeholder would be
        the single worst thing this command could do. It is left alone and named.
        """
        if existing_reference is None or DEV_SEED_MARKER in existing_reference:
            return True
        self.stdout.write(
            self.style.WARNING(
                f"Left {label} alone: it carries a real source reference "
                f"({existing_reference!r}), not a dev-seed marker."
            )
        )
        return False

    # -- reference data ----------------------------------------------------

    def _seed_service_area(self) -> ServiceArea:
        """The reviewed M1 area, plus the two things M2 needs it to carry.

        `state_code` is what the A3 wage-floor guard derives the statutory state from, and the
        operating windows are what every M2 business-hours clock runs against — with none, the
        deadline helpers answer `None` and every SLA, invitation and reconfirmation deadline
        silently vanishes rather than erroring.
        """
        postal_code, _ = PostalCode.objects.update_or_create(
            code=POSTAL_CODE,
            defaults={
                "city": "Hyderabad",
                "state": "Telangana",
                "country_code": "IN",
                "is_active": True,
            },
        )
        area, _ = ServiceArea.objects.get_or_create(
            slug=SERVICE_AREA_SLUG,
            defaults={
                "name": "Hyderabad 500032",
                "timezone": "Asia/Kolkata",
                "is_active": True,
            },
        )
        if area.state_code != STATE_CODE:
            area.state_code = STATE_CODE
            area.save(update_fields=("state_code", "updated_at"))
        ServiceAreaPostalCode.objects.get_or_create(service_area=area, postal_code=postal_code)
        for weekday in range(7):
            ServiceAreaOperatingWindow.objects.update_or_create(
                service_area=area,
                weekday=weekday,
                opens_at=SHIFT_START,
                defaults={"closes_at": SHIFT_END, "closes_next_day": False},
            )
        return area

    @staticmethod
    def _seed_skill(day: DaySeed) -> Skill:
        """The statutory wage classification, which is not the dispatch trade slug.

        `M2VariantConfiguration.wage_floor_skill` exists precisely so a legal floor is not tied to
        `ServiceVariant.required_skill_code`, which is a merchandising decision. Codes like
        `electrician` deliberately merge with the trade skill `seed_partner_reference_data`
        authors — one row serves as both the trade a Partner holds and the classification a
        floor is filed under, and two rows with one code would be a drift bug.
        """
        skill, _ = Skill.objects.update_or_create(
            code=day.skill_code,
            defaults={
                "name": day.skill_name,
                "description": day.skill_description,
                "is_active": True,
            },
        )
        return skill

    def _seed_variant(
        self,
        *,
        service_slug: str,
        service_name: str,
        variant_name: str,
        archetype: str,
        questions: tuple[QuestionSeed, ...],
        icon_key: str,
        category_slug: str,
        subcategory_slug: str,
        subcategory_name: str,
        subcategory_display_order: int,
        image_subject: str = "",
        short_description: str = "",
    ) -> ServiceVariant:
        # The trade category the customer actually browses. A slug outside the authored map is a
        # typo, and a typo here would quietly invent a category — so it refuses instead.
        if category_slug not in M2_CATEGORY_SEEDS:
            raise CommandError(
                f"Unknown category slug {category_slug!r} for service {service_slug!r}; "
                "add it to M2_CATEGORY_SEEDS or fix the seed."
            )
        (
            category_name,
            category_description,
            category_icon,
            category_order,
            category_subject,
        ) = M2_CATEGORY_SEEDS[category_slug]
        category, _ = Category.objects.update_or_create(
            slug=category_slug,
            defaults={
                "name": category_name,
                "description": category_description,
                "icon_key": category_icon,
                "is_active": True,
                "display_order": category_order,
            },
        )
        fill_blank_image(category, "image_url", image_for(category_subject))
        subcategory, _ = Subcategory.objects.update_or_create(
            category=category,
            slug=subcategory_slug,
            defaults={
                "name": subcategory_name,
                "icon_key": icon_key,
                "display_order": subcategory_display_order,
                "is_active": True,
            },
        )
        if image_subject:
            fill_blank_image(subcategory, "image_url", image_for(image_subject))
        service, _ = Service.objects.update_or_create(
            slug=service_slug,
            defaults={
                "subcategory": subcategory,
                "name": service_name,
                "icon_key": icon_key,
                # Real customer-facing copy, never a "(development fixture)" stub — this
                # sentence renders on every service card and at the top of the booking flow.
                "short_description": short_description
                or f"{service_name}, priced by the professionals who quote for it.",
                "description": short_description,
                "status": Service.Status.ACTIVE,
            },
        )
        if image_subject:
            # Position 1, so a one-service tile does not show the identical photo twice
            # (the tile itself uses position 0); a single-photo pool wraps back to it.
            self._seed_service_cover(
                service=service,
                url=image_for(image_subject, 1),
                alt_text=service_name,
            )
        variant, _ = ServiceVariant.objects.update_or_create(
            service=service,
            code="standard",
            defaults={
                "name": variant_name,
                "pricing_strategy": ServiceVariant.PricingStrategy.FIXED,
                "booking_archetype": archetype,
                # The dispatch trade slug. Deliberately the service slug and deliberately *not*
                # the wage-floor skill: one decides who can be sent, the other decides what the
                # law says they must be paid, and tying them together is what `M2-BE-317` refused.
                "required_skill_code": service_slug,
                "tax_category_code": "services-standard",
                "is_active": True,
            },
        )
        # The authored list is the whole list.
        #
        # Without this the command only ever *added*: a question dropped from the tuple stayed
        # active on the variant forever, so every environment accumulated whatever any earlier
        # revision of this file had asked for. That is how a fit-out brief ended up asking "what
        # should be finished at the end?" — a question removed from the design months ago and
        # still required, still blocking the form's Continue.
        #
        # Deactivated rather than deleted: `CustomerRequirement.answers` may still hold answers
        # keyed on these codes, and deleting the question a stored answer refers to would leave a
        # submitted requirement describing a field nobody can look up.
        authored_codes = {code for code, *_ in questions}
        ServiceQuestion.objects.filter(variant=variant, is_active=True).exclude(
            code__in=authored_codes
        ).update(is_active=False)

        for order, (code, prompt, kind, required, minimum, options) in enumerate(
            questions,
            start=1,
        ):
            question, _ = ServiceQuestion.objects.update_or_create(
                variant=variant,
                code=code,
                defaults={
                    "prompt": prompt,
                    "help_text": QUESTION_HELP.get(code, ""),
                    "kind": kind,
                    "is_required": required,
                    "validation_rules": ({"minimum": minimum} if minimum is not None else {}),
                    "display_order": order,
                    "is_active": True,
                },
            )
            question.options.all().delete()
            if options is not None:
                for option_order, (option_code, option_label, option_description) in enumerate(
                    options,
                    start=1,
                ):
                    ServiceQuestionOption.objects.create(
                        question=question,
                        code=option_code,
                        label=option_label,
                        description=option_description,
                        display_order=option_order,
                        is_active=True,
                    )
        return variant

    @staticmethod
    def _seed_service_policies(
        *,
        service: Service,
        included: tuple[str, ...],
        excluded: tuple[str, ...],
    ) -> None:
        """The What's-included / What's-not page for a day-hire service.

        Same rewrite-on-every-run contract as `seed_task_catalog._seed_service_content`: the
        authored tuples above are the whole list, so a line removed there disappears from the
        page, and rows are deactivated rather than deleted because a policy line is the wording
        a customer was shown when they booked.
        """

        ServicePolicy.objects.filter(service=service).update(is_active=False)
        rows: list[tuple[str, str, int]] = [
            (ServicePolicy.Kind.INCLUDED, text, order)
            for order, text in enumerate(included, start=1)
        ]
        rows += [
            (ServicePolicy.Kind.EXCLUDED, text, order)
            for order, text in enumerate(excluded, start=1)
        ]
        rows.append(
            (
                ServicePolicy.Kind.GOOD_TO_KNOW,
                "You pay the crew directly after each day. Vsolve charges only the booking "
                "fee shown before you confirm.",
                1,
            )
        )
        for kind, text, order in rows:
            ServicePolicy.objects.update_or_create(
                service=service,
                kind=kind,
                display_order=order,
                defaults={"title": "", "text": text, "is_active": True},
            )

    @staticmethod
    def _seed_service_cover(*, service: Service, url: str, alt_text: str) -> None:
        """One verified COVER photo per service — same contract as `seed_task_catalog`'s.

        `(service, kind)` carries no unique constraint, so the first COVER row is updated in
        place rather than `update_or_create`, which would stack a twin on a rerun.
        """

        cover = (
            ServiceMedia.objects.filter(service=service, kind=ServiceMedia.Kind.COVER)
            .order_by("display_order", "id")
            .first()
        )
        if cover is None:
            ServiceMedia.objects.create(
                service=service,
                kind=ServiceMedia.Kind.COVER,
                url=url,
                alt_text=alt_text,
                display_order=1,
                is_active=True,
            )
            return
        # Never replace a cover that already has artwork — see `fill_blank_image`.
        fields: list[str] = []
        if not cover.url:
            cover.url = url
            fields.append("url")
        if cover.alt_text != alt_text:
            cover.alt_text = alt_text
            fields.append("alt_text")
        if not cover.is_active:
            cover.is_active = True
            fields.append("is_active")
        if fields:
            cover.save(update_fields=tuple(fields))

    # -- the owner-blocked configuration -----------------------------------

    def _seed_a3_configuration(
        self,
        *,
        variant: ServiceVariant,
        skill: Skill,
        preset_questions: tuple[QuestionSeed, ...],
        questions: tuple[QuestionSeed, ...],
    ) -> None:
        self._upsert_configuration(
            variant=variant,
            # The SAME tuple the catalogue publishes for this service, per the §7 rule:
            # the validation schema and screen one must always be derived from one table.
            # Hardcoding A3_QUESTIONS here would demand a `work_type` answer from services
            # whose form never asks one, refusing every submission.
            questions=questions,
            registration_questions=A3_REGISTRATION_QUESTIONS,
            extra={
                "wage_floor_skill": skill,
                # The quote-flow clocks stay set: revision 4 demoted that path to the thin-supply
                # fallback rather than deleting it, and a fallback with no SLA never closes.
                "first_quote_sla_hours": FIRST_QUOTE_SLA_HOURS,
                "quote_delivery_sla_hours": QUOTE_DELIVERY_SLA_HOURS,
                "max_quotes": MAX_QUOTES,
                "non_responsive_rejection_cap": NON_RESPONSIVE_REJECTION_CAP,
                # Wave C2R (revision 4). Every value below is read fail-closed by
                # `requirements.rate_cards`, so until they are written here the instant path
                # refuses with `m2_policy_unavailable` on every request — the preset schema and
                # the cascade policy are both consulted before the card itself is.
                #
                # Per service since 2026-08-26: the floor/lift/carry facts are shifting facts,
                # and publishing them on "Event staff by the day" asked about lifts at a
                # wedding. An empty tuple publishes `{"questions": []}` — a real preset with
                # nothing extra to ask — never `{}`, which `preset_question_schema` refuses.
                "a3_preset_question_schema": _question_schema(preset_questions),
                "crew_wave_size": CREW_WAVE_SIZE,
                "crew_wave_widening_step": CREW_WAVE_WIDENING_STEP,
                "crew_offer_timeout_seconds": CREW_OFFER_TIMEOUT_SECONDS,
                "crew_cascade_max_waves": CREW_CASCADE_MAX_WAVES,
                "crew_offer_hold_seconds": CREW_OFFER_HOLD_SECONDS,
                "crew_decline_alarm_basis_points": CREW_DECLINE_ALARM_BASIS_POINTS,
                "crew_decline_alarm_min_offers": CREW_DECLINE_ALARM_MIN_OFFERS,
                "booking_fee_free_cancel_hours": BOOKING_FEE_FREE_CANCEL_HOURS,
                "booking_fee_travel_compensation_basis_points": (
                    BOOKING_FEE_TRAVEL_COMPENSATION_BASIS_POINTS
                ),
                # Wave C4. Four columns whose readers are `requirements.workforce` and
                # `partners.standing`; without a writer here the retroactive overtime request
                # answers `m2_policy_unavailable` in every environment and no standing pattern can
                # ever be evaluated. Every configuration column M2 adds gets a writer in this
                # command — that rule is what the C2R post-mortem cost.
                "overtime_retroactive_window_minutes": OVERTIME_RETROACTIVE_WINDOW_MINUTES,
                "crew_shortfall_standing_threshold": CREW_SHORTFALL_STANDING_THRESHOLD,
                "cash_demand_removal_threshold": CASH_DEMAND_REMOVAL_THRESHOLD,
                "vendor_standing_window_days": VENDOR_STANDING_WINDOW_DAYS,
                **_C6_RECOVERY_POLICY,
            },
        )

    def _seed_a5_configuration(
        self,
        *,
        variant: ServiceVariant,
        questions: tuple[QuestionSeed, ...],
    ) -> None:
        self._upsert_configuration(
            variant=variant,
            # Per project, per the §7 rule — the fit-out's questions hardcoded here would
            # demand `fit_out_style` from a bathroom renovation whose brief never asks it,
            # refusing the submission its own first screen collected.
            questions=questions,
            registration_questions=(),
            extra={
                # Reconfirmation reuses `first_quote_sla_hours`, so an A5 variant needs it too —
                # without it a selected vendor has no deadline and `reconfirm_by` is null.
                "first_quote_sla_hours": FIRST_QUOTE_SLA_HOURS,
                "quote_delivery_sla_hours": QUOTE_DELIVERY_SLA_HOURS,
                "max_quotes": MAX_QUOTES,
                "non_responsive_rejection_cap": NON_RESPONSIVE_REJECTION_CAP,
                "visit_duration_minutes": VISIT_DURATION_MINUTES,
                "first_visit_sla_hours": FIRST_VISIT_SLA_HOURS,
                "visit_plan_fill_sla_hours": VISIT_PLAN_FILL_SLA_HOURS,
                "post_visit_estimate_window_hours": POST_VISIT_ESTIMATE_WINDOW_HOURS,
                "customer_no_show_refunds_platform_share": (
                    CUSTOMER_NO_SHOW_REFUNDS_PLATFORM_SHARE
                ),
                "commission_basis_points": COMMISSION_BASIS_POINTS,
                "commission_treatment": COMMISSION_TREATMENT,
                # Wave C5. Two columns whose reader is `requirements.pricing.warranty_terms`, and
                # without a writer here every A5 estimate that promises a warranty is refused at
                # the composer with `m2_policy_unavailable` — which is the correct fail-closed
                # behaviour and an undemonstrable one. Every configuration column M2 adds gets a
                # writer in this command; that rule is what the C2R post-mortem cost.
                "warranty_retention_basis_points": WARRANTY_RETENTION_BASIS_POINTS,
                "warranty_window_days": WARRANTY_WINDOW_DAYS,
                # Wave C6's five, on **both** archetypes. A case, an appeal and a chargeback are
                # not A3 facts: an A5 project is exactly where a disputed milestone and a
                # chargeback on a visit plan happen, and writing these on one configuration only
                # would have made half the recovery surface refuse in the half of the demo where
                # it matters most.
                **_C6_RECOVERY_POLICY,
            },
        )

    @staticmethod
    def _upsert_configuration(
        *,
        variant: ServiceVariant,
        questions: tuple[QuestionSeed, ...],
        registration_questions: tuple[QuestionSeed, ...],
        extra: dict[str, Any],
    ) -> M2VariantConfiguration:
        """One ACTIVE configuration per variant, at version 1, updated in place on a rerun.

        Deliberately not a new version each run. `catalog_unique_active_m2_variant_configuration`
        permits exactly one ACTIVE row per variant, and a rerun that appended a version would have
        to retire the previous one — turning an idempotent seed into a migration of its own
        history for no benefit, since nothing here is a decision anybody quoted against.

        The three Wave C3 clocks are set on **both** archetypes: a stage is a shift-day on A3 and a
        milestone on A5, and the review, payout-hold and amendment windows apply to both spines.
        """
        configuration, _ = M2VariantConfiguration.objects.update_or_create(
            variant=variant,
            version=1,
            defaults={
                "status": M2VariantConfiguration.Status.ACTIVE,
                "question_schema": _question_schema(questions),
                "registration_question_schema": (
                    _question_schema(registration_questions) if registration_questions else {}
                ),
                "stage_review_window_hours": STAGE_REVIEW_WINDOW_HOURS,
                "stage_payout_hold_hours": STAGE_PAYOUT_HOLD_HOURS,
                "amendment_response_hours": AMENDMENT_RESPONSE_HOURS,
                **extra,
            },
        )
        return configuration

    def _seed_wage_floor(self, *, skill: Skill, seed: DaySeed) -> bool:
        existing = MinimumWageFloor.objects.filter(
            state_code=STATE_CODE,
            skill=skill,
            effective_from=DEV_SEED_EFFECTIVE_FROM,
        ).first()
        label = f"minimum wage floor {STATE_CODE}/{skill.code}"
        if not self._may_overwrite(
            existing_reference=None if existing is None else existing.source_reference,
            label=label,
        ):
            return False
        MinimumWageFloor.objects.update_or_create(
            state_code=STATE_CODE,
            skill=skill,
            effective_from=DEV_SEED_EFFECTIVE_FROM,
            defaults={
                "floor_paise_per_day": seed.wage_floor_paise,
                "source_reference": (
                    f"{DEV_SEED_MARKER}. Owner decision 7: the statutory floor source and its "
                    "enforcement per state and skill are unresolved. No gazette was consulted."
                ),
            },
        )
        return True

    def _seed_rate_card(self, *, area: ServiceArea, skill: Skill, seed: DaySeed) -> bool:
        """The A3 published day rate — the row without which the instant path is shut.

        Published through `rate_cards.publish_rate_card` rather than written straight to the
        table, deliberately: that is where the wage-floor guard lives, and a seed that bypassed
        it could write a card below the floor and leave the guard looking green. Going through
        the command means the seed is held to the rule Operations is held to — if
        `RATE_CARD_WORKER_DAY_WAGE_PAISE` ever drops under `WAGE_FLOOR_PAISE_PER_DAY`, this
        raises rather than seeding an illegal card.

        `actor=None` because no Operations user performed this; the source reference carries the
        dev-seed marker so a real published card is never mistaken for one of these.
        """
        existing = RateCard.objects.filter(
            service_area=area,
            skill=skill,
            effective_from=DEV_SEED_EFFECTIVE_FROM,
        ).first()
        label = f"rate card {area.slug}/{skill.code}"
        if not self._may_overwrite(
            existing_reference=None if existing is None else existing.source_reference,
            label=label,
        ):
            return False
        # Already published, and identical. Re-publishing would be a no-op with a side effect:
        # `publish_rate_card` refuses a card whose effective date is covered by a live booking, so
        # the second run of an "idempotent" seed failed hard the moment anybody had booked at this
        # rate — which is every environment the seed is useful in. Skipping an unchanged card keeps
        # the guard doing its real job, which is catching a *changed* price landing under live work.
        if existing is not None and _matches_seeded_rate(existing, seed):
            self.stdout.write(f"  {label}: already published, unchanged")
            return True
        publish_rate_card(
            service_area_id=area.id,
            skill_id=skill.id,
            worker_day_wage_paise=seed.worker_day_wage_paise,
            supervision_margin_paise=seed.supervision_margin_paise,
            booking_fee_paise=RATE_CARD_BOOKING_FEE_PAISE,
            standard_day_hours=RATE_CARD_STANDARD_DAY_HOURS,
            overtime_hourly_paise=seed.overtime_hourly_paise,
            # The card's own words, per trade: the printed inclusions surface verbatim on
            # the customer's live-rate screen, and "loading and unloading" on an event-staff
            # rate was this table's most visible lie.
            inclusions=list(seed.rate_inclusions),
            add_on_rates=dict(seed.add_on_rates),
            effective_from=DEV_SEED_EFFECTIVE_FROM,
            actor=None,
            source_reference=(
                f"{DEV_SEED_MARKER}. Owner decisions 12 and 13: ADR-0009 seeds a real card from "
                "an Operations phone survey of ten to fifteen contractors per launch city. No "
                "contractor was called; every component here is invented."
            ),
        )
        return True

    def _seed_access_prices(self) -> tuple[int, int]:
        """The A3 unlock and the three A5 visit tiers, all marked as inventions.

        `M2AccessPrice` is the table that decides whether anything can be sold at all. Until a row
        exists in it, `pricing.unlock_price` and `pricing.visit_plan_price` refuse with
        `m2_access_price_unavailable` and both front doors are shut.
        """
        rows: list[tuple[str, int, int, int | None, str]] = [
            (
                M2AccessPrice.Kind.A3_QUOTE_UNLOCK,
                0,
                A3_UNLOCK_PAISE,
                None,
                "README.md proposes INR 149 for the A3 quote unlock. Owner decision 1; the tax "
                "treatment of the fee is owner decision 5.",
            )
        ]
        rows.extend(
            (
                M2AccessPrice.Kind.A5_VISIT_PLAN,
                plan_size,
                amount,
                A5_VENDOR_PAYOUT_BASIS_POINTS,
                f"README.md proposes INR {amount // 100} for the {plan_size}-visit tier. The "
                "60/40 vendor-payout split is invented here; owner decision 1 covers both.",
            )
            for plan_size, amount in sorted(A5_TIER_PAISE.items())
        )

        written = 0
        skipped = 0
        for kind, plan_size, amount, basis_points, note in rows:
            existing = M2AccessPrice.objects.filter(
                kind=kind,
                plan_size=plan_size,
                effective_from=DEV_SEED_EFFECTIVE_FROM,
            ).first()
            if not self._may_overwrite(
                existing_reference=None if existing is None else existing.source_reference,
                label=f"access price {kind}/{plan_size}",
            ):
                skipped += 1
                continue
            M2AccessPrice.objects.update_or_create(
                kind=kind,
                plan_size=plan_size,
                effective_from=DEV_SEED_EFFECTIVE_FROM,
                defaults={
                    "amount_paise": amount,
                    "vendor_payout_basis_points": basis_points,
                    "source_reference": f"{DEV_SEED_MARKER}. {note}"[:200],
                },
            )
            written += 1
        return written, skipped

    # -- vendors -----------------------------------------------------------

    def _seed_vendors(
        self,
        *,
        area: ServiceArea,
        variants: tuple[ServiceVariant, ...],
        skills: tuple[Skill, ...],
        count: int,
    ) -> list[str]:
        """Approved A3 and A5 vendors, with everything matching actually filters on.

        Six things, and every one of them excludes a vendor silently when it is missing:

        * an **approved `PartnerApplication`** with its documents and consents —
          `assert_kyc_complete` gates the first accept, and the verification badge reads it;
        * an **approved `PartnerCapability`** per variant, walked through the real review
          transitions rather than written at `APPROVED`, so the trail says a decision happened;
        * a **`PartnerServiceArea`** and a **`PartnerAvailabilityRule`** per weekday — the second is
          what `carts.availability` reads, and an empty rule set means unavailable there, so without
          it every A5 visit slot renders `NO_CAPACITY`;
        * a **`PartnerOnlineSession` inside the responsiveness window** — `matching` excludes a
          vendor who has not been online in 21 days, which is the least obvious of these and the
          one that makes a fully configured pool return nobody;
        * a **crew roster** big enough for the requested headcount, or A3 matching excludes them
          with `crew_too_small`;
        * a **`PartnerBusinessProfile`**, because `vendor_type` on every teaser and vendor card
          reads it and an agency with none renders as an individual.
        """
        partner_role, _ = Role.objects.get_or_create(
            code="partner",
            defaults={"name": "Partner", "is_system": True},
        )
        phones: list[str] = []
        for index in range(1, count + 1):
            phone = f"{PHONE_PREFIX}{index:05d}"
            phones.append(phone)
            display_name = f"M2 Demo Vendor {index}"
            user, _ = User.objects.update_or_create(
                phone_number=phone,
                defaults={"full_name": display_name},
            )
            # Session login grants `customer` and never `partner`; that grant is made by the real
            # application flow, which writing these rows directly skips entirely.
            UserRole.objects.update_or_create(
                user=user,
                role=partner_role,
                defaults={"revoked_at": None},
            )
            partner, _ = PartnerProfile.objects.update_or_create(
                user=user,
                defaults={
                    "display_name": display_name,
                    "biography": "Seeded M2 vendor for local development.",
                    "experience_years": 6,
                },
            )
            application, _ = PartnerApplication.objects.update_or_create(
                partner=partner,
                defaults={"status": PartnerApplication.Status.APPROVED},
            )
            self._accept_current_consents(partner)
            self._approve_required_documents(application)

            PartnerBusinessProfile.objects.update_or_create(
                partner=partner,
                defaults={
                    "business_type": (
                        PartnerBusinessProfile.BusinessType.WORKFORCE_AGENCY
                        if index % 2
                        else PartnerBusinessProfile.BusinessType.PROJECT_VENDOR
                    ),
                    "legal_name": f"{display_name} Services LLP",
                    "years_in_operation": 6,
                    # `M2-BE-536`: the evening settlement link needs somewhere to point. Blank is
                    # a legitimate production state — the amount is shown either way and the crew
                    # is paid the way they were paid before this app — but a demo with no VPA
                    # anywhere never renders the link at all, so the walkthrough cannot see it.
                    "upi_vpa": f"m2demo{index}@{DEMO_UPI_VPA_DOMAIN}",
                },
            )
            for vendor_skill in skills:
                PartnerSkill.objects.update_or_create(
                    partner=partner,
                    skill=vendor_skill,
                    defaults={"is_active": True},
                )
            PartnerLanguage.objects.update_or_create(
                partner=partner,
                language_tag="en",
                defaults={"is_active": True},
            )
            PartnerServiceArea.objects.update_or_create(
                partner=partner,
                service_area=area,
                defaults={"is_active": True},
            )
            for weekday in range(7):
                PartnerAvailabilityRule.objects.update_or_create(
                    partner=partner,
                    service_area=area,
                    weekday=weekday,
                    defaults={
                        "starts_at": SHIFT_START,
                        "ends_at": SHIFT_END,
                        "is_active": True,
                    },
                )
            for variant in variants:
                PartnerService.objects.update_or_create(
                    partner=partner,
                    variant=variant,
                    defaults={"is_active": True},
                )
                self._approve_capability(partner=partner, variant=variant)

            self._record_recent_presence(partner=partner, area=area)
            self._seed_payout_account(partner=partner)
            self._seed_crew(partner=partner, index=index)
            if index == 1:
                # One case on one vendor, not one per vendor. A queue seeded three deep with three
                # copies of the same complaint teaches an operator that the queue is noise.
                self._seed_operations_queue(partner=partner)
        return phones

    def _seed_operations_queue(self, *, partner: PartnerProfile) -> bool:
        """One case to work, one held payout, and a queue with something in it (`M2-BE-703`, `709`).

        Wave C6 publishes an Operations workspace whose every screen renders an empty state until
        somebody disputes something, and an empty workspace is one nobody can review. So the seed
        writes exactly one case — about a **Partner**, which needs no requirement, no engagement
        and no fabricated booking behind it — and lets the ordinary command do the rest.

        `open_case` is used rather than `OperationsCase.objects.create`, deliberately: it routes
        the case to its owning team from the ownership table, stamps the severity SLA, writes the
        `OPENED` event and sets `holds_payout` from the kind. A hand-built row would be a row the
        real commands had never touched, which is exactly the fixture that passes a demo and fails
        the first time somebody clicks Resolve.

        The idempotency key is derived from the partner, so a rerun finds the case it already
        opened rather than filling the queue with copies of one complaint.

        It writes **no** demo refund and **no** demo chargeback. Both would need a captured
        `PaymentAttempt` behind them, and a seeded payment that no provider ever saw is a row the
        reconciliation sweep would immediately and correctly report as a mismatch — a fixture that
        breaks the surface it was written to demonstrate. The refund and chargeback screens are
        reached by walking the smoke script instead, which is what
        `docs/runbooks/m2-recovery-smoke.md` is for.
        """
        existing = OperationsCase.objects.filter(
            idempotency_key=f"{DEV_SEED_MARKER}:case:{partner.id}"
        ).first()
        if existing is not None:
            return False
        case = open_case(
            kind=DEMO_CASE_KIND,
            summary=DEMO_CASE_SUMMARY,
            severity=OperationsCase.Severity.NORMAL,
            partner_id=partner.id,
            detail=DEMO_CASE_DETAIL,
            # No response deadline: a partner-subject case has no requirement to read a variant
            # window from, and inventing one here would put a deadline on the board that no
            # configuration produced.
            response_due_at=None,
            idempotency_key=f"{DEV_SEED_MARKER}:case:{partner.id}",
        )
        # No seeded note. `add_case_note` requires a real actor and the seed has no operator to
        # attribute one to; a note signed by nobody is worse in an audit trail than no note.
        self.stdout.write(f"  Case       : {case.id} ({case.kind}, holds payout)")
        return True

    @staticmethod
    def _seed_payout_account(*, partner: PartnerProfile) -> None:
        """A verified payout account, so an earned M2 payout can actually become payable.

        `payouts.payable_account` is the progressive gate every M2 payout release consults — the
        visit share, the approved stage and the warranty retention — and until this existed no
        seed wrote one, so every demo earning stopped at `PENDING`. The walkthrough could show a
        vendor *earning* their share of a consumed visit and never show it becoming payable, which
        is the half of `07-state-machines-and-permissions.md` §4a that the split percentage is
        for.

        Idempotent on the partner, and it never disturbs an account somebody added by hand: a
        Partner with any account already is left completely alone, because replacing one is the
        exact event an account-takeover investigation starts from and a seed has no business
        simulating it.
        """
        if PartnerPayoutAccount.objects.filter(partner=partner).exists():
            return
        PartnerPayoutAccount.objects.create(
            partner=partner,
            status=PartnerPayoutAccount.Status.VERIFIED,
            account_last4=PAYOUT_ACCOUNT_LAST4,
            ifsc=PAYOUT_ACCOUNT_IFSC,
            holder_name=partner.display_name,
            verified_at=timezone.now(),
            # Backdated past the cooling period on purpose. The cooling delay is a real control
            # and is not being weakened — it is simply already over for an account created a week
            # ago, and a walkthrough that had to wait it out would test the developer's patience
            # rather than the platform.
            effective_from=timezone.now() - timedelta(days=7),
        )

    @staticmethod
    def _approve_capability(*, partner: PartnerProfile, variant: ServiceVariant) -> None:
        """Walk a capability through the real review transitions, not straight to `APPROVED`.

        `transition_capability` stamps the reviewer and writes a `PartnerCapabilityTransition`, so
        the capability's own audit trail says a decision was taken. Writing the status directly
        would produce a capability the domain calls approved with no record of anybody approving
        it, which is the trap `seed_test_partner`'s docstring already describes for applications.
        """
        existing = PartnerCapability.objects.filter(
            partner=partner,
            variant=variant,
            status__in=PartnerCapability.ACTIVE_STATUSES,
        ).first()
        if existing is not None:
            if existing.status != PartnerCapability.Status.APPROVED:
                transition_capability(
                    capability_id=existing.id,
                    to_status=PartnerCapability.Status.UNDER_REVIEW,
                    actor=None,
                    reason_code="dev_seed",
                )
                transition_capability(
                    capability_id=existing.id,
                    to_status=PartnerCapability.Status.APPROVED,
                    actor=None,
                    reason_code="dev_seed",
                )
            return

        is_a3 = variant.booking_archetype == ServiceVariant.BookingArchetype.A3_TIME_BLOCK
        capability = request_capability(
            partner=partner,
            variant=variant,
            max_crew_size=20 if is_a3 else None,
            max_project_value_paise=None if is_a3 else 50_000_000,
            registration_answers=dict(A3_REGISTRATION_ANSWERS) if is_a3 else None,
        )
        transition_capability(
            capability_id=capability.id,
            to_status=PartnerCapability.Status.UNDER_REVIEW,
            actor=None,
            reason_code="dev_seed",
        )
        transition_capability(
            capability_id=capability.id,
            to_status=PartnerCapability.Status.APPROVED,
            actor=None,
            reason_code="dev_seed",
        )

    @staticmethod
    def _record_recent_presence(*, partner: PartnerProfile, area: ServiceArea) -> None:
        """One closed session inside the responsiveness window.

        `matching` excludes a vendor with no `PartnerOnlineSession` started in the last 21 days —
        every wave sent to a dead account burns the SLA clock — and no existing seed command writes
        one. The session is **closed**, because `partners_unique_active_online_session` permits one
        open session per Partner and leaving a fake one open would make the vendor look present to
        A1 dispatch as well.
        """
        started = timezone.now() - timedelta(days=1)
        if partner.online_sessions.filter(started_at__gte=started - timedelta(minutes=1)).exists():
            return
        PartnerOnlineSession.objects.create(
            partner=partner,
            service_area=area,
            started_at=started,
            last_persisted_heartbeat_at=started + timedelta(hours=1),
            ended_at=started + timedelta(hours=1),
            end_reason=PartnerOnlineSession.EndReason.PARTNER_OFFLINE,
        )

    @staticmethod
    def _seed_crew(*, partner: PartnerProfile, index: int) -> None:
        """A roster big enough for the demo's headcount, through the real roster command.

        `add_crew_to_roster` resolves each worker to a global `CrewMember` by a keyed hash of their
        number, which is what stops one person being double-booked through two agencies. Reusing it
        means these rows are indistinguishable from ones a Partner added, including the phone
        suffix that makes two people called Ramesh tellable apart.

        **`documents_verified_at` is stamped here, and it is a raw field write on purpose.**

        That column has four readers and, before this, no writer anywhere in the codebase:
        `crew_dispatch` counts only verified memberships when it sizes a lead's roster against the
        headcount, `workforce.assign_crew` refuses an unverified worker outright, and the crew rows
        on both apps publish a verification badge from it. With nothing setting it, **every
        vendor's verified roster was zero in every environment** — so the cascade excluded every
        lead, `accept_crew_offer` answered `m2_roster_insufficient`, `assign_crew` refused every
        membership, and the A3 rate-card walkthrough this whole revision exists for could not
        reach its third step.

        The honest writer is an Operations "verify crew documents" command with an actor, an audit
        trail and a permission behind it. That is a real reviewed surface and it belongs in Wave
        C6 with the rest of the Operations APIs; it is logged in `frontend-execution-plan.md` §7
        and is deliberately **not** built here. What is legitimate in the meantime is this: a
        dev-only seed, already behind three guards, writing a dev-only fixture and saying so. The
        alternative was a walkthrough with a shell workaround in its first paragraph.
        """
        verified_at = timezone.now()
        for worker in range(1, 7):
            phone = f"+9170302{index:02d}{worker:03d}"
            change = add_crew_to_roster(
                partner=partner,
                display_name=f"Worker {index}-{worker}",
                phone_e164=phone,
                is_supervisor=worker == 1,
            )
            membership = change.membership
            if membership.documents_verified_at is None:
                membership.documents_verified_at = verified_at
                membership.save(update_fields=("documents_verified_at",))

    @staticmethod
    def _accept_current_consents(partner: PartnerProfile) -> None:
        """Mirrors `seed_trade_partners._accept_current_consents`.

        The receipt points at the document row rather than repeating its version, because
        `_required_consents_exist` compares document ids. `request_ip_hash` and `device_hash` stay
        blank on purpose: those record where a real acceptance came from, and inventing them would
        forge the provenance of a legal receipt.
        """
        for document in PartnerConsentDocument.objects.filter(
            is_current=True,
            is_required_for_submission=True,
            retired_at__isnull=True,
        ):
            PartnerConsent.objects.update_or_create(
                partner=partner,
                purpose=document.purpose,
                document_version=document.document_version,
                defaults={"document": document, "withdrawn_at": None},
            )

    @staticmethod
    def _approve_required_documents(application: PartnerApplication) -> None:
        """Mirrors `seed_trade_partners._approve_required_documents`.

        One row per required kind at a fixed version, so a rerun updates in place: eligibility
        reads the *latest* version, and a stacked duplicate would decide the outcome by insertion
        order.
        """
        now = timezone.now()
        for kind in settings.PARTNER_REQUIRED_DOCUMENT_KINDS:
            PartnerDocument.objects.update_or_create(
                application=application,
                kind=kind,
                version=SEED_DOCUMENT_VERSION,
                defaults={
                    "object_key": f"seed/non-production/{kind.lower()}.txt",
                    "content_type": "text/plain",
                    "size_bytes": 1,
                    "sha256": "0" * 64,
                    "scan_status": PartnerDocument.ScanStatus.CLEAN,
                    "scanned_at": now,
                    "status": PartnerDocument.Status.APPROVED,
                    "reviewed_at": now,
                    "review_reason": "Seeded local fixture; no document was uploaded or reviewed.",
                },
            )

    # -- report ------------------------------------------------------------

    def _report(
        self,
        *,
        wage_floors_written: int,
        rate_cards_published: int,
        prices_written: int,
        prices_skipped: int,
        vendors: list[str],
    ) -> None:
        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("M2 demo configuration loaded."))
        for day in A3_DAY_SEEDS:
            day_rate_paise = (
                day.worker_day_wage_paise
                + day.supervision_margin_paise
                + RATE_CARD_BOOKING_FEE_PAISE
            )
            self.stdout.write(
                f"  A3 service : /{day.slug}  INR {day_rate_paise / 100:.0f} per worker per "
                f"{RATE_CARD_STANDARD_DAY_HOURS}-hour day ({day.category_slug})"
            )
        self.stdout.write(
            f"  A3 unlock  : INR {A3_UNLOCK_PAISE / 100:.0f} on the thin-supply fallback; "
            f"{wage_floors_written} wage floors and {rate_cards_published} rate cards written "
            "(the rest were real rows, left alone)"
        )
        tiers = ", ".join(
            f"{size}x INR {A5_TIER_PAISE[size] / 100:.0f}" for size in sorted(A5_TIER_PAISE)
        )
        self.stdout.write(f"  A5 tiers   : visit plans {tiers}, on every project below")
        for project in A5_PROJECT_SEEDS:
            self.stdout.write(f"  A5 service : /{project.slug}  ({project.subcategory_name})")
        self.stdout.write(f"  Area       : {SERVICE_AREA_SLUG} / PIN {POSTAL_CODE} / {STATE_CODE}")
        self.stdout.write(f"  Vendors    : {', '.join(vendors)}")
        self.stdout.write(
            f"  Prices     : {prices_written} written, {prices_skipped} left alone as real values"
        )
        self.stdout.write("")
        self.stdout.write(
            self.style.WARNING(
                "Every money value, clock and cap above is a PLACEHOLDER standing in for an open "
                "owner decision (task.md P0). They are marked in source_reference as "
                f"{DEV_SEED_MARKER!r}. Do not quote them to anybody."
            )
        )
        self.stdout.write("  Runbook: docs/runbooks/m2-demo-seed.md")
