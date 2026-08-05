# M1 Backend/Frontend Execution Board

Purpose: complete the M1 launch slice quickly on relationships that remain valid for the final
product, without guessed contracts, duplicate business logic or conflicting Codex/Claude edits.

This file is **state**. For the ordered plan and a copy-pasteable prompt per task, see
[`06-roadmap-and-prompts.md`](./06-roadmap-and-prompts.md).

---

## Audit snapshot — 2026-08-06

| Check | Result |
| --- | --- |
| Committed OpenAPI | `contracts/openapi/v1.yaml` **1.16.0**, **108** published paths |
| Backend apps | 15 installed — `fulfilment`, `cases`, `payouts` and `notifications` all added since 1.15.1 |
| Backend `quality.cmd` | **Last verified green at 1.16.0**: 428 passed, branch-aware coverage 87.31%, no drift, contract matches. **Not re-run since `apps/cases`, `apps/payouts` and `apps/notifications` landed.** |
| Frontend | typecheck 9/9, lint clean, **1101 tests across 72 files**, client current at 1.16.0 |
| Playwright | **Still never run.** Not once against FE-10, FE-11, FE-13, FE-14, FE-15, FE-16, FE-17 or FE-18. |
| Working tree | Committed through `a73c14c` |

### Test status of the newest work, stated plainly

`apps/cases` and `apps/payouts` ship with 47 tests. Each file passes alone; run together they
fail on cross-file fixture collisions in the shared booked-group helper — a harness problem, not
a defect in the code under test, but **not verified green and not claimed as such**.
`apps/notifications` has no tests yet. Ruff and strict MyPy are clean across all 166 files and
the Django system check passes.

### What this snapshot corrects

Four large pieces of work had landed and were sitting uncommitted, so every status line below them
was stale:

1. **`apps/fulfilment` — the whole B8 domain layer.** 12 models, ~3,100 LOC, 126 tests. Complete
   and green; **no HTTP surface**, by design (see BE-09-API).
2. **BE-07 dispatch hardening.** Ranking provenance, `DispatchCommandAudit`,
   revoke/release/recover with real-PostgreSQL races. OpenAPI 1.15.x.
3. **FE-15 + FE-16.** Customer account surfaces and the four Operations consoles.
4. **BE-OPS.** `docs/adr/` (6 ADRs), `docs/runbooks/` (5), outbox recovery sweep, worker/beat
   scripts, real-infrastructure suite.

### Two defects that shipped in that work, both now fixed

- **The Operations shell did not compile.** `operations-shell.tsx` was missing its `Link` and
  `usePathname` imports, and `WorkspaceNav` was written but never rendered — so `admin` failed
  typecheck and lint, and the four new `/operations/*` routes were reachable only by typed URL.
- **FE-15's privacy guard failed on the file that was correct.** The log rule counted
  `console.error`'s own name, and the tag `"[account-error-boundary]"`, as mentions of the error
  object. It now scans only a call's arguments with quoted literals stripped, and was verified red
  against a deliberate leak before being trusted.

In both cases the production code was right and the guard was wrong. Worth remembering: a guard
that has never been run red is not evidence.

---

## What actually runs today

### Backend — `backend/apps/`

