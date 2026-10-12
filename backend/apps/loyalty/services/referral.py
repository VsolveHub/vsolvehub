"""Referral program services: codes, signup attribution, qualification and payout (ADR-0010).

Lifecycle of one referral (`ReferralAttribution.status`):

    PENDING    referee signed up with the code; no completed booking yet
    QUALIFIED  referee completed a booking; reward waits for `reward_available_at`
    REWARDED   waiting period over and rewards paid (coins by default, wallet if configured)
    INELIGIBLE Operations rejected it before payment ("Rejected" in every UI)
    REVERSED   Operations took a paid reward back

A refund on the qualifying booking inside the waiting period sends the referral back to
PENDING, so the referee's next completed booking can qualify instead.
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from uuid import UUID

from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from apps.foundation.models import OutboxEvent
from apps.identity.models import User
from apps.loyalty.models import (
    CoinGrant,
    CustomerCompletion,
    ReferralAttribution,
    ReferralCode,
    ReferralProgramRewardTier,
    ReferralProgramVersion,
    ReferralReward,
)
from apps.loyalty.services.coins import (
    get_loyalty_settings,
    grant_configured_coins,
    reverse_coin_grant,
)
from apps.wallet.models import WalletTransaction
from apps.wallet.services import adjust_wallet, credit_wallet, get_or_create_wallet

logger = logging.getLogger(__name__)

#: Launch tiers from the client spec, in V Coins (100 coins = ₹10). Only used to seed the first
#: program when none exists; Operations publishes every later version.
DEFAULT_REFERRER_TIERS: tuple[tuple[int, int], ...] = (
    (1, 100),
    (4, 150),
    (10, 250),
    (25, 350),
    (50, 500),
)
DEFAULT_REFEREE_COINS = 100

#: A referral code is accepted only while the account is this new. OTP signup applies it in the
#: same request that creates the account, so anything older is a retroactive attempt.
SIGNUP_WINDOW = timedelta(minutes=30)


class ReferralValidationError(Exception):
    """Raised when a referral code cannot be applied or validated."""


class ReferralReviewError(Exception):
    """Raised when an Operations reject/reverse is not allowed in the current state."""


def get_active_referral_program() -> ReferralProgramVersion:
    """Retrieve the active referral program version or seed the default coin program."""
    program = (
        ReferralProgramVersion.objects.filter(is_active=True).order_by("-effective_from").first()
    )
    if program is None:
        program = ReferralProgramVersion.objects.create(
            version_code="v1",
            qualifying_event=ReferralProgramVersion.QualifyingEvent.REFEREE_FIRST_COMPLETED_BOOKING,
            reward_sides=ReferralProgramVersion.RewardSides.BOTH,
            referee_wallet_paise=0,
            referee_coins_amount=DEFAULT_REFEREE_COINS,
            is_active=True,
        )
        for index, (minimum, coins) in enumerate(DEFAULT_REFERRER_TIERS):
            ReferralProgramRewardTier.objects.create(
                program_version=program,
                min_qualified_referrals=minimum,
                referrer_wallet_paise=0,
                referrer_coins_amount=coins,
                sort_order=index,
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


def referee_reward_summary(program: ReferralProgramVersion) -> str:
    """Customer-facing sentence describing the new customer's reward, built from config."""
    if program.reward_sides == ReferralProgramVersion.RewardSides.REFERRER_ONLY:
        return "Sign up with this code to join V Solve Hub."
    parts = []
    if program.referee_coins_amount:
        parts.append(f"{program.referee_coins_amount} V Coins")
    if program.referee_wallet_paise:
        parts.append(f"₹{program.referee_wallet_paise // 100} wallet credit")
    if not parts:
        return "Sign up with this code to join V Solve Hub."
    return f"Get {' + '.join(parts)} after your first completed booking."


