"""Photos (10 MB each, real images only), review photos, and what guests see on a stay page."""

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework import status

from apps.catalog.models import (
    A9VariantConfiguration,
    Category,
    Service,
    ServiceVariant,
    Subcategory,
)
from apps.identity.models import Role, UserRole
from apps.partners.models import PartnerApplication, PartnerCapability, PartnerProfile
from apps.stay.models import StayEnquiry
from apps.stay.services import (
    MAX_REVIEW_PHOTOS,
    STAY_PHOTO_MAX_BYTES,
    StayStateError,
    _check_stay_image,
    amenity_options,
    create_enquiry,
    create_property,
    create_stay_review,
    create_unit,
    customer_can_review,
    property_amenities,
    split_stay_schema,
    store_stay_review_photo,
    submit_property,
    update_property_ad,
)
from tests.helpers import force_role_client

User = get_user_model()

RATE = 900000
JPEG_HEAD = b"\xff\xd8\xff\xe0"
PNG_HEAD = b"\x89PNG\r\n\x1a\n"
WEBP_HEAD = b"RIFF\x00\x00\x00\x00WEBPVP8 "

#: A PG-like category: it asks gender and food itself, so those are not amenity checkboxes.
PG_SCHEMA = {
    "type": "object",
    "properties": {
        "gender": {"type": "string", "enum": ["Gents", "Ladies", "Unisex"]},
        "food": {"type": "string", "enum": ["Food included", "Without food"]},
        "furnishing": {"type": "string", "enum": ["Furnished", "Semi furnished"]},
        "ac": {"type": "string", "enum": ["AC", "Non AC"]},
    },
}


def _photo(size: int, head: bytes = JPEG_HEAD, content_type: str = "image/jpeg"):
    body = head + b"\x00" * max(size - len(head), 0)
    return SimpleUploadedFile("photo.jpg", body, content_type=content_type)


@pytest.fixture
def world(db):  # noqa: ARG001
    category = Category.objects.create(slug="photos-amenities", name="Photos and amenities")
    sub = Subcategory.objects.create(category=category, slug="pa-pg", name="PG")
    service = Service.objects.create(
        subcategory=sub, slug="pa-pg-svc", name="PG", status=Service.Status.ACTIVE
    )
    variant = ServiceVariant.objects.create(
        service=service,
        code="pa-pg-stay",
        name="PG stay",
        pricing_strategy=ServiceVariant.PricingStrategy.FIXED,
        booking_archetype=ServiceVariant.BookingArchetype.A9_STAY,
        required_skill_code="stay",
        tax_category_code="stay",
    )
    A9VariantConfiguration.objects.create(
        variant=variant,
        version=1,
        status=A9VariantConfiguration.Status.ACTIVE,
        property_schema=PG_SCHEMA,
    )
    host_user = User.objects.create(phone_number="+919955550001", full_name="Photo Host")
    host = PartnerProfile.objects.create(user=host_user, display_name="Photo Host")
    PartnerApplication.objects.create(partner=host, status=PartnerApplication.Status.APPROVED)
    PartnerCapability.objects.create(
        partner=host,
        variant=variant,
        archetype=ServiceVariant.BookingArchetype.A9_STAY,
        status=PartnerCapability.Status.APPROVED,
    )
    guest = User.objects.create(phone_number="+919955550002", full_name="Photo Guest")
    other = User.objects.create(phone_number="+919955550003", full_name="Other Guest")
    return {"variant": variant, "host": host, "guest": guest, "other": other}


def _property(world, **fields):
    prop = create_property(
        host=world["host"],
        variant_id=world["variant"].id,
        title="Sunrise PG",
        location_text="Madhapur",
        structured_fields=fields,
        image_urls=["https://cdn.example.com/cover.jpg"],
    )
    create_unit(
        prop=prop,
        host=world["host"],
        name="Double sharing",
        nightly_rate_paise=RATE,
        attributes={"ac": "Non AC"},
    )
    submit_property(prop=prop, host=world["host"])
    prop.refresh_from_db()
    return prop


def _customer_client(user):
    role, _ = Role.objects.get_or_create(code="customer", defaults={"name": "Customer"})
    UserRole.objects.get_or_create(user=user, role=role, revoked_at=None)
    return force_role_client(user=user, role_code="customer")


def _confirmed_stay(world, prop):
    enquiry = create_enquiry(
        customer=world["guest"],
        property_id=prop.id,
        check_in=timezone.localdate() + timedelta(days=10),
        length=1,
    )
    enquiry.status = StayEnquiry.Status.CONFIRMED
    enquiry.save(update_fields=("status",))
    return enquiry


# --- 10 MB, real images only --------------------------------------------------------------------


def test_photo_limit_is_ten_megabytes():
    assert _check_stay_image(_photo(STAY_PHOTO_MAX_BYTES))[1] == STAY_PHOTO_MAX_BYTES
    with pytest.raises(StayStateError) as exc:
        _check_stay_image(_photo(STAY_PHOTO_MAX_BYTES + 1))
    assert exc.value.code == "photo_too_large"
    assert "10 MB" in str(exc.value)


