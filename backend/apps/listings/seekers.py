"""Job seekers: a profile filled once by tapping, one-tap apply, saved jobs, and matching both
ways ("Jobs for you" for seekers, "Matches" for employers), with in-app notices.
"""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.listings import jobs
from apps.listings.matching import GOOD, OTHER, STRONG, Match, score_match
from apps.listings.models import Application, JobSeekerProfile, Listing, SavedJob
from apps.listings.selectors import public_listings
from apps.listings.services import (
    ListingStateError,
    can_see_matching_candidates,
    submit_application,
)
from apps.notifications.models import NotificationIntent
from apps.notifications.services import request_notification

logger = logging.getLogger(__name__)

MAX_ROLES = 3
MAX_SKILLS = 20
#: Bounds on how many profiles or jobs one request scores, so a page stays fast.
SCAN_LIMIT = 300
NOTIFY_LIMIT = 200

_PROFILE_CHOICES: dict[str, tuple[tuple[str, str], ...]] = {
    "experience_band": jobs.EXPERIENCE_BANDS,
    "qualification": jobs.QUALIFICATIONS,
}


def _clean_items(items: list[Any], *, limit: int, what: str) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for raw in items or []:
        text = " ".join(str(raw or "").split())
        if not text or text.lower() in seen:
            continue
        if len(text) > jobs.MAX_ITEM_LENGTH:
            raise ListingStateError(f"Keep each {what} under {jobs.MAX_ITEM_LENGTH} characters.")
        seen.add(text.lower())
        out.append(text)
    if len(out) > limit:
        raise ListingStateError(f"Pick at most {limit} {what}s.")
    return out


@transaction.atomic
def save_profile(*, user: Any, data: dict[str, Any]) -> JobSeekerProfile:  # noqa: PLR0912
    """Create or update the signed-in user's job profile from picked options."""
    profile, _ = JobSeekerProfile.objects.select_for_update().get_or_create(
        user=user, defaults={"full_name": str(getattr(user, "full_name", "") or "")}
    )
    for name, options in _PROFILE_CHOICES.items():
        if name in data:
            value = str(data[name] or "").strip()
            if value and value not in jobs.values(options):
                raise ListingStateError(f"Choose a listed option for {name.replace('_', ' ')}.")
            setattr(profile, name, value)
    if "roles" in data:
        profile.roles = _clean_items(data["roles"], limit=MAX_ROLES, what="job")
    if "skills" in data:
        profile.skills = _clean_items(data["skills"], limit=MAX_SKILLS, what="skill")
    if "languages" in data:
        langs = [str(v).strip() for v in data["languages"] or []]
        if any(v not in jobs.values(jobs.LANGUAGES) for v in langs):
            raise ListingStateError("Choose languages from the list.")
        profile.languages = list(dict.fromkeys(langs))
    if "job_types" in data:
        kinds = [str(v).strip() for v in data["job_types"] or []]
        if any(v not in jobs.values(jobs.JOB_TYPES) for v in kinds):
            raise ListingStateError("Choose job types from the list.")
        profile.job_types = list(dict.fromkeys(kinds))
    if "available_from" in data:
        value = str(data["available_from"] or "")
        if value and value not in JobSeekerProfile.Availability.values:
            raise ListingStateError("Choose when you can join from the list.")
        profile.available_from = value
    if "visibility" in data:
        value = str(data["visibility"] or "")
        if value not in JobSeekerProfile.Visibility.values:
            raise ListingStateError("Choose who can see your profile.")
        profile.visibility = value
    for name in ("full_name", "city", "area"):
        if name in data:
            setattr(profile, name, " ".join(str(data[name] or "").split()))
    if "expected_salary_rupees" in data:
        profile.expected_salary_rupees = max(int(data["expected_salary_rupees"] or 0), 0)
    profile.save()
    return profile


def set_profile_resume(*, profile: JobSeekerProfile, upload: Any, content_type: str) -> None:
    if profile.resume_file:
        profile.resume_file.delete(save=False)
    profile.resume_file = upload
    profile.resume_name = str(upload.name)[:180]
    profile.resume_content_type = content_type
    profile.save(update_fields=("resume_file", "resume_name", "resume_content_type", "updated_at"))


def profile_snapshot(profile: JobSeekerProfile, *, phone: str) -> dict[str, str]:
    """What the employer sees on an application sent from the profile."""
    place = ", ".join(p for p in (profile.area, profile.city) if p)
    snapshot = {
        "name": profile.full_name or "Job seeker",
        "phone": phone,
        "experience": jobs.label(jobs.EXPERIENCE_BANDS, profile.experience_band),
        "skills": ", ".join(profile.skills),
        "location": place,
        "expected_salary": f"₹{profile.expected_salary_rupees:,} per month"
        if profile.expected_salary_rupees
        else "",
        "available": profile.get_available_from_display() if profile.available_from else "",
        "languages": ", ".join(jobs.label(jobs.LANGUAGES, v) for v in profile.languages),
        "qualification": jobs.label(jobs.QUALIFICATIONS, profile.qualification),
        "jobs_wanted": ", ".join(profile.roles),
    }
    return {key: value for key, value in snapshot.items() if value}


