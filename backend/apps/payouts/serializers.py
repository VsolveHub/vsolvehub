"""Ledger, payout and earnings projections.

Two audiences, two shapes, for the same reason B8 has three:

**The Partner** sees their own earnings — what a visit paid, what was deducted, and which state
the money is in. They do not see another Partner's anything, and they do not see the batch
machinery: a `PayoutBatch` id tells a Partner nothing they can act on and names a run that
covers other people.

**Operations** sees the batch, its items, and who approved it. That projection names Partners by
id because reconciling a run requires it.

Bank details never appear in either beyond the last four digits. The full number lives with the
provider, which is the only party that needs it.
"""

import re
from typing import Any

from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.payouts.models import (
    PartnerLedgerEntry,
    PartnerPayoutAccount,
    PayoutBatch,
    PayoutBatchItem,
)
from apps.payouts.services import WITHDRAWAL_REFUSAL_REASONS, WITHDRAWAL_REVIEW_REASONS


class PartnerLedgerEntrySerializer(serializers.ModelSerializer[PartnerLedgerEntry]):
    """One line of a Partner's statement.

    `calculation_snapshot` is published deliberately: a Partner is entitled to see why they were
    paid what they were paid, and "the commission was 18% capped at ₹X, applied to the two tasks
    you actually completed" is the answer. Hiding it turns every payment question into a support
    ticket.
    """

    booking_id = serializers.UUIDField(read_only=True, allow_null=True)
    corrects_id = serializers.UUIDField(read_only=True, allow_null=True)
    clears_at = serializers.DateTimeField(
        read_only=True,
        allow_null=True,
        help_text=(
            "Not payable before this instant: the end of the Customer's dispute window. Null "
            "when the line counts at once (corrections, refunds)."
        ),
    )
    is_on_hold = serializers.SerializerMethodField(
        help_text=(
            "A dispute or case on this line's booking is freezing it. Held money is not paid "
            "until the hold is lifted."
        )
    )

    class Meta:
        model = PartnerLedgerEntry
        fields = (
            "id",
            "booking_id",
            "kind",
            "status",
            "gross_paise",
            "commission_paise",
            "net_paise",
            "currency",
            "calculation_snapshot",
            "corrects_id",
            "reason",
            "clears_at",
            "is_on_hold",
            "created_at",
        )
        read_only_fields = fields

    def get_is_on_hold(self, instance: PartnerLedgerEntry) -> bool:
        # Annotated by the views that list lines (`selectors.with_hold_flags`); a line created a
        # moment ago and serialised directly has had no chance to be held.
        return bool(
            getattr(instance, "booking_on_hold", False)
            or getattr(instance, "rental_on_hold", False)
            or getattr(instance, "entry_on_hold", False)
        )


class PartnerBalanceSerializer(serializers.Serializer[dict[str, Any]]):
    """What is owed, by state.

    Four numbers rather than one, because "you have ₹4,200" is not true in any useful sense when
    ₹1,800 of it is held behind an open quality case. A Partner planning their week needs to know
    which part of it is actually coming.
    """

    pending_paise = serializers.IntegerField(
        help_text="Earned but not yet payable: `held_paise` plus `clearing_paise`."
    )
    available_paise = serializers.IntegerField(
        help_text=(
            "Payable now: cleared, not on hold, refunds already subtracted. Negative when refunds "
            "exceed what has cleared; that much comes off the next earnings."
        )
    )
    clearing_paise = serializers.IntegerField(
        help_text="Earned, waiting out the Customer's dispute window before it can be paid."
    )
    held_paise = serializers.IntegerField(
        help_text="Frozen by a dispute or an Operations case until it is decided."
    )
    withdrawable_paise = serializers.IntegerField(
        help_text="What one payout could send right now: `available_paise`, never below zero."
    )
    reserved_paise = serializers.IntegerField(
        help_text="In a payout that has been reserved or sent and has not yet settled."
    )
    paid_paise = serializers.IntegerField()
    currency = serializers.CharField()
    server_now = serializers.DateTimeField()


