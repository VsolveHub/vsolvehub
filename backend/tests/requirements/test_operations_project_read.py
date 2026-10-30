"""Operations reads a project it is not party to, and finds it from the request."""

from http import HTTPStatus

import pytest

from tests.requirements.conftest import M2World
from tests.requirements.test_project_completion_code import _funded_project

pytestmark = pytest.mark.django_db(transaction=True)


def test_operations_reads_the_project_the_participant_route_hides(world: M2World) -> None:
    engagement = _funded_project(world)

    hidden = world.operations_client.get(f"/api/v1/engagements/{engagement.id}/project/")
    assert hidden.status_code == HTTPStatus.NOT_FOUND

    response = world.operations_client.get(
        f"/api/v1/operations/engagements/{engagement.id}/project/"
    )
    assert response.status_code == HTTPStatus.OK
    body = response.json()
    assert body["engagement_id"] == str(engagement.id)
    assert [m["milestone_label"] for m in body["milestones"]] == ["Prep"]


def test_only_operations_uses_the_operations_project_read(world: M2World) -> None:
    engagement = _funded_project(world)
    response = world.customer_client.get(f"/api/v1/operations/engagements/{engagement.id}/project/")
    assert response.status_code == HTTPStatus.FORBIDDEN


def test_request_timeline_names_its_engagement(world: M2World) -> None:
    engagement = _funded_project(world)
    response = world.operations_client.get(
        f"/api/v1/operations/requests/{engagement.requirement_id}/timeline/"
    )
    assert response.status_code == HTTPStatus.OK
    assert response.json()["engagement_id"] == str(engagement.id)
