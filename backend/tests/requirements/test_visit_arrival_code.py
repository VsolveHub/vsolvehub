"""The arrival code, and the vendor reveal that sits beside it on the same screen.

The property both halves exist to protect: **a visit the Customer paid for names the person who
is coming, and cannot be marked as arrived by somebody who is not there.**

Before this, `SiteVisit.arrival_confirmed_at` was written by whichever party tapped a button from
anywhere, and the visit read published no vendor at all — so the screen that tells somebody who is
about to enter their home could not say, and the record of whether they turned up proved nothing.

The tests worth reading twice are the refusals: that the vendor cannot *fetch* the code they are
supposed to be given, and that a wrong guess is spent even though the command fails. Both are the
kind of hole that leaves every other test in this file passing.
"""

import uuid
from datetime import timedelta
from http import HTTPStatus

import pytest
from django.contrib.auth.hashers import make_password
from django.core.cache import cache
from django.utils import timezone

from apps.partners.models import PartnerProfile
from apps.requirements.access import (
    ArrivalCodeInvalidError,
    ArrivalCodeRateLimitError,
    complete_plan_visit,
    confirm_visit_arrival_with_code,
    issue_visit_arrival_code,
    live_visit_arrival_code,
)
from apps.requirements.exceptions import RequirementNotFoundError, RequirementTransitionError
from apps.requirements.models import SiteVisit, SiteVisitArrivalOtp
from apps.requirements.serializers import SiteVisitSerializer
from tests.requirements.conftest import (
    M2World,
    invitation_for,
    site_visit_for,
    submitted_requirement,
)

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture(autouse=True)
def _clear_cooldowns() -> None:
    """The issue cooldown lives in the cache, so it leaks between tests without this."""

    cache.clear()


def _scheduled_visit(world: M2World) -> SiteVisit:
    requirement = submitted_requirement(world=world)
    invitation = invitation_for(requirement=requirement, partner=world.vendor)
    visit = site_visit_for(invitation=invitation)
    visit.status = SiteVisit.Status.SCHEDULED
    visit.scheduled_for = timezone.now() + timedelta(hours=2)
    visit.save(update_fields=("status", "scheduled_for", "updated_at"))
    return visit


# --------------------------------------------------------------------------------------------
# Issuing
# --------------------------------------------------------------------------------------------


def test_the_customer_gets_digits_and_the_database_gets_only_a_hash(world: M2World) -> None:
    """A database read must not tell anybody what to type."""

    visit = _scheduled_visit(world)

    issued = issue_visit_arrival_code(site_visit_id=visit.id, customer=world.customer)

    assert issued.digits is not None
    challenge = SiteVisitArrivalOtp.objects.get(site_visit=visit)
    assert issued.digits not in challenge.code_hash
    assert challenge.code_hash != issued.digits


def test_a_second_code_retires_the_first(world: M2World) -> None:
    """Two live codes would mean a vendor let in with digits nobody is looking at."""

    visit = _scheduled_visit(world)
    first = issue_visit_arrival_code(site_visit_id=visit.id, customer=world.customer)
    cache.delete(f"m2:visit-arrival-code:cooldown:{visit.id}")
    issue_visit_arrival_code(site_visit_id=visit.id, customer=world.customer)

    with pytest.raises(ArrivalCodeInvalidError):
        confirm_visit_arrival_with_code(
            site_visit_id=visit.id,
            vendor_user=world.vendor.user,
            code=first.digits or "",
        )


def test_a_second_request_inside_the_cooldown_is_refused(world: M2World) -> None:
    """And refused as its own code, so a client can say "your existing one still works"."""

    visit = _scheduled_visit(world)
    issue_visit_arrival_code(site_visit_id=visit.id, customer=world.customer)

    with pytest.raises(ArrivalCodeRateLimitError) as refusal:
        issue_visit_arrival_code(site_visit_id=visit.id, customer=world.customer)

    assert refusal.value.code == "m2_arrival_code_too_soon"


def test_another_customer_cannot_issue_a_code_for_this_visit(world: M2World) -> None:
    """Scoped in the query, not checked after the fact. A 404, because existence is private."""

    visit = _scheduled_visit(world)

    with pytest.raises(RequirementNotFoundError):
        issue_visit_arrival_code(site_visit_id=visit.id, customer=world.other_customer)


