# M1 Frontend Tasks

Scope and exclusions are in [M1 README](./README.md). Amounts, clocks and providers are frozen in
[Initial configuration](./05-initial-configuration.md). Customer, Partner and Operations remain
Next.js App Router applications; authenticated workspaces use client components and TanStack Query,
while public catalog/marketing routes remain server-first where practical.

Task markers: `[x]` implemented and integrated against the published contract · `[~]` UI/model code
exists but is not end-to-end integrable, with the blocker named · `[ ]` not implemented. Fixture-only
or quarantined proposal behaviour is never marked complete.

## Audit snapshot — 2026-08-04 (backend WIP review)

- Backend dirty tree reviewed against proposals 0007–0010. Frontend code was not re-run in this pass.
- **G21 / 0007:** backend removal command present in OpenAPI 1.13.0 with focused tests green → FE-08G
  removal remains Ready (regenerate + Remove UI still outstanding).
- **G24 / 0010:** backend Date exposure + `server_now` focused tests green; MyPy blocks full quality →
  FE-09C remains Ready but should regenerate only after a green backend gate if regenerating 1.13.0.
- **G22 / 0008:** still blocked for frontend infinite-query work — OpenAPI still omits `cursor` on
  booking-groups/offers; invalid-cursor contract unfinished.
- **G23 / 0009:** backend implementation + schema largely present; not Ready for FE key adoption until
  fixture/MyPy/0008 are cleared and `quality.cmd` is green. Keep current no-auto-retry mitigation.
- Prior frontend evidence below is unchanged from 2026-08-03.

## Audit snapshot — 2026-08-03

- The active workspace is `frontend/`: three Next.js 16 apps plus shared API client, query, UI,
  configuration and testing packages.
- The active workspace contains no Prisma, Supabase or `@vsolve/db` imports. The useful M1 files have
  been separated from the legacy `web/` implementation.
- The latest Claude handoff records **646 component/unit tests across 43 files** and **153 Playwright
  tests** passing, plus successful contract freshness, lint, typecheck, test, three-app build and
  composite verification. FE-09 adds 21 Customer Booking Group and 20 Partner offer browser cases;
  these use contract-shaped interception, while the existing four authentication cases use real
  Django. Intercepted dispatch tests do not replace the final authoritative-backend acceptance run.
- Customer has catalog/category/service and `/book/[service]` routes, and the booking workspace now
  contains a working OTP login/resume interrupt. Partner has marketing routes plus a reachable
  `/apply/*` onboarding tree behind the shared auth guard. Operations has a routable dashboard shell
  that exposes current backend blockers without enabling unavailable queues.
- Shared authentication UI now exists: `useOtpFlow` in `@vsolve/query` and `OtpForm` in `@vsolve/ui`,
  consumed by both the Customer booking flow and the Partner `/apply` shell. There is one OTP
  implementation, not one per app.
- Partner reference/application integration, signed KYC upload and the Operations review queue/reveal
  are complete through FE-06/FE-07.
- FE-09 now provides Customer `/bookings` list/detail recovery and the approved Partner `/offers`
  inbox with bounded, visibility-aware, failure-backed-off polling. The integration exposed proposals
  0008–0010; frontend mitigations are honest. Proposal 0010 backend half has focused evidence; 0008
  and 0009 remain incomplete for FE adoption until the backend quality gate is green.
- The generated OpenAPI TypeScript client is current with Django `1.10.0`; it was regenerated through
  the package script and remains protected by `generate:check` rather than hand edits. **Django WIP
  is at `1.13.0`**, so regeneration should wait for a green backend gate that includes 0008 if the
  FE wave intends to consume cursors and offer commands together.
- Django's `1.10.0` schema and changelog retain typed CSRF, stable session/active role, OTP metadata,
  hardened Operations authorization, Partner onboarding reference data/PATCH, private document
  transport and Operations review, multi-item Cart/Plan/Quote, Booking Group recovery and autonomous
  unit dispatch, and add group payment/refund/invoice/reconciliation APIs.
