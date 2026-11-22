"""Account deletion: a closed account, a grace period, holds, then erasure.

## The lifecycle, and where it comes from

It follows the pattern the large platforms use (Uber: "restore your account by signing back in";
deletion keeps tax, legal and transaction records for years) and the DPDP Rules 2025 (Rule 8:
erasure pauses when the person signs in again). Google Play requires an in-app path and a web
page; both file the same request here.

1. **Request** (`request_account_deletion`). Refused while the person has open bookings, because
   deleting somebody mid-job strands a Customer or a Partner. Otherwise an ERASURE
   `PrivacyRequest` is filed with ``scheduled_for`` = now + the grace period, every other session
   is revoked, the current one is cut to a few minutes so the app can show its confirmation and
   sign itself out, and a Partner is taken offline.
2. **Grace period.** Signing in again cancels the request (`cancel_deletion_on_sign_in`, called
   from `create_authenticated_session`), and the person gets an in-app notice saying so.
3. **Erasure** (`erase_account`), by the hourly sweep once ``scheduled_for`` passes, or by
   Operations ("Erase now", step-up). Refused while a hold stands: open work, or money owed
   either way. The sweep turns a refusal into ``IN_REVIEW`` with the hold in ``notes`` and checks
   again every run; a hold an operator placed by hand waits for that operator.

## What erasure removes, and what it keeps

Removed: name, phone number, email, profile photo, ID and KYC documents (the stored files too),
UPI ID and legal name, saved addresses (house-level detail; the city and a rounded position stay
on past bookings), devices, push subscriptions, sessions, sign-in codes and preferences. A
Partner is offboarded and their payout account retired.

Kept, attached to the anonymised account: bookings, payments, invoices, payouts and ledger
entries, consent receipts and audit events. Tax and consumer law require them. The public
deletion page states this, so it is a promise as well as a rule.

Not yet covered, deliberately: crew rosters (the crew are other people with their own rights,
and an agency's roster cannot be erased on one member's behalf without a rule for it), and
rental, stay and job listings, which are unpublished by Operations today.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import ROUND_DOWN, Decimal
from functools import partial
from typing import Any

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.identity.hashing import keyed_hash
from apps.identity.models import (
    CommunicationPreference,
    CustomerProfile,
    Device,
    OtpChallenge,
    PrivacyRequest,
    User,
    UserRole,
    UserSession,
)
from apps.identity.services import record_access_event

logger = logging.getLogger(__name__)

#: How long the device that filed the request keeps its session: long enough to show "your
#: account is closed" and sign itself out, short enough that a device that never signs out is
#: closed anyway.
CURRENT_SESSION_GRACE = timedelta(minutes=10)

ERASED_PARTNER_NAME = "Deleted partner"

#: Hold kinds. Stable strings: Operations filters and the console copy key off them.
HOLD_OPEN_WORK = "open_work"
HOLD_MONEY_OWED = "money_owed"
HOLD_WALLET_BALANCE = "wallet_balance"

#: Audit actions, one per decision.
ACTION_REQUESTED = "identity.privacy_request_created"
ACTION_CANCELLED = "identity.account_deletion_cancelled"
ACTION_HELD = "identity.account_deletion_held"
ACTION_RELEASED = "identity.account_deletion_released"
ACTION_REJECTED = "identity.privacy_request_rejected"
ACTION_COMPLETED = "identity.privacy_request_completed"
ACTION_ERASED = "identity.account_erased"


class AccountDeletionRefusedError(RuntimeError):
    """The request cannot be filed yet. ``code`` is the stable API error code."""

    def __init__(self, *, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class AccountDeletionStateError(RuntimeError):
    """The command does not apply to the request in its current status."""


@dataclass(frozen=True, slots=True)
class DeletionHold:
    """Something that must be settled before an account can be erased."""

    kind: str
    detail: str


class AccountDeletionHeldError(RuntimeError):
    def __init__(self, holds: list[DeletionHold]) -> None:
        super().__init__("; ".join(hold.detail for hold in holds))
        self.holds = holds


def grace_period() -> timedelta:
    return timedelta(days=int(settings.ACCOUNT_DELETION_GRACE_DAYS))


def _rupees(paise: int) -> str:
    from apps.commerce.documents.money import format_money  # noqa: PLC0415

    return format_money(paise)


# ---------------------------------------------------------------------------
# Holds
# ---------------------------------------------------------------------------


def _open_booking_count(user: User) -> int:
    # Local imports: identity is the layer everything else builds on.
    from apps.commerce.models import Booking  # noqa: PLC0415
    from apps.fulfilment.services import TERMINAL_BOOKING_STATUSES  # noqa: PLC0415

    involving = Q(customer=user) | Q(partner__user=user)
    return Booking.objects.filter(involving).exclude(status__in=TERMINAL_BOOKING_STATUSES).count()


def deletion_holds(user: User) -> list[DeletionHold]:
    """Everything that must be settled before this account can be erased. Empty means none."""

    from apps.partners.models import PartnerProfile  # noqa: PLC0415
    from apps.payouts.services import partner_balance_paise  # noqa: PLC0415
    from apps.wallet.models import WalletAccount  # noqa: PLC0415

    holds: list[DeletionHold] = []
    open_bookings = _open_booking_count(user)
    if open_bookings:
        holds.append(
            DeletionHold(
                kind=HOLD_OPEN_WORK,
                detail=(
                    f"{open_bookings} booking(s) are still open. They must be finished or "
                    "cancelled first."
                ),
            )
        )

    partner = PartnerProfile.objects.filter(user=user).first()
    if partner is not None:
        balance = partner_balance_paise(partner)
        owed = sum(
            balance[key]
            for key in (
                "pending_paise",
                "available_paise",
                "clearing_paise",
                "held_paise",
                "reserved_paise",
            )
        )
        if owed > 0:
            holds.append(
                DeletionHold(
                    kind=HOLD_MONEY_OWED,
                    detail=(
                        f"{_rupees(owed)} is still to be paid to this partner. Pay it out "
                        "before the bank account is retired."
                    ),
                )
            )
        elif owed < 0:
            holds.append(
                DeletionHold(
                    kind=HOLD_MONEY_OWED,
                    detail=f"This partner owes {_rupees(-owed)}. Settle or write it off first.",
                )
            )

    wallet = WalletAccount.objects.filter(customer=user).first()
    if wallet is not None and wallet.balance_paise > 0:
        holds.append(
            DeletionHold(
                kind=HOLD_WALLET_BALANCE,
                detail=(
                    f"{_rupees(wallet.balance_paise)} is left in the wallet. Refund or adjust "
                    "it to zero first."
                ),
            )
        )
    return holds


def _hold_note(holds: list[DeletionHold]) -> str:
    return ("On hold: " + " ".join(hold.detail for hold in holds))[:500]


# ---------------------------------------------------------------------------
# Request and cancel
# ---------------------------------------------------------------------------


def _open_erasure(user: User) -> PrivacyRequest | None:
    return (
        PrivacyRequest.objects.select_for_update()
        .filter(
            user=user,
            kind=PrivacyRequest.Kind.ERASURE,
            status__in=PrivacyRequest.OPEN_STATUSES,
        )
        .first()
    )


def _close_sessions(*, user: User, keep_session_key: str | None, now: datetime) -> None:
    """Sign the person out everywhere, except a short window for the device that asked."""

    keep_hash = keyed_hash(keep_session_key) if keep_session_key else None
    others = UserSession.objects.filter(user=user, revoked_at__isnull=True)
    if keep_hash:
        others = others.exclude(session_key_hash=keep_hash)
        UserSession.objects.filter(
            user=user,
            session_key_hash=keep_hash,
            revoked_at__isnull=True,
            expires_at__gt=now + CURRENT_SESSION_GRACE,
        ).update(expires_at=now + CURRENT_SESSION_GRACE)
    others.update(revoked_at=now)


def _take_partner_offline(*, user: User, now: datetime) -> None:
    from django.core.cache import cache  # noqa: PLC0415

    from apps.partners.models import (  # noqa: PLC0415
        PartnerOnlineSession,
        PartnerProfile,
        PartnerShift,
    )
    from apps.partners.selectors import presence_cache_key  # noqa: PLC0415

    partner = PartnerProfile.objects.filter(user=user).first()
    if partner is None:
        return
    PartnerOnlineSession.objects.filter(partner=partner, ended_at__isnull=True).update(
        ended_at=now, end_reason=PartnerOnlineSession.EndReason.OFFBOARDED
    )
    PartnerShift.objects.filter(partner=partner, ended_at__isnull=True).update(
        ended_at=now, end_reason=PartnerShift.EndReason.OFFBOARDED
    )
    try:
        cache.delete(presence_cache_key(partner.id))
    except Exception:
        # The ended session is the fact; the cache entry lapses on its own TTL.
        logger.warning("account_deletion_presence_cache_delete_failed", exc_info=True)


def request_account_deletion(
    *,
    user: User,
    current_session_key: str | None,
    actor: User | None = None,
    reason: str = "",
) -> PrivacyRequest:
    """File (or return the already open) deletion request for ``user``.

    ``actor`` is the operator filing it on the person's behalf (support channel); ``None`` when
    the person filed it themselves. Repeating the call returns the open request unchanged.
    """

    with transaction.atomic():
        # One lock per person serialises two taps of the same button.
        User.objects.select_for_update().filter(pk=user.pk).first()
        existing = _open_erasure(user)
        if existing is not None:
            return existing

        if _open_booking_count(user):
            raise AccountDeletionRefusedError(
                code="account_deletion_open_work",
                message=(
                    "You have bookings that are still open. Finish or cancel them first, then "
                    "delete your account."
                ),
            )

        now = timezone.now()
        privacy_request = PrivacyRequest.objects.create(
            user=user,
            kind=PrivacyRequest.Kind.ERASURE,
            status=PrivacyRequest.Status.RECEIVED,
            requested_at=now,
            scheduled_for=now + grace_period(),
            handled_by=actor,
            notes=(f"Filed by Operations: {reason.strip()}"[:500] if actor else ""),
        )
        _close_sessions(user=user, keep_session_key=current_session_key, now=now)
        _take_partner_offline(user=user, now=now)
        record_access_event(
            actor=actor or user,
            subject_user=user,
            action=ACTION_REQUESTED,
            object_type="privacy_request",
            object_id=privacy_request.id,
            metadata={
                "kind": PrivacyRequest.Kind.ERASURE,
                "scheduled_for": privacy_request.scheduled_for.isoformat()
                if privacy_request.scheduled_for
                else "",
                "filed_by_operations": actor is not None,
            },
        )
        return privacy_request


def _notify_cancelled(user: User, privacy_request: PrivacyRequest) -> None:
    from apps.notifications.services import request_notification  # noqa: PLC0415
    from apps.partners.models import PartnerProfile  # noqa: PLC0415

    audience = "PARTNER" if PartnerProfile.objects.filter(user=user).exists() else "CUSTOMER"
    try:
        request_notification(
            recipient_id=user.id,
            purpose="identity.account_deletion_cancelled",
            channel="IN_APP",
            audience=audience,
            template_code="account_deletion_cancelled",
            context={},
            idempotency_key=f"account-deletion-cancelled:{privacy_request.id}",
        )
    except Exception:
        # The cancellation is the fact that matters; the notice must not undo it.
        logger.exception(
            "account_deletion_cancel_notice_failed",
            extra={"privacy_request_id": str(privacy_request.id)},
        )


def cancel_deletion_on_sign_in(user: User) -> PrivacyRequest | None:
    """Signing in before the deletion date keeps the account (DPDP Rule 8, Uber's model)."""

    with transaction.atomic():
        privacy_request = _open_erasure(user)
        if privacy_request is None:
            return None
        privacy_request.status = PrivacyRequest.Status.CANCELLED
        privacy_request.cancelled_at = timezone.now()
        privacy_request.notes = "Cancelled: the person signed in again before the deletion date."
        privacy_request.save(update_fields=("status", "cancelled_at", "notes"))
        record_access_event(
            actor=user,
            subject_user=user,
            action=ACTION_CANCELLED,
            object_type="privacy_request",
            object_id=privacy_request.id,
            metadata={"by": "sign_in"},
        )
        transaction.on_commit(lambda: _notify_cancelled(user, privacy_request))
        return privacy_request


# ---------------------------------------------------------------------------
# Erasure
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class ErasureResult:
    privacy_request_id: uuid.UUID
    files_deleted: int
    partner_offboarded: bool


def _erased_phone(user: User) -> str:
    """Unique, never a dialable number, and inside the 16 characters the column allows."""

    return f"erased-{user.id.hex[:9]}"


def _coarse(value: Decimal) -> Decimal:
    """About a kilometre: the area a past booking was in, not the house."""

    return Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_DOWN)


