"""Seed script for Phase 1: Geographic Hierarchy, Customer 360, and 14 Partner Personas."""

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.identity.models import CustomerProfile, Role, User, UserRole
from apps.locations.models import CityZone, PostalCode, ServiceArea
from apps.partners.models import PartnerProfile, Skill


ZONES = [
    ("Hyderabad", "HiTech City / Cyberabad", "HiTech City", "500081", 1.1),
    ("Hyderabad", "Gachibowli Financial District", "Gachibowli", "500032", 1.0),
    ("Hyderabad", "Madhapur Tech Corridor", "Madhapur", "500081", 1.05),
    ("Hyderabad", "Banjara Hills", "Banjara Hills", "500034", 1.2),
    ("Hyderabad", "Jubilee Hills", "Jubilee Hills", "500033", 1.2),
    ("Hyderabad", "Kukatpally", "Kukatpally", "500072", 0.95),
    ("Secunderabad", "Begumpet / Cantonment", "Begumpet", "500016", 1.0),
    ("Warangal", "Kakatiya Urban Zone", "Hanamkonda", "506001", 0.85),
]

PARTNER_PERSONAS = [
    ("+917010000001", "Ramesh Kumar", "TECHNICIAN", "GOLD", "Electrician & Appliance Specialist", 7),
    ("+917010000002", "Suresh Goud", "SKILLED_TRADE", "SILVER", "Certified Master Plumber", 9),
    ("+917010000003", "Anand Yadav", "GENERAL_LABOUR", "STANDARD", "General Civil & Material Helper", 4),
    ("+917010000004", "Mohammed Rafiq", "DRIVER_CAPTAIN", "PLATINUM", "Commercial Cab & EV Driver", 6),
    ("+917010000005", "Sri Balaji Paints & Hardware", "PRODUCT_VENDOR", "GOLD", "Authorized Asian Paints Vendor", 12),
    ("+917010000006", "Deccan Infra Developers", "CONTRACTOR", "PLATINUM", "Turnkey Construction & Civil Works", 15),
    ("+917010000007", "Apex Facility Solutions", "AGENCY", "GOLD", "Corporate Housekeeping & Security", 8),
    ("+917010000008", "Dr. Kavitha Reddy", "HEALTHCARE_PRO", "PLATINUM", "Home Healthcare & Physiotherapist", 11),
    ("+917010000009", "Prof. K. Satyanarayana", "TUTOR_EDUCATOR", "GOLD", "IIT-JEE Physics & Maths Tutor", 14),
    ("+917010000010", "Celebrations Event Planners", "EVENT_SPECIALIST", "GOLD", "Weddings, Catering & Sound/Lights", 10),
    ("+917010000011", "Prime Living Properties", "PROPERTY_AGENT", "SILVER", "Hostel, PG & Flat Rental Broker", 5),
    ("+917010000012", "Telangana Labour Union Co.", "COMMERCIAL_BUSINESS", "STANDARD", "Daily Wage Manpower Supply", 7),
    ("+917010000013", "QuickBites Caterers", "LOCAL_MERCHANT", "STANDARD", "Corporate Lunch & Event Catering", 6),
    ("+917010000014", "Zenith Corporate Partners", "CORPORATE_PARTNER", "PLATINUM", "Industrial Engineering & Facility Maintenance", 18),
]

CUSTOMERS = [
    ("+919848012345", "Vikram Rathore", True, "VIKRAM100", 350, "ACTIVE"),
    ("+919848012346", "Pooja Hegde", False, "POOJA50", 120, "ACTIVE"),
    ("+919848012347", "Karthik Varma", True, "STUDENT99", 500, "ACTIVE"),
    ("+919848012348", "Sneha Rao", False, "SNEHA20", 0, "SUSPENDED"),
    ("+919848012349", "Syed Farhan", False, "", 50, "ACTIVE"),
]


class Command(BaseCommand):
    help = "Seed Phase 1: Geographic Hierarchy, Customer 360, and 14 Partner Personas."

    @transaction.atomic
    def handle(self, *args: object, **options: object) -> None:
        self.stdout.write("Seeding City & Geographic Zones...")
        for city, zone, area, pin, mult in ZONES:
            cz, created = CityZone.objects.update_or_create(
                city_name=city,
                zone_name=zone,
                pincode=pin,
                defaults={
                    "area_name": area,
                    "service_radius_km": 15,
                    "pricing_multiplier": mult,
                    "is_active": True,
                    "is_accepting_partners": True,
                },
            )
            if created:
                self.stdout.write(f"  + Zone: {city} - {zone} ({pin})")

        self.stdout.write("Seeding Customer 360 Profiles...")
        customer_role, _ = Role.objects.get_or_create(code="customer", defaults={"name": "Customer"})
        for phone, name, is_stud, ref_code, v_coins, acc_status in CUSTOMERS:
            user, _ = User.objects.get_or_create(
                phone_number=phone,
                defaults={"full_name": name, "is_active": (acc_status != "SUSPENDED")},
            )
            UserRole.objects.get_or_create(user=user, role=customer_role, revoked_at=None)
            CustomerProfile.objects.update_or_create(
                user=user,
                defaults={
                    "display_name": name,
                    "is_student_verified": is_stud,
                    "referral_code": ref_code,
                    "v_coins_balance": v_coins,
                    "account_status": acc_status,
                },
            )
            self.stdout.write(f"  * Customer: {name} ({phone}) - {v_coins} V Coins [{acc_status}]")

        self.stdout.write("Seeding 14 Partner Personas...")
        partner_role, _ = Role.objects.get_or_create(code="partner", defaults={"name": "Partner"})
        for phone, name, p_type, tier, bio, exp in PARTNER_PERSONAS:
            user, _ = User.objects.get_or_create(
                phone_number=phone,
                defaults={"full_name": name, "is_active": True},
            )
            UserRole.objects.get_or_create(user=user, role=partner_role, revoked_at=None)
            PartnerProfile.objects.update_or_create(
                user=user,
                defaults={
                    "display_name": name,
                    "provider_type": p_type,
                    "tier": tier,
                    "biography": bio,
                    "experience_years": exp,
                    "is_verified": True,
                },
            )
            self.stdout.write(f"  * Partner Persona: [{p_type}] {name} ({tier} Tier)")

        self.stdout.write(self.style.SUCCESS("Phase 1 identities and zones seeded successfully."))
