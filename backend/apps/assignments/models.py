import uuid

from django.contrib.postgres.constraints import ExclusionConstraint
from django.contrib.postgres.fields import DateTimeRangeField, RangeOperators
from django.db import models
from django.db.models import Q
from django.utils import timezone

from apps.carts.models import CheckoutSession
from apps.partners.models import PartnerProfile


class AssignmentAttempt(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    checkout = models.ForeignKey(CheckoutSession, on_delete=models.PROTECT, related_name="attempts")
    candidate = models.ForeignKey(PartnerProfile, on_delete=models.PROTECT)
    rank = models.PositiveSmallIntegerField()
    eligibility_snapshot = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("checkout", "rank")
        constraints = [
            models.UniqueConstraint(
                fields=("checkout", "candidate"), name="assignments_unique_checkout_candidate"
            )
        ]

    def __str__(self) -> str:
        return f"{self.checkout_id}:{self.rank}"


class Reservation(models.Model):
    class Status(models.TextChoices):
        TENTATIVE = "TENTATIVE", "Tentative"
        CONFIRMED = "CONFIRMED", "Confirmed"
        RELEASED = "RELEASED", "Released"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    checkout = models.OneToOneField(
        CheckoutSession, on_delete=models.PROTECT, related_name="reservation"
    )
    partner = models.ForeignKey(
        PartnerProfile, on_delete=models.PROTECT, related_name="reservations"
    )
    occupied_range = DateTimeRangeField()
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.TENTATIVE)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    released_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            ExclusionConstraint(
                name="assignments_active_reservation_no_overlap",
                expressions=[
                    ("partner", RangeOperators.EQUAL),
                    ("occupied_range", RangeOperators.OVERLAPS),
                ],
                condition=Q(status__in=("TENTATIVE", "CONFIRMED")),
            )
        ]

    def __str__(self) -> str:
        return f"{self.checkout_id}:{self.partner_id}:{self.status}"

    def release(self) -> None:
        self.status = self.Status.RELEASED
        self.released_at = timezone.now()
        self.save(update_fields=("status", "released_at"))


class PartnerOffer(models.Model):
    class Status(models.TextChoices):
        OFFERED = "OFFERED", "Offered"
        ACCEPTED_PENDING_UNDO = "ACCEPTED_PENDING_UNDO", "Accepted pending undo"
        COMMITTED = "COMMITTED", "Committed"
        UNDONE = "UNDONE", "Undone"
        DECLINED = "DECLINED", "Declined"
        EXPIRED = "EXPIRED", "Expired"
        REVOKED = "REVOKED", "Revoked"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    checkout = models.ForeignKey(CheckoutSession, on_delete=models.PROTECT, related_name="offers")
    partner = models.ForeignKey(PartnerProfile, on_delete=models.PROTECT, related_name="offers")
    attempt = models.OneToOneField(
        AssignmentAttempt, on_delete=models.PROTECT, related_name="offer"
    )
    status = models.CharField(max_length=28, choices=Status.choices, default=Status.OFFERED)
    expires_at = models.DateTimeField()
    undo_deadline = models.DateTimeField(null=True, blank=True)
    reservation = models.OneToOneField(
        Reservation, null=True, blank=True, on_delete=models.PROTECT, related_name="offer"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    responded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("created_at", "id")
        constraints = [
            models.UniqueConstraint(
                fields=("checkout",),
                condition=Q(status__in=("OFFERED", "ACCEPTED_PENDING_UNDO")),
                name="assignments_one_live_offer_per_checkout",
            )
        ]

    def __str__(self) -> str:
        return f"{self.checkout_id}:{self.partner_id}:{self.status}"
