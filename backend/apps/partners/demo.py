"""Demo employers for the seed commands: a business and an individual, each with complete details.

Local seed data only. A business is given no GSTIN and a Shop & Establishment proof: a made-up GSTIN
could belong to a real business, so the demo never invents one.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from apps.partners.models import EmployerProfile, PartnerBusinessProfile, PartnerProfile


@dataclass(frozen=True)
class DemoBusiness:
    """A business as its employer would have entered it."""

    legal_name: str
    legal_structure: str
    category: str
    size: str
    address: str
    area: str
    city: str
    pin_code: str
    latitude: str
    longitude: str


_BUSINESS = PartnerBusinessProfile

#: The demo employer every seed shares (login +919900000088).
APEX_STAFFING = DemoBusiness(
    legal_name="Apex Staffing Solutions",
    legal_structure=_BUSINESS.LegalStructure.COMPANY,
    category=_BUSINESS.BusinessCategory.OFFICE,
    size=_BUSINESS.CompanySize.SIZE_11_50,
    address="2nd floor, Madhapur Main Road",
    area="Madhapur",
    city="Hyderabad",
    pin_code="500081",
    latitude="17.448600",
    longitude="78.390800",
)
#: The free-plan demo employer (login +919900000099).
SRI_LAKSHMI_JEWELLERS = DemoBusiness(
    legal_name="Sri Lakshmi Jewellers",
    legal_structure=_BUSINESS.LegalStructure.PROPRIETORSHIP,
    category=_BUSINESS.BusinessCategory.SHOP,
    size=_BUSINESS.CompanySize.SIZE_11_50,
    address="Shop 14, Ameerpet Main Road",
    area="Ameerpet",
    city="Hyderabad",
    pin_code="500016",
    latitude="17.437500",
    longitude="78.448300",
)


def seed_business_employer(partner: PartnerProfile, business: DemoBusiness) -> None:
    """Make `partner` an owner hiring for a business, with every required detail filled in."""
    EmployerProfile.objects.update_or_create(
        partner=partner,
        defaults={
            "hiring_as": EmployerProfile.HiringAs.BUSINESS,
            "poster_role": EmployerProfile.PosterRole.OWNER,
            "id_document_type": EmployerProfile.IdDocumentType.PAN,
            "area": "",
            "city": "",
            "pin_code": "",
        },
    )
    PartnerBusinessProfile.objects.update_or_create(
        partner=partner,
        defaults={
            "business_type": PartnerBusinessProfile.BusinessType.EMPLOYER,
            "legal_name": business.legal_name,
            "legal_structure": business.legal_structure,
            "business_category": business.category,
            "company_size": business.size,
            "gst_registered": False,
            "gstin": "",
            "business_proof_type": PartnerBusinessProfile.BusinessProofType.SHOP_ESTABLISHMENT,
            "address": business.address,
            "area": business.area,
            "city": business.city,
            "state": "Telangana",
            "pin_code": business.pin_code,
            "latitude": Decimal(business.latitude),
            "longitude": Decimal(business.longitude),
        },
    )


def seed_individual_employer(
    partner: PartnerProfile, *, area: str, city: str, pin_code: str
) -> None:
    """Make `partner` a person hiring in their own name, with every required detail filled in."""
    EmployerProfile.objects.update_or_create(
        partner=partner,
        defaults={
            "hiring_as": EmployerProfile.HiringAs.INDIVIDUAL,
            "poster_role": "",
            "id_document_type": EmployerProfile.IdDocumentType.AADHAAR_MASKED,
            "area": area,
            "city": city,
            "pin_code": pin_code,
        },
    )
