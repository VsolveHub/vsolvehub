"""Scheduled payout reconciliation."""

from celery import shared_task

from apps.payouts.models import PayoutBatchItem
from apps.payouts.providers import PayoutProviderError, get_payout_provider
from apps.payouts.services import apply_payout_result, settle_unconfirmed_payout


@shared_task(name="apps.payouts.tasks.reconcile_payouts")
def reconcile_payouts() -> int:
    """Ask the provider about every payout we are not certain of.

    Only *reads*, and settles an item once the provider is definite about it. A transfer with a
    provider id is fetched by that id. One whose submission got no clear answer has no id, so it
    is looked up by the reference it was sent with: found, it is settled like any other result;
    still unknown to the provider a day later, it was never received and its money goes back to
    the pool. It is never sent a second time — a second `create_payout` against an unknown
    outcome is exactly how somebody gets paid twice. An item the provider is still unsure about
    is left alone, which is the correct outcome rather than a failure to handle.
    """

    pending = list(
        PayoutBatchItem.objects.filter(
            status__in=(PayoutBatchItem.Status.SUBMITTED, PayoutBatchItem.Status.UNDER_REVIEW)
        )
    )
    if not pending:
        return 0

    provider = get_payout_provider()
    checked = 0
    for item in pending:
        try:
            if item.provider_payout_id:
                result = provider.fetch_payout(provider_payout_id=item.provider_payout_id)
                apply_payout_result(
                    item_id=item.id,
                    status=result.status,
                    failure_reason=result.failure_reason,
                    tracking=result,
                )
            else:
                found = provider.find_payout_by_reference(reference=item.id.hex)
                settle_unconfirmed_payout(item_id=item.id, found=found)
        except PayoutProviderError:
            continue
        checked += 1
    return checked
