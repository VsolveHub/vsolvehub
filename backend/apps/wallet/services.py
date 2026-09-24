"""Wallet domain services and concurrency-safe transaction operations (ADR-0010)."""

from uuid import UUID

from django.db import transaction
from django.db.models import Sum

from apps.commerce.models import Order, PaymentAttempt
from apps.identity.models import User
from apps.wallet.models import WalletAccount, WalletTopUpPolicy, WalletTransaction


class InsufficientWalletBalanceError(Exception):
    """Raised when an attempted debit or reservation exceeds available balance."""


class WalletTopUpPolicyViolationError(Exception):
    """Raised when a top-up request violates active policy min/max amounts."""


def get_or_create_wallet(user: User) -> WalletAccount:
    """Retrieve or create the unique WalletAccount for a user."""
    wallet, _ = WalletAccount.objects.get_or_create(customer=user)
    return wallet


def get_active_top_up_policy() -> WalletTopUpPolicy:
    """Retrieve the currently active top-up policy or fallback default."""
    policy = WalletTopUpPolicy.objects.filter(is_active=True).order_by("-effective_from").first()
    if policy is None:
        policy = WalletTopUpPolicy.objects.create(
            min_paise=10000,  # ₹100
            max_paise=1000000,  # ₹10,000
            is_active=True,
        )
    return policy


def validate_top_up_amount(amount_paise: int) -> None:
    """Validate that amount satisfies active policy limits."""
    policy = get_active_top_up_policy()
    if amount_paise < policy.min_paise:
        raise WalletTopUpPolicyViolationError(
            f"Top-up amount ₹{amount_paise / 100:.2f} is below "
            f"minimum allowed ₹{policy.min_paise / 100:.2f}."
        )
    if amount_paise > policy.max_paise:
        raise WalletTopUpPolicyViolationError(
            f"Top-up amount ₹{amount_paise / 100:.2f} exceeds "
            f"maximum allowed ₹{policy.max_paise / 100:.2f}."
        )


@transaction.atomic
def credit_wallet(
    *,
    wallet: WalletAccount,
    amount_paise: int,
    kind: str,
    idempotency_key: str = "",
    notes: str = "",
    payment_attempt: PaymentAttempt | None = None,
    order: Order | None = None,
) -> WalletTransaction:
    """Credit funds to customer wallet. Concurrency-safe, append-only."""
    if amount_paise <= 0:
        raise ValueError("Credit amount must be positive.")

    # Replay protection
    if idempotency_key:
        existing = WalletTransaction.objects.filter(
            wallet=wallet,
            idempotency_key=idempotency_key,
        ).first()
        if existing is not None:
            return existing

    # Lock wallet row to serialize mutations
    WalletAccount.objects.select_for_update().get(id=wallet.id)

    return WalletTransaction.objects.create(
        wallet=wallet,
        amount_paise=amount_paise,
        kind=kind,
        status=WalletTransaction.Status.CAPTURED,
        idempotency_key=idempotency_key,
        notes=notes,
        payment_attempt=payment_attempt,
        order=order,
    )


@transaction.atomic
def reserve_wallet(
    *,
    wallet: WalletAccount,
    amount_paise: int,
    idempotency_key: str = "",
    payment_attempt: PaymentAttempt | None = None,
    order: Order | None = None,
    notes: str = "",
) -> WalletTransaction:
    """Reserve funds for checkout. Fails if available balance is insufficient."""
    if amount_paise <= 0:
        raise ValueError("Reservation amount must be positive.")

    if idempotency_key:
        existing = WalletTransaction.objects.filter(
            wallet=wallet,
            idempotency_key=idempotency_key,
        ).first()
        if existing is not None:
            return existing

    # Lock wallet to serialize balance verification and reservation
    locked_wallet = WalletAccount.objects.select_for_update().get(id=wallet.id)
    if locked_wallet.available_balance_paise < amount_paise:
        available = locked_wallet.available_balance_paise / 100
        raise InsufficientWalletBalanceError(
            f"Requested ₹{amount_paise / 100:.2f} exceeds available balance ₹{available:.2f}."
        )

    # Debits stored as negative amount
    return WalletTransaction.objects.create(
        wallet=locked_wallet,
        amount_paise=-amount_paise,
        kind=WalletTransaction.Kind.CHECKOUT_DEBIT,
        status=WalletTransaction.Status.RESERVED,
        idempotency_key=idempotency_key,
        notes=notes or "Checkout reservation",
        payment_attempt=payment_attempt,
        order=order,
    )


