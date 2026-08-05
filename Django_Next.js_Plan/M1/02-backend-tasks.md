# M1 Backend Tasks

Scope and exclusions are defined in [M1 README](./README.md). Frozen clocks, amounts and provider
choices are in [Initial configuration](./05-initial-configuration.md).

Task markers: `[x]` implemented and covered by the current automated suite · `[~]` partially
implemented, with the missing production behaviour named · `[ ]` not implemented. A model or happy
path alone never makes a business capability complete; its authorized HTTP contract, idempotency,
failure recovery, audit and concurrency behaviour must also exist.

## Audit snapshot — 2026-08-05 (verified against real PostgreSQL, committed)

`scripts/quality.cmd` is **green**: Ruff format/check, strict MyPy, **384 passed** (3 integration
tests deselected by the default `-m "not integration"`), branch-aware coverage **87.45%** against
the 85% gate, no migration drift, and a freshly generated OpenAPI that validates and matches the
committed `contracts/openapi/v1.yaml` at **1.15.1** with **82** published paths. Runtime 10m38s.

Corrections to the 2026-08-04 snapshot below, which was written from a stale tree:

- **B8 is not "no code".** `apps/fulfilment` is complete — 12 models, ~3,100 LOC, 126 tests — and
  is now committed. It still has **no HTTP surface**; that is BE-09-API and it is the single
  highest-value remaining backend task.
- **BE-OPS is not open.** Worker/beat scripts, the outbox recovery sweep with lease and
  dead-letter, and a real-infrastructure suite all exist.
- **`docs/adr/` exists** and holds 6 ADRs. `docs/runbooks/` holds 5, not 2.
- **BE-08 is not "no consumer".** FE-10 calls payment attempts, checkout payment, reconcile,
  orders and tax documents.

The full findings are in [07-audit-2026-08-05.md](./07-audit-2026-08-05.md).

## Audit snapshot — 2026-08-04 (full repo re-audit — superseded above)

Re-derived from the working tree rather than from prior status claims. See
[task.md](./task.md) for the consolidated board.

- `pytest` (venv): **218 passed**, branch-aware coverage **86.47%** against an 85% gate,
  in 160s. No failures, no skips at module level.
- Committed `contracts/openapi/v1.yaml` is **1.13.0** with 60 published paths. The frontend's
  generated client matches it (`contract:check` clean).
- **Implemented and serving:** `identity`, `catalog`, `locations`, `partners`, `carts`,
  `assignments`, `commerce`, `pricing`, `health`. `foundation` holds the outbox primitives.
- **BE-08 is complete and has no consumer.** `apps/commerce/` publishes payment attempts, checkout
  payment, the Razorpay webhook, refunds, orders and tax documents; **no frontend code calls any of
  them.** That is FE-10, not a backend gap.
- **BE-09 has no code at all.** There is no fulfilment app: no en-route, arrived, start-OTP,
  evidence, amendment, completion or abort command exists anywhere in `backend/apps/`.
- **BE-10 has no code at all.** No cases, ledger, payout or notification models or endpoints.
- **BE-07 remaining hardening is closed (OpenAPI 1.15.0):** revoke/release/manual-recovery are
  now typed, authorized, idempotent, audited commands; ranking provenance is persisted and
  readable by Operations; accept/expiry/payment-hold/worker-death races are proven against real
  PostgreSQL. The legacy Checkout-scoped dispatch path in `services.py` keeps its prior
  `eligibility_snapshot` and gains no ranking provenance — B6 re-keyed dispatch to the Fulfilment
  Unit and that is the live path.
- **R4 is unchanged and now tracked as BE-OPS on the board.** Tests still run locmem + eager Celery.
  No worker/beat topology, no outbox recovery sweep, no real-Redis suite.
- `docs/runbooks/` holds 2 runbooks (partner document storage, payment reconciliation).
  **`docs/adr/` does not exist.**
- External blockers unchanged: MSG91/DLT, malware scan approval, KYC retention, Razorpay live,
  CA/Finance/legal, real Redis/Celery crash recovery.

## Audit snapshot — 2026-08-04 (proposals 0007–0010 gate green)

- `.\scripts\quality.cmd` passes: Ruff format/lint, strict MyPy (123 files), **210 tests**, branch-aware
  coverage **86.40%**, migration drift check clean, generated OpenAPI validates and matches the
  committed `contracts/openapi/v1.yaml` at **1.13.0**.
- `makemigrations --check --dry-run` reports no model drift; `git diff --check` is clean.
- Proposal 0007: typed `POST …/remove/` with version body, DELETE sibling, conflict/`not_found`
  regressions including a PostgreSQL edit-vs-remove race.
- Proposal 0008: published optional `cursor` on booking-groups and partner offers; blank/whitespace/
  malformed/poison cursors return `400 cursor_invalid`; traversal/ownership/ordering/mid-insert pass.
- Proposal 0009: required `Idempotency-Key`, `OfferActionEnum`, same-key replay, reservation conflict,
  concurrent accept and profile-less Partner denial.
- Proposal 0010: `Date` CORS exposure, production fail-closed, `live_server` readable header,
  `Offer`/`OfferPage.server_now`.
- Frontend follow-ups for G21/G22/G23/FE-09C remain outstanding and are not claimed Done.
- External blockers unchanged: MSG91/DLT, malware scan approval, KYC retention, Razorpay live,
  CA/Finance/legal, real Redis/Celery crash recovery.

## Prior audit snapshot — 2026-08-04 (WIP review before gate)