def _erase_addresses(*, user: User, now: datetime) -> None:
    from apps.locations.models import Address  # noqa: PLC0415

    # Past bookings reference these rows (PROTECT), so they are scrubbed, not deleted.
    for address in Address.objects.filter(customer=user):
        Address.objects.filter(pk=address.pk).update(
            label="Deleted",
            line1="",
            line2="",
            landmark="",
            locality="",
            latitude=_coarse(address.latitude),
            longitude=_coarse(address.longitude),
            is_default=False,
            archived_at=address.archived_at or now,
            updated_at=now,
        )


def _erase_push(user: User) -> None:
    from apps.mobile.models import PushDevice  # noqa: PLC0415
    from apps.notifications.models import (  # noqa: PLC0415
        CustomerPushSubscription,
        PushNotificationPreference,
    )
    from apps.partners.models import PartnerPushSubscription  # noqa: PLC0415

    PushDevice.objects.filter(user=user).delete()
    CustomerPushSubscription.objects.filter(user=user).delete()
    PushNotificationPreference.objects.filter(user=user).delete()
    PartnerPushSubscription.objects.filter(user=user).delete()


def _erase_identity(*, user: User, now: datetime) -> None:
    old_phone = user.phone_number
    # `update()` on purpose: `User.save()` normalises the phone number, and the placeholder is
    # deliberately not one.
    User.objects.filter(pk=user.pk).update(
        phone_number=_erased_phone(user),
        full_name="",
        email="",
        is_active=False,
        password=make_password(None),
        updated_at=now,
    )
    CustomerProfile.objects.filter(user=user).update(display_name="", updated_at=now)
    UserSession.objects.filter(user=user, revoked_at__isnull=True).update(revoked_at=now)
    Device.objects.filter(user=user).update(label="", revoked_at=now)
    UserRole.objects.filter(user=user, revoked_at__isnull=True).update(revoked_at=now)
    OtpChallenge.objects.filter(phone_number=old_phone).delete()
    CommunicationPreference.objects.filter(user=user).delete()
    _erase_addresses(user=user, now=now)
    _erase_push(user)


