"""Add the Version 1 catalogue: 21 priced-on-site services, their photos and their rates.

Source of truth: the "Services" sheet of ``V Solve Hub-Categories & Sub Categories (2).xlsx``
(15 November 2026) and ``exports/2026-11-15-catalog-pictures/V1-pictures.md``, whose 22 photos
are already on the media domain under ``Images/catalog-v2/``.

Every V1 row is priced per square foot, per running foot, per project or per package, so none
of them can be a fixed-price booking. Each becomes an A5 "priced on site" service, the same
product as the live "Full home rewiring": the customer books a visit, the professional measures
or consults and quotes in writing.

    python manage.py import_catalog_v1                            # preview, writes nothing
    python manage.py import_catalog_v1 --apply
    python manage.py import_catalog_v1 --apply --grant-from-sibling

Nothing here is a hand-copied setting. Each service takes its whole A5 configuration (quote and
visit deadlines, commission, warranty, recovery policy) and its service areas from an existing
sibling service in the same database, so it behaves exactly as that sibling does in the
environment the command runs in. What V1 adds on top:

- the service, its own dispatch skill (the service slug, as for every A5 service) and its photo;
- for the 15 per-unit rows, a price-book item whose reference rate is the middle of the sheet's
  range and whose band reaches both ends (Rs 40-80/sq ft -> Rs 60 +/- 33.33%), published in every
  area the service is sold in;
- the missing photo on the existing "Cupboard / Hinge Repair".

``--grant-from-sibling`` also approves each new service for every partner already approved for
its sibling in the same trade (an electrician approved for full home rewiring can take new house
wiring). The approval goes through the capability lifecycle and its audit trail, recorded as made
by this import. Without the flag a new service waits for partners to request it.

Safe to run again: a rerun updates the authored text, publishes a rate only when it changed and
never grants a capability twice. A service Operations has since paused stays paused.
"""

from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError, CommandParser
from django.db import transaction
from django.db.models import Max

from apps.catalog.models import (
    M2VariantConfiguration,
    Service,
    ServiceMedia,
    ServiceVariant,
    Subcategory,
)
from apps.identity.models import User
from apps.locations.models import ServiceArea, ServiceAreaService
from apps.partners.capabilities import request_capability, transition_capability
from apps.partners.exceptions import PartnerDomainError
from apps.partners.models import PartnerCapability, Skill
from apps.requirements.models import WorkItem, WorkItemRate
from apps.requirements.price_book import publish_reference_rate

#: Where the photos live when ``R2_PUBLIC_BASE_URL`` is not set (a fresh developer machine).
MEDIA_FALLBACK = "https://media.vsolvehub.com"
#: The bucket folder the V1 photos were uploaded to (V1-pictures.md, "Uploading").
PHOTO_ROOT = "Images/catalog-v2"
#: The one existing service V1 only gives a photo to.
CUPBOARD_SLUG = "cupboard-hinge-repair"
CUPBOARD_PHOTO = "technician/carpenter/cupboard-hinge-repair.jpeg"

A5 = ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT
#: Reason code on every capability transition this import makes, so Operations can find them.
GRANT_REASON_CODE = "catalog_v1_import"

#: Price-book unit code -> the words a customer reads after a rate. The ranges in this file use
#: an en dash, which is what the customer sees; RUF001 flags it as confusable with a hyphen, so
#: those lines carry `noqa: RUF001`, as in `seed_m2_demo`.
UNIT_WORDS = {"sq_ft": "per sq ft", "running_ft": "per running ft"}

#: Every configuration column a new service copies from its sibling, i.e. all of them except
#: identity, lifecycle and the two that are the service's own.
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


@dataclass(frozen=True)
class Placement:
    """Where a group of services is sold and which live service they are modelled on."""

    category_slug: str
    subcategory_slug: str
    #: An existing A5 service whose configuration and service areas are copied.
    sibling_slug: str
    #: The trade whose price book the professional quotes from.
    pricing_skill: str
    #: Whether the sibling's approved partners are in the same trade as these services. False for
    #: trades with no A5 sibling of their own, whose sibling lends its settings only.
    same_trade_partners: bool
    #: Price-book group for this placement's per-unit items.
    price_book_group: str = ""


