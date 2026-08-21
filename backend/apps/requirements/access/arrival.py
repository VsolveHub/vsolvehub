"""The arrival code: the Customer reads it out, the vendor types it in.

## What this is for

The retired tap-only arrival let either party mark a visit as arrived from anywhere. But the A5
visit plan is money the Customer has already paid for somebody to travel, and the visit is what
earns the vendor their share of it. So
"did they actually turn up" is a financial question, and a button either side can press from a
sofa is not an answer to it.

A code held by the Customer and entered by the vendor is: the two of them have to be in the same
place for it to move. `SiteVisit.ArrivalMethod.START_OTP` has been modelled since revision 3 and
never written; this is what writes it.

## Why the code is cached in plaintext as well as hashed

The hash in `SiteVisitArrivalOtp` is the verification record and the only durable copy — a
database read cannot tell anybody what to type. But this code is *displayed*, not sent, and a
Customer who reloads their visit page must see the same digits rather than be handed new ones. So
the plaintext lives in the cache under the same TTL as the challenge, and nowhere else.

That is a deliberate trade and its bounds are worth stating: the plaintext is in memory only, dies
with its TTL, and is reachable solely by the Customer whose visit it is. A cold cache — a restart,
an eviction — loses the digits while the hash survives, so the page asks for a new code rather
than showing a stale one. Losing the display copy is a nuisance; losing the verification copy
would be a visit nobody can prove.

## Why there is no fallback

The code is the arrival proof, not an enhancement. A second tap-only command would make the code
optional and would let either party start a paid visit from somewhere else.
"""

import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone

from apps.identity.models import User
from apps.requirements.exceptions import (
    RequirementDomainError,
    RequirementNotFoundError,
    RequirementTransitionError,
)
from apps.requirements.models import SiteVisit, SiteVisitArrivalOtp

__all__ = [
    "ArrivalCode",
    "ArrivalCodeInvalidError",
    "ArrivalCodeRateLimitError",
    "confirm_visit_arrival_with_code",
    "issue_visit_arrival_code",
    "live_visit_arrival_code",
]


class ArrivalCodeRateLimitError(RequirementDomainError):
    """A new code was asked for before the cooldown on the last one had run out.

    Subclasses the domain base rather than `RequirementTransitionError`, because that class fixes
    its own code to `m2_requirement_transition_not_allowed` in `__init__` — a class attribute here
    would be silently overwritten, and every one of these refusals would reach a client wearing
    the wrong name.
    """

    def __init__(self, retry_after_seconds: int) -> None:
        super().__init__(
            code="m2_arrival_code_too_soon",
            message="You asked for a code a moment ago. Wait a few seconds and try again.",
            status_code=429,
            # The wait is the whole remedy, so this is the rare refusal that is honestly retryable.
            retryable=True,
        )
        self.retry_after_seconds = retry_after_seconds


class ArrivalCodeInvalidError(RequirementDomainError):
    """Wrong, expired, already used, or too many wrong guesses.

    One error for all four on purpose. Telling somebody entering codes *which* of the four it was
    tells them whether to keep going, and the whole value of an attempt limit is that they cannot
    tell.
    """

    def __init__(self) -> None:
        super().__init__(
            code="m2_arrival_code_invalid",
            message="That code is not right. Ask for the current one and try again.",
            status_code=422,
        )


@dataclass(frozen=True, slots=True)
class ArrivalCode:
    """A live code and when it dies. `digits` is None when only the hash survives."""

    digits: str | None
    expires_at: datetime


def _cache_key(site_visit_id: uuid.UUID) -> str:
    return f"m2:visit-arrival-code:{site_visit_id}"


def _cooldown_key(site_visit_id: uuid.UUID) -> str:
    return f"m2:visit-arrival-code:cooldown:{site_visit_id}"


def _assert_awaiting_arrival(visit: SiteVisit) -> None:
    """A code only means anything on a visit that is scheduled and not yet started.

    `SCHEDULED` is also the proof the plan was paid: a visit whose plan payment has not been
    verified is *held*, not scheduled, which is the same guard the arrival-code views document.
    """

    if visit.status == SiteVisit.Status.IN_PROGRESS:
        raise RequirementTransitionError("This visit has already started.")
    if visit.status != SiteVisit.Status.SCHEDULED:
        raise RequirementTransitionError(
            "A code can only be issued for a visit with a confirmed time.",
        )


