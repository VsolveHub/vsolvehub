"""The store-review sign-in: one configured number signs in with a fixed code and no SMS.

The rules asserted here:

* the review number is let in with `OTP_REVIEW_CODE`, and no SMS is attempted for it (the tests
  run with the `unconfigured` provider, which refuses any send);
* every other number is still sent a real code, and the review code is not accepted for it;
* the rest of sign-in still applies to the review number: the wrong-code refusal, the resend
  cooldown and the Partner app's role gate;
* a staff or Operations account on that number never gets the fixed code, and the Operations
  step-up never uses it;
* production refuses a half-set, malformed or guessable pair at start-up.
"""

from http import HTTPStatus
from typing import Any

import pytest
from django.core.cache import cache
from django.core.exceptions import ImproperlyConfigured
from django.test import override_settings
from rest_framework.test import APIClient

from apps.identity.delivery import OtpDeliveryError
from apps.identity.models import AccessAuditEvent, OtpChallenge, Role, User, UserRole
from apps.identity.services import REVIEW_SIGN_IN_CODE_ACTION, issue_step_up_otp
from config.settings.guards import guard_review_sign_in

pytestmark = pytest.mark.django_db

REVIEW_PHONE = "+919000000001"
REVIEW_CODE = "482913"
OTHER_PHONE = "+919800033301"

review_settings = override_settings(
    OTP_PROVIDER="unconfigured",
    OTP_DEVELOPMENT_CODE_ENABLED=False,
    OTP_REVIEW_PHONE_NUMBER=REVIEW_PHONE,
    OTP_REVIEW_CODE=REVIEW_CODE,
)


@pytest.fixture(autouse=True)
def clear_rate_limit_cache() -> None:
    cache.clear()


def _request_code(client: APIClient, phone: str, **extra: object) -> Any:
    return client.post("/api/v1/auth/otp/request/", {"phone_number": phone, **extra}, format="json")


def _verify(client: APIClient, phone: str, challenge_id: object, code: str) -> Any:
    return client.post(
        "/api/v1/auth/otp/verify/",
        {"challenge_id": challenge_id, "phone_number": phone, "code": code},
        format="json",
    )


def _grant(phone: str, role_code: str) -> User:
    user, _ = User.objects.get_or_create(phone_number=phone)
    role, _ = Role.objects.get_or_create(
        code=role_code, defaults={"name": role_code.title(), "is_system": True}
    )
    UserRole.objects.create(user=user, role=role)
    return user


@review_settings
def test_the_review_number_signs_in_with_the_fixed_code_and_no_sms() -> None:
    client = APIClient()

    issued = _request_code(client, "9000000001")

    assert issued.status_code == HTTPStatus.ACCEPTED
    assert issued.json()["development_code"] is None
    challenge = OtpChallenge.objects.get(id=issued.json()["challenge_id"])
    assert challenge.delivery_status == OtpChallenge.DeliveryStatus.SENT

    signed_in = _verify(client, REVIEW_PHONE, issued.json()["challenge_id"], REVIEW_CODE)

    assert signed_in.status_code == HTTPStatus.OK
    assert signed_in.json()["user"]["phone_number"] == REVIEW_PHONE
    audit = AccessAuditEvent.objects.get(action=REVIEW_SIGN_IN_CODE_ACTION)
    assert audit.object_id == challenge.id


@review_settings
def test_a_wrong_code_for_the_review_number_is_refused() -> None:
    client = APIClient()
    issued = _request_code(client, REVIEW_PHONE).json()

    refused = _verify(client, REVIEW_PHONE, issued["challenge_id"], "111112")

    assert refused.status_code == HTTPStatus.BAD_REQUEST
    assert refused.json()["error"]["code"] == "invalid_otp"
    assert OtpChallenge.objects.get(id=issued["challenge_id"]).failed_attempts == 1


@review_settings
def test_any_other_number_is_still_sent_a_real_code() -> None:
    # The unconfigured provider refuses every send, so a 503 proves an SMS was attempted.
    response = _request_code(APIClient(), OTHER_PHONE)

    assert response.status_code == HTTPStatus.SERVICE_UNAVAILABLE
    assert response.json()["error"]["code"] == "otp_unavailable"
    assert not AccessAuditEvent.objects.filter(action=REVIEW_SIGN_IN_CODE_ACTION).exists()


