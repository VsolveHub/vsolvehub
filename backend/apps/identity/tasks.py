"""Scheduled identity and privacy work."""

from celery import shared_task

from apps.identity.account_deletion import process_due_account_deletions
from apps.identity.retention import run_retention_sweep


@shared_task(name="apps.identity.tasks.process_due_account_deletions")
def process_due_account_deletions_task() -> dict[str, int]:
    """Erase accounts whose deletion date has passed; hold the ones that cannot be yet."""

    return process_due_account_deletions()


@shared_task(name="apps.identity.tasks.run_retention_sweep")
def run_retention_sweep_task() -> dict[str, int]:
    """Scheduled retention.

    Consent receipts and privacy requests are deliberately untouched — a consent receipt is the
    evidence somebody agreed to something, and deleting it destroys the platform's own defence.
    Verified-KYC retention is a legal schedule that has not been approved (R7) and is not guessed
    at here.
    """

    return {key: int(value) for key, value in run_retention_sweep().items()}
