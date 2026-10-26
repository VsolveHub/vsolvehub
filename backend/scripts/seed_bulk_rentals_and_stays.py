"""Seed 100 Rental items and 100 Stay properties for comprehensive multi-item testing.

This script creates:
- 100 active, approved Rental Assets across tools, event equipment, audio, lighting, cameras, furniture, and appliances with verified pins, pickup addresses, pricing, and images.
- 100 active, approved Stay Properties across PGs, Co-living, Hostels, Apartments, Hotels, and Bed Spaces with verified pins, amenities, rooms, and photos.
"""

import os
import random
import sys
from decimal import Decimal

import django

# Setup Django environment
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")
django.setup()

from django.db import transaction
from django.utils import timezone

from apps.catalog.models import ServiceVariant
from apps.partners.models import PartnerCapability, PartnerProfile
from apps.rental.models import RentalAsset
from apps.rental.services import create_asset
from apps.stay.models import Property
from apps.stay.services import create_property

LOCALITIES = [
    {"area": "Madhapur", "lat": 17.4483, "lng": 78.3915, "pincode": "500081", "address": "Plot 42, Hitec City Main Rd, Madhapur"},
    {"area": "Gachibowli", "lat": 17.4401, "lng": 78.3489, "pincode": "500032", "address": "Survey 64, DLF Cyber City Rd, Gachibowli"},
    {"area": "Hitec City", "lat": 17.4435, "lng": 78.3772, "pincode": "500081", "address": "Cyber Towers Lane, Hitec City"},
    {"area": "Kondapur", "lat": 17.4699, "lng": 78.3578, "pincode": "500084", "address": "Raghava Colony, Botanical Garden Rd, Kondapur"},
    {"area": "Kukatpally", "lat": 17.4933, "lng": 78.3995, "pincode": "500072", "address": "Phase 3, KPHB Colony, Kukatpally"},
    {"area": "Jubilee Hills", "lat": 17.4319, "lng": 78.4073, "pincode": "500033", "address": "Road No. 36, Jubilee Hills"},
    {"area": "Banjara Hills", "lat": 17.4156, "lng": 78.4354, "pincode": "500034", "address": "Road No. 12, Banjara Hills"},
    {"area": "Begumpet", "lat": 17.4447, "lng": 78.4664, "pincode": "500016", "address": "Mayur Marg, Begumpet"},
    {"area": "Ameerpet", "lat": 17.4375, "lng": 78.4482, "pincode": "500038", "address": "SR Nagar Crossing, Ameerpet"},
    {"area": "Secunderabad", "lat": 17.4399, "lng": 78.4983, "pincode": "500003", "address": "MG Road, Secunderabad Station Area"},
    {"area": "LB Nagar", "lat": 17.3457, "lng": 78.5522, "pincode": "500074", "address": "Ring Road Junction, LB Nagar"},
    {"area": "Dilsukhnagar", "lat": 17.3688, "lng": 78.5247, "pincode": "500060", "address": "Main Road, Opp Metro Pillar, Dilsukhnagar"},
    {"area": "Miyapur", "lat": 17.4968, "lng": 78.3614, "pincode": "500049", "address": "Allwyn X Roads, Miyapur"},
    {"area": "Manikonda", "lat": 17.4042, "lng": 78.3792, "pincode": "500089", "address": "Puppalaguda Main Rd, Manikonda"},
    {"area": "Financial District", "lat": 17.4172, "lng": 78.3431, "pincode": "500075", "address": "Nanakramguda, Financial District"},
    {"area": "Tellapur", "lat": 17.4589, "lng": 78.2985, "pincode": "500019", "address": "Tellapur-Nallagandla Main Rd, Tellapur"},
    {"area": "Somajiguda", "lat": 17.4265, "lng": 78.4578, "pincode": "500082", "address": "Raj Bhavan Road, Somajiguda"},
    {"area": "Tolichowki", "lat": 17.4018, "lng": 78.4116, "pincode": "500008", "address": "Paramount Hills, Tolichowki"},
    {"area": "Uppal", "lat": 17.4024, "lng": 78.5601, "pincode": "500039", "address": "Inner Ring Road, Uppal"},
    {"area": "Sanath Nagar", "lat": 17.4565, "lng": 78.4419, "pincode": "500018", "address": "Industrial Area, Sanath Nagar"},
]

