"""The B8 HTTP surface: authorization, idempotency, versioning and projection scope.

The domain layer already has 126 tests proving the rules. This file does not repeat them. It
proves the four things that only exist once there is a door:

* an actor can only reach their own Booking, and cannot tell "not mine" from "does not exist";
* every state-changing command requires an `Idempotency-Key` and a replay creates nothing twice;
* a stale `expected_version` is a typed 409, not a silent overwrite;
* each actor's projection carries what that actor is allowed to see and nothing else.

The happy path is walked end to end once — en route, arrived, OTP, work, completion, confirm —
because a surface where every command works alone but the sequence does not is not a surface.
"""

import itertools
from http import HTTPStatus

import pytest
from rest_framework.test import APIClient

from apps.assignments.models import PartnerOffer
from apps.carts.models import QuoteLine
from apps.commerce.models import Booking
from apps.fulfilment.models import BookingOtp, ScopeAmendment, WorkTask
from apps.identity.models import Role, User, UserRole
from apps.partners.models import PartnerProfile
from tests.carts.test_fulfilment_planning import _partner
from tests.fulfilment.conftest import BookedGroup, create_booked_group
from tests.helpers import force_role_client

pytestmark = pytest.mark.django_db(transaction=True)

_key_sequence = itertools.count(1)
TWO_UNITS = 2


def _key(label: str) -> str:
    return f"{label}-{next(_key_sequence)}"


def _granted(user: User, role_code: str) -> User:
    role, _created = Role.objects.get_or_create(
        code=role_code, defaults={"name": role_code.title()}
    )
    UserRole.objects.get_or_create(user=user, role=role, revoked_at=None)
    return user


def _partner_client(profile: PartnerProfile) -> APIClient:
    """A Partner client with a real *selected* session role.

    `IsPartnerUser` asks which role the session is currently acting as, not merely which grants
    the user holds — so `force_authenticate` alone is refused, exactly as a real Partner signed
    in as a Customer would be. `force_role_client` is the shared helper that does this properly;
    reimplementing it here would be a second, drifting definition of "signed in".
    """

    return force_role_client(user=_granted(profile.user, "partner"), role_code="partner")


def _operations_client(phone: str) -> tuple[APIClient, User]:
    user = _granted(User.objects.create_user(phone_number=phone), "operations")
    return force_role_client(user=user, role_code="operations"), user


def _post(client: APIClient, url: str, payload: dict[str, object], key: str) -> object:
    return client.post(url, payload, format="json", HTTP_IDEMPOTENCY_KEY=key)


# --------------------------------------------------------------------------------------------
# The whole visit, once, over HTTP
# --------------------------------------------------------------------------------------------


def test_a_visit_runs_from_en_route_to_confirmed_completion_over_http() -> None:
    booked = create_booked_group(key_prefix="api-happy")
    partner = _partner_client(booked.partner)
    booking = booked.booking
    base = f"/api/v1/partner/bookings/{booking.id}"

    en_route = _post(
        partner, f"{base}/en-route/", {"expected_version": booking.version}, _key("er")
    )
    assert en_route.status_code == HTTPStatus.OK, en_route.json()
    version = en_route.json()["version"]

    arrived = _post(partner, f"{base}/arrived/", {"expected_version": version}, _key("ar"))
    assert arrived.status_code == HTTPStatus.OK, arrived.json()
    version = arrived.json()["version"]

    # The Customer asks for the code; the Partner types it. Two people, two endpoints.
    otp_response = booked.client.post(
        f"/api/v1/bookings/{booking.id}/start-otp/",
        {"expected_version": version},
        format="json",
    )
    assert otp_response.status_code == HTTPStatus.OK, otp_response.json()
    assert otp_response.json()["development_code"], "the development sender published no code"
    code = otp_response.json()["development_code"]
    assert "code" not in otp_response.json(), "the raw code must not be published under 'code'"

    started = _post(
        partner,
        f"{base}/start-otp/verify/",
        {"expected_version": version, "code": code},
        _key("otp"),
    )
    assert started.status_code == HTTPStatus.OK, started.json()
    assert started.json()["status"] == Booking.Status.IN_PROGRESS
    version = started.json()["version"]

    tasks = list(WorkTask.objects.filter(booking=booking))
    assert tasks, "starting work materialized no tasks"
    submitted = _post(
        partner,
        f"{base}/completion/",
        {
            "expected_version": version,
            "notes": "All done.",
            "safety_damage_declared": False,
            "outcomes": [
                {"work_task_id": str(task.id), "outcome": "COMPLETED", "quantity": task.quantity}
                for task in tasks
            ],
        },
        _key("done"),
    )
    assert submitted.status_code == HTTPStatus.OK, submitted.json()
    assert submitted.json()["status"] == Booking.Status.COMPLETION_SUBMITTED
    version = submitted.json()["version"]

    confirmed = _post(
        booked.client,
        f"/api/v1/bookings/{booking.id}/completion/confirm/",
        {"expected_version": version},
        _key("confirm"),
    )
    assert confirmed.status_code == HTTPStatus.OK, confirmed.json()
    assert confirmed.json()["status"] == Booking.Status.COMPLETED

    booking.refresh_from_db()
    assert booking.status == Booking.Status.COMPLETED