class PartnerPayoutAccountSerializer(serializers.ModelSerializer[PartnerPayoutAccount]):
    """The account, masked, plus when it becomes usable.

    `effective_from` is published because it is the honest explanation for why a freshly added
    account has not been paid into yet. Without it the Partner sees a verified account and no
    money, which reads as a bug rather than as the cooling period it is.
    """

    is_payable_now = serializers.SerializerMethodField()

    class Meta:
        model = PartnerPayoutAccount
        fields = (
            "id",
            "status",
            "account_last4",
            "ifsc",
            "holder_name",
            "verified_at",
            "effective_from",
            "is_payable_now",
            "rejection_reason",
            "created_at",
        )
        read_only_fields = fields

    @extend_schema_field(serializers.BooleanField())
    def get_is_payable_now(self, instance: PartnerPayoutAccount) -> bool:
        return (
            instance.status == PartnerPayoutAccount.Status.VERIFIED
            and instance.effective_from <= timezone.now()
        )


_IFSC = re.compile(r"^[A-Z]{4}0[A-Z0-9]{6}$")
#: Indian bank account numbers run from 9 to 18 digits.
_ACCOUNT_NUMBER = re.compile(r"^\d{9,18}$")
#: The holder name becomes the RazorpayX contact name, the stricter of the two places it goes (a
#: fund account allows 120 characters): 3 to 50 characters of letters, digits, space, the right
#: single quote (U+2019) and - _ / ( ) . -- ending in a letter, digit or full stop. Anything else
#: is a 400 from RazorpayX, which the Partner would only see as "details not accepted".
HOLDER_NAME_MIN_LENGTH = 3
HOLDER_NAME_MAX_LENGTH = 50
_HOLDER_NAME = re.compile(r"^[A-Za-z0-9 \u2019\-_/().]*[A-Za-z0-9.]$")
#: Phone keyboards type a straight quote or a left quote (U+2018); RazorpayX accepts only the
#: right one, so both are stored as U+2019.
_APOSTROPHES = str.maketrans({"'": "\u2019", "\u2018": "\u2019"})
_ALLOWED_NAME_MARKS = "\u2019 - _ / ( ) ."


class PartnerPayoutAccountCreateSerializer(serializers.Serializer[dict[str, str]]):
    """Bank details as the Partner types them. The full number is write-only: it is passed to the
    payout provider and never echoed, stored or logged."""

    holder_name = serializers.CharField(
        min_length=HOLDER_NAME_MIN_LENGTH,
        max_length=HOLDER_NAME_MAX_LENGTH,
        trim_whitespace=True,
        help_text=(
            "As on the bank account. 3 to 50 characters: letters, numbers, spaces and "
            f"{_ALLOWED_NAME_MARKS}, ending in a letter, number or full stop. A straight "
            "apostrophe is stored as \u2019."
        ),
    )
    account_number = serializers.CharField(write_only=True, max_length=40)
    confirm_account_number = serializers.CharField(write_only=True, max_length=40)
    ifsc = serializers.CharField(max_length=16)

    @staticmethod
    def _digits(value: str) -> str:
        return re.sub(r"[\s-]", "", value)

    def validate_holder_name(self, value: str) -> str:
        name = " ".join(value.translate(_APOSTROPHES).split())
        if len(name) < HOLDER_NAME_MIN_LENGTH:
            raise serializers.ValidationError("Enter the name as it appears on the bank account.")
        if not _HOLDER_NAME.match(name):
            raise serializers.ValidationError(
                f"Use only letters, numbers, spaces and {_ALLOWED_NAME_MARKS} in the name, and "
                "end it with a letter, number or full stop."
            )
        return name

    def validate_account_number(self, value: str) -> str:
        digits = self._digits(value)
        if not _ACCOUNT_NUMBER.match(digits):
            raise serializers.ValidationError("Enter the account number: 9 to 18 digits.")
        return digits

    def validate_ifsc(self, value: str) -> str:
        code = value.strip().upper()
        if not _IFSC.match(code):
            raise serializers.ValidationError(
                "Enter the 11-character IFSC, for example SBIN0001234."
            )
        return code

    def validate(self, attrs: dict[str, str]) -> dict[str, str]:
        if self._digits(attrs["confirm_account_number"]) != attrs["account_number"]:
            raise serializers.ValidationError(
                {"confirm_account_number": "The two account numbers do not match."}
            )
        return attrs