- PostgreSQL/Redis are healthy and local migrations are applied. The last committed backend gate
  passed 164 tests with 85.42% branch-aware coverage; the current dirty tree's `quality.cmd` is not
  green (see 02-backend-tasks.md 2026-08-04 audit).
- Credentialed CORS, JSON masked-CSRF, HttpOnly session cookies and rotation/revoke behavior are
  proven by backend tests and FE-05's real-browser Django flow. The `Date` response header is now
  exposed to allowed credentialed origins, so `serverClock` can calibrate from any response.
- Customer production code no longer calls proposal-only paths. FE-08G uses the generated multi-item
  contract and still shows cart-item removal as unavailable; G21 is now published in OpenAPI 1.13.0,
  so that copy is outstanding work rather than an accurate statement of the contract.
- Shared role/recovery tables use Django's lowercase `snake_case`, and the Operations workspace has
  the selected-role guard published in FE-05.

## Workspace and contract prerequisites

- [x] Keep Customer, Partner and Operations on Next.js App Router; do not add a Vite application or a
      second Operations app.
- [x] Remove legacy Prisma/Supabase/database dependencies from the active `frontend/` workspace.
- [ ] Review and checkpoint the current `web/` → `frontend/` migration before feature-route work so
      the repository move and new product behaviour are separate changes.
- [x] Update `AGENTS.md`, architecture diagrams and commands that still declare `web/apps/**` and
      `web/packages/**`. Ownership rules now name the active `frontend/**` workspace.
- [x] Add `frontend/.env.example`/README documentation for public API URL, server API URL and per-app
      site URL; retain localhost defaults only for development.
- [x] Backend OpenAPI 1.10.0, changelog and generated-schema drift gate are published, and the
      frontend schema is regenerated from 1.10.0. `generate:check` continues to gate typecheck.

## Backend gaps that bound frontend work

BE-06G through BE-08 now publish the multi-item planning, autonomous dispatch and group-aware
payment surfaces. BE-09/BE-10 and contract gaps G21–G24 below bound the remaining frontend work.

### G1 — Commerce HTTP surface is published

OpenAPI 1.10.0 publishes Customer payment-attempt creation/recovery, checkout payment lookup,
Customer-owned Order/refund/tax-document reads, raw signed provider webhooks and Finance refund/
reconciliation commands. FE-10 can integrate payment, ambiguity recovery and financial-document
reads without inventing provider or money state. Post-booking fulfilment/cancellation remains BE-09.

### G2 — Plan-unit windows are published in OpenAPI 1.7.0

OpenAPI 1.7.0 returns one server-authored window per Plan Unit inside immutable alternatives,
including coordinated-parallel and separate-visit structures. FE-08G displays those values and must
not compose, shift or sign group windows locally.

### G3 — Selected-plan group/unit quote is published in OpenAPI 1.7.0

OpenAPI 1.7.0 publishes selected-plan quotes containing immutable units, lines, fee allocations,
visit/professional counts, expiry and cancellation snapshots. FE-08G renders the generated Money and
must not infer grouping or sum money/time from the deprecated shape.

### G4 — Booking Group and payment recovery are published

OpenAPI 1.9.0 publishes bounded Customer Booking Group list/detail, server time, next transition,
unit deadlines, explicit recovery action and versioned/idempotent pre-booking cancellation. FE-09
uses those projections for refresh/offline recovery. OpenAPI 1.10.0 adds payment-attempt and
checkout-payment recovery for FE-10.

### G5 — Pre-payment group terminal states are published

OpenAPI 1.9.0 distinguishes group `REPLAN_REQUIRED`, `CANCELLED`, `EXPIRED` and `FAILED`, with unit
failure/cancellation and safe recovery actions. OpenAPI 1.10.0 adds monotonic payment/refund states;
post-booking fulfilment/cancellation terminal semantics remain BE-09.

### G6 — Dispatch is browser-independent

Group checkout emits a transactional outbox event; Celery/beat owns offer, undo, group-search and
payment-hold deadlines plus compensation. The legacy singleton advance path remains migration-only.
FE-09 polling observes the 1.9 projections and never invokes progression.

