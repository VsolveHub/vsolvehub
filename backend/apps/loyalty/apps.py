from django.apps import AppConfig


class LoyaltyConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.loyalty"

    def ready(self) -> None:
        from apps.loyalty import handlers  # noqa: F401, PLC0415