# --------------------------------------------------------------------------------------------
# Authorization
# --------------------------------------------------------------------------------------------


def test_another_partner_cannot_reach_a_booking_and_cannot_tell_it_exists() -> None:
    """403 for both an unknown id and someone else's id.

    Two different codes would make this an existence oracle: a caller could walk the id space
    and learn which Bookings are real from the status alone.
    """

    booked = create_booked_group(key_prefix="api-authz-partner")
    intruder = _partner_client(_partner(suffix="9102", variant_slugs=("switch-socket-repair",)))

    theirs = intruder.get(f"/api/v1/partner/bookings/{booked.booking.id}/")
    # A well-formed id that is not a Booking at all: the group's own id serves.
    unknown = intruder.get(f"/api/v1/partner/bookings/{booked.group.id}/")

    assert theirs.status_code == HTTPStatus.FORBIDDEN
    assert unknown.status_code == HTTPStatus.FORBIDDEN
    assert theirs.json()["error"]["code"] == unknown.json()["error"]["code"]


def test_another_partner_cannot_command_a_booking_they_do_not_hold() -> None:
    """The intruder is a bare approved Partner, not a second booked group.

    Dispatching a second group in one test can hand the *same* Partner two reservations in the
    same window, which the GiST exclusion constraint correctly refuses — a fixture failure that
    says nothing about authorization. One Partner with no work of their own is the honest setup.
    """

    booked = create_booked_group(key_prefix="api-authz-cmd")
    intruder = _partner_client(_partner(suffix="9101", variant_slugs=("switch-socket-repair",)))
    version = booked.booking.version

    response = _post(
        intruder,
        f"/api/v1/partner/bookings/{booked.booking.id}/en-route/",
        {"expected_version": version},
        _key("intrude"),
    )

    assert response.status_code == HTTPStatus.FORBIDDEN
    assert booked.booking.status == Booking.Status.CONFIRMED


def test_another_customer_cannot_read_or_cancel_a_booking() -> None:
    """A signed-in stranger, not a second booked group.

    Same reason as the Partner case: dispatching twice in one test can hand one Partner two
    reservations in the same window, and that fixture collision proves nothing about ownership.
    """

    booked = create_booked_group(key_prefix="api-authz-cust")
    stranger = APIClient()
    stranger.force_authenticate(User.objects.create_user(phone_number="+919876500011"))
    version = booked.booking.version

    read = stranger.get(f"/api/v1/bookings/{booked.booking.id}/")
    cancel = _post(
        stranger,
        f"/api/v1/bookings/{booked.booking.id}/cancel/",
        {"expected_version": version, "reason": "not mine"},
        _key("steal"),
    )

    assert read.status_code == HTTPStatus.FORBIDDEN
    assert cancel.status_code == HTTPStatus.FORBIDDEN
    assert booked.booking.status == Booking.Status.CONFIRMED


def test_a_customer_cannot_reach_the_partner_or_operations_surfaces() -> None:
    booked = create_booked_group(key_prefix="api-authz-cross")

    partner_view = booked.client.get(f"/api/v1/partner/bookings/{booked.booking.id}/")
    operations_view = booked.client.get(f"/api/v1/operations/bookings/{booked.booking.id}/")

    assert partner_view.status_code == HTTPStatus.FORBIDDEN
    assert operations_view.status_code == HTTPStatus.FORBIDDEN


