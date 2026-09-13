"""Seed initial platform configuration models in PostgreSQL."""

from decimal import Decimal
from django.core.management.base import BaseCommand
from apps.identity.models import (
    AppVersionPolicy,
    CMSBanner,
    CommissionRule,
    FeatureFlagConfig,
    MarketingCoupon,
    NotificationTemplate,
    PartnerRankingConfig,
    PricingModelConfig,
    RiskAnomaly,
)

class Command(BaseCommand):
    help = "Seed platform business rules and configuration records."

    def handle(self, *args, **options):
        # 1. Pricing Models
        pricing_data = [
            ("pm_fixed", "Fixed Price Model", "Base Price", "AC Repair, Cleaning, Salon", Decimal("499.00"), Decimal("1.25")),
            ("pm_per_km", "Per-Kilometer Distance", "Base Fare + (KM * Rate/KM) + Waiting", "Bike Taxi, Auto, Cab, Delivery", Decimal("50.00"), Decimal("1.35")),
            ("pm_per_hour", "Hourly Duration", "Min Hours + (Extra Hours * Rate/Hr)", "Electrician, Plumber, Driver on Demand", Decimal("199.00"), Decimal("1.20")),
            ("pm_per_day", "Daily Shift Wage", "Days * Daily Wage Slab", "Event Bouncers, Labour, Security", Decimal("800.00"), Decimal("1.00")),
            ("pm_sqft", "Per Square Foot", "Area (Sq.Ft) * Rate + Material Adj.", "Painting, Flooring, Waterproofing", Decimal("18.00"), Decimal("1.10")),
            ("pm_kg", "Weight Based (Per KG)", "Weight * Tier Rate", "Laundry, Scrap Disposal, Cargo", Decimal("40.00"), Decimal("1.00")),
            ("pm_unit", "Per-Unit / Component", "Units * Price/Unit", "Switchboard Install, Fan Repair", Decimal("120.00"), Decimal("1.15")),
            ("pm_base_var", "Base + Variable Metric", "Base Rate + Variable Addons", "Home Deep Cleaning", Decimal("999.00"), Decimal("1.25")),
            ("pm_night_surge", "Night Surge Multiplier", "Standard Price * 1.25x (11PM - 6AM)", "Emergency Services, Rides", Decimal("0.00"), Decimal("1.25")),
            ("pm_emergency", "Emergency 30-Min Fast-Track", "Flat Surcharge Rs 150 + Base Price", "Locksmith, Pipe Burst, Jumpstart", Decimal("150.00"), Decimal("1.50")),
            ("pm_boq", "Universal Custom BOQ", "SUM(Line Items) + Labour + Transport + GST", "Construction, Renovation, Interior", Decimal("5000.00"), Decimal("1.00")),
        ]
        for pid, name, formula, applicable, base_rate, surge in pricing_data:
            PricingModelConfig.objects.update_or_create(
                id=pid,
                defaults={
                    "name": name,
                    "formula": formula,
                    "applicable_to": applicable,
                    "base_rate_inr": base_rate,
                    "surge_multiplier": surge,
                    "is_active": True,
                },
            )
        self.stdout.write(self.style.SUCCESS(f"Seeded {len(pricing_data)} PricingModelConfig records."))

        # 2. Commission Rules
        comm_data = [
            ("comm_home_srv", "Home Maintenance & Repairs", "PERCENTAGE", "15.0%", "Tier 1: 15%, Tier 2: 12%, Tier 3: 10%", True),
            ("comm_rides", "Vehicle Rides & Transit", "COMMISSION_CAP", "10.0%", "Capped at Max Rs 45 per ride", True),
            ("comm_construction", "Construction & BOQ", "SLAB_BASED", "5.0%", "Under 5L: 5%, 5L-25L: 3.5%, >25L: 2.5%", True),
            ("comm_manpower", "Workforce Manpower", "PER_WORKER_DAY", "Rs 50/day", "Bulk discount >10 workers: Rs 35/day", True),
            ("comm_stays", "Hostels & PG Stays", "LISTING_FEE", "8.0%", "First month booking value", True),
            ("comm_healthcare", "Healthcare & Diagnostics", "PERCENTAGE", "12.0%", "Doctor slot consultations", True),
        ]
        for cid, category, rtype, rate, notes, gst in comm_data:
            CommissionRule.objects.update_or_create(
                id=cid,
                defaults={
                    "category": category,
                    "type": rtype,
                    "rate": rate,
                    "slab_notes": notes,
                    "gst_applicable": gst,
                    "is_active": True,
                },
            )
        self.stdout.write(self.style.SUCCESS(f"Seeded {len(comm_data)} CommissionRule records."))

        # 3. Partner Ranking Config
        if not PartnerRankingConfig.objects.exists():
            PartnerRankingConfig.objects.create(
                weights_json={
                    "customer_rating": 35,
                    "completion_rate": 25,
                    "response_speed": 15,
                    "proximity_distance": 15,
                    "cancellation_penalty": 10,
                },
                decay_factor_days=30,
                min_jobs_for_ranking=5,
                is_active=True,
            )
            self.stdout.write(self.style.SUCCESS("Seeded PartnerRankingConfig."))

        # 4. Feature Flags
        flags_data = [
            ("ENABLE_MULTI_CITY_EXPANSION", "Allow user registration and searches outside Telangana into Pan-India metros.", True, 100, "ALL"),
            ("AI_DISPATCH_OPTIMIZATION", "Automated machine-learning dispatch clustering for ride allocations.", True, 50, "Hyderabad"),
            ("V_COINS_CHECKOUT_BURN", "Allow customers to burn up to 20% of cart value via V Coins wallet balance.", True, 100, "ALL"),
            ("INSTANT_PARTNER_UPI_PAYOUT", "Sub-minute real-time UPI payouts directly after customer job completion.", False, 10, "Hyderabad"),
        ]
        for key, desc, enabled, rollout, city in flags_data:
            FeatureFlagConfig.objects.update_or_create(
                key=key,
                defaults={
                    "description": desc,
                    "is_enabled": enabled,
                    "rollout_percentage": rollout,
                    "target_city": city,
                },
            )
        self.stdout.write(self.style.SUCCESS(f"Seeded {len(flags_data)} FeatureFlagConfig records."))

        # 5. App Version Policies
        versions_data = [
            ("ANDROID_CUSTOMER", "v2.4.1", "v2.2.0", False),
            ("ANDROID_PARTNER", "v2.4.0", "v2.3.0", False),
            ("IOS_CUSTOMER", "v2.4.1", "v2.2.0", False),
            ("WEB_ADMIN", "v2.5.0-enterprise", "v2.0.0", False),
        ]
        for platform, curr, min_v, force in versions_data:
            AppVersionPolicy.objects.update_or_create(
                client_platform=platform,
                defaults={
                    "current_version": curr,
                    "min_supported_version": min_v,
                    "force_update": force,
                },
            )
        self.stdout.write(self.style.SUCCESS(f"Seeded {len(versions_data)} AppVersionPolicy records."))

        # 6. Risk Anomalies
        risk_data = [
            ("risk_01", "CUSTOMER", "+919988112233", "VELOCITY_ABUSE", "HIGH", "6 referral signups from same device IMEI within 10 minutes", "BLOCKED"),
            ("risk_02", "PARTNER", "Partner #1042 (Cab Captain)", "GPS_SPOOFING", "CRITICAL", "Jumped 18 km in 12 seconds along Outer Ring Road", "SUSPENDED"),
            ("risk_03", "PARTNER", "+919123450099 (Vendor)", "RAPID_WALLET_CASHOUT", "HIGH", "Immediate withdrawal of Rs 25,000 within 2 minutes of unverified deposit", "OPEN"),
        ]
        for rid, ttype, target, atype, sev, details, st in risk_data:
            RiskAnomaly.objects.update_or_create(
                id=rid,
                defaults={
                    "target_type": ttype,
                    "target_identifier": target,
                    "anomaly_type": atype,
                    "severity": sev,
                    "details": details,
                    "status": st,
                },
            )
        self.stdout.write(self.style.SUCCESS(f"Seeded {len(risk_data)} RiskAnomaly records."))

        # 7. Marketing Coupons
        coupons = [
            ("WELCOME50", "FLAT", Decimal("50.00"), Decimal("299.00"), Decimal("100000.00"), 412),
            ("SUPERFEST15", "PERCENTAGE", Decimal("15.00"), Decimal("499.00"), Decimal("50000.00"), 184),
            ("STUDENT100", "FLAT", Decimal("100.00"), Decimal("399.00"), Decimal("25000.00"), 68),
        ]
        for code, dtype, dval, min_ord, budget, used in coupons:
            MarketingCoupon.objects.update_or_create(
                code=code,
                defaults={
                    "discount_type": dtype,
                    "discount_value": dval,
                    "min_order_inr": min_ord,
                    "budget_cap_inr": budget,
                    "used_count": used,
                    "is_active": True,
                },
            )
        self.stdout.write(self.style.SUCCESS(f"Seeded {len(coupons)} MarketingCoupon records."))
