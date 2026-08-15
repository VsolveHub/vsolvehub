"""Integrity signals and behavioural evidence: who is really one Partner, and how they behaved.

The tail of the M2 capability foundation (A3_TIME_BLOCK and A5_CUSTOM_PROJECT) whose banner opens
`capabilities`. This slice holds the identity cluster that collapses several accounts belonging to
one beneficial owner, the signal-bearing memberships of that cluster, the statutory wage floor an
A3 proposal is measured against, and the immutable standing event that records one thing a vendor
did.

The boundary: nothing here authorises or blocks work by itself. `apps.partners.standing` reads
these rows to answer "is there a pattern"; the capability decision that follows lives in
`capabilities`.
"""

import uuid
from typing import Any

from django.db import models
from django.utils import timezone


class PartnerIdentityCluster(models.Model):
    """Partner accounts that share a real-world identity signal.

    A cluster counts as one Partner for quote-slot purposes, so one beneficial owner
    cannot occupy two competing slots on the same requirement.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return f"cluster:{self.id}"


class PartnerClusterMembership(models.Model):
    class Signal(models.TextChoices):
        PHONE = "PHONE", "Shared phone"
        PAN = "PAN", "Shared PAN"
        BANK_ACCOUNT = "BANK_ACCOUNT", "Shared bank account"
        DEVICE = "DEVICE", "Shared device"
        OPERATIONS = "OPERATIONS", "Operations decision"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    cluster = models.ForeignKey(
        PartnerIdentityCluster,
        on_delete=models.PROTECT,
        related_name="memberships",
    )
    partner = models.ForeignKey(
        "partners.PartnerProfile",
        on_delete=models.PROTECT,
        related_name="cluster_memberships",
    )
    signal = models.CharField(max_length=16, choices=Signal.choices)
    signal_hash = models.CharField(max_length=64)
    linked_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ("cluster", "linked_at")
        constraints = [
            models.UniqueConstraint(
                fields=("cluster", "partner"),
                name="partners_unique_cluster_membership",
            ),
        ]
        indexes = [
            models.Index(fields=("partner",)),
            models.Index(fields=("signal", "signal_hash")),
        ]

    def __str__(self) -> str:
        return f"{self.cluster_id}:{self.partner_id}:{self.signal}"


class MinimumWageFloor(models.Model):
    """Statutory daily wage floor by state and skill.

    Values are Operations-loaded reference data. An A3 proposal below the live floor
    is rejected server-side; the platform, not only the vendor, carries that exposure.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    state_code = models.CharField(max_length=8)
    skill = models.ForeignKey(
        "partners.Skill",
        on_delete=models.PROTECT,
        related_name="wage_floors",
    )
    floor_paise_per_day = models.PositiveBigIntegerField()
    effective_from = models.DateField()
    source_reference = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("state_code", "skill", "-effective_from")
        constraints = [
            models.UniqueConstraint(
                fields=("state_code", "skill", "effective_from"),
                name="partners_unique_wage_floor_version",
            ),
            models.CheckConstraint(
                condition=models.Q(floor_paise_per_day__gt=0),
                name="partners_wage_floor_positive",
            ),
        ]
        indexes = [
            models.Index(fields=("state_code", "skill", "effective_from")),
        ]

    def __str__(self) -> str:
        return f"{self.state_code}:{self.skill_id}:{self.floor_paise_per_day}"


class PartnerStandingEvent(models.Model):
    """One recorded fact about how a vendor behaved, and nothing more (Wave C4).

    ADR-0009 asks three separate things to "hit standing": a short crew day, a cash extra demanded
    on site, and a vendor no-show. Until this table there was nowhere to put any of them, so all
    three were sentences in docstrings — `booking_fees.report_crew_no_show` says the standing takes
    the hit and then does not take it.

    Three properties, each of which is the point:

    * **It is an event, not a score.** No number is stored, decayed or displayed. A score invites
      the question "what is mine?" from vendors and "why did it move?" from Operations, and neither
      has an answer this platform can defend. A count of named events inside a named window does.
    * **It is immutable, and one event per source row.** `source_id` is the row that caused it — a
      settlement, a report, a booking — and the partial unique index makes a re-driven command find
      its own event instead of writing a second one. Standing that can be edited, or double-counted
      by a retry, is not evidence.
    * **It carries no FK into `apps.requirements`.** That app imports this one; the reverse would
      be a cycle. `source_kind` plus `source_id` is the honest shape for a reference across that
      boundary, and it is deliberately not a `GenericForeignKey` — nothing here needs to *follow*
      the reference, only to prove which row it came from.

    A report is never proof on its own. `apps.partners.standing` reads these to answer "is there a
    pattern", against thresholds the owner has not set yet; while they are unset nothing at all
    happens to the vendor and the events simply accumulate, which is the fail-closed direction.
    """

    class Kind(models.TextChoices):
        CREW_SHORTFALL = "CREW_SHORTFALL", "Fewer workers arrived than were booked"
        CASH_DEMAND_REPORTED = "CASH_DEMAND_REPORTED", "A Customer reported a cash extra demanded"
        VENDOR_NO_SHOW = "VENDOR_NO_SHOW", "The crew did not arrive at all"
        #: Wave C5 (`M2-BE-545`). A project the vendor stopped working on, recorded when
        #: Operations transfers the remaining milestones to somebody else or ends the project
        #: early. Written by `apps.requirements.projects` and, like every other kind here, it is a
        #: record rather than a verdict: no threshold acts on it yet, because the owner has not
        #: said how many abandoned projects make a pattern.
        PROJECT_ABANDONED = "PROJECT_ABANDONED", "The vendor stopped working on a project"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.ForeignKey(
        "partners.PartnerProfile",
        on_delete=models.PROTECT,
        related_name="standing_events",
    )
    kind = models.CharField(max_length=24, choices=Kind.choices)
    #: Which table the causing row lives in, as a slug. Written by the command that records the
    #: event so an Operations reader can find it without guessing.
    source_kind = models.SlugField(max_length=40)
    source_id = models.UUIDField(null=True, blank=True)
    #: What happened, in one line, for the Operations queue. Never a judgement.
    reason = models.CharField(max_length=240, blank=True)
    occurred_at = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-occurred_at", "id")
        constraints = [
            models.UniqueConstraint(
                fields=("kind", "source_id"),
                condition=models.Q(source_id__isnull=False),
                name="partners_one_standing_event_per_source",
            ),
        ]
        indexes = [
            models.Index(fields=("partner", "kind", "occurred_at")),
        ]

    def __str__(self) -> str:
        return f"{self.partner_id}:{self.kind}"

    def save(self, *args: Any, **kwargs: Any) -> None:
        if not self._state.adding:
            raise ValueError("A standing event is immutable.")
        super().save(*args, **kwargs)