def _partner_object_keys(partner: Any) -> list[str]:
    from apps.partners.models import PartnerDocument, PartnerDocumentUpload  # noqa: PLC0415

    keys = [partner.photo_object_key] if partner.photo_object_key else []
    keys += [
        key
        for key in PartnerDocument.objects.filter(application__partner=partner).values_list(
            "object_key", flat=True
        )
        if key
    ]
    keys += list(
        PartnerDocumentUpload.objects.filter(application__partner=partner).values_list(
            "object_key", flat=True
        )
    )
    return keys


def _offboard_application(*, partner: Any, actor: User) -> bool:
    from apps.partners.models import (  # noqa: PLC0415
        PartnerApplication,
        PartnerApplicationTransition,
    )

    application = PartnerApplication.objects.select_for_update().filter(partner=partner).first()
    if application is None or application.status == PartnerApplication.Status.OFFBOARDED:
        return False
    previous = application.status
    application.status = PartnerApplication.Status.OFFBOARDED
    application.version += 1
    application.save(update_fields=("status", "version", "updated_at"))
    PartnerApplicationTransition.objects.create(
        application=application,
        from_status=previous,
        to_status=PartnerApplication.Status.OFFBOARDED,
        actor=actor,
        reason_code="account_erased",
        reason="Account deleted at the partner's request.",
        application_version=application.version,
    )
    return True


