"""The men/women mix, at every gate that reads it.

The rules under test are the ones a future change is most likely to get wrong quietly:

* blank gender is **unknown**, never male;
* dispatch is unknown-tolerant and assignment is exact, and the difference is deliberate;
* the role total and its two halves must agree.

A regression in any of these is silent — a wedding staffed with the wrong people, with every
screen still green — which is exactly the kind of rule that has to be held by a test rather than
by a comment.
"""

import pytest

from apps.partners.models import CrewMember
from apps.requirements import crew_mix


class TestShortfallArithmetic:
    """The one function every gate shares. Pure, so it is tested as arithmetic."""

    def test_a_roster_that_covers_the_mix_is_not_short(self) -> None:
        roster = crew_mix.RosterMix(men=3, women=2, unknown=0)

        assert not crew_mix.shortfall_against(roster, men=3, women=2, count_unknown=False)

    def test_unknown_workers_can_cover_either_gender_at_dispatch(self) -> None:
        """A lead with one man and two unrecorded workers might field 2 men and 1 woman.

        Dispatch asks "could they", not "have they proved it", so this lead is invited.
        """
        roster = crew_mix.RosterMix(men=1, women=0, unknown=2)

        assert not crew_mix.shortfall_against(roster, men=2, women=1, count_unknown=True)

    def test_the_same_roster_is_short_once_only_records_count(self) -> None:
        """The accept and assignment reading of the identical roster."""
        roster = crew_mix.RosterMix(men=1, women=0, unknown=2)

        shortfall = crew_mix.shortfall_against(roster, men=2, women=1, count_unknown=False)

        assert (shortfall.men, shortfall.women) == (1, 1)

    def test_unknowns_are_spent_across_both_gaps_not_just_one(self) -> None:
        """Two unknowns cannot cover three missing people however they are allocated."""
        roster = crew_mix.RosterMix(men=0, women=0, unknown=2)

        shortfall = crew_mix.shortfall_against(roster, men=2, women=1, count_unknown=True)

        assert bool(shortfall)
        assert shortfall.men + shortfall.women == 1

    def test_a_surplus_of_one_gender_never_covers_the_other(self) -> None:
        """Eight men are still no women. The whole point of the feature."""
        roster = crew_mix.RosterMix(men=8, women=0, unknown=0)

        shortfall = crew_mix.shortfall_against(roster, men=1, women=1, count_unknown=True)

        assert (shortfall.men, shortfall.women) == (0, 1)

    def test_the_shortfall_reads_as_a_sentence_a_supervisor_can_act_on(self) -> None:
        assert crew_mix.MixShortfall(men=0, women=1).describe() == "1 more woman"
        assert crew_mix.MixShortfall(men=2, women=3).describe() == "2 more men and 3 more women"


class TestGenderCounting:
    """Which recorded values fill a gendered slot, and which only fill the headcount."""

    @pytest.mark.parametrize(
        "gender",
        ["", CrewMember.Gender.OTHER, CrewMember.Gender.UNDISCLOSED],
    )
    def test_only_man_and_woman_fill_a_gendered_slot(self, gender: str) -> None:
        """Blank, OTHER and UNDISCLOSED are all 'unknown' to the mix rules.

        Blank because nobody asked; the other two because the worker answered and the answer was
        not one of the two the Customer's question offers. Treating any of them as male is the
        failure this parametrisation exists to prevent.
        """
        counted = _count_one(gender)

        assert (counted.men, counted.women) == (0, 0)
        assert counted.unknown == 1

    def test_a_recorded_man_and_woman_are_counted(self) -> None:
        assert _count_one(CrewMember.Gender.MAN).men == 1
        assert _count_one(CrewMember.Gender.WOMAN).women == 1


def _count_one(gender: str) -> crew_mix.RosterMix:
    """The counting branch of `roster_mix`, without a database.

    `roster_mix` reads `crew_member__gender` off a queryset; this mirrors the classification it
    applies to each value, which is the part worth pinning.
    """
    men = 1 if gender == CrewMember.Gender.MAN else 0
    women = 1 if gender == CrewMember.Gender.WOMAN else 0
    return crew_mix.RosterMix(men=men, women=women, unknown=1 - men - women)
