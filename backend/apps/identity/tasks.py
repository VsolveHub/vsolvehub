"""Scheduled identity and privacy work."""

from celery import shared_task

from apps.identity.retention import run_retention_sweep


@shared_task(name="apps.identity.tasks.run_retention_sweep")
def run_retention_sweep_task() -> dict[str, int]:
    """Scheduled retention.

    Consent receipts and privacy requests are deliberately untouched — a consent receipt is the
    evidence somebody agreed to something, and deleting it destroys the platform's own defence.
    Verified-KYC retention is a legal schedule that has not been approved (R7) and is not guessed
    at here.
    """

    return {key: int(value) for key, value in run_retention_sweep().items()}
