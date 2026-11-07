"""`POST /operations/partners/import/` (proposal 0029).

The old import created bare profiles with no application, so imported partners never reached
review and could never go online. Each ready row is now a DRAFT application the partner finishes.
"""

import hashlib
from http import HTTPStatus

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.identity.models import User, UserRole
from apps.partners.models import (
    PartnerApplication,
    PartnerApplicationTransition,
    PartnerProfile,
    PartnerServiceArea,
    PartnerSkill,
)
from apps.partners.services.partner_import import MAX_IMPORT_ROWS
from tests.helpers import force_role_client
from tests.partners.conftest import PartnerSetup

pytestmark = pytest.mark.django_db

IMPORT_URL = "/api/v1/operations/partners/import/"
HEADER = "phone,full_name,track,service_area,skills,experience_years\n"


def _csv(*rows: str, header: str = HEADER) -> bytes:
    return (header + "".join(f"{row}\n" for row in rows)).encode()


def _post(client: APIClient, data: bytes, mode: str, key: str | None = None):  # type: ignore[no-untyped-def]
    upload = SimpleUploadedFile("partners.csv", data, content_type="text/csv")
    payload = {"file": upload, "mode": mode}
    if key:
        return client.post(IMPORT_URL, payload, format="multipart", HTTP_IDEMPOTENCY_KEY=key)
    return client.post(IMPORT_URL, payload, format="multipart")


@pytest.fixture
def ops(operations_user: User) -> APIClient:
    return force_role_client(user=operations_user, role_code="operations")


