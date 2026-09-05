"""The second question: what the customer thinks of Vsolve, and which service it was about.

The rules worth holding are the ones protecting a count somebody will later act on:

* the service is resolved by the server, so no rater can steer a per-service average;
* "All good" plus a complaint is refused rather than silently resolved;
* a single chip is enough, and saying nothing is not feedback;
* the partner score and the platform score never merge.
"""

from http import HTTPStatus

import pytest
from django.utils import timezone

from apps.ratings.models import PlatformFeedback
from apps.ratings.services import service_feedback
from apps.requirements.models import Engagement, Proposal
from tests.requirements.conftest import M2World, submitted_requirement
from tests.requirements.conftest import (
    world as requirements_world,  # noqa: F401 - exposes the sibling fixture to this module
)

pytestmark = pytest.mark.django_db(transaction=True)

#: The contrast this whole feature exists to make visible: the crew were excellent and the
#: experience of booking them was not.
PARTNER_SCORE = 5
PLATFORM_SCORE = 2


def _completed_engagement(world: M2World) -> Engagement:
    requirement = submitted_requirement(world=world, archetype=world.variant.booking_archetype)
    return Engagement.objects.create(
        requirement=requirement,
        partner=world.vendor,
        customer=world.customer,
        archetype=world.variant.booking_archetype,
        commercial_mode=Engagement.CommercialMode.LEAD_ONLY,
        status=Engagement.Status.COMPLETED,
        total_paise=960_000,
        tax_paise=0,
        tax_basis=Proposal.TaxBasis.INCLUSIVE,
        staged_total_paise=960_000,
        completed_at=timezone.now(),
    )


def test_the_chip_vocabulary_is_published_rather_than_hardcoded(
    request: pytest.FixtureRequest,
) -> None:
    """Two clients drifting from one taxonomy produce two sets of counts that look like one."""
    world: M2World = request.getfixturevalue("requirements_world")
    engagement = _completed_engagement(world)

    summary = world.customer_client.get(
        f"/api/v1/engagements/{engagement.id}/platform-feedback/"
    ).json()

    assert summary["can_submit"] is True
    assert summary["my_feedback"] is None
    codes = {tag["code"]: tag for tag in summary["available_tags"]}
    assert "ALL_GOOD" in codes
    assert codes["ALL_GOOD"]["is_exclusive"] is True
    assert codes["PRICE_UNCLEAR"]["is_exclusive"] is False


def test_feedback_records_the_service_without_the_customer_naming_it(
    request: pytest.FixtureRequest,
) -> None:
    world: M2World = request.getfixturevalue("requirements_world")
    engagement = _completed_engagement(world)
    endpoint = f"/api/v1/engagements/{engagement.id}/platform-feedback/"

    created = world.customer_client.post(
        endpoint,
        {"score": PLATFORM_SCORE, "tags": ["PRICE_UNCLEAR"], "comment": "The fee was a surprise."},
        format="json",
    )

    assert created.status_code == HTTPStatus.CREATED
    assert created.json()["can_submit"] is False
    assert created.json()["my_feedback"]["tags"] == ["PRICE_UNCLEAR"]
    stored = PlatformFeedback.objects.get(engagement=engagement)
    assert stored.variant_id == engagement.requirement.variant_id


def test_all_good_alongside_a_complaint_is_refused(request: pytest.FixtureRequest) -> None:
    """Either half might be the one they meant, so the server does not choose."""
    world: M2World = request.getfixturevalue("requirements_world")
    engagement = _completed_engagement(world)

    refused = world.customer_client.post(
        f"/api/v1/engagements/{engagement.id}/platform-feedback/",
        {"tags": ["ALL_GOOD", "PRICE_UNCLEAR"]},
        format="json",
    )

    assert refused.status_code == HTTPStatus.BAD_REQUEST
    assert refused.json()["error"]["code"] == "feedback_tags_invalid"
    assert not PlatformFeedback.objects.exists()


def test_one_chip_on_its_own_is_enough(request: pytest.FixtureRequest) -> None:
    """Demanding a star first would lose the customer who taps once and closes."""
    world: M2World = request.getfixturevalue("requirements_world")
    engagement = _completed_engagement(world)

    created = world.customer_client.post(
        f"/api/v1/engagements/{engagement.id}/platform-feedback/",
        {"tags": ["APP_PROBLEM"]},
        format="json",
    )

    assert created.status_code == HTTPStatus.CREATED
    assert created.json()["my_feedback"]["score"] is None


def test_saying_nothing_at_all_is_refused(request: pytest.FixtureRequest) -> None:
    world: M2World = request.getfixturevalue("requirements_world")
    engagement = _completed_engagement(world)

    refused = world.customer_client.post(
        f"/api/v1/engagements/{engagement.id}/platform-feedback/",
        {"tags": [], "comment": "   "},
        format="json",
    )

    assert refused.status_code == HTTPStatus.BAD_REQUEST
    assert refused.json()["error"]["code"] == "feedback_empty"