RENTAL_PHOTOS = [
    "https://images.unsplash.com/photo-1504148455328-c376907d081c?w=800", # drill
    "https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=800", # power tools
    "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800", # conference/event
    "https://images.unsplash.com/photo-1519741497674-611481863552?w=800", # wedding/event decor
    "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800", # dj/sound
    "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800", # party lighting
    "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800", # camera
    "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800", # audio gear
    "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800", # chair/furniture
    "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800", # sofa/furniture
    "https://images.unsplash.com/photo-1513694203232-719a280e022f?w=800", # appliances
    "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=800", # cleaning tools
]

STAY_PHOTOS = [
    "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800", # modern room
    "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800", # apartment interior
    "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800", # bedroom cozy
    "https://images.unsplash.com/photo-1590490360182-c33d57733427?w=800", # hotel suite
    "https://images.unsplash.com/photo-1566665797739-1674de7a421a?w=800", # bright room
    "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800", # luxury hotel
    "https://images.unsplash.com/photo-1555854877-bab0e564b8d5?w=800", # hostel bunk
    "https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?w=800", # modern bed
    "https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=800", # spacious room
    "https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=800", # executive room
]


RENTAL_TEMPLATES = [
    ("VIP Leather Single Sofa Chair", "Premium white leather single sofa for stage and VIP lounge seating.", 45000, 100000),
    ("Round Banquet Dining Table (6-Seater)", "Sturdy wooden banquet table with satin overlay for wedding and catering events.", 35000, 80000),
    ("Chiavari Golden Luxury Chairs (Set of 10)", "Elegant gold-finish Chiavari chairs with soft white cushions for weddings.", 120000, 250000),
    ("High-Top Cocktail Bar Tables (Set of 2)", "Sleek stainless steel cocktail bistro tables for corporate parties and receptions.", 50000, 100000),
    ("Grand Maharaja Royal Stage Sofa", "Intricately carved royal golden velvet sofa for bride & groom stage seating.", 250000, 500000),
    ("Modern Illuminated LED Bar Counter", "Colour-changing waterproof acrylic cocktail bar counter with remote control.", 180000, 400000),
    ("Commercial Plastic Chairs (Bundle of 50)", "Heavy-duty stackable Neelkamal armless chairs for community and family events.", 75000, 150000),
    ("Folding Buffet Tables with Skirting (Set of 4)", "6ft folding heavy-duty catering tables with clean white pleated frills.", 60000, 120000),
    ("20x20 ft Waterproof German Pagoda Tent", "High-peak white aluminum frame canopy tent, heat and rain resistant.", 350000, 600000),
    ("10x10 ft Pop-Up Gazebo Canopy", "Quick-fold portable promotional canopy for outdoor stalls, expos, and registration.", 80000, 150000),
    ("30x30 ft Traditional Shamiana Tent Setup", "Complete multi-colour shamiana with side walls, poles, and floral ceiling cloth.", 450000, 800000),
    ("Dome Tent for Garden Party (40x40 ft)", "Luxury geodesic transparent dome tent for outdoor dining and evening celebrations.", 600000, 1000000),
    ("JBL EON One Pro Portable PA System", "All-in-one rechargeable column PA speaker with 7-channel mixer and Bluetooth.", 150000, 300000),
    ("Yamaha MG16XU 16-Channel Audio Mixer", "Professional studio and live mixer with built-in SPX digital effects and USB interface.", 120000, 250000),
    ("Shure BLX288/PG58 Dual Cordless Mic Set", "Crystal-clear wireless vocal microphones with up to 100m operating range.", 75000, 150000),
    ("QSC K12.2 Active Loudspeakers (Pair)", "2000-Watt high-output powered speakers with stands and heavy-duty XLR cables.", 220000, 450000),
    ("Pioneer DDJ-1000 4-Channel DJ Controller", "Club-standard layout professional DJ system compatible with Rekordbox & VirtualDJ.", 300000, 600000),
    ("Subwoofer 18-Inch Powered Bass Bin", "1500W RMS deep bass subwoofer for live bands, concerts, and sangeet parties.", 160000, 350000),
    ("LED RGB Par Lights (Pack of 8)", "High-intensity 54x3W LED stage lights with DMX master-slave auto sound mode.", 90000, 180000),
    ("Sharpy 7R Moving Head Beam Lights (Pair)", "High-output narrow beam moving heads with gobo wheels and prism effects.", 250000, 500000),
    ("High-Definition P3 LED Video Wall (8x6 ft)", "Indoor ultra-sharp P3 display panels with video processor and laptop switchers.", 850000, 1500000),
    ("Heavy Duty 1000W Halogen Flood Lights (Set of 4)", "Wide-angle outdoor illumination towers with telescopic stands.", 60000, 120000),
    ("Golden Warm Fairy Serial Lights (500 Meters)", "Waterproof outdoor copper wire rice lights for tree wrapping and garden decor.", 40000, 80000),
    ("Bosch GBH 2-28 F Professional Rotary Hammer", "High-power concrete hammer drill with SDS-plus chuck and chiselling modes.", 45000, 100000),
    ("DeWalt DWE7492 10-Inch Portable Table Saw", "Precision rack-and-pinion fence jobsite table saw with heavy-duty stand.", 180000, 350000),
    ("Makita 9557HNG 4.5-Inch Angle Grinder", "Slim body grinder with multi-surface abrasive cut-off wheels included.", 30000, 60000),
    ("Karcher K5 High Pressure Jet Washer", "145-bar water pressure washer with dirt blaster nozzle for facade and vehicle wash.", 95000, 200000),
    ("Honda GX160 Petrol Concrete Vibrator Needle", "Engine-driven concrete compactor needle for foundation and slab casting.", 85000, 150000),
    ("Airless Paint Sprayer Wagner Control Pro", "High-efficiency airless spray machine for fast interior and exterior wall painting.", 160000, 300000),
    ("Heavy Duty Aluminium Extension Ladder (24 ft)", "Industrial self-locking multi-position telescopic extension ladder.", 40000, 80000),
    ("Demolition Jackhammer 16kg Hex", "Heavy-duty electric breaker for RCC slab breaking and rock excavation.", 110000, 220000),
    ("Honda EU30is Inverter Silent Generator 3kVA", "Ultra-quiet portable suitcase petrol generator with electric start and pure sine wave.", 200000, 400000),
    ("Kirloskar 15 kVA Silent Canopy Diesel Generator", "Sound-proof commercial generator on wheels with auto-mains failure panel.", 650000, 1200000),
    ("Heavy Duty 3-Phase Power Distribution Panel Box", "63A industrial input with 12 MCB outputs, voltmeters, and earth leakage protection.", 50000, 100000),
    ("Voltas 2-Ton Portable Movable Air Conditioner", "High-capacity mobile spot cooling AC with flexible exhaust duct.", 140000, 250000),
    ("Symphony Jumbo Desert Air Coolers (Set of 2)", "Large 70-liter water tank industrial cooling blowers with honeycomb pads.", 60000, 100000),
    ("Commercial Glass-Door Beverage Display Chiller", "350-liter upright visible cooler for parties, exhibitions, and caterers.", 130000, 250000),
    ("Commercial Chest Deep Freezer 300L", "Fast-freeze temperature compartment for ice cream, meats, and bulk storage.", 110000, 200000),
    ("Sony Alpha 7 IV Full-Frame Camera Kit", "33MP 4K60p hybrid camera with Sony 24-70mm f/2.8 GM lens and 2 batteries.", 320000, 600000),
    ("DJI RS 3 Pro Gimbal Stabilizer Combo", "Automated axis locks with LiDAR focusing system and RavenEye image transmitter.", 150000, 300000),
    ("DJI Mini 4 Pro 4K Drone Kit", "Sub-249g ultra-compact drone with 360-degree obstacle sensing and Fly More pack.", 250000, 500000),
    ("Godox SL200III Daylight LED Video Light Set", "200W continuous studio bowens-mount light with softbox and C-stand.", 85000, 160000),
    ("GoPro HERO12 Black Action Camera Kit", "5.3K HDR waterproof camera with chest harness, head strap, and extra enduro batteries.", 65000, 120000),
    ("Stainless Steel Buffet Chafing Dishes (Pack of 6)", "Roll-top 9-liter food warmer chafing dishes with fuel burners.", 75000, 150000),
    ("Heavy Duty Commercial Stainless Steel Dosa Tawa", "3x2 ft gas burner iron plate for live outdoor dosa & paratha stations.", 60000, 100000),
    ("Double Tank Electric Deep Fryer (6L + 6L)", "Thermostat-controlled stainless steel fryer for samosas, fries, and snacks.", 50000, 100000),
    ("Refrigerated 3-Bowl Juice & Beverage Dispenser", "Triple 12-liter iced drink dispenser with magnetic stirring spray.", 90000, 180000),
]