class OperationsPayoutAccountSerializer(serializers.ModelSerializer[PartnerPayoutAccount]):
    """What a reviewer needs to compare the details with the Partner's identity. Still masked."""

    partner_id = serializers.UUIDField(read_only=True)
    partner_display_name = serializers.CharField(source="partner.display_name", read_only=True)
    partner_phone_number = serializers.CharField(source="partner.user.phone_number", read_only=True)
    reviewed_by_id = serializers.UUIDField(read_only=True, allow_null=True)
    is_registered_with_provider = serializers.SerializerMethodField()

    class Meta:
        model = PartnerPayoutAccount
        fields = (
            "id",
            "partner_id",
            "partner_display_name",
            "partner_phone_number",
            "status",
            "account_last4",
            "ifsc",
            "holder_name",
            "is_registered_with_provider",
            "verified_at",
            "reviewed_by_id",
            "rejection_reason",
            "effective_from",
            "created_at",
        )
        read_only_fields = fields

    @extend_schema_field(serializers.BooleanField())
    def get_is_registered_with_provider(self, instance: PartnerPayoutAccount) -> bool:
        return bool(instance.provider_fund_account_id)


class OperationsPayoutAccountPageSerializer(serializers.Serializer[dict[str, Any]]):
    next = serializers.URLField(allow_null=True)
    previous = serializers.URLField(allow_null=True)
    results = OperationsPayoutAccountSerializer(many=True)


class RejectPayoutAccountRequestSerializer(serializers.Serializer[dict[str, str]]):
    reason = serializers.CharField(min_length=3, max_length=240, trim_whitespace=True)


class PayoutWebhookAcceptedSerializer(serializers.Serializer[dict[str, object]]):
    accepted = serializers.BooleanField()
    #: Whether the event settled a payout item. False for events this platform does not act on.
    applied = serializers.BooleanField()


class PayoutBatchItemSerializer(serializers.ModelSerializer[PayoutBatchItem]):
    """One transfer to one Partner: the sum of its ledger lines, refunds included."""

    partner_id = serializers.UUIDField(read_only=True)
    entry_count = serializers.SerializerMethodField(
        help_text="How many ledger lines this transfer covers, refunds included."
    )

    class Meta:
        model = PayoutBatchItem
        fields = (
            "id",
            "partner_id",
            "status",
            "amount_paise",
            "currency",
            "entry_count",
            "provider_payout_id",
            "provider_status",
            "utr",
            "mode",
            "fees_paise",
            "tax_paise",
            "status_reason",
            "failure_code",
            "submitted_at",
            "completed_at",
        )
        read_only_fields = fields

    def get_entry_count(self, instance: PayoutBatchItem) -> int:
        # `len(...all())` rather than `.count()`, so a prefetched batch costs no query per item.
        return len(instance.entries.all())


