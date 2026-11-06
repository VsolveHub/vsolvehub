from datetime import UTC, datetime

import pytest

from apps.assistant.formatting import format_inr, format_window
from apps.assistant.refs import MAX_REFS, UnknownReferenceError, recall, remember


@pytest.mark.parametrize(
    ("paise", "expected"),
    [
        (49_900, "₹499"),
        (149_900, "₹1,499"),
        (12_345_050, "₹1,23,450.50"),
        (1_00_00_000_00, "₹1,00,00,000"),
    ],
)
def test_rupees_use_indian_grouping(paise: int, expected: str) -> None:
    assert format_inr(paise) == expected


def test_an_arrival_window_reads_in_the_area_timezone() -> None:
    starts = datetime(2026, 11, 7, 12, 30, tzinfo=UTC)  # 18:00 in Kolkata
    ends = datetime(2026, 11, 7, 13, 30, tzinfo=UTC)

    assert format_window(starts, ends, "Asia/Kolkata") == "Sat 7 Nov, 6:00 pm to 7:00 pm"


def test_references_are_reused_scoped_by_kind_and_case_insensitive() -> None:
    state: dict[str, object] = {}

    first = remember(state, "variant", {"id": "a"})
    again = remember(state, "variant", {"id": "a"})
    other = remember(state, "variant", {"id": "b"})

    assert first == again == "V1"
    assert other == "V2"
    assert recall(state, " v2 ", "variant") == {"id": "b"}
    with pytest.raises(UnknownReferenceError):
        recall(state, "V2", "slot")
    with pytest.raises(UnknownReferenceError):
        recall(state, "V99", "variant")


def test_the_oldest_references_are_forgotten_first() -> None:
    state: dict[str, object] = {}
    for index in range(MAX_REFS + 5):
        remember(state, "slot", {"n": index})

    with pytest.raises(UnknownReferenceError):
        recall(state, "T1", "slot")
    assert recall(state, f"T{MAX_REFS + 5}", "slot") == {"n": MAX_REFS + 4}