def validate_referral_code(code_str: str) -> dict[str, object]:
    """Validate a referral code for public signup pre-check."""
    clean_code = code_str.strip().upper()
    ref_code = ReferralCode.objects.filter(code=clean_code).select_related("user").first()
    if ref_code is None:
        raise ReferralValidationError(f"Referral code '{clean_code}' is invalid.")

    program = get_active_referral_program()
    return {
        "valid": True,
        "code": clean_code,
        "referrer_id": str(ref_code.user_id),
        "referee_reward_summary": referee_reward_summary(program),
    }


def _assert_new_customer(referee: User) -> None:
    """A referral only counts for a genuinely new customer (client spec §7)."""
    from apps.commerce.models import Order  # noqa: PLC0415 - commerce imports loyalty

    if timezone.now() - referee.date_joined > SIGNUP_WINDOW:
        raise ReferralValidationError("Referral codes can only be used when you sign up.")
    if CustomerCompletion.objects.filter(customer=referee).exists():
        raise ReferralValidationError("Referral codes are only for new customers.")
    if Order.objects.filter(customer=referee).exists():
        raise ReferralValidationError("Referral codes are only for new customers.")


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

    _assert_new_customer(referee)

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


def apply_referral_for_new_signup(*, referee: User, code_str: str) -> bool:
    """Signup hook. A bad code never blocks login; it is logged and ignored.

    Runs inside a savepoint so a rejected code cannot roll back the account creation.
    """
    if not code_str.strip():
        return False
    try:
        with transaction.atomic():
            apply_referral_at_signup(referee=referee, code_str=code_str)
    except ReferralValidationError as exc:
        logger.info("Referral code not applied at signup: %s", exc)
        return False
    return True


@transaction.atomic
def evaluate_referral_qualification(event: OutboxEvent) -> None:
    """Mark the referee's PENDING referral QUALIFIED and start the waiting period.

    Pays at once when the waiting period is zero days.
    """
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
        .first()
    )
    if attribution is None:
        return

    source_type = str(event.payload.get("source_type") or "BOOKING")
    raw_source = (
        event.payload.get("booking_id")
        or event.payload.get("engagement_id")
        or event.payload.get("source_id")
    )
    completed_at = parse_datetime(str(event.payload.get("completed_at") or "")) or timezone.now()
    hold_days = get_loyalty_settings().reward_hold_days

    attribution.status = ReferralAttribution.Status.QUALIFIED
    attribution.qualified_at = timezone.now()
    attribution.qualifying_source_type = source_type
    attribution.qualifying_source_id = UUID(str(raw_source)) if raw_source else None
    attribution.reward_available_at = completed_at + timedelta(days=hold_days)
    attribution.save(
        update_fields=(
            "status",
            "qualified_at",
            "qualifying_source_type",
            "qualifying_source_id",
            "reward_available_at",
        )
    )
    if attribution.reward_available_at <= timezone.now():
        _pay_attribution(attribution)


def _rewarded_this_month(referrer_id: UUID, now: datetime) -> int:
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return ReferralAttribution.objects.filter(
        referrer_id=referrer_id,
        status=ReferralAttribution.Status.REWARDED,
        rewarded_at__gte=month_start,
    ).count()


@dataclass(frozen=True, slots=True)
class RewardAmounts:
    """What one referral pays each side, for the referrer's `n`th successful referral."""

    tier: ReferralProgramRewardTier | None
    pays_referrer: bool
    pays_referee: bool
    referrer_wallet_paise: int
    referrer_coins: int
    referee_wallet_paise: int
    referee_coins: int