class PayoutBatchSerializer(serializers.ModelSerializer[PayoutBatch]):
    """A run, with both signatures on it.

    `proposed_by_id` and `approved_by_id` are both published so a console can render the
    maker-checker state without a second call — and so an approver can see at a glance that the
    batch in front of them is not one they proposed.
    """

    proposed_by_id = serializers.UUIDField(read_only=True)
    approved_by_id = serializers.UUIDField(read_only=True, allow_null=True)
    cancelled_by_id = serializers.UUIDField(read_only=True, allow_null=True)
    item_count = serializers.SerializerMethodField()
    items = serializers.SerializerMethodField()
    server_now = serializers.SerializerMethodField()

    class Meta:
        model = PayoutBatch
        fields = (
            "id",
            "reference",
            "kind",
            "approval_basis",
            "status",
            "period_start",
            "period_end",
            "proposed_by_id",
            "approved_by_id",
            "approved_at",
            "cancelled_by_id",
            "cancelled_at",
            "version",
            "total_paise",
            "currency",
            "item_count",
            "items",
            "server_now",
            "created_at",
        )
        read_only_fields = fields

    @extend_schema_field(serializers.IntegerField())
    def get_item_count(self, instance: PayoutBatch) -> int:
        return instance.items.count()

    @extend_schema_field(PayoutBatchItemSerializer(many=True))
    def get_items(self, instance: PayoutBatch) -> Any:
        return PayoutBatchItemSerializer(instance.items.all(), many=True).data

    @extend_schema_field(serializers.DateTimeField())
    def get_server_now(self, _instance: PayoutBatch) -> str:
        return timezone.now().isoformat()


class PayoutBatchListSerializer(serializers.ModelSerializer[PayoutBatch]):
    """The list row. Items are omitted: a run can hold hundreds, and a list of runs is not where
    anybody reads them."""

    proposed_by_id = serializers.UUIDField(read_only=True)
    approved_by_id = serializers.UUIDField(read_only=True, allow_null=True)
    item_count = serializers.SerializerMethodField()

    class Meta:
        model = PayoutBatch
        fields = (
            "id",
            "reference",
            "kind",
            "status",
            "period_start",
            "period_end",
            "proposed_by_id",
            "approved_by_id",
            "total_paise",
            "currency",
            "item_count",
            "created_at",
        )
        read_only_fields = fields

    @extend_schema_field(serializers.IntegerField())
    def get_item_count(self, instance: PayoutBatch) -> int:
        return instance.items.count()


class ProposePayoutBatchRequestSerializer(serializers.Serializer[dict[str, Any]]):
    reference = serializers.CharField(max_length=64)
    period_start = serializers.DateTimeField()
    period_end = serializers.DateTimeField()


class VersionedBatchCommandSerializer(serializers.Serializer[dict[str, Any]]):
    expected_version = serializers.IntegerField(min_value=1)


class LedgerAdjustmentRequestSerializer(serializers.Serializer[dict[str, Any]]):
    """A correction, which is always a new entry rather than an edit.

    `net_paise` is signed and deliberately has no minimum: a negative value is a reversal, which
    is the whole mechanism the settlement document asks for.
    """

    partner_id = serializers.UUIDField()
    net_paise = serializers.IntegerField()
    reason = serializers.CharField(max_length=240)
    corrects_id = serializers.UUIDField(required=False, allow_null=True)


class UnpayablePartnerSerializer(serializers.Serializer[dict[str, Any]]):
    """Partners owed money with no payable account. Reported, never silently skipped —
    a Partner left out of a run without explanation is a support ticket waiting to happen."""

    partner_ids = serializers.ListField(child=serializers.UUIDField())


class PayoutBatchPageSerializer(serializers.Serializer[dict[str, Any]]):
    next = serializers.URLField(allow_null=True)
    previous = serializers.URLField(allow_null=True)
    results = PayoutBatchListSerializer(many=True)


class PartnerLedgerPageSerializer(serializers.Serializer[dict[str, Any]]):
    next = serializers.URLField(allow_null=True)
    previous = serializers.URLField(allow_null=True)
    results = PartnerLedgerEntrySerializer(many=True)


class PartnerDailyPerformanceSerializer(serializers.Serializer[dict[str, object]]):
    date = serializers.DateField()
    net_paise = serializers.IntegerField()
    jobs = serializers.IntegerField()


