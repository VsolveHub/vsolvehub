"""The Operations review queue can be narrowed to one kind of applicant."""

from http import HTTPStatus
from typing import Any

import pytest
from django.utils import timezone

from apps.identity.models import User
from apps.partners.models import PartnerApplication, PartnerProfile
from tests.helpers import force_role_client

pytestmark = pytest.mark.django_db

URL = "/api/v1/operations/partner-applications/"
Track = PartnerApplication.Track
Status = PartnerApplication.Status


def _application(
    phone: str, track: str, status: str = Status.SUBMITTED, **fields: Any
) -> PartnerApplication:
    user = User.objects.create_user(phone_number=phone, full_name=f"Applicant {phone[-4:]}")
    partner = PartnerProfile.objects.create(user=user, display_name=f"Applicant {phone[-4:]}")
    return PartnerApplication.objects.create(
        partner=partner, track=track, status=status, submitted_at=timezone.now(), **fields
    )


@pytest.fixture
def queue(db) -> dict[str, PartnerApplication]:  # noqa: ARG001
    return {
        "services": _application("+919977770151", Track.SERVICES),
        "stay": _application("+919977770152", Track.STAY_HOST),
        "rental": _application("+919977770153", Track.RENTAL_OWNER),
        "employer": _application("+919977770154", Track.EMPLOYER),
    }


@pytest.fixture
def client(operations_user: User) -> Any:
    return force_role_client(user=operations_user, role_code="operations")


def _ids(response: Any) -> set[str]:
    assert response.status_code == HTTPStatus.OK, response.json()
    return {row["id"] for row in response.json()["results"]}


def test_without_a_type_every_applicant_is_listed(client, queue):
    assert _ids(client.get(URL)) == {str(application.id) for application in queue.values()}


@pytest.mark.parametrize(
    ("track", "key"),
    [
        (Track.SERVICES, "services"),
        (Track.STAY_HOST, "stay"),
        (Track.RENTAL_OWNER, "rental"),
        (Track.EMPLOYER, "employer"),
    ],
)
def test_each_type_lists_only_its_own_applicants(client, queue, track, key):
    assert _ids(client.get(URL, {"track": track})) == {str(queue[key].id)}


@pytest.mark.usefixtures("queue")
def test_each_row_says_which_type_it_is(client):
    rows = client.get(URL, {"track": Track.EMPLOYER}).json()["results"]

    assert [row["track"] for row in rows] == [Track.EMPLOYER]


@pytest.mark.usefixtures("queue")
def test_an_unknown_type_is_refused(client):
    response = client.get(URL, {"track": "AGENCY"})

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert "track" in response.json()["error"]["details"]


@pytest.mark.usefixtures("queue")
def test_the_type_combines_with_the_status(client):
    reviewing = _application("+919977770155", Track.EMPLOYER, Status.UNDER_REVIEW)

    ids = _ids(client.get(URL, {"track": Track.EMPLOYER, "status": Status.UNDER_REVIEW}))

    assert ids == {str(reviewing.id)}


@pytest.mark.usefixtures("queue")
def test_the_type_combines_with_assigned_to_me(client, operations_user):
    mine = _application(
        "+919977770156",
        Track.EMPLOYER,
        Status.UNDER_REVIEW,
        review_assigned_to=operations_user,
    )
    _application(
        "+919977770157", Track.STAY_HOST, Status.UNDER_REVIEW, review_assigned_to=operations_user
    )

    ids = _ids(client.get(URL, {"track": Track.EMPLOYER, "assigned_to_me": "true"}))

    assert ids == {str(mine.id)}


@pytest.mark.usefixtures("queue")
def test_the_type_combines_with_unassigned(client):
    _application("+919977770158", Track.EMPLOYER)

    rows = client.get(URL, {"track": Track.EMPLOYER, "unassigned": "true"}).json()["results"]

    assert len(rows) == 2
    assert {row["track"] for row in rows} == {Track.EMPLOYER}
