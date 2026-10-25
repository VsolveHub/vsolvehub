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


class PartnerLedgerEntrySerializer(serializers.ModelSerializer[PartnerLedgerEntry]):
    """One line of a Partner's statement.

    `calculation_snapshot` is published deliberately: a Partner is entitled to see why they were
    paid what they were paid, and "the commission was 18% capped at ₹X, applied to the two tasks
    you actually completed" is the answer. Hiding it turns every payment question into a support
    ticket.
    """

    booking_id = serializers.UUIDField(read_only=True, allow_null=True)
    corrects_id = serializers.UUIDField(read_only=True, allow_null=True)

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
            "created_at",
        )
        read_only_fields = fields


class PartnerBalanceSerializer(serializers.Serializer[dict[str, Any]]):
    """What is owed, by state.

    Four numbers rather than one, because "you have ₹4,200" is not true in any useful sense when
    ₹1,800 of it is held behind an open quality case. A Partner planning their week needs to know
    which part of it is actually coming.
    """

    pending_paise = serializers.IntegerField()
    available_paise = serializers.IntegerField()
    reserved_paise = serializers.IntegerField()
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


class PartnerPayoutAccountCreateSerializer(serializers.Serializer[dict[str, str]]):
    """Bank details as the Partner types them. The full number is write-only: it is passed to the
    payout provider and never echoed, stored or logged."""

    holder_name = serializers.CharField(min_length=2, max_length=140, trim_whitespace=True)
    account_number = serializers.CharField(write_only=True, max_length=40)
    confirm_account_number = serializers.CharField(write_only=True, max_length=40)
    ifsc = serializers.CharField(max_length=16)

    @staticmethod
    def _digits(value: str) -> str:
        return re.sub(r"[\s-]", "", value)

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
    partner_id = serializers.UUIDField(read_only=True)
    ledger_entry_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = PayoutBatchItem
        fields = (
            "id",
            "partner_id",
            "ledger_entry_id",
            "status",
            "amount_paise",
            "currency",
            "provider_payout_id",
            "failure_code",
            "submitted_at",
            "completed_at",
        )
        read_only_fields = fields


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
