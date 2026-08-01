# M1 Backend/Frontend Execution Board

Purpose: complete the M1 vertical slice quickly without guessed contracts, duplicate business logic
or conflicting Codex/Claude edits.

## Ownership and coordination

- Codex owns `backend/**`, `infra/**`, generated `contracts/openapi/**`, backend ADRs/runbooks and
  this execution board.
- Claude owns `frontend/apps/**`, `frontend/packages/**` and focused frontend tests.
- Accepted files under `contracts/proposals/**` describe approved intent only. They are not runtime
  contracts until Django implements them and Codex regenerates OpenAPI.
- Claude reports completed task IDs, files changed, commands run and blockers in its handoff. Codex
  reconciles the shared M1 task documents so two agents do not edit the same tracker concurrently.
- Before parallel work, the user checkpoints the current dirty tree or creates separate
  branches/worktrees. Neither agent resets, deletes or overwrites the other's work.

## Status definitions

| Status | Meaning |
| --- | --- |
| Done | Implementation, contract integration and required verification all pass. |
| Partial | Useful code exists, but an explicitly named acceptance requirement is missing. |
| Blocked | Work must not continue until a named backend contract or product decision is published. |
| Not started | No production implementation exists. |

`Ready` below means the owner may start now. It never means the task is complete.

## Critical dependency chain

| Dependency | Codex backend deliverable | Frontend unlocked |
| --- | --- | --- |
| BE-01 | Credentialed CORS plus JSON CSRF bootstrap; FE-05 supplies the real-browser acceptance proof (proposal 0006). | Real Customer/Partner/Operations authenticated mutations. |
| BE-02 | Session projection, lowercase role/error contract, OTP metadata, Operations active-role and self-review protection (proposal 0004). | Final auth guards and Operations login. |
| BE-03 | Versioned OpenAPI publication, examples, idempotency headers and backend schema-freshness gate (proposal 0001). | Claude regenerates the client and integrates without local DTOs. |
| BE-04 | Service areas, skills, required consents and true application PATCH (proposal 0005). | Complete Partner application and presence UI. |
| BE-05 | Signed private document upload/review and Operations application queue/detail. | KYC upload and Operations review UI. |
| BE-06 | A1 task lines, opaque windows, complete quote and explicit cart replacement conflict (proposal 0003). | Customer scope/window/review/cart integration. |
| BE-07 | Checkout read/cancel/recovery, autonomous dispatch and separate Customer/Partner projections. | Finding, commitment, recovery and Partner offer inbox. |
| BE-08 | Payment/refund/invoice HTTP APIs and Razorpay reconciliation. | Customer payment and receipt flows. |
| BE-09 | Fulfilment, start OTP, evidence, amendment, completion, cancellation and recovery. | Customer active booking and Partner work UI. |
| BE-10 | Cases, ledger, payout, notifications, recovery jobs, observability and runbooks. | Operations resolution and Partner earnings. |

## Codex backend lane

