"""Celery maintenance tasks for Partner presence and private uploads."""

from celery import shared_task

from apps.partners.services import (
    cleanup_stale_partner_document_uploads,
    expire_missing_presence_sessions,
)
from apps.partners.storage import DocumentStorageError


@shared_task(
    autoretry_for=(RuntimeError,),
    retry_backoff=True,
    retry_jitter=True,
    max_retries=3,
)
def reconcile_partner_presence_sessions() -> int:
    return expire_missing_presence_sessions()


@shared_task(
    autoretry_for=(DocumentStorageError,),
    retry_backoff=True,
    retry_jitter=True,
    max_retries=5,
)
def cleanup_partner_document_uploads() -> int:
    return cleanup_stale_partner_document_uploads()
