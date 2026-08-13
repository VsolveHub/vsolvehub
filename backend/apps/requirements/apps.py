from django.apps import AppConfig


class RequirementsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.requirements"

    def ready(self) -> None:
        from apps.requirements import handlers  # noqa: F401, PLC0415
