"""Shared plumbing.

The archetype constant and the four primitives every A5 command in this package opens with:
locking an engagement together with the related rows its callers always need, refusing an A3
booking, refusing a project that is no longer open to changes, and resolving a milestone that
really does belong to the project in hand.

The boundary is "checks that decide nothing". Nothing here writes a row, moves money or touches a
schedule; each function either returns the record asked for or raises. This module is the bottom
of the package's dependency arrow — it imports from the rest of `apps.requirements` but never from
its own siblings, so there is no import cycle.
"""

import uuid
from typing import Final

from apps.catalog.models import ServiceVariant
from apps.requirements.exceptions import StageTransitionError
from apps.requirements.models import Engagement, EngagementStage

A5: Final = ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT


def _locked_engagement(engagement_id: uuid.UUID) -> Engagement:
    return (
        Engagement.objects.select_for_update(of=("self",))
        .select_related("requirement__configuration", "requirement__service_area", "partner")
        .get(pk=engagement_id)
    )


def assert_project_engagement(engagement: Engagement) -> None:
    """Refuse an A3 engagement, and say which surface it belongs on.

    The mirror of `workforce._assert_workforce_stage`, and the reason is the same in reverse: one
    spine, two archetypes, and a route that quietly did nothing on the wrong one would leave a
    client believing it had recorded something.
    """
    if engagement.archetype != A5:
        raise StageTransitionError(
            "This is a workforce booking, not a project. Its days are on the shift-day screen.",
        )


def _assert_engagement_open(engagement: Engagement) -> None:
    if engagement.status not in (
        Engagement.Status.PENDING_START,
        Engagement.Status.ACTIVE,
        Engagement.Status.DISPUTED,
    ):
        raise StageTransitionError("This project is no longer open to changes.")


def _project_stage(*, engagement: Engagement, stage_id: uuid.UUID) -> EngagementStage:
    stage = EngagementStage.objects.filter(pk=stage_id, engagement=engagement).first()
    if stage is None:
        raise StageTransitionError("That milestone does not belong to this project.")
    return stage
