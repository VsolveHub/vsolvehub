from importlib import import_module

from django.apps import AppConfig


class IdentityConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.identity"

    def ready(self) -> None:
        import_module("apps.identity.schema")