- Focused proposal suites on the dirty tree: **0007 cart removal** and **0010 server clock** pass;
  **0009 offer commands** 17/18 pass (one fixture `Role.DoesNotExist`); **0008 cursors** 8/14 pass.
- Combined focused run excluding known gaps: **43 passed**.
- Combined focused run including gaps: **7 failed** (6×0008 contract/refusal + 1×0009 fixture).
- `.\scripts\quality.cmd` **fails before the test suite** on strict MyPy:
  `apps/assignments/serializers.py:124` redundant cast to `str` in `OfferSerializer.get_server_now`.
- OpenAPI working copy is version **1.13.0** and includes `cart_items_remove`, `OfferActionEnum`,
  offer `Idempotency-Key`, and `server_now`. It still **omits** typed `cursor` on
  `/booking-groups/` and `/partner/offers/`. Changelog 1.13.0 documents 0007 only — 0009 is published
  in the YAML without a matching changelog entry.
- Branch-aware coverage was not re-established by a green full suite in this review (focused runs
  alone sit under the 85% gate by design).
- External blockers unchanged: MSG91/DLT, malware scan approval, KYC retention, Razorpay live,
  CA/Finance/legal, real Redis/Celery crash recovery.

## Prior audit snapshot — 2026-08-03

- Django system checks, Ruff formatting/lint, strict MyPy and all **164 backend tests** pass on the
  current run, which includes proposal 0010's server-clock work.
- Branch-aware coverage is **85.42%** and `makemigrations --check --dry-run` reports no model drift.
- A freshly generated OpenAPI document validates when written to a temporary audit file, and its
  SHA-256 hash matches the committed `contracts/openapi/v1.yaml`. The locked base requirements have
  no known vulnerabilities according to `pip-audit`.
- Docker PostgreSQL 17 and Redis 7.4 are currently healthy, and every discovered local migration is
  applied. This removes the previous local-container blocker; worker/beat/provider topology remains
  unverified.
- The test suite exercises PostgreSQL, but test settings replace Redis with locmem and run Celery
  eagerly. Real Redis, worker/beat, provider, concurrency and crash-recovery tests are still missing.
- `contracts/openapi/v1.yaml` is published as `1.11.0`. It retains the 1.6 A1 primitives and adds the
  versioned multi-item Cart, explicit login-merge decisions, idempotent Plan Sets, selected-plan
  group/unit quotes, Booking Group/Fulfilment Unit checkout, autonomous dispatch, group-aware
  payment/refund/document projections and `server_now` on the Partner offer projection. The
  frontend-generated schema is current at 1.10.0 and must be regenerated at 1.11.0.
- Credentialed CORS, JSON CSRF bootstrap, token rotation/recovery semantics and explicit production
  origin validation are implemented and covered at Django/middleware level. FE-05's real
  Django-backed Playwright mutation, HttpOnly-cookie and browser-storage assertions also pass.
  FE-09's finding that `Date` was hidden cross-origin is fixed: the header is exposed to allowed
  credentialed origins, production fails closed if a deployment removes it, and a `live_server`
  test proves a real cross-origin response carries a readable `Date` (proposal 0010).

## Cross-cutting blockers discovered by the audit

### R1 — Backend contract publication is versioned and gated

OpenAPI 1.10.0 and its migration changelog match a fresh Django generation. Representative auth,
throttle and conflict examples plus typed checkout idempotency headers are published, and backend
quality fails on migration, invalid-schema or Django-to-committed-schema drift. Generated TypeScript
freshness passes in the frontend gate; future retryable commands must publish the same
header/error convention when introduced.

### R2 — The quality command is narrower than the documented completion gate

`scripts/quality.cmd` now runs Ruff, MyPy, pytest, migration drift and generated OpenAPI validation/
diff. Frontend generated-client freshness, continuous dependency audit, and explicit PostgreSQL/
Redis/Celery integration and concurrency suites still need their owning CI gates.

### R3 — Operations authorization hardening is implemented for current APIs

`IsOperationsUser` now requires both an unrevoked grant and the session's selected Operations role;
staff/superuser flags do not bypass that product boundary. Allowed/denied authorization is audited,
and an Operations actor cannot review their own Partner application or documents. Apply the same
pattern to every new sensitive Operations selector/command.

### R4 — There is no runnable asynchronous topology or recovery sweep

Celery configuration and one presence reconciliation job exist, but local infrastructure starts only
PostgreSQL and Redis. Add worker/beat commands or services, an outbox recovery sweep for events left
`PENDING`/`PROCESSING`/`FAILED`, and runbooks for queue outage, replay and stuck commands.

### R5 — Browser session/CSRF and server-clock exposure are both proven

Django now enables credentialed CORS only for explicit origins and returns the masked token from the
typed CSRF bootstrap while keeping the cookie HttpOnly/Secure in production. Middleware tests cover
allow/reject headers, stale-token rejection, refresh, mutation and revoke. FE-05 proves the same flow
against real Django and confirms no token reaches browser storage.

The `Date` response header used by shared countdown calibration is now named in
`CORS_EXPOSE_HEADERS`, so an allowed credentialed origin can read it. Production start-up raises
`ImproperlyConfigured` if a deployment removes it, because losing it degrades silently: every
countdown falls back to the device clock with no error, no log and no visual difference. Regressions
live in `backend/tests/test_server_clock_calibration.py`, including a `live_server` test that proves
the header exists on the wire — something the Django test client cannot show, since it never passes
through a WSGI server. The remaining acceptance item is FE-09's skewed-device browser proof.

### R6 — Identity/error projection is published in the current OpenAPI contract

