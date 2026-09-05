"""What a Customer may know about a vendor before choosing them.

A quote card carried a name, a type and a "Verified" chip, and people choose a contractor on trust
before price. Everything here is read off records that already exist — completed engagements and
the ratings Customers left on them — and nothing here is an input to matching or ranking, which
`ratings.models` forbids. It is a disclosure, computed at read time, never stored.
"""

from dataclasses import dataclass
from datetime import date

from django.db.models import Avg, Count

from apps.partners.models import PartnerProfile
from apps.ratings.models import ServiceRating
from apps.requirements.models import Engagement

#: An engagement in any of these states is work this vendor carried through.
COMPLETED_ENGAGEMENT_STATUSES = (
    Engagement.Status.COMPLETED,
    Engagement.Status.WARRANTY,
    Engagement.Status.CLOSED,
)


@dataclass(frozen=True, slots=True)
class VendorTrust:
    #: Mean Customer score, one decimal, or None when nobody has rated them yet.
    rating_average: float | None
    rating_count: int
    jobs_completed: int
    experience_years: int
    active_since: date


def trust_for(partner: PartnerProfile) -> VendorTrust:
    ratings = ServiceRating.objects.filter(
        recipient_id=partner.user_id,
        rater_role=ServiceRating.RaterRole.CUSTOMER,
    ).aggregate(average=Avg("score"), count=Count("id"))
    average = ratings["average"]
    return VendorTrust(
        rating_average=None if average is None else round(float(average), 1),
        rating_count=int(ratings["count"] or 0),
        jobs_completed=Engagement.objects.filter(
            partner=partner, status__in=COMPLETED_ENGAGEMENT_STATUSES
        ).count(),
        experience_years=int(partner.experience_years),
        active_since=partner.created_at.date(),
    )
