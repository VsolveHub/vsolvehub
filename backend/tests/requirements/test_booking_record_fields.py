"""What a confirmed A3 booking has to publish for its own screen to exist.

Two fields, both added at contract 1.36.0, both for the same reason: everything a Customer does
after confirmation — recording the crew's arrival, reading the receipt, checking the frozen rate —
belongs on the booking, and until now the booking could neither be *reached* from the request nor
say *when* the money cleared.

`access_receipt_for` is not exercised here. It needs a real `Engagement`, no fixture in this suite
builds one, and a test that skips itself when the setup is missing is worse than no test: it
reports as coverage while asserting nothing. That path was verified against the running server
instead — receipt `M2A-2026-27-2`, kind `A3_BOOKING_FEE`, with its `paid_at` — and is noted as a
unit-test gap rather than papered over.
"""

import pytest
from django.utils import timezone

from apps.requirements.serializers import RateCardStateSerializer

pytestmark = pytest.mark.django_db


def _state(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "preview": None,
        "booking": None,
        "booking_fee": None,
        "checkout_available": False,
        "confirmed_partner_id": None,
        "confirmed_partner_name": None,
        "engagement_id": None,
        "server_now": timezone.now(),
    }
    payload.update(overrides)
    return payload


def test_the_engagement_id_is_published_even_when_there_is_none() -> None:
    """Null rather than absent.

    A request still looking for a crew has no booking to open, and the confirmed card falls back
    to the list on a null. It cannot fall back on a *missing key* — that reads as an older server
    and the client would have to guess which.
    """
    data = RateCardStateSerializer(_state()).data

    assert "engagement_id" in data
    assert data["engagement_id"] is None


def test_the_engagement_id_is_published_once_one_exists() -> None:
    """The whole point: the request can finally link straight to its booking.

    Before 1.36.0 this field did not exist, so the confirmed card could only offer the whole
    bookings list — and a record most people reach by browsing is a record most people do not
    reach.
    """
    engagement_id = "e91e74b4-5621-487e-9e9d-66961965c3a6"

    data = RateCardStateSerializer(_state(engagement_id=engagement_id)).data

    assert str(data["engagement_id"]) == engagement_id
