"""The closing date is derived, not asked for.

`service_by` was a required field on both capture flows, phrased as "pick the date the job stops
being useful, not your ideal date" — a hard question about the Customer's own patience, sitting one
field below a start date that already answers it. It is now derived at submission.

What must not be lost with the field: `service_by` is the only deadline closing depends on.
`expired_requirement_ids` sweeps on it and `operations.extend_deadline` moves it, so a requirement
that reached `MATCHING` without one would stay open forever.
"""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.catalog.models import ServiceVariant
from apps.requirements import services
from apps.requirements.exceptions import RequirementIncompleteError
from apps.requirements.models import CustomerRequirement

from .conftest import M2World, draft_requirement, submitted_requirement

pytestmark = pytest.mark.django_db


def test_submitting_fills_the_closing_date_from_the_start_day(world: M2World) -> None:
    """The day the work was meant to begin is the day it stops being worth finding a crew for."""
    requirement = submitted_requirement(world=world)

    assert requirement.service_by is not None
    assert requirement.service_by == timezone.localtime(requirement.requested_start).date()


def test_a_draft_with_no_closing_date_submits(world: M2World) -> None:
    """The regression. The client stopped sending one before the guard stopped demanding it.

    `_assert_submittable` listed `service_by` among the missing fields and ran *before* the
    derivation, so every submission refused with `m2_requirement_incomplete: "Add the date you need
    it by."` — naming a field no screen shows any more. Deriving first is what makes the guard and
    the saved value read the same thing.
    """
    requirement = draft_requirement(world=world)
    CustomerRequirement.objects.filter(pk=requirement.pk).update(service_by=None)
    requirement.refresh_from_db()
    assert requirement.service_by is None

    submitted = services.submit_requirement(
        requirement=requirement, actor=world.customer, allow_duplicate=True
    )

    assert submitted.status == CustomerRequirement.Status.MATCHING
    assert submitted.service_by is not None


def test_a_missing_start_date_is_reported_as_the_start_date(world: M2World) -> None:
    """The honest half of the same guard.

    With no start there is no closing date to derive, and the Customer must still be told — but in
    the terms of the field they can actually see. Naming the derived one would send them looking
    for an input that no longer exists.
    """
    requirement = draft_requirement(world=world)
    CustomerRequirement.objects.filter(pk=requirement.pk).update(
        requested_start=None, service_by=None
    )
    requirement.refresh_from_db()

    with pytest.raises(RequirementIncompleteError) as refusal:
        services.submit_requirement(
            requirement=requirement, actor=world.customer, allow_duplicate=True
        )

    assert "when it should start" in str(refusal.value)
    assert "need it by" not in str(refusal.value)


def test_the_sweep_can_still_find_a_derived_requirement(world: M2World) -> None:
    """The point of keeping the column. A derived date must close a request like a typed one.

    Guards the failure this change could plausibly have introduced: dropping the field from the
    form, forgetting the derivation, and leaving every request alive forever with nothing in the
    sweep's `service_by__isnull=False` filter to catch it.
    """
    requirement = submitted_requirement(world=world)
    CustomerRequirement.objects.filter(pk=requirement.pk).update(
        service_by=timezone.localdate() - timedelta(days=1)
    )

    assert requirement.id in services.expired_requirement_ids()


def test_an_explicit_date_is_a_default_not_an_override(world: M2World) -> None:
    """Operations may set one before submission, and deriving must not overwrite it."""
    requirement = draft_requirement(world=world)
    chosen = timezone.localdate() + timedelta(days=45)
    CustomerRequirement.objects.filter(pk=requirement.pk).update(service_by=chosen)
    requirement.refresh_from_db()

    submitted = services.submit_requirement(
        requirement=requirement, actor=world.customer, allow_duplicate=True
    )

    assert submitted.service_by == chosen


def test_both_archetypes_get_one(world: M2World) -> None:
    """A5 lost the field too, so the derivation cannot be an A3-only rule."""
    project = submitted_requirement(
        world=world, archetype=ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT
    )

    assert project.service_by is not None
    assert project.service_by == timezone.localtime(project.requested_start).date()
