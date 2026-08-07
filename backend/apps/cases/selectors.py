"""Aggregate reads over the case queue.

The Operations home screen answers "what needs me, and what is on fire" — questions about the
*whole* queue, not about a page of it. Reading them off the cursor-paginated list would answer
them for the first fifty rows and present the result as a total, which is worse than showing
nothing: a queue of two hundred would report a calm fifty.

So the counting happens in the database. Five aggregate queries for the whole screen, none of
them proportional to queue size, and every number is the real one.
"""

from dataclasses import dataclass
from datetime import timedelta

from django.conf import settings
from django.db.models import Count, Q
from django.utils import timezone

from apps.cases.models import TERMINAL_CASE_STATUSES, OperationsCase
from apps.identity.models import User


@dataclass(frozen=True, slots=True)
class TeamQueue:
    owner_team: str
    open: int
    unclaimed: int


@dataclass(frozen=True, slots=True)
class CaseQueueSummary:
    breaching_sla: int
    #: How far past its deadline the worst one is, so the card can say something specific
    #: instead of a bare count. `None` when nothing is breaching.
    oldest_overdue_minutes: int | None
    mine_open: int
    mine_due_soon: int
    holding_payout: int
    teams: tuple[TeamQueue, ...]


def _live() -> Q:
    """Cases still being worked. A resolved case is history, not queue depth."""

    return ~Q(status__in=tuple(TERMINAL_CASE_STATUSES))


def case_queue_summary(*, viewer: User) -> CaseQueueSummary:
    """The Operations home screen's numbers, counted across the whole queue.

    Five queries, independent of queue size: the live rollup, the viewer's own rollup, the
    oldest breach, and the per-team rollup. Stated here because this is a dashboard endpoint —
    it is polled, and a query count that grew with the queue would make the home screen the
    most expensive page in the console.
    """

    now = timezone.now()
    due_soon_before = now + timedelta(minutes=settings.M1_CASE_DUE_SOON_MINUTES)
    live = _live()

    totals = OperationsCase.objects.aggregate(
        breaching_sla=Count("id", filter=live & Q(due_at__lt=now)),
        holding_payout=Count("id", filter=live & Q(holds_payout=True)),
    )
    mine = OperationsCase.objects.filter(owner=viewer).aggregate(
        open=Count("id", filter=live),
        # "Nearing deadline" means still ahead of it. A case already overdue is counted by the
        # breach card, and counting it in both would double-report the same problem.
        due_soon=Count("id", filter=live & Q(due_at__gte=now, due_at__lte=due_soon_before)),
    )
    oldest_due_at = (
        OperationsCase.objects.filter(live, due_at__lt=now)
        .order_by("due_at")
        .values_list("due_at", flat=True)
        .first()
    )
    per_team = {
        row["owner_team"]: row
        for row in OperationsCase.objects.filter(live)
        .values("owner_team")
        .annotate(open=Count("id"), unclaimed=Count("id", filter=Q(owner__isnull=True)))
    }

    return CaseQueueSummary(
        breaching_sla=totals["breaching_sla"],
        oldest_overdue_minutes=(
            int((now - oldest_due_at).total_seconds() // 60) if oldest_due_at is not None else None
        ),
        mine_open=mine["open"],
        mine_due_soon=mine["due_soon"],
        holding_payout=totals["holding_payout"],
        # Every team, including the ones with nothing waiting. A team that vanishes from the
        # board when its queue empties reads as a team that stopped existing, and an operator
        # cannot tell "zero" from "not loaded".
        teams=tuple(
            TeamQueue(
                owner_team=team.value,
                open=per_team.get(team.value, {}).get("open", 0),
                unclaimed=per_team.get(team.value, {}).get("unclaimed", 0),
            )
            for team in OperationsCase.Team
        ),
    )