def _erase_employer_data(partner: Any) -> None:
    """Blank what an employer gave: their email and home location, and their business's details.

    A proprietor's GSTIN contains their PAN, so it goes too. The public logo is deleted once the
    erasure commits, so a rolled-back erasure never leaves a row pointing at a missing file.
    """

    from apps.partners.models import EmployerProfile, PartnerBusinessProfile  # noqa: PLC0415

    EmployerProfile.objects.filter(partner=partner).update(email="", area="", city="", pin_code="")
    businesses = PartnerBusinessProfile.objects.filter(
        partner=partner, business_type=PartnerBusinessProfile.BusinessType.EMPLOYER
    )
    for business in businesses:
        if business.logo:
            transaction.on_commit(partial(business.logo.storage.delete, business.logo.name))
    businesses.update(
        trade_name="",
        address="",
        area="",
        pin_code="",
        website_url="",
        latitude=None,
        longitude=None,
        logo="",
        gstin="",
        gst_registered=False,
        gstin_verified_at=None,
        registered_state_code="",
        business_proof_type="",
    )


def _erase_partner(*, user: User, actor: User, now: datetime) -> tuple[list[str], bool]:
    """Scrub the Partner side. Returns the storage keys to delete and whether it offboarded."""

    from apps.partners.models import (  # noqa: PLC0415
        PartnerAreaRequest,
        PartnerBusinessProfile,
        PartnerDocument,
        PartnerDocumentUpload,
        PartnerLocation,
        PartnerProfile,
    )
    from apps.payouts.models import PartnerPayoutAccount  # noqa: PLC0415

    partner = PartnerProfile.objects.select_for_update().filter(user=user).first()
    if partner is None:
        return [], False

    keys = _partner_object_keys(partner)
    PartnerProfile.objects.filter(pk=partner.pk).update(
        display_name=ERASED_PARTNER_NAME,
        biography="",
        photo_object_key="",
        photo_status=PartnerProfile.PhotoStatus.NONE,
        photo_review_reason="",
        default_location_text="",
        updated_at=now,
    )
    PartnerDocument.objects.filter(application__partner=partner).update(object_key="")
    PartnerDocumentUpload.objects.filter(application__partner=partner).delete()
    PartnerAreaRequest.objects.filter(application__partner=partner).delete()
    PartnerBusinessProfile.objects.filter(partner=partner).update(legal_name="", upi_vpa="")
    _erase_employer_data(partner)
    PartnerLocation.objects.filter(partner=partner).delete()
    # The retired account keeps its last four digits and IFSC: past payouts reconcile against
    # them, and they are what the tax record of a payout names.
    PartnerPayoutAccount.objects.filter(
        partner=partner,
        status__in=(PartnerPayoutAccount.Status.PENDING, PartnerPayoutAccount.Status.VERIFIED),
    ).update(status=PartnerPayoutAccount.Status.REPLACED)
    _take_partner_offline(user=user, now=now)
    offboarded = _offboard_application(partner=partner, actor=actor)
    return keys, offboarded