| ID | Status | Ready | Task | Done when |
| --- | --- | --- | --- | --- |
| BE-01 | Partial | Backend complete; FE-05 verification | Credentialed CORS, typed JSON CSRF bootstrap, rotation/recovery semantics and rejected-origin middleware tests are published in OpenAPI 1.4.0. | Backend/API tests pass. The real Django-backed Playwright mutation and browser-storage assertion remain in frontend-owned FE-05. |
| BE-02 | Done | — | Stable anonymous/authenticated session projection, active role, OTP code length, throttle wait, safe error fallback, lowercase codes, Operations active-role authorization and self-review denial are published. | Direct/indirect role, revoked-grant, allowed/denied audit, application/document self-review and regression tests pass. |
| BE-03 | Done | — | OpenAPI 1.4.0 and its migration changelog, representative examples, typed checkout `Idempotency-Key` headers and the backend schema-drift gate are published. | Django schema and committed OpenAPI match; backend quality fails on migration/schema drift. Claude owns generated TypeScript freshness in FE-05. |
| BE-04 | Done | — | Applicant-visible accepting service areas, canonical skills, current versioned consent documents and genuinely partial optimistic-concurrency PATCH are published in OpenAPI 1.4.0. | Independent draft saves preserve omitted fields; closed areas, stale versions and superseded consents fail closed; API/conflict/schema tests pass. |
| BE-05 | Partial | Backend/API complete; R7 release decisions | OpenAPI 1.5.0 publishes server-owned private signed upload/finalize, streamed size/type/SHA-256 verification, fail-closed scan state, delayed orphan cleanup, masked audited reviewer access and Operations queue/detail/claim ownership. | Upload/checksum/replay/expiry/provider-failure/cleanup, replace/reject, cursor pagination, claim, self-review, scan gate and reveal-audit tests pass. Approved malware integration and verified-KYC legal retention/deletion remain production blockers. |
| BE-06 | Partial | After BE-03 | Complete public A1 task/minimum policy, opaque Today/Scheduled windows, quote lines/tax/expiry/cancellation bands and explicit singleton replacement conflict. | Client price/time tampering is ignored; concurrent window/quote/cart tests pass. |
| BE-07 | Partial | After BE-06 | Add checkout projection/read/cancel/failure states; move dispatch/offer/undo/payment expiry to Celery; publish bounded Partner inbox polling projection. | Closing all browsers does not stop state progress; Customer and Partner payloads cannot leak into each other. |
| BE-08 | Initial skeleton | After BE-07 | Build provider protocols and payment/refund/invoice/reconciliation HTTP surface. | Duplicate/out-of-order webhooks, redirect loss, capture-expiry races and failed refunds converge safely. |
| BE-09 | Not started | After BE-08 | Implement B8 fulfilment commands and state machines. | M1 arrival through completion/partial/dispute/recovery scenarios pass with idempotency and audit. |
| BE-10 | Not started | Can begin foundations after BE-03 | Implement B9/B10 cases, ledger, payout, async recovery, notifications, kill switches, metrics, ADRs and runbooks. | Financial maker-checker, provider ambiguity, worker crash/replay and production-readiness drills pass. |

## Claude frontend lane

Claude starts only tasks marked `Ready: Yes`. A blocked task may be reviewed or designed, but no
runtime endpoint, DTO, price, deadline, role, identifier or success state may be invented.