@pytest.mark.parametrize(
    ("head", "content_type"),
    [(JPEG_HEAD, "image/jpeg"), (PNG_HEAD, "image/png"), (WEBP_HEAD, "image/webp")],
)
def test_real_images_pass(head, content_type):
    assert _check_stay_image(_photo(1024, head, content_type))[0] == content_type


def test_a_renamed_file_is_not_a_photo():
    fake = SimpleUploadedFile("room.jpg", b"%PDF-1.7 not a photo", content_type="image/jpeg")
    with pytest.raises(StayStateError) as exc:
        _check_stay_image(fake)
    assert exc.value.code == "photo_type"


# --- review photos --------------------------------------------------------------------------------


@pytest.mark.django_db
def test_review_photo_upload_enforces_ten_megabytes(world):
    client = _customer_client(world["guest"])
    too_big = client.post(
        "/api/v1/stays/reviews/photos",
        {"file": _photo(STAY_PHOTO_MAX_BYTES + 1)},
        format="multipart",
    )
    assert too_big.status_code == status.HTTP_400_BAD_REQUEST

    ok = client.post("/api/v1/stays/reviews/photos", {"file": _photo(2048)}, format="multipart")
    assert ok.status_code == status.HTTP_201_CREATED
    assert "/stay-reviews/" in ok.data["url"]


@pytest.mark.django_db
def test_review_attaches_only_the_guests_own_uploads(world):
    prop = _property(world)
    _confirmed_stay(world, prop)
    mine = store_stay_review_photo(customer=world["guest"], upload=_photo(2048))
    theirs = store_stay_review_photo(customer=world["other"], upload=_photo(2048))
    base = "http://testserver"

    for urls in (["https://evil.example.com/pic.jpg"], [base + theirs.stored_file.url]):
        with pytest.raises(StayStateError) as exc:
            create_stay_review(
                customer=world["guest"], property_id=prop.id, rating=5, image_urls=urls
            )
        assert exc.value.code == "review_photo_not_uploaded"

    with pytest.raises(StayStateError) as exc:
        create_stay_review(
            customer=world["guest"],
            property_id=prop.id,
            rating=5,
            image_urls=[base + mine.stored_file.url] * (MAX_REVIEW_PHOTOS + 1),
        )
    assert exc.value.code == "too_many_review_photos"

    review = create_stay_review(
        customer=world["guest"],
        property_id=prop.id,
        rating=5,
        image_urls=[base + mine.stored_file.url],
    )
    assert review.image_urls == [base + mine.stored_file.url]


# --- amenities, highlights, can_review ----------------------------------------------------------


@pytest.mark.django_db
def test_negative_answers_are_not_shown_as_amenities(world):
    # "Non AC" and "Without food" used to be read as yes because they are non-empty text.
    prop = _property(world, gender="Ladies", food="Without food", ac="Non AC")
    keys = [row["key"] for row in property_amenities(prop)]
    assert "ac" not in keys
    assert "food" not in keys


@pytest.mark.django_db
def test_ticked_amenities_and_ac_rooms_are_shown(world):
    prop = _property(world, gender="Ladies", food="Food included", wifi=True, lift=False)
    create_unit(
        prop=prop,
        host=world["host"],
        name="Single AC",
        nightly_rate_paise=RATE,
        attributes={"ac": "AC"},
    )
    shown = {row["key"]: row["label"] for row in property_amenities(prop)}
    assert shown == {"ac": "AC rooms", "wifi": "WiFi", "food": "Meals included"}


@pytest.mark.django_db
def test_amenity_checkboxes_skip_what_the_category_asks(world):
    property_schema, _room, _names = split_stay_schema(PG_SCHEMA)
    keys = [row["key"] for row in amenity_options(property_schema)]
    assert "food" not in keys  # the PG asks "Food" itself
    assert "wifi" in keys

    prop = _property(world, gender="Ladies")
    with pytest.raises(StayStateError) as exc:
        update_property_ad(
            prop=prop, host=world["host"], structured_fields={"gender": "Ladies", "wifi": "yes"}
        )
    assert exc.value.code == "amenity_invalid"


@pytest.mark.django_db
def test_detail_shows_highlights_amenities_and_who_can_review(world):
    prop = _property(world, gender="Ladies", furnishing="Semi furnished", wifi=True)
    guest = _customer_client(world["guest"])
    before = guest.get(f"/api/v1/stays/{prop.id}")
    assert before.status_code == status.HTTP_200_OK
    assert {"label": "For", "value": "Ladies"} in before.data["highlights"]
    assert {"label": "Furnishing", "value": "Semi furnished"} in before.data["highlights"]
    assert {"key": "wifi", "label": "WiFi"} in before.data["amenities"]
    assert before.data["can_review"] is False  # no confirmed stay yet

    _confirmed_stay(world, prop)
    assert customer_can_review(customer=world["guest"], prop=prop) is True
    assert guest.get(f"/api/v1/stays/{prop.id}").data["can_review"] is True

    create_stay_review(customer=world["guest"], property_id=prop.id, rating=4)
    assert customer_can_review(customer=world["guest"], prop=prop) is False
    assert customer_can_review(customer=world["other"], prop=prop) is False
