"""Seed matching job seekers and applications for one job, for local demos.

Creates eight job-seeker profiles in the job's city with a spread of fit (strong, good and
weak matches, scored by ``apps.listings.matching``) and has the first five apply. Safe to
re-run: profiles and applications are updated in place, never duplicated.

Usage:

    python manage.py seed_job_applicants --listing "senior developer"
    python manage.py seed_job_applicants --listing <listing-uuid-or-slug>

Local data only. Refuses to run with DEBUG off.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Q

from apps.listings.matching import score_match
from apps.listings.models import (
    Application,
    ApplicationStatusEvent,
    JobSeekerProfile,
    Listing,
)
from apps.listings.seekers import profile_snapshot

#: Used when the job has no must-have skills of its own.
DEFAULT_SKILLS = ["Python", "Django", "React", "PostgreSQL", "REST APIs", "Git"]
DEFAULT_EXTRA = ["Docker", "AWS"]


@dataclass(frozen=True)
class Seeker:
    phone: str
    name: str
    area: str
    skill_share: float  # share of the job's must-have skills they have
    extras: bool  # has the nice-to-have skills too
    experience: str
    salary_factor: float  # expected salary as a share of the job's top salary
    languages: tuple[str, ...]
    applies: str  # application status to seed, or "" for a matching profile that hasn't applied
    note: str


SEEKERS: tuple[Seeker, ...] = (
    Seeker(
        "+919700100001",
        "Ravi Teja Kommineni",
        "Madhapur",
        1.0,
        True,
        "3_5",
        0.85,
        ("TELUGU", "ENGLISH", "HINDI"),
        "SHORTLISTED",
        "4 years building Django and React apps for a fintech team. Can join in 15 days.",
    ),
    Seeker(
        "+919700100002",
        "Sneha Reddy",
        "Gachibowli",
        1.0,
        False,
        "1_3",
        0.75,
        ("TELUGU", "ENGLISH"),
        "SUBMITTED",
        "Backend developer, 2.5 years. Led the API rewrite at my current job.",
    ),
    Seeker(
        "+919700100003",
        "Mohammed Arif",
        "Tolichowki",
        0.8,
        True,
        "3_5",
        0.95,
        ("URDU", "HINDI", "ENGLISH"),
        "SUBMITTED",
        "Full stack, strong on PostgreSQL performance and AWS deployments.",
    ),
    Seeker(
        "+919700100004",
        "Lakshmi Prasanna",
        "Kondapur",
        0.6,
        False,
        "1_3",
        1.1,
        ("TELUGU", "ENGLISH"),
        "SUBMITTED",
        "React specialist moving into full stack work.",
    ),
    Seeker(
        "+919700100005",
        "Karthik Varma",
        "Kukatpally",
        0.4,
        False,
        "0_1",
        0.6,
        ("TELUGU", "ENGLISH"),
        "SUBMITTED",
        "Recent graduate, built two Django projects during my internship.",
    ),
    Seeker(
        "+919700100006",
        "Priya Sharma",
        "Hitech City",
        1.0,
        True,
        "5_PLUS",
        1.0,
        ("HINDI", "ENGLISH"),
        "",
        "",
    ),
    Seeker(
        "+919700100007",
        "Venkatesh Naidu",
        "Ameerpet",
        0.8,
        False,
        "3_5",
        0.9,
        ("TELUGU", "ENGLISH"),
        "",
        "",
    ),
    Seeker(
        "+919700100008",
        "Ayesha Fatima",
        "Mehdipatnam",
        0.5,
        False,
        "1_3",
        0.8,
        ("URDU", "ENGLISH"),
        "",
        "",
    ),
)


def _find_listing(ref: str) -> Listing:
    qs = Listing.objects.select_related("poster")
    match = qs.filter(Q(slug=ref) | Q(title__iexact=ref))
    try:
        import uuid  # noqa: PLC0415

        match = qs.filter(id=uuid.UUID(ref))
    except ValueError:
        pass
    found = list(match.order_by("-created_at")[:2])
    if not found:
        raise CommandError(f"No job found for {ref!r} (use its id, slug or exact title).")
    if len(found) > 1:
        print(f"Several jobs are titled {ref!r}; using the newest ({found[0].id}).")  # noqa: T201
    return found[0]


class Command(BaseCommand):
    help = "Seed matching job seekers and applications for one job (local demo data)."

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument("--listing", required=True, help="Job id, slug or exact title.")

    @transaction.atomic
    def handle(self, *args: Any, **options: Any) -> None:
        if not settings.DEBUG:
            raise CommandError("Demo seed data is for local development only (DEBUG is off).")

        listing = _find_listing(options["listing"])
        city = listing.city or "Hyderabad"
        must = list(listing.required_skills or []) or DEFAULT_SKILLS
        extras = list(listing.preferred_skills or []) or DEFAULT_EXTRA
        top_rupees = (listing.salary_max_paise or listing.salary_min_paise or 0) // 100 or 90000
        user_model = get_user_model()

        for seeker in SEEKERS:
            user, _ = user_model.objects.get_or_create(phone_number=seeker.phone)
            if user.id == listing.poster.user_id:
                continue
            take = max(1, round(len(must) * seeker.skill_share))
            profile, _ = JobSeekerProfile.objects.update_or_create(
                user=user,
                defaults={
                    "full_name": seeker.name,
                    "roles": [listing.title.title(), "Software Developer"],
                    "skills": must[:take] + (extras if seeker.extras else []),
                    "experience_band": seeker.experience,
                    "qualification": "GRADUATE",
                    "languages": list(seeker.languages),
                    "city": city,
                    "area": seeker.area,
                    "expected_salary_rupees": int(top_rupees * seeker.salary_factor) // 500 * 500,
                    "job_types": ["FULL_TIME"],
                    "available_from": JobSeekerProfile.Availability.FORTNIGHT,
                    "visibility": JobSeekerProfile.Visibility.OPEN,
                },
            )
            match = score_match(listing, profile)
            line = f"{seeker.name:<22} {match.level:<6} {match.score:>3}"

            if seeker.applies:
                application = (
                    Application.objects.filter(listing=listing, applicant=user)
                    .exclude(status__in=(Application.Status.WITHDRAWN, Application.Status.EXPIRED))
                    .first()
                )
                snapshot = profile_snapshot(profile, phone=str(user.phone_number))
                if application is None:
                    application = Application.objects.create(
                        listing=listing,
                        applicant=user,
                        status=seeker.applies,
                        applicant_snapshot=snapshot,
                        cover_note=seeker.note,
                    )
                    ApplicationStatusEvent.objects.create(
                        application=application,
                        actor=user,
                        to_status=Application.Status.SUBMITTED,
                        kind="submitted",
                    )
                    if seeker.applies != Application.Status.SUBMITTED:
                        ApplicationStatusEvent.objects.create(
                            application=application,
                            actor=listing.poster.user,
                            from_status=Application.Status.SUBMITTED,
                            to_status=seeker.applies,
                            kind="status_changed",
                        )
                else:
                    application.applicant_snapshot = snapshot
                    application.cover_note = seeker.note
                    application.save(
                        update_fields=("applicant_snapshot", "cover_note", "updated_at")
                    )
                line += f"  applied ({application.status.lower()})"
            else:
                line += "  matching profile, not applied"
            self.stdout.write(line)

        self.stdout.write(
            self.style.SUCCESS(f"\nSeeded candidates for '{listing.title}' in {city}.")
        )
        if listing.status != Listing.Status.PUBLISHED:
            self.stdout.write(
                self.style.WARNING(
                    "This job is not published. Applicants were added for the demo, but real "
                    "seekers can only apply (and be invited) once it is published."
                )
            )
