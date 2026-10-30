"""Deployment guards that are worth failing start-up over.

Separate from `production.py` so each one can be tested without executing an entire settings
module — importing that module runs every other guard in it, so a test for one of them would
need a full production environment to reach the line it cares about.
"""

from django.core.exceptions import ImproperlyConfigured

#: The shortest cooling period production accepts between a payout account being added or changed
#: and money leaving through it.
PRODUCTION_MINIMUM_PAYOUT_COOLING_HOURS = 24
#: RazorpayX's smallest payout, ₹1.
RAZORPAYX_MINIMUM_PAYOUT_PAISE = 100


def guard_payout_account_cooling(hours: int, *, minimum_hours: int) -> None:
    """A new or changed bank account waits at least `minimum_hours` before it can be paid.

    The wait is the account-takeover control: it is the time a Partner has to notice that their
    bank account changed, and Operations has to act, before money leaves. Production passes 24.
    Other environments pass 0, so a RazorpayX test-mode run can pay out the same day without the
    control quietly shrinking in production.
    """

    if hours < minimum_hours:
        raise ImproperlyConfigured(
            f"PAYOUT_ACCOUNT_COOLING_HOURS must be at least {minimum_hours} here (got {hours}). "
            "It is the delay that protects Partners from a bank-account takeover."
        )


def guard_payout_clearing(hours: int, *, minimum_hours: int) -> None:
    """A visit's earning stays unpayable for at least `minimum_hours` after it is settled.

    The clearing window is what lets a quality dispute freeze money before any of it leaves. In
    production it must be at least the Customer's dispute window (72 hours); shorter, and a
    Partner could be paid before the Customer has finished being allowed to complain. Other
    environments may set 0 so a test run does not wait three days.
    """

    if hours < minimum_hours:
        raise ImproperlyConfigured(
            f"PAYOUT_CLEARING_HOURS must be at least {minimum_hours} here (got {hours}). "
            "Anything shorter than the quality-dispute window pays Partners before Customers "
            "can complain."
        )


def guard_payout_minimum(paise: int) -> None:
    """RazorpayX refuses a payout under ₹1, so a smaller transfer would only ever fail."""

    if paise < RAZORPAYX_MINIMUM_PAYOUT_PAISE:
        raise ImproperlyConfigured(
            f"PAYOUT_MINIMUM_PAISE must be at least {RAZORPAYX_MINIMUM_PAYOUT_PAISE} (₹1), the "
            f"smallest payout RazorpayX accepts (got {paise})."
        )


#: `PAYOUT_EXTRA_WITHDRAWAL_FEE_PAISE` when nobody has set a price for an extra withdrawal.
WITHDRAWAL_FEE_UNSET = -1


def guard_withdrawal_limits(*, minimum_paise: int, maximum_paise: int, fee_paise: int) -> None:
    """The Partner withdrawal limits must make sense together before anyone can withdraw.

    The minimum can be no lower than RazorpayX's ₹1, the maximum no lower than the minimum, and a
    fee — when one is set — must leave money to send: a withdrawal of the minimum, less the fee,
    still has to be at least ₹1. An unset fee (`WITHDRAWAL_FEE_UNSET`) is allowed: extra
    withdrawals are then refused rather than charged a price nobody chose.
    """

    if minimum_paise < RAZORPAYX_MINIMUM_PAYOUT_PAISE:
        raise ImproperlyConfigured(
            "PAYOUT_WITHDRAWAL_MIN_PAISE must be at least 100 (₹1), RazorpayX's smallest payout."
        )
    if maximum_paise < minimum_paise:
        raise ImproperlyConfigured(
            "PAYOUT_WITHDRAWAL_MAX_PAISE must be at least PAYOUT_WITHDRAWAL_MIN_PAISE."
        )
    if fee_paise != WITHDRAWAL_FEE_UNSET and not (
        0 <= fee_paise <= minimum_paise - RAZORPAYX_MINIMUM_PAYOUT_PAISE
    ):
        raise ImproperlyConfigured(
            "PAYOUT_EXTRA_WITHDRAWAL_FEE_PAISE must be unset, or between 0 and the withdrawal "
            "minimum less ₹1, so a minimum withdrawal still sends something."
        )


def guard_razorpayx_test_keys(key_id: str) -> None:
    """Outside production, RazorpayX keys must be test-mode keys.

    A live key moves real money. On a developer machine, or on staging, the payouts switch is
    flipped on to try the integration, and a live key pasted by mistake would then pay real bank
    accounts. Refusing to start is the only check that cannot be skipped.
    """

    if key_id.startswith("rzp_live_"):
        raise ImproperlyConfigured(
            "RAZORPAYX_KEY_ID is a live key. Only production may use live RazorpayX keys; use the "
            "rzp_test_ key from RazorpayX test mode here."
        )


def guard_per_host_sessions(session_domain: str | None, csrf_domain: str | None) -> None:
    """Sessions stay scoped to the host that issued them.

    The three apps are deployed on separate hosts — `vsolvehub.com`, `partner.vsolvehub.com`
    and `consolve.vsolvehub.com`. A cookie scoped to a parent domain is sent to every subdomain
    under it, so `.vsolvehub.com` would make a stolen Customer session cookie a valid credential
    against the console that approves payouts. The hosts are separate precisely so a compromise
    of one is not a compromise of the others, and a shared cookie quietly undoes that.

    Refused rather than warned about. This is a one-line change somebody makes in a hurry to
    give staff a single sign-in; it breaks nothing visibly and would not look wrong in review.
    Staff signing in to the console separately costs one OTP.
    """

    if session_domain or csrf_domain:
        raise ImproperlyConfigured(
            "SESSION_COOKIE_DOMAIN and CSRF_COOKIE_DOMAIN must stay unset. Sessions are scoped "
            "per host so that a compromised Customer session is not also a credential for the "
            "Operations console. Staff sign in to the console separately."
        )
