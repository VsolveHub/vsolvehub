from django.apps import AppConfig


class RidesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.rides"

    def ready(self) -> None:
        # Imported here: routing imports models, which are not loaded until the registry is ready.
        from apps.rides.routing import check_routing_provider  # noqa: PLC0415

        check_routing_provider()
