"""V Coins loyalty services and burn math (ADR-0010)."""

from datetime import timedelta
from math import floor
from uuid import UUID

from django.db import transaction
from django.db.models import F, Q, Sum
from django.utils import timezone

from apps.commerce.models import PaymentAttempt
from apps.identity.models import User
from apps.loyalty.models import (
    CoinBurnPolicy,
    CoinGrant,
    CoinGrantRule,
    CoinTransaction,
    CustomerCompletion,
)


class InsufficientCoinsError(Exception):
    """Raised when an attempted burn exceeds spendable coins."""


def get_active_burn_policy() -> CoinBurnPolicy:
    """Retrieve the active coin burn policy or fallback default."""
    policy = CoinBurnPolicy.objects.filter(is_active=True).order_by("-effective_from").first()
    if policy is None:
        policy = CoinBurnPolicy.objects.create(
            max_burn_percent=30,
            coin_value_paise=10,  # 1 coin = 10 paise (₹0.10)
            is_active=True,
        )
    return policy


def get_customer_coin_balances(user: User) -> dict[str, int]:
    """Return customer coin buckets: spendable, promised, locked, expiring_soon."""
    now = timezone.now()
    soon = now + timedelta(days=30)

    spendable = (
        CoinGrant.objects.filter(
            customer=user,
            status=CoinGrant.Status.UNLOCKED,
        ).aggregate(total=Sum("spendable_coins"))["total"]
        or 0
    )

    locked = (
        CoinGrant.objects.filter(
            customer=user,
            status=CoinGrant.Status.PROMISED,
        ).aggregate(total=Sum("locked_coins"))["total"]
        or 0
    )

    expiring_soon = (
        CoinGrant.objects.filter(
            customer=user,
            status=CoinGrant.Status.UNLOCKED,
            expires_at__isnull=False,
            expires_at__lte=soon,
            expires_at__gt=now,
        ).aggregate(total=Sum("spendable_coins"))["total"]
        or 0
    )

    return {
        "spendable_coins": spendable,
        "promised_coins": locked,
        "locked_coins": locked,
        "expiring_soon_coins": expiring_soon,
    }


def calculate_coin_burn(
    *,
    order_payable_paise: int,
    requested_coins: int,
    spendable_coins: int,
) -> dict[str, int]:
    """Calculate server-authoritative burn amount and discount."""
    policy = get_active_burn_policy()

    # Server math per §2.1
    max_burn_paise = floor(order_payable_paise * policy.max_burn_percent / 100)
    max_burn_coins = max_burn_paise // policy.coin_value_paise if policy.coin_value_paise > 0 else 0

    applied_coins = max(0, min(requested_coins, spendable_coins, max_burn_coins))
    discount_paise = applied_coins * policy.coin_value_paise
    discount_paise = min(discount_paise, order_payable_paise)
    remaining_paise = max(0, order_payable_paise - discount_paise)

    return {
        "order_payable_paise": order_payable_paise,
        "spendable_coins": spendable_coins,
        "max_burn_paise": max_burn_paise,
        "max_burn_coins": max_burn_coins,
        "applied_burn_coins": applied_coins,
        "discount_paise": discount_paise,
        "remaining_payable_paise": remaining_paise,
    }


def _check_eligibility(user: User, rule: CoinGrantRule) -> bool:
    """Evaluate whether user qualifies under rule customer_eligibility."""
    if rule.customer_eligibility == CoinGrantRule.CustomerEligibility.ALL_CUSTOMERS:
        return True

    completion_count = CustomerCompletion.objects.filter(customer=user).count()

    if rule.customer_eligibility == CoinGrantRule.CustomerEligibility.NEW_CUSTOMER:
        return completion_count == 0

    if rule.customer_eligibility == CoinGrantRule.CustomerEligibility.EXISTING_CUSTOMER:
        return completion_count >= 1

    if rule.customer_eligibility == CoinGrantRule.CustomerEligibility.REACTIVATED_CUSTOMER:
        last_completion = (
            CustomerCompletion.objects.filter(customer=user).order_by("-completed_at").first()
        )
        if last_completion is None:
            return False
        cutoff = timezone.now() - timedelta(days=rule.reactivation_inactive_days)
        return last_completion.completed_at < cutoff

    return True


