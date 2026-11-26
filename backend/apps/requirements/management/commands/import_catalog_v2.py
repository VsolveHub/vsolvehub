"""Add the Version 2 catalogue: eight construction trades by the day and the Event & Media services.

Source of truth: the "Services" sheet of ``V Solve Hub-Categories & Sub Categories (2).xlsx``
(15 November 2026) and ``exports/2026-11-15-catalog-pictures/V2-pictures.md``, whose photo and
tile file names this command uses unchanged.

    python manage.py import_catalog_v2            # preview, writes nothing
    python manage.py import_catalog_v2 --apply

**Construction labour.** Eight trades join "Construction helpers" in the Construction labour tile,
each hired by the day (A3) at a published day rate. The other five trades in the sheet are already
on sale: Helper (Construction helpers), Painter (Painter by the day), Tile Worker (Tiling &
flooring work), Demolition Labour (Demolition & debris removal) and Waterproofing Worker (Terrace &
bathroom waterproofing). Each trade gets:

- the service, with the trade as its dispatch skill and wage classification, and its photo;
- the questions the day-hire booking screen needs: what work (the sheet's tasks for that trade),
  how many people and how many days;
- the whole configuration of "Construction helpers" in the same database, except the questions,
  the wage classification and the shifting extras, which are a helper's and not a trade's;
- a day rate in every area helpers are sold in. The worker's wage is the lowest day rate in the
  sheet for that trade; the supervision margin, booking fee and day length are the live helpers
  card's in that area, and the overtime is the helpers overtime scaled by the wage. A trade that
  already has a card in an area keeps it: after the first publish the price is Operations'.
- where the trade has no minimum-wage floor in a state yet, the helpers (unskilled) floor, marked
  as copied. A day rate cannot be published without a floor, and the unskilled floor is the lowest
  any worker may be paid; Operations replaces it with the gazette figure for the trade.

**Event & Media.** Eight tiles join the Events category (Decoration and Catering are already
there) with 84 services, each priced on site (A5) like "Event lighting & decor", whose whole
configuration and service areas they copy. The sheet's ranges are per event, per session and so
on, so the card states the range and the professional consults and quotes in writing. Two rows are
not services: "Site Visit & Consultation" and "Event Consultation" are the visit every
priced-on-site booking already starts with.

**Photos.** A photo is linked only once it opens on the media domain, so nothing points at a file
that is not there. Rerun the command after more photos are uploaded and it links them.

Safe to run again: a rerun updates the authored text, never re-activates a service or tile that
Operations paused or hid, never republishes a day rate and never stacks a second cover photo.
"""

import re
from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import date
from typing import Any
from urllib.error import URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError, CommandParser
from django.db import transaction
from django.db.models import Max
from django.utils import timezone

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
from apps.identity.models import User
from apps.locations.models import ServiceArea, ServiceAreaService
from apps.partners.capabilities import live_wage_floor
from apps.partners.exceptions import PartnerDomainError, WageFloorUnsetError
from apps.partners.models import MinimumWageFloor, PartnerCapability, Skill
from apps.requirements.exceptions import RequirementDomainError
from apps.requirements.models import RateCard
from apps.requirements.rate_cards import live_rate_card, publish_rate_card

#: Where the photos live when ``R2_PUBLIC_BASE_URL`` is not set (a fresh developer machine).
MEDIA_FALLBACK = "https://media.vsolvehub.com"
#: Bucket folders, as V2-pictures.md ("Uploading") names them. Tiles must sit under
#: "Service Cover", which is how the customer app knows to draw them as artwork, not photos.
PHOTO_ROOT = "Images/catalog-v2"
TILE_ROOT = "Images/Service Cover/tiles-v2"
PHOTO_CHECK_TIMEOUT_SECONDS = 10
#: The media domain sits behind Cloudflare, which answers Python's default "Python-urllib"
#: agent with 403 for every file, so without a name of its own the check saw no photo at all.
PHOTO_CHECK_USER_AGENT = "vsolvehub-catalog-import/2"

A3 = ServiceVariant.BookingArchetype.A3_TIME_BLOCK
A5 = ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT

CONSTRUCTION_CATEGORY = "construction"
CONSTRUCTION_TILE = "construction-labour"
A3_SIBLING = "construction-helpers"
EVENTS_CATEGORY = "events"
A5_SIBLING = "event-lighting-decor"

WORK_TYPE_CODE = "work_type"
HEADCOUNT_CODE = "worker_count"
DURATION_CODE = "duration_days"

#: Every configuration column a new service copies from its sibling: all of them except identity,
#: lifecycle and the ones each import sets for itself.
_CONFIG_NOT_COPIED = frozenset(
    {
        "id",
        "variant",
        "version",
        "status",
        "question_schema",
        "pricing_skill_code",
        "created_by",
        "created_at",
    }
)
#: An A3 trade also sets its own wage classification and preset. The helpers preset asks about
#: floors, lifts and carrying distance, the facts that price shifting work and not a mason's day.
_A3_CONFIG_NOT_COPIED = _CONFIG_NOT_COPIED | {"wage_floor_skill", "a3_preset_question_schema"}
#: The day-hire settings the instant booking path reads fail-closed. The trades copy them from
#: the helpers, so an empty one there leaves every trade unbookable too, and the preview says so.
A3_BOOKING_SETTINGS = (
    "crew_wave_size",
    "crew_wave_widening_step",
    "crew_offer_timeout_seconds",
    "crew_cascade_max_waves",
    "crew_offer_hold_seconds",
    "crew_decline_alarm_basis_points",
    "crew_decline_alarm_min_offers",
    "booking_fee_free_cancel_hours",
    "booking_fee_travel_compensation_basis_points",
)

_SCHEMA_KIND: dict[str, str] = {
    ServiceQuestion.Kind.SINGLE_CHOICE: "SELECT",
    ServiceQuestion.Kind.NUMBER: "INTEGER",
}


