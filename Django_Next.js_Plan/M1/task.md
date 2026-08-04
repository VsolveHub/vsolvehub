# M1 Backend/Frontend Execution Board

Purpose: complete the M1 launch slice quickly on relationships that remain valid for the final
product, without guessed contracts, duplicate business logic or conflicting Codex/Claude edits.

## Ownership and coordination

- Backend ownership for this remaining M1 program is reassigned to Claude (authorized 2026-08-04).
  Owned paths for the program: `backend/**`, `contracts/openapi/**`, `contracts/proposals/**`,
  `docs/adr/**`, `docs/runbooks/**`, and the M1 task trackers listed in the integration brief.
- Accepted files under `contracts/proposals/**` describe approved intent only. They are not runtime
  contracts until Django implements them and OpenAPI is regenerated from Django.
- Proposal 0003's A1 price/window primitives remain useful, but its singleton-cart/replacement
  decision is superseded by the product-wide Booking Group plan and must not be reintroduced.
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
| BE-01 | Credentialed CORS plus JSON CSRF bootstrap; FE-05 supplies the real-browser acceptance proof (proposal 0006). Browser-readable `Date` exposure follows in 1.11.0 (proposal 0010). | Real Customer/Partner/Operations authenticated mutations and calibrated countdowns. |
| BE-02 | Session projection, lowercase role/error contract, OTP metadata, Operations active-role and self-review protection (proposal 0004). | Final auth guards and Operations login. |
| BE-03 | Versioned OpenAPI publication, examples, idempotency headers and backend schema-freshness gate (proposal 0001). | Claude regenerates the client and integrates without local DTOs. |
| BE-04 | Service areas, skills, required consents and true application PATCH (proposal 0005). | Complete Partner application and presence UI. |
| BE-05 | Signed private document upload/review and Operations application queue/detail. | KYC upload and Operations review UI. |
| BE-06 | Historical A1 task/window/quote primitives published in 1.6.0. | Catalog/task primitives only; singleton booking integration is superseded. |
| BE-06G | Multi-item Cart, Fulfilment Plans, Booking Group, Fulfilment Units and group/unit quote contract. | FE-08G Customer cart, plan comparison and group review integration. |
| BE-07 | Group/unit checkout read/cancel/recovery, autonomous coordinated dispatch and separate Customer/Partner projections. | Group finding, commitment, recovery and unit-scoped Partner offer inbox. |
| BE-08 | Payment/refund/invoice HTTP APIs and Razorpay reconciliation. | Customer payment and receipt flows. |
| BE-09 | Fulfilment, start OTP, evidence, amendment, completion, cancellation and recovery. | Customer active booking and Partner work UI. |
| BE-10 | Cases, ledger, payout, notifications, recovery jobs, observability and runbooks. | Operations resolution and Partner earnings. |

## Integration defects discovered by FE-08G/FE-09

| Proposal | Severity | Backend task | Frontend follow-up | Status |
| --- | --- | --- | --- | --- |
| 0007 | Feature blocker | Publish a typed versioned cart-item removal command and success/conflict/not-found regressions. | Regenerate 1.13.0, enable Remove with targeted cache updates and add two-item/stale-version browser cases. | **Backend implementation done — OpenAPI 1.13.0.** Focused suite `tests/carts/test_cart_item_removal.py` passes (success, both stale guards, already-gone, replay, cross-customer denial, anonymous cart, DELETE sibling, PostgreSQL edit-vs-remove race). Schema asserts `cart_items_remove` with required version body. **Full `quality.cmd` is not green** (MyPy + 0008 failures elsewhere). FE-08G removal integration is Ready and outstanding. |
| 0008 | Completeness | Publish typed `cursor` query parameters for Booking Group and Partner offer lists, with traversal/concurrency tests. | Convert both lists to cursor-aware `useInfiniteQuery`, handle invalid cursors and remove truncation copy after complete traversal. | **Partial.** Runtime cursor traversal/ownership/ordering/mid-walk insert tests pass (8/14 in `test_bounded_list_cursors.py`). Missing: published `cursor` query params on `booking_group_list` / `partner_offer_list` (OpenAPI still has no `parameters`), `cursor_invalid` 400 mapping (mangled cursors still return `not_found` or `internal_error`), blank-cursor `minLength` refusal, and the schema regression. FE-09 still honestly page-one only. |
| 0009 | Command correctness | Require `Idempotency-Key` for offer actions, publish an action enum/errors and make identical replay return authoritative success exactly once. | Regenerate, use one stable key per logical action and prove lost-response replay never reports a won offer as lost. | **Partial — implementation present in OpenAPI 1.13.0, gate not closed.** Runtime covers same-key replay, key reuse, in-progress, missing key, closed action set, ownership 404, reservation conflict, concurrent accept, decline/undo/commit replay. Schema publishes `OfferActionEnum` + required `Idempotency-Key` + 400/403/404/409. Remaining: one fixture bug (`Role.DoesNotExist` in profile-less Partner test), changelog does not yet describe the 0009 surface under 1.13.0, and full quality is blocked by MyPy/`0008`. FE follow-up still Ready once gate is green. |
| 0010 | Release blocker | Expose `Date` through credentialed CORS, validate production configuration and add a real cross-origin calibration regression. | Remove the mocked Date-header dependency and prove skewed-device offer/undo countdowns use server time. | **Backend implementation done — OpenAPI 1.11.0 / bundled in 1.13.0.** Focused `test_server_clock_calibration.py` passes (allowed/rejected origin, CSRF unchanged, production fail-closed, `live_server` readable `Date`). `Offer.server_now` / page `server_now` published. **MyPy fails** on a redundant cast in `OfferSerializer.get_server_now`, so `quality.cmd` is not green. FE-09C remains Ready and outstanding. |

