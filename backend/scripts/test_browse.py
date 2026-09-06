import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")
import django
django.setup()

from apps.stays.models import Property
from apps.stays.selectors import browse_stays

print("=== ALL PROPERTIES IN DB ===")
for p in Property.objects.all():
    print(f"[{p.property_type}] {p.title} ({p.locality})")
    for ut in p.unit_types.all():
        modes = list(ut.pricing_rules.values_list('duration_mode', flat=True))
        print(f"    - {ut.name}: sharing={ut.sharing_type}, modes={modes}")

print("\n=== TESTING 7 SUB-CATEGORIES ===")
subcats = [
    ("1. Rooms", {"property_type": "PG", "sharing_type": "PRIVATE"}),
    ("2. PG Accommodation", {"property_type": "PG"}),
    ("3. Hostels", {"property_type": "HOSTEL"}),
    ("4. Co-Living Spaces", {"property_type": "CO_LIVING"}),
    ("5. Apartments", {"property_type": "APARTMENT"}),
    ("6. Rental Properties", {"property_type": "INDEPENDENT_HOUSE"}),
    ("7. Short Stay", {"duration_mode": "NIGHTLY"}),
]

for name, kwargs in subcats:
    res = browse_stays(**kwargs)
    print(f"\n{name} ({kwargs}): {len(res)} results")
    for r in res:
        mo_price = r["price_paise"] / 100
        daily_price = r.get("daily_rate_paise", 0) / 100
        print(f"   -> {r['property_title']} - {r['unit_name']} (price: {mo_price}/mo, daily: {daily_price})")
