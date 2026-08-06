# M1 Backend/Frontend Execution Board

Purpose: complete the M1 launch slice quickly on relationships that remain valid for the final
product, without guessed contracts, duplicate business logic or conflicting Codex/Claude edits.

This file is **state**. For the ordered plan and a copy-pasteable prompt per task, see
[`06-roadmap-and-prompts.md`](./06-roadmap-and-prompts.md).

---

## Audit snapshot — 2026-08-06 (end of S7, merged to `main`)

| Check | Result |
| --- | --- |
| Committed OpenAPI | `contracts/openapi/v1.yaml` **1.17.0**, **126** published paths |
| Backend apps | 16 installed. `fulfilment`, `cases`, `payouts` and `notifications` all added since 1.15.1, and all four are published over HTTP. |
| Backend `quality.cmd` | **Green at 1.17.0**: Ruff clean, strict MyPy clean on **180 files**, **535 passed** (3 integration deselected), branch-aware coverage **85.25%** against the 85% gate, no migration drift, generated OpenAPI validates and matches the committed contract. Runtime 13m25s. |
| Frontend | typecheck **9/9**, lint clean, **1138 tests across 76 files**, client current at 1.17.0 |
| Playwright | **133 green** on the Operations console + responsive harness. Customer payment, Customer visit and Partner jobs still have **none**. |
| Working tree | Clean, merged to `main` |

### The critical path is complete

**S1 through S7 are done.** S8 — the 44 acceptance scenarios against authoritative Django — is the
only stage of the M1 plan still open, and it is verification rather than building.

### Test status, corrected

`apps/cases` and `apps/payouts` are **verified**: 70 green across payouts, cases, notifications and
session isolation. The first diagnosis recorded here ("cross-file fixture collisions") was
**wrong**; the parallel session identified the real cause independently — two pytest processes
sharing one `test_vsolve` database, producing `DuplicateDatabase` and `ObjectInUse` at setup.

**Run the backend suite with a distinct `DATABASE_URL` when another session is working** — e.g.
`…/vsolve_lane1`. This is now the standing instruction, not a workaround.

### Defects caught by verification rather than by writing code

Six now, and they cluster. Recording them because the pattern predicts where to look next.

**Guards that were never run red:**

- **The Operations shell did not compile.** `operations-shell.tsx` was missing its `Link` and
  `usePathname` imports, and `WorkspaceNav` was written but never rendered — so `admin` failed
  typecheck and lint, and the four `/operations/*` routes were reachable only by typed URL.
- **FE-15's privacy guard failed the file that was correct.** The log rule counted
  `console.error`'s own name, and the tag `"[account-error-boundary]"`, as mentions of the error
  object. It now scans only a call's arguments with quoted literals stripped, and was verified red
  against a deliberate leak before being trusted.
- **A frontend test typechecked green only because turbo replayed a cache.** `role-selection.test.ts`
  cast its fixture `as never` and then spread it, which is illegal. A cold run failed. Typing it
  properly also revealed the fixture never had the `full_name`/`email` the contract declares —
  the cast was hiding a shape mismatch. **A cached gate is not a gate.**

**Doors published without their handles** — three occurrences of one mistake:

- `checkout_id` on `BookingGroup` (proposal 0011): `recovery_action` said `PAYMENT_REQUIRED` and
  the command it pointed at needed an id the projection withheld.
- `booking_id` on `FulfilmentUnit` (1.16.0): same shape, discovered while wiring FE-11.
- The dispatch commands (1.15.0): published, with no caller anywhere.

**A list that could not return its first page:** `StrictCursorPagination` reads `ordering` from
itself, DRF defaults it to `-created`, and none of `OperationsCase`, `PartnerLedgerEntry` or
`PayoutBatch` has that field — so three list endpoints died in paginator setup. Found only by
running them.

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
| `cases` | OperationsCase, OperationsCaseEvent (append-only) | queue + detail, claim/escalate/resolve/notes | Done (1.17.0) |
| `payouts` | PartnerLedgerEntry (immutable, signed), PartnerPayoutAccount, PayoutBatch, PayoutBatchItem | Partner earnings/ledger/account; Operations batches with approve/pay/cancel behind a step-up, unpayable partners, ledger adjustments | Done (1.17.0) |
| `notifications` | NotificationIntent, NotificationDelivery (immutable), KillSwitch | kill-switch board, engage/release | Done (1.17.0); intent delivery has no provider adapter yet |

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
completion report, plus abort and release with reason. `/earnings` is the FE-12 ledger view:
balance, per-entry calculation snapshot, and the masked payout account with its
`is_payable_now` explanation.

