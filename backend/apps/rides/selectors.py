"""Rides reads. No writes here."""

from dataclasses import dataclass
from datetime import datetime

from django.utils import timezone

from apps.partners.models import PartnerApplication, PartnerProfile
from apps.rides.models import CaptainDutySession, CaptainPass, CaptainVehicle

__all__ = [
    "CaptainStatus",
    "active_pass",
    "captain_status",
    "open_duty_session",
]

#: What `approval` says when the partner has not started a captain application.
NOT_STARTED = "NOT_STARTED"


@dataclass(frozen=True, slots=True)
class CaptainStatus:
    approval: str
    is_approved: bool
    vehicle: CaptainVehicle | None
    active_pass: CaptainPass | None
    on_duty: bool
    duty_started_at: datetime | None
    #: Why the captain cannot go on duty, in the order the app should explain them.
    blocked_reasons: list[str]


def active_pass(partner: PartnerProfile, *, now: datetime | None = None) -> CaptainPass | None:
    """The pass that lets this captain drive right now.

    A pass past its end is not active, even before the expiry task has caught up with it.
    """
    return (
        CaptainPass.objects.select_related("plan")
        .filter(
            partner=partner,
            status=CaptainPass.Status.ACTIVE,
            ends_at__gt=now or timezone.now(),
        )
        .first()
    )


def open_duty_session(partner: PartnerProfile) -> CaptainDutySession | None:
    return CaptainDutySession.objects.filter(partner=partner, ended_at__isnull=True).first()


def captain_status(partner: PartnerProfile) -> CaptainStatus:
    """Where this partner stands as a ride captain, and why they cannot go on duty yet."""
    application = PartnerApplication.objects.filter(
        partner=partner, track=PartnerApplication.Track.RIDE_CAPTAIN
    ).first()
    vehicle = CaptainVehicle.objects.filter(partner=partner).first()
    current_pass = active_pass(partner)
    session = open_duty_session(partner)
    approval = application.status if application else NOT_STARTED
    is_approved = approval == PartnerApplication.Status.APPROVED

    blocked: list[str] = []
    if approval == PartnerApplication.Status.SUSPENDED:
        blocked.append("suspended")
    elif not is_approved:
        blocked.append("not_approved")
    if vehicle is None:
        blocked.append("vehicle_missing")
    if current_pass is None:
        blocked.append("pass_required")

    return CaptainStatus(
        approval=approval,
        is_approved=is_approved,
        vehicle=vehicle,
        active_pass=current_pass,
        on_duty=session is not None,
        duty_started_at=session.started_at if session else None,
        blocked_reasons=blocked,
    )
