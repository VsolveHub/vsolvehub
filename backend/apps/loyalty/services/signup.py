"""Loyalty work that happens when a customer account is created."""

from apps.identity.models import User
from apps.loyalty.models import CoinGrant, CoinGrantRule
from apps.loyalty.services.coins import grant_coins
from apps.loyalty.services.referral import apply_referral_for_new_signup


def on_customer_signup(*, user: User, referral_code: str = "") -> None:
    """Attach the referral (if any) and grant every active SIGNUP coin rule.

    Called once, inside the transaction that creates the account.
    """
    apply_referral_for_new_signup(referee=user, code_str=referral_code)
    grant_coins(
        customer=user,
        trigger=CoinGrantRule.GrantTrigger.SIGNUP,
        source_type=CoinGrant.SourceType.SIGNUP,
        source_id=user.id,
    )