@dataclass(frozen=True)
class Rate:
    """A per-unit rate from the sheet, in whole rupees."""

    unit: str
    low: int
    high: int

    @property
    def reference_paise(self) -> int:
        return (self.low + self.high) * 100 // 2

    @property
    def band_bps(self) -> int:
        """Half the range as a share of the middle, so the band reaches both ends of the sheet."""
        return round((self.high - self.low) * 10_000 / (self.high + self.low))

    @property
    def wording(self) -> str:
        return f"Typically ₹{self.low:,}–{self.high:,} {UNIT_WORDS[self.unit]}"  # noqa: RUF001


@dataclass(frozen=True)
class V1Service:
    slug: str
    name: str
    placement: Placement
    #: Path under ``PHOTO_ROOT``, exactly as V1-pictures.md names it.
    photo: str
    #: The sentence on the service card, without the price sentence the rate adds.
    lead: str
    variant_name: str
    rate: Rate | None = None
    #: The whole card sentence, for project and package rows that have no per-unit rate.
    full_description: str = field(default="")

    @property
    def short_description(self) -> str:
        if self.rate is None:
            return self.full_description
        return (
            f"{self.lead} {self.rate.wording}, measured on site and priced in writing "
            "before work starts."
        )


ELECTRICIAN = Placement(
    "electrician", "renovation-projects", "full-home-rewiring", "electrician", True, "Wiring"
)
PLUMBER = Placement(
    "plumber", "renovation-projects", "full-bathroom-renovation", "plumber", True, "Pipelines"
)
CARPENTER = Placement(
    "technician", "carpenter", "modular-kitchen-fit-out", "carpenter", True, "Finishing"
)
INTERNET = Placement(
    "technician",
    "internet-technician",
    "full-home-rewiring",
    "internet-technician",
    False,
    "Cabling",
)
CCTV = Placement(
    "technician", "cctv-technician", "full-home-rewiring", "cctv-technician", False, "Cabling"
)
HOME_AUTOMATION = Placement(
    "technician",
    "home-automation-technician",
    "full-home-rewiring",
    "home-automation-technician",
    False,
)
BRIDAL = Placement(
    "beautician", "bridal-events", "bridal-event-makeup", "bridal-event-makeup", True
)

MEASURED = "Measured and priced on site"
ON_SITE = "Priced on site"
PACKAGE = "Package, priced after consultation"
_SQFT = "sq_ft"
_RFT = "running_ft"

