"""A stay host's account status decides whether their properties exist for guests.

The short stay-host sign-up was already checked; a host listing through an approved A9
capability was not, and a suspension does not revoke capabilities — so a suspended host stayed
public. The application's status is now required on both paths.
"""

import pytest

from apps.partners.models import PartnerApplication
from apps.stay.models import Property
from apps.stay.services import create_property, public_properties
from tests.stay.test_property_units_min_stay import stay_world  # noqa: F401

pytestmark = pytest.mark.django_db


def _live_property(world):
    prop = create_property(
        host=world["host"],
        variant_id=world["variant"].id,
        title="Lakeview PG",
        location_text="Madhapur, Hyderabad",
        nightly_rate_paise=80_000,
    )
    # Published directly: what is under test is visibility, not the publishing rules.
    Property.objects.filter(id=prop.id).update(
        moderation_status=Property.ModerationStatus.APPROVED,
        listing_status=Property.ListingStatus.LIVE,
    )
    return prop


def _set_status(world, status):
    PartnerApplication.objects.filter(partner=world["host"]).update(status=status)


@pytest.mark.parametrize(
    "status",
    [PartnerApplication.Status.SUSPENDED, PartnerApplication.Status.OFFBOARDED],
)
def test_a_suspended_capability_hosts_property_disappears(stay_world, status):  # noqa: F811
    prop = _live_property(stay_world)
    assert public_properties().filter(id=prop.id).exists()

    _set_status(stay_world, status)

    assert not public_properties().filter(id=prop.id).exists()


def test_a_suspended_host_cannot_list_a_new_property(stay_world):  # noqa: F811
    _set_status(stay_world, PartnerApplication.Status.SUSPENDED)

    with pytest.raises(PermissionError):
        create_property(
            host=stay_world["host"],
            variant_id=stay_world["variant"].id,
            title="Second PG",
            location_text="Kondapur, Hyderabad",
        )


def test_reinstating_brings_the_property_back(stay_world):  # noqa: F811
    prop = _live_property(stay_world)
    _set_status(stay_world, PartnerApplication.Status.SUSPENDED)

    _set_status(stay_world, PartnerApplication.Status.APPROVED)

    assert public_properties().filter(id=prop.id).exists()