def slugify(text: str) -> str:
    """The V2-pictures.md rule: lower case, "&" read as a space, anything else becomes a dash."""
    return re.sub(r"[^a-z0-9]+", "-", text.lower().replace("&", " ")).strip("-")


def photo_is_live(url: str) -> bool:
    """Whether the file opens on the media domain. Any failure counts as not there yet."""
    if not url.startswith("https://"):
        return False
    # The URL is built from `R2_PUBLIC_BASE_URL` and the authored paths below, never from input,
    # and the scheme is checked above, so S310's file:// concern cannot arise.
    request = Request(  # noqa: S310
        url, method="HEAD", headers={"User-Agent": PHOTO_CHECK_USER_AGENT}
    )
    try:
        with urlopen(request, timeout=PHOTO_CHECK_TIMEOUT_SECONDS) as response:  # noqa: S310
            return 200 <= int(response.status) < 300  # noqa: PLR2004
    except (URLError, OSError, ValueError):
        return False


def _joined(items: tuple[str, ...]) -> str:
    if len(items) == 1:
        return items[0]
    return f"{', '.join(items[:-1])} and {items[-1]}"


# ---------------------------------------------------------------------------
# Construction labour: the eight trades
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Trade:
    """One construction trade hired by the day."""

    name: str
    #: One worker, in a sentence: "a verified {noun}".
    noun: str
    #: The headcount stepper's label.
    people: str
    #: The lowest day rate in the sheet for this trade, in rupees: the worker's wage on the card.
    wage_rupees: int
    #: The highest, for the preview to show beside the published rate.
    sheet_high_rupees: int
    #: The sheet's task rows, offered as "What will they be doing?".
    tasks: tuple[str, ...]

    @property
    def slug(self) -> str:
        return slugify(self.name)

    @property
    def photo(self) -> str:
        return f"construction-labour/{self.slug}.jpeg"

    @property
    def wage_paise(self) -> int:
        return self.wage_rupees * 100

    @property
    def variant_name(self) -> str:
        return f"{self.noun[0].upper()}{self.noun[1:]} by the day"

    @property
    def short_description(self) -> str:
        shown = (
            f"{', '.join(self.tasks[:3])} and more"
            if len(self.tasks) > 3  # noqa: PLR2004
            else _joined(self.tasks)
        )
        return f"{self.people} by the day for your site: {shown}."

    @property
    def included(self) -> tuple[str, ...]:
        return (
            f"One full working day per {self.noun}.",
            f"The work you pick when you book: {_joined(self.tasks)}.",
        )

    @property
    def excluded(self) -> tuple[str, ...]:
        return (
            "Materials and consumables. You buy them, or the crew buys them with your approval.",
        )

    def card_inclusions(self, *, day_hours: int) -> list[str]:
        """The words printed on the day rate, which the customer sees beside the price."""
        return [
            f"One {day_hours}-hour working day per {self.noun}.",
            f"{self.name} work as you direct it on site.",
            "Overtime is charged only after you approve it in the app.",
        ]


TRADES: tuple[Trade, ...] = (
    Trade(
        "Mason",
        "mason",
        "Masons",
        900,
        1_800,
        (
            "Brick Work",
            "Block Work",
            "Plastering Work",
            "Tile Fixing",
            "Stone Work",
            "Concrete Work",
            "Repair Work",
            "Compound Wall Construction",
            "Drain Construction",
            "PCC Work",
        ),
    ),
    Trade(
        "Shuttering Carpenter",
        "shuttering carpenter",
        "Shuttering carpenters",
        900,
        1_500,
        (
            "Footing Shuttering",
            "Column Shuttering",
            "Beam Shuttering",
            "Slab Centering",
            "Staircase Shuttering",
            "Formwork Dismantling",
            "Scaffolding Support",
            "Retaining Wall Shuttering",
        ),
    ),
    Trade(
        "Bar Bending (Steel Work)",
        "bar bender",
        "Bar benders",
        900,
        1_400,
        (
            "Steel Cutting",
            "Steel Bending",
            "Steel Binding",
            "Footing Reinforcement",
            "Column Reinforcement",
            "Beam Reinforcement",
            "Slab Reinforcement",
            "Staircase Reinforcement",
        ),
    ),
    Trade(
        "Concrete Labour",
        "concrete worker",
        "Concrete workers",
        600,
        900,
        (
            "Concrete Mixing",
            "Concrete Pouring",
            "Vibrator Support",
            "Surface Levelling",
            "Concrete Finishing",
            "Water Curing",
        ),
    ),
    Trade(
        "Welding Worker",
        "welder",
        "Welders",
        1_000,
        1_800,
        (
            "Gate Welding",
            "Steel Structure Welding",
            "Railing Welding",
            "Grill Welding",
            "Fabrication Welding",
        ),
    ),
    Trade(
        "Fabrication Worker",
        "fabricator",
        "Fabricators",
        1_000,
        2_200,
        (
            "Steel Fabrication",
            "Shed Fabrication",
            "Structural Fabrication",
            "Industrial Fabrication",
        ),
    ),
    Trade(
        "Scaffolding Worker",
        "scaffolding worker",
        "Scaffolding workers",
        800,
        1_300,
        ("Scaffolding Erection", "Scaffolding Dismantling", "Scaffolding Maintenance"),
    ),
    Trade(
        "Road & Civil Worker",
        "road and civil worker",
        "Road and civil workers",
        900,
        1_800,
        ("Paver Block Work", "Drainage Work", "Road Repair Work", "Culvert Work"),
    ),
)