def quick_apply(
    *, listing: Listing, user: Any, note: str = "", resume_url: str = ""
) -> Application:
    """Apply with the saved profile: no form to fill again."""
    profile = JobSeekerProfile.objects.filter(user=user).first()
    if profile is None or not profile.full_name:
        raise ListingStateError("Create your job profile first.")
    application = submit_application(
        listing=listing,
        applicant=user,
        applicant_snapshot=profile_snapshot(profile, phone=str(user.phone_number)),
        cover_note=note,
        resume_url=resume_url,
    )
    _notify(
        recipient_id=listing.poster.user_id,
        template_code="job_application_received",
        purpose="jobs.application.received",
        key=f"job-applied:{application.id}",
        context={"job_title": listing.title, "candidate_name": profile.full_name},
    )
    return application


def set_saved(*, user: Any, listing: Listing, saved: bool) -> bool:
    if saved:
        SavedJob.objects.get_or_create(user=user, listing=listing)
    else:
        SavedJob.objects.filter(user=user, listing=listing).delete()
    return saved


# --- matching -------------------------------------------------------------------------------


def jobs_for(profile: JobSeekerProfile, *, limit: int = 30) -> list[tuple[Listing, Match]]:
    """Live jobs ranked by how well they fit the profile. Same city first; quick-form jobs only
    carry the fields matching needs."""
    qs = public_listings().exclude(city="")
    if profile.city:
        qs = qs.filter(city__iexact=profile.city)
    scored = [(job, score_match(job, profile)) for job in qs[:SCAN_LIMIT]]
    scored = [(job, match) for job, match in scored if match.level != OTHER]
    scored.sort(
        key=lambda pair: (-pair[1].score, -(pair[0].published_at or timezone.now()).timestamp())
    )
    return scored[:limit]


def match_for(listing: Listing, user: Any) -> Match | None:
    profile = JobSeekerProfile.objects.filter(user=user).first() if user.is_authenticated else None
    return score_match(listing, profile) if profile else None


def matches_for_job(listing: Listing) -> list[tuple[JobSeekerProfile, Match, Application | None]]:
    """Candidates for one job: everyone who applied, plus open profiles in the same city."""
    applications = {
        app.applicant_id: app
        for app in Application.objects.filter(listing=listing).exclude(
            status__in=(Application.Status.WITHDRAWN, Application.Status.EXPIRED)
        )
    }
    findable = Q(visibility=JobSeekerProfile.Visibility.OPEN)
    # Work-from-home jobs are open to the whole country; every other job matches by city.
    if listing.work_mode != "WORK_FROM_HOME":
        findable &= Q(city__iexact=listing_city(listing) or "-")
    qs = (
        JobSeekerProfile.objects.select_related("user")
        .exclude(user_id=listing.poster.user_id)
        .filter(Q(user_id__in=applications.keys()) | findable)
    )
    rows = [(p, score_match(listing, p), applications.get(p.user_id)) for p in qs[:SCAN_LIMIT]]
    rows.sort(key=lambda row: (-row[1].score, row[0].full_name))
    return rows


def invitable_matches(listing: Listing) -> list[tuple[JobSeekerProfile, Match]]:
    """Strong and good matches who have not applied: the people an employer can invite."""
    return [
        (profile, match)
        for profile, match, application in matches_for_job(listing)
        if application is None and match.level != OTHER
    ]


def listing_city(listing: Listing) -> str:
    """The job's city. Long-form listings only have free text ("Hyderabad, Telangana")."""
    if listing.city:
        return listing.city.strip()
    return (listing.location_text or "").split(",")[0].strip()


_EXPERIENCE_WORDS = (
    ("fresher", "FRESHER"),
    ("no experience", "FRESHER"),
)


#: Upper year bound (exclusive) for each band, smallest first.
_BAND_LIMITS = ((1.0, "0_1"), (3.0, "1_3"), (5.0, "3_5"))


def _experience_band(text: str) -> str:
    """Best-effort band from what someone typed ("2 years", "6 months", "fresher")."""
    lowered = (text or "").lower()
    if any(word in lowered for word, _band in _EXPERIENCE_WORDS):
        return "FRESHER"
    numbers = "".join(ch if ch.isdigit() or ch == "." else " " for ch in lowered).split()
    try:
        years = float(numbers[0]) if numbers else -1.0
    except ValueError:
        years = -1.0
    if years < 0:
        return ""
    if "month" in lowered:
        years /= 12
    return next((band for limit, band in _BAND_LIMITS if years < limit), "5_PLUS")


