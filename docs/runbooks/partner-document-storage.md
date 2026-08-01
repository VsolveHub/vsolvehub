# Partner document storage runbook

## Scope

Partner KYC files live in a private Supabase Storage bucket. PostgreSQL stores only immutable object
metadata, verification state and review history. The browser never receives the service-role key,
and Operations never receives a permanent object URL.

## Required production configuration

- `DOCUMENT_STORAGE_PROVIDER=supabase`
- `SUPABASE_STORAGE_URL=https://<project>.supabase.co/storage/v1`
- `SUPABASE_SERVICE_ROLE_KEY` supplied by the secret manager only
- `PARTNER_DOCUMENT_BUCKET` names a private bucket
- `PARTNER_DOCUMENT_REVIEW_URL_TTL_SECONDS` defaults to 300 seconds
- `PARTNER_DOCUMENT_ORPHAN_RETENTION_HOURS` defaults to 24 hours

Production startup fails when the provider, HTTPS API URL, service-role key, bucket or positive TTLs
are missing. Never expose these values in frontend environment variables or logs.

## Upload and review invariants

1. Django validates the declared media type, size and SHA-256, generates a random object key and
   issues a two-hour signed upload grant.
2. The browser uploads directly to the private bucket. Resumable uploads use the returned token as
   the TUS `x-signature`; direct uploads use the returned signed `PUT` URL.
3. Finalization streams the private object back through Django and compares authoritative byte
   count, normalized content type and SHA-256 before creating a `PartnerDocument` record.
4. New documents start with `scan_status=PENDING`. Submission may continue, but no reviewer can
   reveal or approve the file until a trusted scanner records `CLEAN`.
5. Only the assigned Operations reviewer can request a short-lived review URL. Every successful
   reveal and every self-review denial is audited. Signed URLs and tokens must never be logged,
   persisted in browser storage or copied into analytics.

## Failure and cleanup behavior

- Provider timeouts return a retryable `503`; no success state is inferred.
- Expired, reused or metadata-mismatched upload intents fail closed. A mismatch cannot be replayed.
- Celery beat runs `cleanup_partner_document_uploads` hourly. It deletes only expired or failed,
  unaccepted upload objects after the configured recovery window. Supabase `404` is treated as an
  idempotent successful deletion.
- Verified objects are never deleted by orphan cleanup. Deletion of accepted, rejected or
  superseded KYC records requires the approved legal retention schedule and a separate audited
  lifecycle command.

## Release blockers and operational checks

- Select and security-review the malware scanning provider, including encrypted transport,
  regional/data-processing terms, authenticated result delivery, retry/reconciliation semantics
  and stable non-sensitive failure codes. Until then, every uploaded document remains fail-closed
  at `PENDING` outside tests or an explicitly trusted internal integration.
- Legal/privacy must approve retention periods for verified KYC records before production launch.
- Alert on sustained storage `5xx`/timeouts, rising `FAILED` or old `PENDING` scan counts, cleanup
  retry exhaustion and reveal-volume anomalies. Alerts must contain IDs and failure codes, never
  signed URLs, object bytes or identity-document contents.
- During an incident, disable new onboarding uploads at the application edge, preserve database
  audit records and reconcile provider objects against upload-intent IDs before re-enabling.

Provider references: [private bucket access](https://supabase.com/docs/guides/storage/buckets/fundamentals),
[signed upload URLs](https://supabase.com/docs/reference/javascript/file-buckets-createsigneduploadurl),
[resumable uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads), and
[object deletion](https://supabase.com/docs/guides/storage/management/delete-objects).
