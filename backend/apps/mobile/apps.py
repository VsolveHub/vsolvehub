from importlib import import_module

from django.apps import AppConfig


class MobileConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.mobile"

    def ready(self) -> None:
        import_module("apps.mobile.signals")
