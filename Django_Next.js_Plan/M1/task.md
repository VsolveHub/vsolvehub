# M1 Backend/Frontend Execution Board

Purpose: complete the M1 launch slice quickly on relationships that remain valid for the final
product, without guessed contracts, duplicate business logic or conflicting Codex/Claude edits.

This file is **state**. For the ordered plan and a copy-pasteable prompt per task, see
[`06-roadmap-and-prompts.md`](./06-roadmap-and-prompts.md).

---

## Audit snapshot — 2026-08-04 (full repo re-audit)

Everything below was re-derived from the working tree, not from prior status claims.

| Check | Result |
| --- | --- |
| Backend `pytest` (venv) | **218 passed**, branch-aware coverage **86.47%** (gate 85%) |
| Frontend `pnpm test` | **727 passed across 48 files** |
| `pnpm contract:check` | Generated types up to date at contract **1.13.0** |
| `pnpm typecheck` | 9/9 packages clean |
| `pnpm lint` | Clean, `--max-warnings 0` |
| Committed OpenAPI | `contracts/openapi/v1.yaml` **1.13.0**, **78** published paths (`grep -c '^  /api' contracts/openapi/v1.yaml`) |
| Playwright | **Not re-run in this audit.** Last recorded 173 tests green. |

Working tree is dirty: 56 modified + 21 untracked files, none committed. The Partner signed-in
shell (FE-13 below) is entirely untracked.

### The headline gap the user reported

**There is no "Continue to Payment" in the Customer app because there is no payment UI at all.**
Not a broken button — an unbuilt surface. `grep` for `payment-attempts`, `checkouts/…/payment`,
`refunds` or `tax-documents` across `frontend/apps/**` and `frontend/packages/query/**` returns
**zero hits**. The Customer journey terminates at `features/booking/group/view/group-result.tsx`,
which renders "Your booking is confirmed / You have not been charged" and stops.

The backend half is done and published: `/api/v1/checkouts/{id}/payment/`,
`/api/v1/payment-attempts/`, `…/reconcile/`, `/api/v1/orders/{id}/`, `/api/v1/refunds/{id}/`,
`/api/v1/tax-documents/{id}/` all ship in OpenAPI 1.13.0 and are backed by
`apps/commerce/` (Order, Booking, PaymentAttempt, PaymentAllocation, PaymentWebhook, Refund,
RefundAllocation, DocumentSequence, TaxDocument, TaxDocumentLine, FinancialException).

That work is **FE-10**, and it is unblocked today.

Note: `group-result.tsx` also carries a now-false comment — "Payment genuinely does not exist yet
(BE-08)". BE-08 shipped in OpenAPI 1.10.0. Fix the comment when FE-10 lands.

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
| `assignments` | AssignmentAttempt, Reservation, PartnerOffer | partner offers + typed commands, unit offers, dispatch (Celery) | Done, hardening open |
| `commerce` | Order, Booking, PaymentAttempt, PaymentAllocation, PaymentWebhook, Refund, RefundAllocation, DocumentSequence, TaxDocument, TaxDocumentLine, FinancialException | payment attempts, checkout payment, Razorpay webhook, refunds, orders, tax documents | Done, no consumer |
| `foundation` | outbox/events | — | Partial |
| `pricing` | rate models | — (read through carts) | Done |
| **missing** | — | **No fulfilment app**: no en-route/arrived/start-OTP/evidence/amendment/completion/abort | **BE-09 not started** |
| **missing** | — | **No cases/ledger/payout/notifications app** | **BE-10 not started** |

`docs/runbooks/` holds 2 runbooks (partner document storage, payment reconciliation).
**`docs/adr/` does not exist.**

### Frontend — `frontend/apps/`

**Customer (`apps/customer`)**

| Route | State |
| --- | --- |
| `/` | **Does not exist.** No `app/page.tsx`. The site root 404s. |
| `/catalog`, `/catalog/[category]`, `/catalog/[category]/[service]` | Done, server-first, JSON-LD, sitemap |
| `/book/[service]` | Done — scope → address → login interrupt → adds to cart, pushes `/cart` |
| `/cart` | Done — multi-item cart, login merge with explicit decisions, plan comparison, quote review, confirm → Booking Group |
| `/bookings`, `/bookings/[groupId]` | Done — cursor `useInfiniteQuery`, bounded polling, server-published recovery/cancel |
| `/login` | **Does not exist.** Login is inline inside the booking workspace only. |
| **payment / checkout** | **Does not exist.** ← the reported gap |
| addresses / account / privacy | **Do not exist**, though `/addresses/` and `/auth/privacy/*` are published |
| header / nav / signed-in shell | **Does not exist.** `app/layout.tsx` still carries the comment "No signed-in shell here yet". |

