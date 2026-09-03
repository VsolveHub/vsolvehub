"""Participant resolution, variant attribution, and immutable feedback submission."""

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from typing import Literal, cast
from uuid import UUID

from django.db import IntegrityError, transaction
from django.db.models import Avg, Count

from apps.catalog.models import ServiceVariant
from apps.commerce.models import Booking
from apps.identity.models import User
from apps.requirements.models import Engagement

from .exceptions import (
    FeedbackEmptyError,
    RatingAlreadySubmittedError,
    RatingNotFoundError,
    RatingNotReadyError,
    TagCombinationError,
)
from .models import PlatformFeedback, PlatformFeedbackTag, ServiceRating

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
        "variant": variant_for(context),
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


# ---------------------------------------------------------------------------
# Which service the work was for
# ---------------------------------------------------------------------------


def variant_for(context: RatingContext) -> ServiceVariant | None:
    """The catalogue service this job was, resolved server-side and never asked for.

    **Never a client input.** Feedback whose subject the rater chooses is feedback you cannot
    aggregate: the one person who cares enough to pick will pick the wrong thing, and every average
    it lands in is quietly off.

    An **engagement** always resolves — a request is raised against exactly one variant.

    A **catalogue booking** may not. Its visit is a `FulfilmentUnit`, whose lines can come from
    several cart items, and a visit that covered a deep clean and a tap repair is not evidence
    about either service on its own. When the lines agree, that is the variant; when they do not,
    the answer is `None`. Recorded honestly and counted separately rather than assigned to
    whichever line happened to be first.
    """
    if context.engagement is not None:
        requirement = context.engagement.requirement
        return requirement.variant if requirement is not None else None

    booking = context.booking
    unit = booking.fulfilment_unit if booking is not None else None
    if unit is None:
        return None
    variant_ids = {
        line.cart_item.variant_id
        for line in unit.lines.select_related("cart_item").all()
        if line.cart_item is not None
    }
    if len(variant_ids) != 1:
        return None
    return ServiceVariant.objects.filter(id=variant_ids.pop()).first()


# ---------------------------------------------------------------------------
# Platform feedback: what the customer thinks of us
# ---------------------------------------------------------------------------


def platform_feedback_for(context: RatingContext) -> PlatformFeedback | None:
    """This customer's own submission, or nothing. Never anybody else's."""
    lookup: dict[str, object] = {"customer": context.actor}
    if context.booking is not None:
        lookup["booking"] = context.booking
    else:
        lookup["engagement"] = context.engagement
    return PlatformFeedback.objects.filter(**lookup).prefetch_related("tags").first()


def can_submit_platform_feedback(context: RatingContext) -> bool:
    """Only the customer, only on finished work, only once.

    The partner is not asked. They have their own relationship with Vsolve and a question framed
    "how was your experience of this job" would collect a different thing under the same label.
    """
    if context.actor_role != ServiceRating.RaterRole.CUSTOMER:
        return False
    return is_rating_ready(context) and platform_feedback_for(context) is None


def submit_platform_feedback(
    *,
    context: RatingContext,
    score: int | None,
    tags: list[str],
    comment: str,
) -> tuple[PlatformFeedback, bool]:
    """Record one customer's verdict on Vsolve.

    Three refusals, each protecting a count somebody will later read:

    * **not the customer** — the partner is not asked this question at all;
    * **nothing said** — no score, no chips and no comment is not feedback, and storing it would
      put an empty row into every average;
    * **"All good" with a complaint** — a contradiction. Refused rather than silently resolved,
      because either half might be the one the customer meant.

    Re-sending an identical submission is the same success rather than a conflict; sending a
    *different* one is refused, exactly as `submit_rating` treats a second rating.
    """
    if context.actor_role != ServiceRating.RaterRole.CUSTOMER:
        raise RatingNotFoundError()
    if not is_rating_ready(context):
        raise RatingNotReadyError()

    cleaned_comment = comment.strip()
    codes = _validated_tags(tags)
    if score is None and not codes and not cleaned_comment:
        raise FeedbackEmptyError()

    existing = platform_feedback_for(context)
    if existing is not None:
        same = (
            existing.score == score
            and existing.comment == cleaned_comment
            and {tag.code for tag in existing.tags.all()} == set(codes)
        )
        if same:
            return existing, False
        raise RatingAlreadySubmittedError()

    try:
        with transaction.atomic():
            feedback = PlatformFeedback.objects.create(
                booking=context.booking,
                engagement=context.engagement,
                customer=context.actor,
                variant=variant_for(context),
                score=score,
                comment=cleaned_comment,
            )
            PlatformFeedbackTag.objects.bulk_create(
                PlatformFeedbackTag(feedback=feedback, code=code) for code in codes
            )
            return feedback, True
    except IntegrityError as exc:
        raise RatingAlreadySubmittedError() from exc


def _validated_tags(tags: list[str]) -> list[str]:
    """De-duplicated, known, and not self-contradictory."""
    codes = list(dict.fromkeys(tags))
    unknown = [code for code in codes if code not in PlatformFeedback.Tag.values]
    if unknown:
        raise TagCombinationError("We do not recognise one of those answers. Reload and try again.")
    if PlatformFeedback.Tag.ALL_GOOD in codes and len(codes) > 1:
        raise TagCombinationError('Choose "All good", or tell us what to improve — not both.')
    return codes