class PartnerPerformanceSerializer(serializers.Serializer[dict[str, object]]):
    """How a Partner is doing, in the periods they think in.

    Platform-paid earnings come from the immutable payout ledger; direct-paid A3
    crew earnings come from mutually confirmed day settlements. Job counts use
    durable booking/visit earning records and engagement ``completed_at`` values,
    never mutable update timestamps or one row per project stage.
    """

    today_net_paise = serializers.IntegerField()
    today_direct_paise = serializers.IntegerField()
    today_jobs = serializers.IntegerField()
    month_net_paise = serializers.IntegerField()
    month_direct_paise = serializers.IntegerField()
    month_jobs = serializers.IntegerField()
    #: Averaged over months actually worked, never over the calendar.
    average_monthly_net_paise = serializers.IntegerField()
    lifetime_net_paise = serializers.IntegerField()
    lifetime_direct_paise = serializers.IntegerField()
    lifetime_jobs = serializers.IntegerField()
    daily = PartnerDailyPerformanceSerializer(many=True)
    currency = serializers.CharField()
    server_now = serializers.DateTimeField()


# --------------------------------------------------------------------------------------------
# Withdrawals
# --------------------------------------------------------------------------------------------

#: The four states a Partner follows a withdrawal through. Coarser than the transfer's own
#: status on purpose: "under review with the provider" and "submitted" are the same thing to
#: someone waiting for money — it has been sent and is on its way.
WITHDRAWAL_REQUESTED = "REQUESTED"
WITHDRAWAL_SENT = "SENT"
WITHDRAWAL_PAID = "PAID"
WITHDRAWAL_FAILED = "FAILED"
WITHDRAWAL_STATUSES = (
    WITHDRAWAL_REQUESTED,
    WITHDRAWAL_SENT,
    WITHDRAWAL_PAID,
    WITHDRAWAL_FAILED,
)
_SENT_ITEM_STATUSES = (PayoutBatchItem.Status.SUBMITTED, PayoutBatchItem.Status.UNDER_REVIEW)
_FAILED_ITEM_STATUSES = (
    PayoutBatchItem.Status.FAILED,
    PayoutBatchItem.Status.RELEASED,
    PayoutBatchItem.Status.REVERSED,
)
_BALANCE_RESTORED = "The money is back in your balance."


def withdrawal_status(item: PayoutBatchItem) -> str:
    if item.status == PayoutBatchItem.Status.PAID:
        return WITHDRAWAL_PAID
    if item.status in _FAILED_ITEM_STATUSES:
        return WITHDRAWAL_FAILED
    if item.status in _SENT_ITEM_STATUSES:
        return WITHDRAWAL_SENT
    return WITHDRAWAL_REQUESTED


def withdrawal_fee_paise(item: PayoutBatchItem) -> int:
    """The fee carried as a line of this transfer; 0 for a free withdrawal."""

    return -sum(
        line.amount_paise
        for line in item.entries.all()
        if line.ledger_entry.kind == PartnerLedgerEntry.Kind.FEE
    )


def _withdrawal_failure_message(item: PayoutBatchItem) -> str | None:
    if withdrawal_status(item) != WITHDRAWAL_FAILED:
        return None
    if item.failure_code == "declined_by_operations":
        note = item.batch.review_note or "Our team could not approve this withdrawal."
        return f"{note} {_BALANCE_RESTORED}"
    if item.status == PayoutBatchItem.Status.REVERSED:
        return f"Your bank sent this payment back. {_BALANCE_RESTORED}"
    if item.status == PayoutBatchItem.Status.RELEASED:
        return f"This withdrawal was stopped before it was sent. {_BALANCE_RESTORED}"
    return (
        f"The bank did not accept this payment. {_BALANCE_RESTORED} If it happens again, check "
        "your bank details."
    )


