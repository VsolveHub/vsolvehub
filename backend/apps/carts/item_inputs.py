"""Shared, side-effect-free `CartItem` -> planning/pricing input helpers.

Both `services.py` (Customer-facing commands) and `planning.py` (multi-item
scheduling and pricing) need these. They used to live in `services.py` with
`planning.py` importing them from there; `services.py` now needs
`planning.py`'s scheduling-group resolution too (spec §9,
`create_booking_windows` becoming group-aware), and a module cannot import
its own importer. Living here, neither app module imports the other for this.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from django.conf import settings

from apps.carts.exceptions import WindowNoLongerAvailableApiError
from apps.carts.models import CartItem
from apps.catalog.models import A1VariantConfiguration
from apps.pricing.models import TaskRate
from apps.pricing.selectors import current_task_rate


def validate_scope(*, schema: dict[str, object], scope: dict[str, object]) -> None:
    questions = schema.get("questions")
    if not isinstance(questions, list):
        raise ValueError("The selected task has an invalid scope configuration.")
    definitions: dict[str, dict[str, object]] = {}
    for question in questions:
        if not isinstance(question, dict) or not isinstance(question.get("code"), str):
            raise ValueError("The selected task has an invalid scope configuration.")
        definitions[question["code"]] = question
    unknown = set(scope).difference(definitions)
    if unknown:
        raise ValueError("Scope includes a question that is not configured for this task.")
    for code, definition in definitions.items():
        value = scope.get(code)
        if definition.get("required") and code not in scope:
            raise ValueError(f"Scope question '{code}' is required.")
        if value is None:
            continue
        if definition.get("kind") == "INTEGER":
            if isinstance(value, bool) or not isinstance(value, int):
                raise ValueError(f"Scope question '{code}' requires an integer value.")
            minimum = definition.get("minimum")
            if isinstance(minimum, int) and value < minimum:
                raise ValueError(f"Scope question '{code}' is below its minimum value.")
        elif definition.get("kind") not in {"TEXT", "BOOLEAN", "SELECT"}:
            raise ValueError("The selected task has an unsupported scope configuration.")


def current_item_inputs(
    item: CartItem,
) -> tuple[A1VariantConfiguration, TaskRate, dict[str, object], int]:
    configuration = A1VariantConfiguration.objects.filter(
        variant=item.variant,
        status=A1VariantConfiguration.Status.ACTIVE,
    ).first()
    if configuration is None:
        raise ValueError("The selected task is no longer available for booking.")
    scope = {entry.code: entry.value for entry in item.scope_values.all()}
    validate_scope(schema=configuration.scope_schema, scope=scope)
    task_rate = current_task_rate(
        variant=item.variant,
        task_code=item.variant.service.slug,
    )
    if task_rate is None:
        raise ValueError("The selected task has no current rate.")
    duration = task_rate.base_duration_minutes + task_rate.marginal_duration_minutes * item.quantity
    return configuration, task_rate, scope, duration


def assert_window_time_is_current(
    *,
    starts_at: datetime,
    area_timezone: str,
    now: datetime,
) -> None:
    local_now = now.astimezone(ZoneInfo(area_timezone))
    local_start = starts_at.astimezone(ZoneInfo(area_timezone))
    if starts_at < now + timedelta(minutes=settings.M1_TODAY_LEAD_TIME_MINUTES):
        raise WindowNoLongerAvailableApiError
    if local_start.date() > local_now.date() + timedelta(days=settings.M1_SCHEDULED_MAX_DAYS):
        raise WindowNoLongerAvailableApiError
