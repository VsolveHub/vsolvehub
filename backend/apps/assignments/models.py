import uuid
from typing import Any

from django.conf import settings
from django.contrib.postgres.constraints import ExclusionConstraint
from django.contrib.postgres.fields import DateTimeRangeField, RangeOperators
from django.db import models
from django.db.models import Q
from django.utils import timezone

from apps.carts.models import CheckoutSession, FulfilmentUnit
from apps.partners.models import PartnerProfile


class AssignmentAttempt(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    checkout = models.ForeignKey(
        CheckoutSession,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="attempts",
    )
    fulfilment_unit = models.ForeignKey(
        FulfilmentUnit,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="assignment_attempts",
    )
    candidate = models.ForeignKey(PartnerProfile, on_delete=models.PROTECT)
    rank = models.PositiveSmallIntegerField()
    eligibility_snapshot = models.JSONField(default=dict)
    # Why this candidate was ordered where it was: the policy that ran, the pool it
    # considered, the factor that decided it, and a named reason for every Partner it
    # passed over. Operations-only — it is never merged into the Partner projection.
    ranking_snapshot = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("checkout", "fulfilment_unit", "rank")
        constraints = [
            models.UniqueConstraint(
                fields=("checkout", "candidate"),
                condition=Q(checkout__isnull=False),
                name="assignments_unique_checkout_candidate",
            ),
            models.UniqueConstraint(
                fields=("fulfilment_unit", "candidate"),
                condition=Q(fulfilment_unit__isnull=False),
                name="assignments_unique_unit_candidate",
            ),
            models.CheckConstraint(
                condition=(
                    Q(checkout__isnull=False, fulfilment_unit__isnull=True)
                    | Q(checkout__isnull=True, fulfilment_unit__isnull=False)
                ),
                name="assignments_attempt_exactly_one_scope",
            ),
        ]

    def __str__(self) -> str:
        scope_id = self.fulfilment_unit_id or self.checkout_id
        return f"{scope_id}:{self.rank}"


class Reservation(models.Model):
    class Status(models.TextChoices):
        TENTATIVE = "TENTATIVE", "Tentative"
        CONFIRMED = "CONFIRMED", "Confirmed"
        RELEASED = "RELEASED", "Released"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    checkout = models.OneToOneField(
        CheckoutSession,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="reservation",
    )
    # A `ForeignKey`, not a `OneToOneField`: a unit's Partner can be released and re-matched
    # (pre-payment recovery, and post-booking recovery in `apps.fulfilment`), and each attempt
    # leaves its own row behind rather than reusing one. `assignments_one_active_reservation_
    # per_unit` below is what actually enforces "at most one live reservation at a time" —
    # scoped to the active statuses, exactly like the Partner-overlap exclusion constraint.
    fulfilment_unit = models.ForeignKey(
        FulfilmentUnit,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="reservations",
    )
    # The third reservation scope, added for M2 revision 3 (`M2-BE-421`). An A5 plan visit books
    # a real slot on this grid rather than inventing a second availability notion, which is what
    # makes "a visit and an A1 booking cannot double-book the same Partner" true *by construction*
    # — `assignments_active_reservation_no_overlap` below already forbids the overlap, and it does
    # not care which scope a reservation came from.
    #
    # A lazy `"requirements.SiteVisit"` reference on purpose: `apps.requirements` imports
    # `apps.carts.availability`, which imports this module, so a real import here would close a
    # cycle. The string form keeps the dependency one-directional at import time and lets the
    # migration graph carry it instead.
    site_visit = models.ForeignKey(
        "requirements.SiteVisit",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="reservations",
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
            ),
            models.CheckConstraint(
                condition=(
                    Q(checkout__isnull=False, fulfilment_unit__isnull=True, site_visit__isnull=True)
                    | Q(
                        checkout__isnull=True,
                        fulfilment_unit__isnull=False,
                        site_visit__isnull=True,
                    )
                    | Q(
                        checkout__isnull=True,
                        fulfilment_unit__isnull=True,
                        site_visit__isnull=False,
                    )
                ),
                name="assignments_reservation_exactly_one_scope",
            ),
            models.UniqueConstraint(
                fields=("fulfilment_unit",),
                condition=Q(status__in=("TENTATIVE", "CONFIRMED")),
                name="assignments_one_active_reservation_per_unit",
            ),
            # The site-visit twin of the rule above. A visit that is rescheduled releases its old
            # hold and takes a new one; two live holds for one visit would occupy a Partner twice.
            models.UniqueConstraint(
                fields=("site_visit",),
                condition=Q(status__in=("TENTATIVE", "CONFIRMED"), site_visit__isnull=False),
                name="assignments_one_active_reservation_per_site_visit",
            ),
        ]

    def __str__(self) -> str:
        scope_id = self.fulfilment_unit_id or self.checkout_id
        return f"{scope_id}:{self.partner_id}:{self.status}"

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
    checkout = models.ForeignKey(
        CheckoutSession,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="offers",
    )
    fulfilment_unit = models.ForeignKey(
        FulfilmentUnit,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="offers",
    )
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
    partner_projection_snapshot = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    responded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("created_at", "id")
        constraints = [
            models.UniqueConstraint(
                fields=("checkout",),
                condition=Q(
                    checkout__isnull=False,
                    status__in=("OFFERED", "ACCEPTED_PENDING_UNDO"),
                ),
                name="assignments_one_live_offer_per_checkout",
            ),
            models.UniqueConstraint(
                fields=("fulfilment_unit",),
                condition=Q(
                    fulfilment_unit__isnull=False,
                    status__in=("OFFERED", "ACCEPTED_PENDING_UNDO"),
                ),
                name="assignments_one_live_offer_per_unit",
            ),
            models.CheckConstraint(
                condition=(
                    Q(checkout__isnull=False, fulfilment_unit__isnull=True)
                    | Q(checkout__isnull=True, fulfilment_unit__isnull=False)
                ),
                name="assignments_offer_exactly_one_scope",
            ),
        ]

    def __str__(self) -> str:
        scope_id = self.fulfilment_unit_id or self.checkout_id
        return f"{scope_id}:{self.partner_id}:{self.status}"


