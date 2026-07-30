"""Canonical phone-number parsing for identity boundaries."""

import phonenumbers


class InvalidPhoneNumberError(ValueError):
    """Raised when a phone number cannot be represented safely as E.164."""


def normalize_phone_number(value: str, default_region: str = "IN") -> str:
    compact_value = value.strip()
    if not compact_value:
        raise InvalidPhoneNumberError("Phone number is required.")

    try:
        parsed = phonenumbers.parse(compact_value, default_region)
    except phonenumbers.NumberParseException as exc:
        raise InvalidPhoneNumberError("Enter a valid phone number.") from exc

    if not phonenumbers.is_valid_number(parsed):
        raise InvalidPhoneNumberError("Enter a valid phone number.")

    return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