### G7 — Customer and Partner projections are separated

Customer Booking Group responses contain no Partner identity. The bounded Partner inbox exposes only
one assigned unit's lines/scope, approximate area, timing, requirements and snapshotted gross,
commission and net; it cannot expose sibling units or Customer address/contact.

### G8 — Public A1 catalog/pricing contract is published

OpenAPI 1.6.0 exposes only bookable A1 variants with fulfilment archetype, current task lines,
minimum-service subtotal and payable starting price. Legacy duration-picker metadata is absent from
the public response. FE-08S/FE-08G can reuse that catalog projection.

### G9 — Operations Partner application discovery is integrated

OpenAPI 1.5.0 publishes a bounded cursor-paginated queue, masked detail, status/assignment filters,
optimistic claim ownership and audited assigned-reviewer reveal. FE-07 uses the generated contract
and drops signed review URLs immediately after each explicit reveal.

### G10 — Private Partner document transport is integrated

OpenAPI 1.5.0 publishes a server-owned upload intent, short-lived direct/TUS upload grant and
upload-ID finalization. Django streams the object and verifies size/type/SHA-256; documents remain
fail-closed until clean scanning. FE-07 calculates SHA-256 locally, shows progress/retry/expiry,
finalizes by upload ID and never persists signed tokens, URLs or KYC bytes.

### G11 — Partner offer delivery projection is published

OpenAPI 1.9.0 publishes cursor-bounded unit-scoped Partner offers. Short polling may pause/back off
and resume from server truth; Celery progresses every deadline independently of the browser.

### G12 — Partner offer is published; job and Operations timelines remain

Partner offers now include the assigned unit's scope, approximate area, timing, occupied estimate,
requirements and snapshotted estimated gross/commission/net. Customer payment/refund/document reads
are available to FE-10; Partner jobs, ledger/payout and Operations case timelines wait for BE-09/BE-10.

### G13 — Service-area and canonical-skill contracts are integrated

OpenAPI 1.5.0 publishes authenticated `GET /service-areas/` and `GET /partner/skills/`. Only active,
Partner-accepting areas and active skills are returned; capacity and ranking inputs stay private.
FE-06 replaced the unavailable area boundary and catalog-derived skill waterfall with generated
types, hierarchical TanStack Query keys and parallel reference reads. Proposal 0005 §§1/4.

### G14 — Current required Partner consent documents are integrated

OpenAPI 1.5.0 publishes `GET /partner/required-consents/` with purpose, title, current document
version, HTTPS legal URL and publication time. Receipts are linked to the canonical legal record and
submission fails closed after a version supersession until the new document is accepted. FE-06
renders and submits these generated values without retaining local versions. Proposal 0005 §2.

### G15 — Partner application PATCH is genuinely partial and integrated

OpenAPI 1.5.0 preserves every omitted application field, applies supplied sets atomically under
`expected_version`, validates the resulting draft and returns the complete projection. Initial draft
creation omits `expected_version`; every later save carries the latest returned version. FE-06 sends
only changed fields and no longer needs full-record draft compensation. Proposal 0005 §3.

### G16 — Backend error/session contract is integrated

FE-02/FE-05 integrate customer-safe messages, lowercase `snake_case`, OTP throttle wait and the
anonymous-safe active-role session projection through the generated client.

### G17 — Backend CORS/CSRF and real-browser integration are proven

Django emits credentialed CORS only for explicit origins and `/auth/csrf/` returns the masked token in
typed JSON while the cookie remains HttpOnly/Secure. FE-05 proves login, mutation, rotation, revoke and
browser-storage boundaries against real Django.

### G18 — Proposal-only Customer runtime calls are removed

FE-01's contract-pending boundary prevents production requests to unpublished paths. Proposal
types/fixtures remain test/design inputs only; OpenAPI 1.7.0 now publishes the replacement paths.

### G19 — Role casing and Operations route security are integrated

Django's lowercase codes, shared recovery tables and selected-role Operations guard are integrated and
covered by FE-02/FE-05.

### G20 — OpenAPI 1.10.0 is generated and integrated

