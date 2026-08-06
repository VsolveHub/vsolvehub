"""Metric names, and the promise that emitting one can never break the caller.

The names matter more than the transport. A metric invented at its call site is a metric nobody
can alert on, because the alert and the emitter disagree about what it is called the moment
somebody renames a variable. `Metric` is the single place they are written down, and this file
pins that every row of `08-security-quality-and-production.md`'s watch-list has one.
"""

import logging
from typing import Any

import pytest

from common.observability.metrics import Metric, emit


def test_every_metric_name_is_a_dotted_lowercase_slug() -> None:
    """Consistent enough to build a dashboard query from without special cases."""

    names = [
        value
        for key, value in vars(Metric).items()
        if not key.startswith("_") and isinstance(value, str)
    ]

    assert names
    for name in names:
        assert name == name.lower(), name
        assert "." in name, name
        assert " " not in name, name


def test_metric_names_are_unique() -> None:
    """Two constants sharing a name would make one of them invisible in a dashboard."""

    names = [
        value
        for key, value in vars(Metric).items()
        if not key.startswith("_") and isinstance(value, str)
    ]

    assert len(names) == len(set(names))


def test_the_plans_watch_list_is_covered() -> None:
    """Each of these maps to a row of the required metrics list. A missing one is a thing
    nobody would notice going wrong."""

    required = [
        Metric.PAYMENT_CAPTURED,
        Metric.OFFER_ACCEPTED,
        Metric.PARTNER_LATE,
        Metric.COMPLETION_DISPUTED,
        Metric.REFUND_AMBIGUOUS,
        Metric.PAYOUT_AMBIGUOUS,
        Metric.CASE_BREACHED_SLA,
        Metric.OUTBOX_DEPTH,
    ]

    assert all(isinstance(name, str) and name for name in required)


def test_emitting_writes_the_metric_its_value_and_its_labels(
    caplog: pytest.LogCaptureFixture,
) -> None:
    with caplog.at_level(logging.INFO, logger="vsolve.metrics"):
        emit(Metric.CASE_OPENED, 1, kind="SAFETY", team="SAFETY")

    record = next(item for item in caplog.records if item.message == "metric")
    assert record.metric == Metric.CASE_OPENED  # type: ignore[attr-defined]
    assert record.metric_value == 1  # type: ignore[attr-defined]
    assert record.metric_labels == {"kind": "SAFETY", "team": "SAFETY"}  # type: ignore[attr-defined]


def test_a_metric_defaults_to_counting_one(caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level(logging.INFO, logger="vsolve.metrics"):
        emit(Metric.OFFER_SENT)

    record = next(item for item in caplog.records if item.message == "metric")
    assert record.metric_value == 1  # type: ignore[attr-defined]


def test_a_broken_logger_never_breaks_the_command_being_measured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The whole point is to observe a system, not to add a way for it to fail.

    There is nowhere useful to report this failure *to*, either — the logger is the thing that
    just failed.
    """

    def explode(*_args: Any, **_kwargs: Any) -> None:
        raise RuntimeError("log drain is down")

    monkeypatch.setattr("common.observability.metrics.logger.info", explode)

    emit(Metric.PAYMENT_CAPTURED, 1, order="o-1")