Customer link graph today: `catalog → /book/[service] → /cart`. **Nothing anywhere links to
`/bookings`.** It is reachable only by typing the URL. This is the same navigation defect the
Partner app just had fixed.

**Partner (`apps/partner`)** — marketing tree, `/apply` (7 steps incl. signed KYC upload),
`/availability`, `/offers` (full inbox: 5s bounded polling, cursor pagination, Accept/Decline,
120s undo, Commit now, stable-key idempotent replay, server-clock countdowns), plus the new
`/login` + `/dashboard` + shell. **No work/fulfilment UI, no earnings** (blocked on BE-09/BE-10).

**Operations (`apps/admin`)** — `/` shell + `/reviews` only. Four published Operations contracts
have no UI: compatibility rules, assisted checkouts, unit offers, partner availability.

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
| BE-07 | **Partial** | Yes | Customer group recovery/cancel, unit-scoped offers/reservations, outbox/Celery coordinated dispatch (1.9.0); cart removal, typed offer commands, bounded cursors (1.13.0); server-clock exposure (1.11.0). | **Remaining: revoke/release/manual-recovery idempotency, ranking explainability, and accept/expiry/payment-hold concurrency hardening.** Then BE-09. |
| BE-08 | Done; live activation gated | — | Group payment allocations, Razorpay/fake provider boundaries, monotonic webhook reduction, payment/refund reconciliation, unit refunds, immutable invoice/credit-note retrieval (1.10.0). | Duplicate/out-of-order webhooks, redirect loss, hold/capture races, amount mismatch and failed refunds converge safely. **Production stays fail-closed until Razorpay credentials, durable worker/beat deployment and CA/legal approval are supplied.** |
| BE-09 | **Not started** | **Yes — highest-value backend work** | Per-unit B8 fulfilment commands (en route, arrived, start OTP, evidence, amendment, completion, abort), derived group state, Customer-authored cancellation quote/confirm, group/unit cancellation/recovery. | M1 arrival→completion/partial/dispute/recovery passes per unit and reconciles group truth with idempotency and audit. |
| BE-10 | **Not started** | Foundations can begin | B9/B10 cases, ledger, payout, async recovery, notifications, kill switches, metrics, ADRs, runbooks. | Financial maker-checker, provider ambiguity, worker crash/replay and production-readiness drills pass. |
| BE-OPS | **Not started** | Yes | **R4 infrastructure debt, tracked separately because BE-09/BE-10 both assume it.** Runnable worker/beat topology, outbox recovery sweep for `PENDING`/`PROCESSING`/`FAILED`, real-Redis integration suite, queue-outage/replay/stuck-command runbooks, and the missing `docs/adr/` tree. | Tests run against real Redis + worker/beat, not locmem + eager Celery. A killed worker mid-command recovers to a correct terminal state. |

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
| **FE-10** | **Not started** | **Yes — OpenAPI 1.13.0. Start here.** | **The missing "Continue to Payment".** Group payment attempt from a confirmed Booking Group, per-unit allocations, Razorpay redirect/SDK boundary, return/ambiguity recovery, receipt/refund/invoice retrieval. | Stable idempotency keys; no mutation auto-retry; redirect-loss, duplicate-submission, unit-refund and ambiguous-outcome tests pass. No amount, fee or deadline is computed client-side. |
| **FE-13** | **Built, unverified, uncommitted** | — | **Partner signed-in shell** (`FE-11-partner-shell-brief.md`, mislabelled FE-11 there). `/login` route, `/dashboard` home, one `useAuthGuard` shell over offers/availability/apply, marketing→product entry, approved-Partner dead-end fixed. | Unit tests (`session/model/redirect.test.ts`, `presence-panel.test.tsx`), typecheck and lint are green in this audit. **`e2e/partner-shell.e2e.ts` has not been run here, and none of it is committed.** Run Playwright, then commit. |
| **FE-14** | **Not started** | **Yes — no new contract needed** | **Customer signed-in shell, root page and `/login`** — the exact defect FE-13 just fixed for Partner. Today `/` 404s, there is no `/login`, `app/layout.tsx` still says "No signed-in shell here yet", and **nothing in the app links to `/bookings`**. Copy `apps/partner/features/session/partner-shell.tsx`; do not invent a second pattern. | Every signed-in destination is reachable by clicking. One session decision, not one per screen. Unauthenticated visits to `/cart`/`/bookings` redirect to `/login?next=`. Booking-workspace login-interrupt behaviour is preserved, not duplicated. |
| **FE-15** | **Not started** | **Yes — `/addresses/`, `/auth/privacy/*` published** | **Customer account surfaces**: saved address book (list/add/edit/delete, reused by checkout), communication preferences, consent receipts, privacy requests. | Exact address text never reaches browser storage, logs or analytics. Deletion is confirmed against server truth, never optimistic. |
| **FE-16** | **Not started** | **Yes — published in 1.8.0/1.9.0** | **Operations surfaces that already have contracts but no UI**: compatibility-rule maker-checker (create/activate/reject/retire), assisted checkout, unit offers + reoffer, partner availability view. | Every financial or authorization action follows the published maker-checker and audit references. An Operations actor cannot approve their own proposal. |
| FE-11 | Not started | **No — BE-09** | Customer Booking Group/unit progress views and Partner unit-scoped fulfilment/work/evidence/amendment/completion UI. | Backend-authorized actions only; reload/multi-tab/stale-version/partial-unit-failure accessibility tests pass. |
| FE-12 | Not started | **No — BE-10** | Operations cases/timelines/kill switches/maker-checker and Partner ledger/payout screens. | Sensitive data masked by default; every reveal and financial action follows published authorization and audit references. |

