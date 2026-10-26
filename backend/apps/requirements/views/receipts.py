"""The M2 access-fee receipt, as a PDF.

Sits in `requirements` rather than `commerce` because the *resolution* is a requirements
question: which of `BookingFee`, `QuoteUnlock` or `VisitPlan` paid for this agreement is
`access_receipt_for`'s answer, and it already knows. What `commerce` owns is the rendering, which
is shared with the M1 invoice — one renderer, so the two documents cannot drift into looking like
they came from two different companies.
"""

import uuid
from typing import cast

from django.http import HttpResponse
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.views import APIView

from apps.commerce.documents import DocumentLine, DocumentSpec, access_receipt_spec, render_pdf
from apps.commerce.documents.money import format_money
from apps.commerce.documents.sources import issuer_address, issuer_contact, issuer_name
from apps.commerce.views import _pdf_response
from apps.identity.models import User
from apps.requirements import access
from apps.requirements.exceptions import RequirementDomainError
from apps.requirements.models import Proposal, RateCardBooking
from apps.requirements.selectors import (
    access_receipt_for,
    engagement_for_participant,
    requirement_for_customer,
)
from apps.requirements.views.base import _proposal_for_customer, _raise_api_error
from common.errors.serializers import ApiErrorSerializer

#: What the receipt's one line says the money bought. Mirrors the customer app's own map, and
#: falls back to the wire constant rather than to a blank line — an unlabelled charge on a receipt
#: is worse than an ugly one.
_PURPOSE = {
    "A3_BOOKING_FEE": "Booking your crew",
    "A3_QUOTE_UNLOCK": "Seeing your quotes in full",
    "A5_VISIT_PLAN": "Your site visits",
}


class EngagementReceiptDownloadView(APIView):
    """Download the receipt for the fee Vsolve collected on this agreement.

    Rendered on demand from the numbered record, never stored — the same reasoning the M1 invoice
    download gives. Resolved by **participation**, so either party to the agreement can fetch it
    and anybody else gets a `404`.
    """

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Engagements"],
        operation_id="m2_engagement_receipt_download",
        description=(
            "Download the access-fee receipt as a PDF. `Content-Disposition: attachment`.\n\n"
            "**Not a tax invoice, and the document says so on its face.** An access fee has no "
            "`Order`, `TaxDocument.order` is not nullable, and GST treatment of these fees is an "
            "open owner decision — so this is a receipt for money received and is labelled as "
            "one.\n\n"
            "On an A3 crew booking the sheet also states the money paid **directly to the crew**, "
            "marked as not collected by Vsolve. The booking costs several times this receipt, and "
            "a document mentioning only its own slice leaves the reader wondering where the rest "
            "went."
        ),
        responses={
            (200, "application/pdf"): OpenApiTypes.BINARY,
            404: ApiErrorSerializer,
        },
    )
    def get(self, request: Request, engagement_id: uuid.UUID) -> HttpResponse:
        user = cast(User, request.user)
        try:
            engagement = engagement_for_participant(user=user, engagement_id=engagement_id)
        except RequirementDomainError as exc:
            _raise_api_error(exc)

        receipt = access_receipt_for(engagement)
        if receipt is None:
            # Nothing was charged, the plan was covered by a credit, or the row predates receipt
            # numbering. None of the three is an error, and none of them has a document.
            raise NotFound("There is no receipt on this booking.")

        heading, context = _crew_money(engagement.requirement_id)
        spec = access_receipt_spec(
            number=str(receipt["number"]),
            purpose=_PURPOSE.get(str(receipt["kind"]), str(receipt["kind"])),
            amount_paise=int(receipt["amount_paise"]),
            paid_at=receipt.get("paid_at"),
            buyer_name=_buyer(engagement),
            context_heading=heading,
            context_lines=context,
        )
        return _pdf_response(render_pdf(spec), filename=f"receipt-{receipt['number']}.pdf")


def _crew_money(requirement_id: uuid.UUID) -> tuple[str, tuple[DocumentLine, ...]]:
    """The part of an A3 booking that Vsolve never touches, for the context block.

    Empty for every other path: an A5 visit plan is money Vsolve *did* collect, so there is no
    second party to disclose, and a heading with nothing under it is noise.
    """
    booking = RateCardBooking.objects.filter(requirement_id=requirement_id).first()
    if booking is None:
        return "", ()
    return (
        "The rest of this booking, for context — not collected by V Solve Hub:",
        (
            DocumentLine(
                label=(
                    f"The work: {booking.headcount} "
                    f"{'person' if booking.headcount == 1 else 'people'} x {booking.days} "
                    f"{'day' if booking.days == 1 else 'days'}"
                ),
                amount=format_money(booking.total_customer_paise),
            ),
            DocumentLine(
                label="Paid directly to the crew",
                amount=format_money(booking.lead_receipt_paise),
                note="Cash, at the end of each day. Settled between you and them.",
            ),
        ),
    )


