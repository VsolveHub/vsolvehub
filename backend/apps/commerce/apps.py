from django.apps import AppConfig


class CommerceConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.commerce"

    def ready(self) -> None:
        from apps.commerce import handlers  # noqa: F401, PLC0415