## Codex backend lane

| ID | Status | Ready | Task | Done when |
| --- | --- | --- | --- | --- |
| BE-01 | Done | — | Credentialed CORS, typed JSON CSRF bootstrap, rotation/recovery semantics, rejected-origin middleware tests and the browser-readable `Date` response header are published. | Backend/API tests and FE-05's real Django-backed Playwright mutation, HttpOnly-cookie and browser-storage assertions pass. A `live_server` cross-origin test proves `Date` is both on the wire and named in `Access-Control-Expose-Headers`. |
| BE-02 | Done | — | Stable anonymous/authenticated session projection, active role, OTP code length, throttle wait, safe error fallback, lowercase codes, Operations active-role authorization and self-review denial are published. | Direct/indirect role, revoked-grant, allowed/denied audit, application/document self-review and regression tests pass. |
| BE-03 | Done | — | OpenAPI 1.4.0 and its migration changelog, representative examples, typed checkout `Idempotency-Key` headers and the backend schema-drift gate are published. | Django schema and committed OpenAPI match; backend quality fails on migration/schema drift. Claude owns generated TypeScript freshness in FE-05. |
| BE-04 | Done | — | Applicant-visible accepting service areas, canonical skills, current versioned consent documents and genuinely partial optimistic-concurrency PATCH are published in OpenAPI 1.4.0. | Independent draft saves preserve omitted fields; closed areas, stale versions and superseded consents fail closed; API/conflict/schema tests pass. |
| BE-05 | Partial | Backend/API complete; R7 release decisions | OpenAPI 1.5.0 publishes server-owned private signed upload/finalize, streamed size/type/SHA-256 verification, fail-closed scan state, delayed orphan cleanup, masked audited reviewer access and Operations queue/detail/claim ownership. | Upload/checksum/replay/expiry/provider-failure/cleanup, replace/reject, cursor pagination, claim, self-review, scan gate and reveal-audit tests pass. Approved malware integration and verified-KYC legal retention/deletion remain production blockers. |
| BE-06 | Done, superseded contract | — | OpenAPI 1.6.0 proves public A1 task/minimum policy, signed windows and immutable single-unit quote primitives. Singleton cart/checkout cardinality is historical, not the integration target. | Preserve its security/pricing tests while BE-06G replaces relationships through migration. |
| BE-06G | Done | — | OpenAPI 1.8.0 publishes multi-item Cart/Plan/Quote/Group plus reviewed Operations compatibility lifecycle. | Randomized partition/money properties, maker-checker audit and a real PostgreSQL cart-edit/confirmation race pass without changing Customer grouping semantics. |
| BE-07 | Partial — 0007/0010 implemented; 0009 nearly closed; 0008 incomplete | Yes | OpenAPI 1.9.0 publishes Customer group recovery/cancel, unit-scoped Partner offers/reservations and outbox/Celery-owned coordinated dispatch. WIP adds 0007 removal, 0009 idempotent offer commands and 0010 clock exposure under OpenAPI 1.13.0. | Close 0008 cursor publication + invalid-cursor contract; clear MyPy; land one green `quality.cmd`; then manual release/recovery, ranking explainability and accept/expiry/payment-hold hardening. |
| BE-08 | Done; live activation gated | — | OpenAPI 1.10.0 publishes group payment allocations, Razorpay/fake provider boundaries, monotonic webhook reduction, payment/refund reconciliation, unit refunds and immutable invoice/credit-note retrieval. | Duplicate/out-of-order webhooks, redirect loss, group hold/capture races, amount mismatch, unit refunds and failed refunds converge safely. Production stays fail-closed until Razorpay credentials, durable worker/beat deployment and CA/legal approval are supplied. |
| BE-09 | Not started | Yes | Implement per-unit B8 fulfilment commands, derived group state and Customer-authored cancellation quote/confirm plus group/unit cancellation/recovery. | M1 arrival through completion/partial/dispute/recovery scenarios pass per unit and reconcile group truth with idempotency and audit. |
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
| FE-07 | Done | — | Partner KYC upload is the full three-step signed flow: request, PUT the bytes to private storage with progress, finalize against a checksum Django recomputes. Operations gained a cursor-paginated queue, application detail, claim-before-decide ownership and masked audited document reveal at `/reviews`. | The signed URL, upload token and file bytes live in component state for one attempt and are never cached, stored or logged. Retry is offered only for expiry and network — a checksum Django refused does not become correct on a second send. Documents stay hidden until an explicit press, hiding drops the URL so a second look is a second audited disclosure, and a pending scan offers no reveal at all. 18 new tests across upload validation and reveal behaviour. |
| FE-08S | Done, superseded contract | — | The completed generated-1.6.0 singleton integration proves signed-window, server-Money and error-code handling. Preserve reusable UI/tests, but the replacement dialog and one-item runtime path are not the product target. | Historical evidence remains valid for reusable primitives; FE-08G replaces singleton behavior using the current generated OpenAPI 1.10.0 client. |
| FE-08G | Partial — G21 only, now Ready | Yes — OpenAPI 1.13.0 (removal command) | Multi-item `/cart`, login merge, server plan comparison and selected Booking Group/unit quote are integrated. Removal remains visibly unavailable because OpenAPI omits the versioned body Django requires; proposal 0007 is filed. | Generated types drive every structure, reason, time and amount; sequential/parallel/separate/mixed, stale-state, hydration and accessibility cases pass without frontend business arithmetic. Close G21 and add the two-service removal regression before calling the cart feature operationally complete. |
| FE-09 | Done — FE-09C Ready; 0008/0009 FE follow-ups wait on backend gate | Yes — clock + removal published; offer-command FE wait for green 0009 gate | Customer `/bookings` list/detail recovery and unit-scoped Partner `/offers` are implemented with App Router boundaries, bounded visibility-aware polling, server-published recovery actions and accept/decline/undo/commit UX. | 646 unit/component tests and 153 Playwright tests pass overall. **FE-09C Ready:** regenerate at ≥1.11.0, drop mocked `Date`, prove skewed-device countdowns. Keep honest page-one truncation until 0008 publishes `cursor`. Keep no auto-retry until 0009's quality gate is green, then adopt stable idempotency keys. |
| FE-10 | Not started | Yes — OpenAPI 1.10.0 | Build group payment attempt, unit allocations, redirect/SDK boundary, ambiguity recovery and receipt/refund/invoice UI. | Stable idempotency keys, no mutation auto-retry, redirect loss, unit refund and duplicate submission tests pass. |
| FE-11 | Not started | No — BE-09 | Build Customer Booking Group/unit views and Partner unit-scoped fulfilment/work/evidence/amendment/completion UI. | Backend-authorized actions only; reload/multi-tab/stale-version/partial-unit-failure accessibility tests pass. |
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
2. ~~OpenAPI 1.5.0 is published and Claude integrates FE-05/FE-06 while Codex builds BE-06.~~ Done.
3. OpenAPI 1.6.0 and its generated client were published, then the singleton product decision was
   superseded. FE-07/FE-08S evidence is retained.
4. OpenAPI 1.10.0 is generated in the frontend. FE-09 is implemented and FE-08G was blocked only
   on removal, which OpenAPI 1.13.0 unblocks. Claude can start FE-10 while preserving the
   mitigations documented for proposals 0008–0010.
5. **Current backend lane (reviewed 2026-08-04).** WIP implements 0007/0009/0010 under OpenAPI
   1.13.0; focused suites for 0007/0010 and nearly all of 0009 pass. Still open before any Done claim:
   finish 0008 cursor publication + `cursor_invalid`, fix MyPy redundant cast, fix the profile-less
   Partner offer-command fixture, document 0009 in the OpenAPI changelog, and run a green
   `quality.cmd`. Then BE-09. Live payment activation remains gated behind provider infrastructure
   and Finance/legal approval.
6. Run all acceptance scenarios only against authoritative Django state; mocks remain limited to
   frontend-boundary tests and deterministic external-provider adapters.