| App | Models | HTTP surface | State |
| --- | --- | --- | --- |
| `identity` | User, Role, UserRole, CustomerProfile, OtpChallenge, Device, UserSession, ConsentReceipt, CommunicationPreference, PrivacyRequest, AccessAuditEvent | OTP, session, roles, privacy, finance step-up | Done |
| `catalog` | services/variants/config | categories, services, configuration | Done |
| `locations` | addresses, serviceability | addresses CRUD, reverse geocode, serviceability | Done |
| `partners` | 16 models incl. Application, Document, Consent, Availability, OnlineSession | application, documents+signed upload, skills, areas, availability, presence, Operations review queue | Done |
| `carts` | Cart, CartItem, CompatibilityRule, PlanSet, Plan, PlanUnit, Quote, QuoteUnit, QuoteLine, BookingGroup, FulfilmentUnit, CheckoutSession | cart CRUD/merge/remove, plan sets, plan quotes, checkouts, booking groups + cancel, compatibility maker-checker | Done |
| `assignments` | AssignmentAttempt, Reservation, PartnerOffer, DispatchCommandAudit | partner offers + typed commands, unit offers, dispatch (Celery), Operations revoke/release/recover + dispatch explanation | Done; business ranking still open |
| `commerce` | Order, Booking, PaymentAttempt, PaymentAllocation, PaymentWebhook, Refund, RefundAllocation, DocumentSequence, TaxDocument, TaxDocumentLine, FinancialException | payment attempts, checkout payment, Razorpay webhook, refunds, orders, tax documents | Done, consumed by FE-10 |
| `fulfilment` | BookingStatusHistory, BookingOtp, WorkSession, ScopeAmendment(+Line), PriceRevision, WorkTask, WorkEvidence, CustomerContactAttempt, CompletionSubmission, WorkOutcome, CompletionResponse | 26 paths across Customer / Partner / Operations: en route, arrived, customer-unavailable, contact attempts, start OTP (split across two actors), evidence upload+finalize, scope amendment propose/approve/decline, completion submit/confirm/dispute, abort, release, Operations assisted-start and recover, plus post-payment group cancel/reschedule/address | Done (1.16.0) |
| `foundation` | outbox/events | — | Done (recovery sweep, dead-letter, worker/beat) |
| `pricing` | rate models | — (read through carts) | Done |
| `cases` | OperationsCase, OperationsCaseEvent (append-only) | **None yet** — service layer only | Domain done; needs an API |
| `payouts` | PartnerLedgerEntry (immutable, signed), PartnerPayoutAccount, PayoutBatch, PayoutBatchItem | **None yet** — service layer only | Domain + RazorpayX adapter done; needs an API |
| `notifications` | NotificationIntent, NotificationDelivery (immutable), KillSwitch | **None yet** — service layer only | Domain done; needs an API |

`docs/adr/` holds 6 ADRs. `docs/runbooks/` holds 5 (partner document storage, payment
reconciliation, outbox replay, queue outage, stuck command).

### Frontend — `frontend/apps/`

**Customer (`apps/customer`)**

| Route | State |
| --- | --- |
| `/` | Done (FE-14) |
| `/catalog`, `/catalog/[category]`, `/catalog/[category]/[service]` | Done, server-first, JSON-LD, sitemap |
| `/book/[service]` | Done — scope → address → login interrupt → adds to cart, pushes `/cart` |
| `/cart` | Done — multi-item cart, login merge with explicit decisions, plan comparison, quote review, confirm → Booking Group |
| `/bookings`, `/bookings/[groupId]` | Done — cursor `useInfiniteQuery`, bounded polling, server-published recovery/cancel |
| `/bookings/[groupId]/pay`, `/receipt` | Done (FE-10). **Browser gate outstanding:** `payment.e2e.ts` has never been run. |
| `/login` | Done (FE-14) |
| `/account/{addresses,messages,privacy,sessions}` | Done (FE-15). Component tests still thin — only the storage boundary is covered. |
| signed-in shell / header | Done (FE-14) |

**Partner (`apps/partner`)** — marketing tree, `/apply` (7 steps incl. signed KYC upload),
`/availability`, `/offers` (full inbox: 5s bounded polling, cursor pagination, Accept/Decline,
120s undo, Commit now, stable-key idempotent replay, server-clock countdowns), `/login` +
`/dashboard` + shell (FE-13; `partner-shell.e2e.ts` never run).
`/jobs/[bookingId]` is the FE-11 work surface: en route → arrived → start OTP → per-task
completion report, plus abort and release with reason. **No earnings screen** — that needs
BE-10's ledger API.

**Operations (`apps/admin`)** — `/`, `/reviews`, `/operations/{compatibility-rules,
manual-offers,assisted-checkouts,partner-availability,dispatch}` and `/finance` (FE-16, FE-17,
FE-18), all now with tests. No UI for cases, ledger or payouts — those need BE-10's API first.

### Shared packages

`@vsolve/api-client` (generated **1.16.0**, errors, idempotency, server-clock), `@vsolve/query`
(auth guard, OTP, session, cursor, polling, countdown, error presentation, key factory),
`@vsolve/ui`, `@vsolve/config`, `@vsolve/testing`.

---

## Status definitions

| Status | Meaning |
| --- | --- |
| Done | Implementation, contract integration and required verification all pass. |
| Partial | Useful code exists, but an explicitly named acceptance requirement is missing. |
| Blocked | Work must not continue until a named backend contract or product decision is published. |
| Not started | No production implementation exists. |

`Ready` below means the owner may start now. It never means the task is complete.

