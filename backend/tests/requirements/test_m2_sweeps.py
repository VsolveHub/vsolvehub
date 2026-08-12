"""The four M2 sweeps, and the one property that matters most: a replay must not double-invite.

Until 12 August 2026 these were selectors with no `CELERY_BEAT_SCHEDULE` entry, so an unanswered
invitation wave stalled forever. Every test here runs a sweep twice, because a watchdog is only
worth having if the second tick is harmless — and Celery re-drives tasks on worker loss, so the
second tick is not hypothetical.

`CELERY_TASK_ALWAYS_EAGER` is on in `config.settings.test`, so `.delay()` runs inline and each
sweep's per-record task executes for real rather than being counted.
"""

from datetime import timedelta

import pytest
from django.conf import settings
from django.utils import timezone

from apps.requirements import matching, proposals, services, tasks
from apps.requirements.models import (
    CapacityHold,
    CustomerRequirement,
    Proposal,
    RequirementAttachmentUpload,
    VendorInvitation,
)
from tests.requirements.conftest import (
    FakeAttachmentStorage,
    M2World,
    draft_requirement,
    invitation_for,
    proposal_for,
    submitted_requirement,
)

pytestmark = pytest.mark.django_db

ONE_RECORD = 1
TWO_RECORDS = 2
SHA256 = "b" * 64


def _expire_service_by(requirement: CustomerRequirement) -> None:
    """Push the needed-by date into the past without touching status.

    Set through `update()` rather than a command because no command can produce this state: a
    requirement is submitted with a future date and the date arrives by the clock moving, which a
    test cannot do.
    """
    CustomerRequirement.objects.filter(id=requirement.id).update(
        service_by=timezone.localdate() - timedelta(days=1),
    )


# ---------------------------------------------------------------------------
# `service_by` expiry
# ---------------------------------------------------------------------------


def test_the_expiry_sweep_closes_a_requirement_whose_needed_by_date_passed(
    world: M2World,
) -> None:
    requirement = submitted_requirement(world=world)
    _expire_service_by(requirement)

    swept = tasks.sweep_expired_requirements()

    requirement.refresh_from_db()
    assert swept == ONE_RECORD
    assert requirement.status == CustomerRequirement.Status.CLOSED_EXPIRED
    assert requirement.closed_reason_code == "service_by_passed"
    assert requirement.closed_at is not None


def test_the_expiry_sweep_is_idempotent_across_overlapping_runs(world: M2World) -> None:
    """The second tick must find nothing, and must not rewrite the closure it did not cause.

    `closed_at` is the assertion that matters: a sweep that re-closed an already-closed requirement
    would move the timestamp, and the timestamp is what a refund window is measured from.
    """
    requirement = submitted_requirement(world=world)
    _expire_service_by(requirement)

    tasks.sweep_expired_requirements()
    requirement.refresh_from_db()
    first_closure = requirement.closed_at

    second = tasks.sweep_expired_requirements()

    requirement.refresh_from_db()
    assert second == 0
    assert requirement.closed_at == first_closure


def test_the_expiry_sweep_leaves_an_already_closed_requirement_alone(world: M2World) -> None:
    requirement = submitted_requirement(world=world)
    services.close_requirement(
        requirement_id=requirement.id,
        status=CustomerRequirement.Status.CLOSED_NO_SUPPLY,
        reason_code="no_eligible_vendor",
    )
    _expire_service_by(requirement)

    tasks.sweep_expired_requirements()

    requirement.refresh_from_db()
    assert requirement.status == CustomerRequirement.Status.CLOSED_NO_SUPPLY, (
        "expiry must not overwrite a closure that already has a truer reason"
    )


def test_a_draft_requirement_is_never_swept(world: M2World) -> None:
    """A draft has been shown to nobody, so it has no promise to break.

    Closing one would delete an in-progress form the Customer is still filling in.
    """
    requirement = draft_requirement(world=world)
    _expire_service_by(requirement)

    swept = tasks.sweep_expired_requirements()

    requirement.refresh_from_db()
    assert swept == 0
    assert requirement.status == CustomerRequirement.Status.DRAFT


# ---------------------------------------------------------------------------
# Quote-delivery SLA breach
# ---------------------------------------------------------------------------


