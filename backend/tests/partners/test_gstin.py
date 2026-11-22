"""Offline GSTIN validation (employer onboarding, README 4.1)."""

import pytest

from apps.partners.gstin import GstinInvalidError, gstin_check_char, validate_gstin

SAMPLES = ("27AAPFU0939F1ZV", "29AAGCB7383J1Z4")


@pytest.mark.parametrize("gstin", SAMPLES)
def test_public_samples_pass(gstin):
    assert validate_gstin(gstin).gstin == gstin


def test_facts_are_read_from_the_number():
    facts = validate_gstin("27AAPFU0939F1ZV")
    assert facts.state_code == "27"
    assert facts.state_name == "Maharashtra"
    assert facts.pan == "AAPFU0939F"
    assert facts.pan_holder_letter == "F"


def test_check_char_matches_samples():
    for gstin in SAMPLES:
        assert gstin_check_char(gstin[:14]) == gstin[14]


def test_lower_case_and_spaces_are_normalised():
    assert validate_gstin(" 27aapfu0939f1zv ").gstin == "27AAPFU0939F1ZV"


def test_wrong_check_character_fails():
    with pytest.raises(GstinInvalidError) as exc:
        validate_gstin("27AAPFU0939F1ZW")
    assert exc.value.code == "gstin_checksum"


@pytest.mark.parametrize("raw", ["", "27AAPFU0939F1Z", "27AAPFU0939F1ZVV", "27AAPFU0939F1Z-"])
def test_wrong_length_or_characters_fail(raw):
    with pytest.raises(GstinInvalidError) as exc:
        validate_gstin(raw)
    assert exc.value.code == "gstin_format"


def test_unknown_state_code_fails():
    with pytest.raises(GstinInvalidError) as exc:
        validate_gstin("00AAPFU0939F1ZV")
    assert exc.value.code == "gstin_state"


def test_bad_pan_part_fails():
    with pytest.raises(GstinInvalidError) as exc:
        validate_gstin("2711111111111ZV")
    assert exc.value.code == "gstin_pan"


def test_entity_number_zero_fails():
    with pytest.raises(GstinInvalidError) as exc:
        validate_gstin("27AAPFU0939F0ZV")
    assert exc.value.code == "gstin_format"