The session projection now returns nullable `user`, `active_role` and `session_expires_at`; anonymous
state is an ordinary `200`. OTP issue publishes code length, throttles publish wait seconds, exception
messages are safe fallback copy and backend codes remain lowercase `snake_case`. FE-05 integrated
this identity/session contract; FE-08G/FE-09 integrate the generated replacement booking shapes.

### R7 — Document scanning and verified-KYC retention require approval

The private Supabase adapter, signed upload/finalize flow, streamed size/type/SHA-256 verification,
assigned-reviewer reveal and delayed orphan cleanup are implemented. New documents remain
fail-closed at `PENDING` until a trusted scanner records `CLEAN`. Production launch still requires
an approved malware provider and authenticated/reconcilable integration, plus a legal retention
schedule and audited deletion command for verified KYC. The operational boundary is documented in
`docs/runbooks/partner-document-storage.md`; these decisions must not be replaced by local defaults.

### R8 — Singleton booking relationships are superseded before product integration

OpenAPI 1.10.0 retains the BE-06G/BE-07 expand phase: `CartItem.cart` is many-to-one, Quote can snapshot a
selected Plan, and Checkout materializes Booking Group/Fulfilment Units while the deprecated 1.6
fields remain readable. Assignment/Reservation is unit-scoped and BE-08 publishes group Order,
unit Booking and line allocation relationships. FE-08G/FE-09 integrate the generated replacement
shapes and do not use the deprecated singleton path.

## B1 — Foundation and contract

- [x] Environment-specific Django settings, PostgreSQL/Redis infrastructure, liveness/readiness,
      request IDs, JSON logging and the stable API error envelope.
- [x] Durable idempotency and transactional-outbox models plus an at-least-once Celery dispatcher.
- [~] Retry-safe command convention. Checkout creation uses it; most other state-changing endpoints
      rely only on optimistic locking or have no retry contract. Define which commands are retryable
      and apply the convention consistently.
- [x] Generate and validate `/api/v1` OpenAPI. Version 1.11.0 validates, has a migration changelog,
      representative examples and typed planning/quote/checkout idempotency headers, matches Django, and is enforced
      by the backend quality command (R1).
- [ ] Recover stranded outbox/idempotency records and prove crash/retry behaviour with a real worker
      and broker (R4).
- [~] Add the missing quality gates described in R2. Migration and OpenAPI drift now run locally;
      frontend client, dependency and real-infrastructure/concurrency gates remain.
- [x] Implement the credentialed CORS/CSRF contract in R5. Django/middleware regression tests and
      FE-05's real Django-backed Playwright mutation/storage assertions pass.
- [x] Expose the HTTP `Date` response header through credentialed CORS and validate it in production
      configuration, with a real cross-origin regression proving browser-readable server-clock
      calibration (proposal 0010). `CORS_EXPOSE_HEADERS` defaults to `["Date"]` and stays
      environment-overridable so the production guard is a real check; a rejected origin still
      receives no CORS access at all. FE-09's skewed-device browser proof is the remaining
      acceptance item and belongs to the frontend lane.

**Status: partial.** The foundation is usable for development, but it is not yet a production-complete
contract and asynchronous execution platform.

## B2 — Identity, privacy and authorization

- [x] Custom phone-number user, Customer profile, roles/grants, devices, revocable sessions and
      generic OTP responses with cooldown, phone/IP limits, attempt limits and hashed secrets.
- [x] Explicit role switching, session/device listing and revocation, and finance OTP step-up.
- [x] Consent receipts, communication preferences, privacy-request records and access-audit storage.
- [x] Self-role-grant exclusion.
- [x] Partner/Operations/Finance permission matrix requires the selected, unrevoked active session
      role; Operations staff/superuser flags do not bypass the product role boundary (R3).
- [x] Prevent an Operations actor from reviewing their own Partner application or document; direct,
      indirect and revoked-role combinations have regression tests.
- [~] Operations authorization and self-review denial now create access-audit events. Extend auditing
      to every new sensitive read and implement privacy/session/OTP retention and request-fulfilment
      jobs; the models alone are not fulfilment.
- [ ] Implement and test the frozen MSG91 Flow/DLT production OTP adapter and delivery/fallback
      policy; only the development and deliberately-unconfigured adapters exist.
- [x] Publish `OtpIssued.code_length`, typed throttle wait, safe fallback messages, canonical
      lowercase error codes and an anonymous-safe session projection containing user, active role
      and expiry (R6/proposal 0004).

**Status: partial.** The stable identity and privileged Operations contract is published; real-browser
frontend acceptance, production OTP delivery and retention/request-fulfilment work remain.

## B3 — Catalog, rates and geography

- [x] A1 configuration, `TaskRate`, effective pricing policy, base/marginal duration, minimum service
      subtotal, platform-fee, GST and commission input models.
- [x] Address ownership/archive, reverse geocoding with timeout/cache, serviceability, area operating
      windows/exceptions and fail-closed no-fallback behaviour.
- [x] Deterministic reviewed M1 catalog, pricing, Hyderabad service-area and Partner-density seed
      commands; out-of-scope legacy catalog is retained but deactivated.
- [x] Server quote calculation consumes task rate, derived duration, minimum adjustment and platform
      fee, included GST and immutable pricing/commission inputs for later Partner settlement.
- [x] Public catalog exposes only bookable A1 variants with task lines, fulfilment archetype,
      current price and effective minimum-service subtotal; legacy duration-picker fields are not
      part of the public contract.
- [ ] Add authorized, audited Operations APIs for catalog, task-rate, pricing-policy and service-area
      lifecycle with effective-date and activation validation.