def _delete_stored_files(keys: list[str]) -> int:
    from apps.partners.storage import get_document_storage  # noqa: PLC0415

    storage = get_document_storage()
    for key in keys:
        # A failure raises and rolls the whole erasure back, so it is retried rather than
        # leaving a document in the bucket that the database no longer points at.
        storage.delete_object(object_key=key)
    return len(keys)


def erase_account(*, privacy_request_id: uuid.UUID, actor: User | None) -> ErasureResult:
    """Erase the account behind an open deletion request. Refused while a hold stands."""

    with transaction.atomic():
        privacy_request = (
            PrivacyRequest.objects.select_for_update()
            .select_related("user")
            .get(id=privacy_request_id)
        )
        if (
            privacy_request.kind != PrivacyRequest.Kind.ERASURE
            or privacy_request.status not in PrivacyRequest.OPEN_STATUSES
        ):
            raise AccountDeletionStateError("Only an open deletion request can be erased.")
        user = privacy_request.user
        holds = deletion_holds(user)
        if holds:
            raise AccountDeletionHeldError(holds)

        now = timezone.now()
        keys, offboarded = _erase_partner(user=user, actor=actor or user, now=now)
        files_deleted = _delete_stored_files(keys)
        _erase_identity(user=user, now=now)

        privacy_request.status = PrivacyRequest.Status.COMPLETED
        privacy_request.completed_at = now
        privacy_request.handled_by = actor
        privacy_request.notes = "Erased. Bookings, payments and payouts are kept, anonymised."
        privacy_request.save(update_fields=("status", "completed_at", "handled_by", "notes"))
        record_access_event(
            actor=actor,
            subject_user=user,
            action=ACTION_ERASED,
            object_type="privacy_request",
            object_id=privacy_request.id,
            metadata={"files_deleted": files_deleted, "partner_offboarded": offboarded},
        )
        return ErasureResult(
            privacy_request_id=privacy_request.id,
            files_deleted=files_deleted,
            partner_offboarded=offboarded,
        )