def trade_questions(trade: Trade) -> tuple[tuple[str, str, str, bool, int | None, str], ...]:
    """`(code, prompt, kind, required, minimum, help)`, in the order the booking screen asks.

    The codes are load-bearing: the customer app opens its "work" step on `work_type`, and the
    rate preview, matching and the shift engine all read `worker_count` and `duration_days`.
    """
    return (
        (
            WORK_TYPE_CODE,
            "What will they be doing?",
            ServiceQuestion.Kind.SINGLE_CHOICE,
            True,
            None,
            "",
        ),
        (HEADCOUNT_CODE, trade.people, ServiceQuestion.Kind.NUMBER, True, 1, ""),
        (
            DURATION_CODE,
            "Days",
            ServiceQuestion.Kind.NUMBER,
            True,
            1,
            "Consecutive working days.",
        ),
    )


def trade_question_schema(trade: Trade) -> dict[str, object]:
    """The validation schema, built from the same table the catalogue publishes."""
    questions: list[dict[str, object]] = []
    for code, prompt, kind, required, minimum, _help in trade_questions(trade):
        question: dict[str, object] = {
            "code": code,
            "label": prompt,
            "kind": _SCHEMA_KIND[kind],
            "required": required,
        }
        if minimum is not None:
            question["minimum"] = minimum
        if code == WORK_TYPE_CODE:
            question["options"] = [
                {"code": slugify(task), "label": task, "description": ""} for task in trade.tasks
            ]
        questions.append(question)
    return {"questions": questions}


def scaled_overtime_paise(*, sibling: RateCard, wage_paise: int) -> int:
    """The helpers overtime scaled by the wage, rounded half up to the nearest ten rupees."""
    numerator = sibling.overtime_hourly_paise * wage_paise
    denominator = sibling.worker_day_wage_paise * 1_000
    tens = (2 * numerator + denominator) // (2 * denominator)
    return max(tens, 1) * 1_000


# ---------------------------------------------------------------------------
# Event & Media: eight tiles, 84 services
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class EventTile:
    name: str
    #: Who consults and quotes, in the card sentence.
    consultant: str

    @property
    def slug(self) -> str:
        return slugify(self.name)

    @property
    def picture(self) -> str:
        return f"event-media/{self.slug}.jpeg"


@dataclass(frozen=True)
class EventService:
    name: str
    tile: EventTile
    #: The sheet's unit, as the card reads it: "per event".
    unit: str
    low: int
    high: int
    #: Set only where two tiles have a service of the same name; a slug is unique site-wide.
    slug_override: str = ""

    @property
    def slug(self) -> str:
        return self.slug_override or slugify(self.name)

    @property
    def photo(self) -> str:
        """The file name V2-pictures.md gives, which never carries the override."""
        return f"event-media/{self.tile.slug}/{slugify(self.name)}.jpeg"

    @property
    def short_description(self) -> str:
        return (
            f"Typically ₹{self.low:,}–{self.high:,} {self.unit}; "  # noqa: RUF001
            f"{self.tile.consultant} consults first and quotes in writing."
        )


PHOTOGRAPHY = EventTile("Photography", "the photographer")
VIDEOGRAPHY = EventTile("Videography", "the videographer")
VIDEO_EDITING = EventTile("Video Editing", "the editor")
PHOTO_EDITING = EventTile("Photo Editing", "the editor")
ALBUM_PRINTING = EventTile("Album & Printing", "the studio")
DJ_SOUND = EventTile("DJ & Sound", "the sound team")
EVENT_MANAGEMENT = EventTile("Event Management", "the planner")
ENTERTAINMENT = EventTile("Entertainment Services", "the organiser")
EVENT_TILES: tuple[EventTile, ...] = (
    PHOTOGRAPHY,
    VIDEOGRAPHY,
    VIDEO_EDITING,
    PHOTO_EDITING,
    ALBUM_PRINTING,
    DJ_SOUND,
    EVENT_MANAGEMENT,
    ENTERTAINMENT,
)

_EVENT = "per event"
_PROJECT = "per project"
_SESSION = "per session"
_VIDEO = "per video"
_PHOTO = "per photo"
_ALBUM = "per album"
_SHOW = "per show"
_REEL = "per reel"


#: A slug is unique site-wide, and both editing tiles have an "Advanced Editing".
_SLUG_OVERRIDES: dict[tuple[str, str], str] = {
    ("video-editing", "Advanced Editing"): "advanced-video-editing",
    ("photo-editing", "Advanced Editing"): "advanced-photo-editing",
}


def _rows(tile: EventTile, rows: Iterable[tuple[str, str, int, int]]) -> tuple[EventService, ...]:
    return tuple(
        EventService(name, tile, unit, low, high, _SLUG_OVERRIDES.get((tile.slug, name), ""))
        for name, unit, low, high in rows
    )


