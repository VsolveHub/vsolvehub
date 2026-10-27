"""What a booking document calls itself, the published cancellation ladder, and the sample receipt.

Before GST registration a booking document is a **payment receipt**: it may not call itself a tax
invoice, itemise tax, or carry a GSTIN. Setting `DOCUMENT_ISSUER_GSTIN` is the one switch that turns
it into a tax invoice, and the published sample must follow the same switch.
"""

from datetime import timedelta
from http import HTTPStatus

import pytest
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.commerce.documents import DocumentLine, DocumentSpec, render_pdf
from apps.commerce.documents.sources import (
    booking_document_title,
    sample_booking_receipt_spec,
)
from apps.commerce.models import TaxDocument
from apps.pricing.models import CancellationPolicy, CancellationPolicyBand

GSTIN = "36ABCDE1234F1Z5"


class TestBookingDocumentTitle:
    def test_without_a_gstin_a_booking_document_is_a_payment_receipt(self) -> None:
        with override_settings(DOCUMENT_ISSUER_GSTIN=""):
            assert booking_document_title(TaxDocument.Kind.INVOICE) == "Payment receipt"

    def test_a_gstin_turns_it_into_a_tax_invoice(self) -> None:
        with override_settings(DOCUMENT_ISSUER_GSTIN=GSTIN):
            assert booking_document_title(TaxDocument.Kind.INVOICE) == "Tax invoice"

    def test_a_credit_note_is_always_a_credit_note(self) -> None:
        for gstin in ("", GSTIN):
            with override_settings(DOCUMENT_ISSUER_GSTIN=gstin):
                assert booking_document_title(TaxDocument.Kind.CREDIT_NOTE) == "Credit note"


class TestSampleReceipt:
    def test_unregistered_sample_claims_no_tax(self) -> None:
        with override_settings(DOCUMENT_ISSUER_GSTIN="", DOCUMENT_ISSUER_ADDRESS=""):
            spec = sample_booking_receipt_spec()

        assert spec.title == "Payment receipt"
        assert spec.watermark == "SAMPLE"
        assert all(line.note == "" for line in spec.lines)
        assert "GSTIN" not in dict(spec.meta)
        assert "not a tax invoice" in spec.footnote
        # No placeholder address: an unset address is left off the page.
        assert spec.issuer_address == ""

    def test_registered_sample_carries_the_gstin_and_itemised_tax(self) -> None:
        with override_settings(DOCUMENT_ISSUER_GSTIN=GSTIN.lower()):
            spec = sample_booking_receipt_spec()

        assert spec.title == "Tax invoice"
        assert dict(spec.meta)["GSTIN"] == GSTIN
        assert any("tax" in line.note for line in spec.lines)

    def test_the_watermark_reaches_the_page(self) -> None:
        def spec(watermark: str) -> DocumentSpec:
            return DocumentSpec(
                title="Payment receipt",
                number="SAMPLE-0001",
                issued_on=timezone.now(),
                issuer_name="V Solve Hub",
                buyer_name="Sample Customer",
                lines=(DocumentLine(label="Visit", amount="₹100.00"),),
                total_label="Total paid",
                total_amount="₹100.00",
                watermark=watermark,
            )

        assert len(render_pdf(spec("SAMPLE"))) > len(render_pdf(spec("")))

    def test_the_sample_is_public_and_opens_in_the_browser(self) -> None:
        response = APIClient().get("/api/v1/legal/sample-receipt/")

        assert response.status_code == HTTPStatus.OK
        assert response["Content-Type"] == "application/pdf"
        assert response["Content-Disposition"].startswith("inline;")
        assert response.content.startswith(b"%PDF-")


@pytest.mark.django_db
class TestPublishedCancellationPolicy:
    def _policy(self) -> CancellationPolicy:
        policy = CancellationPolicy.objects.create(
            code="m1-scheduled-today",
            version=1,
            effective_from=timezone.now() - timedelta(days=1),
        )
        for order, (code, fee) in enumerate(
            (
                ("more-than-24-hours", 0),
                ("24-to-2-hours", 4_900),
                ("less-than-2-hours", 9_900),
                ("verified-arrival", 14_900),
            ),
            start=1,
        ):
            CancellationPolicyBand.objects.create(
                policy=policy,
                code=code,
                condition_text=f"Condition {order}",
                fee_paise=fee,
                display_order=order,
            )
        return policy

    def test_it_publishes_the_ladder_new_bookings_get(self) -> None:
        self._policy()

        response = APIClient().get("/api/v1/legal/cancellation-policy/")

        assert response.status_code == HTTPStatus.OK
        body = response.json()
        assert body["code"] == "m1-scheduled-today"
        assert [band["code"] for band in body["bands"]] == [
            "more-than-24-hours",
            "24-to-2-hours",
            "less-than-2-hours",
            "verified-arrival",
        ]
        assert body["bands"][1]["fee"] == {"amount_paise": 4_900, "currency": "INR"}
        assert body["reschedule_free_notice_hours"] == 4
        assert body["quality_dispute_window_hours"] == 72

    def test_an_unpublished_policy_is_a_404_not_an_empty_ladder(self) -> None:
        response = APIClient().get("/api/v1/legal/cancellation-policy/")

        assert response.status_code == HTTPStatus.NOT_FOUND
