"""What the Customer asked for by gender, and whether a roster can meet it.

The single place that knows how a men/women request is written down, read back and tested against
people. Four callers depend on it and they must not each re-derive the rules:

* ``matching`` excludes a lead who provably cannot field the mix,
* ``crew_dispatch`` re-checks at accept, because an invitation is a snapshot,
* ``workforce.crew.assign_crew`` refuses a named crew that does not meet it,
* the serializers publish it so the Partner can *see* it before accepting.

## Blank gender is not male

Every ``CrewMember`` row that existed before ``gender`` starts blank, and every row created by a
Partner who has not been asked stays blank. A rule that read blank as a man would staff a wedding
wrongly on the first day this shipped. So blank is **unknown**, and unknown fills no gendered slot.

The two gates treat unknown differently on purpose, and that difference is the whole design:

* **Dispatch is unknown-tolerant.** A lead is excluded only when they *provably* cannot field the
  mix -- when even counting every unknown worker as the needed gender leaves them short. A lead
  whose roster gender is simply unrecorded stays in the pool. This is the same generosity
  ``matching.RankingSignals`` already shows an unknown-distance vendor by giving them the median
  band rather than last place: the house treatment of missing data is "assume typical", never
  "assume worst".
* **Assignment is exact.** By then the lead is naming real people for a real day, and an unknown is
  a question to answer rather than a benefit of the doubt.

## The answer keys

Per role, three numbers: ``<role>_count`` (the total, which carries the role's label and display
order) and ``<role>_men`` / ``<role>_women``. The redundancy is enforced rather than trusted --
``assert_mix_consistent`` refuses a requirement whose parts do not sum to its total, because two
disagreeing numbers on one screen is worse than either of them alone.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from apps.catalog.models import M2VariantConfiguration
from apps.partners.models import CrewMember, PartnerCrewMembership, PartnerProfile
from apps.requirements.models import CustomerRequirement

__all__ = [
    "MEN_SUFFIX",
    "WOMEN_SUFFIX",
    "CrewMixLine",
    "MixShortfall",
    "RoleFulfilment",
    "RosterMix",
    "assert_mix_consistent",
    "gendered_codes",
    "mix_lines",
    "requested_mix",
    "role_codes",
    "role_fulfilment",
    "roster_mix",
    "shortfall_against",
]

#: The role total's suffix. A role is `waiter_count`, and its two halves hang off the same stem.
COUNT_SUFFIX = "_count"
MEN_SUFFIX = "_men"
WOMEN_SUFFIX = "_women"

#: The headcount is not a role. It is the priced total and the catalogue asks it separately.
HEADCOUNT_CODE = "worker_count"


@dataclass(frozen=True, slots=True)
class CrewMixLine:
    """One role as the Partner reads it."""

    role_code: str
    role_label: str
    men: int
    women: int

    @property
    def total(self) -> int:
        return self.men + self.women


@dataclass(frozen=True, slots=True)
class RosterMix:
    """What a lead can field, counted from their roster."""

    men: int
    women: int
    #: Workers whose person carries no gender, or who declined to state one. They fill the
    #: headcount and no gendered slot.
    unknown: int

    @property
    def total(self) -> int:
        return self.men + self.women + self.unknown


@dataclass(frozen=True, slots=True)
class MixShortfall:
    """How far short a roster falls. Zeroes on both sides means it fits."""

    men: int
    women: int

    def __bool__(self) -> bool:
        return bool(self.men or self.women)

    def describe(self) -> str:
        parts = []
        if self.men:
            parts.append(f"{self.men} more {'man' if self.men == 1 else 'men'}")
        if self.women:
            parts.append(f"{self.women} more {'woman' if self.women == 1 else 'women'}")
        return " and ".join(parts)


def _role_stem(code: str) -> str | None:
    """`waiter_count` -> `waiter`. None for anything that is not a role total."""
    if code == HEADCOUNT_CODE or not code.endswith(COUNT_SUFFIX):
        return None
    return code[: -len(COUNT_SUFFIX)]


def _schema_questions(configuration: M2VariantConfiguration | None) -> list[dict[str, Any]]:
    if configuration is None:
        return []
    schema = configuration.question_schema or {}
    definitions = schema.get("questions") if isinstance(schema, dict) else None
    if not isinstance(definitions, list):
        return []
    return [row for row in definitions if isinstance(row, dict)]


def gendered_codes(configuration: M2VariantConfiguration | None) -> frozenset[str]:
    """Every `<role>_men` / `<role>_women` code this configuration publishes.

    `crew_brief` excludes these from its prose lines. Twelve lines reading "Waiters and serving
    staff, men: 3" is not a brief, it is a spreadsheet -- the structured `mix_lines` is what the
    Partner's screen renders instead.
    """
    codes: set[str] = set()
    for definition in _schema_questions(configuration):
        code = definition.get("code")
        if isinstance(code, str) and code.endswith((MEN_SUFFIX, WOMEN_SUFFIX)):
            codes.add(code)
    return frozenset(codes)


def _answer_int(answers: dict[str, Any], code: str) -> int:
    value = answers.get(code)
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        return 0
    return value


def mix_lines(requirement: CustomerRequirement) -> list[CrewMixLine]:
    """Every role with somebody in it, in the catalogue's own order and words.

    A role nobody asked for is left out: "0 bartenders" is not a fact a lead plans around, which is
    the same judgement `crew_brief` already makes about zero counts.
    """
    answers = requirement.answers if isinstance(requirement.answers, dict) else {}
    lines: list[CrewMixLine] = []
    for definition in _schema_questions(requirement.configuration):
        code = definition.get("code")
        if not isinstance(code, str):
            continue
        stem = _role_stem(code)
        if stem is None:
            continue
        men = _answer_int(answers, f"{stem}{MEN_SUFFIX}")
        women = _answer_int(answers, f"{stem}{WOMEN_SUFFIX}")
        if men + women == 0:
            continue
        label = definition.get("label")
        lines.append(
            CrewMixLine(
                role_code=code,
                role_label=label.strip() if isinstance(label, str) and label.strip() else code,
                men=men,
                women=women,
            )
        )
    return lines


def requested_mix(requirement: CustomerRequirement) -> tuple[int, int]:
    """(men, women) across every role. (0, 0) when the Customer asked for no split."""
    lines = mix_lines(requirement)
    return sum(line.men for line in lines), sum(line.women for line in lines)


def assert_mix_consistent(requirement: CustomerRequirement) -> None:
    """Refuse a requirement whose role total disagrees with its two halves.

    Raised at submission, where the Customer can still fix it. The alternative -- trusting the
    client to keep three numbers in step -- puts a wedding on the wrong side of a rounding bug.
    """
    answers = requirement.answers if isinstance(requirement.answers, dict) else {}
    for definition in _schema_questions(requirement.configuration):
        code = definition.get("code")
        if not isinstance(code, str):
            continue
        stem = _role_stem(code)
        if stem is None:
            continue
        men_code, women_code = f"{stem}{MEN_SUFFIX}", f"{stem}{WOMEN_SUFFIX}"
        if men_code not in answers and women_code not in answers:
            continue
        parts = _answer_int(answers, men_code) + _answer_int(answers, women_code)
        if parts != _answer_int(answers, code):
            label = definition.get("label")
            name = label if isinstance(label, str) and label.strip() else code
            raise ValueError(
                f"'{name}' asks for {_answer_int(answers, code)} people but the men and women "
                f"add up to {parts}.",
            )


@dataclass(frozen=True, slots=True)
class RoleFulfilment:
    """One role, as booked against as named.

    The soft half of the mix rules. `_assert_mix_met` refuses on totals -- five men and two women,
    roles collapsed -- and that is a floor rather than the promise the offer screen makes: a lead
    can satisfy it with both women on setup while the Customer asked for them on the serving line.

    This is what lets a screen say so. It is **not** a refusal and must not become one by accident:
    swapping somebody between roles on the morning of an event is ordinary, and the attendance
    shortfall path already settles a day that did not go to plan. A warning a supervisor can act on
    beats a block they have to argue with.
    """

    role_code: str
    role_label: str
    wanted_men: int
    wanted_women: int
    named_men: int
    named_women: int

    @property
    def is_met(self) -> bool:
        return self.named_men >= self.wanted_men and self.named_women >= self.wanted_women

    def describe_gap(self) -> str:
        """ "1 woman short", or "" when this role is covered."""
        parts = []
        if self.named_men < self.wanted_men:
            short = self.wanted_men - self.named_men
            parts.append(f"{short} {'man' if short == 1 else 'men'}")
        if self.named_women < self.wanted_women:
            short = self.wanted_women - self.named_women
            parts.append(f"{short} {'woman' if short == 1 else 'women'}")
        return f"{' and '.join(parts)} short" if parts else ""


def role_fulfilment(
    requirement: CustomerRequirement,
    named: Sequence[tuple[str, str]],
) -> list[RoleFulfilment]:
    """Every requested role, with what has actually been named into it.

    @param named `(role_code, gender)` for each assigned worker. A blank role means somebody was
        named without one -- an older assignment, or a supervisor who skipped the picker -- and
        they count toward no role rather than being spread across all of them.
    """
    counts: dict[str, tuple[int, int]] = {}
    for role_code, gender in named:
        if not role_code:
            continue
        men, women = counts.get(role_code, (0, 0))
        if gender == CrewMember.Gender.MAN:
            counts[role_code] = (men + 1, women)
        elif gender == CrewMember.Gender.WOMAN:
            counts[role_code] = (men, women + 1)

    rows: list[RoleFulfilment] = []
    for line in mix_lines(requirement):
        named_men, named_women = counts.get(line.role_code, (0, 0))
        rows.append(
            RoleFulfilment(
                role_code=line.role_code,
                role_label=line.role_label,
                wanted_men=line.men,
                wanted_women=line.women,
                named_men=named_men,
                named_women=named_women,
            )
        )
    return rows


def role_codes(requirement: CustomerRequirement) -> frozenset[str]:
    """The role codes a worker may be assigned into on this requirement."""
    return frozenset(line.role_code for line in mix_lines(requirement))


def roster_mix(partner: PartnerProfile, *, verified_only: bool = False) -> RosterMix:
    """Count a lead's active roster by gender.

    `verified_only` is the same distinction `crew_dispatch.verified_roster_size` already draws:
    active membership is right for a quote, where a lead may still be verifying people, and
    verified is right for a booking that confirms a crew today.
    """
    rows = PartnerCrewMembership.objects.filter(
        partner=partner, status=PartnerCrewMembership.Status.ACTIVE
    )
    if verified_only:
        rows = rows.filter(documents_verified_at__isnull=False)

    men = women = unknown = 0
    for gender in rows.values_list("crew_member__gender", flat=True):
        if gender == CrewMember.Gender.MAN:
            men += 1
        elif gender == CrewMember.Gender.WOMAN:
            women += 1
        else:
            # Blank, OTHER and UNDISCLOSED alike. All three fill the headcount and no gendered slot.
            unknown += 1
    return RosterMix(men=men, women=women, unknown=unknown)


def shortfall_against(
    roster: RosterMix,
    *,
    men: int,
    women: int,
    count_unknown: bool,
) -> MixShortfall:
    """How far this roster falls short of a mix.

    `count_unknown=True` is the dispatch reading: an unknown worker is allowed to stand in for
    either gender, so the answer is "can they *possibly* do it". `count_unknown=False` is the
    booking reading: only what is recorded counts.

    Unknowns are spent on men first and then on women. The order is arbitrary and it does not
    change the outcome -- a lead is short only when the unknowns cannot cover both gaps together,
    which is the sum, not the split.
    """
    men_gap = max(0, men - roster.men)
    women_gap = max(0, women - roster.women)
    if not count_unknown:
        return MixShortfall(men=men_gap, women=women_gap)

    spare = roster.unknown
    covered_men = min(men_gap, spare)
    spare -= covered_men
    covered_women = min(women_gap, spare)
    return MixShortfall(men=men_gap - covered_men, women=women_gap - covered_women)