EVENT_SERVICES: tuple[EventService, ...] = (
    *_rows(
        PHOTOGRAPHY,
        (
            ("Event Photography", _EVENT, 2_000, 8_000),
            ("Birthday Photography", _EVENT, 1_500, 5_000),
            ("Wedding Photography", _EVENT, 20_000, 80_000),
            ("Pre-Wedding Shoot", _PROJECT, 10_000, 40_000),
            ("Engagement Photography", _EVENT, 5_000, 20_000),
            ("Reception Photography", _EVENT, 5_000, 20_000),
            ("Baby Shoot", _SESSION, 2_000, 8_000),
            ("Kids Photography", _SESSION, 2_000, 8_000),
            ("Maternity Shoot", _SESSION, 3_000, 10_000),
            ("Family Shoot", _SESSION, 3_000, 10_000),
            ("Portfolio Shoot", _SESSION, 5_000, 20_000),
            ("Product Photography", _PROJECT, 2_000, 10_000),
            ("Food Photography", _PROJECT, 3_000, 15_000),
            ("Real Estate Photography", _PROJECT, 5_000, 20_000),
            ("Corporate Event Photography", _EVENT, 10_000, 50_000),
            ("Candid Photography", "per day", 3_000, 15_000),
            ("Traditional Photography", "per day", 2_000, 8_000),
        ),
    ),
    *_rows(
        VIDEOGRAPHY,
        (
            ("Event Videography", _EVENT, 3_000, 10_000),
            ("Wedding Videography", _EVENT, 30_000, 100_000),
            ("Pre-Wedding Video", _PROJECT, 15_000, 50_000),
            ("Engagement Video", _EVENT, 8_000, 30_000),
            ("Birthday Videography", _EVENT, 2_000, 8_000),
            ("Drone Videography", "per hour", 5_000, 20_000),
            ("Corporate Video Shoot", _PROJECT, 10_000, 50_000),
            ("YouTube Video Shoot", _PROJECT, 3_000, 15_000),
            ("Instagram Reels Shoot", _REEL, 1_000, 5_000),
            ("Short Film Shoot", _PROJECT, 10_000, 50_000),
            ("Documentary Video", _PROJECT, 20_000, 100_000),
            ("Promotional Video", _PROJECT, 10_000, 50_000),
            ("Real Estate Video", _PROJECT, 5_000, 20_000),
            ("Product Video Shoot", _PROJECT, 3_000, 15_000),
            ("Cinematic Video Shoot", _PROJECT, 10_000, 50_000),
        ),
    ),
    *_rows(
        VIDEO_EDITING,
        (
            ("Basic Video Editing", _VIDEO, 1_000, 3_000),
            ("Advanced Editing", _VIDEO, 3_000, 10_000),
            ("Wedding Highlight Video", _VIDEO, 5_000, 20_000),
            ("Full Wedding Film Editing", _PROJECT, 10_000, 50_000),
            ("Reels Editing", _REEL, 500, 2_000),
            ("YouTube Editing", _VIDEO, 1_000, 5_000),
            ("Color Grading", _VIDEO, 2_000, 8_000),
            ("Motion Graphics Editing", _VIDEO, 3_000, 15_000),
            ("Subtitle Editing", _VIDEO, 1_000, 3_000),
            ("Promo Video Editing", _VIDEO, 3_000, 15_000),
        ),
    ),
    *_rows(
        PHOTO_EDITING,
        (
            ("Basic Photo Editing", _PHOTO, 50, 200),
            ("Advanced Editing", _PHOTO, 200, 500),
            ("Wedding Album Editing", _ALBUM, 3_000, 15_000),
            ("Skin Retouching", _PHOTO, 200, 1_000),
            ("Color Correction", _PHOTO, 100, 300),
            ("Background Removal", _PHOTO, 100, 300),
            ("Photo Enhancement", _PHOTO, 200, 500),
            ("AI Photo Restoration", _PHOTO, 300, 1_000),
        ),
    ),
    *_rows(
        ALBUM_PRINTING,
        (
            ("Wedding Album Design", _ALBUM, 5_000, 20_000),
            ("Birthday Album", _ALBUM, 2_000, 8_000),
            ("Premium Album Printing", _ALBUM, 8_000, 30_000),
            ("Digital Album", _ALBUM, 2_000, 8_000),
            # The sheet cell reads 18537: Excel turned "10-50" into October 1950 (serial 18537).
            ("Photo Printing", _PHOTO, 10, 50),
            ("Frame Printing", "per frame", 500, 3_000),
            ("Canvas Printing", "per piece", 1_000, 5_000),
            ("Photo Book Design", "per book", 2_000, 10_000),
        ),
    ),
    *_rows(
        DJ_SOUND,
        (
            ("DJ Setup", _EVENT, 5_000, 20_000),
            ("Sound System Setup", _EVENT, 3_000, 15_000),
            ("Stage Sound Setup", _EVENT, 5_000, 25_000),
            ("Lighting Setup", _EVENT, 3_000, 20_000),
            ("DJ Lights Setup", _EVENT, 3_000, 20_000),
            ("Smoke Machine Setup", _EVENT, 2_000, 10_000),
            ("Live Band Setup", _EVENT, 10_000, 50_000),
            ("LED Wall Setup", _EVENT, 10_000, 100_000),
            ("Laser Show Setup", _EVENT, 5_000, 50_000),
        ),
    ),
    *_rows(
        EVENT_MANAGEMENT,
        (
            ("Full Event Management", _EVENT, 20_000, 200_000),
            ("Wedding Planning", _EVENT, 50_000, 500_000),
            ("Birthday Planning", _EVENT, 10_000, 50_000),
            ("Corporate Event Management", _EVENT, 30_000, 200_000),
            ("Event Coordination", _EVENT, 5_000, 20_000),
            ("Anchor / Host", _EVENT, 3_000, 15_000),
            ("Celebrity Management", _EVENT, 50_000, 1_000_000),
            ("Destination Wedding Planning", _EVENT, 100_000, 1_000_000),
        ),
    ),
    *_rows(
        ENTERTAINMENT,
        (
            ("Magician Show", _SHOW, 3_000, 15_000),
            ("Dance Performance", _SHOW, 5_000, 20_000),
            ("Live Singer", _SHOW, 5_000, 25_000),
            ("Anchor / MC", _SHOW, 3_000, 15_000),
            ("Kids Entertainment", _SHOW, 3_000, 15_000),
            ("Fireworks Show", _SHOW, 5_000, 50_000),
            ("Game Organizer", _EVENT, 3_000, 15_000),
            ("Mimicry Show", _SHOW, 3_000, 15_000),
            ("Stand-up Comedy", _SHOW, 5_000, 50_000),
        ),
    ),
)

#: Sheet rows deliberately not imported, with the reason the preview prints.
NOT_IMPORTED: tuple[tuple[str, str], ...] = (
    (
        "DJ & Sound > Site Visit & Consultation",
        "the visit every priced-on-site booking starts with",
    ),
    (
        "Event Management > Event Consultation",
        "the visit every priced-on-site booking starts with",
    ),
)

EVENT_VARIANT_NAME = "Quoted after consultation"


# ---------------------------------------------------------------------------
# The command
# ---------------------------------------------------------------------------


