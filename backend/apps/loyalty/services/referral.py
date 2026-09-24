"""Referral program services: codes, signup attribution, and tier qualification (ADR-0010)."""

from uuid import UUID

from django.db import transaction
from django.utils import timezone

from apps.foundation.models import OutboxEvent
from apps.identity.models import User
from apps.loyalty.models import (
    ReferralAttribution,
    ReferralCode,
    ReferralProgramRewardTier,
    ReferralProgramVersion,
    ReferralReward,
)
from apps.wallet.models import WalletTransaction
from apps.wallet.services import credit_wallet, get_or_create_wallet


class ReferralValidationError(Exception):
    """Raised when a referral code cannot be applied or validated."""


def get_active_referral_program() -> ReferralProgramVersion:
    """Retrieve the active referral program version or seed default v1."""
    program = (
        ReferralProgramVersion.objects.filter(is_active=True).order_by("-effective_from").first()
    )
    if program is None:
        program = ReferralProgramVersion.objects.create(
            version_code="v1",
            qualifying_event=ReferralProgramVersion.QualifyingEvent.REFEREE_FIRST_COMPLETED_BOOKING,
            reward_sides=ReferralProgramVersion.RewardSides.BOTH,
            referee_wallet_paise=5000,  # ₹50
            referee_coins_amount=100,
            is_active=True,
        )
        ReferralProgramRewardTier.objects.create(
            program_version=program,
            min_qualified_referrals=1,
            referrer_wallet_paise=10000,  # ₹100
            referrer_coins_amount=0,
            referee_wallet_paise=5000,
            referee_coins_amount=100,
            sort_order=1,
        )
        ReferralProgramRewardTier.objects.create(
            program_version=program,
            min_qualified_referrals=5,
            referrer_wallet_paise=20000,  # ₹200
            referrer_coins_amount=0,
            referee_wallet_paise=5000,
            referee_coins_amount=100,
            sort_order=2,
        )
    return program


def get_or_create_referral_code(user: User) -> ReferralCode:
    """Retrieve or generate the unique referral code and share URL for a customer."""
    ref_code = ReferralCode.objects.filter(user=user).first()
    if ref_code is not None:
        return ref_code

    # Clean readable code: VS + last 4 digits of phone + 4 hex chars
    phone_part = user.phone_number[-4:] if user.phone_number else "0000"
    unique_hex = user.id.hex[:4].upper()
    code = f"VS{phone_part}{unique_hex}"

    share_url = f"https://vsolvehub.com/signup?ref={code}"
    return ReferralCode.objects.create(
        user=user,
        code=code,
        share_url=share_url,
    )


def validate_referral_code(code_str: str) -> dict[str, object]:
    """Validate a referral code for public signup pre-check."""
    clean_code = code_str.strip().upper()
    ref_code = ReferralCode.objects.filter(code=clean_code).select_related("user").first()
    if ref_code is None:
        raise ReferralValidationError(f"Referral code '{clean_code}' is invalid.")

    program = get_active_referral_program()
    referee_wallet = program.referee_wallet_paise // 100
    return {
        "valid": True,
        "code": clean_code,
        "referrer_id": str(ref_code.user_id),
        "referee_reward_summary": (
            f"Get ₹{referee_wallet} wallet credit on your first completed booking!"
        ),
    }


@transaction.atomic
def apply_referral_at_signup(
    *,
    referee: User,
    code_str: str,
) -> ReferralAttribution:
    """Attach a referral code to a new customer strictly at signup."""
    clean_code = code_str.strip().upper()
    ref_code = (
        ReferralCode.objects.select_for_update()
        .filter(code=clean_code)
        .select_related("user")
        .first()
    )
    if ref_code is None:
        raise ReferralValidationError(f"Referral code '{clean_code}' is invalid.")

    if ref_code.user_id == referee.id:
        raise ReferralValidationError("Self-referral is not allowed.")

    if ReferralAttribution.objects.filter(referee=referee).exists():
        raise ReferralValidationError("Customer already has an applied referral attribution.")

    program = get_active_referral_program()

    # Freeze snapshot of terms at signup per §2.5.2
    tier_rows = [
        {
            "min_qualified_referrals": t.min_qualified_referrals,
            "referrer_wallet_paise": t.referrer_wallet_paise,
            "referrer_coins_amount": t.referrer_coins_amount,
            "referee_wallet_paise": t.referee_wallet_paise,
            "referee_coins_amount": t.referee_coins_amount,
            "sort_order": t.sort_order,
        }
        for t in program.tiers.all().order_by("min_qualified_referrals", "sort_order")
    ]
    terms_snapshot = {
        "program_version": program.version_code,
        "reward_sides": program.reward_sides,
        "referee_wallet_paise": program.referee_wallet_paise,
        "referee_coins_amount": program.referee_coins_amount,
        "tiers": tier_rows,
    }

    return ReferralAttribution.objects.create(
        referrer=ref_code.user,
        referee=referee,
        program_version=program,
        terms_snapshot=terms_snapshot,
        status=ReferralAttribution.Status.PENDING,
    )