# --------------------------------------------------------------------------------------------
# Projection scope
# --------------------------------------------------------------------------------------------


def test_the_partner_projection_carries_no_route_to_a_sibling_unit() -> None:
    """G7, enforced by absence.

    The cheapest way to guarantee a Partner cannot read a sibling unit's scope or earnings is
    to never publish the identifier that would let them ask. `booking_group_id` and `order_id`
    are Operations-only for exactly that reason.
    """

    booked = create_booked_group(
        slugs=("switch-socket-repair", "tap-repair"), key_prefix="api-scope"
    )
    units = list(booked.group.units.order_by("position"))
    assert len(units) == TWO_UNITS
    first = units[0].booking
    partner = _partner_client(first.partner)

    body = partner.get(f"/api/v1/partner/bookings/{first.id}/").json()

    assert "booking_group_id" not in body
    assert "order_id" not in body
    assert "customer" not in body
    assert str(units[1].id) not in str(body), "a sibling unit id leaked into the Partner payload"


def test_a_confirmed_job_names_and_prices_the_booked_scope_before_work_starts() -> None:
    """The work list must not depend on WorkTasks that only exist after OTP verification."""

    booked = create_booked_group(key_prefix="api-job-summary")
    booking = booked.booking
    assert not WorkTask.objects.filter(booking=booking).exists()

    response = _partner_client(booked.partner).get(f"/api/v1/partner/bookings/{booking.id}/")

    assert response.status_code == HTTPStatus.OK
    body = response.json()
    service_lines = list(booked.unit.lines.filter(kind=QuoteLine.Kind.SERVICE).order_by("position"))
    expected_title = service_lines[0].label
    if len(service_lines) > 1:
        expected_title = f"{expected_title} +{len(service_lines) - 1} more"
    offer = PartnerOffer.objects.get(reservation=booking.reservation)
    offered = offer.partner_projection_snapshot

    assert body["display_title"] == expected_title
    assert body["display_title"] != "Job"
    assert body["approximate_area"] == booked.unit.service_area.name
    assert body["service_lines"] == [
        {
            "line_id": str(line.id),
            "service_label": line.label,
            "quantity": line.quantity,
            "scope": line.snapshot.get("scope", {}),
        }
        for line in service_lines
    ]
    assert body["requirements"] == sorted(
        {
            requirement
            for line in service_lines
            for requirement in line.snapshot.get("configuration", {}).get("required_equipment", [])
        }
    )
    assert body["estimated_earning"] == {
        "gross_paise": offered["estimated_gross"]["amount_paise"],
        "commission_paise": offered["commission"]["amount_paise"],
        "net_paise": offered["estimated_net"]["amount_paise"],
        "currency": offered["estimated_net"]["currency"],
    }
    assert body["earning"] is None
    assert body["scheduled_start"] == booking.scheduled_start.isoformat().replace("+00:00", "Z")
    assert body["estimated_duration_minutes"] == booking.estimated_duration_minutes


def test_the_customer_projection_names_the_partner_but_publishes_nothing_else_about_them() -> None:
    booked = create_booked_group(key_prefix="api-scope-cust")

    body = booked.client.get(f"/api/v1/bookings/{booked.booking.id}/").json()

    assert body["partner_display_name"] == booked.partner.display_name
    assert "partner_id" not in body
    assert booked.partner.user.phone_number not in str(body)


def test_operations_sees_the_audit_trail_the_other_two_do_not() -> None:
    booked = create_booked_group(key_prefix="api-scope-ops")
    operations, _user = _operations_client("+919870000001")

    body = operations.get(f"/api/v1/operations/bookings/{booked.booking.id}/").json()

    assert "status_history" in body
    assert body["booking_group_id"] == str(booked.group.id)
    assert body["partner_id"] == str(booked.partner.id)


# --------------------------------------------------------------------------------------------
# Idempotency and versioning
# --------------------------------------------------------------------------------------------