def platform_feedback_tag_options() -> list[dict[str, object]]:
    """The chip vocabulary, server-authored.

    Published rather than hardcoded in each app, for the same reason every other option list in
    this codebase is: two clients drifting from one taxonomy produces two sets of counts that look
    like one. `is_exclusive` is stated rather than inferred from the code, so a client never has to
    know that `ALL_GOOD` is the special one.
    """
    return [
        {
            "code": str(tag.value),
            "label": str(tag.label),
            "is_exclusive": tag == PlatformFeedback.Tag.ALL_GOOD,
        }
        for tag in PlatformFeedback.Tag
    ]


# ---------------------------------------------------------------------------
# What Operations reads: both verdicts, per service
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class TagCount:
    code: str
    label: str
    count: int


@dataclass(frozen=True, slots=True)
class ServiceFeedbackRow:
    """One catalogue service, with both scores side by side.

    **Both, never blended.** A service whose crews are rated 4.6 and whose platform experience is
    rated 3.1 is the finding: the people are fine and the product is not. One combined number
    averages that away, and the page exists to show it.

    `variant_id` is null on exactly one row -- the bucket for feedback whose booking covered more
    than one service. It is published rather than dropped, because "12 answers we cannot attribute"
    is a fact about the data an operator reading these averages needs.
    """

    variant_id: UUID | None
    variant_name: str
    service_name: str
    category_name: str
    partner_score: float | None
    partner_count: int
    platform_score: float | None
    platform_count: int
    tags: tuple[TagCount, ...]
    note_count: int


def service_feedback(*, since: datetime | None = None) -> list[ServiceFeedbackRow]:
    """Every service anybody has left feedback on, worst platform score first.

    Worst-first because that ordering is the reason to open the page. A service with no platform
    feedback at all sorts last rather than first: silence is not a bad score, and treating it as
    one would bury the services people actually complained about.
    """
    ratings = ServiceRating.objects.filter(rater_role=ServiceRating.RaterRole.CUSTOMER)
    feedback = PlatformFeedback.objects.all()
    if since is not None:
        ratings = ratings.filter(created_at__gte=since)
        feedback = feedback.filter(created_at__gte=since)

    partner_by_variant = {
        row["variant_id"]: row
        for row in ratings.values("variant_id").annotate(average=Avg("score"), total=Count("id"))
    }
    platform_by_variant = {
        row["variant_id"]: row
        for row in feedback.values("variant_id").annotate(average=Avg("score"), total=Count("id"))
    }
    notes_by_variant = {
        row["variant_id"]: row["total"]
        for row in feedback.exclude(comment="").values("variant_id").annotate(total=Count("id"))
    }
    tags_by_variant: dict[UUID | None, list[TagCount]] = defaultdict(list)
    tag_rows = (
        PlatformFeedbackTag.objects.filter(feedback__in=feedback)
        .values("feedback__variant_id", "code")
        .annotate(total=Count("id"))
        .order_by("-total")
    )
    labels = dict(PlatformFeedback.Tag.choices)
    for row in tag_rows:
        tags_by_variant[row["feedback__variant_id"]].append(
            TagCount(
                code=row["code"],
                label=str(labels.get(row["code"], row["code"])),
                count=row["total"],
            )
        )

    variant_ids = set(partner_by_variant) | set(platform_by_variant)
    named = {
        variant.id: variant
        for variant in ServiceVariant.objects.filter(
            id__in=[value for value in variant_ids if value is not None]
        ).select_related("service__subcategory__category")
    }

    rows: list[ServiceFeedbackRow] = []
    for variant_id in variant_ids:
        variant = named.get(variant_id) if variant_id is not None else None
        partner = partner_by_variant.get(variant_id, {})
        platform = platform_by_variant.get(variant_id, {})
        rows.append(
            ServiceFeedbackRow(
                variant_id=variant_id,
                variant_name=variant.name if variant else "Not attributed to a service",
                service_name=variant.service.name if variant else "",
                category_name=(variant.service.subcategory.category.name if variant else ""),
                partner_score=_rounded(partner.get("average")),
                partner_count=int(partner.get("total") or 0),
                platform_score=_rounded(platform.get("average")),
                platform_count=int(platform.get("total") or 0),
                tags=tuple(tags_by_variant.get(variant_id, [])),
                note_count=int(notes_by_variant.get(variant_id, 0)),
            )
        )

    # Unscored services sort last, and the unattributed bucket last of all: it is a data-quality
    # note rather than a service anybody can act on.
    rows.sort(
        key=lambda row: (
            row.variant_id is None,
            row.platform_score is None,
            row.platform_score or 0.0,
            row.variant_name,
        )
    )
    return rows


def service_feedback_notes(
    *, variant_id: UUID | None, since: datetime | None = None, limit: int = 100
) -> list[PlatformFeedback]:
    """Written notes for one service, newest first, each still joined to its own job.

    The partner rating is deliberately reachable from each note: *"platform 2, partner 5"* is the
    pattern worth acting on, and it is invisible when the two are read on separate screens.
    """
    query = PlatformFeedback.objects.filter(variant_id=variant_id).exclude(comment="")
    if since is not None:
        query = query.filter(created_at__gte=since)
    return list(
        query.select_related("engagement__partner", "booking__partner")
        .prefetch_related("tags")
        .order_by("-created_at")[:limit]
    )


def _rounded(value: object) -> float | None:
    return None if value is None else round(float(cast(float, value)), 1)