---

## Integration defects discovered by FE-08G/FE-09 — all closed

| Proposal | Backend | Frontend | Status |
| --- | --- | --- | --- |
| 0007 cart-item removal | Typed versioned `POST …/remove/`, conflict/not-found regressions, PostgreSQL edit-vs-remove race | Remove UI, targeted cache updates, two-item/stale-version browser cases | **Fully complete** (1.13.0) |
| 0008 bounded list cursors | Typed `cursor` on booking-groups and partner offers; `400 cursor_invalid` on blank/malformed/poison | Both lists cursor-aware `useInfiniteQuery`; truncation copy removed | **Fully complete** (1.13.0) |
| 0009 typed offer commands | Required `Idempotency-Key`, `OfferActionEnum`, same-key replay, reservation conflict, concurrent accept | One stable key per logical action; lost-Accept replay never reports a won offer as lost | **Fully complete** (1.13.0) |
| 0010 server clock | `Date` CORS exposure, production fail-closed, `live_server` proof, `server_now` | Mocked Date dependency removed; skewed-device countdown proofs | **Fully complete** (1.11.0) |

---

## The remaining plan, in execution order

### Now — unblocked, no new contract required

1. **FE-13 close-out.** Run `pnpm e2e` for `partner-shell.e2e.ts`, then commit. 21 untracked files
   are currently one `git clean` away from being lost.
2. **FE-10 — Customer payment.** The reported gap. Largest single value increment in the product:
   without it the Customer journey cannot reach a booking Django will fulfil.
3. **FE-14 — Customer shell / root page / `/login`.** Cheap, and FE-10's return-from-redirect
   landing needs somewhere real to land.
4. **BE-07 hardening.** Revoke/release/manual-recovery idempotency, ranking explainability,
   accept/expiry/payment-hold concurrency. Prerequisite for trusting BE-09's inputs.

### Next — unblocked but lower leverage

5. **FE-15** Customer account/address surfaces. **FE-16** Operations published-but-unbuilt surfaces.
   Independent of each other; safe to run in parallel.
6. **BE-OPS** worker/beat topology, outbox recovery sweep, real-Redis suite, runbooks, `docs/adr/`.
   BE-09 and BE-10 both assume this exists; building them on eager-Celery tests will hide real
   failure modes.

### Then — the last two backend milestones

7. **BE-09** fulfilment commands → unblocks **FE-11**.
8. **BE-10** cases/ledger/payout/notifications → unblocks **FE-12**.

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