The generated frontend client is current with Django 1.10.0. FE-08G uses its multi-item
Cart/Plan/Quote operations; FE-09 and FE-10 must continue using generated group-dispatch and payment
types without local additive projections.

### G21 — Cart-item removal is published; the frontend half is Ready, not Done

**Backend implementation present in OpenAPI 1.13.0 with focused tests green; full backend quality
gate not yet green on the dirty tree. Frontend work has not started.**

`DELETE /api/v1/cart/items/{item_id}/` was published without a request body, while Django required
`expected_cart_version` and `expected_item_version`. The generator drops DELETE bodies regardless of
annotation, so the backend published the typed sibling proposal 0007 offered:

- `POST /api/v1/cart/items/{item_id}/remove/` → `cart_items_remove`, required
  `CartItemRemoveRequest` body of both integers, `200` returning the complete `Cart`, and the same
  `cookieAuth`-or-anonymous security as the rest of the Cart surface.
- No `Idempotency-Key`. The version pair is the replay protection.
- `409 cart_version_conflict` carries `details.conflicting_field`
  (`expected_cart_version` | `expected_item_version`); both recover by refetching, so keying on the
  code alone stays correct.
- `409 cart_item_not_found` for removed, unknown and other-Customer ids alike. Show it as "That
  service is no longer in your booking", refetch, and do not style it as an error — the outcome the
  customer wanted has happened.
- DELETE still works for hand-written callers but is still undescribed. Generated clients use POST.

Outstanding frontend work: regenerate at 1.13.0, render the Remove control, apply the returned
`Cart` with a targeted `setQueryData` and invalidate only plan sets and quotes, then add the
two-service browser acceptance (remove the first, assert the second's `id`, `version`, `quantity`
and `scope` are unchanged and the version note shows the returned version) and the stale-version
conflict-copy-plus-refetch case. Raw `fetch`, a local DTO and unsafe casts remain forbidden — none
is needed now.

### G22 — Booking Group and Partner offer pagination parameters are not published

Both list endpoints return cursor-paginated envelopes and accept `cursor` at runtime. Backend WIP
adds traversal tests that pass, but OpenAPI **1.13.0 still omits** the typed `cursor` query parameter
on `/booking-groups/` and `/partner/offers/`, and mangled cursors still surface as `not_found` /
`internal_error` rather than `cursor_invalid`. Proposal 0008 remains Partial. FE-09 must keep
page-one + truncation notice until publication.

### G23 — Partner offer commands — backend Partial; FE adoption not Ready

Backend WIP implements required `Idempotency-Key`, closed `OfferActionEnum`, reachable 400/403/404/409
responses and `offer_reservation_conflict`, and those shapes are present in OpenAPI 1.13.0. Focused
suite is almost green (one fixture bug). Full quality is not green. FE-09 must keep disable /
no-auto-retry / re-read mitigations until a green backend gate; then regenerate and adopt one stable
key per logical action with a lost-Accept replay browser proof.

### G24 — Cross-origin browser responses hide the server `Date` header — **backend focused evidence green**

`Date` is not CORS-safelisted, and Django previously exposed no response headers, so `serverClock`
could not calibrate from ordinary API responses in a browser. FE-09 mitigated this by calibrating
from payload `server_now` where present, which fixed Customer Booking Group countdowns but left
Partner offer expiry and the 120-second undo window on the device clock.

The backend exposes `Date` in `Access-Control-Expose-Headers`, production fails closed without it,
and `Offer` / offer page publish `server_now`. Focused `live_server` tests pass. Full `quality.cmd`
is still blocked by an unrelated MyPy issue on the dirty tree.

**FE-09C is Ready once regenerating against a green backend contract.** Regenerate, remove the mocked
`Date`-header dependency from offer countdown tests, and prove in Playwright — with the page `Date`
overridden an hour fast — that a Partner offer expiring in two minutes still reads about two minutes.

## F1 — Shared foundation and authentication

- [x] Generated-client package, request/error wrapper, idempotency-key helper and server-clock utility
      are integrated and gated by `generate:check`.
