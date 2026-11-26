"""The Operations step-up with Django's own OTP: always the signed-in person's own number.

The rules asserted here:

* the code is sent to the signed-in account's number, never to one taken from the request;
* confirming checks the code against that number, and a different number is refused with its
  own error rather than called a wrong code;
* confirming a step-up never creates an account, whatever number a challenge was for.
"""

from http import HTTPStatus
from typing import Any

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from apps.identity.models import OtpChallenge, Role, User, UserRole, UserSession

pytestmark = pytest.mark.django_db

OPERATOR = "+919800022201"
SOMEONE_ELSE = "+919800022299"


@pytest.fixture(autouse=True)
def clear_rate_limit_cache() -> None:
    cache.clear()


def _signed_in_operator(phone: str = OPERATOR) -> APIClient:
    """An Operations session reached the way the console reaches it: sign in, then switch."""

    user = User.objects.create(phone_number=phone)
    role, _ = Role.objects.get_or_create(
        code="operations", defaults={"name": "Operations", "is_system": True}
    )
    UserRole.objects.create(user=user, role=role)
    client = APIClient()
    issued = client.post("/api/v1/auth/otp/request/", {"phone_number": phone}, format="json").json()
    signed_in = client.post(
        "/api/v1/auth/otp/verify/",
        {
            "challenge_id": issued["challenge_id"],
            "phone_number": phone,
            "code": issued["development_code"],
        },
        format="json",
    )
    assert signed_in.status_code == HTTPStatus.OK
    switched = client.post("/api/v1/auth/roles/switch/", {"role": "operations"}, format="json")
    assert switched.status_code == HTTPStatus.OK
    # The sign-in's own resend cooldown would otherwise refuse the step-up code.
    cache.clear()
    return client


def _session(phone: str = OPERATOR) -> UserSession:
    return UserSession.objects.get(user__phone_number=phone, revoked_at__isnull=True)


def _send_code(client: APIClient) -> Any:
    return client.post("/api/v1/auth/finance/step-up/code/")


def _confirm(client: APIClient, **body: object) -> Any:
    return client.post("/api/v1/auth/finance/step-up/", body, format="json")


def test_the_code_goes_to_the_signed_in_number_and_steps_up() -> None:
    client = _signed_in_operator()

    sent = _send_code(client)

    assert sent.status_code == HTTPStatus.ACCEPTED
    issued = sent.json()
    assert issued["phone_number_masked"].endswith("2201")
    assert OPERATOR not in issued["phone_number_masked"]
    challenge = OtpChallenge.objects.get(id=issued["challenge_id"])
    assert challenge.phone_number == OPERATOR

    confirmed = _confirm(
        client, challenge_id=issued["challenge_id"], code=issued["development_code"]
    )

    assert confirmed.status_code == HTTPStatus.OK
    assert confirmed.json()["stepped_up_at"]
    assert _session().stepped_up_at is not None


def test_a_number_in_the_send_request_is_ignored() -> None:
    client = _signed_in_operator()

    sent = client.post(
        "/api/v1/auth/finance/step-up/code/", {"phone_number": SOMEONE_ELSE}, format="json"
    )

    assert sent.status_code == HTTPStatus.ACCEPTED
    challenge = OtpChallenge.objects.get(id=sent.json()["challenge_id"])
    assert challenge.phone_number == OPERATOR
    assert not OtpChallenge.objects.filter(phone_number=SOMEONE_ELSE).exists()


def test_sending_a_code_needs_a_signed_in_person() -> None:
    response = APIClient().post("/api/v1/auth/finance/step-up/code/")

    assert response.status_code in (HTTPStatus.UNAUTHORIZED, HTTPStatus.FORBIDDEN)
    assert not OtpChallenge.objects.exists()


def test_a_different_number_is_refused_as_a_mismatch_not_a_wrong_code() -> None:
    client = _signed_in_operator()
    issued = _send_code(client).json()

    response = _confirm(
        client,
        challenge_id=issued["challenge_id"],
        phone_number=SOMEONE_ELSE,
        code=issued["development_code"],
    )

    assert response.status_code == HTTPStatus.FORBIDDEN
    assert response.json()["error"]["code"] == "step_up_identity_mismatch"
    assert _session().stepped_up_at is None
    # Refused before the code was checked, so the challenge is still unspent.
    assert not OtpChallenge.objects.get(id=issued["challenge_id"]).is_consumed


def test_the_operators_own_number_may_still_be_sent() -> None:
    client = _signed_in_operator()
    issued = _send_code(client).json()

    response = _confirm(
        client,
        challenge_id=issued["challenge_id"],
        phone_number="98000 22201",
        code=issued["development_code"],
    )

    assert response.status_code == HTTPStatus.OK


def test_a_code_for_another_number_steps_nothing_up_and_creates_no_account() -> None:
    """The bug this file exists for: a correct code for somebody else's number."""

    client = _signed_in_operator()
    # A login challenge for a number nobody has an account for, as the old screen made.
    other = (
        APIClient()
        .post("/api/v1/auth/otp/request/", {"phone_number": SOMEONE_ELSE}, format="json")
        .json()
    )

    response = _confirm(client, challenge_id=other["challenge_id"], code=other["development_code"])

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert response.json()["error"]["code"] == "invalid_otp"
    assert _session().stepped_up_at is None
    assert not User.objects.filter(phone_number=SOMEONE_ELSE).exists()


def test_a_wrong_code_is_counted_and_refused() -> None:
    client = _signed_in_operator()
    issued = _send_code(client).json()
    wrong = "000000" if issued["development_code"] != "000000" else "000001"

    response = _confirm(client, challenge_id=issued["challenge_id"], code=wrong)

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert response.json()["error"]["code"] == "invalid_otp"
    assert OtpChallenge.objects.get(id=issued["challenge_id"]).failed_attempts == 1
    assert _session().stepped_up_at is None


def test_a_step_up_code_is_single_use() -> None:
    client = _signed_in_operator()
    issued = _send_code(client).json()
    body = {"challenge_id": issued["challenge_id"], "code": issued["development_code"]}

    first = _confirm(client, **body)
    again = _confirm(client, **body)

    assert first.status_code == HTTPStatus.OK
    assert again.status_code == HTTPStatus.BAD_REQUEST
    assert again.json()["error"]["code"] == "invalid_otp"


def test_sign_in_still_creates_an_account_for_a_new_number() -> None:
    """The shared challenge check did not change sign-in: a new number still gets an account."""

    client = APIClient()
    issued = client.post(
        "/api/v1/auth/otp/request/", {"phone_number": SOMEONE_ELSE}, format="json"
    ).json()

    response = client.post(
        "/api/v1/auth/otp/verify/",
        {
            "challenge_id": issued["challenge_id"],
            "phone_number": SOMEONE_ELSE,
            "code": issued["development_code"],
        },
        format="json",
    )

    assert response.status_code == HTTPStatus.OK
    assert User.objects.filter(phone_number=SOMEONE_ELSE).exists()
