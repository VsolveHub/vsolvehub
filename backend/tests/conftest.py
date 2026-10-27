"""Fixtures shared across app test packages."""

import pytest
from pytest_django.fixtures import SettingsWrapper

#: Wider than the furthest bookable visit (`M1_SCHEDULED_MAX_DAYS`) plus slack.
_WIDE_OPEN_MINUTES = 30 * 24 * 60


@pytest.fixture
def partner_gates_open(settings: SettingsWrapper) -> None:
    """Open the Partner en-route and arrival gates for tests that are about something else.

    Lifecycle tests drive a visit booked for tomorrow morning through en route and arrival to
    reach the state they actually exercise — cancellation, completion, refunds, recovery. The
    server-clock gates (`apps.fulfilment.gates`) would refuse those steps a day early, and the
    tests are not about the clock. Opting in is explicit, per module, so a reader can see it.

    Only the two command gates are widened. The address-disclosure gate is left alone, so a
    module opting in still sees the Partner projection withhold the Customer's door and number.
    The gates themselves are tested at production values in
    `tests/fulfilment/test_partner_time_gates.py`.
    """

    settings.M1_EN_ROUTE_OPENS_MINUTES = _WIDE_OPEN_MINUTES
    settings.M1_ARRIVAL_OPENS_MINUTES = _WIDE_OPEN_MINUTES
