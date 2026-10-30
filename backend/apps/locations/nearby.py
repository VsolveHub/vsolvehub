"""Browse "in this area, else nearby": listings sorted by distance from a searched point.

The point comes from the browse page's place search (or the phone's location). One query does
both jobs: listings in the area sort first, and the nearest ones follow when the area has none.
Plain maths on the stored pins: no PostGIS, no call to Google.
"""

import math
from decimal import Decimal
from typing import Any

from django.db import models
from django.db.models.functions import ASin, Cast, Cos, Power, Radians, Round, Sin, Sqrt
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter
from rest_framework import serializers
from rest_framework.request import Request

from apps.locations.pins import AREA_DECIMALS

#: How far "nearby" reaches. Past this a listing is not near the searched place.
NEARBY_RADIUS_KM = 25
EARTH_RADIUS_KM = 6371.0
#: One degree of latitude, in km. Used only for the cheap box filter that runs before the maths.
KM_PER_DEGREE = 111.0

Point = tuple[float, float]

NEARBY_PARAMETERS = [
    OpenApiParameter(
        "lat",
        OpenApiTypes.DOUBLE,
        OpenApiParameter.QUERY,
        description=(
            "Searched point. Send with `lng`: results are listings within "
            f"{NEARBY_RADIUS_KM} km, nearest first, with `distance_km` set."
        ),
    ),
    OpenApiParameter("lng", OpenApiTypes.DOUBLE, OpenApiParameter.QUERY),
]


#: `distance_km` on a browse result: km from the searched point, one decimal. Null without one,
#: and for a listing with no pin.
DISTANCE_KM = serializers.FloatField(allow_null=True, read_only=True)


class _PointQuery(serializers.Serializer[Any]):
    lat = serializers.FloatField(min_value=-90, max_value=90, required=False)
    lng = serializers.FloatField(min_value=-180, max_value=180, required=False)


def point_from(request: Request) -> Point | None:
    """`?lat=&lng=` as a point, or ``None`` when neither is sent.

    One without the other, or a value out of range, is refused rather than ignored: ignoring it
    would quietly show every listing as if the search had no place.
    """
    query = _PointQuery(data=request.query_params)
    query.is_valid(raise_exception=True)
    lat = query.validated_data.get("lat")
    lng = query.validated_data.get("lng")
    if lat is None and lng is None:
        return None
    if lat is None or lng is None:
        raise serializers.ValidationError(
            {"lat": ["Send lat and lng together."]}, code="pin_incomplete"
        )
    return (lat, lng)


def nearest_first[Model: models.Model](
    queryset: models.QuerySet[Model],
    point: Point,
    *,
    latitude: str,
    longitude: str,
    place_name: str = "",
    area_only: bool = False,
) -> models.QuerySet[Model]:
    """Listings within ``NEARBY_RADIUS_KM`` of ``point``, nearest first, annotated ``distance_km``.

    A listing with no pin (it predates pins) cannot be placed, so it is kept only when its
    location text names the searched place, and it sorts after every pinned one with no distance.

    ``area_only`` measures from the pin rounded to an area, for a stay whose host's exact pin is
    private: the distance then tells a guest nothing the area pin does not already show.
    """
    lat0, lng0 = point
    lat_span = NEARBY_RADIUS_KM / KM_PER_DEGREE
    lng_span = NEARBY_RADIUS_KM / (KM_PER_DEGREE * max(math.cos(math.radians(lat0)), 0.01))
    in_box = models.Q(
        **{
            f"{latitude}__gte": Decimal(str(lat0 - lat_span)),
            f"{latitude}__lte": Decimal(str(lat0 + lat_span)),
            f"{longitude}__gte": Decimal(str(lng0 - lng_span)),
            f"{longitude}__lte": Decimal(str(lng0 + lng_span)),
        }
    )
    unpinned_named = models.Q(**{f"{latitude}__isnull": True})
    if place_name.strip():
        unpinned_named &= models.Q(location_text__icontains=place_name.strip())
    else:
        unpinned_named = models.Q(pk__in=[])

    def degrees(field: str) -> Any:
        # Round while still a decimal: Postgres has no two-argument round() for floats.
        value: Any = models.F(field)
        if area_only:
            value = Round(value, AREA_DECIMALS)
        return Cast(value, models.FloatField())

    lat1 = Radians(degrees(latitude))
    lng1 = Radians(degrees(longitude))
    # Haversine. `a` stays within [0, 1] for points this close, so ASin never sees a bad value.
    a = Power(Sin((lat1 - math.radians(lat0)) / 2), 2) + math.cos(math.radians(lat0)) * Cos(
        lat1
    ) * Power(Sin((lng1 - math.radians(lng0)) / 2), 2)
    distance = models.ExpressionWrapper(
        2 * EARTH_RADIUS_KM * ASin(Sqrt(a)), output_field=models.FloatField()
    )
    nearby: models.QuerySet[Model] = (
        queryset.filter(in_box | unpinned_named)
        .annotate(distance_km=distance)
        .filter(models.Q(distance_km__lte=NEARBY_RADIUS_KM) | models.Q(distance_km__isnull=True))
        .order_by(models.F("distance_km").asc(nulls_last=True), "-id")
    )
    return nearby


def distance_of(obj: Any) -> float | None:
    """The row's `distance_km` rounded for display, or ``None`` when no point was searched."""
    value = getattr(obj, "distance_km", None)
    return None if value is None else round(float(value), 1)