def ensure_profile_from_application(
    *,
    user: Any,
    listing: Listing,
    name: str,
    experience: str,
    skills: list[str],
    findable: bool,
) -> JobSeekerProfile | None:
    """Give a first-time applicant a job profile built from what they just told us, so other
    employers with matching jobs can find them. An existing profile is never overwritten.
    """
    if JobSeekerProfile.objects.filter(user=user).exists():
        return None
    return JobSeekerProfile.objects.create(
        user=user,
        full_name=name.strip()[:120],
        roles=[listing.title.strip()[:80]],
        skills=_clean_items(skills, limit=MAX_SKILLS, what="skills"),
        experience_band=_experience_band(experience),
        city=listing_city(listing)[:80],
        area=(listing.area or "")[:120],
        visibility=(
            JobSeekerProfile.Visibility.OPEN
            if findable
            else JobSeekerProfile.Visibility.APPLIED_ONLY
        ),
    )


def invite_to_apply(*, listing: Listing, profile: JobSeekerProfile) -> None:
    """Tell a matching job seeker about the job. Their number stays private until they apply."""
    if not can_see_matching_candidates(listing.poster):
        raise ListingStateError("Upgrade to a plan with Matching candidates to invite people.")
    if listing.status != Listing.Status.PUBLISHED:
        raise ListingStateError("Publish the job before inviting people.")
    if profile.visibility != JobSeekerProfile.Visibility.OPEN:
        raise ListingStateError("This person only shares their profile when they apply.")
    _notify(
        recipient_id=profile.user_id,
        template_code="job_invite",
        purpose="jobs.invite",
        key=f"job-invite:{listing.id}:{profile.id}",
        context={
            "business_name": listing.poster.display_name,
            "job_title": listing.title,
            "place": listing.location_text,
        },
    )


def notify_new_job_matches(listing: Listing) -> int:
    """ "🎯 New job matches you" to strong matches in the job's city, once per job."""
    if not listing.city:
        return 0
    sent = 0
    profiles = JobSeekerProfile.objects.filter(city__iexact=listing.city).exclude(
        user_id=listing.poster.user_id
    )[:SCAN_LIMIT]
    for profile in profiles:
        match = score_match(listing, profile)
        if match.level != STRONG:
            continue
        _notify(
            recipient_id=profile.user_id,
            template_code="job_match_new",
            purpose="jobs.match.new",
            key=f"job-match:{listing.id}:{profile.id}",
            context={
                "job_title": listing.title,
                "place": listing.location_text,
                "score": str(match.score),
            },
        )
        sent += 1
        if sent >= NOTIFY_LIMIT:
            break
    return sent


def send_candidate_digests() -> int:
    """Once a day: "N new matching candidates" to employers, never a message per profile."""
    since = timezone.now() - timedelta(days=1)
    fresh = list(
        JobSeekerProfile.objects.filter(
            updated_at__gte=since, visibility=JobSeekerProfile.Visibility.OPEN
        ).exclude(city="")[:SCAN_LIMIT]
    )
    if not fresh:
        return 0
    per_poster: dict[Any, set[Any]] = {}
    users: dict[Any, Any] = {}
    allowed: dict[Any, bool] = {}
    for job in public_listings().exclude(city="").select_related("poster"):
        # Only employers whose plan includes Matching candidates get the daily summary.
        if job.poster_id not in allowed:
            allowed[job.poster_id] = can_see_matching_candidates(job.poster)
        if not allowed[job.poster_id]:
            continue
        for profile in fresh:
            if profile.city.lower() != job.city.lower() or profile.user_id == job.poster.user_id:
                continue
            if score_match(job, profile).level in (STRONG, GOOD):
                per_poster.setdefault(job.poster_id, set()).add(profile.id)
                users[job.poster_id] = job.poster.user_id
    today = timezone.localdate().isoformat()
    for poster_id, profile_ids in per_poster.items():
        _notify(
            recipient_id=users[poster_id],
            template_code="job_candidates_digest",
            purpose="jobs.candidates.digest",
            key=f"job-digest:{poster_id}:{today}",
            context={"count": str(len(profile_ids))},
        )
    return len(per_poster)


def _notify(
    *, recipient_id: Any, template_code: str, purpose: str, key: str, context: dict[str, str]
) -> None:
    try:
        request_notification(
            recipient_id=recipient_id,
            purpose=purpose,
            channel=NotificationIntent.Channel.IN_APP,
            template_code=template_code,
            context=context,
            idempotency_key=key,
        )
    except Exception:
        logger.exception("Failed to send jobs notification %s", template_code)