V1_SERVICES: tuple[V1Service, ...] = (
    # Technician > Electrician in the sheet; Electrician is its own category in the app.
    V1Service(
        "new-house-wiring",
        "New House Wiring",
        ELECTRICIAN,
        "technician/electrician/new-house-wiring.jpeg",
        "Full wiring for a new home: points, boards and cabling.",
        MEASURED,
        Rate(_SQFT, 40, 80),
    ),
    V1Service(
        "concealed-wiring",
        "Concealed Wiring",
        ELECTRICIAN,
        "technician/electrician/concealed-wiring.jpeg",
        "Wiring run inside the walls for a clean finish.",
        MEASURED,
        Rate(_SQFT, 60, 100),
    ),
    V1Service(
        "open-wiring",
        "Open Wiring",
        ELECTRICIAN,
        "technician/electrician/open-wiring.jpeg",
        "Surface wiring in casing, with no wall cutting.",
        MEASURED,
        Rate(_SQFT, 40, 70),
    ),
    V1Service(
        "conduit-pipe-laying",
        "Conduit Pipe Laying",
        ELECTRICIAN,
        "technician/electrician/conduit-pipe-laying.jpeg",
        "Conduit pipes laid for new or extra wiring.",
        MEASURED,
        Rate(_RFT, 25, 45),
    ),
    V1Service(
        "cable-pulling",
        "Cable Pulling",
        ELECTRICIAN,
        "technician/electrician/cable-pulling.jpeg",
        "Cables pulled through existing conduit.",
        MEASURED,
        Rate(_RFT, 15, 35),
    ),
    # Technician > Plumbing in the sheet; Plumber is its own category in the app.
    V1Service(
        "new-pipeline-installation",
        "New Pipeline Installation",
        PLUMBER,
        "technician/plumbing/new-pipeline-installation.jpeg",
        "New water lines for a home or an extension.",
        MEASURED,
        Rate(_RFT, 40, 80),
    ),
    V1Service(
        "old-pipe-replacement",
        "Old Pipe Replacement",
        PLUMBER,
        "technician/plumbing/old-pipe-replacement.jpeg",
        "Old or leaking pipes replaced with new lines.",
        MEASURED,
        Rate(_RFT, 50, 100),
    ),
    V1Service(
        "pipe-extension-work",
        "Pipe Extension Work",
        PLUMBER,
        "technician/plumbing/pipe-extension-work.jpeg",
        "Existing lines extended to a new tap, room or fitting.",
        MEASURED,
        Rate(_RFT, 40, 100),
    ),
    V1Service(
        "underground-pipeline-work",
        "Underground Pipeline Work",
        PLUMBER,
        "technician/plumbing/underground-pipeline-work.jpeg",
        "Water lines laid underground.",
        MEASURED,
        Rate(_RFT, 80, 150),
    ),
    V1Service(
        "drain-line-installation",
        "Drain Line Installation",
        PLUMBER,
        "technician/plumbing/drain-line-installation.jpeg",
        "New drain lines installed.",
        MEASURED,
        Rate(_RFT, 80, 150),
    ),
    V1Service(
        "sewer-line-work",
        "Sewer Line Work",
        PLUMBER,
        "technician/plumbing/sewer-line-work.jpeg",
        "Sewer lines laid or relaid.",
        MEASURED,
        Rate(_RFT, 150, 300),
    ),
    # Technician > Carpenter.
    V1Service(
        "wood-polishing",
        "Wood Polishing",
        CARPENTER,
        "technician/carpenter/wood-polishing.jpeg",
        "Polishing for doors, furniture and woodwork.",
        MEASURED,
        Rate(_SQFT, 20, 50),
    ),
    V1Service(
        "laminate-fixing",
        "Laminate Fixing",
        CARPENTER,
        "technician/carpenter/laminate-fixing.jpeg",
        "Laminate fixed on furniture, wardrobes and panels.",
        MEASURED,
        Rate(_SQFT, 30, 80),
    ),
    # Technician > Internet & WiFi Technician (internet-technician in the app).
    V1Service(
        "lan-cable-wiring",
        "LAN Cable Wiring",
        INTERNET,
        "technician/internet-wifi-technician/lan-cable-wiring.jpeg",
        "LAN cable runs to rooms and devices.",
        MEASURED,
        Rate(_RFT, 20, 30),
    ),
    # Technician > CCTV & Security Technician (cctv-technician in the app).
    V1Service(
        "full-cctv-setup",
        "Full CCTV Setup",
        CCTV,
        "technician/cctv-security-technician/full-cctv-setup.jpeg",
        "",
        ON_SITE,
        full_description=(
            "Cameras, recorder, wiring and mobile viewing set up as one project. Typically "
            "₹3,000–25,000 depending on the cameras, checked on site and priced in writing "  # noqa: RUF001
            "before work starts."
        ),
    ),
    V1Service(
        "cctv-wiring",
        "CCTV Wiring",
        CCTV,
        "technician/cctv-security-technician/cctv-wiring.jpeg",
        "Cable runs for CCTV cameras.",
        MEASURED,
        Rate(_RFT, 20, 40),
    ),
    # Technician > Home Automation & Sound (home-automation-technician in the app).
    V1Service(
        "smart-home-setup",
        "Smart Home Setup",
        HOME_AUTOMATION,
        "technician/home-automation-sound/smart-home-setup.jpeg",
        "",
        ON_SITE,
        full_description=(
            "Smart switches, devices and automation set up across your home. Typically "
            "₹1,999–25,000 depending on the scope, checked on site and priced in writing "  # noqa: RUF001
            "before work starts."
        ),
    ),
    # Beautician > Bridal Packages (bridal-events in the app).
    V1Service(
        "pre-bridal-package",
        "Pre-Bridal Package",
        BRIDAL,
        "beautician/bridal-packages/pre-bridal-package.jpeg",
        "",
        PACKAGE,
        full_description=(
            "Skin and beauty sessions before the wedding, as one package. Typically "
            "₹5,000–15,000; the artist consults first and quotes in writing."  # noqa: RUF001
        ),
    ),
    V1Service(
        "bridal-full-package",
        "Bridal Full Package",
        BRIDAL,
        "beautician/bridal-packages/bridal-full-package.jpeg",
        "",
        PACKAGE,
        full_description=(
            "Wedding-day bridal makeup in a classic, HD or airbrush finish. Typically "
            "₹10,000–40,000; the artist consults first and quotes in writing."  # noqa: RUF001
        ),
    ),
    V1Service(
        "engagement-package",
        "Engagement Package",
        BRIDAL,
        "beautician/bridal-packages/engagement-package.jpeg",
        "",
        PACKAGE,
        full_description=(
            "Party makeup and styling for the engagement day. Typically ₹5,000–15,000; the "  # noqa: RUF001
            "artist consults first and quotes in writing."
        ),
    ),
    V1Service(
        "bridesmaid-makeup",
        "Bridesmaid Makeup",
        BRIDAL,
        "beautician/bridal-packages/bridesmaid-makeup.jpeg",
        "",
        PACKAGE,
        full_description=(
            "Makeup for bridesmaids and family on the day. Typically ₹2,000–10,000; the "  # noqa: RUF001
            "artist consults first and quotes in writing."
        ),
    ),
)