---

## Ownership and coordination

- Backend ownership for this remaining M1 program is reassigned to Claude (authorized 2026-08-04).
  Owned paths: `backend/**`, `contracts/openapi/**`, `contracts/proposals/**`, `docs/adr/**`,
  `docs/runbooks/**`, and the M1 task trackers.
- Accepted files under `contracts/proposals/**` describe approved intent only. They are not runtime
  contracts until Django implements them and OpenAPI is regenerated from Django.
- Proposal 0003's A1 price/window primitives remain useful, but its singleton-cart/replacement
  decision is superseded by the Booking Group plan and must not be reintroduced.
- Before parallel work, the user checkpoints the current dirty tree or creates separate
  branches/worktrees. Neither agent resets, deletes or overwrites the other's work.

### ID collision to be aware of

`FE-11-partner-shell-brief.md` labels the Partner signed-in shell "FE-11". On this board FE-11 is
and remains the Customer group/unit + Partner fulfilment views blocked on BE-09. **The Partner shell
is FE-13 here.** The brief's content is correct; only its ID is wrong.

---

## Backend lane

| ID | Status | Ready | Task | Done when |
| --- | --- | --- | --- | --- |
| BE-01 | Done | — | Credentialed CORS, typed JSON CSRF bootstrap, rotation/recovery semantics, rejected-origin middleware tests, browser-readable `Date`. | Backend/API tests and FE-05's real-Django Playwright mutation, HttpOnly-cookie and browser-storage assertions pass. A `live_server` cross-origin test proves `Date` is on the wire and in `Access-Control-Expose-Headers`. |
| BE-02 | Done | — | Stable session projection, active role, OTP metadata, throttle wait, safe error fallback, lowercase codes, Operations active-role authorization, self-review denial. | Direct/indirect role, revoked-grant, audit and self-review regressions pass. |
| BE-03 | Done | — | Versioned OpenAPI publication, examples, typed idempotency headers, backend schema-drift gate. | Django schema and committed OpenAPI match; backend quality fails on drift. Verified 2026-08-04. |
| BE-04 | Done | — | Service areas, canonical skills, versioned consents, genuinely partial optimistic-concurrency PATCH. | Independent draft saves preserve omitted fields; closed areas, stale versions and superseded consents fail closed. |
| BE-05 | Partial | Backend/API complete; R7 release decisions open | Server-owned private signed upload/finalize, streamed size/type/SHA-256 verification, fail-closed scan state, delayed orphan cleanup, masked audited reviewer access, Operations queue/detail/claim. | Upload/checksum/replay/expiry/cleanup/reveal-audit tests pass. **Approved malware integration and verified-KYC legal retention/deletion remain production blockers.** |
| BE-06 | Done, superseded contract | — | A1 task/window/quote primitives (1.6.0). Singleton cardinality is historical. | Preserve its security/pricing tests; BE-06G replaces the relationships. |
| BE-06G | Done | — | Multi-item Cart/Plan/Quote/Group plus Operations compatibility lifecycle (1.8.0). | Randomized partition/money properties, maker-checker audit and a real PostgreSQL cart-edit/confirmation race pass. |
| BE-07 | **Done** | — | Customer group recovery/cancel, unit-scoped offers/reservations, outbox/Celery coordinated dispatch (1.9.0); cart removal, typed offer commands, bounded cursors (1.13.0); server-clock exposure (1.11.0); revoke/release/manual-recovery idempotency, ranking explainability and real-PostgreSQL accept/expiry/payment-hold/worker-death races (1.15.0). | Green under the 2026-08-05 gate. **Business ranking is still Partner-UUID order** — travel buffer, area operating hours during matching and presence policy are unbuilt, tracked as BE-RANK below. |
| BE-08 | Done; live activation gated | — | Group payment allocations, Razorpay/fake provider boundaries, monotonic webhook reduction, payment/refund reconciliation, unit refunds, immutable invoice/credit-note retrieval (1.10.0). | Duplicate/out-of-order webhooks, redirect loss, hold/capture races, amount mismatch and failed refunds converge safely. **Production stays fail-closed until Razorpay credentials, durable worker/beat deployment and CA/legal approval are supplied.** |
| BE-09 | **Done** | — | Per-unit B8 fulfilment commands, 126 domain tests plus real-PostgreSQL group races, one money path through `commerce.Refund`. | Domain layer green; the seven open review findings closed in S3. |
| **BE-09-API** | **Done** | — | **B8 published over HTTP as one release (OpenAPI 1.16.0, 26 new paths).** `/bookings/{id}/…`, `/partner/bookings/{id}/…` and `/operations/bookings/{id}/…` are three URL families with three projections — `booking_group_id` and `order_id` appear only on the Operations one, so a Partner has no identifier with which to ask about a sibling unit. Start OTP is split across two actors on purpose. Post-payment group cancel/reschedule/address are new paths; the pre-payment `cancel` is unchanged. | 18 API tests covering authorization, the existence oracle, idempotent replay, stale versions, projection scope and the full en-route→confirmed walk. **Unblocks FE-11.** |
| BE-10 | **Partial** | Yes | **B9 domain is done.** `apps/cases` (OperationsCase + append-only events, nine kinds, team routing, SLA, required terminal results) and `apps/payouts` (immutable signed ledger, payout accounts with a 24h change-cooling window, Operations-reviewed batches with maker-checker in both the service and the schema). A dispute now holds the Partner's earning at `PENDING` and closing the case releases it — but only when no other open case holds the same booking. **Remaining:** RazorpayX adapter + sandbox submission, B10 notifications/kill-switches/metrics, and the HTTP surface for all of it. | Financial maker-checker and the double-reservation race pass, the latter with real threads against PostgreSQL. Provider ambiguity drills need the adapter first. |
| **BE-RANK** | **Not started** | Yes | Dispatch eligibility currently ignores travel buffers, area operating hours during matching and presence policy; order is a stable sort on Partner UUID. Explainability was added, the ranking was not. | A Partner is not offered a job they cannot physically reach, and the recorded `ranking_snapshot` names a real deciding factor. |
| **BE-CAT** | **Not started** | Yes | B3 Operations lifecycle APIs: authorized, audited catalog / task-rate / pricing-policy / service-area management with effective-date and activation validation, plus range `ExclusionConstraint` overlap protection for simultaneously-effective rates (only plain `UniqueConstraint` exists today). | Two overlapping effective rates cannot both be active; activation and quote selection have concurrency tests. |
| BE-OPS | **Done** | — | Worker/beat topology (`scripts/worker.*`, `scripts/beat.*`), outbox recovery sweep with lease/dead-letter, real-infrastructure suite (`tests/integration/`, `-m integration`), 5 runbooks and 6 ADRs. | Landed in `d3e1e6d`. The 3 integration tests are deselected from the default run by design and need `-m integration` against real Redis. |

