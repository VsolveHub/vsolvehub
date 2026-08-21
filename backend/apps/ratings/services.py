"""Participant resolution and immutable rating submission."""

from dataclasses import dataclass
from typing import Literal
from uuid import UUID

from django.db import IntegrityError, transaction

from apps.commerce.models import Booking
from apps.identity.models import User
from apps.requirements.models import Engagement

from .exceptions import (
    RatingAlreadySubmittedError,
    RatingNotFoundError,
    RatingNotReadyError,
)
from .models import ServiceRating

SubjectKind = Literal["CATALOG_BOOKING", "ENGAGEMENT"]


@dataclass(frozen=True, slots=True)
class RatingContext:
    subject_kind: SubjectKind
    subject_id: UUID
    actor: User
    recipient: User
    actor_role: str
    counterparty_label: str
    booking: Booking | None = None
    engagement: Engagement | None = None


def booking_rating_context(*, booking_id: UUID, actor: User) -> RatingContext:
    booking = (
        Booking.objects.select_related("customer", "partner__user").filter(id=booking_id).first()
    )
    if booking is None:
        raise RatingNotFoundError()
    if actor.id == booking.customer_id:
        return RatingContext(
            subject_kind="CATALOG_BOOKING",
            subject_id=booking.id,
            actor=actor,
            recipient=booking.partner.user,
            actor_role=ServiceRating.RaterRole.CUSTOMER,
            counterparty_label=booking.partner.display_name,
            booking=booking,
        )
    if actor.id == booking.partner.user_id:
        label = booking.customer.full_name.strip() or "Customer"
        return RatingContext(
            subject_kind="CATALOG_BOOKING",
            subject_id=booking.id,
            actor=actor,
            recipient=booking.customer,
            actor_role=ServiceRating.RaterRole.PARTNER,
            counterparty_label=label,
            booking=booking,
        )
    raise RatingNotFoundError()


def engagement_rating_context(*, engagement_id: UUID, actor: User) -> RatingContext:
    engagement = (
        Engagement.objects.select_related("customer", "partner__user")
        .filter(id=engagement_id)
        .first()
    )
    if engagement is None:
        raise RatingNotFoundError()
    if actor.id == engagement.customer_id:
        return RatingContext(
            subject_kind="ENGAGEMENT",
            subject_id=engagement.id,
            actor=actor,
            recipient=engagement.partner.user,
            actor_role=ServiceRating.RaterRole.CUSTOMER,
            counterparty_label=engagement.partner.display_name,
            engagement=engagement,
        )
    if actor.id == engagement.partner.user_id:
        label = engagement.customer.full_name.strip() or "Customer"
        return RatingContext(
            subject_kind="ENGAGEMENT",
            subject_id=engagement.id,
            actor=actor,
            recipient=engagement.customer,
            actor_role=ServiceRating.RaterRole.PARTNER,
            counterparty_label=label,
            engagement=engagement,
        )
    raise RatingNotFoundError()


def is_rating_ready(context: RatingContext) -> bool:
    if context.booking is not None:
        return context.booking.status in (
            Booking.Status.COMPLETED,
            Booking.Status.PARTIALLY_COMPLETED,
        )
    engagement = context.engagement
    if engagement is None:
        return False
    return engagement.status in (
        Engagement.Status.COMPLETED,
        Engagement.Status.WARRANTY,
        Engagement.Status.CLOSED,
    )


def ratings_for(context: RatingContext) -> list[ServiceRating]:
    query = ServiceRating.objects.select_related("rater")
    if context.booking is not None:
        query = query.filter(booking=context.booking)
    else:
        query = query.filter(engagement=context.engagement)
    return list(query.order_by("created_at", "id"))


def submit_rating(
    *, context: RatingContext, score: int, comment: str
) -> tuple[ServiceRating, bool]:
    if not is_rating_ready(context):
        raise RatingNotReadyError()
    values = {
        "rater": context.actor,
        "recipient": context.recipient,
        "rater_role": context.actor_role,
        "score": score,
        "comment": comment.strip(),
        "booking": context.booking,
        "engagement": context.engagement,
    }
    lookup: dict[str, object] = {"rater": context.actor}
    if context.booking is not None:
        lookup["booking"] = context.booking
    else:
        lookup["engagement"] = context.engagement
    existing = ServiceRating.objects.filter(**lookup).first()
    if existing is not None:
        if existing.score == score and existing.comment == comment.strip():
            return existing, False
        raise RatingAlreadySubmittedError()
    try:
        with transaction.atomic():
            return ServiceRating.objects.create(**values), True
    except IntegrityError as exc:
        raise RatingAlreadySubmittedError() from exc