**Operations (`apps/admin`)** — `/`, `/reviews`, `/finance`, and
`/operations/{compatibility-rules,manual-offers,assisted-checkouts,partner-availability,dispatch,
cases,payouts,kill-switches}` (FE-16, FE-17, FE-18, FE-12), all reachable from the nav and all
with tests.

### Shared packages

`@vsolve/api-client` (generated **1.17.0**, errors, idempotency, server-clock), `@vsolve/query`
(auth guard, OTP, session, cursor, polling, countdown, error presentation, key factory,
per-host role selection), `@vsolve/ui`, `@vsolve/config`, `@vsolve/testing`.

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
| BE-10 | **Done** | — | **B9 + B10, domain and HTTP (1.17.0, 18 paths).** `apps/cases` (nine kinds, team routing, SLA, required terminal results, append-only events), `apps/payouts` (immutable signed ledger, 24h account-change cooling, maker-checker in both the service and a `CheckConstraint`, RazorpayX adapter, reconciliation sweep), `apps/notifications` (intent/delivery split, kill switches as rows). A dispute holds the Partner's earning at `PENDING`; closing the case releases it, but only when no other open case holds the same booking. Metrics named and retention swept (S6c). | Financial maker-checker and the double-reservation race pass, the latter with real threads against PostgreSQL — the guarantee is a partial unique index, so the losing caller gets an `IntegrityError` rather than a silent duplicate. **Open, both external:** live RazorpayX sandbox submission (credentials) and notification provider delivery (MSG91/DLT). |
| **BE-RANK** | **Not started** | Yes | Dispatch eligibility currently ignores travel buffers, area operating hours during matching and presence policy; order is a stable sort on Partner UUID. Explainability was added, the ranking was not. | A Partner is not offered a job they cannot physically reach, and the recorded `ranking_snapshot` names a real deciding factor. |
| **BE-CAT** | **Not started** | Yes | B3 Operations lifecycle APIs: authorized, audited catalog / task-rate / pricing-policy / service-area management with effective-date and activation validation, plus range `ExclusionConstraint` overlap protection for simultaneously-effective rates (only plain `UniqueConstraint` exists today). | Two overlapping effective rates cannot both be active; activation and quote selection have concurrency tests. |
| BE-OPS | **Done** | — | Worker/beat topology (`scripts/worker.*`, `scripts/beat.*`), outbox recovery sweep with lease/dead-letter, real-infrastructure suite (`tests/integration/`, `-m integration`), 5 runbooks and 6 ADRs. | Landed in `dc4a308`. The 3 integration tests are deselected from the default run by design and need `-m integration` against real Redis. |

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
| **FE-13** | **Done; browser gate outstanding** | — | **Partner signed-in shell** (`FE-11-partner-shell-brief.md`, mislabelled FE-11 there). `/login` route, `/dashboard` home, one `useAuthGuard` shell over offers/availability/apply, marketing→product entry, approved-Partner dead-end fixed. Committed. | Unit tests (`session/model/redirect.test.ts`, `presence-panel.test.tsx`), typecheck and lint green. **`e2e/partner-shell.e2e.ts` has still never been run.** |
| **FE-14** | **Done** | — | **Customer shell, root page and `/login` — built 2026-08-05.** `app/page.tsx` (the root used to 404), `app/login/page.tsx`, `features/session/view/{site-header,customer-shell,login-screen}.tsx`, and a session gate at `app/(flow)/bookings/layout.tsx`. `safeNextPath` moved to `@vsolve/query` rather than copied — an open-redirect guard should have one implementation. | 7 header tests + 351 customer tests green; typecheck 9/9, lint clean; build shows `/` and `/login` live and both new routes reachable. **Correction to the original brief: the gate covers `/bookings/**` only.** Gating `/cart` would have been wrong — the anonymous cart is a deliberate product surface and the login-merge flow exists to serve it. The booking workspace's inline login interrupt is preserved, not duplicated. |
| **FE-15** | **Done** | — | **Customer account surfaces** — `/account/{addresses,messages,privacy,sessions}` are live, and the storage/log/URL privacy boundary is enforced by a source scanner that has been verified red against a deliberate leak. | **Remaining:** component tests for the address book, communication preferences, consent receipts and privacy requests; prove deletion is confirmed against server truth and never optimistic. |
| **FE-16** | **Done** | — | **The four Operations consoles** — compatibility-rule maker-checker, assisted checkout, unit offers + reoffer, partner availability. Nav mounted 2026-08-05; before that the shell did not compile and the routes were reachable only by typed URL. | **Remaining: zero test files exist for any of the four features.** Needs maker-checker refusal, self-approval denial, assisted-checkout consent capture, reoffer and availability-edit coverage. |
| **FE-17** | **Done** | — | **Operations dispatch recovery**: offer revoke, reservation release, unit recover, and the read-only dispatch explanation. Four published paths with no caller anywhere in the frontend. | Every command sends `expected_unit_version` and a stable `Idempotency-Key`; a stale read surfaces `dispatch_version_conflict` and refetches rather than retrying. |
| **FE-18** | **Done** | — | **Finance console**: refund queue (`GET /finance/refunds/`), the reconcile command, and the `auth/finance/step-up/` gate in front of them. | No refund is reported successful before Django says so; a failed refund stays visibly in progress rather than resolving optimistically. |
| FE-11 | **Done** | — | Customer visit surface (status vocabulary, start-code prompt, confirm/dispute with equal weight, task list) and Partner work surface (en route → arrived → OTP → report, abort, release with reason, per-task outcomes). Both poll only while the *server* can still move the visit. | 17 predicate tests pin which actions are offered and when polling stops. The `can*` helpers pick a screen and never permit a command — `ALLOWED_TRANSITIONS`, the fee ladder and the notice rule stay in Django. **Remaining:** browser E2E for reload/multi-tab/stale-version. |
| FE-12 | **Done** | — | **Operations cases, payouts and kill switches, plus the Partner earnings view** — `/operations/{cases,payouts,kill-switches}` and `/earnings`, all in the nav. Built against 1.17.0, no invented DTOs. | The payout account is masked to `account_last4` and the provider fund-account id is not in the projection at all, so there is nothing to leak. Approve/pay carry the step-up; **cancel does not, deliberately** — the gate slows money leaving, and a stop button harder to press than the go button is backwards. `model/guards.test.ts` pins that a proposer cannot approve their own batch in the UI, the same rule PostgreSQL enforces underneath. |

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
| ~~S3~~ | Seven B8 review findings + group reschedule | **Done** 2026-08-06 (`8ff87ff`) |
| ~~S4~~ | BE-09-API — B8 published as one release, OpenAPI 1.16.0 | **Done** 2026-08-06 (`5500c3e`) |
| ~~S5~~ | FE-11 Customer visit + Partner work surfaces | **Done** 2026-08-06 (`5a83f1b`) |
| ~~S6a~~ | **B9 domain** — cases, ledger, payout batches, RazorpayX adapter | **Done** (`e6bb07c`). Verified: 47 tests green on an isolated `DATABASE_URL`. The "cross-file fixture collisions" diagnosis was wrong — see the corrected test-status note above. |
| ~~S6b~~ | **B10 domain** — notification intent/delivery, kill switches | **Done** (`b1bb8b9`). 19 tests. |
| ~~S6c~~ | Metric names + retention sweeps | **Done** (`e142a01`). `common/observability/metrics.py` names every counter the plan asks for; retention sweeps expired OTP challenges, sessions and audit events on separate horizons. Consent receipts are deliberately never swept. **Alerting on those metrics is still a deployment task, not a code one.** |
| ~~S6d~~ | The HTTP surface for B9/B10 | **Done** (`c60e083`). 18 paths in OpenAPI **1.17.0**. Payout approve/pay behind `HasRecentOperationsStepUp`; cancel deliberately not. `HasRecentFinanceStepUp` deleted. |
| ~~S7~~ | **FE-12** | **Done** (`e6875d6`). `/operations/{cases,payouts,kill-switches}` and Partner `/earnings`, all reachable from the nav. |
| ~~S7b~~ | Per-host sessions, role-picker removal, demo seed data | **Done** (`f270715`, `02701f3`, `3185f5c`). See the three-host section below. |
| **S8** | **M1 acceptance** — the 44 scenarios plus the concurrency list, against authoritative Django, then the cutover checklist. **This is the only stage left.** | Unblocked. Clear the two-item entry list above first — running acceptance on an unverified base proves nothing. |