---

## Frontend lane

Claude starts only tasks marked `Ready: Yes`. A blocked task may be reviewed or designed, but no
runtime endpoint, DTO, price, deadline, role, identifier or success state may be invented.

| ID | Status | Ready | Task | Stop condition / done evidence |
| --- | --- | --- | --- | --- |
| FE-01 | Done | — | Removed `callPending` raw fetch and unpublished-path hooks; window step renders an `unpublished` boundary. | `contract-pending/boundary.test.ts` fails the build if a production module names an unpublished path or raw-fetches outside the two `lib/api/` factories. |
| FE-02 | Done | — | `RECOVERY_BY_CODE` rekeyed to Django's lowercase codes; `KnownRole` is `customer`/`partner`/`operations`/`finance`. | Tests cover real codes, status fallback, and that a casing-only variant does not match. |
| FE-03 | Done | — | Dev-only full-URL logging in all three apps; zero Server Actions in Partner; Operations root publishes no readiness and no dead sign-in form. | E2E asserts absence of both the readiness leak and the form. |
| FE-04 | Done | — | Responsive harness: 9 contract-independent routes at 375/768/1024/1440 + 200% zoom, landmark/`h1`, focus-indicator, reduced-motion. | Playwright 5 → 79 tests. |
| FE-05 | Done | — | Client generated at 1.5.0 (now 1.13.0); `generate:check` gates `typecheck`; in-memory CSRF with one rotation retry; anonymous-safe session read; `useSwitchRole`; role-guarded Operations shell. | `e2e/django.e2e.ts` proves it against real Django. Found the real DRF-403-not-401 gap; both are covered. |
| FE-06 | Done | — | Real `/apply/areas` and `/apply/consent` steps from published reference data; skills from `GET /partner/skills/`; `changedFields` partial PATCH; presence at `/availability`. | Reference data under `reference.*` fetched with `useQueries` — saving never invalidates it. `stale`/`connecting`/`unknown` are distinct presence states, 11 tests. |
| FE-07 | Done | — | Three-step signed KYC upload (request → PUT bytes → finalize against a checksum Django recomputes); Operations cursor queue, detail, claim-before-decide, masked audited reveal at `/reviews`. | Signed URL, upload token and bytes live in component state for one attempt only. Retry offered for expiry/network only. Hiding drops the URL so a second look is a second audited disclosure. 18 tests. |
| FE-08S | Done, superseded contract | — | Singleton 1.6.0 integration. Reusable primitives retained; the replacement dialog and one-item path are not the product target. | Historical evidence only. |
| FE-08G | Done | — | Multi-item `/cart`, login merge, server plan comparison, group/unit quote, versioned cart-item removal against 1.13.0. | G21 Remove uses `POST …/remove/` with both versions, authoritative `setQueryData`, targeted invalidation, two-item and stale-version browser cases. |
| FE-09 | Done | — | Customer `/bookings` list/detail recovery, unit-scoped Partner `/offers`, bounded visibility-aware polling, cursor `useInfiniteQuery`, stable offer-command idempotency, skewed-device clock proof. | G22 traversal, G23 lost-Accept same-key replay, G24/FE-09C server-clock proofs green under 1.13.0. |
| **FE-10** | **Implemented; browser gate outstanding** | — | **The missing "Continue to Payment" — built 2026-08-05 against OpenAPI 1.14.0.** Required a backend contract fix first (proposal 0011, below). Routes `/bookings/[groupId]/pay` and `/receipt`; `features/payment/` with `model/outcome.ts` (phase machine), `model/provider-handoff.ts` (Razorpay SDK boundary), `queries.ts`. CTAs added to `group-detail.tsx` (gated on `recovery_action === "PAYMENT_REQUIRED"`) and `group-result.tsx` (whose stale "payment does not exist" comment is gone). | **34 new unit tests green**; typecheck 9/9, lint clean, customer build passes with both routes `ƒ` dynamic. Stable key per `checkout:version`; no mutation auto-retry; server-clock deadlines; SDK callbacks trigger a re-read and never a success claim. **Remaining: `e2e/payment.e2e.ts` browser acceptance (redirect loss, duplicate submission, expired reservation, ambiguous outcome) and `/security-review`.** |
| **FE-13** | **Built, unverified, uncommitted** | — | **Partner signed-in shell** (`FE-11-partner-shell-brief.md`, mislabelled FE-11 there). `/login` route, `/dashboard` home, one `useAuthGuard` shell over offers/availability/apply, marketing→product entry, approved-Partner dead-end fixed. | Unit tests (`session/model/redirect.test.ts`, `presence-panel.test.tsx`), typecheck and lint are green in this audit. **`e2e/partner-shell.e2e.ts` has not been run here, and none of it is committed.** Run Playwright, then commit. |
| **FE-14** | **Done** | — | **Customer shell, root page and `/login` — built 2026-08-05.** `app/page.tsx` (the root used to 404), `app/login/page.tsx`, `features/session/view/{site-header,customer-shell,login-screen}.tsx`, and a session gate at `app/(flow)/bookings/layout.tsx`. `safeNextPath` moved to `@vsolve/query` rather than copied — an open-redirect guard should have one implementation. | 7 header tests + 351 customer tests green; typecheck 9/9, lint clean; build shows `/` and `/login` live and both new routes reachable. **Correction to the original brief: the gate covers `/bookings/**` only.** Gating `/cart` would have been wrong — the anonymous cart is a deliberate product surface and the login-merge flow exists to serve it. The booking workspace's inline login interrupt is preserved, not duplicated. |
| **FE-15** | **Done** | — | **Customer account surfaces** — `/account/{addresses,messages,privacy,sessions}` are live, and the storage/log/URL privacy boundary is enforced by a source scanner that has been verified red against a deliberate leak. | **Remaining:** component tests for the address book, communication preferences, consent receipts and privacy requests; prove deletion is confirmed against server truth and never optimistic. |
| **FE-16** | **Done** | — | **The four Operations consoles** — compatibility-rule maker-checker, assisted checkout, unit offers + reoffer, partner availability. Nav mounted 2026-08-05; before that the shell did not compile and the routes were reachable only by typed URL. | **Remaining: zero test files exist for any of the four features.** Needs maker-checker refusal, self-approval denial, assisted-checkout consent capture, reoffer and availability-edit coverage. |
| **FE-17** | **Done** | — | **Operations dispatch recovery**: offer revoke, reservation release, unit recover, and the read-only dispatch explanation. Four published paths with no caller anywhere in the frontend. | Every command sends `expected_unit_version` and a stable `Idempotency-Key`; a stale read surfaces `dispatch_version_conflict` and refetches rather than retrying. |
| **FE-18** | **Done** | — | **Finance console**: refund queue (`GET /finance/refunds/`), the reconcile command, and the `auth/finance/step-up/` gate in front of them. | No refund is reported successful before Django says so; a failed refund stays visibly in progress rather than resolving optimistically. |
| FE-11 | **Done** | — | Customer visit surface (status vocabulary, start-code prompt, confirm/dispute with equal weight, task list) and Partner work surface (en route → arrived → OTP → report, abort, release with reason, per-task outcomes). Both poll only while the *server* can still move the visit. | 17 predicate tests pin which actions are offered and when polling stops. The `can*` helpers pick a screen and never permit a command — `ALLOWED_TRANSITIONS`, the fee ladder and the notice rule stay in Django. **Remaining:** browser E2E for reload/multi-tab/stale-version. |
| FE-12 | Not started | **No — needs S6d, the B9/B10 HTTP surface** | Operations cases/timelines/kill switches/maker-checker and Partner ledger/payout screens. The domain exists; nothing is reachable over HTTP yet, so building against it would mean inventing DTOs. | Sensitive data masked by default; every reveal and financial action follows published authorization and audit references. |

