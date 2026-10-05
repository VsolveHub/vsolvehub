"""A ready-made "Sales Executive" job, as the 4-step form would send it."""

from datetime import time
from typing import Any

from apps.listings.models import JobRoleTemplate

SALES_PAY_MIN = 2000000
SALES_PAY_MAX = 3500000
VACANCIES = 5


def _sales_job(**overrides: Any) -> dict[str, Any]:
    template = JobRoleTemplate.objects.get(category="Retail & Sales", name="Sales Executive")
    data: dict[str, Any] = {
        "role_template_id": template.id,
        "title": "Sales Executive",
        "vacancies": VACANCIES,
        "job_type": "FULL_TIME",
        "experience_band": "3_5",
        "required_skills": ["Sales", "Customer handling"],
        "preferred_skills": ["Jewellery sales"],
        "responsibilities": ["Greet and help customers"],
        "benefits": ["Incentives"],
        "languages": ["TELUGU", "HINDI"],
        "shift": "DAY",
        "timing_start": time(10),
        "timing_end": time(20),
        "weekly_off": "TUESDAY",
        "city": "Hyderabad",
        "area": "Kukatpally",
        "salary_min_paise": SALES_PAY_MIN,
        "salary_max_paise": SALES_PAY_MAX,
        "salary_period": "MONTHLY",
    }
    data.update(overrides)
    return data
