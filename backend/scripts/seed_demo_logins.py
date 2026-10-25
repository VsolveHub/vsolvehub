"""Seed and configure demo credentials for instant, zero-restriction login.

This script ensures that all demo partners (Rentals, Stays, Careers, M2 Workforce/Projects, Technicians)
are in APPROVED status with complete verified documents, consents, active skills/variants,
and appropriate tracks (RENTAL_OWNER, STAY_HOST, EMPLOYER, SERVICES).
It also seeds funded wallets, V Coins, and referral codes for customer demo accounts.
"""

import os
import sys
from datetime import time
from decimal import Decimal

import django

# Setup Django environment
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")
django.setup()

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.catalog.models import ServiceVariant
from apps.identity.models import CustomerProfile, Role, User, UserRole
from apps.locations.models import ServiceArea
from apps.loyalty.models import CoinGrant, LoyaltySettings, ReferralCode
from apps.partners.models import (
    PartnerApplication,
    PartnerAvailabilityRule,
    PartnerCapability,
    PartnerConsent,
    PartnerConsentDocument,
    PartnerDocument,
    PartnerProfile,
    PartnerService,
    PartnerServiceArea,
    PartnerSkill,
    Skill,
)
from apps.wallet.models import WalletAccount, WalletTransaction

DAY_STARTS_AT = time(0, 0)
DAY_ENDS_AT = time(23, 59)


def ensure_partner_prerequisites():
    """Ensure skills, areas, roles, and consent documents exist."""
    role, _ = Role.objects.get_or_create(
        code="partner",
        defaults={"name": "Partner", "is_system": True},
    )
    areas = list(ServiceArea.objects.filter(is_active=True))
    skills = list(Skill.objects.filter(is_active=True))
    consents = list(
        PartnerConsentDocument.objects.filter(
            is_current=True,
            is_required_for_submission=True,
            retired_at__isnull=True,
        )
    )
    return role, areas, skills, consents


def setup_partner(
    phone: str,
    display_name: str,
    track: str,
    role: Role,
    areas: list,
    skills: list,
    consents: list,
    capabilities: list = None,
):
    """Ensure a partner is 100% approved, unblocked, and has complete documentation."""
    now = timezone.now()

    # User & UserRole
    user, _ = User.objects.get_or_create(
        phone_number=phone,
        defaults={"full_name": display_name},
    )
    user.full_name = display_name
    user.save(update_fields=["full_name"])
    UserRole.objects.update_or_create(user=user, role=role, defaults={"revoked_at": None})

    # PartnerProfile
    partner, _ = PartnerProfile.objects.get_or_create(
        user=user,
        defaults={"display_name": display_name, "experience_years": 5},
    )
    partner.display_name = display_name
    partner.save(update_fields=["display_name"])

    # PartnerApplication: APPROVED with correct track
    application, _ = PartnerApplication.objects.update_or_create(
        partner=partner,
        defaults={
            "status": PartnerApplication.Status.APPROVED,
            "track": track,
            "display_name": display_name,
            "experience_years": 5,
            "reviewed_at": now,
            "submitted_at": now,
        },
    )

    # Approve required documents (Government ID & Address Proof)
    for kind in ["GOVERNMENT_ID", "ADDRESS_PROOF"]:
        PartnerDocument.objects.update_or_create(
            application=application,
            kind=kind,
            version=1,
            defaults={
                "object_key": f"seed/verified/{kind.lower()}.txt",
                "content_type": "text/plain",
                "size_bytes": 1,
                "sha256": "0" * 64,
                "scan_status": PartnerDocument.ScanStatus.CLEAN,
                "scanned_at": now,
                "status": PartnerDocument.Status.APPROVED,
                "reviewed_at": now,
                "review_reason": "Seeded verified demo document",
            },
        )

    # Accept all required consents
    for doc in consents:
        PartnerConsent.objects.update_or_create(
            partner=partner,
            purpose=doc.purpose,
            document_version=doc.document_version,
            defaults={"document": doc, "withdrawn_at": None},
        )

    # Active skills
    for skill in skills:
        PartnerSkill.objects.update_or_create(
            partner=partner,
            skill=skill,
            defaults={"is_active": True},
        )

    # Active service areas and round-the-clock availability
    for area in areas:
        PartnerServiceArea.objects.update_or_create(
            partner=partner,
            service_area=area,
            defaults={"is_active": True},
        )
        for weekday in range(7):
            PartnerAvailabilityRule.objects.update_or_create(
                partner=partner,
                service_area=area,
                weekday=weekday,
                starts_at=DAY_STARTS_AT,
                defaults={
                    "ends_at": DAY_ENDS_AT,
                    "ends_next_day": False,
                    "is_active": True,
                },
            )

    # Capabilities (A3, A5, etc. if specified)
    if capabilities:
        for cap_key in capabilities:
            updated = PartnerCapability.objects.filter(
                partner=partner,
                archetype=cap_key,
            ).update(status=PartnerCapability.Status.APPROVED)
            if not updated:
                PartnerCapability.objects.create(
                    partner=partner,
                    archetype=cap_key,
                    status=PartnerCapability.Status.APPROVED,
                )

    # Also offer all active service variants if track is SERVICES
    if track == PartnerApplication.Track.SERVICES:
        variants = list(ServiceVariant.objects.filter(is_active=True, service__status="ACTIVE"))
        for v in variants[:25]:
            PartnerService.objects.update_or_create(
                partner=partner,
                variant=v,
                defaults={"is_active": True},
            )