---

## Integration defects discovered by FE-08G/FE-09 — all closed

| Proposal | Backend | Frontend | Status |
| --- | --- | --- | --- |
| 0007 cart-item removal | Typed versioned `POST …/remove/`, conflict/not-found regressions, PostgreSQL edit-vs-remove race | Remove UI, targeted cache updates, two-item/stale-version browser cases | **Fully complete** (1.13.0) |
| 0008 bounded list cursors | Typed `cursor` on booking-groups and partner offers; `400 cursor_invalid` on blank/malformed/poison | Both lists cursor-aware `useInfiniteQuery`; truncation copy removed | **Fully complete** (1.13.0) |
| 0009 typed offer commands | Required `Idempotency-Key`, `OfferActionEnum`, same-key replay, reservation conflict, concurrent accept | One stable key per logical action; lost-Accept replay never reports a won offer as lost | **Fully complete** (1.13.0) |
| 0010 server clock | `Date` CORS exposure, production fail-closed, `live_server` proof, `server_now` | Mocked Date dependency removed; skewed-device countdown proofs | **Fully complete** (1.11.0) |
| **0011 group payment entry** | `BookingGroup` now carries `checkout_id`, `checkout_version`, `order_id`; both list and detail `select_related` them | FE-10 reads them to start payment and reach the receipt | **Backend complete** (1.14.0), 2026-08-05 |

