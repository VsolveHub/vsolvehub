# M1 Backend/Frontend Execution Board

Purpose: complete the M1 launch slice quickly on relationships that remain valid for the final
product, without guessed contracts, duplicate business logic or conflicting Codex/Claude edits.

This file is **state**. For the ordered plan and a copy-pasteable prompt per task, see
[`06-roadmap-and-prompts.md`](./06-roadmap-and-prompts.md).

---

## Audit snapshot — 2026-08-05 (verified, committed)

Re-derived from the working tree and confirmed by running every gate. The full findings are in
[07-audit-2026-08-05.md](./07-audit-2026-08-05.md). The 2026-08-04 snapshot that used to head this
file is superseded and was wrong in three ways: it said BE-09 had no code, it said `docs/adr/` did
not exist, and it said FE-10 was unbuilt. All three had changed.

| Check | Result |
| --- | --- |
| Backend `scripts/quality.cmd` | **Green.** Ruff, strict MyPy, **384 passed** (3 integration deselected), branch-aware coverage **87.45%** (gate 85%), no migration drift, generated OpenAPI validates and matches the committed contract. 10m38s against real PostgreSQL. |
| Frontend `pnpm test` | **838 passed across 53 files** |
| `pnpm typecheck` | 9/9 packages clean |
| `pnpm lint` | Clean, `--max-warnings 0` |
| Committed OpenAPI | `contracts/openapi/v1.yaml` **1.15.1**, **82** published paths |
| Playwright | **Not run.** `payment.e2e.ts` and `partner-shell.e2e.ts` have never been executed. |
| Working tree | **Clean.** The 62 dirty files are committed. |

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
| `fulfilment` | BookingStatusHistory, BookingOtp, WorkSession, ScopeAmendment(+Line), PriceRevision, WorkTask, WorkEvidence, CustomerContactAttempt, CompletionSubmission, WorkOutcome, CompletionResponse | **None.** No `views.py`, `urls.py` or `serializers.py`; not in `config/urls.py`. | **Domain complete, unreachable** — see BE-09-API |
| `foundation` | outbox/events | — | Done (recovery sweep, dead-letter, worker/beat) |
| `pricing` | rate models | — (read through carts) | Done |
| **missing** | — | **No cases/ledger/payout/notifications app** | **BE-10 not started** |

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
**No work/fulfilment UI, no earnings** (blocked on BE-09-API/BE-10).

**Operations (`apps/admin`)** — `/`, `/reviews`, and `/operations/{compatibility-rules,
manual-offers,assisted-checkouts,partner-availability}` (FE-16). **Zero tests** for the four new
features. No UI yet for the dispatch revoke/release/recover commands or the Finance refund queue.

### Shared packages

`@vsolve/api-client` (generated 1.13.0, errors, idempotency, server-clock), `@vsolve/query`
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
| BE-09 | **Domain done, unreachable** | — | Per-unit B8 fulfilment commands. `apps/fulfilment` implements all of them with 126 tests, real-PostgreSQL group races, and one money path through `commerce.Refund`. | Domain layer green. **Every command is service-layer only** — see BE-09-API. |
| **BE-09-API** | **Not started** | **Yes — highest-value backend work** | **Publish B8 over HTTP as one release.** Views/serializers/urls for ~25 commands split by actor, `expected_version` guards, required `Idempotency-Key`, the step-up permission `operations_assisted_start` describes but nothing enforces, and audit rows. Regenerate OpenAPI → 1.16.0 with a changelog. First close the 7 open B8 review findings in [02-backend-tasks.md](./02-backend-tasks.md) and add the missing group-wide reschedule. | Arrival→completion/partial/dispute/recovery is invokable by a real Customer, Partner and Operations client and reconciles group truth. Unblocks FE-11. |
| BE-10 | **Not started** | Foundations can begin | B9/B10 cases, ledger, payout, notifications, kill switches, metrics. No `OperationsCase`, Partner ledger, payout batch or notification model exists. A dispute today sets `Booking.payout_hold` and stops. | Financial maker-checker, provider ambiguity and production-readiness drills pass. |
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
| **FE-15** | **Built; tests thin** | **Yes** | **Customer account surfaces** — `/account/{addresses,messages,privacy,sessions}` are live, and the storage/log/URL privacy boundary is enforced by a source scanner that has been verified red against a deliberate leak. | **Remaining:** component tests for the address book, communication preferences, consent receipts and privacy requests; prove deletion is confirmed against server truth and never optimistic. |
| **FE-16** | **Built; untested** | **Yes** | **The four Operations consoles** — compatibility-rule maker-checker, assisted checkout, unit offers + reoffer, partner availability. Nav mounted 2026-08-05; before that the shell did not compile and the routes were reachable only by typed URL. | **Remaining: zero test files exist for any of the four features.** Needs maker-checker refusal, self-approval denial, assisted-checkout consent capture, reoffer and availability-edit coverage. |
| **FE-17** | **Not started** | **Yes — published in 1.15.0** | **Operations dispatch recovery**: offer revoke, reservation release, unit recover, and the read-only dispatch explanation. Four published paths with no caller anywhere in the frontend. | Every command sends `expected_unit_version` and a stable `Idempotency-Key`; a stale read surfaces `dispatch_version_conflict` and refetches rather than retrying. |
| **FE-18** | **Not started** | **Yes — published since 1.10.0** | **Finance console**: refund queue (`GET /finance/refunds/`), the reconcile command, and the `auth/finance/step-up/` gate in front of them. | No refund is reported successful before Django says so; a failed refund stays visibly in progress rather than resolving optimistically. |
| FE-11 | Not started | **No — BE-09-API** | Customer Booking Group/unit progress views and Partner unit-scoped fulfilment/work/evidence/amendment/completion UI. | Backend-authorized actions only; reload/multi-tab/stale-version/partial-unit-failure accessibility tests pass. |
| FE-12 | Not started | **No — BE-10** | Operations cases/timelines/kill switches/maker-checker and Partner ledger/payout screens. | Sensitive data masked by default; every reveal and financial action follows published authorization and audit references. |

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

