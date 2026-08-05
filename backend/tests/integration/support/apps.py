"""Test-only Django app carrying the integration suite's outbox handlers."""

from django.apps import AppConfig


class IntegrationSupportConfig(AppConfig):
    name = "tests.integration.support"
    label = "integration_support"

    def ready(self) -> None:
        from tests.integration.support import handlers  # noqa: F401, PLC0415