- [x] TanStack Query provider, cache keys, retry/error presentation, mounted cross-tab session sync
      and freshness policies.
- [~] Shared `serverClock` calibrates from exposed `Date` headers and, after FE-09, any generated
      response body carrying `server_now`. The backend now exposes `Date` cross-origin and publishes
      `Offer.server_now` (1.11.0), so both sources are available to every session. Remaining work is
      FE-09C: regenerate at 1.11.0 and prove calibration in a real browser with a skewed device clock.
- [x] Accessible shared primitives, brand tokens, locale-aware money/readout helpers, error/loading
      boundaries and MSW contract fixtures.
- [x] Generated OpenAPI is current with backend 1.10.0 and protected by the package freshness check;
      the generated schema was never hand-edited.
- [x] Build reusable Django OTP request/verify, CSRF bootstrap, current-session, logout and
      session-list/revoke flows. `useOtpFlow` (@vsolve/query) owns the phase machine, both
      server-authored countdowns, per-number cooldown and cross-tab logout; `OtpForm` (@vsolve/ui) is
      the presentational half. Both are consumed by Customer booking and Partner `/apply`. The
      placeholder `partner/app/(auth)/actions.ts` is deleted.
- [x] Normalize shared role and recovery tables to backend lowercase `snake_case`, with safe fallback
      handling for unknown future codes (G19).
- [x] Integrate active-role switching and authenticated Customer, Partner and Operations route shells
      with selected-role guards, honest recovery and cross-tab logout handling.
- [x] Keep authenticated/personalized routes dynamic and uncached; keep public marketing/catalog
      server-first with explicit revalidation and Suspense boundaries.
- [x] Add Playwright E2E setup for the three apps, using Django test fixtures or contract mocks only
      where the acceptance case explicitly tests a frontend boundary. Current suite runs against
      production `next start` servers and avoids backend-backed booking acceptance until fixtures and
      generated client freshness are ready.

**Status: foundation implemented against OpenAPI 1.10.0.** Authentication, role, query,
accessibility and real-browser session foundations are reusable. G24's backend half is published in
1.11.0; the FE-09C regeneration and skewed-clock browser proof close it.

## F2 — Customer discovery and booking

- [x] Build real category, service-list and service-detail pages from published catalog endpoints.
- [x] Render server-authored starting price, task definitions and minimum-visit policy without
      hardcoded arithmetic. BE-06G preserves these generated catalog fields.
- [~] Build a real `/cart` Customer surface with multiple independently scoped items, add/edit/remove,
      cart version, bounded limit copy and per-item validation. Add/edit and append semantics are
      implemented; removal is still unbuilt, but it is now Ready — `cart_items_remove` is published
      in OpenAPI 1.13.0 and G21 is no longer a block.
- [x] Integrate login/cart merge as a server-authored result: preserve non-duplicates, present exact
      duplicate/incompatible decisions, refetch the winning cart version and never merge in local
      storage.
- [x] Refactor the booking reducer from one selected service into cart → address → plan alternatives →
      selected group quote → matching/payment. Session storage may retain only safe navigation intent
      and opaque references; Django remains cart/plan truth. Hydration restores intent only after
      mount and cannot overwrite stored intent during the initial commit.
- [x] Keep the proven OTP login/resume and address create/select/edit components, but make resume
      restore the current server Cart and invalidate a stale locally selected plan.
- [x] Integrate BE-06G plan alternatives through generated types and TanStack Query. Show which
      services run together, in coordinated parallel or in separate visits, with professional count,
      unit windows, duration, complete unit/group totals and server-authored separation reasons.
- [x] Provide an accessible comparison/confirmation experience for the recommended plan and bounded
      alternatives. Changing address, item scope, quantity or preference mutates Cart and discards the
      selected plan explicitly.
- [x] Render the immutable selected-plan quote: minimum per unit, group fee, tax, cancellation bands,
      expiry/server time and allocation-aware totals. Never sum or regroup lines in frontend business
      logic.
- [x] Show group matching progress per Fulfilment Unit without exposing unaccepted Partner identity.
      `PARTIALLY_HELD` is pending, never partial success; `REPLAN_REQUIRED` shows released holds and
      requires a new Customer confirmation.
