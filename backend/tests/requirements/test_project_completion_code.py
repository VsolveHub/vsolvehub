"""Project completion is a Customer-held OTP, not evidence-upload theatre."""

from datetime import timedelta
from http import HTTPStatus

import pytest
from django.core.cache import cache
from django.utils import timezone

from apps.requirements import engagements, proposals
from apps.requirements.models import (
    CustomerRequirement,
    Engagement,
    EngagementStage,
    M2AccessPrice,
    ProjectCompletionOtp,
    Proposal,
    SiteVisit,
    VisitPlan,
)
from apps.requirements.projects.completion import (
    ProjectCompletionCodeInvalidError,
    confirm_project_completion_with_code,
    issue_project_completion_code,
)
from tests.requirements.conftest import (
    M2World,
    invitation_for,
    site_visit_for,
    submitted_requirement,
)

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture(autouse=True)
def _clear_completion_code_cache() -> None:
    cache.clear()


def _funded_project(world: M2World) -> Engagement:
    requirement = submitted_requirement(
        world=world,
        archetype=world.project_variant.booking_archetype,
    )
    invitation = invitation_for(requirement=requirement, partner=world.vendor, accepted=True)
    price = M2AccessPrice.objects.create(
        kind=M2AccessPrice.Kind.A5_VISIT_PLAN,
        plan_size=1,
        amount_paise=19_900,
        vendor_payout_basis_points=8000,
        effective_from=timezone.localdate(),
        source_reference="completion code regression",
    )
    VisitPlan.objects.create(
        requirement=requirement,
        plan_size=1,
        price=price,
        price_paise=price.amount_paise,
        vendor_payout_basis_points=8000,
        status=VisitPlan.Status.ACTIVE,
        charged_at=timezone.now(),
    )
    visit = site_visit_for(invitation=invitation)
    visit.status = SiteVisit.Status.COMPLETED
    visit.completed_at = timezone.now()
    visit.save(update_fields=("status", "completed_at", "updated_at"))
    proposal = proposals.submit_proposal(
        invitation_id=invitation.id,
        total_paise=4_500_000,
        tax_basis=Proposal.TaxBasis.INCLUSIVE,
        stages=[{"name": "Prep", "amount_paise": 4_500_000}],
        valid_until=timezone.now() + timedelta(days=7),
        site_visit_id=visit.id,
    )
    selection = engagements.select_proposal(
        requirement_id=requirement.id,
        proposal_id=proposal.id,
        actor=world.customer,
    )
    engagement = engagements.reconfirm_selection(selection_id=selection.id)
    EngagementStage.objects.filter(engagement=engagement).update(
        funding_state=EngagementStage.FundingState.FUNDED,
        funded_paise=proposal.total_paise,
    )
    Engagement.objects.filter(pk=engagement.id).update(
        status=Engagement.Status.ACTIVE,
        funded_total_paise=proposal.total_paise,
        work_may_start_at=timezone.now(),
        contact_released_at=timezone.now(),
    )
    return Engagement.objects.get(pk=engagement.id)


def test_database_stores_only_a_hash_and_partner_cannot_read_the_code(world: M2World) -> None:
    engagement = _funded_project(world)

    issued = issue_project_completion_code(
        engagement_id=engagement.id,
        customer=world.customer,
    )

    challenge = ProjectCompletionOtp.objects.get(engagement=engagement)
    assert issued.digits is not None
    assert issued.digits not in challenge.code_hash
    response = world.vendor_client.get(f"/api/v1/engagements/{engagement.id}/completion-code/")
    assert response.status_code == HTTPStatus.NOT_FOUND


def test_wrong_code_spends_an_attempt_even_though_completion_is_refused(world: M2World) -> None:
    engagement = _funded_project(world)
    issue_project_completion_code(engagement_id=engagement.id, customer=world.customer)

    with pytest.raises(ProjectCompletionCodeInvalidError):
        confirm_project_completion_with_code(
            engagement_id=engagement.id,
            partner_user=world.vendor.user,
            code="000000",
        )

    assert ProjectCompletionOtp.objects.get(engagement=engagement).failed_attempts == 1


def test_customer_code_closes_all_stages_without_evidence(world: M2World) -> None:
    engagement = _funded_project(world)
    issued = issue_project_completion_code(
        engagement_id=engagement.id,
        customer=world.customer,
    )

    completed = confirm_project_completion_with_code(
        engagement_id=engagement.id,
        partner_user=world.vendor.user,
        code=issued.digits or "",
    )

    assert completed.status in (Engagement.Status.COMPLETED, Engagement.Status.WARRANTY)
    assert not completed.stages.exclude(status=EngagementStage.Status.RELEASED).exists()
    completed.requirement.refresh_from_db()
    assert completed.requirement.status == CustomerRequirement.Status.CLOSED_COMPLETE
    challenge = ProjectCompletionOtp.objects.get(engagement=engagement)
    assert challenge.consumed_at is not None
    assert challenge.consumed_by_id == world.vendor.user_id


def test_another_partner_cannot_complete_the_project(world: M2World) -> None:
    engagement = _funded_project(world)
    issued = issue_project_completion_code(
        engagement_id=engagement.id,
        customer=world.customer,
    )

    response = world.other_vendor_client.post(
        f"/api/v1/partner/engagements/{engagement.id}/completion/",
        {"code": issued.digits},
        format="json",
        HTTP_IDEMPOTENCY_KEY="foreign-partner-completion",
    )

    assert response.status_code == HTTPStatus.NOT_FOUND


def test_customer_cannot_bypass_the_partner_code_entry(world: M2World) -> None:
    engagement = _funded_project(world)

    response = world.customer_client.post(
        f"/api/v1/engagements/{engagement.id}/completion/",
        {},
        format="json",
        HTTP_IDEMPOTENCY_KEY="customer-project-completion-bypass",
    )

    assert response.status_code == HTTPStatus.CONFLICT
    assert response.data["code"] == "m2_stage_transition_not_allowed"
