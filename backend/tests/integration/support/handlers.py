"""Outbox handlers that exist only so the integration suite can control worker timing.

These are registered by `tests.integration.support.apps.IntegrationSupportConfig.ready`, which
runs in *both* processes: the pytest process and the worker subprocess. Both load
`config.settings.integration`, which is the only settings module listing this app.
"""

import time
from pathlib import Path

from apps.foundation.models import OutboxEvent
from apps.foundation.tasks import register_outbox_handler

SLOW_HANDLER_SECONDS = 120
HANDLER_MARKER_ENVVAR = "OUTBOX_INTEGRATION_MARKER"


@register_outbox_handler(event_type="integration.noop")
def handle_noop(_event: OutboxEvent) -> None:
    """Succeed immediately. Proves a real worker consumed a real broker message."""
    return None


@register_outbox_handler(event_type="integration.slow")
def handle_slow(event: OutboxEvent) -> None:
    """Block long enough that the test can reliably kill the worker mid-command.

    Writes a marker file first so the test knows the handler actually started, rather than
    guessing from a sleep. The path comes from the event payload, which the test owns.
    """
    marker = event.payload.get("marker_path")
    if isinstance(marker, str):
        Path(marker).write_text("started", encoding="utf-8")
    time.sleep(SLOW_HANDLER_SECONDS)