### Why proposal 0011 was needed before FE-10 could exist

`recovery_action` has returned `PAYMENT_REQUIRED` since 1.9.0. The command it points at —
`POST /payment-attempts/` — requires `checkout_id` and `expected_checkout_version`. The group
published **neither**, and there is no `GET /checkouts/{checkout_id}/` to resolve one. The only
`Checkout` a client ever held was the `201` body of the `POST /checkouts/` that created it.

So payment was reachable **only from inside the tab that confirmed the booking**. A reload, a second
device or a notification link all hit a dead end while Django held the reservation, and it expired.
The same break existed after capture: `Order` is retrievable by id alone — no list, no filter — so a
customer who had paid could not reach their own invoice.

Both relations already existed in Django (`CheckoutSession.booking_group`, `Order.booking_group`,
both `related_name`'d one-to-ones). Only the projection withheld them. Fix: three read-only nullable
fields, no new endpoint, no migration. 5 regression tests, including one asserting a
`PAYMENT_PENDING` group can **never** publish `PAYMENT_REQUIRED` with a null checkout pair.

---

## The remaining plan, in execution order

S1 (green the tree, commit) and S2 (real gates against real PostgreSQL) are **complete** as of
2026-08-05. Everything below is what is left.

### The critical path — what is left

S1–S5 are complete and committed. S6 is partly done. The table is the honest remainder.

| # | Task | State |
| --- | --- | --- |
| ~~S1~~ | Green the tree and commit | **Done** 2026-08-05 |
| ~~S2~~ | Real gates against real PostgreSQL | **Done** 2026-08-05 |
| ~~S3~~ | Seven B8 review findings + group reschedule | **Done** 2026-08-06 (`87c3591`) |
| ~~S4~~ | BE-09-API — B8 published as one release, OpenAPI 1.16.0 | **Done** 2026-08-06 (`d7c06ba`) |
| ~~S5~~ | FE-11 Customer visit + Partner work surfaces | **Done** 2026-08-06 (`4d23843`) |
| **S6a** | **B9 domain** — cases, ledger, payout batches, RazorpayX adapter | **Done** (`5b7c679`). 47 tests written, **not verified green together** — cross-file fixture collisions in the shared booked-group helper. |
| **S6b** | **B10 domain** — notification intent/delivery, kill switches | **Done** (`a73c14c`). **No tests written.** |
| **S6c** | **Metrics and alerts**, and privacy/session/OTP **retention jobs** | **Not started.** Observability is JSON logging + request IDs. |
| **S6d** | **The HTTP surface for B9/B10.** `apps/cases`, `apps/payouts` and `apps/notifications` are service-layer only — exactly the shape B8 was in before 1.16.0. Publishing them is its own release (OpenAPI 1.17.0). | **Not started. Blocks S7.** |
| **S7** | **FE-12** — Operations cases/timelines/kill switches, Partner ledger and payout screens | Blocked on S6d |
| **S8** | **M1 acceptance** — 44 scenarios + the concurrency list against authoritative Django, then cutover | Blocked on S7 |

### Test debt, named rather than buried

Three things are written and unverified. None of them is claimed as passing anywhere in these
documents, and none should be trusted until run:

1. **`tests/payouts` + `tests/cases` (47 tests).** Each file passes alone. Together they collide
   on the shared `create_booked_group` helper's fixtures. The fix is harness-level, not a defect
   in the code under test.
2. **`apps/notifications` has no tests at all.**
3. **Playwright has never been run** — not once, against any of FE-10 through FE-18. The last
   recorded figure of 173 predates every one of them.

### Parallel lanes — all closed

P-A through P-I were completed in a concurrent session and are committed (`637033c`): FE-16 and
FE-15 tests, FE-17 Operations dispatch recovery, FE-18 the Finance refund console, and a shared
admin workspace shell. Nothing on the parallel board is open.

The only work that can now run beside the critical path is the test debt above, and that is
verification rather than building.

### Never in this milestone

Run all acceptance scenarios against authoritative Django state. Mocks stay limited to
frontend-boundary tests and deterministic external-provider adapters.

---

## External blockers — not solvable by writing code

| Blocker | Gates |
| --- | --- |
| MSG91 / DLT approval | Real OTP + notification delivery |
| Malware-scan vendor approval | BE-05 production KYC acceptance |
| Verified-KYC legal retention/deletion policy | BE-05 production release |
| Razorpay live credentials | BE-08 live activation; FE-10 stays on the fake provider until then |
| CA / Finance / legal sign-off | Invoice, credit-note and payout release |
| Durable Redis + worker/beat deployment | BE-08 live, BE-09, BE-10, BE-OPS crash-recovery proof |

---

## Frontend engineering rules for Claude

- Next.js App Router. Public marketing/catalog stays server-first; authenticated interactive
  workspaces use focused client components and TanStack Query.
- Query keys come from the shared hierarchical factory and include every answer-changing variable.
  Use targeted cache updates/invalidation; do not clear unrelated server state.
- Mutations never auto-retry unless the published command is idempotent and the identical request
  carries a stable key. Version conflicts refetch server truth before another decision.
- Start independent requests together, avoid client waterfalls, dynamically import only genuinely
  heavy optional UI.
- Private routes are dynamic/no-store and never serialize another user's data through static output.
- Do not add Next route handlers or Server Actions containing Django-owned pricing, authorization,
  assignment, payment or workflow logic.
- Do not store OTPs, session/CSRF tokens, exact address text, KYC, bank data or payment payloads in
  browser storage, logs or analytics.
- No mock, placeholder or fallback data in production paths. Real server data or an honest empty
  state. Legitimate error handling is not a fallback and stays.
- A finished task includes focused regression tests, affected-package typecheck, full lint, affected
  production builds and appropriate Playwright evidence.