- [ ] Add overlap/uniqueness protection for simultaneously effective rates/policies and concurrency
      tests for activation and quote selection.
- [x] Publish bounded applicant-visible service areas and canonical Partner skills; internal capacity
      and ranking inputs remain private (proposal 0005).

**Status: partial.** Customer-facing A1 catalog and complete quote snapshots work; authorized,
audited Operations lifecycle APIs and effective-policy overlap protection remain.

## B4 — Partner onboarding and explicit availability

- [x] Versioned Partner application, consent, normalized skills/services/areas, document metadata,
      submit/review/change-required/approve/suspend/offboard transitions and transition history.
- [x] Explicit weekly and dated availability, overnight/overlap validation, empty-by-default policy,
      and audited Operations-assisted schedule changes requiring active Partner consent.
- [x] Eligibility and presence checks fail closed for unapproved/incomplete Partners and stale or
      unavailable Redis/location state.
- [~] Implement the frozen Supabase Storage private-bucket adapter. Signed upload/review grants,
      streamed object verification, fail-closed scan state and delayed idempotent orphan deletion
      are complete; approved malware scanning and verified-KYC legal retention/deletion remain R7.
- [x] Add Operations application queue and detail selectors/endpoints with bounded filters,
      pagination, assignment/ownership and masked sensitive data.
- [x] Apply the Operations active-role and application/document self-review protections from R3.
- [x] Publish required Partner consent documents/versions and make application PATCH genuinely
      partial with `expected_version`, result-wide validation and a complete response (proposal 0005).

**Status: partial.** The complete browser-facing onboarding/review contract is published in 1.5.0.
Production document approval remains blocked by the explicit scanner and legal-retention decisions
in R7; the API fails closed until those integrations exist.

## B5 — Cart, quote and checkout

- [x] Historical BE-06 baseline: server-owned A1 quote, signed windows, expiry/server time, itemized
      tax-inclusive money and cancellation bands are published in 1.6.0 and covered. Preserve these
      correctness properties while replacing singleton cardinality.
- [x] Change `CartItem.cart` from one-to-one to many-to-one; add `Cart.version`, item version and
      explicit add/update/remove commands with expected-version conflicts and bounded item count.
- [x] Publish a generated-client-compatible cart removal command carrying
      `expected_cart_version` and `expected_item_version`; use a typed POST `/remove/` sibling if the
      schema generator cannot describe a DELETE body. Add success, both stale-version, already-gone
      and unaffected-sibling regressions (proposal 0007).
      Published in 1.13.0 as `POST /cart/items/{item_id}/remove/`; DELETE is retained for existing
      callers and both run one `remove_cart_item`. `cart_version_conflict` now names its
      `conflicting_field`, and removed/unknown/another-Customer ids all answer `cart_item_not_found`
      so the command is not an existence oracle. Regressions add cross-customer denial, an
      accepted-removal replay and a PostgreSQL edit-versus-removal race.
- [x] Replace singleton replacement with a versioned login-merge result that preserves non-duplicate
      items and returns explicit decisions for exact duplicate/incompatible drafts.
- [x] Add effective-dated `ServiceCompatibilityRule` and dependency configuration with activation
      validation, Operations audit and fail-to-separate default behaviour.
      validation, canonical pairs, maker-checker Operations lifecycle/audit, reviewed seed matrix,
      dependency ordering and fail-to-separate behaviour. Unevaluated conditions fail activation.
- [x] Add immutable `FulfilmentPlanSet`, alternatives, `PlanUnit` and `PlanUnitItem` models. Prove each
      cart item appears exactly once per complete alternative and snapshot every decisive input.
- [x] Implement a bounded deterministic planner for same-Partner sequential, coordinated parallel,
      independent-visit and mixed structures using exact variant eligibility, dependency, duration,
      area/window and Partner-capacity inputs.
- [x] Add a selected-plan snapshot plus `QuoteUnit` and `QuoteLine` while retaining nullable legacy
      `Quote.cart_item` during expand/contract. Apply
      the minimum per unit, group fee once, stable paise allocation and unit cancellation bands.
- [x] Publish plan-set create/read, selected-plan quote and versioned multi-item Cart APIs. Opaque IDs
      bind cart version, item fingerprint, address, configuration versions and expiry; grouping, time,
      Partner and money are never client-authored.
- [x] Make old quotes explicitly `ACTIVE`, `INVALIDATED`, `EXPIRED` or `CONSUMED`; keep authorized
      history readable while preventing checkout from stale/invalidated inputs.
- [x] Make `CheckoutSession` group-level and materialize one `FulfilmentUnit` per selected Plan Unit.
      Add bounded Customer read/cancel/recovery projections with authoritative group/unit deadlines.
      Materialization plus bounded Customer group read/detail, transition deadlines, recovery action
      and optimistic/idempotent cancellation are published in 1.9.0.
- [x] Add PostgreSQL/property/concurrency tests for partition completeness, deterministic planning,
      cart edit versus confirmation, login merge, stale plan/quote, duplicate confirmation and
      projection authorization.
      PostgreSQL integration covers sequential/parallel/separate, dependency, merge/version,
      invalidation, idempotency and materialization; 100-case deterministic randomized partition and
      allocation properties plus a true cart-edit/checkout race protect the invariants.

**Status: complete for Cart/Plan/Quote/Group money semantics; proposal 0007 backend half is
complete and verified under OpenAPI 1.13.0 with a green full quality gate.** FE-08G's removal
integration remains Ready and is the only remaining half of 0007.

