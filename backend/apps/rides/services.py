"""Rides commands: every state change is authorised and audited here, never in a view."""

import logging

from django.db import IntegrityError, transaction

from apps.partners.models import PartnerApplication, PartnerProfile
from apps.rides.exceptions import CaptainNotApprovedError, RegistrationAlreadyUsedError
from apps.rides.models import CaptainVehicle, normalise_registration_number

__all__ = ["VEHICLE_EDITABLE_STATUSES", "save_captain_vehicle"]

logger = logging.getLogger(__name__)

#: A captain can change the vehicle only while the application is still theirs to edit. Once it is
#: submitted the reviewer is looking at documents for that vehicle, and an approved captain who
#: could swap it would bypass the review. Operations changes it after that.
VEHICLE_EDITABLE_STATUSES = (
    PartnerApplication.Status.DRAFT,
    PartnerApplication.Status.CHANGES_REQUIRED,
)


def _plate_taken_by_another(*, partner: PartnerProfile, registration_number: str) -> bool:
    return (
        CaptainVehicle.objects.filter(registration_number=registration_number)
        .exclude(partner=partner)
        .exists()
    )


def save_captain_vehicle(
    *,
    partner: PartnerProfile,
    vehicle_type: str,
    registration_number: str,
    make_model: str,
    colour: str,
) -> CaptainVehicle:
    """Create or replace the partner's vehicle. Repeating the same call changes nothing."""
    application = PartnerApplication.objects.filter(
        partner=partner, track=PartnerApplication.Track.RIDE_CAPTAIN
    ).first()
    if application is None or application.status not in VEHICLE_EDITABLE_STATUSES:
        raise CaptainNotApprovedError

    plate = normalise_registration_number(registration_number)
    # A friendly early answer. The unique constraint below is what actually decides a race.
    if _plate_taken_by_another(partner=partner, registration_number=plate):
        raise RegistrationAlreadyUsedError

    try:
        with transaction.atomic():
            vehicle, created = CaptainVehicle.objects.update_or_create(
                partner=partner,
                defaults={
                    "vehicle_type": vehicle_type,
                    "registration_number": plate,
                    "make_model": make_model,
                    "colour": colour,
                },
            )
    except IntegrityError as exc:
        # Only a plate lost in a race is a duplicate. Anything else is a real fault, so it surfaces.
        if _plate_taken_by_another(partner=partner, registration_number=plate):
            raise RegistrationAlreadyUsedError from exc
        raise

    logger.info(
        "ride_captain_vehicle_saved",
        # Not "created": that name is reserved on LogRecord and logging raises KeyError for it.
        extra={
            "partner_id": str(partner.id),
            "vehicle_type": vehicle_type,
            "vehicle_created": created,
        },
    )
    return vehicle
