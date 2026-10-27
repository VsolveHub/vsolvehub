"""Payout sending and scheduled reconciliation."""

from datetime import timedelta
from uuid import UUID

from celery import shared_task
from django.conf import settings
from django.db.models import Q
from django.utils import timezone

from apps.payouts.models import PayoutBatchItem
from apps.payouts.providers import PayoutProviderError, get_payout_provider
from apps.payouts.services import (
    apply_payout_result,
    settle_unconfirmed_payout,
    submit_payout_item,
    unsent_payout_item_ids,
)

#: How long a reserved transfer in a paying batch may sit unclaimed before its send job is
#: presumed lost. Long enough that a job merely queued behind others is not doubled; doubling
#: would be harmless anyway, because only one claim can win.
_UNSENT_GRACE = timedelta(minutes=2)


@shared_task(name="apps.payouts.tasks.send_payout_item")
def send_payout_item(item_id: str) -> str:
    """Send one transfer, outside any database transaction (`submit_payout_item`).

    Queued by the `payout.submission_requested` outbox handler after its commit, and again by
    `resume_payout_submissions` if this job was lost. Safe to run twice: the claim lets one run
    through and the other finds the item taken.
    """

    return submit_payout_item(item_id=UUID(item_id)).status


@shared_task(name="apps.payouts.tasks.resume_payout_submissions")
def resume_payout_submissions() -> int:
    """Re-queue reserved transfers in paying batches whose send job never ran.

    Never re-sends: a transfer already claimed (`SUBMITTING` or later) is not reserved, so it is
    not picked up here. Those are settled by the provider's answer or by `reconcile_payouts`.
    """

    item_ids = unsent_payout_item_ids(older_than=_UNSENT_GRACE)
    for item_id in item_ids:
        send_payout_item.delay(str(item_id))
    return len(item_ids)


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

    A transfer still `SUBMITTING` after `PAYOUT_SUBMITTING_STALE_MINUTES` is one whose sending
    process died between the claim and the answer, and is looked up the same way. A fresher one
    is mid-call, and left to finish.
    """

    stale_before = timezone.now() - timedelta(minutes=settings.PAYOUT_SUBMITTING_STALE_MINUTES)
    pending = list(
        PayoutBatchItem.objects.filter(
            Q(status__in=(PayoutBatchItem.Status.SUBMITTED, PayoutBatchItem.Status.UNDER_REVIEW))
            | Q(status=PayoutBatchItem.Status.SUBMITTING, submitted_at__lt=stale_before)
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