def reward_for_payout(program: ReferralProgramVersion, n: int) -> RewardAmounts:
    """The one place a referral's reward is worked out, for payouts and for the "on the way"
    figures customers see, so the two cannot disagree."""

    tiers = sorted(program.tiers.all(), key=lambda tier: tier.min_qualified_referrals)
    reached = [tier for tier in tiers if tier.min_qualified_referrals <= n]
    matching_tier = reached[-1] if reached else (tiers[0] if tiers else None)
    sides = program.reward_sides
    reward_sides = ReferralProgramVersion.RewardSides
    return RewardAmounts(
        tier=matching_tier,
        pays_referrer=sides in (reward_sides.REFERRER_ONLY, reward_sides.BOTH),
        pays_referee=sides in (reward_sides.REFEREE_ONLY, reward_sides.BOTH),
        referrer_wallet_paise=matching_tier.referrer_wallet_paise if matching_tier else 0,
        referrer_coins=matching_tier.referrer_coins_amount if matching_tier else 0,
        referee_wallet_paise=(
            matching_tier.referee_wallet_paise
            if (matching_tier and matching_tier.referee_wallet_paise is not None)
            else program.referee_wallet_paise
        ),
        referee_coins=(
            matching_tier.referee_coins_amount
            if (matching_tier and matching_tier.referee_coins_amount is not None)
            else program.referee_coins_amount
        ),
    )


def _pay_attribution(attribution: ReferralAttribution) -> bool:
    """Issue rewards for one QUALIFIED referral. Caller holds the row lock.

    Returns False when the referrer is at the monthly cap; the referral stays QUALIFIED and is
    retried by the next sweep, so it pays in a later month.
    """
    now = timezone.now()
    cap = get_loyalty_settings().referral_monthly_cap
    if cap and _rewarded_this_month(attribution.referrer_id, now) >= cap:
        return False

    program = attribution.program_version
    referrer = attribution.referrer
    referee = attribution.referee

    # Tier: referrer's nth successful (rewarded, not reversed) referral.
    n = (
        ReferralAttribution.objects.filter(
            referrer=referrer, status=ReferralAttribution.Status.REWARDED
        ).count()
        + 1
    )
    amounts = reward_for_payout(program, n)
    matching_tier = amounts.tier

    sides = []
    if amounts.pays_referrer:
        sides.append(
            (
                ReferralReward.RewardSide.REFERRER,
                referrer,
                amounts.referrer_wallet_paise,
                amounts.referrer_coins,
            )
        )
    if amounts.pays_referee:
        sides.append(
            (
                ReferralReward.RewardSide.REFEREE,
                referee,
                amounts.referee_wallet_paise,
                amounts.referee_coins,
            )
        )

    for side, recipient, wallet_paise, coins in sides:
        wallet_txn = None
        if wallet_paise > 0:
            wallet_txn = credit_wallet(
                wallet=get_or_create_wallet(recipient),
                amount_paise=wallet_paise,
                kind=WalletTransaction.Kind.REFERRAL_CREDIT,
                idempotency_key=f"referral-reward:{side.lower()}:{attribution.id}",
                notes="Referral reward",
            )
        coin_grant = grant_configured_coins(
            customer=recipient,
            coins_amount=coins,
            notes=(
                "Referral reward for inviting a friend"
                if side == ReferralReward.RewardSide.REFERRER
                else "Welcome reward for joining with a referral"
            ),
            source_type=CoinGrant.SourceType.REFERRAL,
            source_id=attribution.id,
        )
        ReferralReward.objects.create(
            attribution=attribution,
            program_version=program,
            tier=matching_tier,
            payout_sequence_n=n,
            recipient=recipient,
            reward_side=side,
            wallet_paise=wallet_paise,
            coins_amount=coins,
            wallet_transaction=wallet_txn,
            coin_grant=coin_grant,
        )

    attribution.status = ReferralAttribution.Status.REWARDED
    attribution.rewarded_at = now
    attribution.save(update_fields=("status", "rewarded_at"))
    return True


def release_due_referral_rewards(*, now: datetime | None = None) -> int:
    """Pay QUALIFIED referrals whose waiting period is over. Oldest first; capped referrers wait."""
    moment = now or timezone.now()
    ids = list(
        ReferralAttribution.objects.filter(
            status=ReferralAttribution.Status.QUALIFIED,
            reward_available_at__lte=moment,
        )
        .order_by("reward_available_at")
        .values_list("id", flat=True)[:500]
    )
    paid = 0
    for attribution_id in ids:
        with transaction.atomic():
            attribution = (
                ReferralAttribution.objects.select_for_update(of=("self",))
                .select_related("referrer", "referee", "program_version")
                .get(id=attribution_id)
            )
            if attribution.status != ReferralAttribution.Status.QUALIFIED:
                continue
            if _pay_attribution(attribution):
                paid += 1
    return paid