def setup_customer(phone: str, full_name: str, wallet_balance_inr: int = 5000, coins: int = 500):
    """Ensure customer account has verified profile, funded wallet, and active V Coins."""
    now = timezone.now()
    user, _ = User.objects.get_or_create(
        phone_number=phone,
        defaults={"full_name": full_name},
    )
    user.full_name = full_name
    user.save(update_fields=["full_name"])

    cust_role, _ = Role.objects.get_or_create(
        code="customer",
        defaults={"name": "Customer", "is_system": True},
    )
    UserRole.objects.update_or_create(user=user, role=cust_role, defaults={"revoked_at": None})

    customer, _ = CustomerProfile.objects.get_or_create(user=user)

    # Wallet & Funds
    wallet, _ = WalletAccount.objects.get_or_create(customer=user)
    target_paise = wallet_balance_inr * 100
    current_paise = wallet.balance_paise
    if current_paise < target_paise:
        diff_paise = target_paise - current_paise
        WalletTransaction.objects.create(
            wallet=wallet,
            amount_paise=diff_paise,
            kind=WalletTransaction.Kind.TOP_UP,
            status=WalletTransaction.Status.CAPTURED,
            idempotency_key=f"seed_topup_{user.phone_number}_{timezone.now().timestamp()}",
            notes="Demo testing funds",
        )

    # Referral Code
    code_str = f"REF{phone[-4:]}"
    ReferralCode.objects.update_or_create(
        user=user,
        defaults={"code": code_str, "share_url": f"http://localhost:3000?ref={code_str}"},
    )

    # V Coins
    if not CoinGrant.objects.filter(customer=user, status=CoinGrant.Status.UNLOCKED).exists():
        CoinGrant.objects.create(
            customer=user,
            coins_amount=coins,
            locked_coins=0,
            spendable_coins=coins,
            burned_coins=0,
            expired_coins=0,
            status=CoinGrant.Status.UNLOCKED,
            expires_at=now + timezone.timedelta(days=90),
            available_at=now,
        )


