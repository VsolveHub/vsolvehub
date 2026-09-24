"""Checkout funding from the customer wallet and V Coins ledgers.

Coin burn is a discount. Wallet is a closed-loop reservation. The payment provider
is charged only the remainder. Burned coins are never restored.
"""

from dataclasses import dataclass

from django.db import transaction
from django.db.models import Sum
from django.db.models.functions import Coalesce

from apps.commerce.models import PaymentAttempt, Refund
from apps.identity.models import User
from apps.loyalty.services.coins import (
    InsufficientCoinsError,
    calculate_coin_burn,
    capture_coins,
    get_customer_coin_balances,
    release_coins,
    reserve_coins,
)
from apps.wallet.models import WalletTransaction
from apps.wallet.services import (
    InsufficientWalletBalanceError,
    capture_wallet,
    credit_wallet,
    get_or_create_wallet,
    release_wallet,
    reserve_wallet,
)


@dataclass(frozen=True)
class CheckoutFunding:
    wallet_paise: int
    coins: int
    discount_paise: int


def quote_checkout_funding(
    *,
    customer: User,
    order_payable_paise: int,
    wallet_amount_paise: int,
    coin_burn_amount: int,
) -> CheckoutFunding:
    """Server-side cap. Client amounts above the cap or the balance are refused."""
    if wallet_amount_paise < 0 or coin_burn_amount < 0:
        raise ValueError("Wallet and coin amounts must be zero or positive.")
    if order_payable_paise <= 0:
        raise ValueError("The order total must be positive.")

    balances = get_customer_coin_balances(customer)
    burn = calculate_coin_burn(
        order_payable_paise=order_payable_paise,
        requested_coins=coin_burn_amount,
        spendable_coins=int(balances["spendable_coins"]),
    )
    applied_coins = int(burn["applied_burn_coins"]) if coin_burn_amount else 0
    discount_paise = int(burn["discount_paise"]) if coin_burn_amount else 0
    if coin_burn_amount > applied_coins:
        raise ValueError("The requested coin burn exceeds the server cap or spendable balance.")

    remaining_paise = order_payable_paise - discount_paise
    if wallet_amount_paise > remaining_paise:
        raise ValueError("The wallet amount exceeds the amount left after coin burn.")
    if wallet_amount_paise > 0:
        wallet = get_or_create_wallet(customer)
        if wallet.available_balance_paise < wallet_amount_paise:
            raise ValueError("The wallet amount exceeds the available balance.")
    return CheckoutFunding(
        wallet_paise=wallet_amount_paise,
        coins=applied_coins,
        discount_paise=discount_paise,
    )


def _prior_refund_sums(attempt: PaymentAttempt) -> tuple[int, int, int]:
    """Return `(wallet_credit, gateway_refund, refund_amount)` from non-failed refunds."""
    if attempt.pk is None:
        return 0, 0, 0
    agg = attempt.refunds.exclude(status=Refund.Status.FAILED).aggregate(
        amount=Coalesce(Sum("amount_paise"), 0),
        wallet=Coalesce(Sum("wallet_credit_paise"), 0),
        gateway=Coalesce(Sum("gateway_refund_paise"), 0),
    )
    return int(agg["wallet"]), int(agg["gateway"]), int(agg["amount"])


def split_refund_amounts(*, attempt: PaymentAttempt, refund_paise: int) -> tuple[int, int]:
    """Return `(wallet_credit_paise, gateway_refund_paise)`.

    The coin discount share of the refund is dropped. It is not cash and it is not reminted.
    Prior refunds cap wallet and gateway so integer rounding cannot over-refund the provider.
    """
    total = attempt.amount_paise
    if refund_paise <= 0 or total <= 0:
        raise ValueError("Refund split needs a positive amount.")
    prior_wallet, prior_gateway, prior_amount = _prior_refund_sums(attempt)
    if prior_amount + refund_paise > total:
        raise ValueError("The refund exceeds the payment total.")
    prior_coin = prior_amount - prior_wallet - prior_gateway
    rem_wallet = attempt.wallet_reserved_paise - prior_wallet
    rem_gateway = attempt.gateway_amount_paise - prior_gateway
    rem_coin = attempt.coin_discount_paise - prior_coin

    wallet_credit = min(rem_wallet, attempt.wallet_reserved_paise * refund_paise // total)
    remaining = refund_paise - wallet_credit
    coin_drop = min(rem_coin, attempt.coin_discount_paise * refund_paise // total, remaining)
    gateway = remaining - coin_drop
    if gateway > rem_gateway:
        coin_drop += gateway - rem_gateway
        gateway = rem_gateway
    if wallet_credit + coin_drop + gateway != refund_paise:
        coin_drop = refund_paise - wallet_credit - gateway
    if coin_drop < 0 or gateway < 0:
        raise ValueError("Refund split produced a negative component.")
    return wallet_credit, gateway


@transaction.atomic
def reserve_checkout_funding(
    *,
    attempt: PaymentAttempt,
    customer: User,
    funding: CheckoutFunding,
) -> None:
    if funding.wallet_paise > 0:
        wallet = get_or_create_wallet(customer)
        try:
            reserve_wallet(
                wallet=wallet,
                amount_paise=funding.wallet_paise,
                idempotency_key=f"checkout-reserve:{attempt.id}",
                payment_attempt=attempt,
            )
        except InsufficientWalletBalanceError as exc:
            raise ValueError(str(exc)) from exc
    if funding.coins > 0:
        try:
            reserve_coins(
                customer=customer,
                coins_amount=funding.coins,
                payment_attempt=attempt,
            )
        except InsufficientCoinsError as exc:
            raise ValueError(str(exc)) from exc


@transaction.atomic
def capture_checkout_funding(*, attempt: PaymentAttempt) -> None:
    reservation = (
        WalletTransaction.objects.select_for_update()
        .filter(
            payment_attempt=attempt,
            kind=WalletTransaction.Kind.CHECKOUT_DEBIT,
            status=WalletTransaction.Status.RESERVED,
        )
        .first()
    )
    if reservation is not None:
        capture_wallet(wallet=reservation.wallet, reservation_transaction_id=reservation.id)
    capture_coins(payment_attempt_id=attempt.id)


@transaction.atomic
def release_checkout_funding(*, attempt: PaymentAttempt) -> None:
    reservation = (
        WalletTransaction.objects.select_for_update()
        .filter(
            payment_attempt=attempt,
            kind=WalletTransaction.Kind.CHECKOUT_DEBIT,
            status=WalletTransaction.Status.RESERVED,
        )
        .first()
    )
    if reservation is not None:
        release_wallet(wallet=reservation.wallet, reservation_transaction_id=reservation.id)
    release_coins(payment_attempt_id=attempt.id)


def credit_refunded_wallet(*, refund: Refund) -> None:
    """Restore the wallet share of a succeeded refund. Idempotent. Coins stay burned."""
    if refund.wallet_credit_paise <= 0 or refund.payment_attempt_id is None:
        return
    attempt = PaymentAttempt.objects.select_related("checkout__customer").get(
        id=refund.payment_attempt_id
    )
    if attempt.checkout_id is None or attempt.checkout is None:
        return
    customer = attempt.checkout.customer
    wallet = get_or_create_wallet(customer)
    credit_wallet(
        wallet=wallet,
        amount_paise=refund.wallet_credit_paise,
        kind=WalletTransaction.Kind.REFUND_CREDIT,
        idempotency_key=f"wallet-refund:{refund.id}",
        payment_attempt=attempt,
        order=refund.order,
        notes="Checkout refund restored to wallet",
    )