| ID | Status | Ready | Task | Stop condition / done evidence |
| --- | --- | --- | --- | --- |
| FE-01 | Done | — | Removed the `callPending` raw fetch and the windows/quote/checkout-session hooks. The window step renders an `unpublished` boundary that issues no request; adapters, view models and fixtures are retained as test inputs only. | `contract-pending/boundary.test.ts` now fails the build if a production module names an unpublished path or raw-fetches the API outside the two `lib/api/` client factories. 9 window-boundary tests; lint, typecheck and Customer build pass. |
| FE-02 | Done | — | `RECOVERY_BY_CODE` rekeyed to the lowercase codes Django emits; `KnownRole` is now `customer`/`partner`/`operations`/`finance`. Entries for unbuilt domains were deleted rather than re-cased. | The old uppercase table matched nothing, so every domain error fell through to status classification. Tests cover the real codes, the status fallback, and that a casing-only variant does **not** match. Typed role-switch integration belongs to FE-05 against current OpenAPI 1.5.0. |
| FE-03 | Done | — | `logging.fetches.fullUrl` is development-only in all three apps; the Partner 10 MB Server Action cap is removed (zero Server Actions remain); Operations metadata carries the product name while the app stays physically `admin`. | The Operations root no longer publishes internal readiness to anonymous visitors — it is a minimal entry screen with **no sign-in form**, since a login that cannot establish a session would be a claim the server cannot honour. E2E asserts the absence of both the readiness leak and the form. Three builds pass. |
| FE-04 | Done | — | Shared harness in `e2e/support/responsive.ts` runs 9 contract-independent routes (Customer catalog/category/404, Partner home/pricing/contact/404, Operations entry/404) at 375/768/1024/1440 plus 200% zoom, with landmark/`h1`, keyboard focus-indicator and reduced-motion checks. | Playwright grew 5 → **79** tests, all passing. No responsive or contrast defect was found, so no UI fix was needed. Authenticated routes are excluded on purpose and move into FE-05; `workers: 2` because three single-process `next start` servers, not the browser, were the bottleneck. |
| FE-05 | Done | — | Client regenerated at **1.5.0**, and `generate:check` now gates `typecheck` through turbo (proven to fail on drift). CSRF moved from `document.cookie` to the typed in-memory token with one rotation retry; session reads the anonymous-safe projection; `useSwitchRole` added; Operations is a dynamic role-guarded shell requiring the *selected* Operations role, not merely the grant. | `e2e/django.e2e.ts` proves it against real Django: credentialed CORS, an unreadable HttpOnly cookie, OTP login through the shipped UI, an authenticated mutation, revoke ending the session, and no token in web storage. That test found a real gap — DRF answers **403**, not 401, for a missing session, so `onUnauthorized` and the guard now key on the error code; regression tests cover both. |
| FE-06 | Done | — | `/apply/areas` and `/apply/consent` are real steps reading `GET /service-areas/` and `/partner/required-consents/`; skills come from `GET /partner/skills/`, so the catalog walk is gone and labels are no longer guessed from a slug. `changedFields` sends only what a step edited — which the partial PATCH makes not just possible but required. Presence ships at `/availability`. | Reference data sits under a `reference.*` key at `STATIC_CONTENT` and is fetched with `useQueries`, so saving an application never invalidates it and the three reads do not re-form a waterfall. Presence never claims availability Django has not confirmed: `stale`, `connecting` and `unknown` are distinct states, covered by 11 tests. |
| FE-07 | Partial | Yes — OpenAPI 1.5.0 | Complete signed document upload/replacement and Operations application queue/detail/claim/masked reveal. | Upload retry/progress, expired URL, conflict, forbidden/self-review, pending-scan and sensitive reveal states pass without storing KYC data or signed URLs. |
| FE-08 | Partial | No — BE-06 | Integrate Customer cart, merge/replace decision, opaque windows and complete quote; delete proposal runtime adapters once replaced. | All server state comes through generated types; no frontend money/time arithmetic or fixture policy appears in production. |
| FE-09 | Not started | No — BE-07 | Build Customer finding/recovery and Partner offer inbox using bounded polling as observation only. | Polling pauses/backs off correctly, reconnects from server truth and never advances dispatch from the browser. |
| FE-10 | Not started | No — BE-08 | Build payment attempt, redirect/SDK boundary, ambiguity recovery, receipt/refund/invoice UI. | Stable idempotency keys, no mutation auto-retry, redirect loss and duplicate submission tests pass. |
| FE-11 | Not started | No — BE-09 | Build Customer active-booking and Partner fulfilment/work/evidence/amendment/completion UI. | Backend-authorized actions only; reload/multi-tab/stale-version/partial-failure accessibility tests pass. |
| FE-12 | Not started | No — BE-10 | Build Operations cases/timelines/kill switches/maker-checker and Partner ledger/payout screens. | Sensitive data is masked by default and every reveal/financial action follows published authorization and audit references. |

## Frontend engineering rules for Claude

- Use Next.js App Router. Public marketing/catalog stays server-first; authenticated interactive
  workspaces use focused client components and TanStack Query.
- Query keys come from the shared hierarchical factory and include every answer-changing variable.
  Use targeted cache updates/invalidation; do not clear unrelated server state.
- Mutations never auto-retry unless the published command is idempotent and the identical request
  carries a stable key. Version conflicts refetch server truth before another decision.
- Start independent requests together, avoid client waterfalls and dynamically import only genuinely
  heavy optional UI.
- Private routes are dynamic/no-store and never serialize another user's data through static output.
- Do not add Next route handlers or Server Actions containing Django-owned pricing, authorization,
  assignment, payment or workflow logic.
- Do not store OTPs, session/CSRF tokens, exact address text, KYC, bank data or payment payloads in
  browser storage, logs or analytics.
- A finished task includes focused regression tests, affected-package typecheck, full lint, affected
  production builds and appropriate Playwright evidence.

## Fastest safe execution order

1. ~~User checkpoints the current dirty tree; Codex starts BE-01/BE-02 while Claude starts FE-01/FE-02.~~
   Done — BE-01 to BE-05 are published through OpenAPI 1.5.0 and FE-01 to FE-04 are complete.
2. **Next.** OpenAPI 1.5.0 is published. Claude integrates FE-05 (regenerate the client, enforce
   `generate:check`, typed CSRF/session/active-role, guarded Operations shell) and then FE-06, while
   Codex builds BE-06. FE-05 also owns the real-browser proof BE-01 is waiting on.
3. Claude completes FE-06/FE-07 while Codex builds BE-06/BE-07.
4. Continue one published backend slice ahead of its consuming frontend slice through BE-08–BE-10.
5. Run all acceptance scenarios only against authoritative Django state; mocks remain limited to
   frontend-boundary tests and deterministic external-provider adapters.
