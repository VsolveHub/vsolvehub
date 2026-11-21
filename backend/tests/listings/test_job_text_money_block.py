"""Jobs on V Solve Hub never ask candidates to pay, whoever posts them."""

from http import HTTPStatus

import pytest

from apps.identity.models import Role, UserRole
from apps.listings.jobs import MONEY_ASK_PHRASES, money_ask_phrase
from apps.listings.models import Listing
from apps.listings.services import (
    JobTextAsksForMoneyError,
    post_job,
    publish_job_now,
    update_job,
)
from tests.helpers import force_role_client
from tests.listings.jobs_helpers import _sales_job

pytestmark = pytest.mark.django_db

TEXT_FIELDS = ("title", "description")
LIST_FIELDS = ("responsibilities", "benefits", "required_skills", "preferred_skills")


def _bad(field: str, phrase: str = "registration fee") -> dict[str, object]:
    if field == "title":
        return {"title": f"Sales Executive - {phrase}"}
    if field == "description":
        return {"description": f"Join us. A {phrase} is needed first."}
    return {field: ["Something fine", phrase.title()]}


# --- the checker ------------------------------------------------------------------------------


@pytest.mark.parametrize("phrase", MONEY_ASK_PHRASES)
def test_every_phrase_is_found(phrase):
    assert money_ask_phrase(f"Please note: {phrase.upper()} applies.") == phrase


def test_spacing_and_case_do_not_hide_a_phrase():
    assert money_ask_phrase("Registration \n  FEE of ₹500") == "registration fee"


@pytest.mark.parametrize(
    "text",
    [
        "Cashier: counts the cash deposit at the bank",
        "Handles the daily deposit slip",
        "Fee waived. Registration is free.",
        "Pays well and on time",
        "",
    ],
)
def test_honest_text_is_allowed(text):
    assert money_ask_phrase(text) is None


# --- posting ----------------------------------------------------------------------------------


@pytest.mark.parametrize("field", [*TEXT_FIELDS, *LIST_FIELDS])
def test_a_phrase_in_any_field_blocks_posting(employer, field):
    with pytest.raises(JobTextAsksForMoneyError) as refused:
        post_job(poster=employer, actor=employer.user, data=_sales_job(**_bad(field)))

    assert str(refused.value) == (
        "Jobs on V Solve Hub can't ask candidates to pay. Remove “registration fee”."
    )
    assert not Listing.objects.filter(poster=employer).exists()


@pytest.mark.parametrize("phrase", MONEY_ASK_PHRASES)
def test_every_phrase_blocks_posting(employer, phrase):
    with pytest.raises(JobTextAsksForMoneyError):
        post_job(
            poster=employer,
            actor=employer.user,
            data=_sales_job(**_bad("description", phrase)),
        )


def test_a_draft_is_checked_too(employer):
    with pytest.raises(JobTextAsksForMoneyError):
        post_job(
            poster=employer,
            actor=employer.user,
            data=_sales_job(**_bad("description")),
            publish=False,
        )


def test_cash_deposit_in_a_cashier_job_is_allowed(employer):
    job = post_job(
        poster=employer,
        actor=employer.user,
        data=_sales_job(
            title="Cashier",
            responsibilities=["Count the cash deposit at the bank"],
        ),
    )

    assert job.status == Listing.Status.PUBLISHED


# --- editing and publishing -------------------------------------------------------------------


@pytest.mark.parametrize("field", [*TEXT_FIELDS, *LIST_FIELDS])
def test_a_phrase_in_any_field_blocks_an_edit(employer, field):
    job = post_job(poster=employer, actor=employer.user, data=_sales_job())
    before = Listing.objects.values().get(pk=job.pk)

    with pytest.raises(JobTextAsksForMoneyError):
        update_job(listing=job, actor=employer.user, data=_bad(field, "security deposit"))

    assert Listing.objects.values().get(pk=job.pk) == before


@pytest.mark.parametrize("field", [*TEXT_FIELDS, *LIST_FIELDS])
def test_a_phrase_in_any_field_blocks_publishing(employer, field):
    draft = post_job(poster=employer, actor=employer.user, data=_sales_job(), publish=False)
    value = _bad(field, "joining fee")[field]
    Listing.objects.filter(pk=draft.pk).update(**{field: value})
    draft.refresh_from_db()

    with pytest.raises(JobTextAsksForMoneyError):
        publish_job_now(listing=draft, actor=employer.user)

    draft.refresh_from_db()
    assert draft.status == Listing.Status.DRAFT


# --- the API ----------------------------------------------------------------------------------


def _api(user):
    role, _ = Role.objects.get_or_create(code="partner", defaults={"name": "Partner"})
    UserRole.objects.get_or_create(user=user, role=role, revoked_at=None)
    return force_role_client(user=user, role_code="partner")


def _body(**overrides):
    data = _sales_job(**overrides)
    data["role_template_id"] = str(data["role_template_id"])
    data["timing_start"], data["timing_end"] = "10:00", "20:00"
    return data


def test_the_api_refuses_a_post_with_a_clear_code(employer):
    response = _api(employer.user).post(
        "/api/v1/partner/jobs", _body(**_bad("description", "training fee")), format="json"
    )

    assert response.status_code == HTTPStatus.BAD_REQUEST
    error = response.json()["error"]
    assert error["code"] == "job_text_asks_for_money"
    assert error["message"] == (
        "Jobs on V Solve Hub can't ask candidates to pay. Remove “training fee”."
    )


def test_the_api_refuses_an_edit_and_a_publish(employer):
    client = _api(employer.user)
    draft = client.post("/api/v1/partner/jobs", {**_body(), "publish": False}, format="json").json()
    job_id = draft["id"]

    edit = client.patch(
        f"/api/v1/partner/jobs/{job_id}", _bad("description", "pay first"), format="json"
    )
    assert edit.status_code == HTTPStatus.BAD_REQUEST
    assert edit.json()["error"]["code"] == "job_text_asks_for_money"

    Listing.objects.filter(pk=job_id).update(description="Pay to apply today")
    publish = client.post(f"/api/v1/partner/jobs/{job_id}/publish")
    assert publish.status_code == HTTPStatus.BAD_REQUEST
    assert publish.json()["error"]["code"] == "job_text_asks_for_money"