@transaction.atomic
def requalify_after_refund(*, source_type: str, source_id: UUID) -> int:
    """Send referrals qualified by a now-refunded booking back to PENDING (still unpaid only)."""
    rows = ReferralAttribution.objects.select_for_update().filter(
        status=ReferralAttribution.Status.QUALIFIED,
        qualifying_source_type=source_type,
        qualifying_source_id=source_id,
    )
    count = 0
    for attribution in rows:
        attribution.status = ReferralAttribution.Status.PENDING
        attribution.qualified_at = None
        attribution.qualifying_source_type = ""
        attribution.qualifying_source_id = None
        attribution.reward_available_at = None
        attribution.save(
            update_fields=(
                "status",
                "qualified_at",
                "qualifying_source_type",
                "qualifying_source_id",
                "reward_available_at",
            )
        )
        count += 1
    return count


def _record_review(attribution: ReferralAttribution, *, actor: User, reason: str) -> None:
    attribution.reviewed_by = actor
    attribution.reviewed_at = timezone.now()
    attribution.review_reason = reason[:240]


@transaction.atomic
def reject_referral(*, attribution_id: UUID, actor: User, reason: str) -> ReferralAttribution:
    """Operations reject a referral before it pays (suspected fraud, duplicate account, ...)."""
    if not reason.strip():
        raise ReferralReviewError("A reason is required.")
    attribution = ReferralAttribution.objects.select_for_update().get(id=attribution_id)
    if attribution.status not in (
        ReferralAttribution.Status.PENDING,
        ReferralAttribution.Status.QUALIFIED,
    ):
        raise ReferralReviewError("Only a pending or qualified referral can be rejected.")
    attribution.status = ReferralAttribution.Status.INELIGIBLE
    _record_review(attribution, actor=actor, reason=reason)
    attribution.save(update_fields=("status", "reviewed_by", "reviewed_at", "review_reason"))
    return attribution


@transaction.atomic
def reverse_referral(*, attribution_id: UUID, actor: User, reason: str) -> ReferralAttribution:
    """Operations take back a paid referral reward. Coins already spent cannot be recovered.

    Every recovered coin and rupee leaves a REVERSE / ADJUSTMENT ledger row with the reason.
    """
    if not reason.strip():
        raise ReferralReviewError("A reason is required.")
    attribution = ReferralAttribution.objects.select_for_update().get(id=attribution_id)
    if attribution.status != ReferralAttribution.Status.REWARDED:
        raise ReferralReviewError("Only a rewarded referral can be reversed.")

    note = f"Referral reversed: {reason}"
    for reward in attribution.rewards.select_related("coin_grant", "recipient"):
        if reward.coin_grant is not None:
            reverse_coin_grant(grant=reward.coin_grant, reason=note)
        if reward.wallet_paise > 0:
            wallet = get_or_create_wallet(reward.recipient)
            recoverable = min(reward.wallet_paise, wallet.available_balance_paise)
            if recoverable > 0:
                adjust_wallet(
                    user=reward.recipient,
                    amount_paise=-recoverable,
                    reason=note[:240],
                    idempotency_key=f"referral-reverse:{reward.id}",
                )

    attribution.status = ReferralAttribution.Status.REVERSED
    _record_review(attribution, actor=actor, reason=reason)
    attribution.save(update_fields=("status", "reviewed_by", "reviewed_at", "review_reason"))
    return attribution


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
    minimums = [int(t["min_qualified_referrals"]) for t in tiers]
    if 1 not in minimums:
        raise ValueError("The first tier must start at 1 successful referral.")
    if len(set(minimums)) != len(minimums):
        raise ValueError("Two tiers cannot start at the same number of referrals.")
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
    for index, tier in enumerate(sorted(tiers, key=lambda t: int(t["min_qualified_referrals"]))):
        ReferralProgramRewardTier.objects.create(
            program_version=program,
            min_qualified_referrals=tier["min_qualified_referrals"],
            referrer_wallet_paise=tier.get("referrer_wallet_paise", 0),
            referrer_coins_amount=tier.get("referrer_coins_amount", 0),
            sort_order=index,
        )
    return program