def test_a_command_without_an_idempotency_key_is_refused() -> None:
    booked = create_booked_group(key_prefix="api-nokey")
    partner = _partner_client(booked.partner)

    response = partner.post(
        f"/api/v1/partner/bookings/{booked.booking.id}/en-route/",
        {"expected_version": booked.booking.version},
        format="json",
    )

    assert response.status_code == HTTPStatus.BAD_REQUEST
    booked.booking.refresh_from_db()
    assert booked.booking.status == Booking.Status.CONFIRMED


def test_the_same_key_replays_once_and_moves_the_booking_once() -> None:
    booked = create_booked_group(key_prefix="api-replay")
    partner = _partner_client(booked.partner)
    url = f"/api/v1/partner/bookings/{booked.booking.id}/en-route/"
    key = _key("replay")
    # Captured once. `BookedGroup.booking` re-queries on every access, so re-reading it for the
    # second call would send a *different* payload under the same key — which is a deliberate
    # 409 `IdempotencyKeyReuseError`, not a replay, and would test the opposite thing.
    version = booked.booking.version

    first = _post(partner, url, {"expected_version": version}, key)
    second = _post(partner, url, {"expected_version": version}, key)

    assert first.status_code == HTTPStatus.OK
    assert second.status_code == HTTPStatus.OK
    assert second.headers.get("Idempotent-Replay") == "true"
    assert booked.booking.status == Booking.Status.EN_ROUTE
    assert booked.booking.version == first.json()["version"], "a replay moved the version again"


def test_a_stale_expected_version_is_a_typed_conflict_not_an_overwrite() -> None:
    booked = create_booked_group(key_prefix="api-version")
    partner = _partner_client(booked.partner)
    url = f"/api/v1/partner/bookings/{booked.booking.id}/en-route/"
    stale_version = booked.booking.version
    _post(partner, url, {"expected_version": stale_version}, _key("v1"))

    stale = _post(
        partner,
        f"/api/v1/partner/bookings/{booked.booking.id}/arrived/",
        {"expected_version": stale_version},
        _key("v2"),
    )

    assert stale.status_code == HTTPStatus.CONFLICT
    assert stale.json()["error"]["code"] == "booking_version_conflict"


def test_expected_version_is_required_rather_than_defaulted() -> None:
    """A command that applies to whatever state it finds is the thing versions exist to stop."""

    booked = create_booked_group(key_prefix="api-noversion")
    partner = _partner_client(booked.partner)

    response = _post(
        partner, f"/api/v1/partner/bookings/{booked.booking.id}/en-route/", {}, _key("nov")
    )

    assert response.status_code == HTTPStatus.BAD_REQUEST


# --------------------------------------------------------------------------------------------
# Operations-assisted start — the step-up that never had a view to be enforced in
# --------------------------------------------------------------------------------------------


def _arrive(booked: BookedGroup) -> int:
    partner = _partner_client(booked.partner)
    base = f"/api/v1/partner/bookings/{booked.booking.id}"
    version = _post(
        partner, f"{base}/en-route/", {"expected_version": booked.booking.version}, _key("a-er")
    ).json()["version"]
    return int(
        _post(partner, f"{base}/arrived/", {"expected_version": version}, _key("a-ar")).json()[
            "version"
        ]
    )


def test_operations_assisted_start_without_a_step_up_is_refused() -> None:
    """The one deliberate OTP bypass, and the one place re-verification is mandatory.

    `operations_assisted_start` has always refused a blank outage reason, but the step-up it
    describes had never been enforced anywhere because there was no view to enforce it in.
    """

    booked = create_booked_group(key_prefix="api-assist-deny")
    version = _arrive(booked)
    operations, _user = _operations_client("+919870000002")

    response = _post(
        operations,
        f"/api/v1/operations/bookings/{booked.booking.id}/assisted-start/",
        {"expected_version": version, "outage_reason": "SMS provider outage"},
        _key("assist"),
    )

    assert response.status_code in (HTTPStatus.FORBIDDEN, HTTPStatus.UNAUTHORIZED)
    booked.booking.refresh_from_db()
    assert booked.booking.status == Booking.Status.ARRIVED, "work started without a step-up"


