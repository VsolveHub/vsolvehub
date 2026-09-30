# M3 Staging Acceptance Gate

Checklist for declaring M3 staging-ready before any merge to `main`.  
Do **not** put real secrets, key values, or webhook secrets in this file or in git.

## 1. Razorpay environment checklist (names only)

Confirm staging (or local tunnel) has these variables set. Values live only in the environment or secret store — never in source, docs, fixtures, or logs.

| Variable | Expected for M3 staging UAT |
| --- | --- |
| `PAYMENT_PROVIDER` | `razorpay` (not `development`) for real Checkout UAT |
| `RAZORPAY_KEY_ID` | Test-mode key id (`rzp_test_…`) |
| `RAZORPAY_KEY_SECRET` | Matching test-mode secret |
| `PAYMENT_WEBHOOK_SECRET` | Secret configured on the Razorpay webhook (required; key pair alone is not enough) |
| `RAZORPAY_API_BASE_URL` | Default Razorpay API base unless overridden |

Also confirm:

- Dashboard is in **test mode** for M3 UAT.
- Live (`rzp_live_…`) credentials are **not** used for this gate.
- Collections credentials are separate from any RazorpayX payout credentials.
- See also: [m3-razorpay-integration.md](./m3-razorpay-integration.md).

## 2. Webhook events

Razorpay webhook endpoint must be reachable (typically via ngrok → API) and subscribed to at least:

- `payment.authorized`
- `payment.captured`
- `payment.failed`

Verify:

1. Webhook URL points at the Django webhook route (not a frontend origin).
2. Signature verification uses `PAYMENT_WEBHOOK_SECRET`.
3. A successful test payment produces `authorized` / `captured` handling in app state.
4. A declined / failed test payment produces `payment.failed` and a failed attempt state (no false success).

## 3. Celery + ngrok

M3 staging UAT needs async workers and a public tunnel for provider callbacks.

**Celery**

- Redis is up (broker/result as configured for local/staging).
- Celery worker is running against the same settings as the API.
- Outbox / payment reconciliation tasks are not blocked (worker logs show consumption, no silent queue pile-up).

**Ngrok (and optional nginx gateway)**

- Public HTTPS URL forwards to the local API (or to the nginx gateway on `8080` if using the multi-app map).
- Razorpay webhook URL uses the current ngrok host (ngrok URLs change unless reserved).
- After restarting ngrok, update the Razorpay dashboard webhook URL **and** the Checkout **website allowlist** (parent page origin) before retesting payments.
- See: [local-ngrok-nginx-gateway.md](./local-ngrok-nginx-gateway.md), [m3-razorpay-integration.md](./m3-razorpay-integration.md).

## 4. OTP for M3 demo (MSG91 deferred)

For M3 demo / staging acceptance:

- `OTP_PROVIDER=development` is **acceptable**.
- OTP may be shown in the UI / API response / local logs for testers — do not treat this as production policy.
- MSG91 (`OTP_PROVIDER=msg91`, auth key, template id, DLT-approved template) is **deferred** past this M3 gate.
- Do not block M3 UAT on SMS delivery.
- See: [m3-msg91-otp.md](./m3-msg91-otp.md).

## 5. Browser UAT — Customer / Partner / Operations

Run interactive browser UAT on Cursor Browser (or equivalent) against the live local/staging stack. Complete and retest failures **per application** before moving on:

1. **Customer** (`http://localhost:3000` or gateway `/`) — finish every Customer M3 flow.
2. **Partner** (`http://localhost:3001` or gateway `/partner/`) — finish every Partner M3 flow.
3. **Operations** (`http://localhost:3002/ops/...` with `NEXT_PUBLIC_BASE_PATH=/ops`, or gateway `/ops/`) — finish every Operations M3 requirement. For direct `:3002` (no nginx), keep **non-empty** `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000` or session/catalog calls 404.

Gate rules:

- Capture failure evidence (console / network) before fixing.
- Do not mark a flow passed until browser verification succeeds after the fix.
- Do not advance to the next app only because one flow is hard.
- Prefer project M3 runbooks and smoke docs as the source of truth for flows.

Related: [m3-end-to-end.md](./m3-end-to-end.md), [m3-browser-evidence.md](./m3-browser-evidence.md), [m3-demo-freeze.md](./m3-demo-freeze.md).

## 6. Merge to `main` — owner approval only

- Do **not** merge the M3 integration branch to `main` after this checklist alone.
- Staging deploy scaffolding and CI remain draft until the owner approves.
- Merge / promote to `main` **only after explicit owner approval**.
- Do not discard unrelated uncommitted work; do not run destructive git cleanup as part of this gate.

## Sign-off (fill at gate time)

| Check | Owner / tester | Date | Pass? |
| --- | --- | --- | --- |
| Razorpay env (test mode, webhook secret present) | | | |
| Webhook events authorized / captured / failed | | | |
| Celery worker healthy | | | |
| Ngrok URL current and webhook updated | | | |
| Development OTP OK for demo | | | |
| Customer browser UAT complete | | | |
| Partner browser UAT complete | | | |
| Operations browser UAT complete | | | |
| Owner approval to merge `main` | | | |