def _key(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def test_check_reports_every_row_and_creates_nothing(
    ops: APIClient, partner_setup: PartnerSetup
) -> None:
    data = _csv(
        "9812345601,Ravi Kumar,SERVICES,west-hyderabad,electrician,4",
        "9812345602,Asha Reddy,STAY_HOST,,,",
        f"{partner_setup.user.phone_number},Already Here,STAY_HOST,,,",
    )

    response = _post(ops, data, "check")

    assert response.status_code == HTTPStatus.OK
    body = response.json()
    assert body["mode"] == "check"
    assert body["file_sha256"] == _key(data)
    assert body["summary"] == {"total": 3, "ready": 2, "skipped": 1, "problems": 0}
    assert [row["status"] for row in body["rows"]] == ["ready", "ready", "skipped"]
    assert body["rows"][0]["phone"] == "+919812345601"
    assert not User.objects.filter(phone_number="+919812345601").exists()


@pytest.mark.usefixtures("partner_setup")
def test_check_names_every_problem_by_row_and_column(ops: APIClient) -> None:
    data = _csv(
        "98123,,SERVICES,nowhere,carpentery,99",
        "9812345603,Asha,STAY_HOST,west-hyderabad,electrician,",
        "9812345604,Dup One,STAY_HOST,,,",
        "9812345604,Dup Two,STAY_HOST,,,",
        "9812345605,Wrong Track,PLUMBER,,,",
    )

    body = _post(ops, data, "check").json()
    problems = {(row["row"], p["column"]) for row in body["rows"] for p in row["problems"]}

    assert {
        (2, "phone"),
        (2, "full_name"),
        (2, "service_area"),
        (2, "skills"),
        (2, "experience_years"),
    } <= problems
    # Other tracks never travel to customers, so an area or skill there is a mistake, not ignored.
    assert {(3, "service_area"), (3, "skills")} <= problems
    assert (5, "phone") in problems  # repeats row 4
    assert (6, "track") in problems
    assert body["summary"]["problems"] == 4


def test_import_creates_a_draft_application_the_partner_finishes(
    ops: APIClient, operations_user: User, partner_setup: PartnerSetup
) -> None:
    data = _csv(
        "9812345601,Ravi Kumar,SERVICES,west-hyderabad,electrician,4",
        "9812345602,Asha Reddy,STAY_HOST,,,",
    )

    response = _post(ops, data, "import", key=_key(data))

    assert response.status_code == HTTPStatus.OK
    body = response.json()
    assert body["summary"] == {"total": 2, "created": 2, "skipped": 0, "problems": 0}
    ravi = PartnerProfile.objects.get(user__phone_number="+919812345601")
    application = PartnerApplication.objects.get(partner=ravi)
    assert body["rows"][0]["partner_id"] == str(ravi.id)
    assert ravi.display_name == "Ravi Kumar"
    assert ravi.experience_years == 4
    assert UserRole.objects.filter(user=ravi.user, role__code="partner").exists()
    # Nobody is approved by importing.
    assert application.status == PartnerApplication.Status.DRAFT
    assert application.track == PartnerApplication.Track.SERVICES
    assert PartnerServiceArea.objects.filter(
        partner=ravi, service_area=partner_setup.service_area
    ).exists()
    assert PartnerSkill.objects.filter(partner=ravi, skill=partner_setup.skill).exists()
    transition = PartnerApplicationTransition.objects.get(application=application)
    assert transition.reason_code == "operations_import"
    assert transition.actor == operations_user

    asha = PartnerProfile.objects.get(user__phone_number="+919812345602")
    assert asha.application.track == PartnerApplication.Track.STAY_HOST
    assert not PartnerSkill.objects.filter(partner=asha).exists()


@pytest.mark.usefixtures("partner_setup")
def test_import_with_any_problem_creates_nothing(ops: APIClient) -> None:
    data = _csv(
        "9812345601,Ravi Kumar,SERVICES,west-hyderabad,electrician,4",
        "9812345602,,STAY_HOST,,,",
    )

    response = _post(ops, data, "import", key=_key(data))

    assert response.status_code == HTTPStatus.UNPROCESSABLE_ENTITY
    assert response.json()["error"]["code"] == "import_has_row_errors"
    assert not User.objects.filter(phone_number="+919812345601").exists()


def test_a_registered_phone_is_skipped_and_left_unchanged(
    ops: APIClient, partner_setup: PartnerSetup
) -> None:
    existing = partner_setup.user
    data = _csv(f"{existing.phone_number},Someone Else,STAY_HOST,,,")

    body = _post(ops, data, "import", key=_key(data)).json()

    assert body["rows"][0]["status"] == "skipped"
    existing.refresh_from_db()
    assert existing.full_name == "Ravi Kumar"
    assert not PartnerProfile.objects.filter(user=existing).exists()


@pytest.mark.usefixtures("partner_setup")
def test_a_retried_import_replays_instead_of_importing_twice(ops: APIClient) -> None:
    data = _csv("9812345601,Ravi Kumar,STAY_HOST,,,")

    first = _post(ops, data, "import", key=_key(data))
    second = _post(ops, data, "import", key=_key(data))

    assert first.status_code == second.status_code == HTTPStatus.OK
    assert second.json() == first.json()
    assert PartnerProfile.objects.filter(user__phone_number="+919812345601").count() == 1


@pytest.mark.usefixtures("partner_setup")
def test_import_needs_an_idempotency_key(ops: APIClient) -> None:
    response = _post(ops, _csv("9812345601,Ravi Kumar,STAY_HOST,,,"), "import")

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert not User.objects.filter(phone_number="+919812345601").exists()


@pytest.mark.parametrize(
    ("data", "code"),
    [
        (_csv("9812345601,Ravi", header="phone,full_name\n"), "import_columns_invalid"),
        (
            _csv("9812345601,Ravi,STAY_HOST,Hyderabad", header="phone,full_name,track,city\n"),
            "import_columns_invalid",
        ),
        (b"\xff\xfe\x00bad", "import_file_invalid"),
        (HEADER.encode(), "import_file_invalid"),
    ],
)
@pytest.mark.usefixtures("partner_setup")
def test_a_file_the_server_cannot_read_row_by_row_is_refused_whole(
    ops: APIClient, data: bytes, code: str
) -> None:
    response = _post(ops, data, "check")

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert response.json()["error"]["code"] == code


@pytest.mark.usefixtures("partner_setup")
def test_more_than_the_row_limit_is_refused(ops: APIClient) -> None:
    rows = [f"98{index:08d},Partner {index},STAY_HOST,,," for index in range(MAX_IMPORT_ROWS + 1)]

    response = _post(ops, _csv(*rows), "check")

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert response.json()["error"]["code"] == "import_too_many_rows"


@pytest.mark.usefixtures("partner_setup")
def test_a_spreadsheet_byte_order_mark_is_accepted(ops: APIClient) -> None:
    data = b"\xef\xbb\xbf" + _csv("9812345601,Ravi Kumar,STAY_HOST,,,")

    assert _post(ops, data, "check").json()["summary"]["ready"] == 1


def test_only_operations_can_import(partner_setup: PartnerSetup) -> None:
    response = _post(partner_setup.client, _csv("9812345601,Ravi Kumar,STAY_HOST,,,"), "check")

    assert response.status_code == HTTPStatus.FORBIDDEN