def test_operations_assisted_start_refuses_a_blank_outage_reason() -> None:
    booked = create_booked_group(key_prefix="api-assist-blank")
    version = _arrive(booked)
    operations, _user = _operations_client("+919870000003")

    response = _post(
        operations,
        f"/api/v1/operations/bookings/{booked.booking.id}/assisted-start/",
        {"expected_version": version, "outage_reason": "   "},
        _key("assist-blank"),
    )

    assert response.status_code in (
        HTTPStatus.BAD_REQUEST,
        HTTPStatus.FORBIDDEN,
        HTTPStatus.UNAUTHORIZED,
    )
    booked.booking.refresh_from_db()
    assert booked.booking.status == Booking.Status.ARRIVED


# --------------------------------------------------------------------------------------------
# Customer commands
# --------------------------------------------------------------------------------------------


def test_a_customer_cancels_their_own_visit_and_gets_the_refund_ids() -> None:
    booked = create_booked_group(key_prefix="api-cancel")

    response = _post(
        booked.client,
        f"/api/v1/bookings/{booked.booking.id}/cancel/",
        {"expected_version": booked.booking.version, "reason": "no longer needed"},
        _key("cancel"),
    )

    assert response.status_code == HTTPStatus.OK, response.json()
    body = response.json()
    assert body["booking"]["status"] == Booking.Status.CANCELLED
    assert isinstance(body["refund_ids"], list)


def test_post_payment_group_cancellation_is_a_different_command_from_the_pre_payment_one() -> None:
    """`/cancel/` is and remains the pre-payment command; it still refuses a BOOKED group."""

    booked = create_booked_group(key_prefix="api-gcancel")

    pre_payment = _post(
        booked.client,
        f"/api/v1/booking-groups/{booked.group.id}/cancel/",
        {"expected_version": booked.group.version},
        _key("pre"),
    )
    post_payment = _post(
        booked.client,
        f"/api/v1/booking-groups/{booked.group.id}/cancel-booked/",
        {"expected_version": booked.group.version, "reason": "moving house"},
        _key("post"),
    )

    assert pre_payment.status_code == HTTPStatus.CONFLICT
    assert post_payment.status_code == HTTPStatus.OK, post_payment.json()
    assert post_payment.json()["units"], "the group cancellation reported no units"


def test_the_customer_start_otp_never_publishes_the_code_to_the_partner() -> None:
    """The OTP proves the Partner is standing in front of the Customer.

    Publishing it on the Partner's own projection would prove nothing at all, so the Partner
    surface carries no field that could carry it.
    """

    booked = create_booked_group(key_prefix="api-otp-scope")
    version = _arrive(booked)
    booked.client.post(
        f"/api/v1/bookings/{booked.booking.id}/start-otp/",
        {"expected_version": version},
        format="json",
    )
    challenge = BookingOtp.objects.filter(booking=booked.booking).first()
    assert challenge is not None

    partner_body = (
        _partner_client(booked.partner).get(f"/api/v1/partner/bookings/{booked.booking.id}/").json()
    )

    assert "code" not in str(partner_body)
    assert challenge.code_hash not in str(partner_body)


def test_an_amendment_is_proposed_by_the_partner_and_priced_before_the_customer_answers() -> None:
    booked = create_booked_group(key_prefix="api-amend")
    partner = _partner_client(booked.partner)
    base = f"/api/v1/partner/bookings/{booked.booking.id}"
    version = _post(
        partner, f"{base}/en-route/", {"expected_version": booked.booking.version}, _key("am-er")
    ).json()["version"]
    version = _post(
        partner, f"{base}/arrived/", {"expected_version": version}, _key("am-ar")
    ).json()["version"]
    otp = booked.client.post(
        f"/api/v1/bookings/{booked.booking.id}/start-otp/",
        {"expected_version": version},
        format="json",
    ).json()
    version = _post(
        partner,
        f"{base}/start-otp/verify/",
        {"expected_version": version, "code": otp["development_code"]},
        _key("am-otp"),
    ).json()["version"]

    proposed = _post(
        partner,
        f"{base}/scope-amendments/",
        {"expected_version": version, "reason": "Extra socket found", "task_quantity": 1},
        _key("am-propose"),
    )

    assert proposed.status_code == HTTPStatus.CREATED, proposed.json()
    body = proposed.json()
    assert body["status"] == ScopeAmendment.Status.PROPOSED
    assert body["total_paise"] > 0, "an amendment reached the Customer with no price"
    assert body["expires_at"] and body["server_now"], "no deadline to count down to"