def process_due_account_deletions(*, limit: int = 50) -> dict[str, int]:
    """The scheduled half: erase what is due, hold what cannot be erased yet.

    Picks up RECEIVED requests past their date, and IN_REVIEW requests the sweep itself put on
    hold (``handled_by`` empty), so a hold that clears is erased on the next run. A hold an
    operator placed is theirs to release.
    """

    now = timezone.now()
    due = list(
        PrivacyRequest.objects.filter(kind=PrivacyRequest.Kind.ERASURE, scheduled_for__lte=now)
        .filter(
            Q(status=PrivacyRequest.Status.RECEIVED)
            | Q(status=PrivacyRequest.Status.IN_REVIEW, handled_by__isnull=True)
        )
        .order_by("scheduled_for")
        .values_list("id", flat=True)[:limit]
    )
    result = {"erased": 0, "held": 0, "failed": 0}
    for privacy_request_id in due:
        try:
            erase_account(privacy_request_id=privacy_request_id, actor=None)
            result["erased"] += 1
        except AccountDeletionHeldError as exc:
            _record_system_hold(privacy_request_id, exc.holds)
            result["held"] += 1
        except AccountDeletionStateError:
            continue
        except Exception:
            logger.exception(
                "account_erasure_failed", extra={"privacy_request_id": str(privacy_request_id)}
            )
            result["failed"] += 1
    return result


def _record_system_hold(privacy_request_id: uuid.UUID, holds: list[DeletionHold]) -> None:
    with transaction.atomic():
        privacy_request = PrivacyRequest.objects.select_for_update().get(id=privacy_request_id)
        note = _hold_note(holds)
        if privacy_request.status == PrivacyRequest.Status.IN_REVIEW and (
            privacy_request.notes == note
        ):
            return
        privacy_request.status = PrivacyRequest.Status.IN_REVIEW
        privacy_request.notes = note
        privacy_request.save(update_fields=("status", "notes"))
        record_access_event(
            actor=None,
            subject_user=privacy_request.user,
            action=ACTION_HELD,
            object_type="privacy_request",
            object_id=privacy_request.id,
            metadata={"holds": [hold.kind for hold in holds], "by": "sweep"},
        )


# ---------------------------------------------------------------------------
# Operations commands
# ---------------------------------------------------------------------------


def _locked(privacy_request_id: uuid.UUID) -> PrivacyRequest:
    return (
        PrivacyRequest.objects.select_for_update().select_related("user").get(id=privacy_request_id)
    )


def _require_reason(reason: str) -> str:
    cleaned = reason.strip()
    if not cleaned:
        raise AccountDeletionStateError("Give a reason. It is kept in the request's history.")
    return cleaned


def hold_deletion(*, privacy_request_id: uuid.UUID, actor: User, reason: str) -> PrivacyRequest:
    """Stop the clock on an open deletion (a dispute, a legal request). Stays until released."""

    cleaned = _require_reason(reason)
    with transaction.atomic():
        privacy_request = _locked(privacy_request_id)
        if (
            privacy_request.kind != PrivacyRequest.Kind.ERASURE
            or privacy_request.status not in PrivacyRequest.OPEN_STATUSES
        ):
            raise AccountDeletionStateError("Only an open deletion request can be put on hold.")
        privacy_request.status = PrivacyRequest.Status.IN_REVIEW
        privacy_request.handled_by = actor
        privacy_request.notes = f"On hold by Operations: {cleaned}"[:500]
        privacy_request.save(update_fields=("status", "handled_by", "notes"))
        record_access_event(
            actor=actor,
            subject_user=privacy_request.user,
            action=ACTION_HELD,
            object_type="privacy_request",
            object_id=privacy_request.id,
            metadata={"reason": cleaned[:480], "by": "operations"},
        )
        return privacy_request


