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
            "created_at",
        )
        read_only_fields = fields

    @extend_schema_field(serializers.BooleanField())
    def get_is_payable_now(self, instance: PartnerPayoutAccount) -> bool:
        return (
            instance.status == PartnerPayoutAccount.Status.VERIFIED
            and instance.effective_from <= timezone.now()
        )


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