# --- What customers are shown before a reward lands ------------------------------------------


@dataclass(frozen=True, slots=True)
class ShownReward:
    wallet_paise: int
    coins: int
    #: True until the reward is paid: the tier, a monthly cap or a refund can still change it.
    is_estimate: bool


def referrer_rewards_for(
    referrer: User, attributions: list[ReferralAttribution]
) -> dict[UUID, ShownReward | None]:
    """The referrer's reward for each referral: what was paid, or what is expected.

    Expected rewards follow the payout order the sweep uses — referrals already booked are paid
    in the order their hold ends, then friends who have not booked yet — so each is priced at
    the tier it is likely to land in. Not eligible and reversed referrals pay nothing.
    """

    rewarded = ReferralAttribution.objects.filter(
        referrer=referrer, status=ReferralAttribution.Status.REWARDED
    ).count()
    queued = list(
        ReferralAttribution.objects.filter(
            referrer=referrer, status=ReferralAttribution.Status.QUALIFIED
        )
        .order_by("reward_available_at", "id")
        .values_list("id", flat=True)
    )
    position = {attribution_id: index for index, attribution_id in enumerate(queued)}

    shown: dict[UUID, ShownReward | None] = {}
    for attribution in attributions:
        status = attribution.status
        if status == ReferralAttribution.Status.REWARDED:
            paid = [
                reward
                for reward in attribution.rewards.all()
                if reward.reward_side == ReferralReward.RewardSide.REFERRER
            ]
            shown[attribution.id] = ShownReward(
                wallet_paise=sum(reward.wallet_paise for reward in paid),
                coins=sum(reward.coins_amount for reward in paid),
                is_estimate=False,
            )
            continue
        if status == ReferralAttribution.Status.QUALIFIED:
            n = rewarded + 1 + position.get(attribution.id, 0)
        elif status == ReferralAttribution.Status.PENDING:
            n = rewarded + len(queued) + 1
        else:
            shown[attribution.id] = None
            continue
        amounts = reward_for_payout(attribution.program_version, n)
        shown[attribution.id] = ShownReward(
            wallet_paise=amounts.referrer_wallet_paise if amounts.pays_referrer else 0,
            coins=amounts.referrer_coins if amounts.pays_referrer else 0,
            is_estimate=True,
        )
    return shown


def welcome_reward_for(referee: User) -> dict[str, object] | None:
    """The new customer's own reward for joining with a code, while it is still on its way.

    `None` once paid (it is then in their wallet and coin history), when they did not join with
    a code, when the referral did not qualify, or when the programme rewards only the referrer.
    """

    attribution = (
        ReferralAttribution.objects.filter(
            referee=referee,
            status__in=(
                ReferralAttribution.Status.PENDING,
                ReferralAttribution.Status.QUALIFIED,
            ),
        )
        .select_related("program_version")
        .first()
    )
    if attribution is None:
        return None
    # A tier can change the new customer's reward too; it is the referrer's next payout's tier.
    referrer_paid = ReferralAttribution.objects.filter(
        referrer_id=attribution.referrer_id, status=ReferralAttribution.Status.REWARDED
    ).count()
    amounts = reward_for_payout(attribution.program_version, referrer_paid + 1)
    if not amounts.pays_referee:
        return None
    return {
        "status": attribution.status,
        "wallet_paise": amounts.referee_wallet_paise,
        "coins": amounts.referee_coins,
        "reward_available_at": attribution.reward_available_at,
    }