STAY_TEMPLATES = [
    ("Zolo Stays Executive PG for Men", "Single and double sharing AC rooms with high-speed WiFi, 3 meals, gym, and gaming area.", 145000, 2),
    ("Stanza Living Milan House Co-ed PG", "Fully serviced managed accommodation with smart locks, housekeeping, and study desks.", 185000, 2),
    ("Sri Sai Balaji Luxury Ladies PG", "Secure women's hostel with biometric entry, 24/7 warden, CCTV, and homely food.", 110000, 3),
    ("Cyber Towers Techies PG & Co-living", "Right next to Mindspace IT Park. AC rooms, ergonomic chairs, and daily sanitization.", 160000, 2),
    ("Sri Venkateshwara Gents Executive Stay", "Budget friendly rooms for IT professionals with attached bath, TV, and geyser.", 95000, 2),
    ("The Hive Co-Living Community", "Vibrant community living with rooftop lounge, co-working space, and community events.", 220000, 1),
    ("Nestaway Furnished Studio Rooms", "Private studio setup with kitchen, washing machine, and refrigerator included.", 210000, 1),
    ("Srinivasa Luxury Girls Hostel", "Clean, safe, and hygienic hostel near coaching hubs and metro station.", 105000, 3),
    ("Elite Men's Stay & Working Hostels", "Spacious 2-sharing rooms with dedicated cupboards, power backup, and mineral water.", 120000, 2),
    ("Vsolve Residency Single Bed Space", "Affordable bed space in shared AC rooms for interns and entry-level professionals.", 75000, 4),
    ("Oakwood Styled 2BHK Luxury Serviced Apartment", "Spacious 1200 sq ft apartment with living lounge, modular kitchen, and balcony.", 450000, 4),
    ("Green Meadows 1BHK Executive Flat", "Fully furnished apartment with king-size bed, smart TV, microwave, and high-speed fiber.", 280000, 2),
    ("Hilltop 3BHK Serviced Penthouse", "Premium 2000 sq ft penthouse with panoramic city skyline views and private terrace.", 750000, 6),
    ("Fortune Heights Studio Apartment", "Compact and cozy designer studio with split AC, kitchenette, and dedicated parking.", 220000, 2),
    ("Golkonda View 2BHK Furnished Suite", "Family-friendly gated society apartment with pool, clubhouse, and 24/7 security.", 380000, 4),
    ("Radha Hometel Business Hotel Room", "Standard King room with complimentary breakfast, work desk, and tea maker.", 299900, 2),
    ("The Manohar Heritage Deluxe Room", "Classic heritage hotel room with marble bath, bathtub, and fine-dining room service.", 449900, 2),
    ("Minerva Grand Premium Suite", "Spacious suite with separate living area, mini bar, and airport shuttle support.", 599900, 3),
    ("Lemon Tree Styled Executive Suite", "Fresh and vibrant rooms with orthopedic mattress, blackout curtains, and soundproofing.", 379900, 2),
    ("Hyatt Place Styled Studio King Room", "Modern hotel room with sofa sleeper, 55-inch smart TV, and ergonomic workstation.", 529900, 2),
    ("Banjara Breeze Boutique Hotel", "Charming boutique hotel located right in the heart of shopping and dining districts.", 319900, 2),
    ("Gachibowli Transit Stay Inn", "Convenient overnight transit stay for business travellers and airport commuters.", 189900, 2),
    ("Apex Coaching Student Residency", "Quiet, study-oriented environment with individual study lamps and library access.", 90000, 2),
    ("Ameerpet Tech Aspirants Hostel", "Walking distance from all major software training institutes and metro.", 85000, 3),
    ("KPHB Scholars PG for Women", "High security and strict study hours for competitive exam preparation.", 100000, 2),
]