### What is still unproven

Two things, both verification rather than building. **This is the S8 entry list** — running
acceptance on an unverified base proves nothing, so clear these first.

1. **API tests for the 1.17.0 paths are thin.** `tests/payouts/test_payout_api.py` and
   `tests/cases/test_cases_api.py` exist and cover the shapes that matter most — partner-scoped
   reads, the masked account, batch envelopes, the unpayable-partners explanation, refusal of an
   adjustment without a step-up, and the reconciliation sweep. The kill-switch board and several
   case commands still have no view-level test. `tests/fulfilment/test_fulfilment_api.py` is the
   pattern: authorization, the existence oracle, idempotent replay, stale versions, projection
   scope.
2. **Playwright covers the Operations console and nothing else.** 133 green there (the
   `operations-shell` project plus the responsive harness). **Customer payment
   (`payment.e2e.ts`), Customer visit tracking, Partner jobs and the Partner shell
   (`partner-shell.e2e.ts`) have never been run in a browser.** These are the highest-value
   remaining tests in the milestone: every one of them is a money or safety path.

### Seeded demo data

`python manage.py seed_console_demo_data` fills every Operations console from real domain
services rather than fixture inserts — 10 cases (2 deliberately overdue), 10 payout runs spanning
every state, 12 ledger entries, 3 kill switches, a populated review queue and 2 rule drafts. It
is idempotent and re-runnable.

