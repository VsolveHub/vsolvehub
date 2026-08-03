from django.apps import AppConfig


class AssignmentsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.assignments"

    def ready(self) -> None:
        from apps.assignments import handlers  # noqa: F401, PLC0415