def test_resending_the_same_answer_is_not_a_conflict(
    request: pytest.FixtureRequest,
) -> None:
    """A double tap on a slow connection is one submission, not an error to read."""
    world: M2World = request.getfixturevalue("requirements_world")
    engagement = _completed_engagement(world)
    endpoint = f"/api/v1/engagements/{engagement.id}/platform-feedback/"
    body = {"score": 3, "tags": ["SLOW_MATCH"], "comment": "Waited two days."}

    first = world.customer_client.post(endpoint, body, format="json")
    replay = world.customer_client.post(endpoint, body, format="json")
    changed = world.customer_client.post(
        endpoint, {"score": 1, "tags": ["APP_PROBLEM"]}, format="json"
    )

    assert first.status_code == HTTPStatus.CREATED
    assert replay.status_code == HTTPStatus.OK
    assert changed.status_code == HTTPStatus.CONFLICT
    assert PlatformFeedback.objects.count() == 1


def test_a_partner_is_never_asked_this_question(request: pytest.FixtureRequest) -> None:
    """The same words put to a partner would collect a different thing under one label."""
    world: M2World = request.getfixturevalue("requirements_world")
    engagement = _completed_engagement(world)
    endpoint = f"/api/v1/engagements/{engagement.id}/platform-feedback/"

    summary = world.vendor_client.get(endpoint).json()
    refused = world.vendor_client.post(endpoint, {"score": 5}, format="json")

    assert summary["can_submit"] is False
    assert refused.status_code == HTTPStatus.NOT_FOUND


def test_an_outsider_sees_nothing(request: pytest.FixtureRequest) -> None:
    world: M2World = request.getfixturevalue("requirements_world")
    engagement = _completed_engagement(world)

    response = world.outsider_client.get(f"/api/v1/engagements/{engagement.id}/platform-feedback/")

    assert response.status_code == HTTPStatus.NOT_FOUND


def test_operations_reads_both_scores_side_by_side(request: pytest.FixtureRequest) -> None:
    """The whole reason for two tables: a good crew behind a bad experience stays visible."""
    world: M2World = request.getfixturevalue("requirements_world")
    engagement = _completed_engagement(world)
    world.customer_client.post(
        f"/api/v1/engagements/{engagement.id}/ratings/",
        {"score": PARTNER_SCORE, "comment": "Crew were excellent."},
        format="json",
    )
    world.customer_client.post(
        f"/api/v1/engagements/{engagement.id}/platform-feedback/",
        {"score": PLATFORM_SCORE, "tags": ["PRICE_UNCLEAR"], "comment": "The fee was a surprise."},
        format="json",
    )

    rows = service_feedback()
    row = next(row for row in rows if row.variant_id == engagement.requirement.variant_id)

    assert row.partner_score == float(PARTNER_SCORE)
    assert row.platform_score == float(PLATFORM_SCORE)
    assert row.note_count == 1
    assert [(tag.code, tag.count) for tag in row.tags] == [("PRICE_UNCLEAR", 1)]


def test_a_note_carries_the_partner_rating_from_the_same_job(
    request: pytest.FixtureRequest,
) -> None:
    """`platform 2 / partner 5` is the pattern to act on, and it is invisible read apart."""
    world: M2World = request.getfixturevalue("requirements_world")
    engagement = _completed_engagement(world)
    world.customer_client.post(
        f"/api/v1/engagements/{engagement.id}/ratings/",
        {"score": PARTNER_SCORE, "comment": "Great crew."},
        format="json",
    )
    world.customer_client.post(
        f"/api/v1/engagements/{engagement.id}/platform-feedback/",
        {"score": PLATFORM_SCORE, "tags": ["PRICE_UNCLEAR"], "comment": "The fee was a surprise."},
        format="json",
    )

    variant_id = engagement.requirement.variant_id
    notes = world.operations_client.get(
        f"/api/v1/operations/service-feedback/{variant_id}/notes/"
    ).json()

    assert len(notes["notes"]) == 1
    assert notes["notes"][0]["score"] == PLATFORM_SCORE
    assert notes["notes"][0]["partner_score"] == PARTNER_SCORE


def test_a_bad_period_is_refused_rather_than_ignored(
    request: pytest.FixtureRequest,
) -> None:
    """A filter that silently falls back shows an operator the wrong range under their label."""
    world: M2World = request.getfixturevalue("requirements_world")

    response = world.operations_client.get("/api/v1/operations/service-feedback/?days=soon")

    assert response.status_code == HTTPStatus.BAD_REQUEST
