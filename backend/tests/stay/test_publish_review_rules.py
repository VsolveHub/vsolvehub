"""Publishing rules: verified hosts go live at once; a first paid property is reviewed once.

The partner is verified when their application is approved, so enquiry-mode properties publish
directly. A host's first paid-booking (RESERVATION-mode) property waits for one Operations review;
approving it trusts the host, and a takedown withdraws that trust.
"""

import pytest
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

from apps.catalog.models import (
    A9VariantConfiguration,
    Category,
    Service,
    ServiceVariant,
    Subcategory,
)
from apps.identity.models import Role, UserRole
from apps.partners.models import PartnerApplication, PartnerCapability, PartnerProfile
from apps.stay.models import Property, PropertyMedia, StayModerationEvent
from apps.stay.services import (
    StayStateError,
    add_property_media,
    create_property,
    moderate_property,
    public_properties,
    remove_property_media,
    submit_property,
    update_unit,
)
from tests.helpers import force_role_client

User = get_user_model()

COVER = "https://cdn.example.com/cover.jpg"


def _variant(service: Service, code: str, mode: str) -> ServiceVariant:
    variant = ServiceVariant.objects.create(
        service=service,
        code=code,
        name=code,
        pricing_strategy=ServiceVariant.PricingStrategy.FIXED,
        booking_archetype=ServiceVariant.BookingArchetype.A9_STAY,
        required_skill_code="stay",
        tax_category_code="stay",
    )
    A9VariantConfiguration.objects.create(
        variant=variant,
        version=1,
        status=A9VariantConfiguration.Status.ACTIVE,
        booking_mode=mode,
    )
    return variant


@pytest.fixture
def world(db):  # noqa: ARG001
    category = Category.objects.create(slug="publish-rules", name="Publish Rules")
    sub = Subcategory.objects.create(category=category, slug="publish-sub", name="Publish Sub")
    service = Service.objects.create(
        subcategory=sub, slug="publish-svc", name="Publish Svc", status=Service.Status.ACTIVE
    )
    enquiry = _variant(service, "pg-enquiry", A9VariantConfiguration.BookingMode.ENQUIRY)
    paid = _variant(service, "hotel-paid", A9VariantConfiguration.BookingMode.RESERVATION)

    host_user = User.objects.create(phone_number="+919944440001", full_name="Publish Host")
    host = PartnerProfile.objects.create(user=host_user, display_name="Publish Host Stays")
    PartnerApplication.objects.create(partner=host, status=PartnerApplication.Status.APPROVED)
    PartnerCapability.objects.create(
        partner=host,
        variant=enquiry,
        archetype=ServiceVariant.BookingArchetype.A9_STAY,
        status=PartnerCapability.Status.APPROVED,
    )
    ops_user = User.objects.create(phone_number="+919944440002", full_name="Publish Ops")
    return {"enquiry": enquiry, "paid": paid, "host": host, "host_user": host_user, "ops": ops_user}


def _property(world, variant_key: str, *, with_room: bool = True, title: str = "Stay") -> Property:
    return create_property(
        host=world["host"],
        variant_id=world[variant_key].id,
        title=title,
        location_text="Madhapur, Hyderabad",
        nightly_rate_paise=150000 if with_room else None,
        image_urls=[COVER],
    )


def _trusted_at(world):
    return PartnerProfile.objects.get(id=world["host"].id).paid_stays_trusted_at


def _partner_client(user) -> APIClient:
    role, _ = Role.objects.get_or_create(code="partner", defaults={"name": "Partner"})
    UserRole.objects.get_or_create(user=user, role=role, revoked_at=None)
    return force_role_client(user=user, role_code="partner")


# --- who goes live, who waits ---------------------------------------------------------------


@pytest.mark.django_db
def test_enquiry_property_goes_live_on_publish_without_review(world):
    prop = _property(world, "enquiry")

    published = submit_property(prop=prop, host=world["host"])

    assert published.moderation_status == Property.ModerationStatus.APPROVED
    assert published.public_state == "PUBLISHED"
    assert StayModerationEvent.objects.filter(
        property=prop, action=StayModerationEvent.Action.PUBLISHED
    ).exists()


@pytest.mark.django_db
def test_first_paid_property_waits_for_one_review(world):
    prop = _property(world, "paid")

    published = submit_property(prop=prop, host=world["host"])

    assert published.moderation_status == Property.ModerationStatus.PENDING
    assert StayModerationEvent.objects.filter(
        property=prop, action=StayModerationEvent.Action.SUBMITTED
    ).exists()
    assert _trusted_at(world) is None


@pytest.mark.django_db
def test_approving_first_paid_property_trusts_host_for_later_paid_properties(world):
    first = _property(world, "paid", title="First hotel")
    submit_property(prop=first, host=world["host"])

    moderate_property(prop=first, actor=world["ops"], action="APPROVE", reason="Verified")

    assert _trusted_at(world) is not None
    second = _property(world, "paid", title="Second hotel")
    world["host"].refresh_from_db()
    published = submit_property(prop=second, host=world["host"])
    assert published.moderation_status == Property.ModerationStatus.APPROVED


@pytest.mark.django_db
def test_trust_is_read_fresh_not_from_a_stale_host_object(world):
    """The partner object a view holds may predate the approval; publish must not miss it."""
    stale_host = world["host"]
    first = _property(world, "paid", title="First hotel")
    submit_property(prop=first, host=stale_host)
    moderate_property(prop=first, actor=world["ops"], action="APPROVE", reason="Verified")

    second = _property(world, "paid", title="Second hotel")
    published = submit_property(prop=second, host=stale_host)

    assert published.moderation_status == Property.ModerationStatus.APPROVED


