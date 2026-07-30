"""Celery maintenance tasks for Partner presence audit sessions."""

from celery import shared_task

from apps.partners.services import expire_missing_presence_sessions


@shared_task(
    autoretry_for=(RuntimeError,),
    retry_backoff=True,
    retry_jitter=True,
    max_retries=3,
)
def reconcile_partner_presence_sessions() -> int:
    return expire_missing_presence_sessions()