@transaction.atomic
def grant_coins(
    *,
    customer: User,
    trigger: str,
    order_payable_paise: int | None = None,
    sequence_n: int | None = None,
) -> list[CoinGrant]:
    """Evaluate rules and grant coins to customer for a specific trigger."""
    rules = CoinGrantRule.objects.filter(is_active=True, grant_trigger=trigger)
    grants = []

    for rule in rules:
        if not _check_eligibility(customer, rule):
            continue

        # Evaluate earn mode
        amount = 0
        if rule.earn_mode == CoinGrantRule.EarnMode.FLAT:
            amount = rule.coins_amount
        elif (
            rule.earn_mode == CoinGrantRule.EarnMode.TIERED_ORDER_VALUE
            and order_payable_paise is not None
        ):
            tier = (
                rule.tiers.filter(
                    Q(min_order_paise__isnull=True) | Q(min_order_paise__lte=order_payable_paise),
                    Q(max_order_paise__isnull=True) | Q(max_order_paise__gte=order_payable_paise),
                )
                .order_by("-sort_order")
                .first()
            )
            if tier:
                amount = tier.coins_amount
        elif (
            rule.earn_mode == CoinGrantRule.EarnMode.TIERED_BOOKING_SEQUENCE
            and sequence_n is not None
        ):
            tier = (
                rule.tiers.filter(
                    Q(min_booking_sequence__isnull=True) | Q(min_booking_sequence__lte=sequence_n),
                    Q(max_booking_sequence__isnull=True) | Q(max_booking_sequence__gte=sequence_n),
                )
                .order_by("-sort_order")
                .first()
            )
            if tier:
                amount = tier.coins_amount

        if amount <= 0:
            continue

        # Create promised or spendable grant
        if rule.completions_required == 0:
            status = CoinGrant.Status.UNLOCKED
            locked = 0
            spendable = amount
        else:
            status = CoinGrant.Status.PROMISED
            locked = amount
            spendable = 0

        grant = CoinGrant.objects.create(
            customer=customer,
            rule=rule,
            coins_amount=amount,
            locked_coins=locked,
            spendable_coins=spendable,
            expires_at=rule.expires_at,
            status=status,
        )
        CoinTransaction.objects.create(
            customer=customer,
            grant=grant,
            amount=amount,
            kind=CoinTransaction.Kind.EARN_PROMISE,
            status=CoinTransaction.Status.CAPTURED,
            notes=f"Granted via rule: {rule.name}",
        )
        grants.append(grant)

    return grants


@transaction.atomic
def grant_configured_coins(
    *,
    customer: User,
    coins_amount: int,
    notes: str,
) -> CoinGrant | None:
    """Credit a specific coin amount into the spendable ledger. Zero is a no-op."""
    if coins_amount <= 0:
        return None
    grant = CoinGrant.objects.create(
        customer=customer,
        rule=None,
        coins_amount=coins_amount,
        locked_coins=0,
        spendable_coins=coins_amount,
        status=CoinGrant.Status.UNLOCKED,
    )
    CoinTransaction.objects.create(
        customer=customer,
        grant=grant,
        amount=coins_amount,
        kind=CoinTransaction.Kind.EARN_PROMISE,
        status=CoinTransaction.Status.CAPTURED,
        notes=notes,
    )
    return grant


@transaction.atomic
def unlock_coins_for_customer(*, customer: User, completion_count: int) -> list[CoinGrant]:
    """Unlock promised coin grants whose required completion threshold has been met."""
    grants = CoinGrant.objects.select_for_update().filter(
        customer=customer,
        status=CoinGrant.Status.PROMISED,
        rule__completions_required__lte=completion_count,
    )
    unlocked = []
    for grant in grants:
        amount = grant.locked_coins
        grant.spendable_coins += amount
        grant.locked_coins = 0
        grant.status = CoinGrant.Status.UNLOCKED
        grant.save(update_fields=("spendable_coins", "locked_coins", "status"))

        CoinTransaction.objects.create(
            customer=customer,
            grant=grant,
            amount=amount,
            kind=CoinTransaction.Kind.UNLOCK,
            status=CoinTransaction.Status.CAPTURED,
            notes=f"Unlocked after {completion_count} completion(s)",
        )
        unlocked.append(grant)

    return unlocked