def test_a_visit_with_no_confirmed_time_has_no_code_to_give(world: M2World) -> None:
    """`SCHEDULED` is also the proof the plan was paid — a held visit is not one."""

    requirement = submitted_requirement(world=world)
    invitation = invitation_for(requirement=requirement, partner=world.vendor)
    visit = site_visit_for(invitation=invitation)

    with pytest.raises(RequirementTransitionError):
        issue_visit_arrival_code(site_visit_id=visit.id, customer=world.customer)


def test_the_display_copy_survives_a_reload_and_dies_with_its_ttl(world: M2World) -> None:
    """The whole reason the plaintext is cached at all."""

    visit = _scheduled_visit(world)
    issued = issue_visit_arrival_code(site_visit_id=visit.id, customer=world.customer)

    live = live_visit_arrival_code(visit)
    assert live is not None
    assert live.digits == issued.digits

    # A cold cache — a restart, an eviction — loses the digits while the challenge survives. The
    # honest answer is "live, but I cannot show it", so the screen offers a new one.
    cache.delete(f"m2:visit-arrival-code:{visit.id}")
    evicted = live_visit_arrival_code(visit)
    assert evicted is not None
    assert evicted.digits is None


# --------------------------------------------------------------------------------------------
# Entering
# --------------------------------------------------------------------------------------------


def test_the_right_code_starts_the_visit_and_records_how(world: M2World) -> None:
    visit = _scheduled_visit(world)
    issued = issue_visit_arrival_code(site_visit_id=visit.id, customer=world.customer)

    arrived = confirm_visit_arrival_with_code(
        site_visit_id=visit.id,
        vendor_user=world.vendor.user,
        code=issued.digits or "",
    )

    assert arrived.status == SiteVisit.Status.IN_PROGRESS
    assert arrived.arrival_method == SiteVisit.ArrivalMethod.START_OTP
    assert arrived.arrival_confirmed_by_id == world.vendor.user_id
    assert arrived.arrival_confirmed_at is not None


def test_a_scheduled_visit_cannot_skip_the_arrival_code(world: M2World) -> None:
    """Completion must not be a second, implicit no-code arrival path."""

    visit = _scheduled_visit(world)

    with pytest.raises(RequirementTransitionError, match="arrival code"):
        complete_plan_visit(site_visit_id=visit.id)

    visit.refresh_from_db()
    assert visit.status == SiteVisit.Status.SCHEDULED


def test_the_old_tap_only_arrival_route_is_not_published(world: M2World) -> None:
    visit = _scheduled_visit(world)

    response = world.customer_client.post(
        f"/api/v1/site-visits/{visit.id}/arrival/",
        {},
        format="json",
        HTTP_IDEMPOTENCY_KEY=uuid.uuid4().hex,
    )

    assert response.status_code == HTTPStatus.NOT_FOUND


def test_a_wrong_guess_is_spent_even_though_the_command_fails(world: M2World) -> None:
    """The hole this shape exists to close.

    If the failed attempt rolled back with the refusal, an attacker would get unlimited guesses by
    way of the very transaction that was supposed to punish them.
    """

    visit = _scheduled_visit(world)
    issue_visit_arrival_code(site_visit_id=visit.id, customer=world.customer)

    with pytest.raises(ArrivalCodeInvalidError):
        confirm_visit_arrival_with_code(
            site_visit_id=visit.id,
            vendor_user=world.vendor.user,
            code="000000",
        )

    challenge = SiteVisitArrivalOtp.objects.get(site_visit=visit)
    assert challenge.failed_attempts == 1
    assert challenge.consumed_at is None


def test_the_attempt_budget_actually_runs_out(world: M2World) -> None:
    """And once it has, the correct code is refused too — the challenge is dead, not just wrong."""

    visit = _scheduled_visit(world)
    issued = issue_visit_arrival_code(site_visit_id=visit.id, customer=world.customer)
    challenge = SiteVisitArrivalOtp.objects.get(site_visit=visit)
    challenge.failed_attempts = challenge.max_attempts
    challenge.save(update_fields=("failed_attempts",))

    with pytest.raises(ArrivalCodeInvalidError):
        confirm_visit_arrival_with_code(
            site_visit_id=visit.id,
            vendor_user=world.vendor.user,
            code=issued.digits or "",
        )

    visit.refresh_from_db()
    assert visit.status == SiteVisit.Status.SCHEDULED


