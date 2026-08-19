"""Transaction, idempotency and outbox command conventions."""

import hashlib
import json
import logging
from collections.abc import Callable
from dataclasses import dataclass
from typing import TypeVar, cast
from uuid import UUID

from django.contrib.auth.models import AbstractBaseUser
from django.core.serializers.json import DjangoJSONEncoder
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.foundation.exceptions import IdempotencyInProgressError, IdempotencyKeyReuseError
from apps.foundation.models import IdempotencyRecord, OutboxEvent
from apps.foundation.tasks import dispatch_outbox_event

ResponseBody = dict[str, object] | list[object] | None
Result = TypeVar("Result")
logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class CommandResult:
    status_code: int
    body: ResponseBody
    replayed: bool = False


def _storable(body: ResponseBody) -> ResponseBody:
    """The response as the client will actually receive it, and as a `JSONField` can hold it.

    ## The bug this closes

    A DRF serializer's `.data` is **not** JSON — it is a mapping that the JSON *renderer* knows how
    to finish. A `PrimaryKeyRelatedField` over a UUID primary key yields a `uuid.UUID` object, and
    almost every serializer in this codebase has one. The renderer turns it into a string on the
    way out of the view, so the response was always correct; `IdempotencyRecord.response_body` is a
    plain `JSONField`, which encodes with the stdlib encoder, and that raises
    `TypeError: Object of type UUID is not JSON serializable`.

    The failure lands *after* the command has done its work and inside the same transaction, so the
    domain write is rolled back and the caller is handed `internal_error` for a command that was
    otherwise completely successful. `POST /api/v1/proposals/` failed exactly this way: the
    `Proposal` was created, the record could not be stored, and the vendor could not submit a quote
    at all.

    ## Why it is normalised here rather than in each serializer

    Every state-changing command in the product passes through `execute_idempotent`, and any one of
    them returning a UUID, a `datetime` or a `Decimal` would fail the same way — a landmine armed by
    a field type, disarmed only by whether that endpoint happens to be exercised. One conversion at
    the boundary fixes every caller at once and cannot be forgotten by the next one.

    ## Why a round trip rather than an encoder on the field

    `DjangoJSONEncoder` on the column would store it, but the *replay* would then have to match what
    the first caller received — and the first caller received the renderer's output. Encoding and
    decoding here makes the stored body byte-identical to the response that was sent, so a replayed
    command answers exactly what the original did. That is the whole promise of an idempotency
    record, and it was quietly untrue for any body the encoder happened to survive.
    """

    if body is None:
        return None
    return cast(ResponseBody, json.loads(json.dumps(body, cls=DjangoJSONEncoder)))


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
            body = _storable(body)
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
    try:
        dispatch_outbox_event.delay(str(event_id))
    except Exception:
        # The domain transaction has already committed. A broker outage should leave the durable
        # outbox row for recovery, not turn the user's successful action into a 500 response.
        logger.exception(
            "Outbox event could not be queued; recovery will retry it.",
            extra={"outbox_event_id": str(event_id)},
        )
