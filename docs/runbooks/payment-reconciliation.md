# Payment and refund reconciliation runbook

## Scope

Django owns payment, allocation, booking, refund and tax-document state. Razorpay is an external
source of payment/refund observations, not the booking system of record. Every amount is stored in
integer paise and is checked against the immutable Booking Group quote and Fulfilment Unit lines.

## Required production configuration

- `PAYMENT_PROVIDER=razorpay`
- `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` supplied by the secret manager only
- `PAYMENT_WEBHOOK_SECRET` is an independent high-entropy secret of at least 32 characters
- `RAZORPAY_API_BASE_URL=https://api.razorpay.com/v1`
- `PAYMENT_LEGAL_ENTITY_CODE` identifies the invoicing entity
- `PAYMENT_LIVE_COLLECTIONS_APPROVED=true` only after written Finance/legal approval

Production startup fails closed when these settings are absent or insecure. The `fake` provider is
for local development and tests only and is never selected as a fallback.

## Normal flow and invariants

1. Payment can start only after every required Fulfilment Unit has a live tentative Partner hold.
2. A `PaymentAttempt` allocates the exact group total across every immutable unit line before a
   provider order is requested. The client supplies no authoritative price.
3. Provider order creation is idempotent. A timeout is ambiguous and remains reconcilable; it is
   never converted into an assumed failure or success.
4. The webhook endpoint verifies the signature against the unmodified request body, deduplicates
   by provider event ID/content hash and stores only normalized event fields—not complete payloads.
5. Capture atomically revalidates/reacquires capacity, creates one Order for the Booking Group and
   one Booking per Fulfilment Unit, then issues an invoice with deterministic financial-year
   numbering. Duplicate or out-of-order events cannot downgrade a terminal payment.
6. Refunds consume the original line allocations. Partial unit refunds issue credit notes and
   cannot exceed the remaining refundable amount.

## Reconciliation and Finance handling

Celery beat schedules `apps.commerce.tasks.reconcile_payments` every 30 seconds and
`apps.commerce.tasks.reconcile_refunds` every 60 seconds. A worker fans records out to retrying,
idempotent per-record tasks. Finance can also invoke the authenticated reconciliation endpoints.

Investigate records where `reconciliation_state=needs_attention`, refunds in `under_review` or
`failed`, and open `FinancialException` rows. Compare provider IDs, amount, currency and status;
never change database state manually. Re-run the domain reconciliation command or endpoint after
the provider is reachable. Resolve the exception only after the local projections, allocations and
provider truth agree, retaining the audit history.

## Failure behavior

- An amount/currency mismatch fails closed and opens a Finance-visible exception.
- A definitive provider rejection is recorded as failed; an ambiguous timeout remains pending for
  reconciliation.
- A captured payment without recoverable capacity triggers an automatic full refund and an open
  capacity exception. No Booking or invoice is created.
- A failed or ambiguous refund never increments refunded allocations or emits a credit note.
- Webhook signatures, secrets, complete payloads and payment credentials must never be logged.

## Release and incident checks

- Run `scripts\\quality.cmd`, migration checks and OpenAPI validation before deployment.
- Run a staging drill for redirect loss, duplicate/out-of-order webhooks, provider timeouts, a
  capture/hold race, partial unit refunds and refund failure recovery.
- Confirm a durable Celery worker and beat scheduler are deployed with Redis connectivity and alert
  when reconciliation queues age, task retries exhaust or open financial exceptions grow.
- Configure the Razorpay webhook to the public HTTPS endpoint and enable only supported events.
- Obtain Finance/legal approval for capture policy, tax fields, numbering and refund operations;
  keep `PAYMENT_LIVE_COLLECTIONS_APPROVED=false` until complete.
- During an incident, stop new payment initiation at the application edge, continue accepting and
  authenticating webhooks, preserve all audit records and reconcile provider truth before resuming.

Provider references: [API authentication](https://razorpay.com/docs/api/authentication/),
[webhook validation](https://razorpay.com/docs/webhooks/validate-test/), and
[refund API](https://razorpay.com/docs/api/refunds/).
