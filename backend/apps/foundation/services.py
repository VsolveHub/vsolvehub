"""Transaction, idempotency and outbox command conventions."""

import hashlib
import json
from collections.abc import Callable
from dataclasses import dataclass
from typing import TypeVar
from uuid import UUID

from django.contrib.auth.models import AbstractBaseUser
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.foundation.exceptions import IdempotencyInProgressError, IdempotencyKeyReuseError
from apps.foundation.models import IdempotencyRecord, OutboxEvent
from apps.foundation.tasks import dispatch_outbox_event

ResponseBody = dict[str, object] | list[object] | None
Result = TypeVar("Result")


@dataclass(frozen=True, slots=True)
class CommandResult:
    status_code: int
    body: ResponseBody
    replayed: bool = False


def request_fingerprint(payload: object) -> str:
    """Produce a stable fingerprint without persisting sensitive request data."""
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str).encode()
    return hashlib.sha256(encoded).hexdigest()


def execute_idempotent(
    *,
    actor: AbstractBaseUser | None,
    operation: str,
    key: str,
    request_payload: object,
    command: Callable[[], tuple[int, ResponseBody]],
) -> CommandResult:
    """Run one state-changing command once and replay its persisted response safely."""
    fingerprint = request_fingerprint(request_payload)
    try:
        with transaction.atomic():
            record, created = IdempotencyRecord.objects.select_for_update().get_or_create(
                actor=actor,
                operation=operation,
                key=key,
                defaults={"request_fingerprint": fingerprint},
            )
            if not created:
                if record.request_fingerprint != fingerprint:
                    raise IdempotencyKeyReuseError
                if record.status == IdempotencyRecord.Status.COMPLETED:
                    return CommandResult(
                        status_code=record.response_status or 200,
                        body=record.response_body,
                        replayed=True,
                    )
                raise IdempotencyInProgressError

            status_code, body = command()
            record.status = IdempotencyRecord.Status.COMPLETED
            record.response_status = status_code
            record.response_body = body
            record.completed_at = timezone.now()
            record.save(
                update_fields=("status", "response_status", "response_body", "completed_at"),
            )
            return CommandResult(status_code=status_code, body=body)
    except IntegrityError as exc:
        # A concurrent insert won the unique constraint. Its result is authoritative on retry.
        raise IdempotencyInProgressError from exc


def enqueue_outbox_event(
    *,
    aggregate_type: str,
    aggregate_id: UUID,
    event_type: str,
    idempotency_key: str,
    payload: dict[str, object],
) -> OutboxEvent:
    """Persist an event with the current transaction and schedule delivery after commit."""
    event, created = OutboxEvent.objects.get_or_create(
        event_type=event_type,
        idempotency_key=idempotency_key,
        defaults={
            "aggregate_type": aggregate_type,
            "aggregate_id": aggregate_id,
            "payload": payload,
        },
    )
    if created:
        transaction.on_commit(lambda: _queue_outbox_event(event.id))
    return event


def _queue_outbox_event(event_id: UUID) -> None:
    dispatch_outbox_event.delay(str(event_id))
