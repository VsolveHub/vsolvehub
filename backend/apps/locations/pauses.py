"""Paused service areas: the `SERVICE_AREA` kill switch, read in one place.

Operations pauses an area (flooding, a strike, a safety incident) from the kill-switch board, with
the area's slug as the switch target. While it is paused nothing new starts there: no new booking
or crew/project request is accepted (`check_serviceability` refuses with `SERVICE_AREA_PAUSED`),
and no partner is sent a new offer for work in it. A blank target pauses every area.

Bookings already confirmed keep their partner; Operations decides about those case by case.
"""

from apps.locations.models import ServiceArea
from apps.notifications.models import KillSwitch

#: The reason `check_serviceability` gives while an area is paused.
SERVICE_AREA_PAUSED = "SERVICE_AREA_PAUSED"


def paused_area_slugs() -> tuple[frozenset[str], bool]:
    """The slugs of paused areas, and whether every area is paused (a blank-target switch)."""
    targets = frozenset(
        KillSwitch.objects.filter(scope=KillSwitch.Scope.SERVICE_AREA, is_engaged=True).values_list(
            "target", flat=True
        )
    )
    return targets - {""}, "" in targets


def is_area_paused(area: ServiceArea | None) -> bool:
    if area is None:
        return False
    slugs, everything = paused_area_slugs()
    return everything or area.slug in slugs