def get_structured_fields_for_variant(var: ServiceVariant, index: int) -> dict:
    sub_slug = var.service.subcategory.slug
    fields = {
        "wifi": True,
        "power_backup": True,
        "parking": (index % 2 == 0),
        "cctv": True,
        "hot_water": True,
    }
    if sub_slug == "apartments":
        fields.update({
            "layout": random.choice(["1 BHK", "2 BHK", "3 BHK"]),
            "furnishing": random.choice(["Fully furnished", "Semi furnished"]),
        })
    elif sub_slug == "co-living-spaces":
        fields.update({
            "tier": random.choice(["Standard", "Premium", "Fully managed"]),
            "food": (index % 2 == 0),
        })
    elif sub_slug == "hostels":
        fields.update({
            "gender": random.choice(["Gents", "Ladies", "Unisex"]),
            "occupant": random.choice(["Students", "Working professionals"]),
            "hostel_type": random.choice(["Standard", "Dormitory", "Backpacker"]),
            "tier": random.choice(["Budget", "Standard"]),
        })
    elif sub_slug == "hotels":
        fields.update({
            "star_rating": random.choice(["Budget", "3 Star", "4 Star"]),
            "breakfast": True,
        })
    elif sub_slug == "pg-accommodation":
        fields.update({
            "gender": random.choice(["Gents", "Ladies", "Unisex"]),
            "occupant": random.choice(["Students", "Working professionals"]),
            "food": random.choice(["Food included", "Without food"]),
            "tier": random.choice(["Budget", "Standard", "Luxury"]),
        })
    elif sub_slug == "premium-stays":
        fields.update({
            "stay_type": random.choice(["Luxury apartment", "Premium villa", "Executive suite"]),
        })
    elif sub_slug == "property-listing":
        fields.update({
            "listing_type": random.choice(["Room for rent", "PG for rent", "Apartment for rent"]),
        })
    elif sub_slug == "rental-properties":
        if "commercial" in var.name.lower():
            fields.update({
                "property_type": random.choice(["Commercial space", "Office space", "Shop space"]),
            })
        else:
            fields.update({
                "property_type": random.choice(["Independent house", "Villa", "Studio apartment"]),
                "furnishing": random.choice(["Furnished", "Semi furnished"]),
            })
    elif sub_slug == "rooms":
        fields.update({
            "furnishing": random.choice(["Furnished", "Semi furnished"]),
        })
    elif sub_slug == "short-stay":
        fields.update({
            "duration": random.choice(["Daily", "Weekly"]),
            "stay_type": random.choice(["Room", "Guest house", "Service apartment"]),
        })
    elif sub_slug == "student-accommodation":
        fields.update({
            "gender": random.choice(["Gents", "Ladies", "Unisex"]),
            "stay_type": random.choice(["College nearby hostel", "College nearby PG"]),
            "food": True,
        })
    elif sub_slug == "worker-accommodation":
        fields.update({
            "stay_type": random.choice(["Staff accommodation", "Driver accommodation", "Labour room"]),
            "capacity": random.choice([4, 6, 8, 12]),
        })
    return fields