Five real bugs were fixed in it before it produced usable data (`3185f5c`), including seeded
dispatch stealing offers from live test partners, and stale reservations blocking re-runs.
Compatibility rules are seeded as **DRAFT on purpose**: a seeder that approves its own rules
would hide the maker-checker gate the console exists to exercise.

### Three-host deployment — decided and implemented

The apps deploy to `vsolvehub.com`, `partner.vsolvehub.com` and `consolve.vsolvehub.com`.

**Sessions are per-host, and production refuses to start otherwise** (`f270715`).
`SESSION_COOKIE_DOMAIN` and `CSRF_COOKIE_DOMAIN` stay unset, so the browser scopes each session
cookie to the exact host that issued it. A shared `.vsolvehub.com` cookie would make a stolen
Customer session a valid credential against the console that approves payouts — refused rather
than warned about, because it is a one-line change somebody makes to give staff a single
sign-in and it breaks nothing visibly. `config/settings/guards.py` holds the check so it can be
tested without executing a whole settings module.

**The role picker is gone** (`02701f3`). Each app selects its own role, because the domain *is*
the role — and because `verify_login_otp` re-grants `customer` on every login and session
creation picks the alphabetically first grant, so every staff and Partner sign-in used to land
on a picker.

Still to set at deploy time:

- `CORS_ALLOWED_ORIGINS` and `DJANGO_CSRF_TRUSTED_ORIGINS` must list all three origins.
  Credentialed CORS is fail-closed, so an unlisted origin gets nothing at all, and production
  refuses to start if the CORS list is not a subset of the CSRF list or if any origin is not
  HTTPS.
- `DJANGO_ALLOWED_HOSTS` for the API host.

### Parallel lanes — all closed

P-A through P-I were completed in a concurrent session and are committed (`0e1e75d`): FE-16 and
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
