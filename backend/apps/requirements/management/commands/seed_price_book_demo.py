"""Load a demonstrable Phase A price book: an electrical + painting catalog, reference
rates for one city, an active guardrail policy, and one saved rate per demo partner.

## Why this exists

`seed_m2_demo` already stands up the `hyderabad-500032` service area and the
`electrician`/`painter` `Skill` rows for the A3 day-rate demo — this command adds the
Phase A item-wise catalog beside them, so a Partner rate-card screen and the ops
console have something real to show without hand-writing rows in a database client.

## Three doors, matching `seed_m2_demo` exactly

Same guard, same reasoning: `settings.DEBUG` must be true, and
`--i-understand-this-is-dev-only` is required even under `DEBUG` because a shared
development database can already hold a catalog somebody published on purpose.

## What is a placeholder and what is not

Every reference rate here and every guardrail percentage is invented for the demo —
none of it is a market survey or an owner-approved policy. Both are marked
`DEV SEED — not an owner decision` the same way `seed_m2_demo` marks its A3 cards,
so a real published catalog is never silently overwritten by a second run of this
command, and it is obvious on inspection which rows are real.

## Idempotent

Every write is an upsert on a natural key (skill + name for a `WorkItem`; work item +
service area + version for a `WorkItemRate`, published once and left alone after).
Running this command twice changes nothing.

## Prerequisite

Run `seed_m2_demo --i-understand-this-is-dev-only` first (or pass `--with-m2-demo` to
have this command run it for you). Without it, this command has no service area, no
skills and no demo partners to seed against, and refuses rather than inventing them —
duplicating that command's ~2,000 lines of catalog/wage-floor/rate-card setup here
would be exactly the drift `seed_m2_demo`'s own docstring warns against.
"""

from dataclasses import dataclass
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


@dataclass(frozen=True, slots=True)
class ItemSeed:
    name: str
    unit: str
    description: str
    reference_rate_paise: int


#: From `flows/electrical.jpeg`'s own rate card. Fifteen items, the same spread the
#: flow diagram shows (₹40 running-ft conduit up to ₹1,500 DB installation).
ELECTRICAL_ITEMS: tuple[ItemSeed, ...] = (
    ItemSeed("Light point wiring", "each", "One light point, wired and terminated.", 150_00),
    ItemSeed("Fan point wiring", "each", "One ceiling fan point, wired and terminated.", 200_00),
    ItemSeed("6A switch fixing", "each", "One 6A single switch, fixed and connected.", 100_00),
    ItemSeed("16A socket fixing", "each", "One 16A power socket, fixed and connected.", 150_00),
    ItemSeed(
        "PVC conduit laying",
        "running_ft",
        "Surface or concealed PVC conduit, per running foot.",
        40_00,
    ),
    ItemSeed(
        "Wire pulling",
        "running_ft",
        "Pulling wire through existing conduit, per running foot.",
        25_00,
    ),
    ItemSeed(
        "DB installation",
        "each",
        "Distribution board supply and installation, per board.",
        1_500_00,
    ),
    ItemSeed(
        "MCB installation",
        "each",
        "One MCB, supplied and installed into an existing board.",
        200_00,
    ),
    ItemSeed(
        "Ceiling fan installation",
        "each",
        "Fan hung and connected, fan supplied by the customer.",
        300_00,
    ),
    ItemSeed("Exhaust fan installation", "each", "Exhaust fan fitted and connected.", 350_00),
    ItemSeed(
        "Geyser point wiring",
        "each",
        "Dedicated geyser point, wired with the correct rating.",
        400_00,
    ),
    ItemSeed(
        "AC point wiring",
        "each",
        "Dedicated AC outdoor/indoor point, wired with the correct rating.",
        500_00,
    ),
    ItemSeed("Doorbell installation", "each", "Doorbell and chime, fitted and wired.", 250_00),
    ItemSeed("Earthing point", "each", "One earthing point, installed and tested.", 600_00),
    ItemSeed(
        "Fault finding and repair",
        "hour",
        "Diagnosing and fixing an existing fault, per hour on site.",
        300_00,
    ),
)

#: From the painter flow's own material/labour split — labour-only items in the
#: item-wise vocabulary this catalog serves; the painter measurement estimator itself
#: (Phase B) is a separate, unbuilt piece.
PAINTING_ITEMS: tuple[ItemSeed, ...] = (
    ItemSeed("Wall putty application", "sq_ft", "Two coats of wall putty, sanded smooth.", 12_00),
    ItemSeed("Primer coat", "sq_ft", "One coat of primer, brush or roller.", 8_00),
    ItemSeed(
        "Emulsion paint — standard", "sq_ft", "Two coats of standard emulsion paint.", 15_00
    ),
    ItemSeed(
        "Emulsion paint — premium",
        "sq_ft",
        "Two coats of premium washable emulsion paint.",
        22_00,
    ),
    ItemSeed(
        "Enamel paint — doors and windows", "sq_ft", "Two coats of enamel on wood or metal.", 18_00
    ),
    ItemSeed(
        "Surface sanding",
        "sq_ft",
        "Sanding an existing painted surface before repainting.",
        6_00,
    ),
    ItemSeed(
        "Crack filling",
        "running_ft",
        "Filling and sealing a wall crack, per running foot.",
        20_00,
    ),
    ItemSeed(
        "Masking and protection",
        "sq_ft",
        "Masking fixtures, floors and fittings before painting.",
        4_00,
    ),
    ItemSeed(
        "Waterproof exterior coat", "sq_ft", "One coat of exterior waterproofing paint.", 25_00
    ),
    ItemSeed(
        "Texture finish",
        "sq_ft",
        "One decorative texture coat, material supplied by the customer.",
        35_00,
    ),
)

CATALOG: tuple[tuple[str, tuple[ItemSeed, ...]], ...] = (
    ("electrician", ELECTRICAL_ITEMS),
    ("painter", PAINTING_ITEMS),
)

#: A fixed, past instant — so a second run's `activate_guardrail_policy` short-circuits
#: on the version-already-active check rather than trying to reactivate a retired row.
GUARDRAIL_EFFECTIVE_FROM = datetime(2026, 1, 1, tzinfo=UTC)


class Command(BaseCommand):
    help = (
        "Load a demonstrable Phase A price book: an electrical + painting work-item "
        "catalog, Hyderabad reference rates, an active guardrail policy, and one "
        "saved rate per demo partner. Development only."
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
            for seed in items:
                item, created = self._seed_work_item(skill=skill, seed=seed)
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

    def _seed_work_item(self, *, skill: Skill, seed: ItemSeed) -> tuple[WorkItem, bool]:
        item, created = WorkItem.objects.get_or_create(
            skill=skill,
            name=seed.name,
            defaults={
                "unit": seed.unit,
                "description": f"{seed.description} {DEV_SEED_MARKER}.",
                "status": WorkItem.Status.ACTIVE,
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
        """Version 1, with the seed values from the build prompt: -20%/+30% band,
        10% Miscellaneous cap, 25% Margin cap, 20% custom-item share cap."""
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