- [x] Integrate the published finding/recovery projections using bounded TanStack Query polling that
      pauses/backs off and observes server-owned group/unit dispatch without invoking progression.
- [x] Build `/bookings` list and `/bookings/[groupId]` detail with App Router loading/error
      boundaries, server-published `recovery_action` and versioned, stable-key cancellation
      confirmation. A changed group version mints a new logical-command key.
- [~] Extend `/bookings` beyond page one after G22 publishes its cursor. Until then, non-null `next`
      renders honest truncation copy rather than implying the history is complete.
- [x] Remove raw runtime calls to every proposal-only booking path (G18). The production route keeps
      an explicit unavailable boundary until FE-08G replaces the singleton generated integration.
- [x] Wire stable-idempotency group confirmation plus stale cart/plan/quote, expired quote,
      withdrawn plan, duplicate confirmation and in-flight idempotency recovery. FE-09 now renders
      server-published group recovery/cancellation actions without deriving them from status.
- [ ] Build payment attempt, provider redirect/SDK boundary, ambiguous-result reconciliation,
      group reservation-expiry restart and unit-allocated receipt in FE-10 against OpenAPI 1.10.0.
- [x] Add `/cart` loading/error route boundaries and browser coverage for anonymous login interrupt,
      explicit merge, sequential/parallel/separate/mixed plans, stale plan/cart/quote, per-item
      failures, duplicate confirmation, keyboard dialog behavior and responsive/accessibility cases.
- [ ] Add real-Django cart/plan/quote/confirmation acceptance plus FE-09 offline/reconnect and
      one-unit matching failure, and FE-10 redirect-loss/duplicate-payment browser acceptance.

**Status: FE-08G is integrated except item removal (G21), which is now Ready rather than blocked —
the command is published in OpenAPI 1.13.0 and no frontend integration exists yet. FE-09 Customer
group recovery is complete.** Generated queries, App Router boundaries, hydration, accessibility and
contract-shaped browser gates pass. FE-10 is ready against OpenAPI 1.10.0; authoritative
Django-backed booking/dispatch acceptance remains a milestone gate rather than being implied by
intercepted E2E payloads.

## F3 — Customer active booking

- [ ] Show a Booking Group summary plus authoritative status, Partner, appointment and text ETA per
      Fulfilment Unit; no map.
- [ ] Provide group-wide and unit cancel/reschedule/address-change/support commands only when allowed
      by backend state, with the resulting impact on other units shown before confirmation.
- [ ] Show delay and fee-free recovery when the server declares an SLA breach.
- [ ] Display arrival and start OTP securely.
- [ ] Display and approve/decline scope amendments and collect revision payment.
- [ ] Show completion submission with Confirm and Report a problem.
- [ ] Show unit-level partial/refund/dispute states, derived group status and allocated invoice/credit
      note lines without making unaffected units appear failed.
- [ ] Cover reload, multi-tab, stale-version, partial-unit failure, group recovery and accessibility
      flows with E2E tests.

**Status: not started and blocked by BE-09 fulfilment/cancellation contracts.** BE-08 financial read
projections are published, but they do not authorize the frontend to invent post-booking commands.

## F4 — Partner onboarding, schedule and presence

- [x] Application readiness/status model, optimistic-version query/mutation hooks, precise
      Changes Required messaging, explicit weekly availability editor and tests.
- [x] Build mobile-first `/apply/*` routes for OTP, draft profile, skills/services/areas, consent,
      documents, schedule, submit and review status. All seven routes are reachable, `force-dynamic`
      and `noindex`, behind one shared auth gate.
- [x] Profile/skills/services/areas steps use canonical reference queries and focused partial
      optimistic-version mutations.
- [x] Consent renders current server-authored legal documents/purpose/version and refetches truth.
- [x] Integrate the shared OTP/session/role flow; the Partner marketing route reaches real `/apply`.
- [x] Implement private signed document upload/finalize with progress, checksum, expiry/retry and
      scan-pending/rejected/replacement states.
