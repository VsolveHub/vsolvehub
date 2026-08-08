from django.apps import AppConfig


class FulfilmentConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.fulfilment"

    def ready(self) -> None:
        from apps.fulfilment import handlers  # noqa: F401, PLC0415