def _buyer(engagement: object) -> str:
    customer = getattr(engagement, "customer", None)
    full_name = str(getattr(customer, "full_name", "") or "").strip()
    profile = getattr(customer, "customer_profile", None)
    display_name = str(getattr(profile, "display_name", "") or "").strip()
    return full_name or display_name or str(getattr(customer, "phone_number", "") or "Customer")


#: The brand tier the Partner named on the estimate, in the words the list is shopped with.
_BRAND_TIER: dict[str, str] = {
    str(Proposal.MaterialBrandTier.STANDARD): "Standard tier (Finolex / Anchor class)",
    str(Proposal.MaterialBrandTier.PREMIUM): "Premium tier (Polycab / Legrand class)",
}


class RequirementQuoteShoppingListPdfView(APIView):
    """The estimate's shopping list as a branded PDF the Customer can hand to a shop.

    Quantities and specs only — materials are the Customer's to buy on every project and no
    price is part of the estimate, so the document carries none. Rendered on demand from the
    stored `material_list`, on the same renderer and masthead as every other V Solve Hub
    document, and gated exactly like the estimate itself: an unpaid visit plan gets the same
    refusal the quote list gives.
    """

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Quotes"],
        operation_id="m2_quote_shopping_list_pdf",
        description=(
            "Download one estimate's shopping list — what the Customer should buy before work "
            "starts — as a PDF branded V Solve Hub and naming the professional who wrote it. "
            "Quantities and specs only; never a price. `Content-Disposition: attachment`. "
            "Same entitlement as `m2_quote_list`: an A5 request needs a charged visit plan."
        ),
        responses={
            (200, "application/pdf"): OpenApiTypes.BINARY,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def get(
        self, request: Request, requirement_id: uuid.UUID, proposal_id: uuid.UUID
    ) -> HttpResponse:
        user = cast(User, request.user)
        try:
            requirement = requirement_for_customer(customer=user, requirement_id=requirement_id)
            access.assert_customer_may_read_full_quotes(requirement)
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        proposal = _proposal_for_customer(requirement=requirement, proposal_id=proposal_id)
        rows = [row for row in (proposal.material_list or []) if isinstance(row, dict)]
        if not rows:
            raise NotFound("This estimate has no shopping list.")

        business = getattr(proposal.partner, "business_profile", None)
        partner_name = (
            business.legal_name if business is not None else proposal.partner.display_name
        ) or "Your professional"
        service_name = requirement.variant.service.name
        buyer = str(getattr(user, "display_name", "") or "").strip() or str(user.phone_number)
        tier = _BRAND_TIER.get(str(proposal.material_brand_tier), "")

        lines = tuple(
            DocumentLine(
                label=str(row.get("title") or ""),
                amount=f"{_quantity(row.get('quantity'))} {row.get('unit') or ''}".strip(),
                note=" · ".join(
                    part
                    for part in (str(row.get("spec") or ""), str(row.get("note") or ""))
                    if part
                ),
            )
            for row in rows
            if str(row.get("title") or "").strip()
        )
        spec = DocumentSpec(
            title="What to buy",
            number=f"EST-{str(proposal.id)[:8].upper()}-R{proposal.revision}",
            issued_on=proposal.submitted_at,
            issuer_name=issuer_name(),
            buyer_name=buyer,
            lines=lines,
            total_label="Items to buy",
            total_amount=str(len(lines)),
            issuer_address=issuer_address(),
            issuer_contact=issuer_contact(),
            meta=(
                ("Prepared by", partner_name),
                ("Service", service_name),
                *((("Brand tier", tier),) if tier else ()),
            ),
            footnote=(
                "Materials are yours to buy from any shop; this list carries quantities and "
                "specifications only and no price is part of the estimate. Ask the professional "
                "on Vsolve before substituting a rating or gauge."
            ),
        )
        filename = f"what-to-buy-{str(proposal.id)[:8]}-r{proposal.revision}.pdf"
        return _pdf_response(render_pdf(spec), filename=filename)


def _quantity(value: object) -> str:
    """A stored decimal string as a shop reads it: `3`, not `3.000`."""
    text = str(value or "1")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text or "1"
