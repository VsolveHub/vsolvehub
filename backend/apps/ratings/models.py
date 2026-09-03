"""Two things a customer is asked after a job, kept apart on purpose.

`ServiceRating` is *"how was your partner"* — one participant's verdict on the other, feeding
aggregate marketplace trust. `PlatformFeedback` is *"how was Vsolve"* — the customer's verdict on
us, and it is a different question with different consequences, so it is a different table:

* a 5-star crew booked through a confusing checkout is `partner 5 / platform 2`, and one blended
  score would hide exactly the finding worth having;
* the partner's score is about a person and is moderated as such; ours is about our own product
  and nobody outside Vsolve ever reads it;
* the partner rating names a recipient. Platform feedback has none — it is addressed to us.

Both carry the `ServiceVariant` the work was for, resolved by the server and never asked for, so
Operations can read either one per service.

Ratings remain an append-only record and never an input to marketplace decisions.
"""

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
    #: Which catalogue service this work was for. Resolved by the server, never sent by a client.
    #:
    #: Nullable, and null is a real answer rather than a gap: a catalogue booking's visit can cover
    #: several cart items, and picking one of them would put a whole service's average on a job
    #: that was only partly about it. Unattributable feedback is counted as unattributable.
    variant = models.ForeignKey(
        "catalog.ServiceVariant",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="service_ratings",
    )
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
            models.Index(fields=("variant", "created_at")),
        ]

    def __str__(self) -> str:
        subject_id = self.booking_id or self.engagement_id
        return f"{subject_id}:{self.rater_role}:{self.score}"

    def save(self, *args: Any, **kwargs: Any) -> None:
        if not self._state.adding:
            raise ValueError("Service ratings are immutable.")
        super().save(*args, **kwargs)


class PlatformFeedback(models.Model):
    """What the customer thinks of Vsolve, asked once per completed job.

    ## Why chips rather than a text box

    The honest answer to "tell us more" is usually nothing. A free-text box collects a handful of
    articulate complaints and calls that the truth about a service, when the people who did not
    type are the majority and their silence is unreadable. Eight taps of a fixed vocabulary is a
    thing you can count per service; prose is a thing you can only read.

    The box is still there for the sentence the chips cannot hold, and it stays optional.

    ## Why the vocabulary is code, not rows

    A taxonomy an operator can edit is a taxonomy where last quarter's counts silently stop meaning
    what they said. The labels below are published by the API so a client never hardcodes them, and
    changing one is a code change that a reviewer can see.

    Every chip is about **us** -- the booking, the price, the app, the catalogue. Nothing here is
    about the partner; that question was already asked and it has its own table.

    ## Why the score may be absent

    A customer who taps "Pricing wasn't clear" and closes has told us the useful thing. Demanding a
    star first would lose that, so the score is nullable and the service refuses only the genuinely
    empty submission -- no score and no chips.
    """

    class Tag(models.TextChoices):
        #: Exclusive. Selected with anything else it is a contradiction, and the command refuses
        #: rather than quietly dropping one side -- a stored "all good, pricing unclear" is a row
        #: that makes every count it appears in slightly wrong.
        ALL_GOOD = "ALL_GOOD", "All good"
        HARD_TO_BOOK = "HARD_TO_BOOK", "Booking was confusing"
        PRICE_UNCLEAR = "PRICE_UNCLEAR", "Pricing wasn't clear"
        SLOW_MATCH = "SLOW_MATCH", "Took too long to find someone"
        POOR_UPDATES = "POOR_UPDATES", "I wasn't kept updated"
        PAYMENT_TROUBLE = "PAYMENT_TROUBLE", "Payment was a problem"
        APP_PROBLEM = "APP_PROBLEM", "The app was slow"
        #: The one chip that is a catalogue signal rather than a complaint. Concentrated on a single
        #: variant it says the listing promises something the service is not.
        WRONG_SERVICE = "WRONG_SERVICE", "What I picked wasn't what I needed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking = models.ForeignKey(
        "commerce.Booking",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="platform_feedback",
    )
    engagement = models.ForeignKey(
        "requirements.Engagement",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="platform_feedback",
    )
    #: The author. There is no `recipient`: this is addressed to Vsolve, which is exactly what
    #: makes it a different record from a rating and not another column on one.
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="platform_feedback_given",
    )
    #: Resolved by the server from the subject. See `ServiceRating.variant` for why it is nullable.
    variant = models.ForeignKey(
        "catalog.ServiceVariant",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="platform_feedback",
    )
    score = models.PositiveSmallIntegerField(null=True, blank=True)
    comment = models.CharField(max_length=280, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at", "id")
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(booking__isnull=False, engagement__isnull=True)
                    | models.Q(booking__isnull=True, engagement__isnull=False)
                ),
                name="ratings_platform_exactly_one_subject",
            ),
            models.CheckConstraint(
                condition=models.Q(score__isnull=True) | models.Q(score__gte=1, score__lte=5),
                name="ratings_platform_score_between_one_and_five",
            ),
            models.UniqueConstraint(
                fields=("booking", "customer"),
                condition=models.Q(booking__isnull=False),
                name="ratings_one_platform_feedback_per_booking",
            ),
            models.UniqueConstraint(
                fields=("engagement", "customer"),
                condition=models.Q(engagement__isnull=False),
                name="ratings_one_platform_feedback_per_engagement",
            ),
        ]
        indexes = [
            models.Index(fields=("variant", "created_at")),
        ]

    def __str__(self) -> str:
        subject_id = self.booking_id or self.engagement_id
        return f"{subject_id}:platform:{self.score or '-'}"

    def save(self, *args: Any, **kwargs: Any) -> None:
        if not self._state.adding:
            raise ValueError("Platform feedback is immutable.")
        super().save(*args, **kwargs)


class PlatformFeedbackTag(models.Model):
    """One chip on one submission.

    A row per chip rather than an array column on the parent, because the whole point of the
    Operations screen is "which of these, how many, for this service" -- which is a grouped count
    over a join here, and `unnest` gymnastics over an array. The unique constraint is what stops a
    double-tap becoming two votes.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    feedback = models.ForeignKey(
        PlatformFeedback,
        on_delete=models.CASCADE,
        related_name="tags",
    )
    code = models.CharField(max_length=32, choices=PlatformFeedback.Tag.choices)

    class Meta:
        ordering = ("code",)
        constraints = [
            models.UniqueConstraint(
                fields=("feedback", "code"),
                name="ratings_unique_platform_feedback_tag",
            ),
        ]
        indexes = [
            models.Index(fields=("code",)),
        ]

    def __str__(self) -> str:
        return f"{self.feedback_id}:{self.code}"