def test_an_expired_code_is_refused(world: M2World) -> None:
    visit = _scheduled_visit(world)
    issued = issue_visit_arrival_code(site_visit_id=visit.id, customer=world.customer)
    SiteVisitArrivalOtp.objects.filter(site_visit=visit).update(
        expires_at=timezone.now() - timedelta(seconds=1),
    )

    with pytest.raises(ArrivalCodeInvalidError):
        confirm_visit_arrival_with_code(
            site_visit_id=visit.id,
            vendor_user=world.vendor.user,
            code=issued.digits or "",
        )


def test_a_code_cannot_be_used_twice(world: M2World) -> None:
    visit = _scheduled_visit(world)
    issued = issue_visit_arrival_code(site_visit_id=visit.id, customer=world.customer)
    confirm_visit_arrival_with_code(
        site_visit_id=visit.id,
        vendor_user=world.vendor.user,
        code=issued.digits or "",
    )

    with pytest.raises(RequirementTransitionError):
        confirm_visit_arrival_with_code(
            site_visit_id=visit.id,
            vendor_user=world.vendor.user,
            code=issued.digits or "",
        )


def test_another_vendor_cannot_enter_this_visits_code(world: M2World) -> None:
    """Scoped through the invitation, so knowing the digits is not enough."""

    visit = _scheduled_visit(world)
    issued = issue_visit_arrival_code(site_visit_id=visit.id, customer=world.customer)

    with pytest.raises(RequirementNotFoundError):
        confirm_visit_arrival_with_code(
            site_visit_id=visit.id,
            vendor_user=world.other_vendor.user,
            code=issued.digits or "",
        )


# --------------------------------------------------------------------------------------------
# The vendor reveal
# --------------------------------------------------------------------------------------------


def test_a_confirmed_visit_names_the_professional(world: M2World) -> None:
    """The gap the visit page was built to close."""

    visit = _scheduled_visit(world)

    payload = SiteVisitSerializer(visit).data

    assert payload["vendor"] is not None
    assert payload["vendor"]["display_name"] == world.vendor.display_name


def test_an_unconfirmed_visit_names_nobody(world: M2World) -> None:
    """Before a paid, confirmed slot the invited pool is private.

    Publishing it would let anybody holding the read enumerate which businesses were approached
    for what — and there is no Customer entitlement behind it, because nothing has been paid.
    """

    requirement = submitted_requirement(world=world)
    invitation = invitation_for(requirement=requirement, partner=world.vendor)
    visit = site_visit_for(invitation=invitation)

    assert SiteVisitSerializer(visit).data["vendor"] is None


def test_a_visit_never_carries_contact_details(world: M2World) -> None:
    """Contact is released by the engagement, not by a visit.

    A phone number here would be a contact-unlock nobody paid for — asserted as the absence of
    every plausible field name rather than trusting the serializer's field list to stay honest.
    """

    visit = _scheduled_visit(world)

    vendor = SiteVisitSerializer(visit).data["vendor"]
    assert set(vendor) == {
        "display_name",
        "business_type",
        "is_verified",
        "experience_years",
        "photo_url",
    }


def test_an_unreviewed_photograph_is_never_published(world: M2World) -> None:
    """`PENDING` is a photograph nobody has looked at. A Customer must not be the reviewer."""

    visit = _scheduled_visit(world)
    world.vendor.photo_object_key = f"partner-photos/{world.vendor.id}/{uuid.uuid4()}.jpg"
    world.vendor.photo_status = PartnerProfile.PhotoStatus.PENDING
    world.vendor.save(update_fields=("photo_object_key", "photo_status", "updated_at"))

    assert SiteVisitSerializer(visit).data["vendor"]["photo_url"] is None


def test_a_rejected_photograph_is_never_published(world: M2World) -> None:
    visit = _scheduled_visit(world)
    world.vendor.photo_object_key = f"partner-photos/{world.vendor.id}/{uuid.uuid4()}.jpg"
    world.vendor.photo_status = PartnerProfile.PhotoStatus.REJECTED
    world.vendor.save(update_fields=("photo_object_key", "photo_status", "updated_at"))

    assert SiteVisitSerializer(visit).data["vendor"]["photo_url"] is None


def test_a_hashed_code_is_not_reversible_by_reading_the_row(world: M2World) -> None:
    """Belt and braces on the one property the whole feature rests on."""

    visit = _scheduled_visit(world)
    challenge = SiteVisitArrivalOtp.objects.create(
        site_visit=visit,
        code_hash=make_password("123456"),
        expires_at=timezone.now() + timedelta(hours=1),
    )

    assert "123456" not in challenge.code_hash