## B6 — Availability, offer and reservation

- [x] PostgreSQL range reservation with a conditional GiST exclusion constraint for tentative and
      confirmed overlaps.
- [x] Re-key AssignmentAttempt, PartnerOffer and Reservation from group checkout to Fulfilment Unit.
      A multi-line unit intersects Partner eligibility across every exact variant; a Partner offer
      includes only that unit.
- [x] Implement the durable all-or-nothing Booking Group coordinator: parallel unit searches,
      `PARTIALLY_HELD`/`ALL_UNITS_HELD`, group deadline, idempotent release compensation and
      `REPLAN_REQUIRED` when any required pool fails.
- [~] Eligibility checks include approved application, active service/area and explicit schedule.
      Adjacent travel buffers, area operating hours during matching, presence policy and the planned
      deterministic business ranking are not implemented; current order is Partner UUID.
- [x] Sequential offer model and commands for start, accept, commit, decline and undo, including the
      120-second tentative reservation and payment window.
- [x] Assignment-attempt audit now persists `ranking_snapshot`: the policy that ran, the pool it
      considered (bounded to the unit's service area — the bounded privacy policy), the single
      factor that decided the order, and a named exclusion reason for every Partner passed over.
      Published read-only to Operations at
      `GET /api/v1/operations/fulfilment-units/{unit_id}/dispatch-explanation/`. No business
      ranking was added — order is still Partner UUID; this only makes the existing order
      explainable (OpenAPI 1.15.0).
- [x] Move offer expiry, undo expiry, payment-hold expiry and candidate advance to Celery/beat so a
      closed browser cannot stop dispatch. Replace the customer `search/advance` command with a read
      projection.
- [x] Split customer checkout/search responses from the Partner offer serializer. Publish only safe
      customer disclosure and enrich the Partner offer with scope, approximate area, timing,
      occupied estimate, requirements and net earnings.
- [x] Implement the approved M1 delivery transport: bounded short polling of a replayable Partner
      inbox projection, with reconnect/freshness semantics and no assumption that a browser tab stays
      open. Polling observes state only; Celery owns every deadline and transition.
- [x] Publish the existing `cursor` query parameter on Customer Booking Group and Partner offer list
      operations, then prove cursor traversal has no duplicates/skips while rows are inserted
      concurrently (proposal 0008).
      OpenAPI 1.13.0 publishes optional `cursor` (`minLength: 1`) on both lists. Shared
      `StrictCursorPagination` / `CursorInvalidApiError` refuse blank, whitespace, malformed and
      poison-position cursors as `400 cursor_invalid`. Traversal, ownership, ordering and mid-walk
      insert regressions pass under the green full gate.
- [x] Make Partner accept/decline/undo/commit commands idempotent under a required stable key; publish
      a closed action enum, all reachable error responses and a distinct reservation-conflict code.
      Same-key replay must return the authoritative successful projection and create exactly one
      Reservation (proposal 0009).
      OpenAPI 1.13.0 publishes `OfferActionEnum`, required `Idempotency-Key`, 400/403/404/409 and
      `offer_reservation_conflict`. Focused suite and full quality gate are green.
- [x] Publish reliable server-clock calibration for Partner offers. `Date` is exposed globally
      through credentialed CORS, and `server_now` is published on both the `Offer` projection and the
      offer page envelope as defense in depth for the 45-second expiry and 120-second undo window.
      The page-level field covers an empty inbox, which carries no offer to read a timestamp from
      (proposal 0010, OpenAPI 1.11.0 retained in 1.13.0). MyPy and the full quality gate are green.
- [x] Complete revoke/release/manual-recovery commands with authorization, idempotency and audit, and
      add real concurrent-accept/expiry/payment-hold tests.
      `POST /api/v1/operations/offers/{offer_id}/revoke/`,
      `POST /api/v1/operations/reservations/{reservation_id}/release/` and
      `POST /api/v1/operations/fulfilment-units/{unit_id}/recover/` are scoped to
      `IsOperationsUser`, guarded by `expected_unit_version` (`409 dispatch_version_conflict` on a
      stale read), replayable exactly once under a required `Idempotency-Key` through the same
      `execute_idempotent` helper proposal 0009 proved, and each writes exactly one immutable
      `DispatchCommandAudit` row naming the actor, reason and before/after state. Real-PostgreSQL
      tests cover a revoke racing an accept, an accept landing exactly as the offer expires, a
      payment-hold release racing the expiry sweep, and a worker backend killed mid-transaction
      (`pg_terminate_backend`) — none of them may partially commit or burn an idempotency key
      (OpenAPI 1.15.0).

**Status: BE-07 contract defects 0007–0010 are backend-verified in OpenAPI 1.13.0 (2026-08-04).**
**BE-07 remaining hardening (revoke/release/manual-recovery idempotency, ranking explainability,
real-PostgreSQL concurrency) is complete in OpenAPI 1.15.0 (2026-08-05).** Travel/presence
business ranking (still Partner UUID order) remains additional B6 hardening before production.
Frontend G21/G22/G23/FE-09C follow-ups are Ready and not Done.

## B7 — Orders, payment, refund and documents

- [x] Initial persistence models for Order, Booking, PaymentAttempt, verified webhook record, Refund
      and TaxDocument.
- [x] Remove the one Order → one Booking → one Partner assumption. One Order belongs to a Booking
      Group and has one Booking per Fulfilment Unit; Partner identity lives on unit Booking/assignment,
      not the group Order.
- [x] Add immutable `PaymentAllocation`/document-line ownership so capture, refund, tax, commission,
      ledger and chargeback exposure reconcile by unit and line while group totals remain exact.
- [x] Fake-provider order creation and one tested `payment.captured` happy path that converts a
      checkout once into Order, Booking, confirmed Reservation and invoice.
- [x] Reservation-expiry/capture races atomically reacquire all required capacity or execute and
      reconcile a full refund while opening a Finance-visible financial exception.
- [x] Define provider protocols and implement Razorpay Orders/Checkout, captured-payment and
      full/partial refund adapters with explicit timeouts, retry policy, credential isolation and
      provider idempotency keys.
- [x] Add authorized HTTP endpoints for payment-attempt creation, provider webhook ingestion with
      raw-body signature verification, checkout/payment retrieval and reconciliation.
- [x] Implement monotonic payment-state reduction for authorized/captured/failed/expired/refunded
      events, duplicate/out-of-order webhooks and redirect-loss recovery.
- [x] Implement atomic reservation reacquisition after late capture or automatically execute and
      reconcile a refund; never leave only a `Refund(PROCESSING)` row.
- [x] Implement partial/full unit refund state machines, failed-refund Finance exceptions and
      idempotent provider refund commands. Customer cancellation quote/confirm remains in B8 because
      it must evaluate fulfilment state, policy and affected units before authorizing this boundary.
- [x] Implement tax calculation/reconciliation, concurrency-safe invoice and credit-note numbering,
      immutable document snapshots and authorized document retrieval.
- [ ] Complete CA/legal configuration sign-off before live collections.

**Status: BE-08 backend/API complete; live collections remain gated.** OpenAPI 1.10.0 publishes the
group-aware payment, allocation, webhook, reconciliation, refund and tax-document capability. Local
and test environments explicitly select the fake provider; production fails closed unless Razorpay
credentials, HTTPS configuration and explicit live-collections approval are present. Durable
Celery worker/beat deployment, staging provider drills and CA/legal sign-off remain release gates,
documented in `docs/runbooks/payment-reconciliation.md`.

## B8 — Booking fulfilment

- [x] Implement fulfilment state machine, history and expected-version commands per unit, plus the
      derived Customer Booking Group projection.
- [x] Implement idempotent Customer cancel, reschedule and address-change commands with the frozen
      revalidation, reacceptance, recovery and no-silent-mutation rules.
- [x] Implement En route, Arrived, Customer unavailable, lateness watchdogs and restricted
      Operations-assisted outage start.
- [x] Implement start OTP, WorkTask, WorkEvidence, scope amendment and revision payment.
- [x] Implement Abort, line-level outcomes, completion submission, Customer confirmation/dispute,
      evidence-gated timeout, partial-work refund/ledger and Partner release/recovery.
- [x] Support group-wide and unit cancellation/reschedule commands without hidden partial success;
      unaffected units retain independent truth and every financial change uses unit allocations.

**Status: B8 complete and published (OpenAPI 1.16.0, 2026-08-06).** The domain layer below is
unchanged; what changed is that it is now reachable. See `apps/fulfilment/views.py`,
`serializers.py` and `urls.py`, and `tests/fulfilment/test_fulfilment_api.py`.

`apps/fulfilment` implements the full physical-work lifecycle as domain commands: the
`ALLOWED_TRANSITIONS` state machine with an immutable `BookingStatusHistory` row per move,
`BookingGroup` -> `FulfilmentUnit` -> `Booking` lock ordering on every command, expected-version
guards, start OTP, `WorkTask`/`WorkEvidence`, scope amendment and revision payment, abort,
line-level outcomes, completion submission and Customer confirm/dispute, the evidence-gated
auto-finalize watchdog, and Partner release/recovery that rewrites the same `Booking` row rather
than creating a second one for a unit. Every refund — cancellation fee ladder, partial-work
settlement, group-wide cancellation — goes through `apps/fulfilment/refunds.py` onto the existing
`commerce.Refund` / `RefundAllocation` / `PaymentAllocation` tables. There is no second money path.

Group-wide cancellation (`cancel_booked_group`) classifies every unit before writing anything:
still-cancellable units are cancelled under **their own** fee band with their own `Refund`, units
that already finished are skipped **and named in the result**, and one mid-work unit refuses the
whole command so nothing half-lands. `BookingGroup.Status.COMPLETED` is now derived only when at
least one unit actually delivered; a group whose every visit was cancelled derives `CANCELLED`.
Contract impact is recorded in `contracts/openapi/CHANGELOG.md` 1.15.1.

A security review of the whole app ran before sign-off and found three real defects, all fixed
with a regression test each: a refund could be allocated across two `PaymentAttempt`s (one
`Refund` per attempt now); `reschedule_booking` accepted a backdated start, which would have made
the lateness watchdog permanently waive every cancellation fee (a future-time guard now); and the
work-evidence boundary checked no actor at all, so any caller could mint a signed upload URL for
any Booking and file evidence against it (`_guard_evidence_actor` plus an object-key/Booking bind
now). The evidence one mattered most — evidence is what gates automatic completion.

Verification on this run: **ruff format/check clean**, **strict MyPy clean (147 files)**,
`makemigrations --check --dry-run` reports no drift, the generated OpenAPI validates, and
`tests/fulfilment` (126) plus `tests/carts` + `tests/assignments` + `tests/commerce` (112) pass.
Every row of `01-scope-and-flow.md`'s failure-outcomes table that fulfilment owns has a test in
`tests/fulfilment/test_failure_outcomes.py` asserting unit truth, reconciled group truth and a
once-only audit row; that file's header maps the remaining rows to the apps that own them. The
group-level races are covered against real PostgreSQL in
`tests/fulfilment/test_fulfilment_concurrency.py` — real threads and connections, no mocks.

**Known boundaries, stated rather than hidden:**

- ~~**No HTTP surface.**~~ **Closed 2026-08-06 (OpenAPI 1.16.0).** All of B8 is published as one
  release across 26 paths: `/bookings/{id}/…` for the Customer, `/partner/bookings/{id}/…` for
  the Partner and `/operations/bookings/{id}/…` for Operations, each with its own projection.
  `POST /booking-groups/{group_id}/cancel/` is unchanged and remains the pre-payment command;
  the post-payment equivalents are `cancel-booked/`, `reschedule/` and `address/`.
- ~~**Step-up verification for the Operations-assisted start is not enforced anywhere yet.**~~
  **Closed 2026-08-06.** `HasRecentOperationsStepUp` had existed, and had documented itself as
  gating exactly this, since before the permission had a view to sit on.
  `OperationsAssistedStartView` is that view, and a test proves work does not start without it.
- **Reschedule inside the fee window is refused, not repriced.** A Customer inside the
  fee-bearing window cancels (paying the fee they would anyway) and books again; a full re-match
  is out of M1 scope. A late Partner waives this, like the cancellation fee.
- **An incomplete amendment task is not separately refundable.** An authorized `ScopeAmendment`'s
  revision payment shares the original catalog line's `PaymentAllocation`, so partial-work refund
  covers original scope only; Operations settles the amendment case by hand through the same
  `Refund` path. Documented on `_refund_unperformed_work`.
- B9's `OperationsCase` does not exist yet, so a dispute sets `Booking.payout_hold` and stops
  there. The Quality case the failure-outcomes table calls for is B9's work.
- ~~There is no group-wide *reschedule*.~~ **Closed 2026-08-06** — `reschedule_booked_group`
  exists and follows the same classify-then-write skeleton. See the findings section below.

**Review findings — all closed 2026-08-06 (S3).**

A code review of this work raised eight issues beyond the security ones. One was Critical and was
fixed at the time: a Partner may release *mid-job*, and adding `RECOVERY_REQUIRED` to the
Customer-cancellable statuses briefly made those Bookings fully refundable, wiping out
completed-line settlement. `customer_can_cancel` now refuses a cancel once a `WorkSession` exists.

The remaining seven are now fixed, in `tests/fulfilment/test_review_findings.py`. Every
behavioural one was verified failing against the old code before being accepted — findings 1
(both tests), 2, 4 and 6 were each run red with the original behaviour surgically restored.

1. **Fixed.** `cancel_booked_group` short-circuited on any settled group, so "cancel my finished
   bookings" returned success for a command that never ran and skipped the version guard.
   `_group_already_cancelled` now requires at least one `CANCELLED` unit before treating the call
   as a replay; a delivered group is refused with a reason that says so.
2. **Fixed.** `_settled_group_result` reported `fee_paise=0` / `refund_ids=()` on a genuine
   replay, which for a fee-bearing unit told the Customer their money was coming back in full.
   `_replayed_unit_outcome` reads the real values back from the `BookingStatusHistory` context
   and reports the unit as `CANCELLED`, so the second answer matches the first.
3. **Fixed.** `MAX_GROUP_IDEMPOTENCY_KEY_CHARS` is derived from the column width minus the
   `":{uuid}"` suffix and a retry suffix, and is asserted against
   `Refund.idempotency_key.max_length` by a test so the two cannot drift.
4. **Fixed.** `M1_RESCHEDULE_MIN_NOTICE_MINUTES` (120, mirroring the fee ladder's two-hour
   boundary) replaces the bare future-time check. It closes the exploit in both directions —
   backdating, and the forward version where a Customer in the free band drops the visit to
   twenty minutes away and manufactures a late Partner.
5. **Fixed.** The `create_partial_refunds` docstring now says what actually happens: a replay
   returns `[]` because `refundable_unit_allocations` has already subtracted the in-flight
   refunds, and a caller wanting the real ids must read the audit context.
6. **Fixed.** `_refund_one_attempt` excludes `FAILED` from its key lookup and retries under a new
   key. `FAILED` means the provider refused outright and no money moved, so the allocation is
   refundable again and handing the rejected row back reported a refund that would never pay.
   `UNDER_REVIEW` — the *ambiguous* result — is still returned as live on purpose: Finance owns
   it and a second provider call could double-refund. Both directions have a test.
7. **Fixed.** A two-attempt `create_partial_refunds` call is covered (unit paid on the checkout
   capture plus an authorized amendment's revision payment), and `_split_across`' remainder loop
   has a parametrized test asserting the shares sum exactly and never exceed an allocation.

**Group-wide reschedule now exists.** `reschedule_booked_group` moves every visit by one offset —
the Customer names a new start for the earliest visit and the rest shift with it, which preserves
the planner's sequential ordering, parallel overlap and dependency gaps. Per-unit starts were
deliberately not offered: they would let a client dissolve a server-authored grouping without any
of the planning inputs that made it legal. Same classify-then-write skeleton as
`cancel_booked_group`, so one unmovable visit refuses the whole command and nothing half-lands.

## B9 — Cases, ledger and payout

- [x] Implement typed OperationsCase with owner, severity, SLA, evidence, communication, allowed
      commands and immutable audit. `apps/cases` — nine case kinds, five owning teams routed from
      the ownership table rather than chosen by the opener, severity-derived SLA deadlines, and an
      append-only `OperationsCaseEvent` that refuses `save()` on an existing row.
- [x] Cover assignment, late/no-show, unavailable Customer, partial/abort, quality, safety, payment,
      refund and payout case types. Each has its **required terminal result** encoded in
      `ALLOWED_RESOLUTIONS`; `resolve_case` refuses anything outside it, which is what turns
      "cases may not close merely because a notification was sent" into a constraint. A test
      asserts every published kind has both a team and a resolution set.
- [x] Implement immutable Partner ledger entries/adjustments and Operations-reviewed payout batches.
      `apps/payouts` — `PartnerLedgerEntry.save()` refuses any edit outside the reservation
      lifecycle, so a correction must be a new `ADJUSTMENT`/`REVERSAL` entry. Reversals are stored
      signed, so a balance is a plain `SUM` rather than a case analysis a report could get wrong.
      Maker-checker is both a service check and a `CheckConstraint`, so a command that forgot to
      ask is still refused by PostgreSQL.
- [~] Ledger reservation, payout-account verification and account-change cooling are implemented.
      **The RazorpayX adapter and sandbox payout submission are not** — `PayoutBatchItem` carries
      its provider fields and per-item idempotency key, and the batch stops at `APPROVED`.

**Status: cases and ledger complete; provider submission open.**

The acceptance list's payout property — "two payout batches cannot reserve/pay one ledger entry
twice" — is proved twice: once through the ordinary command path, and once with real threads and
real connections against PostgreSQL. The guarantee is a partial unique index
(`payouts_one_live_reservation_per_ledger_entry`), so the losing caller gets an `IntegrityError`
rather than a silent duplicate; the service check exists only to turn that into a typed refusal.

A payout hold is released by *closing the case that holds it*, and only when no other open case
holds the same booking — two investigations can cover one visit, and closing the first must not
pay a Partner out from under the second.

Earnings settle to **delivered** scope, not booked scope: a visit where two of three tasks were
done earns two tasks' worth, pro-rata on a partial. Reading the quoted total would pay for work
that never happened, and nothing downstream would catch it because the number would look right.

## B10 — Events, messaging and observability

- [x] Implement notification intent/delivery/failure records, bounded retry and SMS/transactional
      fallback policy. `apps/notifications` — intent and delivery are separate rows, because
      "we decided to tell someone" and "a provider accepted it" are different facts and merging
      them is how a system reports a Customer was notified while the gateway was down.
      Suppression is an intent with a reason, never a missing row. `TRANSACTIONAL_PURPOSES`
      cannot be muted: a Customer who switched off promotions still learns their professional is
      at the door. Retries are bounded (3) and never in-process.
- [~] Offer, checkout, reservation, lateness and completion jobs exist in their owning apps
      (`assignments.tasks`, `fulfilment.tasks`, `commerce.tasks`, `payouts.tasks`).
      **Retention jobs remain unimplemented** — the privacy models exist and nothing sweeps them.
- [x] Implement service/area/payment/payout kill switches. `KillSwitch` is a row rather than a
      setting: an environment variable needs a deploy, and the moment you need to stop sending is
      the moment you cannot wait for a release. Each carries an audited actor and a reason, the
      reason enforced by a check constraint. Maker-checker exists for payout batches (B9) and for
      compatibility rules (B6); no other command requires it yet.
- [ ] Add metrics/alerts for conversion, assignment, lateness/no-show, partial/dispute, money
      ambiguity, case SLA, outbox and worker queues.
- [x] Create `docs/adr/**` and `docs/runbooks/**`; document every critical dependency, replay process
      and stuck state. 6 ADRs and 5 runbooks exist (partner document storage, payment
      reconciliation, outbox replay, queue outage, stuck command).

**Status: notifications and kill switches implemented (2026-08-06); metrics and alerts not
started.** Observability is still JSON logging plus request IDs — there are no metrics,
dashboards or alerts, and that is the remaining B10 item along with retention jobs and the HTTP
surface for cases, ledger, payouts and switches.

**None of B9 or B10 has an HTTP surface yet.** `apps/cases`, `apps/payouts` and
`apps/notifications` are service-layer only — the same shape B8 was in before 1.16.0, and the
same warning applies: do not read the ticked lines above as a shippable feature. Publishing them
is its own release and FE-12 depends on it.

## Backend completion gate

- [x] Ruff format/check, strict MyPy and current unit/API tests pass.
- [x] Current branch-aware coverage threshold passes: **85.42%**.
- [x] Migration model-drift check and generated OpenAPI validation pass.
- [x] Locked base dependencies currently pass `pip-audit`.
- [~] PostgreSQL is exercised by the current suite and the historical singleton cart has a
      concurrent-write regression. Replace it with multi-item cart/version, plan partition and
      partial-group-hold races; dedicated assignment/payment race suites remain missing.
- [x] Local PostgreSQL/Redis Docker health and applied developer migrations were verified on the
      current audit run.
- [ ] Real Redis, Celery worker/beat, outbox crash recovery and provider integration tests pass.
- [~] `scripts/quality.cmd` enforces Ruff, MyPy, tests, migration drift and committed OpenAPI freshness;
      frontend-client, dependency and real-infrastructure gates remain in their owning workflows.
- [ ] All local/staging migrations are applied and readiness is green before acceptance testing.
- [ ] Authorization, idempotency, failure, audit and recovery tests exist for every state-changing
      business command.
- [ ] Required ADRs, runbooks, dashboards and alerts exist before production handoff.
- [ ] A real-browser Django session/CSRF mutation test passes for Customer, Partner and Operations
      origins, including rotation, revoke, rejected origin and browser-storage/log assertions.
