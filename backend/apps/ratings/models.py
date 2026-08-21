"""Ratings are an append-only record, never an input to marketplace decisions."""

import uuid
from typing import Any

from django.conf import settings
from django.db import models


class ServiceRating(models.Model):
    """One participant's rating of the other after completed work.

    Exactly one of ``booking`` and ``engagement`` owns the row. The database also
    prevents a participant from rating the same piece of work twice. No aggregate
    score is stored deliberately: matching, ranking and eligibility must not gain
    an accidental dependency on this feedback table.
    """

    class RaterRole(models.TextChoices):
        CUSTOMER = "CUSTOMER", "Customer"
        PARTNER = "PARTNER", "Partner"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking = models.ForeignKey(
        "commerce.Booking",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="service_ratings",
    )
    engagement = models.ForeignKey(
        "requirements.Engagement",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="service_ratings",
    )
    rater = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="service_ratings_given",
    )
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="service_ratings_received",
    )
    rater_role = models.CharField(max_length=12, choices=RaterRole.choices)
    score = models.PositiveSmallIntegerField()
    comment = models.CharField(max_length=280, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("created_at", "id")
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(booking__isnull=False, engagement__isnull=True)
                    | models.Q(booking__isnull=True, engagement__isnull=False)
                ),
                name="ratings_exactly_one_subject",
            ),
            models.CheckConstraint(
                condition=models.Q(score__gte=1, score__lte=5),
                name="ratings_score_between_one_and_five",
            ),
            models.CheckConstraint(
                condition=~models.Q(rater=models.F("recipient")),
                name="ratings_rater_is_not_recipient",
            ),
            models.UniqueConstraint(
                fields=("booking", "rater"),
                condition=models.Q(booking__isnull=False),
                name="ratings_one_per_rater_booking",
            ),
            models.UniqueConstraint(
                fields=("engagement", "rater"),
                condition=models.Q(engagement__isnull=False),
                name="ratings_one_per_rater_engagement",
            ),
        ]
        indexes = [
            models.Index(fields=("recipient", "created_at")),
        ]

    def __str__(self) -> str:
        subject_id = self.booking_id or self.engagement_id
        return f"{subject_id}:{self.rater_role}:{self.score}"

    def save(self, *args: Any, **kwargs: Any) -> None:
        if not self._state.adding:
            raise ValueError("Service ratings are immutable.")
        super().save(*args, **kwargs)