@transaction.atomic
def main():
    print("Preparing all demo credentials for instant, zero-restriction access...")
    role, areas, skills, consents = ensure_partner_prerequisites()

    # 1. Partner: Rentals (Hyderabad Tool Rentals)
    setup_partner(
        phone="+919900000066",
        display_name="Hyderabad Tool Rentals",
        track=PartnerApplication.Track.RENTAL_OWNER,
        role=role,
        areas=areas,
        skills=skills,
        consents=consents,
    )
    print("✓ Partner +919900000066: RENTAL_OWNER -> APPROVED")

    # 2. Partner: Stays (Lakeview PG Host)
    setup_partner(
        phone="+919900000044",
        display_name="Lakeview PG",
        track=PartnerApplication.Track.STAY_HOST,
        role=role,
        areas=areas,
        skills=skills,
        consents=consents,
    )
    print("✓ Partner +919900000044: STAY_HOST -> APPROVED")

    # 3. Partner: Careers / Employer (Apex Staffing Solutions)
    setup_partner(
        phone="+919900000088",
        display_name="Apex Staffing Solutions",
        track=PartnerApplication.Track.EMPLOYER,
        role=role,
        areas=areas,
        skills=skills,
        consents=consents,
    )
    print("✓ Partner +919900000088: EMPLOYER -> APPROVED")

    # 4. Partner: All Trades / Multi-trade (Test Partner)
    setup_partner(
        phone="+919900000099",
        display_name="Test Partner (all trades)",
        track=PartnerApplication.Track.SERVICES,
        role=role,
        areas=areas,
        skills=skills,
        consents=consents,
    )
    print("✓ Partner +919900000099: SERVICES -> APPROVED")

    # 5. M2 Project & Workforce Vendors
    m2_vendors = [
        ("+917030000001", "M2 Demo Vendor 1"),
        ("+917030000002", "M2 Demo Vendor 2"),
        ("+917030000003", "M2 Demo Vendor 3"),
    ]
    for m2_phone, m2_name in m2_vendors:
        setup_partner(
            phone=m2_phone,
            display_name=m2_name,
            track=PartnerApplication.Track.SERVICES,
            role=role,
            areas=areas,
            skills=skills,
            consents=consents,
            capabilities=["A3_TIME_BLOCK", "A5_CUSTOM_PROJECT"],
        )
        print(f"✓ M2 Partner {m2_phone}: SERVICES (A3/A5) -> APPROVED")

    # 6. Lift suspension and approve all Trade / Technician partners
    trade_partners = PartnerProfile.objects.filter(user__phone_number__startswith="+91701000")
    for tp in trade_partners:
        setup_partner(
            phone=tp.user.phone_number,
            display_name=tp.display_name or "Technician Pro",
            track=PartnerApplication.Track.SERVICES,
            role=role,
            areas=areas,
            skills=skills,
            consents=consents,
        )
    print(f"✓ Approved and unblocked {trade_partners.count()} Technician partners (+91701000xxxx)")

    # 7. Customers with funded wallets & V Coins
    customers = [
        ("+919900000055", "Demo Rental Customer"),
        ("+919900000033", "Demo Stay Customer"),
        ("+919900000077", "Demo Career Seeker"),
        ("+919800200008", "Kiran Kumar"),
        ("+919800200001", "Lavanya Goud"),
    ]
    for c_phone, c_name in customers:
        setup_customer(c_phone, c_name, wallet_balance_inr=5000, coins=500)
        print(f"✓ Customer {c_phone}: Profile active, ₹5,000 Wallet balance, 500 V Coins, Referral ready")

    # 8. Operations Admin
    admin_user, _ = User.objects.get_or_create(
        phone_number="+918019013032",
        defaults={"full_name": "Operations (dev)"},
    )
    admin_user.is_staff = True
    admin_user.is_superuser = True
    admin_user.save()
    ops_role, _ = Role.objects.get_or_create(code="operations", defaults={"name": "Operations", "is_system": True})
    UserRole.objects.update_or_create(user=admin_user, role=ops_role, defaults={"revoked_at": None})
    print("✓ Operations Admin +918019013032: Staff, Superuser, Operations Role active")

    print("\nALL CREDENTIALS ARE 100% UNRESTRICTED AND READY FOR DIRECT TESTING.")


if __name__ == "__main__":
    main()
