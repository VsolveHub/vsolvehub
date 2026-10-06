"""Seed a complete Careers demo: one paid employer, one free employer, jobs, job seekers and
applications, arranged to show the client the free vs paid difference.

The story the data tells (all in Hyderabad):

1. Sri Lakshmi Jewellers is on the FREE plan. Job seekers applied to its jobs, so it sees
   those applicants with match scores. Its "Matching candidates" tab is locked and shows how
   many matching people it is missing.
2. Apex Staffing Solutions is on the Enterprise plan. It posted similar jobs. It sees the
   same job seekers as "Matching candidates" without them applying, and can invite them.
3. One job seeker unticked "Let other employers find my profile": they appear only where they
   applied, never in anyone's matches.

Usage (after migrate and seed_listing_catalog):

    python manage.py seed_jobs_demo

Safe to re-run: everything is matched by phone number or job title and updated in place.
Local data only; refuses to run with DEBUG off.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.identity.models import Role, UserRole
from apps.listings.models import (
    Application,
    ApplicationStatusEvent,
    JobRoleTemplate,
    JobSeekerProfile,
    Listing,
    VendorSubscription,
    VendorSubscriptionPlan,
)
from apps.listings.seekers import invitable_matches, profile_snapshot
from apps.listings.services import CANDIDATE_MATCHING, ListingStateError, post_job, publish_job_now
from apps.partners.models import PartnerApplication, PartnerProfile

PAID_PHONE = "+919900000088"
PAID_NAME = "Apex Staffing Solutions"
FREE_PHONE = "+919900000099"
FREE_NAME = "Sri Lakshmi Jewellers"
PAID_PLAN_CODE = "enterprise"


@dataclass(frozen=True)
class Job:
    template: str  # JobRoleTemplate name
    title: str
    area: str
    experience: str
    pay: tuple[int, int]  # monthly rupees
    must: tuple[str, ...]
    nice: tuple[str, ...] = ()
    languages: tuple[str, ...] = ("TELUGU", "HINDI")


FREE_JOBS = (
    Job(
        "Jewellery Sales Executive",
        "Jewellery Sales Executive",
        "Ameerpet",
        "1_3",
        (18000, 28000),
        ("Jewellery sales", "Customer handling", "Billing"),
        ("Gold & silver knowledge",),
    ),
    Job(
        "Cashier / Billing Executive",
        "Billing Executive",
        "Ameerpet",
        "0_1",
        (15000, 20000),
        ("Billing", "Cash handling", "Customer handling"),
        ("POS",),
    ),
)
PAID_JOBS = (
    Job(
        "Sales Executive",
        "Showroom Sales Executive",
        "Kukatpally",
        "1_3",
        (20000, 30000),
        ("Customer handling", "Billing", "Sales"),
        ("Communication",),
    ),
    Job(
        "Cashier / Billing Executive",
        "Cashier",
        "Madhapur",
        "0_1",
        (16000, 22000),
        ("Billing", "Cash handling"),
        ("POS", "Customer handling"),
    ),
    Job(
        "Software Developer",
        "Junior Full Stack Developer",
        "Hitech City",
        "1_3",
        (35000, 60000),
        ("JavaScript", "Python", "Databases"),
        ("Git",),
        ("ENGLISH",),
    ),
)


@dataclass(frozen=True)
class Seeker:
    phone: str
    name: str
    area: str
    roles: tuple[str, ...]
    skills: tuple[str, ...]
    experience: str
    salary: int
    languages: tuple[str, ...] = ("TELUGU", "HINDI", "ENGLISH")
    findable: bool = True
    #: (job title at the FREE employer, application status)
    applies_to: tuple[tuple[str, str], ...] = field(default=())


SEEKERS = (
    Seeker(
        "+919800200001",
        "Lavanya Goud",
        "SR Nagar",
        ("Jewellery Sales Executive", "Sales Executive"),
        ("Jewellery sales", "Customer handling", "Billing", "Gold & silver knowledge", "Sales"),
        "1_3",
        22000,
        applies_to=(("Jewellery Sales Executive", "SHORTLISTED"),),
    ),
    Seeker(
        "+919800200002",
        "Mahesh Yadav",
        "Kukatpally",
        ("Sales Executive",),
        ("Sales", "Customer handling", "Billing", "Communication"),
        "3_5",
        26000,
        applies_to=(("Jewellery Sales Executive", "SUBMITTED"),),
    ),
    Seeker(
        "+919800200003",
        "Swathi Reddy",
        "Ameerpet",
        ("Billing Executive", "Cashier"),
        ("Billing", "Cash handling", "POS", "Customer handling"),
        "1_3",
        18000,
        applies_to=(("Billing Executive", "SUBMITTED"),),
    ),
    Seeker(
        "+919800200004",
        "Imran Khan",
        "Mehdipatnam",
        ("Cashier",),
        ("Billing", "Cash handling", "Basic computer"),
        "0_1",
        16000,
        ("URDU", "HINDI", "ENGLISH"),
        applies_to=(("Billing Executive", "SUBMITTED"),),
    ),
    Seeker(
        "+919800200005",
        "Divya Sri",
        "Kukatpally",
        ("Sales Executive", "Showroom Sales Executive"),
        ("Sales", "Customer handling", "Billing", "Communication", "Product knowledge"),
        "1_3",
        24000,
    ),
    Seeker(
        "+919800200006",
        "Ramesh Babu",
        "Madhapur",
        ("Cashier",),
        ("Billing", "Cash handling", "POS", "Customer handling"),
        "1_3",
        19000,
    ),
    Seeker(
        "+919800200007",
        "Pooja Nair",
        "Gachibowli",
        ("Software Developer",),
        ("JavaScript", "Python", "Databases", "Git", "React"),
        "1_3",
        45000,
        ("ENGLISH", "HINDI"),
    ),
    Seeker(
        "+919800200008",
        "Kiran Kumar",
        "Kondapur",
        ("Junior Full Stack Developer",),
        ("JavaScript", "Python", "Git"),
        "0_1",
        32000,
        ("ENGLISH", "TELUGU"),
    ),
    # Unticked "let other employers find me": shows only where they applied.
    Seeker(
        "+919800200009",
        "Anjali Verma",
        "Ameerpet",
        ("Jewellery Sales Executive",),
        ("Jewellery sales", "Customer handling", "Billing"),
        "1_3",
        21000,
        findable=False,
        applies_to=(("Jewellery Sales Executive", "SUBMITTED"),),
    ),
)


def _employer(phone: str, name: str) -> PartnerProfile:
    user_model: Any = get_user_model()
    user, _ = user_model.objects.get_or_create(phone_number=phone, defaults={"full_name": name})
    for code in ("partner", "customer"):
        role, _ = Role.objects.get_or_create(
            code=code, defaults={"name": code.title(), "is_system": True}
        )
        UserRole.objects.update_or_create(user=user, role=role, defaults={"revoked_at": None})
    profile, _ = PartnerProfile.objects.get_or_create(user=user, defaults={"display_name": name})
    if profile.display_name != name:
        profile.display_name = name
        profile.save(update_fields=["display_name"])
    PartnerApplication.objects.update_or_create(
        partner=profile,
        defaults={
            "status": PartnerApplication.Status.APPROVED,
            "track": PartnerApplication.Track.EMPLOYER,
        },
    )
    return profile


def _paid_plan(poster: PartnerProfile) -> VendorSubscriptionPlan:
    plan, _ = VendorSubscriptionPlan.objects.get_or_create(
        code=PAID_PLAN_CODE,
        defaults={
            "name": "Enterprise Plan",
            "price_paise": 499900,
            "duration_days": 90,
            "max_active_listings": 50,
        },
    )
    caps = list(plan.premium_capabilities or [])
    for cap in ("FEATURED_PLACEMENT", CANDIDATE_MATCHING):
        if cap not in caps:
            caps.append(cap)
    plan.premium_capabilities = caps
    plan.is_active = True
    plan.save(update_fields=["premium_capabilities", "is_active"])
    now = timezone.now()
    active = VendorSubscription.objects.filter(
        poster=poster, status=VendorSubscription.Status.ACTIVE, ends_at__gt=now
    ).first()
    if active is None or active.plan_id != plan.id:
        VendorSubscription.objects.filter(
            poster=poster, status=VendorSubscription.Status.ACTIVE
        ).update(status=VendorSubscription.Status.EXPIRED)
        VendorSubscription.objects.create(
            poster=poster,
            plan=plan,
            status=VendorSubscription.Status.ACTIVE,
            starts_at=now - timedelta(days=1),
            ends_at=now + timedelta(days=plan.duration_days),
        )
    return plan


def _make_free(poster: PartnerProfile) -> None:
    VendorSubscription.objects.filter(
        poster=poster, status=VendorSubscription.Status.ACTIVE
    ).update(status=VendorSubscription.Status.CANCELLED)


def _job(poster: PartnerProfile, spec: Job) -> Listing:
    template = JobRoleTemplate.objects.filter(name=spec.template, is_active=True).first()
    data: dict[str, Any] = {
        "role_template_id": template.id if template else None,
        "title": spec.title,
        "job_category": template.category if template else "",
        "vacancies": 2,
        "job_type": "FULL_TIME",
        "experience_band": spec.experience,
        "required_skills": list(spec.must),
        "preferred_skills": list(spec.nice),
        "responsibilities": list(template.responsibilities if template else []),
        "benefits": ["Incentives", "PF & ESI"],
        "languages": list(spec.languages),
        "shift": "DAY",
        "work_mode": "ON_SITE",
        "weekly_off": "SUNDAY",
        "city": "Hyderabad",
        "area": spec.area,
        "salary_min_paise": spec.pay[0] * 100,
        "salary_max_paise": spec.pay[1] * 100,
        "salary_period": "MONTHLY",
    }
    existing = (
        Listing.objects.filter(poster=poster, title=spec.title).order_by("-created_at").first()
    )
    if existing is None:
        return post_job(poster=poster, actor=poster.user, data=data)
    if existing.status != Listing.Status.PUBLISHED:
        existing = publish_job_now(listing=existing, actor=poster.user)
    return existing


def _seeker(spec: Seeker) -> tuple[Any, JobSeekerProfile]:
    user_model: Any = get_user_model()
    user, _ = user_model.objects.get_or_create(
        phone_number=spec.phone, defaults={"full_name": spec.name}
    )
    role, _ = Role.objects.get_or_create(
        code="customer", defaults={"name": "Customer", "is_system": True}
    )
    UserRole.objects.update_or_create(user=user, role=role, defaults={"revoked_at": None})
    profile, _ = JobSeekerProfile.objects.update_or_create(
        user=user,
        defaults={
            "full_name": spec.name,
            "roles": list(spec.roles),
            "skills": list(spec.skills),
            "experience_band": spec.experience,
            "qualification": "GRADUATE",
            "languages": list(spec.languages),
            "city": "Hyderabad",
            "area": spec.area,
            "expected_salary_rupees": spec.salary,
            "job_types": ["FULL_TIME"],
            "available_from": JobSeekerProfile.Availability.FORTNIGHT,
            "visibility": (
                JobSeekerProfile.Visibility.OPEN
                if spec.findable
                else JobSeekerProfile.Visibility.APPLIED_ONLY
            ),
        },
    )
    return user, profile


def _apply(listing: Listing, user: Any, profile: JobSeekerProfile, status: str) -> Application:
    application = (
        Application.objects.filter(listing=listing, applicant=user)
        .exclude(status__in=(Application.Status.WITHDRAWN, Application.Status.EXPIRED))
        .first()
    )
    if application is not None:
        return application
    application = Application.objects.create(
        listing=listing,
        applicant=user,
        status=status,
        applicant_snapshot=profile_snapshot(profile, phone=str(user.phone_number)),
        cover_note="I have worked in a similar role and can join within two weeks.",
    )
    ApplicationStatusEvent.objects.create(
        application=application,
        actor=user,
        to_status=Application.Status.SUBMITTED,
        kind="submitted",
    )
    if status != Application.Status.SUBMITTED:
        ApplicationStatusEvent.objects.create(
            application=application,
            actor=listing.poster.user,
            from_status=Application.Status.SUBMITTED,
            to_status=status,
            kind="status_changed",
        )
    return application


class Command(BaseCommand):
    help = "Seed the Careers demo: a free and a paid employer, jobs, job seekers, applications."

    @transaction.atomic
    def handle(self, *args: Any, **options: Any) -> None:
        if not settings.DEBUG:
            raise CommandError("Demo seed data is for local development only (DEBUG is off).")

        paid = _employer(PAID_PHONE, PAID_NAME)
        free = _employer(FREE_PHONE, FREE_NAME)
        _paid_plan(paid)
        _make_free(free)

        try:
            free_jobs = {spec.title: _job(free, spec) for spec in FREE_JOBS}
            paid_jobs = [_job(paid, spec) for spec in PAID_JOBS]
        except ListingStateError as exc:
            raise CommandError(f"{exc} Run `python manage.py seed_listing_catalog` first.") from exc

        for spec in SEEKERS:
            user, profile = _seeker(spec)
            for title, status in spec.applies_to:
                _apply(free_jobs[title], user, profile, status)

        out = self.stdout
        out.write(self.style.SUCCESS("\nCareers demo ready (Hyderabad).\n"))
        out.write(f"FREE  employer: {FREE_NAME}  login {FREE_PHONE}")
        for job in free_jobs.values():
            applied = job.applications.exclude(status__in=("WITHDRAWN", "EXPIRED")).count()
            hidden = len(invitable_matches(job))
            out.write(
                f"   - {job.title}: {applied} applied · {hidden} matching (locked on free plan)"
            )
        out.write(f"\nPAID  employer: {PAID_NAME}  login {PAID_PHONE}  (Enterprise plan)")
        for job in paid_jobs:
            names = ", ".join(p.full_name for p, _m in invitable_matches(job)) or "none"
            out.write(f"   - {job.title}: matching without applying -> {names}")
        out.write(
            "\nJob seekers log in with their own numbers (+9198002000xx). "
            "Anjali Verma unticked 'let other employers find me', so she never appears in matches."
        )
