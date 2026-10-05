"""Tests for apps.foundation.storage_paths: taxonomy, sanitation, and upload_to callables."""

import uuid

from apps.foundation.storage_paths import (
    catalog_image_path,
    crew_document_path,
    fulfilment_evidence_path,
    job_seeker_resume_path,
    job_seeker_resume_upload_to,
    listing_resume_path,
    listing_resume_upload_to,
    partner_avatar_path,
    partner_kyc_document_path,
    rental_ad_upload_to,
    rental_asset_image_path,
    rental_dispute_image_path,
    rental_dispute_upload_to,
    requirement_attachment_path,
    stay_ad_upload_to,
    stay_property_image_path,
    stay_review_image_path,
    stay_review_upload_to,
)


class _DummyInstance:
    def __init__(self, **kwargs: object) -> None:
        for k, v in kwargs.items():
            setattr(self, k, v)


def test_public_images_taxonomy() -> None:
    cat_path = catalog_image_path("electronics", "laptop-repair", "banner.PNG")
    assert cat_path.startswith("images/catalog/electronics/laptop-repair/")
    assert cat_path.endswith(".png")

    partner_id = uuid.uuid4()
    avatar_path = partner_avatar_path(partner_id, "avatar.jpg")
    assert avatar_path.startswith(f"images/partners/avatars/{partner_id}/")
    assert avatar_path.endswith(".jpg")

    prop_id = uuid.uuid4()
    stay_path = stay_property_image_path(prop_id, "gallery", "room.webp")
    assert stay_path.startswith(f"images/stays/properties/{prop_id}/gallery/")
    assert stay_path.endswith(".webp")

    asset_id = uuid.uuid4()
    rental_path = rental_asset_image_path(asset_id, "primary", "drill.jpeg")
    assert rental_path.startswith(f"images/rentals/assets/{asset_id}/primary/")
    assert rental_path.endswith(".jpeg")

    cust_id = uuid.uuid4()
    review_path = stay_review_image_path(prop_id, cust_id, "photo.jpg")
    assert review_path.startswith(f"images/reviews/stays/{prop_id}/{cust_id}/")
    assert review_path.endswith(".jpg")


def test_private_documents_taxonomy() -> None:
    partner_id = uuid.uuid4()
    kyc_path = partner_kyc_document_path(partner_id, "GOVERNMENT_ID", ".pdf")
    assert kyc_path.startswith(f"documents/partner-kyc/{partner_id}/government_id/")
    assert kyc_path.endswith(".pdf")

    crew_id = uuid.uuid4()
    crew_path = crew_document_path(partner_id, crew_id, "POLICE_VERIFICATION", "pdf")
    prefix = f"documents/crew-identity/{partner_id}/{crew_id}/police_verification/"
    assert crew_path.startswith(prefix)
    assert crew_path.endswith(".pdf")

    listing_id = uuid.uuid4()
    app_id = uuid.uuid4()
    res_path = listing_resume_path(listing_id, app_id, "my-resume.pdf")
    assert res_path.startswith(f"documents/resumes/applications/{listing_id}/{app_id}/")
    assert res_path.endswith(".pdf")

    user_id = uuid.uuid4()
    profile_res_path = job_seeker_resume_path(user_id, "cv.docx")
    assert profile_res_path.startswith(f"documents/resumes/job-seeker-profiles/{user_id}/")
    assert profile_res_path.endswith(".docx")


def test_private_images_taxonomy() -> None:
    booking_id = uuid.uuid4()
    evidence_path = fulfilment_evidence_path(booking_id, "completion", "done.jpg")
    assert evidence_path.startswith(f"images/fulfilment-evidence/{booking_id}/completion/")
    assert evidence_path.endswith(".jpg")

    partner_id = uuid.uuid4()
    dispute_path = rental_dispute_image_path(booking_id, partner_id, "damage.png")
    assert dispute_path.startswith(f"images/rental-disputes/{booking_id}/{partner_id}/")
    assert dispute_path.endswith(".png")

    req_id = uuid.uuid4()
    req_path = requirement_attachment_path(req_id, "spec.jpg")
    assert req_path.startswith(f"images/requirement-attachments/{req_id}/")
    assert req_path.endswith(".jpg")


def test_model_upload_to_callables() -> None:
    pid = uuid.uuid4()
    cid = uuid.uuid4()
    bid = uuid.uuid4()

    stay_ad = _DummyInstance(partner_id=pid)
    expected_stay = f"images/stays/properties/unassigned/partner-{pid}/"
    assert stay_ad_upload_to(stay_ad, "room.jpg").startswith(expected_stay)

    stay_rev = _DummyInstance(customer_id=cid, property_id=pid)
    expected_rev = f"images/reviews/stays/{pid}/{cid}/"
    assert stay_review_upload_to(stay_rev, "view.jpg").startswith(expected_rev)

    rental_ad = _DummyInstance(partner_id=pid)
    expected_rental = f"images/rentals/assets/unassigned/partner-{pid}/"
    assert rental_ad_upload_to(rental_ad, "tool.jpg").startswith(expected_rental)

    rental_disp = _DummyInstance(partner_id=pid, booking_id=bid)
    expected_disp = f"images/rental-disputes/{bid}/{pid}/"
    assert rental_dispute_upload_to(rental_disp, "crack.jpg").startswith(expected_disp)

    listing_res = _DummyInstance(listing_id=pid, application_id=cid)
    expected_listing = f"documents/resumes/applications/{pid}/{cid}/"
    assert listing_resume_upload_to(listing_res, "cv.pdf").startswith(expected_listing)

    user_res = _DummyInstance(user_id=cid)
    expected_profile = f"documents/resumes/job-seeker-profiles/{cid}/"
    assert job_seeker_resume_upload_to(user_res, "cv.pdf").startswith(expected_profile)
