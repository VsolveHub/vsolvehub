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

from datetime import date, time, timedelta
from typing import Any

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError, CommandParser
from django.db import transaction
from django.utils import timezone

from apps.catalog.models import (
    Category,
    M2VariantConfiguration,
    Service,
    ServiceQuestion,
    ServiceVariant,
    Subcategory,
)
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
from apps.requirements.models import M2AccessPrice

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

CATEGORY_SLUG = "workforce-and-projects"
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

#: One authored question: `(code, prompt, catalogue kind, required, minimum)`.
QuestionSeed = tuple[str, str, str, bool, int | None]

#: `(code, prompt, kind, required, minimum)`. The A3 set answers `services.infer_archetype`'s
#: workforce branch — a headcount and a duration — and the A5 set answers its project branch, an
#: outcome. They are deliberately disjoint: an answer set carrying both is ambiguous by definition
#: and is left on the variant's own archetype for Operations to reclassify.
A3_QUESTIONS: tuple[QuestionSeed, ...] = (
    ("worker_count", "How many people do you need?", ServiceQuestion.Kind.NUMBER, True, 1),
    ("duration_days", "For how many days?", ServiceQuestion.Kind.NUMBER, True, 1),
    ("work_description", "What will they be doing?", ServiceQuestion.Kind.TEXT, False, None),
)
A5_QUESTIONS: tuple[QuestionSeed, ...] = (
    ("deliverable", "What should be finished at the end?", ServiceQuestion.Kind.TEXT, True, None),
    ("site_ready", "Is the site empty and ready?", ServiceQuestion.Kind.BOOLEAN, False, None),
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
            }
            for code, prompt, kind, required, minimum in questions
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
        skill = self._seed_wage_floor_skill()
        a3_variant = self._seed_variant(
            service_slug=A3_SERVICE_SLUG,
            service_name="Construction helpers",
            variant_name="Helpers by the day",
            archetype=ServiceVariant.BookingArchetype.A3_TIME_BLOCK,
            questions=A3_QUESTIONS,
        )
        a5_variant = self._seed_variant(
            service_slug=A5_SERVICE_SLUG,
            service_name="Interior fit-out project",
            variant_name="Fit-out, priced on site",
            archetype=ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT,
            questions=A5_QUESTIONS,
        )
        for variant in (a3_variant, a5_variant):
            ServiceAreaService.objects.update_or_create(
                service_area=area,
                variant=variant,
                defaults={"is_active": True},
            )

        self._seed_a3_configuration(variant=a3_variant, skill=skill)
        self._seed_a5_configuration(variant=a5_variant)
        wage_floor_written = self._seed_wage_floor(skill=skill)
        prices_written, prices_skipped = self._seed_access_prices()

        vendors = self._seed_vendors(
            area=area,
            variants=(a3_variant, a5_variant),
            skill=skill,
            count=max(1, int(options["vendors"])),
        )

        self._report(
            wage_floor_written=wage_floor_written,
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
    def _seed_wage_floor_skill() -> Skill:
        """The statutory wage classification, which is not the dispatch trade slug.

        `M2VariantConfiguration.wage_floor_skill` exists precisely so a legal floor is not tied to
        `ServiceVariant.required_skill_code`, which is a merchandising decision. This is its own
        skill row for the same reason.
        """
        skill, _ = Skill.objects.update_or_create(
            code="construction-helper",
            defaults={
                "name": "Construction helper",
                "description": "Unskilled site labour. A wage classification, not a trade slug.",
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
    ) -> ServiceVariant:
        category, _ = Category.objects.update_or_create(
            slug=CATEGORY_SLUG,
            defaults={
                "name": "Workforce and projects",
                "description": "Workforce hire and custom project work.",
                "is_active": True,
                "display_order": 90,
            },
        )
        subcategory, _ = Subcategory.objects.update_or_create(
            category=category,
            slug="construction-labour",
            defaults={"name": "Construction labour", "is_active": True},
        )
        service, _ = Service.objects.update_or_create(
            slug=service_slug,
            defaults={
                "subcategory": subcategory,
                "name": service_name,
                "short_description": f"{service_name} (development fixture).",
                "status": Service.Status.ACTIVE,
            },
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
        for order, (code, prompt, kind, required, minimum) in enumerate(questions, start=1):
            ServiceQuestion.objects.update_or_create(
                variant=variant,
                code=code,
                defaults={
                    "prompt": prompt,
                    "kind": kind,
                    "is_required": required,
                    "validation_rules": ({"minimum": minimum} if minimum is not None else {}),
                    "display_order": order,
                    "is_active": True,
                },
            )
        return variant

    # -- the owner-blocked configuration -----------------------------------

    def _seed_a3_configuration(self, *, variant: ServiceVariant, skill: Skill) -> None:
        self._upsert_configuration(
            variant=variant,
            questions=A3_QUESTIONS,
            registration_questions=A3_REGISTRATION_QUESTIONS,
            extra={
                "wage_floor_skill": skill,
                "first_quote_sla_hours": FIRST_QUOTE_SLA_HOURS,
                "quote_delivery_sla_hours": QUOTE_DELIVERY_SLA_HOURS,
                "max_quotes": MAX_QUOTES,
                "non_responsive_rejection_cap": NON_RESPONSIVE_REJECTION_CAP,
            },
        )

    def _seed_a5_configuration(self, *, variant: ServiceVariant) -> None:
        self._upsert_configuration(
            variant=variant,
            questions=A5_QUESTIONS,
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

    def _seed_wage_floor(self, *, skill: Skill) -> bool:
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
                "floor_paise_per_day": WAGE_FLOOR_PAISE_PER_DAY,
                "source_reference": (
                    f"{DEV_SEED_MARKER}. Owner decision 7: the statutory floor source and its "
                    "enforcement per state and skill are unresolved. No gazette was consulted."
                ),
            },
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
        skill: Skill,
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
                },
            )
            PartnerSkill.objects.update_or_create(
                partner=partner,
                skill=skill,
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
            self._seed_crew(partner=partner, index=index)
        return phones

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
        """
        for worker in range(1, 7):
            phone = f"+9170302{index:02d}{worker:03d}"
            add_crew_to_roster(
                partner=partner,
                display_name=f"Worker {index}-{worker}",
                phone_e164=phone,
                is_supervisor=worker == 1,
            )

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
        wage_floor_written: bool,
        prices_written: int,
        prices_skipped: int,
        vendors: list[str],
    ) -> None:
        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("M2 demo configuration loaded."))
        self.stdout.write(
            f"  A3 service : /{A3_SERVICE_SLUG}  (unlock INR {A3_UNLOCK_PAISE / 100:.0f})"
        )
        tiers = ", ".join(
            f"{size}x INR {A5_TIER_PAISE[size] / 100:.0f}" for size in sorted(A5_TIER_PAISE)
        )
        self.stdout.write(f"  A5 service : /{A5_SERVICE_SLUG}  (visit plans {tiers})")
        self.stdout.write(f"  Area       : {SERVICE_AREA_SLUG} / PIN {POSTAL_CODE} / {STATE_CODE}")
        self.stdout.write(f"  Vendors    : {', '.join(vendors)}")
        self.stdout.write(
            f"  Prices     : {prices_written} written, {prices_skipped} left alone as real values"
        )
        if not wage_floor_written:
            self.stdout.write("  Wage floor : left alone; a real value is already loaded")
        self.stdout.write("")
        self.stdout.write(
            self.style.WARNING(
                "Every money value, clock and cap above is a PLACEHOLDER standing in for an open "
                "owner decision (task.md P0). They are marked in source_reference as "
                f"{DEV_SEED_MARKER!r}. Do not quote them to anybody."
            )
        )
        self.stdout.write("  Runbook: docs/runbooks/m2-demo-seed.md")
