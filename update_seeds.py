import re

with open('backend/apps/catalog/management/commands/seed_listing_catalog.py', 'r') as f:
    content = f.read()

# Replace schema definition
content = re.sub(
    r'"salary_range": {\s*"type": "string",\s*"title": "Pay Range / Compensation",\s*},',
    r'"salary_period": {"type": "string", "title": "Pay period", "enum": ["MONTHLY", "YEARLY", "HOURLY"]},',
    content,
    flags=re.MULTILINE
)

# Update experience title
content = re.sub(
    r'"experience_years": {\s*"type": "string",\s*"title": "Experience Required",\s*},',
    r'"experience_years": {"type": "string", "title": "Experience"},',
    content,
    flags=re.MULTILINE
)

# Align enums in demo listings
# 'Full Time' -> 'Full-Time'
content = content.replace('"Full Time"', '"Full-Time"')
# 'Day Shift' -> 'Day'
content = content.replace('"Day Shift"', '"Day"')

# Set salary min/max/period
# "salary_range": "₹8,00,000 - ₹14,00,000 / year",
content = content.replace(
    '"salary_range": "₹8,00,000 - ₹14,00,000 / year",',
    '"salary_min_paise": 80000000,\n                        "salary_max_paise": 140000000,\n                        "salary_period": "YEARLY",'
)
# "salary_range": "₹12,00,000 - ₹18,00,000 / year",
content = content.replace(
    '"salary_range": "₹12,00,000 - ₹18,00,000 / year",',
    '"salary_min_paise": 120000000,\n                        "salary_max_paise": 180000000,\n                        "salary_period": "YEARLY",'
)
# "salary_range": "₹3,50,000 - ₹5,00,000 / year",
content = content.replace(
    '"salary_range": "₹3,50,000 - ₹5,00,000 / year",',
    '"salary_min_paise": 35000000,\n                    "salary_max_paise": 50000000,\n                    "salary_period": "YEARLY",'
)

with open('backend/apps/catalog/management/commands/seed_listing_catalog.py', 'w') as f:
    f.write(content)
