import re

with open('backend/apps/catalog/management/commands/seed_listing_catalog.py', 'r') as f:
    content = f.read()

# Fix 1
content = content.replace(
'''                    "structured_fields": {
                        "role_type": "Full-Time",
                        "salary_min_paise": 80000000,
                        "salary_max_paise": 140000000,
                        "salary_period": "YEARLY",''',
'''                    "salary_min_paise": 80000000,
                    "salary_max_paise": 140000000,
                    "salary_period": "YEARLY",
                    "structured_fields": {
                        "role_type": "Full-Time",'''
)

# Fix 2
content = content.replace(
'''                    "structured_fields": {
                        "role_type": "Full-Time",
                        "salary_min_paise": 120000000,
                        "salary_max_paise": 180000000,
                        "salary_period": "YEARLY",''',
'''                    "salary_min_paise": 120000000,
                    "salary_max_paise": 180000000,
                    "salary_period": "YEARLY",
                    "structured_fields": {
                        "role_type": "Full-Time",'''
)

# Fix 3
content = content.replace(
'''                "structured_fields": {
                    "role_type": "Full-Time",
                    "salary_min_paise": 35000000,
                    "salary_max_paise": 50000000,
                    "salary_period": "YEARLY",''',
'''                "salary_min_paise": 35000000,
                "salary_max_paise": 50000000,
                "salary_period": "YEARLY",
                "structured_fields": {
                    "role_type": "Full-Time",'''
)

with open('backend/apps/catalog/management/commands/seed_listing_catalog.py', 'w') as f:
    f.write(content)
