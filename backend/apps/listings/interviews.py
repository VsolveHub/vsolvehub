"""Hiring steps after applying: shortlist, interview, connected.

Applied -> Shortlisted -> Interview -> Connected (or Not selected). The employer proposes an
interview (day, time, in person / phone / video, place). The candidate accepts, asks for another
time, or declines. Once accepted, both see each other's phone number and talk directly; when
they are in touch the employer marks the application Connected and V Solve Hub's part is done.
"""

from __future__ import annotations

from datetime import date, time
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.listings.models import Application, Interview
from apps.listings.seekers import _notify
from apps.listings.services import ListingStateError, _require_poster, update_application_status

_OPEN = (
    Interview.Status.PROPOSED,
    Interview.Status.ACCEPTED,
    Interview.Status.RESCHEDULE_REQUESTED,
)
_CAN_INTERVIEW = (
    Application.Status.SUBMITTED,
    Application.Status.UNDER_REVIEW,
    Application.Status.SHORTLISTED,
    Application.Status.INTERVIEW,
    Application.Status.CONTACTED,
)


def _when(interview: Interview) -> str:
    hour = interview.start_time.hour % 12 or 12
    suffix = "AM" if interview.start_time.hour < 12 else "PM"  # noqa: PLR2004
    minutes = f":{interview.start_time.minute:02d}" if interview.start_time.minute else ""
    return f"{interview.scheduled_date.strftime('%a %d %b')}, {hour}{minutes} {suffix}"


def open_interview(application: Application) -> Interview | None:
    return application.interviews.filter(status__in=_OPEN).first()


@transaction.atomic
def propose_interview(
    *,
    application: Application,
    actor: Any,
    scheduled_date: date,
    start_time: time,
    mode: str,
    location_text: str = "",
    note: str = "",
) -> Interview:
    """The employer invites the candidate. A new proposal replaces one still open."""
    application = (
        Application.objects.select_for_update()
        .select_related("listing__poster")
        .get(id=application.id)
    )
    _require_poster(application.listing, actor)
    if application.status not in _CAN_INTERVIEW:
        raise ListingStateError("This application is closed.")
    if mode not in Interview.Mode.values:
        raise ListingStateError("Choose in person, phone or video.")
    if scheduled_date < timezone.localdate():
        raise ListingStateError("Pick a day from today onwards.")
    application.interviews.filter(status__in=_OPEN).update(
        status=Interview.Status.CANCELLED, updated_at=timezone.now()
    )
    interview = Interview.objects.create(
        application=application,
        scheduled_date=scheduled_date,
        start_time=start_time,
        mode=mode,
        location_text=" ".join(location_text.split())[:240],
        note=note.strip()[:480],
    )
    if application.status != Application.Status.INTERVIEW:
        update_application_status(
            application=application, actor=actor, status=Application.Status.INTERVIEW
        )
    _notify(
        recipient_id=application.applicant_id,
        template_code="job_interview_invite",
        purpose="jobs.interview.invite",
        key=f"job-interview:{interview.id}",
        context={
            "business_name": application.listing.poster.display_name,
            "job_title": application.listing.title,
            "when": _when(interview),
            "mode": interview.get_mode_display(),
        },
    )
    return interview


@transaction.atomic
def respond_to_interview(
    *, interview: Interview, user: Any, action: str, note: str = ""
) -> Interview:
    """The candidate accepts, asks for another time, or declines."""
    interview = (
        Interview.objects.select_for_update()
        .select_related("application__listing__poster")
        .get(id=interview.id)
    )
    application = interview.application
    if application.applicant_id != getattr(user, "id", None):
        raise PermissionError("Not your interview.")
    if interview.status != Interview.Status.PROPOSED:
        raise ListingStateError("This invitation has already been answered.")
    statuses = {
        "accept": Interview.Status.ACCEPTED,
        "reschedule": Interview.Status.RESCHEDULE_REQUESTED,
        "decline": Interview.Status.DECLINED,
    }
    if action not in statuses:
        raise ListingStateError("Unknown answer.")
    interview.status = statuses[action]
    interview.candidate_note = note.strip()[:480]
    interview.responded_at = timezone.now()
    interview.save(update_fields=("status", "candidate_note", "responded_at", "updated_at"))
    if action == "accept" and application.contact_revealed_at is None:
        # Both sides now talk directly: the employer sees the candidate's number.
        application.contact_revealed_at = timezone.now()
        application.save(update_fields=("contact_revealed_at", "updated_at"))
    templates = {
        "accept": "job_interview_accepted",
        "reschedule": "job_interview_reschedule",
        "decline": "job_interview_declined",
    }
    candidate = str(application.applicant_snapshot.get("name") or "The candidate")
    _notify(
        recipient_id=application.listing.poster.user_id,
        template_code=templates[action],
        purpose=f"jobs.interview.{action}",
        key=f"job-interview-{action}:{interview.id}",
        context={
            "candidate_name": candidate,
            "job_title": application.listing.title,
            "when": _when(interview),
            "note": f" “{interview.candidate_note}”" if interview.candidate_note else "",
        },
    )
    return interview


def employer_contact(application: Application) -> str:
    """The employer's number, for the candidate, once an interview is accepted or they are
    connected. Empty before that."""
    accepted = application.interviews.filter(status=Interview.Status.ACCEPTED).exists()
    if not accepted and application.status != Application.Status.CONNECTED:
        return ""
    listing = application.listing
    return str(listing.contact_phone or listing.poster.user.phone_number or "")