@transaction.atomic
def reserve_coins(
    *,
    customer: User,
    coins_amount: int,
    payment_attempt: PaymentAttempt | None = None,
) -> list[CoinTransaction]:
    """Reserve spendable coins for checkout using FIFO by earliest expiry."""
    if coins_amount <= 0:
        return []

    grants = list(
        CoinGrant.objects.select_for_update()
        .filter(
            customer=customer,
            status=CoinGrant.Status.UNLOCKED,
            spendable_coins__gt=0,
        )
        .order_by(F("expires_at").asc(nulls_last=True), "created_at")
    )

    total_available = sum(g.spendable_coins for g in grants)
    if total_available < coins_amount:
        raise InsufficientCoinsError(
            f"Requested {coins_amount} coins exceeds available spendable {total_available}."
        )

    remaining = coins_amount
    txns = []

    for grant in grants:
        if remaining <= 0:
            break
        to_reserve = min(remaining, grant.spendable_coins)
        grant.spendable_coins -= to_reserve
        grant.save(update_fields=("spendable_coins",))

        txn = CoinTransaction.objects.create(
            customer=customer,
            grant=grant,
            amount=-to_reserve,
            kind=CoinTransaction.Kind.RESERVE,
            status=CoinTransaction.Status.RESERVED,
            payment_attempt=payment_attempt,
            notes="Checkout coins reservation",
        )
        txns.append(txn)
        remaining -= to_reserve

    return txns


@transaction.atomic
def capture_coins(*, payment_attempt_id: UUID) -> None:
    """Burn the reserved coins upon successful checkout capture."""
    txns = CoinTransaction.objects.select_for_update().filter(
        payment_attempt_id=payment_attempt_id,
        kind=CoinTransaction.Kind.RESERVE,
        status=CoinTransaction.Status.RESERVED,
    )
    for txn in txns:
        txn.kind = CoinTransaction.Kind.BURN
        txn.status = CoinTransaction.Status.CAPTURED
        txn.save(update_fields=("kind", "status"))

        if txn.grant:
            if txn.grant_id is None:
                continue
            grant = CoinGrant.objects.select_for_update().get(id=txn.grant_id)
            grant.burned_coins += abs(txn.amount)
            if grant.spendable_coins == 0 and grant.locked_coins == 0:
                grant.status = CoinGrant.Status.EXHAUSTED
            grant.save(update_fields=("burned_coins", "status"))


@transaction.atomic
def expire_due_coin_grants() -> int:
    """Expire unlocked spendable coins whose grant has passed `expires_at` (FIFO by grant)."""
    now = timezone.now()
    grant_ids = list(
        CoinGrant.objects.filter(
            status=CoinGrant.Status.UNLOCKED,
            expires_at__isnull=False,
            expires_at__lte=now,
            spendable_coins__gt=0,
        ).values_list("id", flat=True)[:500]
    )
    expired = 0
    for grant_id in grant_ids:
        with transaction.atomic():
            grant = CoinGrant.objects.select_for_update().get(id=grant_id)
            if (
                grant.status != CoinGrant.Status.UNLOCKED
                or grant.expires_at is None
                or grant.expires_at > timezone.now()
                or grant.spendable_coins <= 0
            ):
                continue
            amount = grant.spendable_coins
            grant.expired_coins += amount
            grant.spendable_coins = 0
            if grant.locked_coins == 0:
                grant.status = CoinGrant.Status.EXPIRED
            grant.save(update_fields=("expired_coins", "spendable_coins", "status"))
            CoinTransaction.objects.create(
                customer=grant.customer,
                grant=grant,
                amount=-amount,
                kind=CoinTransaction.Kind.EXPIRE,
                status=CoinTransaction.Status.CAPTURED,
                notes="Expired unused coins",
            )
            expired += 1
    return expired


@transaction.atomic
def release_coins(*, payment_attempt_id: UUID) -> None:
    """Release reserved coins back to spendable on checkout failure or expiry."""
    txns = CoinTransaction.objects.select_for_update().filter(
        payment_attempt_id=payment_attempt_id,
        kind=CoinTransaction.Kind.RESERVE,
        status=CoinTransaction.Status.RESERVED,
    )
    for txn in txns:
        txn.status = CoinTransaction.Status.RELEASED
        txn.save(update_fields=("status",))

        if txn.grant_id is not None:
            grant = CoinGrant.objects.select_for_update().get(id=txn.grant_id)
            released = abs(txn.amount)
            now = timezone.now()
            if grant.expires_at is not None and grant.expires_at <= now:
                grant.expired_coins += released
                if grant.spendable_coins == 0 and grant.locked_coins == 0:
                    grant.status = CoinGrant.Status.EXPIRED
                grant.save(update_fields=("expired_coins", "status"))
                CoinTransaction.objects.create(
                    customer=txn.customer,
                    grant=grant,
                    amount=-released,
                    kind=CoinTransaction.Kind.EXPIRE,
                    status=CoinTransaction.Status.CAPTURED,
                    notes="Reserved coins expired before capture",
                )
            else:
                grant.spendable_coins += released
                grant.save(update_fields=("spendable_coins",))