- [x] Integrate online/heartbeat/offline presence with clear permission/location-denied states,
      coarse-location disclosure and background-tab/offline behaviour.
- [ ] Add onboarding/schedule/presence E2E tests for version conflict, rejected replacement document,
      suspended/offboarded access, overlap, offline and reconnect.

**Status: FE-06/FE-07 implementation is complete.** Full onboarding/schedule/presence browser
acceptance and the production scanner/retention release decisions remain completion gates.

## F5 — Partner offer and work

- [x] Build an offer inbox/delivery connection against G11's published bounded polling projection.
      Empty inboxes keep polling; terminal-only pages stop; hidden tabs pause; failures back off and
      recovery resumes from server truth. Browser code never calls `/search/advance/`.
- [x] Offer card shows only the assigned Fulfilment Unit's server-authored service lines, approximate
      area, timing, occupied estimate, requirements and net breakdown from G12/BE-07 generated types.
- [~] Extend `/offers` beyond page one after G22 publishes its cursor. Until then, non-null `next`
      renders honest truncation copy and no raw URL is fetched.
- [x] Build explicit Accept/Decline, confirmation sheet, 120-second no-fault Undo and Commit-now UI.
      Controls remain disabled for the full in-flight window; ambiguous outcomes re-read the inbox
      and are labelled unconfirmed rather than guessed as a loss.
- [~] Add stable-key replay and typed refusal/race handling after G23 publishes idempotent offer
      commands. Until then, mutations never auto-retry and never mint a new key after ambiguity.
- [~] Drive offer-expiry and undo countdowns from calibrated server time. The hook is implemented and
      the backend now supplies both calibration sources (1.11.0 exposes `Date` cross-origin and adds
      `Offer.server_now`). FE-09C must regenerate the client and prove a skewed-device countdown in a
      real browser before this is complete.
- [x] Hide exact address/contact until the server disclosure projection permits it; FE-09 renders
      only the unit-scoped fields carried by the generated Offer projection.
- [ ] Build release with reason; no threat or opaque score.
- [ ] Build En route, Arrived, Customer unavailable, start OTP and contact/support.
- [ ] Persist tasks/evidence/upload status and scope amendment.
- [ ] Build Abort and line-level completion outcome.
- [ ] Show pending/available/paid ledger states and payout account/status without unsupported
      on-demand withdrawal.
- [x] Prove the Partner offer UI cannot query or render a sibling unit, Partner identity, scope or
      earnings from the same Booking Group.

**Status: FE-09 frontend implementation complete; FE-09C is the next ready frontend task.** Customer
group recovery and the Partner offer inbox pass unit/component and contract-shaped Playwright gates.
G22 still limits both lists to page one and G23 still prevents safe command replay. G24's backend
half is published in 1.11.0, so FE-09C — regenerate the client, drop the mocked `Date` dependency and
prove a skewed-device countdown — is now unblocked and outstanding. Partner fulfilment work, ledger
and payout remain blocked by BE-09/BE-10.

## F6 — Operations

- [x] Active `frontend/apps/admin` is free of Prisma/Supabase and has the shared API/query foundation.
- [x] Partner-review decision model and transition/document-review mutation hooks exist and are tested.
- [x] Build Operations OTP/session/selected-role guard and a dynamic routable dashboard shell.
- [x] Build Partner application queue/detail, claim ownership, masked-document reveal/review and
      conflict recovery against OpenAPI 1.5.0.
- [ ] Build catalog/rate/pricing/area management after the B3 Operations contract is published.
- [ ] Build assisted multi-item cart, plan confirmation/payment link and manual unit offer/recovery
      through ordinary APIs; Operations cannot invent grouping or force Partner acceptance.
- [ ] Build case list/detail with owner, SLA, evidence, communication and allowed commands after B9.
- [ ] Build Booking Group dependency view plus unit offer/reservation/payment/refund/ledger/payout
      timelines after BE-09/BE-10 publish the remaining fulfilment, case and ledger projections.
- [ ] Build kill switches, maker-checker and audit references after B10.
- [ ] Mask KYC, bank, exact address and sensitive evidence by default and audit every reveal.

