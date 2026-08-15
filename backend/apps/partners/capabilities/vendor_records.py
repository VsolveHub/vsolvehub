"""The three small vendor-level record sets that matching and pricing read.

Languages a vendor can work in, the identity clusters that make two Partners one beneficial owner,
and the statutory minimum wage floor a day rate is checked against. Each was its own banner in the
original module and each is under a hundred lines; they are together here rather than in three
files because they share a shape — a small table somebody else's decision is scored against, with
no capability and no roster of its own.

The boundary: nothing here decides anything. `apps.requirements.matching` reads the languages and
the clusters, and the A3 rate paths read the floor.
"""

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date

from django.db import transaction

from apps.identity.hashing import keyed_hash
from apps.partners.exceptions import WageFloorError, WageFloorUnsetError
from apps.partners.models import (
    MinimumWageFloor,
    PartnerClusterMembership,
    PartnerIdentityCluster,
    PartnerLanguage,
    PartnerProfile,
    Skill,
)

# ---------------------------------------------------------------------------
# Languages a vendor can work in
# ---------------------------------------------------------------------------


def language_subtag(tag: str) -> str:
    """`te-IN` and `te` are one language. Case-folded so `TE` is too."""
    return tag.strip().split("-", 1)[0].casefold()


@transaction.atomic
def set_partner_languages(
    *,
    partner: PartnerProfile,
    language_tags: Sequence[str],
) -> list[PartnerLanguage]:
    """Replace the languages this vendor works in (`M2-BE-301`).

    A replace rather than a merge: the screen shows the whole set, so what the vendor submits is
    the whole set, and a merge would make removing a language impossible from the only UI that
    edits it. Rows are deactivated rather than deleted so a matching decision made last week can
    still be explained.
    """
    wanted = {language_subtag(tag): tag.strip() for tag in language_tags if tag.strip()}
    existing = {
        language_subtag(row.language_tag): row
        for row in PartnerLanguage.objects.filter(partner=partner)
    }

    kept: list[PartnerLanguage] = []
    for subtag, row in existing.items():
        should_be_active = subtag in wanted
        if row.is_active != should_be_active:
            row.is_active = should_be_active
            row.save(update_fields=("is_active",))
        if should_be_active:
            kept.append(row)

    for subtag, tag in wanted.items():
        if subtag not in existing:
            kept.append(PartnerLanguage.objects.create(partner=partner, language_tag=tag))
    return sorted(kept, key=lambda row: row.language_tag)


def partner_language_subtags(partner: PartnerProfile) -> set[str]:
    """The languages this vendor declared, normalised. Empty means "they never said"."""
    return {
        language_subtag(tag)
        for tag in PartnerLanguage.objects.filter(partner=partner, is_active=True).values_list(
            "language_tag", flat=True
        )
    }


# ---------------------------------------------------------------------------
# Identity clustering: one beneficial owner is one Partner for slot purposes
# ---------------------------------------------------------------------------


def cluster_signal_hash(*, signal: str, value: str) -> str:
    return keyed_hash(f"cluster:{signal}:{value}")


@transaction.atomic
def link_partner_by_signal(
    *,
    partner: PartnerProfile,
    signal: str,
    value: str,
) -> PartnerIdentityCluster:
    """Attach a Partner to the cluster that shares this signal, creating one if needed."""
    signal_hash = cluster_signal_hash(signal=signal, value=value)
    existing = (
        PartnerClusterMembership.objects.select_related("cluster")
        .filter(signal=signal, signal_hash=signal_hash)
        .first()
    )
    cluster = existing.cluster if existing else PartnerIdentityCluster.objects.create()

    PartnerClusterMembership.objects.get_or_create(
        cluster=cluster,
        partner=partner,
        defaults={"signal": signal, "signal_hash": signal_hash},
    )
    return cluster


def clustered_partner_ids(partner: PartnerProfile) -> set[uuid.UUID]:
    """Every Partner sharing a real-world identity with this one, including itself."""
    cluster_ids = PartnerClusterMembership.objects.filter(partner=partner).values_list(
        "cluster_id", flat=True
    )
    if not cluster_ids:
        return {partner.id}
    linked = PartnerClusterMembership.objects.filter(cluster_id__in=list(cluster_ids)).values_list(
        "partner_id", flat=True
    )
    return {partner.id, *linked}


# ---------------------------------------------------------------------------
# Minimum wage floor
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class WageFloorCheck:
    floor_paise_per_day: int
    source_reference: str


def live_wage_floor(*, state_code: str, skill: Skill, on_day: date) -> WageFloorCheck:
    """The floor in force on a day. Fails closed when the owner has loaded none."""
    floor = (
        MinimumWageFloor.objects.filter(
            state_code=state_code,
            skill=skill,
            effective_from__lte=on_day,
        )
        .order_by("-effective_from")
        .first()
    )
    if floor is None:
        raise WageFloorUnsetError()
    return WageFloorCheck(
        floor_paise_per_day=floor.floor_paise_per_day,
        source_reference=floor.source_reference,
    )


def assert_rate_meets_wage_floor(
    *,
    state_code: str,
    skill: Skill,
    on_day: date,
    rate_paise_per_day: int,
) -> None:
    """Reject an A3 rate below the statutory floor at submission, not after the work."""
    check = live_wage_floor(state_code=state_code, skill=skill, on_day=on_day)
    if rate_paise_per_day < check.floor_paise_per_day:
        minimum = check.floor_paise_per_day // 100
        raise WageFloorError(
            f"The daily rate must be at least ₹{minimum} for this work in {state_code}.",
        )
