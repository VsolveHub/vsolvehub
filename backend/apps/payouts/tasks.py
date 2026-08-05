"""Scheduled payout reconciliation."""

from celery import shared_task

from apps.payouts.models import PayoutBatchItem
from apps.payouts.providers import PayoutProviderError, get_payout_provider
from apps.payouts.services import apply_payout_result


@shared_task(name="apps.payouts.tasks.reconcile_payouts")
def reconcile_payouts() -> int:
    """Ask the provider about every payout we are not certain of.

    `UNDER_REVIEW` items are the ones an ambiguous response parked, and they are deliberately
    never re-submitted — a second `create_payout` against an unknown outcome is exactly how
    somebody gets paid twice. This only *reads*, and settles an item once the provider is
    definite about it. An item the provider is still unsure about is left alone, which is the
    correct outcome rather than a failure to handle.
    """

    pending = PayoutBatchItem.objects.filter(
        status__in=(PayoutBatchItem.Status.SUBMITTED, PayoutBatchItem.Status.UNDER_REVIEW)
    ).exclude(provider_payout_id="")
    if not pending.exists():
        return 0

    provider = get_payout_provider()
    settled = 0
    for item in pending:
        try:
            result = provider.fetch_payout(provider_payout_id=item.provider_payout_id)
        except PayoutProviderError:
            continue
        apply_payout_result(
            item_id=item.id, status=result.status, failure_reason=result.failure_reason
        )
        settled += 1
    return settled
