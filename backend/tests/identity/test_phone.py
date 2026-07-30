import pytest

from apps.identity.phone import InvalidPhoneNumberError, normalize_phone_number


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("9876543210", "+919876543210"),
        ("+91 98765 43210", "+919876543210"),
        ("  +919876543210  ", "+919876543210"),
    ],
)
def test_normalize_phone_number_to_e164(value: str, expected: str) -> None:
    assert normalize_phone_number(value) == expected


@pytest.mark.parametrize("value", ["", "123", "not-a-phone"])
def test_invalid_phone_number_is_rejected(value: str) -> None:
    with pytest.raises(InvalidPhoneNumberError):
        normalize_phone_number(value)