def test_the_sla_sweep_closes_a_requirement_past_its_delivery_promise(world: M2World) -> None:
    requirement = submitted_requirement(world=world)
    CustomerRequirement.objects.filter(id=requirement.id).update(
        quotes_due_at=timezone.now() - timedelta(hours=1),
    )

    swept = tasks.sweep_sla_breached_requirements()

    requirement.refresh_from_db()
    assert swept == ONE_RECORD
    assert requirement.status == CustomerRequirement.Status.CLOSED_SLA_BREACH
    assert requirement.closed_reason_code == "quote_delivery_sla_missed"


def test_a_requirement_with_no_delivery_promise_is_never_breached(world: M2World) -> None:
    """An owner who has approved no SLA has promised nothing, and nothing cannot be missed.

    `quotes_due_at` is nullable precisely so this state is representable — decision 2 is open, and a
    default deadline would have invented a promise to break.
    """
    requirement = submitted_requirement(world=world)
    CustomerRequirement.objects.filter(id=requirement.id).update(quotes_due_at=None)

    swept = tasks.sweep_sla_breached_requirements()

    requirement.refresh_from_db()
    assert swept == 0
    assert requirement.status == CustomerRequirement.Status.MATCHING


def test_a_requirement_that_already_has_quotes_is_not_breached(world: M2World) -> None:
    requirement = submitted_requirement(world=world)
    invitation = invitation_for(requirement=requirement, partner=world.vendor, accepted=True)
    proposal_for(invitation=invitation)
    CustomerRequirement.objects.filter(id=requirement.id).update(
        quotes_due_at=timezone.now() - timedelta(hours=1),
    )

    swept = tasks.sweep_sla_breached_requirements()

    requirement.refresh_from_db()
    assert swept == 0
    assert requirement.status == CustomerRequirement.Status.QUOTES_READY


def test_the_sla_sweep_is_idempotent(world: M2World) -> None:
    requirement = submitted_requirement(world=world)
    CustomerRequirement.objects.filter(id=requirement.id).update(
        quotes_due_at=timezone.now() - timedelta(hours=1),
    )

    tasks.sweep_sla_breached_requirements()
    assert tasks.sweep_sla_breached_requirements() == 0


# ---------------------------------------------------------------------------
# Invitation expiry and replacement — the sweep the delivery promise depends on
# ---------------------------------------------------------------------------


def test_an_unanswered_invitation_expires_and_releases_its_slot(world: M2World) -> None:
    requirement = submitted_requirement(world=world)
    invitation = invitation_for(requirement=requirement, partner=world.vendor, accepted=True)
    VendorInvitation.objects.filter(id=invitation.id).update(
        responds_by=timezone.now() - timedelta(minutes=5),
    )

    tasks.sweep_expired_invitations()

    invitation.refresh_from_db()
    hold = CapacityHold.objects.get(invitation=invitation)
    assert invitation.status == VendorInvitation.Status.EXPIRED
    assert hold.status == CapacityHold.Status.RELEASED
    assert hold.released_at is not None


def test_expiry_invites_a_replacement_for_the_slot_it_released(world: M2World) -> None:
    """The whole reason this sweep exists.

    Before it, a wave nobody answered held every quote slot until the delivery promise elapsed, and
    the Customer's only signal was silence followed by `CLOSED_SLA_BREACH`.
    """
    requirement = submitted_requirement(world=world)
    invitation = invitation_for(requirement=requirement, partner=world.vendor)
    VendorInvitation.objects.filter(id=invitation.id).update(
        responds_by=timezone.now() - timedelta(minutes=5),
    )

    tasks.sweep_expired_invitations()

    replacements = list(
        VendorInvitation.objects.filter(requirement=requirement).exclude(id=invitation.id)
    )
    assert len(replacements) == ONE_RECORD
    assert replacements[0].partner_id == world.other_vendor.id
    assert replacements[0].wave == TWO_RECORDS, "a replacement is its own wave, not a retry"


def test_a_replayed_expiry_does_not_double_invite(world: M2World) -> None:
    """The idempotency property the wave gate names explicitly.

    Celery re-drives a task whose worker died, and `autoretry_for=(Exception,)` re-runs it on any
    error. If the replacement were taken outside the transaction that moved the invitation, a retry
    would invite a second vendor for a slot that was only released once — and vendor spam is how a
    supply pool learns to ignore enquiries.
    """
    requirement = submitted_requirement(world=world)
    invitation = invitation_for(requirement=requirement, partner=world.vendor)
    VendorInvitation.objects.filter(id=invitation.id).update(
        responds_by=timezone.now() - timedelta(minutes=5),
    )

    first = matching.expire_invitation_and_replace(invitation_id=invitation.id)
    replayed = matching.expire_invitation_and_replace(invitation_id=invitation.id)
    swept_again = tasks.sweep_expired_invitations()

    assert len(first) == ONE_RECORD
    assert replayed == [], "the replay found the invitation already expired and invited nobody"
    assert swept_again == 0, "and the next tick has nothing left to sweep"
    assert VendorInvitation.objects.filter(requirement=requirement).count() == TWO_RECORDS