def release_deletion(*, privacy_request_id: uuid.UUID, actor: User) -> PrivacyRequest:
    """Put a held deletion back on its schedule. Past its date, the next sweep erases it."""

    with transaction.atomic():
        privacy_request = _locked(privacy_request_id)
        if (
            privacy_request.kind != PrivacyRequest.Kind.ERASURE
            or privacy_request.status != PrivacyRequest.Status.IN_REVIEW
        ):
            raise AccountDeletionStateError("Only a deletion on hold can be released.")
        privacy_request.status = PrivacyRequest.Status.RECEIVED
        privacy_request.handled_by = actor
        privacy_request.notes = ""
        if privacy_request.scheduled_for is None:
            privacy_request.scheduled_for = timezone.now()
        privacy_request.save(update_fields=("status", "handled_by", "notes", "scheduled_for"))
        record_access_event(
            actor=actor,
            subject_user=privacy_request.user,
            action=ACTION_RELEASED,
            object_type="privacy_request",
            object_id=privacy_request.id,
        )
        return privacy_request


def cancel_deletion(*, privacy_request_id: uuid.UUID, actor: User, reason: str) -> PrivacyRequest:
    """The person asked support to keep their account."""

    cleaned = _require_reason(reason)
    with transaction.atomic():
        privacy_request = _locked(privacy_request_id)
        if (
            privacy_request.kind != PrivacyRequest.Kind.ERASURE
            or privacy_request.status not in PrivacyRequest.OPEN_STATUSES
        ):
            raise AccountDeletionStateError("Only an open deletion request can be cancelled.")
        privacy_request.status = PrivacyRequest.Status.CANCELLED
        privacy_request.cancelled_at = timezone.now()
        privacy_request.handled_by = actor
        privacy_request.notes = f"Cancelled by Operations: {cleaned}"[:500]
        privacy_request.save(update_fields=("status", "cancelled_at", "handled_by", "notes"))
        record_access_event(
            actor=actor,
            subject_user=privacy_request.user,
            action=ACTION_CANCELLED,
            object_type="privacy_request",
            object_id=privacy_request.id,
            metadata={"by": "operations", "reason": cleaned[:480]},
        )
        return privacy_request


def reject_privacy_request(
    *, privacy_request_id: uuid.UUID, actor: User, reason: str
) -> PrivacyRequest:
    """Refuse a request, saying why (a legal obligation, an identity that could not be checked)."""

    cleaned = _require_reason(reason)
    with transaction.atomic():
        privacy_request = _locked(privacy_request_id)
        if privacy_request.status not in PrivacyRequest.OPEN_STATUSES:
            raise AccountDeletionStateError("Only an open request can be rejected.")
        privacy_request.status = PrivacyRequest.Status.REJECTED
        privacy_request.completed_at = timezone.now()
        privacy_request.handled_by = actor
        privacy_request.notes = f"Rejected: {cleaned}"[:500]
        privacy_request.save(update_fields=("status", "completed_at", "handled_by", "notes"))
        record_access_event(
            actor=actor,
            subject_user=privacy_request.user,
            action=ACTION_REJECTED,
            object_type="privacy_request",
            object_id=privacy_request.id,
            metadata={"reason": cleaned[:480]},
        )
        return privacy_request


def complete_access_request(
    *, privacy_request_id: uuid.UUID, actor: User, note: str
) -> PrivacyRequest:
    """Record that the person's copy of their data was sent. ACCESS requests only."""

    cleaned = _require_reason(note)
    with transaction.atomic():
        privacy_request = _locked(privacy_request_id)
        if (
            privacy_request.kind != PrivacyRequest.Kind.ACCESS
            or privacy_request.status not in PrivacyRequest.OPEN_STATUSES
        ):
            raise AccountDeletionStateError("Only an open data-copy request can be completed.")
        privacy_request.status = PrivacyRequest.Status.COMPLETED
        privacy_request.completed_at = timezone.now()
        privacy_request.handled_by = actor
        privacy_request.notes = cleaned[:500]
        privacy_request.save(update_fields=("status", "completed_at", "handled_by", "notes"))
        record_access_event(
            actor=actor,
            subject_user=privacy_request.user,
            action=ACTION_COMPLETED,
            object_type="privacy_request",
            object_id=privacy_request.id,
        )
        return privacy_request