@transaction.atomic
def capture_wallet(
    *,
    wallet: WalletAccount,
    reservation_transaction_id: UUID,
) -> WalletTransaction:
    """Confirm a reserved debit as captured upon payment success."""
    txn = (
        WalletTransaction.objects.select_for_update()
        .filter(
            id=reservation_transaction_id,
            wallet=wallet,
            status=WalletTransaction.Status.RESERVED,
        )
        .first()
    )
    if txn is None:
        raise ValueError("Reservation transaction not found or not in RESERVED status.")

    txn.status = WalletTransaction.Status.CAPTURED
    txn.save(update_fields=("status",))
    return txn


@transaction.atomic
def release_wallet(
    *,
    wallet: WalletAccount,
    reservation_transaction_id: UUID,
) -> WalletTransaction:
    """Release a reserved debit back to available balance upon failure or timeout."""
    txn = (
        WalletTransaction.objects.select_for_update()
        .filter(
            id=reservation_transaction_id,
            wallet=wallet,
            status=WalletTransaction.Status.RESERVED,
        )
        .first()
    )
    if txn is None:
        raise ValueError("Reservation transaction not found or not in RESERVED status.")

    txn.status = WalletTransaction.Status.RELEASED
    txn.save(update_fields=("status",))
    return txn


@transaction.atomic
def adjust_wallet(
    *,
    user: User,
    amount_paise: int,
    reason: str,
    idempotency_key: str,
) -> WalletTransaction:
    """Append-only operations adjustment. A reason is required. Debits cannot cross zero."""
    if not reason.strip():
        raise ValueError("An adjustment reason is required.")
    if amount_paise == 0:
        raise ValueError("An adjustment amount must be non-zero.")
    wallet = get_or_create_wallet(user)
    if idempotency_key:
        existing = WalletTransaction.objects.filter(
            wallet=wallet, idempotency_key=idempotency_key
        ).first()
        if existing is not None:
            return existing
    if amount_paise > 0:
        return credit_wallet(
            wallet=wallet,
            amount_paise=amount_paise,
            kind=WalletTransaction.Kind.ADJUSTMENT,
            idempotency_key=idempotency_key,
            notes=reason,
        )
    locked = WalletAccount.objects.select_for_update().get(id=wallet.id)
    if locked.available_balance_paise < abs(amount_paise):
        raise InsufficientWalletBalanceError("The adjustment would make the wallet negative.")
    return WalletTransaction.objects.create(
        wallet=locked,
        amount_paise=amount_paise,
        kind=WalletTransaction.Kind.ADJUSTMENT,
        status=WalletTransaction.Status.CAPTURED,
        idempotency_key=idempotency_key,
        notes=reason,
    )


def calculate_platform_wallet_liability_paise() -> int:
    """Calculate total platform liability across all customer wallets."""
    total = (
        WalletTransaction.objects.filter(
            status=WalletTransaction.Status.CAPTURED,
        ).aggregate(total=Sum("amount_paise"))["total"]
        or 0
    )
    return max(0, total)


@transaction.atomic
def initiate_wallet_top_up(
    *,
    user: User,
    amount_paise: int,
    idempotency_key: str = "",
) -> PaymentAttempt:
    """Initiate a top-up payment attempt for customer's wallet."""
    validate_top_up_amount(amount_paise)
    wallet = get_or_create_wallet(user)

    if idempotency_key:
        existing_txn = WalletTransaction.objects.filter(
            wallet=wallet,
            idempotency_key=idempotency_key,
        ).first()
        if existing_txn and existing_txn.payment_attempt:
            return existing_txn.payment_attempt

    from apps.commerce.services.payments import (  # noqa: PLC0415
        initiate_standalone_payment_attempt,
    )

    attempt = initiate_standalone_payment_attempt(
        purpose=PaymentAttempt.Purpose.WALLET_TOP_UP,
        amount_paise=amount_paise,
        idempotency_key=f"wallet-top-up:{wallet.id}:{idempotency_key or UUID(int=0)}",
    )

    WalletTransaction.objects.create(
        wallet=wallet,
        amount_paise=amount_paise,
        kind=WalletTransaction.Kind.TOP_UP,
        status=WalletTransaction.Status.RESERVED,
        payment_attempt=attempt,
        idempotency_key=idempotency_key,
        notes="Wallet top-up via payment gateway",
    )
    return attempt


@transaction.atomic
def complete_wallet_top_up_payment(*, payment_attempt_id: UUID) -> None:
    """Transition pending top-up transaction to CAPTURED upon gateway confirmation."""
    txn = (
        WalletTransaction.objects.select_for_update()
        .filter(
            payment_attempt_id=payment_attempt_id,
            kind=WalletTransaction.Kind.TOP_UP,
            status=WalletTransaction.Status.RESERVED,
        )
        .first()
    )
    if txn is None:
        return

    txn.status = WalletTransaction.Status.CAPTURED
    txn.save(update_fields=("status",))