@transaction.atomic
def issue_visit_arrival_code(*, site_visit_id: uuid.UUID, customer: User) -> ArrivalCode:
    """Mint a code for the Customer to read out. Retires any predecessor.

    One live challenge per visit: a second code while the first still verified would mean a vendor
    could be let in with digits the Customer is no longer looking at.
    """

    visit = (
        SiteVisit.objects.select_for_update(of=("self",))
        .select_related("requirement")
        .filter(pk=site_visit_id, requirement__customer=customer)
        .first()
    )
    if visit is None:
        raise RequirementNotFoundError()
    _assert_awaiting_arrival(visit)

    cooldown = settings.OTP_RESEND_COOLDOWN_SECONDS
    if not cache.add(_cooldown_key(visit.id), "1", timeout=cooldown):
        raise ArrivalCodeRateLimitError(cooldown)

    SiteVisitArrivalOtp.objects.filter(site_visit=visit, consumed_at__isnull=True).update(
        expires_at=timezone.now(),
    )

    length = int(settings.OTP_CODE_LENGTH)
    digits = f"{secrets.randbelow(10**length):0{length}d}"
    expires_at = timezone.now() + timedelta(seconds=settings.M2_VISIT_ARRIVAL_CODE_TTL_SECONDS)
    SiteVisitArrivalOtp.objects.create(
        site_visit=visit,
        code_hash=make_password(digits),
        expires_at=expires_at,
        max_attempts=settings.M2_VISIT_ARRIVAL_CODE_MAX_ATTEMPTS,
    )
    cache.set(
        _cache_key(visit.id),
        digits,
        timeout=settings.M2_VISIT_ARRIVAL_CODE_TTL_SECONDS,
    )
    return ArrivalCode(digits=digits, expires_at=expires_at)


def live_visit_arrival_code(visit: SiteVisit) -> ArrivalCode | None:
    """The code the Customer's page should be showing, or None if there is nothing live.

    Read-only, and safe to call on every render of the visit page. Returns a code with `digits`
    unset when the challenge is still live but the display copy has been evicted — the page then
    offers a new one instead of showing digits that no longer exist anywhere.
    """

    challenge = (
        SiteVisitArrivalOtp.objects.filter(site_visit=visit, consumed_at__isnull=True)
        .order_by("-created_at")
        .first()
    )
    if challenge is None or not challenge.is_live:
        return None
    cached = cache.get(_cache_key(visit.id))
    return ArrivalCode(
        digits=cached if isinstance(cached, str) else None,
        expires_at=challenge.expires_at,
    )


def confirm_visit_arrival_with_code(
    *,
    site_visit_id: uuid.UUID,
    vendor_user: User,
    code: str,
) -> SiteVisit:
    """The vendor proves they are on site. Wrong guesses are spent and kept.

    A failed attempt has to survive even though the command fails, or an attacker gets unlimited
    guesses by way of the rollback that punished them. Same "record inside the transaction, raise
    after it commits" shape as `fulfilment.otp.verify_start_otp` and `identity.verify_login_otp`.
    """

    rejected = False
    visit: SiteVisit

    with transaction.atomic():
        found = (
            SiteVisit.objects.select_for_update(of=("self",))
            .select_related("invitation__partner")
            .filter(pk=site_visit_id, invitation__partner__user=vendor_user)
            .first()
        )
        if found is None:
            raise RequirementNotFoundError()
        visit = found
        _assert_awaiting_arrival(visit)

        challenge = (
            SiteVisitArrivalOtp.objects.select_for_update()
            .filter(site_visit=visit, consumed_at__isnull=True)
            .order_by("-created_at")
            .first()
        )
        if challenge is None or not challenge.is_live:
            rejected = True
        elif not check_password(code, challenge.code_hash):
            challenge.failed_attempts += 1
            challenge.save(update_fields=("failed_attempts",))
            rejected = True
        else:
            challenge.consumed_at = timezone.now()
            challenge.consumed_by = vendor_user
            challenge.save(update_fields=("consumed_at", "consumed_by"))
            cache.delete(_cache_key(visit.id))
            visit.status = SiteVisit.Status.IN_PROGRESS
            visit.arrival_confirmed_at = timezone.now()
            visit.arrival_method = SiteVisit.ArrivalMethod.START_OTP
            visit.arrival_confirmed_by = vendor_user
            visit.save(
                update_fields=(
                    "status",
                    "arrival_confirmed_at",
                    "arrival_method",
                    "arrival_confirmed_by",
                    "updated_at",
                )
            )

    if rejected:
        raise ArrivalCodeInvalidError()
    return visit
