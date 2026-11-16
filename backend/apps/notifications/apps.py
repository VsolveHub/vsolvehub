from django.apps import AppConfig


class NotificationsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.notifications"

    def ready(self) -> None:
        # Registers the receiver that copies notices onto WhatsApp and SMS.
        from apps.notifications import signals  # noqa: F401, PLC0415
