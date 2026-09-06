"""Background Celery tasks and sweeps for Stays & Accommodations (A9_STAY).

Implements §10.1 & M3-BE-341:
- sweep_expired_tentative_holds: Releases expired 15-min calendar holds.
- sweep_no_show_reservations: Auto-transitions un-checked-in stays past grace period to NO_SHOW.
"""

import datetime
import logging
from datetime import timedelta

from celery import shared_task
from django.db import models, transaction
from django.utils import timezone

from apps.commerce.models import PaymentAttempt, Refund
from apps.commerce.services.refunds import request_standalone_refund
from apps.foundation.services import enqueue_outbox_event
from apps.notifications.models import NotificationIntent
from apps.notifications.services import request_notification
from apps.payouts.models import PartnerLedgerEntry
from apps.stays.models import StayDepositTransaction, StayReservation, UnitReservation

logger = logging.getLogger(__name__)


def _payment_attempt_refunded_paise(attempt: PaymentAttempt | None) -> int:
    if not attempt:
        return 0
    refunds_sum = (
        attempt.refunds.exclude(status=Refund.Status.FAILED).aggregate(models.Sum("amount_paise"))[
            "amount_paise__sum"
        ]
        or 0
    )
    alloc_sum = 0
    if hasattr(attempt, "stay_allocations"):
        alloc_sum = (
            attempt.stay_allocations.aggregate(models.Sum("refunded_paise"))["refunded_paise__sum"]
            or 0
        )
    return max(int(refunds_sum), int(alloc_sum))


@shared_task(name="apps.stays.tasks.sweep_expired_tentative_holds")
def sweep_expired_tentative_holds() -> int:
    """Find and release tentative holds whose TTL has expired."""
    now = timezone.now()
    with transaction.atomic():
        expired_holds = UnitReservation.objects.filter(
            status=UnitReservation.Status.TENTATIVE,
            expires_at__lt=now,
        )
        expired_hold_ids = list(expired_holds.values_list("id", flat=True))
        count = len(expired_hold_ids)
        if count > 0:
            UnitReservation.objects.filter(id__in=expired_hold_ids).update(
                status=UnitReservation.Status.RELEASED,
                released_at=now,
            )
            StayReservation.objects.filter(
                calendar_hold_id__in=expired_hold_ids,
                status__in=(StayReservation.Status.HELD, StayReservation.Status.PAYMENT_PENDING),
            ).update(status=StayReservation.Status.EXPIRED, updated_at=now)
            logger.info("Released %d expired stay holds.", count)
    return count


