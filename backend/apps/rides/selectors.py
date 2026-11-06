"""Rides reads. No writes here."""

from dataclasses import dataclass

from apps.partners.models import PartnerApplication, PartnerProfile
from apps.rides.models import CaptainVehicle

__all__ = ["CaptainStatus", "captain_status"]

#: What `approval` says when the partner has not started a captain application.
NOT_STARTED = "NOT_STARTED"


@dataclass(frozen=True, slots=True)
class CaptainStatus:
    approval: str
    is_approved: bool
    vehicle: CaptainVehicle | None
    blocked_reasons: list[str]


def captain_status(partner: PartnerProfile) -> CaptainStatus:
    """Where this partner stands as a ride captain, and why they cannot drive yet.

    Pass, duty and open-ride state join this once those exist. Nothing here is a placeholder.
    """
    application = PartnerApplication.objects.filter(
        partner=partner, track=PartnerApplication.Track.RIDE_CAPTAIN
    ).first()
    vehicle = CaptainVehicle.objects.filter(partner=partner).first()
    is_approved = (
        application is not None and application.status == PartnerApplication.Status.APPROVED
    )

    blocked: list[str] = []
    if not is_approved:
        blocked.append("not_approved")
    if vehicle is None:
        blocked.append("vehicle_missing")

    return CaptainStatus(
        approval=application.status if application else NOT_STARTED,
        is_approved=is_approved,
        vehicle=vehicle,
        blocked_reasons=blocked,
    )