def seed_rentals(partner: PartnerProfile, target_count: int = 100):
    current = RentalAsset.objects.filter(moderation_status="APPROVED", current_status="ACTIVE").count()
    if current >= target_count:
        print(f"Rental Assets already has {current} active items. Skipping additional rental generation.")
        return

    needed = target_count - current
    print(f"Generating {needed} Rental Assets to reach target of {target_count}...")
    a7_variants = list(ServiceVariant.objects.filter(booking_archetype="A7_RENTAL", is_active=True))
    if not a7_variants:
        raise ValueError("No active A7_RENTAL variants found.")

    for i in range(needed):
        tpl = RENTAL_TEMPLATES[i % len(RENTAL_TEMPLATES)]
        loc = LOCALITIES[i % len(LOCALITIES)]
        var = a7_variants[i % len(a7_variants)]
        photo = RENTAL_PHOTOS[i % len(RENTAL_PHOTOS)]

        base_title, desc, base_rate, base_deposit = tpl
        title = f"{base_title} #{current + i + 1}"

        lat_jitter = (random.random() - 0.5) * 0.015
        lng_jitter = (random.random() - 0.5) * 0.015
        final_lat = Decimal(str(round(loc["lat"] + lat_jitter, 6)))
        final_lng = Decimal(str(round(loc["lng"] + lng_jitter, 6)))

        rate = int(base_rate * (0.9 + (i % 5) * 0.05))
        deposit = int(base_deposit * (0.9 + (i % 4) * 0.05))
        asset_id = f"RENT-{loc['area'][:3].upper()}-{current + i + 101:03d}"

        asset = create_asset(
            partner=partner,
            variant_id=var.id,
            title=title,
            daily_rate_paise=rate,
            deposit_paise=deposit,
            description=f"{desc} Located in {loc['area']}, Hyderabad. Ready for instant pickup or scheduled delivery.",
            location_text=f"{loc['area']}, Hyderabad",
            asset_identifier=asset_id,
            quantity_available=random.choice([1, 2, 3, 5, 10]),
            pickup_address_line=f"{loc['address']}, Flat/Shop #{current + i + 1}",
            pickup_area=loc["area"],
            pickup_city="Hyderabad",
            pickup_pincode=loc["pincode"],
            pickup_pin=(final_lat, final_lng),
            delivery_available=(i % 2 == 0),
            image_urls=[photo],
        )

        asset.moderation_status = RentalAsset.ModerationStatus.APPROVED
        asset.current_status = RentalAsset.Status.ACTIVE
        asset.moderation_reason = "Bulk demo seed approved"
        asset.save(update_fields=["moderation_status", "current_status", "moderation_reason", "updated_at"])

    print(f"✓ Rental Assets now has {RentalAsset.objects.filter(moderation_status='APPROVED', current_status='ACTIVE').count()} items.")