class PartnerWithdrawalSerializer(serializers.ModelSerializer[PayoutBatchItem]):
    """One withdrawal as the Partner follows it: Requested, Sent, Paid — or Failed, with the
    money back in their balance.

    `balance_paise` is what left the balance, `amount_paise` what the bank receives, and the
    difference is `fee_paise`. No batch id: it names machinery the Partner cannot act on.
    """

    status = serializers.SerializerMethodField()
    is_awaiting_review = serializers.SerializerMethodField(
        help_text="Waiting for our team to check it before it is sent: the first payout to a "
        "new bank account, or a balance above the withdrawal maximum."
    )
    balance_paise = serializers.SerializerMethodField(
        help_text="Taken from the available balance: the amount sent plus any fee."
    )
    fee_paise = serializers.SerializerMethodField()
    account_last4 = serializers.CharField(source="payout_account.account_last4", read_only=True)
    failure_message = serializers.SerializerMethodField()
    requested_at = serializers.DateTimeField(source="created_at", read_only=True)
    sent_at = serializers.DateTimeField(source="submitted_at", read_only=True, allow_null=True)

    class Meta:
        model = PayoutBatchItem
        fields = (
            "id",
            "status",
            "is_awaiting_review",
            "balance_paise",
            "fee_paise",
            "amount_paise",
            "currency",
            "account_last4",
            "utr",
            "failure_message",
            "requested_at",
            "sent_at",
            "completed_at",
        )
        read_only_fields = fields

    @extend_schema_field(serializers.ChoiceField(choices=WITHDRAWAL_STATUSES))
    def get_status(self, instance: PayoutBatchItem) -> str:
        return withdrawal_status(instance)

    @extend_schema_field(serializers.BooleanField())
    def get_is_awaiting_review(self, instance: PayoutBatchItem) -> bool:
        return instance.batch.status == PayoutBatch.Status.PENDING_APPROVAL

    @extend_schema_field(serializers.IntegerField())
    def get_balance_paise(self, instance: PayoutBatchItem) -> int:
        return instance.amount_paise + withdrawal_fee_paise(instance)

    @extend_schema_field(serializers.IntegerField())
    def get_fee_paise(self, instance: PayoutBatchItem) -> int:
        return withdrawal_fee_paise(instance)

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_failure_message(self, instance: PayoutBatchItem) -> str | None:
        return _withdrawal_failure_message(instance)


class PartnerWithdrawalPageSerializer(serializers.Serializer[dict[str, Any]]):
    next = serializers.URLField(allow_null=True)
    previous = serializers.URLField(allow_null=True)
    results = PartnerWithdrawalSerializer(many=True)


class PartnerWithdrawalPreviewSerializer(serializers.Serializer[dict[str, Any]]):
    """What tapping Withdraw would do right now, decided by the rules the request applies.

    The Partner app renders the button from this, so it never offers a withdrawal the request
    would refuse, and never refuses without saying why.
    """

    is_enabled = serializers.BooleanField(
        help_text="Whether withdrawals are open at all. When false, show no Withdraw button."
    )
    can_withdraw = serializers.BooleanField()
    refusal_reason = serializers.ChoiceField(
        choices=WITHDRAWAL_REFUSAL_REASONS, allow_null=True, required=False
    )
    refusal_message = serializers.CharField(allow_null=True, required=False)
    amount_paise = serializers.IntegerField(
        help_text="The whole available balance a withdrawal takes. Full balance only."
    )
    fee_paise = serializers.IntegerField(help_text="0 for the week's free withdrawal.")
    send_paise = serializers.IntegerField(help_text="What reaches the bank: amount less fee.")
    needs_review = serializers.BooleanField(
        help_text="It would wait for our team to check it before it is sent."
    )
    review_reasons = serializers.ListField(
        child=serializers.ChoiceField(choices=WITHDRAWAL_REVIEW_REASONS)
    )
    minimum_paise = serializers.IntegerField()
    maximum_paise = serializers.IntegerField(
        help_text="A balance above this still withdraws in full, after our team checks it."
    )
    withdrawals_left_today = serializers.IntegerField()
    free_withdrawals_left_this_week = serializers.IntegerField()
    account_last4 = serializers.CharField(allow_null=True, required=False)
    account_payable_from = serializers.DateTimeField(
        allow_null=True,
        required=False,
        help_text="When a new bank account's waiting period ends. Null once it has.",
    )
    currency = serializers.CharField()
    server_now = serializers.DateTimeField()