class DispatchCommandAudit(models.Model):
    """Immutable evidence of an Operations override on autonomous dispatch.

    Revoking an offer takes work away from a Partner who may already be travelling to it,
    and releasing a hold frees capacity a Customer believes they have. Neither is
    reconstructable from the resulting state — a `REVOKED` offer looks the same whether an
    agent revoked it or group compensation did. This row is the only record of who decided,
    why, and what the unit looked like on either side of the decision.
    """

    class Command(models.TextChoices):
        REVOKE_OFFER = "REVOKE_OFFER", "Revoke offer"
        RELEASE_RESERVATION = "RELEASE_RESERVATION", "Release reservation"
        RECOVER_UNIT = "RECOVER_UNIT", "Recover fulfilment unit"

    class Reason(models.TextChoices):
        PARTNER_UNREACHABLE = "PARTNER_UNREACHABLE", "Partner unreachable"
        CUSTOMER_REQUEST = "CUSTOMER_REQUEST", "Customer request"
        SAFETY_CONCERN = "SAFETY_CONCERN", "Safety concern"
        DUPLICATE_DISPATCH = "DUPLICATE_DISPATCH", "Duplicate dispatch"
        STUCK_DISPATCH = "STUCK_DISPATCH", "Stuck dispatch"
        OPERATIONS_ERROR = "OPERATIONS_ERROR", "Operations error"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="dispatch_commands_issued",
    )
    command = models.CharField(max_length=32, choices=Command.choices)
    reason = models.CharField(max_length=32, choices=Reason.choices)
    note = models.CharField(max_length=500, blank=True)
    fulfilment_unit = models.ForeignKey(
        FulfilmentUnit,
        on_delete=models.PROTECT,
        related_name="dispatch_command_audits",
    )
    offer = models.ForeignKey(
        PartnerOffer,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="dispatch_command_audits",
    )
    reservation = models.ForeignKey(
        Reservation,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="dispatch_command_audits",
    )
    idempotency_key = models.CharField(max_length=128)
    unit_version_before = models.PositiveIntegerField()
    before_state = models.JSONField(default=dict)
    after_state = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at", "-id")
        indexes = [models.Index(fields=("fulfilment_unit", "created_at"))]

    def __str__(self) -> str:
        return f"{self.fulfilment_unit_id}:{self.command}:{self.created_at.isoformat()}"

    def save(self, *args: Any, **kwargs: Any) -> None:
        """Refuse any write that is not the original insert.

        Audit evidence that can be edited is not evidence. The database has no rewrite
        path either — nothing in this app updates these rows — and this makes an
        accidental one fail loudly rather than silently rewriting history.
        """
        if not self._state.adding:
            raise ValueError("Dispatch command audit rows are immutable.")
        super().save(*args, **kwargs)