@dataclass
class _Tally:
    tiles_created: int = 0
    tiles_updated: int = 0
    trades_created: int = 0
    trades_updated: int = 0
    events_created: int = 0
    events_updated: int = 0
    photos_linked: int = 0
    photos_missing: list[str] = field(default_factory=list)
    floors_copied: int = 0
    cards_published: int = 0
    cards_kept: int = 0
    cards_blocked: list[str] = field(default_factory=list)
    hidden: list[str] = field(default_factory=list)
    without_partners: int = 0
    empty_booking_settings: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class _Sibling:
    service: Service
    variant: ServiceVariant
    configuration: M2VariantConfiguration
    areas: tuple[ServiceArea, ...]


class Command(BaseCommand):
    help = "Add the eight construction trades by the day and the Event & Media services."

    #: Whether each photo URL opens, asked once per URL per run.
    _live: dict[str, bool]

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--apply", action="store_true", help="Write the changes; without it, only preview."
        )

    def handle(self, *_args: Any, **options: Any) -> None:
        apply = bool(options["apply"])
        media = (str(settings.R2_PUBLIC_BASE_URL) or MEDIA_FALLBACK).rstrip("/")
        tally = _Tally()
        self._live: dict[str, bool] = {}
        with transaction.atomic():
            self._import(media=media, tally=tally)
            if not apply:
                # The preview runs every write for real, so it reports exactly what --apply would,
                # and then rolls all of it back.
                transaction.set_rollback(True)
        self._summary(tally=tally, apply=apply)

    # -- shared ---------------------------------------------------------------

    def _import(self, *, media: str, tally: _Tally) -> None:
        publisher = User.objects.filter(is_staff=True).order_by("date_joined").first()
        if publisher is None:
            raise CommandError(
                "No staff user to record as the publisher of the day rates. "
                "Create the Operations user first."
            )
        a3_sibling = self._sibling(A3_SIBLING, A3)
        a5_sibling = self._sibling(A5_SIBLING, A5)
        construction_tile = (
            Subcategory.objects.select_related("category")
            .filter(category__slug=CONSTRUCTION_CATEGORY, slug=CONSTRUCTION_TILE)
            .first()
        )
        if construction_tile is None:
            raise CommandError(
                f"The tile {CONSTRUCTION_CATEGORY}/{CONSTRUCTION_TILE} does not exist."
            )
        events = Category.objects.filter(slug=EVENTS_CATEGORY).first()
        if events is None:
            raise CommandError(f"The category {EVENTS_CATEGORY} does not exist.")

        self.stdout.write("Construction labour, by the day:")
        self._import_trades(
            media=media,
            tile=construction_tile,
            sibling=a3_sibling,
            publisher=publisher,
            tally=tally,
        )
        self.stdout.write("")
        self.stdout.write("Event & Media, priced on site:")
        self._import_events(media=media, category=events, sibling=a5_sibling, tally=tally)

        # Visibility is Operations' decision and this import never changes it; it only says so,
        # because a service in a hidden tile or category is not reachable by customers.
        tiles = [
            construction_tile,
            *Subcategory.objects.select_related("category").filter(
                category=events, slug__in=[tile.slug for tile in EVENT_TILES]
            ),
        ]
        tally.hidden = sorted(
            f"{tile.category.slug}/{tile.slug}"
            for tile in tiles
            if not tile.is_active or not tile.category.is_active
        )

    @staticmethod
    def _sibling(slug: str, archetype: str) -> _Sibling:
        service = Service.objects.filter(slug=slug).first()
        # The sibling lends its settings only, so it need not be on sale itself: a paused sibling
        # still carries a complete configuration.
        variant = (
            ServiceVariant.objects.filter(service=service, booking_archetype=archetype)
            .order_by("-is_active", "display_order", "code")
            .first()
            if service is not None
            else None
        )
        configuration = (
            M2VariantConfiguration.objects.filter(
                variant=variant, status=M2VariantConfiguration.Status.ACTIVE
            ).first()
            if variant is not None
            else None
        )
        areas = tuple(
            ServiceArea.objects.filter(
                service_links__variant=variant, service_links__is_active=True
            ).order_by("slug")
        )
        if service is None or variant is None or configuration is None:
            raise CommandError(
                f"{slug} must exist with an active {archetype} configuration first: V2 copies "
                "its settings."
            )
        if not areas:
            raise CommandError(f"{slug} is not sold in any service area, so V2 has none to copy.")
        return _Sibling(service, variant, configuration, areas)

    def _photo(self, url: str) -> str:
        """The URL when the file is there, else blank. Asked once per URL per run."""
        if url not in self._live:
            self._live[url] = photo_is_live(url)
        return url if self._live[url] else ""

    @staticmethod
    def _url(media: str, root: str, path: str) -> str:
        return f"{media}/{quote(root)}/{quote(path)}"

    @staticmethod
    def _next_order(queryset: Any, column: str = "display_order") -> int:
        top = queryset.aggregate(top=Max(column))["top"]
        return int(top or 0) + 10

    @staticmethod
    def _copied_configuration(
        sibling: M2VariantConfiguration, not_copied: frozenset[str]
    ) -> dict[str, Any]:
        return {
            column.attname: getattr(sibling, column.attname)
            for column in M2VariantConfiguration._meta.concrete_fields
            if column.name not in not_copied
        }

    def _upsert_service(
        self,
        *,
        slug: str,
        name: str,
        subcategory: Subcategory,
        icon_key: str,
        short_description: str,
    ) -> tuple[Service, bool]:
        existing = Service.objects.filter(slug=slug).select_related("subcategory").first()
        if existing is not None and existing.subcategory_id != subcategory.id:
            raise CommandError(
                f"{slug} already exists in another tile ({existing.subcategory.slug}). "
                "Move or rename it before importing V2."
            )
        authored = {
            "subcategory": subcategory,
            "name": name,
            "icon_key": icon_key,
            "short_description": short_description,
            "description": short_description,
        }
        return Service.objects.update_or_create(
            slug=slug,
            defaults=authored,
            # A rerun never re-activates a service Operations paused, nor reshuffles the tile.
            create_defaults={
                **authored,
                "status": Service.Status.ACTIVE,
                "display_order": self._next_order(Service.objects.filter(subcategory=subcategory)),
            },
        )

    def _upsert_variant(
        self,
        *,
        service: Service,
        name: str,
        archetype: str,
        sibling: _Sibling,
        image_url: str,
    ) -> ServiceVariant:
        existing = ServiceVariant.objects.filter(service=service, code="standard").first()
        variant, _ = ServiceVariant.objects.update_or_create(
            service=service,
            code="standard",
            defaults={
                "name": name,
                "description": "",
                "pricing_strategy": sibling.variant.pricing_strategy,
                "booking_archetype": archetype,
                "minimum_duration_minutes": sibling.variant.minimum_duration_minutes,
                "recommended_duration_minutes": sibling.variant.recommended_duration_minutes,
                "duration_increment_minutes": sibling.variant.duration_increment_minutes,
                "maximum_duration_minutes": sibling.variant.maximum_duration_minutes,
                # The dispatch trade: who can be sent. Always the service's own slug.
                "required_skill_code": service.slug,
                "tax_category_code": sibling.variant.tax_category_code,
                # A photo not uploaded yet never blanks one already linked.
                "image_url": image_url or (existing.image_url if existing is not None else ""),
                "display_order": sibling.variant.display_order,
                "is_active": True,
            },
        )
        return variant

    @staticmethod
    def _set_cover(*, service: Service, url: str) -> None:
        """Point the service's first COVER photo at ``url``.

        `(service, kind)` has no unique constraint, so the first row is updated in place rather
        than `update_or_create`, which would stack a second cover on a rerun.
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
                alt_text=service.name,
                display_order=1,
                is_active=True,
            )
            return
        cover.url = url
        cover.alt_text = service.name
        cover.is_active = True
        cover.save(update_fields=("url", "alt_text", "is_active"))

    def _link_photo(self, *, service: Service, url: str, label: str, tally: _Tally) -> str:
        live = self._photo(url)
        if live:
            self._set_cover(service=service, url=live)
            tally.photos_linked += 1
        else:
            tally.photos_missing.append(label)
        return live

    @staticmethod
    def _sell_in(*, variant: ServiceVariant, areas: Iterable[ServiceArea]) -> None:
        for area in areas:
            ServiceAreaService.objects.update_or_create(
                service_area=area, variant=variant, defaults={"is_active": True}
            )

    @staticmethod
    def _approved(variant: ServiceVariant) -> int:
        return PartnerCapability.objects.filter(
            variant=variant, status=PartnerCapability.Status.APPROVED
        ).count()

    # -- construction trades ---------------------------------------------------

    def _import_trades(
        self,
        *,
        media: str,
        tile: Subcategory,
        sibling: _Sibling,
        publisher: User,
        tally: _Tally,
    ) -> None:
        sibling_skill = sibling.configuration.wage_floor_skill
        tally.empty_booking_settings = [
            name for name in A3_BOOKING_SETTINGS if getattr(sibling.configuration, name) is None
        ]
        good_to_know = tuple(
            ServicePolicy.objects.filter(
                service=sibling.service, kind=ServicePolicy.Kind.GOOD_TO_KNOW, is_active=True
            )
            .order_by("display_order")
            .values_list("text", flat=True)
        )
        for trade in TRADES:
            service, created = self._upsert_service(
                slug=trade.slug,
                name=trade.name,
                subcategory=tile,
                icon_key=sibling.service.icon_key,
                short_description=trade.short_description,
            )
            if created:
                tally.trades_created += 1
            else:
                tally.trades_updated += 1
            # One row is the dispatch trade and the wage classification, as for the electrician:
            # a mason is sent because they are a mason and paid at least a mason's floor.
            skill, _ = Skill.objects.update_or_create(
                code=trade.slug,
                defaults={
                    "name": trade.name,
                    "description": trade.short_description,
                    "is_active": True,
                },
            )
            photo = self._link_photo(
                service=service,
                url=self._url(media, PHOTO_ROOT, trade.photo),
                label=trade.photo,
                tally=tally,
            )
            variant = self._upsert_variant(
                service=service,
                name=trade.variant_name,
                archetype=A3,
                sibling=sibling,
                image_url=photo,
            )
            self._write_questions(variant=variant, trade=trade)
            # Updated in place at version 1 on a rerun: one ACTIVE row per variant is a database
            # constraint, and nobody has booked against these yet.
            M2VariantConfiguration.objects.update_or_create(
                variant=variant,
                version=1,
                defaults={
                    **self._copied_configuration(sibling.configuration, _A3_CONFIG_NOT_COPIED),
                    "status": M2VariantConfiguration.Status.ACTIVE,
                    "question_schema": trade_question_schema(trade),
                    "a3_preset_question_schema": {"questions": []},
                    "wage_floor_skill": skill,
                    "pricing_skill_code": "",
                },
            )
            self._sell_in(variant=variant, areas=sibling.areas)
            self._write_policies(service=service, trade=trade, good_to_know=good_to_know)
            rates = [
                self._day_rate(
                    trade=trade,
                    skill=skill,
                    area=area,
                    sibling_skill=sibling_skill,
                    publisher=publisher,
                    tally=tally,
                )
                for area in sibling.areas
            ]
            approved = self._approved(variant)
            if approved == 0:
                tally.without_partners += 1
            self.stdout.write(
                f"  {trade.name} | wage Rs {trade.wage_rupees} (sheet up to "
                f"Rs {trade.sheet_high_rupees}) | {'; '.join(rates)} | approved partners "
                f"{approved}"
            )

    @staticmethod
    def _write_questions(*, variant: ServiceVariant, trade: Trade) -> None:
        """The catalogue's half of the questions; `trade_question_schema` is the other half.

        The authored list is the whole list: a question no longer authored is deactivated, not
        deleted, because a stored answer may still be keyed on it.
        """
        questions = trade_questions(trade)
        ServiceQuestion.objects.filter(variant=variant, is_active=True).exclude(
            code__in=[code for code, *_ in questions]
        ).update(is_active=False)
        for order, (code, prompt, kind, required, minimum, help_text) in enumerate(
            questions, start=1
        ):
            question, _ = ServiceQuestion.objects.update_or_create(
                variant=variant,
                code=code,
                defaults={
                    "prompt": prompt,
                    "help_text": help_text,
                    "kind": kind,
                    "is_required": required,
                    "validation_rules": {"minimum": minimum} if minimum is not None else {},
                    "display_order": order,
                    "is_active": True,
                },
            )
            if code != WORK_TYPE_CODE:
                continue
            authored = [slugify(task) for task in trade.tasks]
            ServiceQuestionOption.objects.filter(question=question).exclude(
                code__in=authored
            ).update(is_active=False)
            for option_order, task in enumerate(trade.tasks, start=1):
                ServiceQuestionOption.objects.update_or_create(
                    question=question,
                    code=slugify(task),
                    defaults={
                        "label": task,
                        "description": "",
                        "display_order": option_order,
                        "is_active": True,
                    },
                )

    @staticmethod
    def _write_policies(*, service: Service, trade: Trade, good_to_know: tuple[str, ...]) -> None:
        """The What's-included / What's-not page; the authored lines are the whole list.

        Deactivated rather than deleted: a policy line is the wording a customer booked under.
        The good-to-know lines are the helpers service's, which state the day-hire payment rule.
        """
        ServicePolicy.objects.filter(service=service).update(is_active=False)
        rows = [
            *((ServicePolicy.Kind.INCLUDED, text) for text in trade.included),
            *((ServicePolicy.Kind.EXCLUDED, text) for text in trade.excluded),
            *((ServicePolicy.Kind.GOOD_TO_KNOW, text) for text in good_to_know),
        ]
        orders: dict[str, int] = {}
        for kind, text in rows:
            orders[kind] = orders.get(kind, 0) + 1
            ServicePolicy.objects.update_or_create(
                service=service,
                kind=kind,
                display_order=orders[kind],
                defaults={"title": "", "text": text, "is_active": True},
            )

    def _day_rate(
        self,
        *,
        trade: Trade,
        skill: Skill,
        area: ServiceArea,
        sibling_skill: Skill | None,
        publisher: User,
        tally: _Tally,
    ) -> str:
        """Publish the trade's first card in one area; returns the preview's note for it."""
        existing = (
            RateCard.objects.filter(service_area=area, skill=skill)
            .order_by("-effective_from", "-created_at")
            .first()
        )
        if existing is not None:
            tally.cards_kept += 1
            return f"{area.slug} kept Rs {existing.customer_day_rate_paise // 100}/day"

        def blocked(reason: str) -> str:
            tally.cards_blocked.append(f"{trade.name} in {area.slug}: {reason}")
            return f"{area.slug} no day rate"

        if sibling_skill is None:
            return blocked(f"{A3_SIBLING} has no wage classification to take the rate from")
        if not area.state_code:
            return blocked("the area has no state code")
        today = timezone.localdate()
        try:
            helpers = live_rate_card(service_area=area, skill=sibling_skill, on_day=today)
        except RequirementDomainError:
            return blocked(f"{A3_SIBLING} has no day rate here to take the margin and fee from")
        try:
            # A savepoint per card: one refusal must not undo the cards already published, and
            # a floor copied for a card that then fails is rolled back with it.
            with transaction.atomic():
                copied_floor = self._ensure_floor(
                    state_code=area.state_code,
                    skill=skill,
                    sibling_skill=sibling_skill,
                    on_day=today,
                )
                card = publish_rate_card(
                    service_area_id=area.id,
                    skill_id=skill.id,
                    worker_day_wage_paise=trade.wage_paise,
                    supervision_margin_paise=helpers.supervision_margin_paise,
                    booking_fee_paise=helpers.booking_fee_paise,
                    standard_day_hours=helpers.standard_day_hours,
                    overtime_hourly_paise=scaled_overtime_paise(
                        sibling=helpers, wage_paise=trade.wage_paise
                    ),
                    inclusions=trade.card_inclusions(day_hours=helpers.standard_day_hours),
                    add_on_rates={},
                    effective_from=today,
                    actor=publisher,
                    source_reference=(
                        f"import_catalog_v2: wage = lowest sheet rate for {trade.name}; margin "
                        f"and fee from the {sibling_skill.code} card."
                    ),
                )
        except (PartnerDomainError, RequirementDomainError) as error:
            return blocked(str(error))
        tally.cards_published += 1
        tally.floors_copied += int(copied_floor)
        return f"{area.slug} Rs {card.customer_day_rate_paise // 100}/day"

    @staticmethod
    def _ensure_floor(*, state_code: str, skill: Skill, sibling_skill: Skill, on_day: date) -> bool:
        """Copy the unskilled floor for a trade that has none in this state, marked as copied.

        Returns whether it copied one. Raises `WageFloorUnsetError` when the helpers have no
        floor here either, which the caller reports as a blocked card.
        """
        try:
            live_wage_floor(state_code=state_code, skill=skill, on_day=on_day)
        except WageFloorUnsetError:
            pass
        else:
            return False
        source = (
            MinimumWageFloor.objects.filter(
                state_code=state_code, skill=sibling_skill, effective_from__lte=on_day
            )
            .order_by("-effective_from")
            .first()
        )
        if source is None:
            raise WageFloorUnsetError()
        MinimumWageFloor.objects.get_or_create(
            state_code=state_code,
            skill=skill,
            effective_from=source.effective_from,
            defaults={
                "floor_paise_per_day": source.floor_paise_per_day,
                "source_reference": (
                    f"Copied from {sibling_skill.code} (unskilled) by import_catalog_v2. "
                    f"Replace with the gazette floor for {skill.code}."
                )[:200],
            },
        )
        return True

    # -- Event & Media -----------------------------------------------------------

    def _import_events(
        self, *, media: str, category: Category, sibling: _Sibling, tally: _Tally
    ) -> None:
        tiles: dict[str, Subcategory] = {}
        for tile in EVENT_TILES:
            tiles[tile.slug] = self._upsert_tile(
                media=media, category=category, tile=tile, sibling=sibling, tally=tally
            )
        for row in EVENT_SERVICES:
            subcategory = tiles[row.tile.slug]
            service, created = self._upsert_service(
                slug=row.slug,
                name=row.name,
                subcategory=subcategory,
                icon_key=sibling.service.icon_key,
                short_description=row.short_description,
            )
            if created:
                tally.events_created += 1
            else:
                tally.events_updated += 1
            # Every priced-on-site service dispatches on a skill of its own slug, which a
            # Partner's application must hold to list the service.
            Skill.objects.update_or_create(
                code=row.slug,
                defaults={
                    "name": row.name,
                    "description": row.short_description,
                    "is_active": True,
                },
            )
            photo = self._link_photo(
                service=service,
                url=self._url(media, PHOTO_ROOT, row.photo),
                label=row.photo,
                tally=tally,
            )
            variant = self._upsert_variant(
                service=service,
                name=EVENT_VARIANT_NAME,
                archetype=A5,
                sibling=sibling,
                image_url=photo,
            )
            M2VariantConfiguration.objects.update_or_create(
                variant=variant,
                version=1,
                defaults={
                    **self._copied_configuration(sibling.configuration, _CONFIG_NOT_COPIED),
                    "status": M2VariantConfiguration.Status.ACTIVE,
                    # Visit-first: the tile is the requirement and the visit answers the rest,
                    # like the sibling. No question is asked before Where and When.
                    "question_schema": {"questions": []},
                    # No price-book trade covers these yet; blank prices from the service's own.
                    "pricing_skill_code": "",
                },
            )
            self._sell_in(variant=variant, areas=sibling.areas)
            if self._approved(variant) == 0:
                tally.without_partners += 1
        for tile in EVENT_TILES:
            count = sum(1 for row in EVENT_SERVICES if row.tile is tile)
            self.stdout.write(f"  {tile.name}: {count} services | areas {len(sibling.areas)}")

    def _upsert_tile(
        self,
        *,
        media: str,
        category: Category,
        tile: EventTile,
        sibling: _Sibling,
        tally: _Tally,
    ) -> Subcategory:
        existing = Subcategory.objects.filter(category=category, slug=tile.slug).first()
        picture = self._photo(self._url(media, TILE_ROOT, tile.picture))
        if not picture:
            tally.photos_missing.append(f"tile {tile.picture}")
        if existing is not None:
            existing.name = tile.name
            if picture:
                existing.image_url = picture
            existing.save(update_fields=("name", "image_url", "updated_at"))
            tally.tiles_updated += 1
            return existing
        tally.tiles_created += 1
        return Subcategory.objects.create(
            category=category,
            slug=tile.slug,
            name=tile.name,
            icon_key=sibling.service.subcategory.icon_key,
            image_url=picture,
            display_order=self._next_order(Subcategory.objects.filter(category=category)),
            is_active=True,
        )

    # -- report ------------------------------------------------------------------

    def _summary(self, *, tally: _Tally, apply: bool) -> None:
        self.stdout.write("")
        self.stdout.write(
            f"Construction trades: {tally.trades_created} new, {tally.trades_updated} updated "
            f"(of {len(TRADES)})"
        )
        self.stdout.write(
            f"Day rates: {tally.cards_published} published, {tally.cards_kept} kept; "
            f"{tally.floors_copied} wage floors copied from the helpers"
        )
        for blocked in tally.cards_blocked:
            self.stdout.write(self.style.WARNING(f"  no day rate: {blocked}"))
        self.stdout.write(
            f"Event & Media tiles: {tally.tiles_created} new, {tally.tiles_updated} updated "
            f"(of {len(EVENT_TILES)})"
        )
        self.stdout.write(
            f"Event & Media services: {tally.events_created} new, {tally.events_updated} updated "
            f"(of {len(EVENT_SERVICES)})"
        )
        for row, reason in NOT_IMPORTED:
            self.stdout.write(f"  not imported: {row} ({reason})")
        self.stdout.write(
            f"Photos: {tally.photos_linked} linked, {len(tally.photos_missing)} not on the "
            "media domain yet"
        )
        if tally.photos_missing:
            folders = Counter(path.rsplit("/", 1)[0] for path in tally.photos_missing)
            self.stdout.write(
                self.style.WARNING(
                    "  Upload these, then run the command again to link them: "
                    + ", ".join(f"{folder}/ ({count})" for folder, count in sorted(folders.items()))
                )
            )
        if tally.empty_booking_settings:
            self.stdout.write(
                self.style.WARNING(
                    f"{A3_SIBLING} has these day-hire settings empty, so neither it nor the new "
                    "trades can be booked at the day rate until Operations sets them: "
                    + ", ".join(tally.empty_booking_settings)
                )
            )
        if tally.hidden:
            self.stdout.write(
                self.style.WARNING(
                    "These tiles are hidden, so customers cannot reach their new services until "
                    "Operations shows them: " + ", ".join(tally.hidden)
                )
            )
        if tally.without_partners:
            self.stdout.write(
                self.style.WARNING(
                    f"{tally.without_partners} services have no approved partner yet, so their "
                    "requests reach nobody until a partner is approved for them."
                )
            )
        if apply:
            self.stdout.write(self.style.SUCCESS("Applied."))
        else:
            self.stdout.write(
                self.style.WARNING("Preview only: nothing was written. Re-run with --apply.")
            )
