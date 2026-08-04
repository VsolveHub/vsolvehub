# M1 Backend Tasks

Scope and exclusions are defined in [M1 README](./README.md). Frozen clocks, amounts and provider
choices are in [Initial configuration](./05-initial-configuration.md).

Task markers: `[x]` implemented and covered by the current automated suite · `[~]` partially
implemented, with the missing production behaviour named · `[ ]` not implemented. A model or happy
path alone never makes a business capability complete; its authorized HTTP contract, idempotency,
failure recovery, audit and concurrency behaviour must also exist.

## Audit snapshot — 2026-08-04 (full repo re-audit)

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
- **BE-07 remaining hardening is still open:** revoke/release/manual-recovery idempotency, ranking
  explainability, accept/expiry/payment-hold concurrency.
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
- [~] Assignment-attempt audit records basic eligibility inputs, but does not record ranking factors,
      exclusion reasons or the bounded privacy policy required to explain assignment decisions.
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
- [ ] Complete revoke/release/manual-recovery commands with authorization, idempotency and audit, and
      add real concurrent-accept/expiry/payment-hold tests.

**Status: BE-07 contract defects 0007–0010 are backend-verified in OpenAPI 1.13.0 (2026-08-04).**
Travel/presence/ranking, explainability and manual recovery remain additional B6 hardening before
production. Frontend G21/G22/G23/FE-09C follow-ups are Ready and not Done.

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

- [ ] Implement fulfilment state machine, history and expected-version commands per unit, plus the
      derived Customer Booking Group projection.
- [ ] Implement idempotent Customer cancel, reschedule and address-change commands with the frozen
      revalidation, reacceptance, recovery and no-silent-mutation rules.
- [ ] Implement En route, Arrived, Customer unavailable, lateness watchdogs and restricted
      Operations-assisted outage start.
- [ ] Implement start OTP, WorkTask, WorkEvidence, scope amendment and revision payment.
- [ ] Implement Abort, line-level outcomes, completion submission, Customer confirmation/dispute,
      evidence-gated timeout, partial-work refund/ledger and Partner release/recovery.
- [ ] Support group-wide and unit cancellation/reschedule commands without hidden partial success;
      unaffected units retain independent truth and every financial change uses unit allocations.

**Status: not started.**

## B9 — Cases, ledger and payout

- [ ] Implement typed OperationsCase with owner, severity, SLA, evidence, communication, allowed
      commands and immutable audit.
- [ ] Cover assignment, late/no-show, unavailable Customer, partial/abort, quality, safety, payment,
      refund and payout case types.
- [ ] Implement immutable Partner ledger entries/adjustments and Operations-reviewed payout batches.
- [ ] Implement ledger reservation, the frozen RazorpayX payout adapter, idempotent sandbox payout,
      payout-account verification and account-change cooling.

**Status: not started.**

## B10 — Events, messaging and observability

- [ ] Implement notification intent/delivery/failure records, bounded retry and SMS/transactional
      fallback policy.
- [ ] Implement offer, checkout, reservation, lateness, completion, reconciliation and retention jobs.
- [ ] Implement service/area/payment/payout kill switches and maker-checker controls where required.
- [ ] Add metrics/alerts for conversion, assignment, lateness/no-show, partial/dispute, money
      ambiguity, case SLA, outbox and worker queues.
- [ ] Create `docs/adr/**` and `docs/runbooks/**`; document every critical dependency, replay process
      and stuck state. Those required directories currently do not exist.

**Status: not started, apart from request logging and the Partner-presence reconciliation task.**

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