@transaction.atomic
def evaluate_referral_qualification(event: OutboxEvent) -> None:
    """Evaluate referee qualifying event and issue grandfathered rewards."""
    customer_id_str = event.payload.get("customer_id")
    if not customer_id_str:
        return

    referee_id = UUID(str(customer_id_str))
    attribution = (
        ReferralAttribution.objects.select_for_update()
        .filter(
            referee_id=referee_id,
            status=ReferralAttribution.Status.PENDING,
        )
        .select_related("referrer", "referee", "program_version")
        .first()
    )
    if attribution is None:
        return

    now = timezone.now()
    attribution.status = ReferralAttribution.Status.QUALIFIED
    attribution.qualified_at = now
    attribution.save(update_fields=("status", "qualified_at"))

    program = attribution.program_version
    referrer = attribution.referrer
    referee = attribution.referee

    # Referrer's successful rewarded count
    successful_count = ReferralAttribution.objects.filter(
        referrer=referrer,
        status=ReferralAttribution.Status.REWARDED,
    ).count()
    n = successful_count + 1

    # Select tier with highest min_qualified_referrals <= n
    matching_tier = (
        program.tiers.filter(min_qualified_referrals__lte=n)
        .order_by("-min_qualified_referrals")
        .first()
    )
    if matching_tier is None:
        matching_tier = program.tiers.order_by("min_qualified_referrals").first()

    referrer_wallet_paise = matching_tier.referrer_wallet_paise if matching_tier else 10000
    referrer_coins = matching_tier.referrer_coins_amount if matching_tier else 0

    referee_wallet_paise = (
        matching_tier.referee_wallet_paise
        if (matching_tier and matching_tier.referee_wallet_paise is not None)
        else program.referee_wallet_paise
    )
    referee_coins = (
        matching_tier.referee_coins_amount
        if (matching_tier and matching_tier.referee_coins_amount is not None)
        else program.referee_coins_amount
    )

    # 1. Pay Referrer if configured
    referrer_wallet_txn = None
    if program.reward_sides in (
        ReferralProgramVersion.RewardSides.REFERRER_ONLY,
        ReferralProgramVersion.RewardSides.BOTH,
    ):
        if referrer_wallet_paise > 0:
            referrer_wallet = get_or_create_wallet(referrer)
            referrer_wallet_txn = credit_wallet(
                wallet=referrer_wallet,
                amount_paise=referrer_wallet_paise,
                kind=WalletTransaction.Kind.REFERRAL_CREDIT,
                idempotency_key=f"referral-reward:referrer:{attribution.id}",
                notes=f"Referral reward for referring {referee.id}",
            )

        ReferralReward.objects.create(
            attribution=attribution,
            program_version=program,
            tier=matching_tier,
            payout_sequence_n=n,
            recipient=referrer,
            reward_side=ReferralReward.RewardSide.REFERRER,
            wallet_paise=referrer_wallet_paise,
            coins_amount=referrer_coins,
            wallet_transaction=referrer_wallet_txn,
        )

    # 2. Pay Referee if configured
    referee_wallet_txn = None
    if program.reward_sides in (
        ReferralProgramVersion.RewardSides.REFEREE_ONLY,
        ReferralProgramVersion.RewardSides.BOTH,
    ):
        if referee_wallet_paise > 0:
            referee_wallet = get_or_create_wallet(referee)
            referee_wallet_txn = credit_wallet(
                wallet=referee_wallet,
                amount_paise=referee_wallet_paise,
                kind=WalletTransaction.Kind.REFERRAL_CREDIT,
                idempotency_key=f"referral-reward:referee:{attribution.id}",
                notes="Signup referral reward on completing first booking",
            )

        ReferralReward.objects.create(
            attribution=attribution,
            program_version=program,
            tier=matching_tier,
            payout_sequence_n=n,
            recipient=referee,
            reward_side=ReferralReward.RewardSide.REFEREE,
            wallet_paise=referee_wallet_paise,
            coins_amount=referee_coins,
            wallet_transaction=referee_wallet_txn,
        )

    attribution.status = ReferralAttribution.Status.REWARDED
    attribution.rewarded_at = now
    attribution.save(update_fields=("status", "rewarded_at"))


@transaction.atomic
def publish_referral_program(
    *,
    version_code: str,
    reward_sides: str,
    referee_wallet_paise: int,
    referee_coins_amount: int,
    tiers: list[dict[str, int]],
) -> ReferralProgramVersion:
    """Publish a new program version. Existing versions are never edited."""
    if ReferralProgramVersion.objects.filter(version_code=version_code).exists():
        raise ValueError("A referral program version with this code already exists.")
    if not tiers:
        raise ValueError("A referral program needs at least one reward tier.")
    now = timezone.now()
    ReferralProgramVersion.objects.filter(is_active=True).update(
        is_active=False, effective_until=now
    )
    program = ReferralProgramVersion.objects.create(
        version_code=version_code,
        reward_sides=reward_sides,
        referee_wallet_paise=referee_wallet_paise,
        referee_coins_amount=referee_coins_amount,
        is_active=True,
    )
    for index, tier in enumerate(tiers):
        ReferralProgramRewardTier.objects.create(
            program_version=program,
            min_qualified_referrals=tier["min_qualified_referrals"],
            referrer_wallet_paise=tier["referrer_wallet_paise"],
            referrer_coins_amount=tier.get("referrer_coins_amount", 0),
            sort_order=index,
        )
    return program