@pytest.mark.django_db
def test_approving_an_enquiry_property_does_not_trust_host_for_paid(world):
    prop = _property(world, "enquiry")
    submit_property(prop=prop, host=world["host"])

    moderate_property(prop=prop, actor=world["ops"], action="APPROVE", reason="Spot check ok")

    assert _trusted_at(world) is None
    paid = _property(world, "paid")
    assert submit_property(prop=paid, host=world["host"]).moderation_status == "PENDING"


@pytest.mark.django_db
def test_takedown_withdraws_trust_so_next_paid_property_is_reviewed(world):
    first = _property(world, "paid", title="First hotel")
    submit_property(prop=first, host=world["host"])
    moderate_property(prop=first, actor=world["ops"], action="APPROVE", reason="Verified")
    assert _trusted_at(world) is not None

    moderate_property(prop=first, actor=world["ops"], action="REMOVE", reason="Fake photos")

    assert _trusted_at(world) is None
    second = _property(world, "paid", title="Second hotel")
    assert submit_property(prop=second, host=world["host"]).moderation_status == "PENDING"


@pytest.mark.django_db
def test_rejected_property_can_be_fixed_and_published_again(world):
    prop = _property(world, "paid")
    submit_property(prop=prop, host=world["host"])
    moderate_property(prop=prop, actor=world["ops"], action="REJECT", reason="Blurry photos")
    prop.refresh_from_db()
    assert prop.moderation_reason == "Blurry photos"

    republished = submit_property(prop=prop, host=world["host"])

    assert republished.moderation_status == Property.ModerationStatus.PENDING
    assert republished.moderation_reason == ""


@pytest.mark.django_db
def test_live_property_cannot_be_published_again(world):
    prop = _property(world, "enquiry")
    submit_property(prop=prop, host=world["host"])

    with pytest.raises(StayStateError):
        submit_property(prop=prop, host=world["host"])


# --- automatic checks before going live -------------------------------------------------------


@pytest.mark.django_db
def test_publish_requires_a_photo(world):
    prop = create_property(
        host=world["host"],
        variant_id=world["enquiry"].id,
        title="No photos",
        location_text="Madhapur",
        nightly_rate_paise=90000,
    )

    with pytest.raises(StayStateError) as exc:
        submit_property(prop=prop, host=world["host"])

    assert exc.value.code == "photo_required"
    prop.refresh_from_db()
    assert prop.moderation_status == Property.ModerationStatus.DRAFT


@pytest.mark.django_db
def test_publish_requires_an_active_room(world):
    prop = _property(world, "enquiry", with_room=False)

    with pytest.raises(StayStateError) as exc:
        submit_property(prop=prop, host=world["host"])

    assert exc.value.code == "room_required"


# --- a live property keeps what made it publishable -------------------------------------------


@pytest.mark.django_db
def test_switching_off_the_only_room_hides_a_live_property(world):
    """Rooms switch off freely; with nothing available the property simply leaves search.

    (Before numbered rooms this was refused with ``last_active_room``. Owners now switch rooms
    off and mark them booked as they fill up, so a full property must be allowed to disappear.)
    """
    prop = _property(world, "enquiry")
    submit_property(prop=prop, host=world["host"])
    only_room = prop.units.get()

    assert update_unit(unit=only_room, host=world["host"], is_active=False).is_active is False
    assert not public_properties().filter(id=prop.id).exists()

    update_unit(unit=only_room, host=world["host"], is_active=True)
    assert public_properties().filter(id=prop.id).exists()


@pytest.mark.django_db
def test_live_property_keeps_at_least_one_photo(world):
    prop = _property(world, "enquiry")
    submit_property(prop=prop, host=world["host"])
    cover = prop.media.get()

    with pytest.raises(StayStateError) as exc:
        remove_property_media(prop=prop, host=world["host"], media_id=cover.id)
    assert exc.value.code == "last_photo"

    extra = PropertyMedia.objects.create(property=prop, url=COVER, display_order=1)
    remove_property_media(prop=prop, host=world["host"], media_id=cover.id)
    assert list(prop.media.values_list("id", flat=True)) == [extra.id]


@pytest.mark.django_db
def test_draft_property_may_drop_its_last_photo(world):
    prop = _property(world, "enquiry")
    cover = prop.media.get()

    remove_property_media(prop=prop, host=world["host"], media_id=cover.id)

    assert not prop.media.exists()


@pytest.mark.django_db
def test_pasted_photo_link_cannot_be_added_to_a_property(world):
    prop = _property(world, "enquiry")

    with pytest.raises(StayStateError) as exc:
        add_property_media(prop=prop, host=world["host"], url="https://elsewhere.example/x.jpg")

    assert exc.value.code == "photo_not_uploaded"


# --- HTTP -----------------------------------------------------------------------------------


@pytest.mark.django_db
def test_partner_publish_http_and_review_note_is_partner_only(world):
    prop = _property(world, "paid")
    client = _partner_client(world["host_user"])

    published = client.post(f"/api/v1/partner/stays/properties/{prop.id}/submit")
    assert published.status_code == status.HTTP_200_OK
    assert published.data["moderation_status"] == "PENDING"

    moderate_property(prop=prop, actor=world["ops"], action="APPROVE", reason="Checked photos")
    partner_rows = client.get("/api/v1/partner/stays/properties").data
    assert partner_rows[0]["moderation_reason"] == "Checked photos"

    public = APIClient().get(f"/api/v1/stays/{prop.id}")
    assert public.status_code == status.HTTP_200_OK
    assert "moderation_reason" not in public.data
