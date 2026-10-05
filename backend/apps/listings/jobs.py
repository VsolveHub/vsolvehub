"""Jobs: the option lists every job form taps from, and the sentence a job describes itself with.

Options live here (not in the frontends) so the employer form, the job seeker profile, the
filters and matching all agree on the same values. Each option is ``(value, label)``; the
value is stored, the label is shown.
"""

from __future__ import annotations

from datetime import time
from typing import Any

JOB_TYPES = (
    ("FULL_TIME", "Full time"),
    ("PART_TIME", "Part time"),
    ("CONTRACT", "Contract"),
    ("TEMPORARY", "Temporary"),
    ("INTERNSHIP", "Internship"),
)
EXPERIENCE_BANDS = (
    ("FRESHER", "Fresher"),
    ("0_1", "Less than 1 year"),
    ("1_3", "1 to 3 years"),
    ("3_5", "3 to 5 years"),
    ("5_PLUS", "5+ years"),
    ("ANY", "Any experience"),
)
QUALIFICATIONS = (
    ("NONE", "No specific qualification"),
    ("10TH", "10th pass"),
    ("12TH", "12th pass"),
    ("ITI", "ITI"),
    ("DIPLOMA", "Diploma"),
    ("GRADUATE", "Graduate"),
    ("POST_GRADUATE", "Post graduate"),
)
LANGUAGES = (
    ("TELUGU", "Telugu"),
    ("ENGLISH", "English"),
    ("HINDI", "Hindi"),
    ("URDU", "Urdu"),
    ("TAMIL", "Tamil"),
    ("KANNADA", "Kannada"),
    ("MARATHI", "Marathi"),
)
BENEFITS = (
    "Incentives",
    "Commission",
    "Food",
    "Accommodation",
    "Transport",
    "PF / ESI",
    "Health insurance",
    "Paid leave",
    "Bonus",
    "Overtime pay",
)
SHIFTS = (
    ("DAY", "Day shift"),
    ("NIGHT", "Night shift"),
    ("ROTATIONAL", "Rotational shift"),
    ("FLEXIBLE", "Flexible hours"),
)
WORK_MODES = (
    ("ON_SITE", "At the workplace"),
    ("WORK_FROM_HOME", "Work from home"),
    ("FIELD", "Field work"),
)
WEEKLY_OFFS = (
    ("SUNDAY", "Sunday"),
    ("MONDAY", "Monday"),
    ("TUESDAY", "Tuesday"),
    ("WEDNESDAY", "Wednesday"),
    ("THURSDAY", "Thursday"),
    ("FRIDAY", "Friday"),
    ("SATURDAY", "Saturday"),
    ("ROTATIONAL", "Rotational off"),
    ("NONE", "No fixed day off"),
)
URGENCIES = (
    ("NORMAL", "Normal"),
    ("URGENT", "Urgent"),
    ("IMMEDIATE", "Immediate joining"),
)
SALARY_PERIODS = (
    ("MONTHLY", "per month"),
    ("DAILY", "per day"),
    ("HOURLY", "per hour"),
)
#: Monthly pay chips, in rupees. ``0`` as the maximum means "and above".
SALARY_BANDS = (
    (10000, 15000),
    (15000, 20000),
    (20000, 30000),
    (30000, 50000),
    (50000, 0),
)
CITIES = (
    "Hyderabad",
    "Secunderabad",
    "Warangal",
    "Karimnagar",
    "Nizamabad",
    "Khammam",
    "Mahbubnagar",
    "Nalgonda",
    "Siddipet",
    "Suryapet",
    "Adilabad",
    "Mancherial",
    "Ramagundam",
    "Sangareddy",
)

#: The new job flow files every post under this one catalogue variant; the job's own category
#: and role are what people see and filter by.
JOBS_VARIANT_CODE = "career-jobs-hiring-listing"

#: Bounds for the tap-to-pick lists, so a job stays a readable card.
MAX_LIST_ITEMS = 15
MAX_ITEM_LENGTH = 60
MAX_VACANCIES = 500


def values(options: tuple[tuple[str, str], ...]) -> set[str]:
    return {value for value, _label in options}


def label(options: tuple[tuple[str, str], ...], value: str) -> str:
    return dict(options).get(value, value)


def as_options(options: tuple[tuple[str, str], ...]) -> list[dict[str, str]]:
    return [{"value": value, "label": text} for value, text in options]


def rupees(paise: int) -> str:
    amount = paise // 100
    text = f"{amount:,}"
    # Indian grouping: 1,00,000 rather than 100,000.
    if amount >= 100000:  # noqa: PLR2004
        head, tail = str(amount)[:-3], str(amount)[-3:]
        groups: list[str] = []
        while len(head) > 2:  # noqa: PLR2004
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        text = ",".join(groups) + "," + tail
    return f"₹{text}"


def _clock(value: time) -> str:
    hour = value.hour % 12 or 12
    suffix = "AM" if value.hour < 12 else "PM"  # noqa: PLR2004
    return f"{hour} {suffix}" if value.minute == 0 else f"{hour}:{value.minute:02d} {suffix}"


def _join(items: list[str]) -> str:
    items = [item for item in items if item]
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + " and " + items[-1]


def describe_job(job: dict[str, Any], *, business_name: str = "") -> str:
    """A plain description written from what the employer picked. The employer can edit it.

    Built from a sentence pattern, not AI, so it is instant and always says exactly what was
    chosen.
    """
    title = str(job.get("title") or "staff").strip()
    count = int(job.get("vacancies") or 1)
    who = business_name.strip() or "We"
    place = ", ".join(p for p in (job.get("area"), job.get("city")) if p)
    opening = (
        f"{who} {'are' if who == 'We' else 'is'} hiring "
        f"{count} {title}{'s' if count > 1 and not title.endswith('s') else ''}"
        f"{f' in {place}' if place else ''}."
    )
    lines = [opening]

    facts: list[str] = []
    if job.get("job_type"):
        facts.append(label(JOB_TYPES, job["job_type"]))
    if job.get("shift"):
        facts.append(label(SHIFTS, job["shift"]).lower())
    if job.get("timing_start") and job.get("timing_end"):
        facts.append(f"{_clock(job['timing_start'])} to {_clock(job['timing_end'])}")
    if job.get("weekly_off") and job["weekly_off"] not in ("NONE",):
        off = label(WEEKLY_OFFS, job["weekly_off"])
        facts.append(off.lower() if off.endswith("off") else f"{off} off")
    if facts:
        lines.append(f"{facts[0]} job" + (f", {_join(facts[1:])}." if len(facts) > 1 else "."))

    experience = job.get("experience_band")
    if experience:
        lines.append(f"Experience: {label(EXPERIENCE_BANDS, experience)}.")
    skills = list(job.get("required_skills") or [])
    if skills:
        lines.append(f"Must have: {_join(skills)}.")
    nice = list(job.get("preferred_skills") or [])
    if nice:
        lines.append(f"Good to have: {_join(nice)}.")
    duties = [d[0].lower() + d[1:] for d in (job.get("responsibilities") or []) if d]
    if duties:
        lines.append(f"You will {_join(duties)}.")

    low, high = int(job.get("salary_min_paise") or 0), int(job.get("salary_max_paise") or 0)
    if low:
        period = label(SALARY_PERIODS, job.get("salary_period") or "MONTHLY")
        pay = f"{rupees(low)} to {rupees(high)}" if high > low else rupees(low)
        lines.append(f"Salary: {pay} {period}.")
    benefits = list(job.get("benefits") or [])
    if benefits:
        lines.append(f"Benefits: {_join(benefits)}.")
    return " ".join(lines)