def test_expiry_invites_nobody_when_the_requirement_has_closed(world: M2World) -> None:
    requirement = submitted_requirement(world=world)
    invitation = invitation_for(requirement=requirement, partner=world.vendor)
    VendorInvitation.objects.filter(id=invitation.id).update(
        responds_by=timezone.now() - timedelta(minutes=5),
    )
    services.close_requirement(
        requirement_id=requirement.id,
        status=CustomerRequirement.Status.CLOSED_EXPIRED,
        reason_code="service_by_passed",
    )

    tasks.sweep_expired_invitations()

    invitation.refresh_from_db()
    assert invitation.status == VendorInvitation.Status.EXPIRED
    assert VendorInvitation.objects.filter(requirement=requirement).count() == ONE_RECORD


def test_an_invitation_with_no_deadline_never_expires(world: M2World) -> None:
    """`responds_by` is nullable because the SLA is an open owner decision.

    A null deadline must read as "no deadline", not as "expired at the epoch".
    """
    requirement = submitted_requirement(world=world)
    invitation = invitation_for(requirement=requirement, partner=world.vendor)
    VendorInvitation.objects.filter(id=invitation.id).update(responds_by=None)

    swept = tasks.sweep_expired_invitations()

    invitation.refresh_from_db()
    assert swept == 0
    assert invitation.status == VendorInvitation.Status.INVITED


def test_a_declined_invitation_is_not_expired_over(world: M2World) -> None:
    requirement = submitted_requirement(world=world)
    invitation = invitation_for(requirement=requirement, partner=world.vendor)
    matching.decline_invitation(invitation_id=invitation.id, reason_code="too-far")
    VendorInvitation.objects.filter(id=invitation.id).update(
        responds_by=timezone.now() - timedelta(minutes=5),
    )

    tasks.sweep_expired_invitations()

    invitation.refresh_from_db()
    assert invitation.status == VendorInvitation.Status.DECLINED
    assert invitation.decline_reason_code == "too-far", (
        "the decline reason is what replacement and vendor standing are argued from"
    )


# ---------------------------------------------------------------------------
# Proposal validity
# ---------------------------------------------------------------------------


def test_the_proposal_sweep_expires_a_quote_past_its_validity(world: M2World) -> None:
    requirement = submitted_requirement(world=world)
    invitation = invitation_for(requirement=requirement, partner=world.vendor, accepted=True)
    proposal = proposal_for(invitation=invitation)
    Proposal.objects.filter(id=proposal.id).update(
        valid_until=timezone.now() - timedelta(hours=1),
    )

    swept = tasks.sweep_expired_proposals()

    proposal.refresh_from_db()
    assert swept == ONE_RECORD
    assert proposal.status == Proposal.Status.EXPIRED
    assert proposal.is_selectable is False


def test_expiring_a_quote_does_not_move_the_requirement_backwards(world: M2World) -> None:
    """`QUOTES_READY -> MATCHING` is not a transition the state machine carries.

    The unlock command re-checks that a usable quote is still live, which is the moment the answer
    actually matters. Inventing the reverse transition in a sweep would put a state change in the
    system that §1 of the state-machine document does not describe.
    """
    requirement = submitted_requirement(world=world)
    invitation = invitation_for(requirement=requirement, partner=world.vendor, accepted=True)
    proposal = proposal_for(invitation=invitation)
    requirement.refresh_from_db()
    assert requirement.status == CustomerRequirement.Status.QUOTES_READY
    Proposal.objects.filter(id=proposal.id).update(
        valid_until=timezone.now() - timedelta(hours=1),
    )

    tasks.sweep_expired_proposals()

    requirement.refresh_from_db()
    assert requirement.status == CustomerRequirement.Status.QUOTES_READY