class OperationsWithdrawalTransferSerializer(serializers.ModelSerializer[PayoutBatchItem]):
    """The one transfer inside a withdrawal, with what a reviewer checks it against."""

    partner_id = serializers.UUIDField(read_only=True)
    partner_display_name = serializers.CharField(source="partner.display_name", read_only=True)
    partner_phone_number = serializers.CharField(source="partner.user.phone_number", read_only=True)
    account_last4 = serializers.CharField(source="payout_account.account_last4", read_only=True)
    account_ifsc = serializers.CharField(source="payout_account.ifsc", read_only=True)
    account_holder_name = serializers.CharField(source="payout_account.holder_name", read_only=True)
    account_verified_at = serializers.DateTimeField(
        source="payout_account.verified_at", read_only=True, allow_null=True
    )
    account_added_at = serializers.DateTimeField(source="payout_account.created_at", read_only=True)
    balance_paise = serializers.SerializerMethodField()
    fee_paise = serializers.SerializerMethodField()

    class Meta:
        model = PayoutBatchItem
        fields = (
            "id",
            "status",
            "partner_id",
            "partner_display_name",
            "partner_phone_number",
            "account_last4",
            "account_ifsc",
            "account_holder_name",
            "account_verified_at",
            "account_added_at",
            "balance_paise",
            "fee_paise",
            "amount_paise",
            "currency",
            "utr",
            "failure_code",
            "submitted_at",
            "completed_at",
        )
        read_only_fields = fields

    @extend_schema_field(serializers.IntegerField())
    def get_balance_paise(self, instance: PayoutBatchItem) -> int:
        return instance.amount_paise + withdrawal_fee_paise(instance)

    @extend_schema_field(serializers.IntegerField())
    def get_fee_paise(self, instance: PayoutBatchItem) -> int:
        return withdrawal_fee_paise(instance)


class OperationsWithdrawalSerializer(serializers.ModelSerializer[PayoutBatch]):
    """A Partner withdrawal in the Operations queue. `review_reasons` says why it is there."""

    review_reasons = serializers.ListField(
        child=serializers.ChoiceField(choices=WITHDRAWAL_REVIEW_REASONS), read_only=True
    )
    proposed_by_id = serializers.UUIDField(read_only=True)
    approved_by_id = serializers.UUIDField(read_only=True, allow_null=True)
    cancelled_by_id = serializers.UUIDField(read_only=True, allow_null=True)
    transfer = serializers.SerializerMethodField()

    class Meta:
        model = PayoutBatch
        fields = (
            "id",
            "reference",
            "status",
            "version",
            "review_reasons",
            "review_note",
            "approval_basis",
            "proposed_by_id",
            "approved_by_id",
            "approved_at",
            "cancelled_by_id",
            "cancelled_at",
            "transfer",
            "created_at",
        )
        read_only_fields = fields

    @extend_schema_field(OperationsWithdrawalTransferSerializer(allow_null=True))
    def get_transfer(self, instance: PayoutBatch) -> Any:
        items = list(instance.items.all())
        return OperationsWithdrawalTransferSerializer(items[0]).data if items else None


class OperationsWithdrawalPageSerializer(serializers.Serializer[dict[str, Any]]):
    next = serializers.URLField(allow_null=True)
    previous = serializers.URLField(allow_null=True)
    results = OperationsWithdrawalSerializer(many=True)


class DeclineWithdrawalRequestSerializer(serializers.Serializer[dict[str, Any]]):
    expected_version = serializers.IntegerField(min_value=1)
    reason = serializers.CharField(
        min_length=3,
        max_length=240,
        trim_whitespace=True,
        help_text="Shown to the Partner. Say what they can do next.",
    )