### The critical path — strictly sequential, one owner

Each depends on the one above it. Do not parallelise inside this chain.

| # | Task | Depends on |
| --- | --- | --- |
| ~~S3~~ | ~~Close the 7 open B8 review findings and add group-wide reschedule.~~ **Done 2026-08-06.** All seven fixed with a regression each in `tests/fulfilment/test_review_findings.py`; the four behavioural ones were each verified red with the old behaviour surgically restored. `reschedule_booked_group` added. New setting `M1_RESCHEDULE_MIN_NOTICE_MINUTES = 120`. | — |
| **S4** | **BE-09-API** — publish all of B8 over HTTP as one release. OpenAPI → 1.16.0 + changelog. | S3 |
| **S5** | Regenerate the frontend client, then build **FE-11** — Customer active-booking views and the Partner work/evidence/amendment/completion UI. | S4 |
| **S6** | **BE-10** — B9 cases/ledger/payout, then B10 notifications, kill switches and metrics. | S4 (shares fulfilment truth) |
| **S7** | **FE-12** — Operations cases/timelines/kill switches; Partner ledger and payout. | S6 |
| **S8** | **M1 acceptance** — all 44 scenarios in [04-acceptance-and-cutover.md](./04-acceptance-and-cutover.md) plus the concurrency list, against authoritative Django. Then the cutover checklist. | S5, S7 |

### Parallel lanes — independent, safe to run beside the critical path

No two lanes here touch the same files. A second session can take any of them today.

| Lane | Task | Owns |
| --- | --- | --- |
| **P-A** | **FE-16 tests** — the four Operations consoles have zero. | `frontend/apps/admin/features/{compatibility-rules,assisted-checkout,manual-offer,partner-availability}` |
| **P-B** | **FE-15 tests** — address book, preferences, consent receipts, privacy requests. | `frontend/apps/customer/features/{account,addresses}` |
| **P-C** | **Browser gates** — run and fix `payment.e2e.ts` and `partner-shell.e2e.ts`; `/security-review` on the payment surface. | `frontend/e2e/**` |
| **P-D** | **BE-CAT** — B3 Operations catalog/rate/pricing/area lifecycle APIs + overlap `ExclusionConstraint`. | `backend/apps/{catalog,pricing}` |
| **P-E** | **BE-RANK** — travel buffer, area operating hours during matching, presence policy in eligibility. | `backend/apps/assignments/ranking.py` + selectors |
| **P-F** | **FE-17** — Operations dispatch recovery UI for the four uncalled 1.15.0 paths. | `frontend/apps/admin` (new feature dir) |
| **P-G** | **FE-18** — Finance refund console behind the step-up gate. | `frontend/apps/admin` (new feature dir) |
| **P-H** | **B2 production OTP** — MSG91/DLT adapter behind the existing `OtpSender` protocol, plus privacy/retention fulfilment jobs. | `backend/apps/identity` |
| **P-I** | **Accessibility + responsive gate** for the FE-10/13/14/15/16 routes; bundle budgets; console cleanliness. | `frontend/e2e/responsive*` |

**Contention to avoid:** P-D, P-E and P-H each regenerate OpenAPI. Only one of them may hold
`contracts/openapi/v1.yaml` at a time, and none of them may hold it while S4 is mid-flight — S4
owns the 1.16.0 bump. Sequence the contract-touching lanes behind it or take the frontend lanes
(P-A, P-B, P-C, P-F, P-G, P-I), which touch no contract at all.

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