def seed_stays(host: PartnerProfile, count: int = 100):
    print(f"Creating {count} Stay Properties...")
    a9_variants = list(ServiceVariant.objects.filter(booking_archetype="A9_STAY", is_active=True))
    if not a9_variants:
        raise ValueError("No active A9_STAY variants found.")

    created = 0
    current = Property.objects.count()

    for i in range(count):
        tpl = STAY_TEMPLATES[i % len(STAY_TEMPLATES)]
        loc = LOCALITIES[i % len(LOCALITIES)]
        var = a9_variants[i % len(a9_variants)]
        photo = STAY_PHOTOS[i % len(STAY_PHOTOS)]

        base_title, desc, base_rate, sharing = tpl
        title = f"{base_title} ({loc['area']}) #{current + i + 1}"

        lat_jitter = (random.random() - 0.5) * 0.018
        lng_jitter = (random.random() - 0.5) * 0.018
        final_lat = Decimal(str(round(loc["lat"] + lat_jitter, 6)))
        final_lng = Decimal(str(round(loc["lng"] + lng_jitter, 6)))

        rate = int(base_rate * (0.85 + (i % 6) * 0.05))
        structured = get_structured_fields_for_variant(var, i)

        prop = create_property(
            host=host,
            variant_id=var.id,
            title=title,
            description=f"{desc} Prime location in {loc['area']}, near major transit hubs, IT parks, and markets.",
            location_text=f"{loc['area']}, Hyderabad",
            unit_name=f"Standard {sharing}-Sharing AC Room" if sharing > 1 else "Executive Private AC Room",
            nightly_rate_paise=rate,
            sharing_count=sharing,
            structured_fields=structured,
            cancellation_policy_text="Free cancellation up to 24 hours before check-in. 50% charge thereafter.",
            house_rules="Valid photo ID required at check-in. Quiet hours between 11:00 PM and 6:00 AM.",
            min_stay_nights=1,
            image_urls=[photo, STAY_PHOTOS[(i + 1) % len(STAY_PHOTOS)]],
            pin=(final_lat, final_lng),
        )

        prop.moderation_status = Property.ModerationStatus.APPROVED
        prop.listing_status = Property.ListingStatus.LIVE
        prop.moderation_reason = "Bulk demo seed approved"
        prop.save(update_fields=["moderation_status", "listing_status", "moderation_reason", "updated_at"])
        created += 1

    print(f"✓ Successfully seeded {created} active Stay Properties with units, rooms, map pins, and photos.")


def main():
    print("Beginning bulk seed for 100 Rentals and 100 Stays...")

    # Rental Partner: Hyderabad Tool Rentals (+919900000066)
    rental_partner = PartnerProfile.objects.filter(user__phone_number="+919900000066").first()
    if not rental_partner:
        raise ValueError("Rental partner +919900000066 not found in database.")

    # Stay Host: Lakeview PG (+919900000044)
    stay_host = PartnerProfile.objects.filter(user__phone_number="+919900000044").first()
    if not stay_host:
        raise ValueError("Stay host +919900000044 not found in database.")

    seed_rentals(rental_partner, target_count=100)
    seed_stays(stay_host, count=100)

    total_rentals = RentalAsset.objects.filter(moderation_status="APPROVED", current_status="ACTIVE").count()
    total_stays = Property.objects.filter(moderation_status="APPROVED", listing_status="LIVE").count()

    print("\n========================================================")
    print("BULK SEED SUMMARY:")
    print(f"• Total Active Approved Rental Assets: {total_rentals}")
    print(f"• Total Active Approved Stay Properties: {total_stays}")
    print("Browse rentals at: http://localhost:3000/rentals")
    print("Browse stays at:   http://localhost:3000/stays")
    print("Partner rentals:  http://localhost:3001/rentals")
    print("Partner stays:    http://localhost:3001/stays")
    print("========================================================")


if __name__ == "__main__":
    main()