@dataclass
class _Tally:
    services_created: int = 0
    services_updated: int = 0
    work_items_created: int = 0
    rates_published: int = 0
    rates_unchanged: int = 0
    capabilities_granted: int = 0
    capabilities_failed: list[str] = field(default_factory=list)
    without_partners: list[str] = field(default_factory=list)
    hidden_tiles: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class _Sibling:
    service: Service
    variant: ServiceVariant
    configuration: M2VariantConfiguration
    areas: tuple[ServiceArea, ...]


class Command(BaseCommand):
    help = "Add the 21 Version 1 priced-on-site services with their photos and rates."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--apply", action="store_true", help="Write the changes; without it, only preview."
        )
        parser.add_argument(
            "--grant-from-sibling",
            action="store_true",
            help=(
                "Approve each new service for partners already approved for its same-trade "
                "sibling service."
            ),
        )

    def handle(self, *_args: Any, **options: Any) -> None:
        apply = bool(options["apply"])
        grant = bool(options["grant_from_sibling"])
        media = (str(settings.R2_PUBLIC_BASE_URL) or MEDIA_FALLBACK).rstrip("/")
        tally = _Tally()
        with transaction.atomic():
            self._import(media=media, grant=grant, tally=tally)
            if not apply:
                # The preview runs every write for real, so it reports exactly what --apply would,
                # and then rolls all of it back.
                transaction.set_rollback(True)
        self._summary(tally=tally, apply=apply, grant=grant)

    # -- the import ---------------------------------------------------------

    def _import(self, *, media: str, grant: bool, tally: _Tally) -> None:
        publisher = User.objects.filter(is_staff=True).order_by("date_joined").first()
        if publisher is None:
            raise CommandError(
                "No staff user to record as the publisher of the price-book rates. "
                "Create the Operations user first."
            )
        siblings = self._siblings()
        subcategories = self._subcategories()
        # Tile visibility is Operations' decision and this import never changes it; it only says
        # so, because a service in a hidden tile is not reachable by customers.
        tally.hidden_tiles = sorted(
            f"{category}/{slug}"
            for (category, slug), tile in subcategories.items()
            if not tile.is_active or not tile.category.is_active
        )
        skills = self._pricing_skills()

        for row in V1_SERVICES:
            placement = row.placement
            sibling = siblings[placement.sibling_slug]
            variant = self._upsert_service(
                row=row,
                subcategory=subcategories[(placement.category_slug, placement.subcategory_slug)],
                sibling=sibling,
                photo_url=f"{media}/{PHOTO_ROOT}/{row.photo}",
                tally=tally,
            )
            rate_note = ""
            if row.rate is not None:
                rate_note = self._upsert_rate(
                    row=row,
                    rate=row.rate,
                    skill=skills[placement.pricing_skill],
                    areas=sibling.areas,
                    publisher=publisher,
                    tally=tally,
                )
            if grant and placement.same_trade_partners:
                self._grant_from_sibling(variant=variant, sibling=sibling, row=row, tally=tally)
            approved = PartnerCapability.objects.filter(
                variant=variant, status=PartnerCapability.Status.APPROVED
            ).count()
            if approved == 0:
                tally.without_partners.append(row.name)
            self.stdout.write(
                f"  {placement.category_slug}/{placement.subcategory_slug}: {row.name}"
                f" | areas {len(sibling.areas)}{rate_note} | approved partners {approved}"
            )

        self._cupboard_photo(photo_url=f"{media}/{PHOTO_ROOT}/{CUPBOARD_PHOTO}")

    def _siblings(self) -> dict[str, _Sibling]:
        found: dict[str, _Sibling] = {}
        problems: list[str] = []
        for slug in sorted({row.placement.sibling_slug for row in V1_SERVICES}):
            service = Service.objects.filter(slug=slug).first()
            # The sibling lends its settings only, so it need not be on sale itself: a paused
            # sibling (as on a developer machine) still carries a complete configuration.
            variant = (
                ServiceVariant.objects.filter(service=service, booking_archetype=A5)
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
                problems.append(f"{slug}: no priced-on-site option with an active configuration")
            elif not areas:
                problems.append(f"{slug}: not sold in any service area")
            else:
                found[slug] = _Sibling(service, variant, configuration, areas)
        if problems:
            raise CommandError(
                "These live services are the models for V1 and must exist first:\n  "
                + "\n  ".join(problems)
            )
        return found

    @staticmethod
    def _subcategories() -> dict[tuple[str, str], Subcategory]:
        wanted = {
            (row.placement.category_slug, row.placement.subcategory_slug) for row in V1_SERVICES
        }
        found = {
            (sub.category.slug, sub.slug): sub
            for sub in Subcategory.objects.select_related("category").filter(
                slug__in={sub for _, sub in wanted}
            )
            if (sub.category.slug, sub.slug) in wanted
        }
        missing = sorted(f"{cat}/{sub}" for cat, sub in wanted - found.keys())
        if missing:
            raise CommandError("These tiles do not exist: " + ", ".join(missing))
        return found

    @staticmethod
    def _pricing_skills() -> dict[str, Skill]:
        wanted = {row.placement.pricing_skill for row in V1_SERVICES if row.rate is not None}
        found = {skill.code: skill for skill in Skill.objects.filter(code__in=wanted)}
        missing = sorted(wanted - found.keys())
        if missing:
            raise CommandError("These trade skills do not exist: " + ", ".join(missing))
        return found

    def _upsert_service(
        self,
        *,
        row: V1Service,
        subcategory: Subcategory,
        sibling: _Sibling,
        photo_url: str,
        tally: _Tally,
    ) -> ServiceVariant:
        existing = Service.objects.filter(slug=row.slug).select_related("subcategory").first()
        if existing is not None and existing.subcategory_id != subcategory.id:
            raise CommandError(
                f"{row.slug} already exists in another tile ({existing.subcategory.slug}). "
                "Move or rename it before importing V1."
            )
        icon_key = (
            Service.objects.filter(subcategory=subcategory, status=Service.Status.ACTIVE)
            .exclude(slug=row.slug)
            .exclude(icon_key="")
            .values_list("icon_key", flat=True)
            .first()
            or sibling.service.icon_key
        )
        next_order = (
            Service.objects.filter(subcategory=subcategory).aggregate(top=Max("display_order"))[
                "top"
            ]
            or 0
        ) + 10
        service, created = Service.objects.update_or_create(
            slug=row.slug,
            defaults={
                "subcategory": subcategory,
                "name": row.name,
                "icon_key": icon_key,
                "short_description": row.short_description,
                "description": row.short_description,
            },
            # A rerun never re-activates a service Operations paused, nor reshuffles the tile.
            create_defaults={
                "subcategory": subcategory,
                "name": row.name,
                "icon_key": icon_key,
                "short_description": row.short_description,
                "description": row.short_description,
                "status": Service.Status.ACTIVE,
                "display_order": next_order,
            },
        )
        if created:
            tally.services_created += 1
        else:
            tally.services_updated += 1

        # Every A5 service dispatches on a skill of its own slug (`seed_m2_demo._seed_variant`),
        # which a Partner's application must hold to list the service.
        Skill.objects.update_or_create(
            code=row.slug,
            defaults={"name": row.name, "description": row.short_description, "is_active": True},
        )
        variant, _ = ServiceVariant.objects.update_or_create(
            service=service,
            code="standard",
            defaults={
                "name": row.variant_name,
                "description": "",
                "pricing_strategy": sibling.variant.pricing_strategy,
                "booking_archetype": A5,
                "minimum_duration_minutes": sibling.variant.minimum_duration_minutes,
                "recommended_duration_minutes": sibling.variant.recommended_duration_minutes,
                "duration_increment_minutes": sibling.variant.duration_increment_minutes,
                "maximum_duration_minutes": sibling.variant.maximum_duration_minutes,
                "required_skill_code": row.slug,
                "tax_category_code": sibling.variant.tax_category_code,
                "image_url": photo_url,
                "display_order": sibling.variant.display_order,
                "is_active": True,
            },
        )
        copied = {
            column.attname: getattr(sibling.configuration, column.attname)
            for column in M2VariantConfiguration._meta.concrete_fields
            if column.name not in _CONFIG_NOT_COPIED
        }
        # Updated in place at version 1 on a rerun, as `seed_m2_demo` does: one ACTIVE row per
        # variant is a database constraint, and nobody has quoted against these yet.
        M2VariantConfiguration.objects.update_or_create(
            variant=variant,
            version=1,
            defaults={
                **copied,
                "status": M2VariantConfiguration.Status.ACTIVE,
                # Visit-first: the tile is the requirement and the visit answers everything else,
                # like the live rewiring service. No question is asked before Where and When.
                "question_schema": {"questions": []},
                "pricing_skill_code": row.placement.pricing_skill,
            },
        )
        for area in sibling.areas:
            ServiceAreaService.objects.update_or_create(
                service_area=area, variant=variant, defaults={"is_active": True}
            )
        self._set_cover(service=service, url=photo_url)
        return variant

    @staticmethod
    def _set_cover(*, service: Service, url: str) -> str:
        """Point the service's first COVER photo at ``url``; returns what it pointed at before.

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
            return ""
        before = cover.url
        cover.url = url
        cover.alt_text = service.name
        cover.is_active = True
        cover.save(update_fields=("url", "alt_text", "is_active"))
        return before

    @staticmethod
    def _upsert_rate(
        *,
        row: V1Service,
        rate: Rate,
        skill: Skill,
        areas: Iterable[ServiceArea],
        publisher: User,
        tally: _Tally,
    ) -> str:
        item = WorkItem.objects.filter(
            skill=skill, name=row.name, status=WorkItem.Status.ACTIVE
        ).first()
        values = {
            "unit": rate.unit,
            "group": row.placement.price_book_group,
            "description": row.short_description,
            "band_below_bps": rate.band_bps,
            "band_above_bps": rate.band_bps,
        }
        if item is None:
            next_order = (
                WorkItem.objects.filter(skill=skill).aggregate(top=Max("sort_order"))["top"] or 0
            ) + 10
            item = WorkItem.objects.create(
                skill=skill, name=row.name, sort_order=next_order, **values
            )
            tally.work_items_created += 1
        else:
            for name, value in values.items():
                setattr(item, name, value)
            item.save(update_fields=(*values, "updated_at"))
        for area in areas:
            current = WorkItemRate.objects.filter(
                work_item=item, service_area=area, status=WorkItemRate.Status.PUBLISHED
            ).first()
            if current is not None and current.reference_rate_paise == rate.reference_paise:
                tally.rates_unchanged += 1
                continue
            publish_reference_rate(
                actor=publisher,
                work_item_id=item.id,
                service_area_id=area.id,
                reference_rate_paise=rate.reference_paise,
            )
            tally.rates_published += 1
        unit = UNIT_WORDS[rate.unit]
        return (
            f" | price book Rs {rate.reference_paise // 100} {unit} +/- {rate.band_bps / 100:.2f}%"
        )

    @staticmethod
    def _grant_from_sibling(
        *, variant: ServiceVariant, sibling: _Sibling, row: V1Service, tally: _Tally
    ) -> None:
        approved = (
            PartnerCapability.objects.filter(
                variant=sibling.variant, status=PartnerCapability.Status.APPROVED
            )
            .select_related("partner")
            .prefetch_related("service_areas")
        )
        for source in approved:
            partner = source.partner
            if PartnerCapability.objects.filter(
                partner=partner, variant=variant, status__in=PartnerCapability.ACTIVE_STATUSES
            ).exists():
                continue
            try:
                # A savepoint per partner: one refusal (an area they no longer serve) must not
                # undo the grants already made for the others.
                with transaction.atomic():
                    capability = request_capability(
                        partner=partner,
                        variant=variant,
                        max_crew_size=source.max_crew_size,
                        max_project_value_paise=source.max_project_value_paise,
                        service_areas=list(source.service_areas.all()),
                    )
                    transition_capability(
                        capability_id=capability.id,
                        to_status=PartnerCapability.Status.UNDER_REVIEW,
                        actor=None,
                        reason_code=GRANT_REASON_CODE,
                        reason=(
                            "Version 1 catalogue import: already approved for "
                            f"{sibling.service.name}."
                        ),
                    )
                    transition_capability(
                        capability_id=capability.id,
                        to_status=PartnerCapability.Status.APPROVED,
                        actor=None,
                        reason_code=GRANT_REASON_CODE,
                    )
            except PartnerDomainError as error:
                tally.capabilities_failed.append(f"{partner.display_name} / {row.name}: {error}")
                continue
            tally.capabilities_granted += 1

    def _cupboard_photo(self, *, photo_url: str) -> None:
        service = Service.objects.filter(slug=CUPBOARD_SLUG).first()
        if service is None:
            self.stdout.write(f"  {CUPBOARD_SLUG}: not found, photo skipped")
            return
        before = self._set_cover(service=service, url=photo_url)
        self.stdout.write(f"  {CUPBOARD_SLUG}: cover photo {before or '(none)'} -> {photo_url}")

    # -- report -------------------------------------------------------------

    def _summary(self, *, tally: _Tally, apply: bool, grant: bool) -> None:
        self.stdout.write("")
        self.stdout.write(
            f"Services: {tally.services_created} new, {tally.services_updated} updated "
            f"(of {len(V1_SERVICES)})"
        )
        self.stdout.write(
            f"Price book: {tally.work_items_created} new items, {tally.rates_published} rates "
            f"published, {tally.rates_unchanged} unchanged"
        )
        if grant:
            self.stdout.write(f"Partner approvals carried over: {tally.capabilities_granted}")
            for failure in tally.capabilities_failed:
                self.stdout.write(self.style.WARNING(f"  not granted: {failure}"))
        if tally.hidden_tiles:
            self.stdout.write(
                self.style.WARNING(
                    "These tiles are hidden, so customers cannot reach their new services until "
                    "Operations shows them: " + ", ".join(tally.hidden_tiles)
                )
            )
        if tally.without_partners:
            self.stdout.write(
                self.style.WARNING(
                    f"{len(tally.without_partners)} services have no approved partner yet, so "
                    "their enquiries reach nobody until a partner is approved for them: "
                    + ", ".join(tally.without_partners)
                )
            )
        if apply:
            self.stdout.write(self.style.SUCCESS("Applied."))
        else:
            self.stdout.write(
                self.style.WARNING("Preview only: nothing was written. Re-run with --apply.")
            )