@override_settings(
    OTP_DEVELOPMENT_CODE_ENABLED=True,
    OTP_REVIEW_PHONE_NUMBER=REVIEW_PHONE,
    OTP_REVIEW_CODE=REVIEW_CODE,
)
def test_the_review_code_does_not_open_any_other_number(monkeypatch: pytest.MonkeyPatch) -> None:
    # A fixed random code, so the number's real code can never happen to equal the review code.
    monkeypatch.setattr("apps.identity.services.secrets.randbelow", lambda _upper: 111111)
    client = APIClient()
    issued = _request_code(client, OTHER_PHONE).json()
    assert issued["development_code"] == "111111"

    refused = _verify(client, OTHER_PHONE, issued["challenge_id"], REVIEW_CODE)

    assert refused.status_code == HTTPStatus.BAD_REQUEST
    assert not User.objects.filter(phone_number=OTHER_PHONE).exists()


@review_settings
def test_the_resend_cooldown_still_applies_to_the_review_number() -> None:
    client = APIClient()
    assert _request_code(client, REVIEW_PHONE).status_code == HTTPStatus.ACCEPTED

    again = _request_code(client, REVIEW_PHONE)

    assert again.status_code == HTTPStatus.TOO_MANY_REQUESTS


@review_settings
def test_the_partner_app_role_gate_still_applies_to_the_review_number() -> None:
    client = APIClient()

    no_partner = _request_code(client, REVIEW_PHONE, intended_role="partner")
    assert no_partner.status_code == HTTPStatus.NOT_FOUND
    assert no_partner.json()["error"]["code"] == "no_account_for_role"

    cache.clear()
    _grant(REVIEW_PHONE, "partner")
    issued = _request_code(client, REVIEW_PHONE, intended_role="partner")
    assert issued.status_code == HTTPStatus.ACCEPTED

    signed_in = _verify(client, REVIEW_PHONE, issued.json()["challenge_id"], REVIEW_CODE)
    assert signed_in.status_code == HTTPStatus.OK
    assert "partner" in signed_in.json()["user"]["roles"]


@review_settings
def test_an_operations_account_on_the_review_number_is_sent_a_real_code() -> None:
    _grant(REVIEW_PHONE, "operations")

    response = _request_code(APIClient(), REVIEW_PHONE)

    assert response.status_code == HTTPStatus.SERVICE_UNAVAILABLE
    assert not AccessAuditEvent.objects.filter(action=REVIEW_SIGN_IN_CODE_ACTION).exists()


@review_settings
def test_a_staff_account_on_the_review_number_is_sent_a_real_code() -> None:
    User.objects.create(phone_number=REVIEW_PHONE, is_staff=True)

    response = _request_code(APIClient(), REVIEW_PHONE)

    assert response.status_code == HTTPStatus.SERVICE_UNAVAILABLE


@review_settings
def test_the_operations_step_up_never_uses_the_review_code() -> None:
    user = User.objects.create(phone_number=REVIEW_PHONE)

    with pytest.raises(OtpDeliveryError):
        issue_step_up_otp(user=user, request_ip="203.0.113.7")


@override_settings(
    OTP_PROVIDER="unconfigured",
    OTP_REVIEW_PHONE_NUMBER="",
    OTP_REVIEW_CODE="",
)
def test_with_no_review_number_set_every_number_is_sent_a_real_code() -> None:
    response = _request_code(APIClient(), REVIEW_PHONE)

    assert response.status_code == HTTPStatus.SERVICE_UNAVAILABLE


def test_the_guard_accepts_both_empty_and_a_sensible_pair() -> None:
    guard_review_sign_in("", "", code_length=6)
    guard_review_sign_in(REVIEW_PHONE, REVIEW_CODE, code_length=6)


@pytest.mark.parametrize(("phone", "code"), [(REVIEW_PHONE, ""), ("", REVIEW_CODE)])
def test_the_guard_refuses_half_a_pair(phone: str, code: str) -> None:
    with pytest.raises(ImproperlyConfigured, match="together"):
        guard_review_sign_in(phone, code, code_length=6)


@pytest.mark.parametrize("phone", ["9000000001", "+91 9000000001", "+19000000001", "+915000000001"])
def test_the_guard_refuses_a_number_not_in_indian_e164(phone: str) -> None:
    with pytest.raises(ImproperlyConfigured, match="OTP_REVIEW_PHONE_NUMBER"):
        guard_review_sign_in(phone, REVIEW_CODE, code_length=6)


@pytest.mark.parametrize("code", ["48291", "4829130", "48291a"])
def test_the_guard_refuses_a_code_of_the_wrong_shape(code: str) -> None:
    with pytest.raises(ImproperlyConfigured, match="exactly 6 digits"):
        guard_review_sign_in(REVIEW_PHONE, code, code_length=6)


@pytest.mark.parametrize("code", ["000000", "777777", "123456", "456789", "654321"])
def test_the_guard_refuses_a_guessable_code(code: str) -> None:
    with pytest.raises(ImproperlyConfigured, match="too easy to guess"):
        guard_review_sign_in(REVIEW_PHONE, code, code_length=6)
