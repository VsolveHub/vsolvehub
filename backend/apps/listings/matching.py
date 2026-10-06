"""Match score between a job and a job seeker's profile. Simple points, not AI.

Out of 100: role 20, must-have skills 35, good-to-have skills 5, experience 15, location 15,
salary 5, languages 5. Strong is 75 and above, Good 50 and above, the rest Others. Every score
comes with the reasons behind it: what matched (✓) and what is missing (△), so an employer
or a seeker can see why, and nobody is ruled out for one missing item.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from apps.listings import jobs

STRONG = "STRONG"
GOOD = "GOOD"
OTHER = "OTHER"
STRONG_AT = 75
GOOD_AT = 50

#: Experience bands in order, so "3 to 5 years" covers a job asking "1 to 3 years".
_EXPERIENCE_ORDER = {"FRESHER": 0, "0_1": 1, "1_3": 2, "3_5": 3, "5_PLUS": 4}


@dataclass
class Match:
    score: int
    level: str
    matched: list[str] = field(default_factory=list)
    missing: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "score": self.score,
            "level": self.level,
            "matched": self.matched,
            "missing": self.missing,
        }


def _norm(items: list[Any] | None) -> set[str]:
    return {" ".join(str(item).lower().split()) for item in items or [] if str(item).strip()}


def _level(score: int) -> str:
    if score >= STRONG_AT:
        return STRONG
    if score >= GOOD_AT:
        return GOOD
    return OTHER


def score_match(job: Any, profile: Any) -> Match:  # noqa: PLR0912, PLR0915
    """``job`` is a Listing, ``profile`` a JobSeekerProfile (or anything with those fields)."""
    points = 0.0
    matched: list[str] = []
    missing: list[str] = []

    # Role: the job title is one of the roles they want.
    wanted = _norm(profile.roles)
    title = " ".join(str(job.title or "").lower().split())
    if title and (title in wanted or any(w in title or title in w for w in wanted if w)):
        points += 20
        matched.append(f"Wants to work as {job.title}")
    elif wanted:
        missing.append(f"Hasn't listed {job.title} as a job they want")

    # Must-have skills, in proportion.
    have = _norm(profile.skills)
    # A job posted without must-have skills borrows its role template's usual skills, so it
    # does not hand every candidate the full skill points.
    template = getattr(job, "role_template", None)
    required = list(job.required_skills or []) or list(getattr(template, "skills", None) or [])
    if required:
        hits = [s for s in required if " ".join(s.lower().split()) in have]
        points += 35 * len(hits) / len(required)
        if hits:
            matched.append(f"Has {len(hits)} of {len(required)} must-have skills")
        missing.extend(f"No {skill}" for skill in required if skill not in hits)
    else:
        points += 35
    preferred = list(job.preferred_skills or [])
    if preferred:
        extra = [s for s in preferred if " ".join(s.lower().split()) in have]
        points += 5 * len(extra) / len(preferred)
        if extra:
            matched.append(f"Also has {', '.join(extra)}")
    else:
        points += 5

    # Experience: at or above what the job asks; one band short still earns half.
    need = _EXPERIENCE_ORDER.get(job.experience_band or "")
    got = _EXPERIENCE_ORDER.get(profile.experience_band or "")
    if need is None:
        points += 15
    elif got is None:
        missing.append("Experience not given")
    elif got >= need:
        points += 15
        matched.append(f"Experience: {jobs.label(jobs.EXPERIENCE_BANDS, profile.experience_band)}")
    elif got == need - 1:
        points += 7.5
        missing.append(
            f"Less experience than asked ({jobs.label(jobs.EXPERIENCE_BANDS, job.experience_band)})"
        )
    else:
        missing.append(
            f"Less experience than asked ({jobs.label(jobs.EXPERIENCE_BANDS, job.experience_band)})"
        )

    # Location: same city, and the same area earns the rest.
    same_city = bool(job.city) and job.city.strip().lower() == (profile.city or "").strip().lower()
    if same_city:
        points += 10
        if job.area and profile.area and job.area.strip().lower() == profile.area.strip().lower():
            points += 5
            matched.append(f"Lives in {profile.area}")
        else:
            points += 2.5
            matched.append(f"In {profile.city}")
    elif job.city:
        missing.append(f"Not in {job.city}")

    # Salary: their expectation fits the job's range.
    expected = int(profile.expected_salary_rupees or 0)
    top = int(job.salary_max_paise or job.salary_min_paise or 0) // 100
    if not expected or not top or (job.salary_period or "MONTHLY") != "MONTHLY":
        points += 5
    elif expected <= top:
        points += 5
        matched.append("Expected salary within range")
    elif expected <= top * 1.2:
        points += 2.5
        missing.append("Expects a little more than the range")
    else:
        missing.append("Expects more than the range")

    # Languages the job asks for.
    asked = set(job.languages or [])
    if not asked:
        points += 5
    else:
        spoken = asked & set(profile.languages or [])
        points += 5 * len(spoken) / len(asked)
        if spoken == asked:
            matched.append("Speaks " + ", ".join(jobs.label(jobs.LANGUAGES, v) for v in asked))
        else:
            missing.extend(
                f"Doesn't speak {jobs.label(jobs.LANGUAGES, v)}" for v in sorted(asked - spoken)
            )

    score = round(points)
    return Match(score=score, level=_level(score), matched=matched, missing=missing)