def test_a_superseded_quote_is_not_expired_again(world: M2World) -> None:
    """Supersession already retired it, and the original figures must stay as they were."""
    requirement = submitted_requirement(world=world)
    invitation = invitation_for(requirement=requirement, partner=world.vendor, accepted=True)
    first = proposal_for(invitation=invitation)
    proposal_for(invitation=invitation)
    Proposal.objects.filter(id=first.id).update(
        valid_until=timezone.now() - timedelta(hours=1),
    )

    tasks.sweep_expired_proposals()

    first.refresh_from_db()
    assert first.status == Proposal.Status.SUPERSEDED


def test_the_proposal_sweep_is_idempotent(world: M2World) -> None:
    requirement = submitted_requirement(world=world)
    invitation = invitation_for(requirement=requirement, partner=world.vendor, accepted=True)
    proposal = proposal_for(invitation=invitation)
    Proposal.objects.filter(id=proposal.id).update(
        valid_until=timezone.now() - timedelta(hours=1),
    )

    tasks.sweep_expired_proposals()
    second = tasks.sweep_expired_proposals()

    assert second == 0
    assert proposals.expire_proposal(proposal_id=proposal.id).status == Proposal.Status.EXPIRED


# ---------------------------------------------------------------------------
# Attachment upload housekeeping
# ---------------------------------------------------------------------------


def test_the_orphan_sweep_marks_an_abandoned_upload_and_deletes_its_bytes(
    world: M2World,
    attachment_storage: FakeAttachmentStorage,
) -> None:
    requirement = draft_requirement(world=world)
    upload = RequirementAttachmentUpload.objects.create(
        requirement=requirement,
        kind="IMAGE",
        object_key=f"requirements/{requirement.id}/image/orphan.jpg",
        content_type="image/jpeg",
        size_bytes=2048,
        sha256=SHA256,
        expires_at=timezone.now() - timedelta(minutes=1),
    )

    swept = tasks.sweep_orphaned_attachment_uploads()

    upload.refresh_from_db()
    assert swept == ONE_RECORD
    assert upload.status == RequirementAttachmentUpload.Status.EXPIRED
    assert upload.failure_code == "upload_expired"
    assert upload.object_key in attachment_storage.deleted_keys


def test_the_orphan_sweep_is_idempotent(world: M2World) -> None:
    requirement = draft_requirement(world=world)
    RequirementAttachmentUpload.objects.create(
        requirement=requirement,
        kind="IMAGE",
        object_key=f"requirements/{requirement.id}/image/orphan.jpg",
        content_type="image/jpeg",
        size_bytes=2048,
        sha256=SHA256,
        expires_at=timezone.now() - timedelta(minutes=1),
    )

    tasks.sweep_orphaned_attachment_uploads()
    assert tasks.sweep_orphaned_attachment_uploads() == 0


def test_a_live_upload_intent_is_not_swept(world: M2World) -> None:
    requirement = draft_requirement(world=world)
    upload = RequirementAttachmentUpload.objects.create(
        requirement=requirement,
        kind="IMAGE",
        object_key=f"requirements/{requirement.id}/image/live.jpg",
        content_type="image/jpeg",
        size_bytes=2048,
        sha256=SHA256,
        expires_at=timezone.now() + timedelta(hours=1),
    )

    swept = tasks.sweep_orphaned_attachment_uploads()

    upload.refresh_from_db()
    assert swept == 0
    assert upload.status == RequirementAttachmentUpload.Status.ISSUED


# ---------------------------------------------------------------------------
# The schedule itself
# ---------------------------------------------------------------------------


def test_every_m2_sweep_is_wired_to_celery_beat() -> None:
    """The gap this whole module closes, asserted as configuration rather than as code.

    Four working selectors with no schedule behind them is indistinguishable from four broken ones,
    and that is exactly the state the codebase was in until 12 August. Naming the task paths here
    means renaming a sweep without updating the schedule fails a test instead of silently unwiring a
    watchdog.
    """
    scheduled = {entry["task"] for entry in settings.CELERY_BEAT_SCHEDULE.values()}

    assert "apps.requirements.tasks.sweep_expired_requirements" in scheduled
    assert "apps.requirements.tasks.sweep_sla_breached_requirements" in scheduled
    assert "apps.requirements.tasks.sweep_expired_invitations" in scheduled
    assert "apps.requirements.tasks.sweep_expired_proposals" in scheduled
    assert "apps.requirements.tasks.sweep_orphaned_attachment_uploads" in scheduled
