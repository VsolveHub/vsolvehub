"""Partner availability: weekly rules and dated exceptions.

The whole-schedule replace command, in both of its audiences — the Partner replacing their own
availability, and Operations replacing it on their behalf, which is admissible only against a
persisted, active Partner consent receipt and always writes a before/after audit row. The overlap
validation and the snapshot the audit stores live here too.
"""

import uuid
from collections.abc import Sequence
from datetime import time
from itertools import pairwise

from django.db import transaction

from apps.identity.models import User
from apps.partners.exceptions import (
    PartnerApplicationNotFoundError,
    PartnerScheduleError,
    PartnerTransitionError,
)
from apps.partners.models import (
    PartnerApplication,
    PartnerAvailabilityException,
    PartnerAvailabilityRule,
    PartnerConsent,
    PartnerProfile,
    PartnerScheduleChangeAudit,
    PartnerServiceArea,
)

from .base import (
    MINUTES_PER_DAY,
    ScheduleExceptionInput,
    ScheduleRuleInput,
    _application_for_update,
)


def _minutes(value: time) -> int:
    return value.hour * 60 + value.minute


def _validate_schedule_rules(rules: Sequence[ScheduleRuleInput]) -> None:
    by_area: dict[uuid.UUID, list[tuple[int, int]]] = {}
    for rule in rules:
        weekday = rule["weekday"]
        starts_at = rule["starts_at"]
        ends_at = rule["ends_at"]
        if not isinstance(starts_at, time) or not isinstance(ends_at, time):
            raise PartnerScheduleError("Availability times are invalid.")
        start = weekday * MINUTES_PER_DAY + _minutes(starts_at)
        end = weekday * MINUTES_PER_DAY + _minutes(ends_at)
        if bool(rule.get("ends_next_day")):
            end += MINUTES_PER_DAY
        elif end <= start:
            raise PartnerScheduleError(
                "An availability window ending the next day must be marked explicitly.",
            )
        area_id = rule["service_area_id"]
        intervals = by_area.setdefault(area_id, [])
        intervals.append((start, end))

    week = 7 * MINUTES_PER_DAY
    for intervals in by_area.values():
        expanded = intervals + [
            (start + week, end + week) for start, end in intervals if start < MINUTES_PER_DAY
        ]
        expanded.sort()
        for previous, current in pairwise(expanded):
            if current[0] < previous[1]:
                raise PartnerScheduleError("Availability windows cannot overlap.")


@transaction.atomic
def replace_partner_schedule(
    *,
    user: User,
    rules: Sequence[ScheduleRuleInput],
    exceptions: Sequence[ScheduleExceptionInput],
) -> tuple[list[PartnerAvailabilityRule], list[PartnerAvailabilityException]]:
    application = _application_for_update(user)
    return _replace_schedule_for_application(
        application=application,
        rules=rules,
        exceptions=exceptions,
    )


def _replace_schedule_for_application(
    *,
    application: PartnerApplication,
    rules: Sequence[ScheduleRuleInput],
    exceptions: Sequence[ScheduleExceptionInput],
) -> tuple[list[PartnerAvailabilityRule], list[PartnerAvailabilityException]]:
    if application.status == PartnerApplication.Status.OFFBOARDED:
        raise PartnerTransitionError("An offboarded Partner cannot publish availability.")
    _validate_schedule_rules(rules)
    allowed_area_ids = set(
        PartnerServiceArea.objects.filter(
            partner=application.partner,
            is_active=True,
        ).values_list("service_area_id", flat=True),
    )
    requested_area_ids = {item["service_area_id"] for item in (*rules, *exceptions)}
    if not requested_area_ids.issubset(allowed_area_ids):
        raise PartnerScheduleError("Availability can use only approved application service areas.")

    PartnerAvailabilityRule.objects.filter(partner=application.partner).delete()
    PartnerAvailabilityException.objects.filter(partner=application.partner).delete()
    created_rules = PartnerAvailabilityRule.objects.bulk_create(
        [
            PartnerAvailabilityRule(
                partner=application.partner,
                service_area_id=item["service_area_id"],
                weekday=item["weekday"],
                starts_at=item["starts_at"],
                ends_at=item["ends_at"],
                ends_next_day=item.get("ends_next_day", False),
            )
            for item in rules
        ],
    )
    created_exceptions = PartnerAvailabilityException.objects.bulk_create(
        [
            PartnerAvailabilityException(
                partner=application.partner,
                service_area_id=item["service_area_id"],
                date=item["date"],
                is_available=item["is_available"],
                starts_at=item.get("starts_at"),
                ends_at=item.get("ends_at"),
                ends_next_day=item.get("ends_next_day", False),
                reason=item.get("reason", ""),
            )
            for item in exceptions
        ],
    )
    return created_rules, created_exceptions


def _schedule_snapshot(*, partner: PartnerProfile) -> dict[str, list[dict[str, object]]]:
    rules: list[dict[str, object]] = [
        {
            "service_area_id": str(rule.service_area_id),
            "weekday": rule.weekday,
            "starts_at": rule.starts_at.isoformat(),
            "ends_at": rule.ends_at.isoformat(),
            "ends_next_day": rule.ends_next_day,
        }
        for rule in PartnerAvailabilityRule.objects.filter(partner=partner).order_by(
            "service_area_id",
            "weekday",
            "starts_at",
        )
    ]
    exceptions: list[dict[str, object]] = [
        {
            "service_area_id": str(exception.service_area_id),
            "date": exception.date.isoformat(),
            "is_available": exception.is_available,
            "starts_at": exception.starts_at.isoformat() if exception.starts_at else None,
            "ends_at": exception.ends_at.isoformat() if exception.ends_at else None,
            "ends_next_day": exception.ends_next_day,
            "reason": exception.reason,
        }
        for exception in PartnerAvailabilityException.objects.filter(partner=partner).order_by(
            "service_area_id",
            "date",
        )
    ]
    return {"rules": rules, "exceptions": exceptions}


@transaction.atomic
def replace_partner_schedule_for_operations(
    *,
    actor: User,
    partner_id: uuid.UUID,
    consent_purpose: str,
    consent_document_version: str,
    rules: Sequence[ScheduleRuleInput],
    exceptions: Sequence[ScheduleExceptionInput],
) -> tuple[list[PartnerAvailabilityRule], list[PartnerAvailabilityException]]:
    """Change a Partner schedule only with a persisted, active Partner consent receipt."""
    application = (
        PartnerApplication.objects.select_for_update()
        .select_related("partner")
        .filter(partner_id=partner_id)
        .first()
    )
    if application is None:
        raise PartnerApplicationNotFoundError
    consent = PartnerConsent.objects.filter(
        partner=application.partner,
        purpose=consent_purpose,
        document_version=consent_document_version,
        withdrawn_at__isnull=True,
    ).first()
    if consent is None:
        raise PartnerScheduleError("An active Partner consent receipt is required.")
    previous_schedule = _schedule_snapshot(partner=application.partner)
    created_rules, created_exceptions = _replace_schedule_for_application(
        application=application,
        rules=rules,
        exceptions=exceptions,
    )
    PartnerScheduleChangeAudit.objects.create(
        partner=application.partner,
        actor=actor,
        consent=consent,
        previous_schedule=previous_schedule,
        updated_schedule=_schedule_snapshot(partner=application.partner),
    )
    return created_rules, created_exceptions
