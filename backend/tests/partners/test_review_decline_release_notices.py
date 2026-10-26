"""Operations can decline, hand a review back to the queue, and every decision tells the Partner.

Gaps from the partner onboarding audit:

- There was no way to decline an applicant — only to request changes, forever.
- A claimed application could be finished only by its claimer; if they were away it was stuck.
- No decision reached the Partner; they found out only by signing in.
"""

from http import HTTPStatus
from typing import Any

import pytest

from apps.identity.models import Role, User, UserRole
from apps.notifications.models import NotificationIntent
from apps.partners.models import PartnerApplication, PartnerApplicationTransition
from tests.helpers import force_role_client
from tests.partners.conftest import PartnerSetup
from tests.partners.test_operations_and_presence import (
    _approve_application,
    _submitted_application,
)

pytestmark = pytest.mark.django_db


def _ops(phone: str = "+919900000777") -> Any:
    user = User.objects.create_user(phone_number=phone, full_name="Second Reviewer")
    role, _ = Role.objects.get_or_create(
        code="operations", defaults={"name": "Operations", "is_system": True}
    )
    UserRole.objects.create(user=user, role=role)
    return force_role_client(user=user, role_code="operations")


def _transition(client: Any, application: PartnerApplication, target: str, reason: str = "") -> Any:
    application.refresh_from_db()
    body: dict[str, Any] = {"expected_version": application.version, "target_status": target}
    if reason:
        body["reason"] = reason
    return client.post(
        f"/api/v1/operations/partner-applications/{application.id}/transition/",
        body,
        format="json",
    )


def _release(client: Any, application: PartnerApplication) -> Any:
    application.refresh_from_db()
    return client.post(
        f"/api/v1/operations/partner-applications/{application.id}/release/",
        {"expected_version": application.version},
        format="json",
    )


def _under_review(setup: PartnerSetup, operations_user: User) -> tuple[PartnerApplication, Any]:
    application, _document = _submitted_application(setup)
    client = force_role_client(user=operations_user, role_code="operations")
    assert _transition(client, application, "UNDER_REVIEW").status_code == HTTPStatus.OK
    application.refresh_from_db()
    return application, client


def _notices(setup: PartnerSetup) -> list[NotificationIntent]:
    return list(
        NotificationIntent.objects.filter(recipient=setup.user).order_by("created_at", "id")
    )


# --- decline ------------------------------------------------------------------------------------


def test_decline_needs_a_reason(partner_setup: PartnerSetup, operations_user: User) -> None:
    application, client = _under_review(partner_setup, operations_user)

    refused = _transition(client, application, "DECLINED")

    assert refused.status_code == HTTPStatus.CONFLICT
    assert refused.json()["error"]["code"] == "partner_transition_not_allowed"


def test_a_declined_application_is_final(
    partner_setup: PartnerSetup, operations_user: User
) -> None:
    application, client = _under_review(partner_setup, operations_user)

    declined = _transition(client, application, "DECLINED", "The ID photo does not match.")

    assert declined.status_code == HTTPStatus.OK, declined.json()
    application.refresh_from_db()
    assert application.status == PartnerApplication.Status.DECLINED
    resubmit = partner_setup.client.post(
        "/api/v1/partner/application/submit/",
        {"expected_version": application.version},
        format="json",
    )
    assert resubmit.status_code == HTTPStatus.CONFLICT
    # Nothing Operations can do re-opens it either.
    assert _transition(client, application, "APPROVED").status_code == HTTPStatus.CONFLICT


def test_only_the_reviewer_holding_it_can_decline(
    partner_setup: PartnerSetup, operations_user: User
) -> None:
    application, _client = _under_review(partner_setup, operations_user)

    refused = _transition(_ops(), application, "DECLINED", "Not suitable.")

    assert refused.status_code == HTTPStatus.CONFLICT


# --- release ------------------------------------------------------------------------------------


def test_another_reviewer_can_release_and_then_claim(
    partner_setup: PartnerSetup, operations_user: User
) -> None:
    application, _client = _under_review(partner_setup, operations_user)
    other = _ops()

    released = _release(other, application)

    assert released.status_code == HTTPStatus.OK, released.json()
    application.refresh_from_db()
    assert application.status == PartnerApplication.Status.SUBMITTED
    assert application.review_assigned_to_id is None
    assert PartnerApplicationTransition.objects.filter(
        application=application, reason_code="application_review_released"
    ).exists()
    claimed = _transition(other, application, "UNDER_REVIEW")
    assert claimed.status_code == HTTPStatus.OK, claimed.json()


def test_releasing_an_unheld_application_is_refused(
    partner_setup: PartnerSetup, operations_user: User
) -> None:
    application, _document = _submitted_application(partner_setup)
    client = force_role_client(user=operations_user, role_code="operations")

    refused = _release(client, application)

    assert refused.status_code == HTTPStatus.CONFLICT


def test_a_partner_cannot_release(partner_setup: PartnerSetup, operations_user: User) -> None:
    application, _client = _under_review(partner_setup, operations_user)

    refused = _release(partner_setup.client, application)

    assert refused.status_code == HTTPStatus.FORBIDDEN


# --- notices ------------------------------------------------------------------------------------


def test_a_change_request_tells_the_partner_what_to_fix(
    partner_setup: PartnerSetup, operations_user: User
) -> None:
    application, client = _under_review(partner_setup, operations_user)

    response = _transition(client, application, "CHANGES_REQUIRED", "Upload a clearer ID photo.")

    assert response.status_code == HTTPStatus.OK, response.json()
    notice = _notices(partner_setup)[-1]
    assert notice.template_code == "partner_application_changes_required"
    assert notice.channel == NotificationIntent.Channel.IN_APP
    assert notice.context == {"reason": "Upload a clearer ID photo."}


def test_a_decline_tells_the_partner_but_keeps_the_reason_internal(
    partner_setup: PartnerSetup, operations_user: User
) -> None:
    application, client = _under_review(partner_setup, operations_user)

    _transition(client, application, "DECLINED", "Suspected forged document.")

    notice = _notices(partner_setup)[-1]
    assert notice.template_code == "partner_application_declined"
    assert "forged" not in str(notice.context)


def test_approval_suspension_and_reinstatement_each_send_one_notice(
    partner_setup: PartnerSetup, operations_user: User
) -> None:
    application = _approve_application(partner_setup, operations_user)
    client = force_role_client(user=operations_user, role_code="operations")
    assert _transition(client, application, "SUSPENDED", "Customer complaints.").status_code == (
        HTTPStatus.OK
    )
    assert _transition(client, application, "APPROVED", "Resolved.").status_code == HTTPStatus.OK

    templates = [notice.template_code for notice in _notices(partner_setup)]

    assert templates[-3:] == [
        "partner_application_approved",
        "partner_account_suspended",
        "partner_account_reinstated",
    ]