@shared_task(name="apps.stays.tasks.sweep_no_show_reservations")
def sweep_no_show_reservations() -> int:
    """Sweep confirmed reservations where check-in date + grace period elapsed without arrival."""
    now = timezone.now()
    with transaction.atomic():
        candidates = (
            StayReservation.objects.select_for_update(of=("self",), skip_locked=True)
            .filter(
                status=StayReservation.Status.CONFIRMED,
                start_date__lte=now.date(),
            )
            .select_related("unit__property")
        )
        no_shows = []
        for res in candidates:
            policy = res.unit.property.get_active_policy(res.start_date)
            if policy is None:
                logger.error("No effective policy for stay reservation %s", res.id)
                continue
            check_in_time = datetime.time.fromisoformat(
                res.policy_snapshot.get("check_in_time", str(policy.check_in_time))
            )
            deadline = timezone.make_aware(
                datetime.datetime.combine(res.start_date, check_in_time)
            ) + timedelta(
                minutes=int(
                    res.policy_snapshot.get("no_show_grace_minutes", policy.no_show_grace_minutes)
                )
            )
            if deadline <= now:
                no_shows.append(res)
        count = len(no_shows)
        for res in no_shows:
            res.status = StayReservation.Status.NO_SHOW
            res.notes += (
                f" [Auto-transitioned to NO_SHOW on {now.date()}: "
                "grace period elapsed with no arrival]"
            )
            res.save(update_fields=["status", "notes", "updated_at"])

            if res.calendar_hold_id:
                UnitReservation.objects.filter(id=res.calendar_hold_id).update(
                    status=UnitReservation.Status.RELEASED,
                    released_at=now,
                )

            first_night_bps = int(
                res.policy_snapshot.get(
                    "no_show_first_night_charge_basis_points",
                    policy.no_show_first_night_charge_basis_points,
                )
            )
            deposit_forfeit_bps = int(
                res.policy_snapshot.get(
                    "no_show_deposit_forfeit_basis_points",
                    policy.no_show_deposit_forfeit_basis_points,
                )
            )
            first_night = round(
                (res.base_amount_paise / max(1, res.total_nights)) * first_night_bps / 10000
            )
            deposit_forfeit = round(
                res.deposit.authorized_amount_paise * deposit_forfeit_bps / 10000
            )
            price_attempt = (
                PaymentAttempt.objects.filter(
                    purpose=PaymentAttempt.Purpose.A9_STAY_RESERVATION,
                    stay_allocations__stay_reservation_line__stay_reservation=res,
                    status__in=(
                        PaymentAttempt.Status.CAPTURED,
                        PaymentAttempt.Status.PARTIALLY_REFUNDED,
                    ),
                )
                .distinct()
                .first()
            )
            price_refund = max(
                0,
                (
                    price_attempt.amount_paise
                    - _payment_attempt_refunded_paise(price_attempt)
                    - first_night
                    if price_attempt
                    else 0
                ),
            )
            if price_refund > 0 and price_attempt:
                request_standalone_refund(
                    payment_attempt_id=price_attempt.id,
                    amount_paise=price_refund,
                    reason_code="stay_no_show_unused_tariff",
                    idempotency_key=f"stay-no-show-price:{res.id}",
                )
            deposit_attempt = (
                PaymentAttempt.objects.filter(
                    purpose=PaymentAttempt.Purpose.A9_DEPOSIT_HOLD,
                    stay_allocations__stay_reservation_line__stay_reservation=res,
                    status__in=(
                        PaymentAttempt.Status.CAPTURED,
                        PaymentAttempt.Status.PARTIALLY_REFUNDED,
                    ),
                )
                .distinct()
                .first()
            )
            deposit_refund_target = max(0, res.deposit.authorized_amount_paise - deposit_forfeit)
            deposit_refund = max(
                0,
                deposit_refund_target - _payment_attempt_refunded_paise(deposit_attempt),
            )
            if deposit_refund > 0 and deposit_attempt:
                request_standalone_refund(
                    payment_attempt_id=deposit_attempt.id,
                    amount_paise=deposit_refund,
                    reason_code="stay_no_show_deposit_release",
                    idempotency_key=f"stay-no-show-deposit:{res.id}",
                )
            if res.deposit.authorized_amount_paise > 0:
                res.deposit.consumed_amount_paise = deposit_forfeit
                res.deposit.refunded_amount_paise = deposit_refund_target
                res.deposit.status = (
                    res.deposit.Status.FULLY_CONSUMED
                    if res.deposit.refunded_amount_paise == 0
                    else (
                        res.deposit.Status.RELEASED
                        if deposit_forfeit == 0
                        else res.deposit.Status.PARTIALLY_CONSUMED
                    )
                )
                res.deposit.save(
                    update_fields=(
                        "consumed_amount_paise",
                        "refunded_amount_paise",
                        "status",
                        "updated_at",
                    )
                )
                if deposit_forfeit > 0:
                    StayDepositTransaction.objects.create(
                        deposit=res.deposit,
                        kind=StayDepositTransaction.Kind.CONSUMPTION,
                        amount_paise=deposit_forfeit,
                        reason="Configured no-show deposit forfeiture",
                    )
                if deposit_refund > 0:
                    StayDepositTransaction.objects.create(
                        deposit=res.deposit,
                        kind=StayDepositTransaction.Kind.REFUND,
                        amount_paise=deposit_refund,
                        reason="Configured no-show deposit release",
                    )
            if first_night > 0:
                commission = first_night * 1000 // 10000
                PartnerLedgerEntry.objects.get_or_create(
                    idempotency_key=f"stay_no_show_earning_{res.id}",
                    defaults={
                        "partner": res.unit.property.partner,
                        "stay_reservation": res,
                        "kind": PartnerLedgerEntry.Kind.EARNING,
                        "status": PartnerLedgerEntry.Status.AVAILABLE,
                        "gross_paise": first_night,
                        "commission_paise": commission,
                        "net_paise": first_night - commission,
                        "calculation_snapshot": {
                            "first_night_charge_basis_points": first_night_bps,
                            "deposit_forfeit_basis_points": deposit_forfeit_bps,
                        },
                        "reason": "Configured no-show first-night charge",
                    },
                )
            enqueue_outbox_event(
                aggregate_type="StayReservation",
                aggregate_id=res.id,
                event_type="stay_reservation.no_show",
                idempotency_key=f"stay_reservation_no_show:{res.id}",
                payload={
                    "reservation_id": str(res.id),
                    "customer_id": str(res.customer_id),
                    "first_night_charge_paise": first_night,
                    "deposit_forfeit_paise": deposit_forfeit,
                    "status": res.status,
                },
            )
            request_notification(
                recipient_id=res.customer_id,
                purpose="stay.no_show",
                channel=NotificationIntent.Channel.IN_APP,
                template_code="stay_no_show_customer",
                context={
                    "reservation_id": str(res.id),
                    "first_night_charge_paise": first_night,
                    "deposit_forfeit_paise": deposit_forfeit,
                },
                idempotency_key=f"stay-no-show:{res.id}",
            )
        if count > 0:
            logger.info("Transitioned %d reservations to NO_SHOW.", count)
    return count