**Status: authenticated Partner-review capability complete; broader Operations product remains.**
Catalog, Booking Group recovery, finance, cases, kill switches and maker-checker depend on later
backend contracts.

## Recommended execution boundary while backend follow-ups are built

1. Remove proposal-only runtime requests, normalize role/error codes and complete independent
   configuration, accessibility and responsive-shell fixes.
2. Backend publishes credentialed CORS, typed CSRF/session/active-role contracts and a fresh generated
   client; then prove login and one mutation in every app against real Django.
3. Integrate Partner application/presence/discovery and Operations review only as each generated
   contract slice lands.
4. OpenAPI 1.10.0 and its generated client publish BE-06G/BE-07/BE-08. FE-09 is implemented. G24's
   backend half is now published in 1.11.0, so regenerate the client and close FE-09C first; G21–G23
   follow as their proposals land, while FE-10 Customer payment integration proceeds on its
   independent published surface.
5. Keep polling bounded and observational; Celery owns offer/search deadlines and state transitions.
6. Do not build F3, Partner jobs or money/ledger Operations screens against guessed DTOs.

## Open product/architecture decisions

1. **Superseded:** singleton replacement is not the product flow. A different service appends a new
   CartItem; versioned merge/edit conflict applies only to concurrent or exact-duplicate intent.
2. **Resolved for M1:** use bounded short polling with reconnect/freshness semantics; polling observes
   state while Celery owns all deadlines and transitions.
3. Decide whether pilot recruitment requires Telugu or Hindi; the message-key seam exists, but no
   additional locale is approved.
4. Define the server-owned Today free-cancellation grace, if any. Frontend must only render published
   cancellation bands.
5. **Resolved:** `frontend/` is the physical workspace; remaining stale `web/` references are cleanup
   tasks, not an architecture choice.
6. **Resolved:** Booking Groups use `ALL_OR_NOTHING` confirmation in M1; no frontend fallback may
   silently accept a subset of units.

## Frontend completion gate

- [x] The latest Claude handoff records passing contract freshness, lint, typecheck, unit/component,
      build, E2E and composite gates: **646 component/unit tests across 43 files** and **153
      Playwright tests**.
- [~] Generated client is current with versioned OpenAPI 1.10.0. Django published 1.11.0, so
      `generate:check` now fails until FE-09C regenerates it.
- [x] Real-browser Django credential, CSRF refresh and authenticated mutation tests pass for Customer,
      Partner and Operations.
- [x] No production module imports proposal/`contract-pending` DTOs or calls unpublished paths;
      G21 is an absent control, G22 is honest page-one truncation and G23 uses no automatic retry or
      invented success state rather than unsafe runtime workarounds. G21's absent control is now a
      gap to close rather than a mitigation to keep: 1.13.0 publishes `cart_items_remove`, so the
      Remove control must be built against the generated client.
- [ ] Browser E2E covers every routable M1 acceptance flow against authoritative backend state.
- [~] `/cart` keyboard/focus-dialog behavior, landmarks, live announcements, 200% zoom, reduced
      motion and responsive checks pass; complete the same gate for FE-09–FE-12 routes.
- [~] `/cart` plus the existing public matrix pass at 375/768/1024/1440; repeat for remaining
      authenticated Partner, Customer booking and Operations routes.
- [~] FE-08G covers held responses, unreadable cart, stale versions, expired/withdrawn server state
      and duplicate confirmation. FE-09 covers empty-inbox arrival, polling pause/backoff/recovery and
      ambiguous offer commands. Redirect loss, upload failure and remaining permission-denial flows
      stay with FE-10 and onboarding acceptance. G24's backend half is published in 1.11.0; FE-09C
      must still prove a skewed-device Partner countdown in a real browser.
- [x] No UI claims payment, assignment, arrival, start, completion or refund before backend truth.
- [ ] Browser console is clean and production bundle/per-route budgets pass.
- [x] No frontend route handler, Server Action or package implements Django-owned business logic or
      connects directly to PostgreSQL.
