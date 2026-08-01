# M1 Frontend Tasks

Scope and exclusions are in [M1 README](./README.md). Amounts, clocks and providers are frozen in
[Initial configuration](./05-initial-configuration.md). Customer, Partner and Operations remain
Next.js App Router applications; authenticated workspaces use client components and TanStack Query,
while public catalog/marketing routes remain server-first where practical.

Task markers: `[x]` implemented and integrated against the published contract · `[~]` UI/model code
exists but is not end-to-end integrable, with the blocker named · `[ ]` not implemented. Fixture-only
or quarantined proposal behaviour is never marked complete.

## Audit snapshot — 2026-08-02

- The active workspace is `frontend/`: three Next.js 16 apps plus shared API client, query, UI,
  configuration and testing packages.
- The active workspace contains no Prisma, Supabase or `@vsolve/db` imports. The useful M1 files have
  been separated from the legacy `web/` implementation.
- Frontend lint, all eight TypeScript workspaces and **381 component/unit tests across 25 files**
  pass. All three apps build successfully, and the production Playwright smoke suite has **5 browser
  tests** covering Customer, Partner and Operations route boundaries/shells.
- Customer has catalog/category/service and `/book/[service]` routes, and the booking workspace now
  contains a working OTP login/resume interrupt. Partner has marketing routes plus a reachable
  `/apply/*` onboarding tree behind the shared auth guard. Operations has a routable dashboard shell
  that exposes current backend blockers without enabling unavailable queues.
- Shared authentication UI now exists: `useOtpFlow` in `@vsolve/query` and `OtpForm` in `@vsolve/ui`,
  consumed by both the Customer booking flow and the Partner `/apply` shell. There is one OTP
  implementation, not one per app.
- Contract gaps found while building that UI are recorded in `contracts/proposals/0004-*` and
  `0005-*`, and summarised as G13-G16 below.
- The OpenAPI TypeScript file is generated from `1.4.0`. Django has now published OpenAPI `1.5.0`;
  regenerate only through the package script and keep `generate:check` in the frontend quality lane.
- Django's `1.5.0` schema and changelog publish typed CSRF, stable session/active role, OTP metadata,
  hardened Operations authorization, Partner onboarding reference data/PATCH, private document
  transport and the Operations Partner-review read path. B5/B6 completion still requires later
  contract slices.
- PostgreSQL/Redis are healthy and local migrations are applied. Backend quality passes with
  88 tests and 85.88% branch-aware coverage.
- Django now publishes credentialed CORS and a JSON masked-CSRF bootstrap while retaining HttpOnly
  cookies. Middleware tests pass; FE-05 must provide real-browser login/mutation/rotation/revoke proof.
- Customer production code currently calls proposal-only windows/quote/checkout paths through raw
  `fetch`. This must be removed before further booking integration; proposals and local DTOs are test
  and design inputs, never runtime contracts.
- Frontend role/recovery fixtures use uppercase codes while Django publishes lowercase `snake_case`.
  Operations remains an anonymous static blocker dashboard, not an authenticated workspace.

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
- [~] Backend OpenAPI 1.5.0, changelog and generated-schema drift gate are published. The frontend
      owner must regenerate `frontend/packages/api-client/src/generated/schema.d.ts` and enforce
      `generate:check` in the frontend quality/CI lane.

## Backend gaps that bound frontend work

The backend audit no longer treats B1–B7 as complete. B1–B6 are partial, B7 is an initial domain
skeleton, and B8–B10 are unstarted. These are the concrete frontend blockers.

### G1 — Commerce has no HTTP surface

`backend/apps/commerce/` has models/services and one captured-payment happy-path test, but no
serializers, views or URLs. Payment initiation, webhook recovery, booking read, refund and tax
document retrieval cannot be integrated. This blocks F2 payment/confirmation and all of F3.

### G2 — No server-authored arrival-window endpoint

The backend accepts a client-composed `requested_start`; it does not publish opaque Today/Scheduled
windows. The window UI must remain behind `contract-pending/` until the server publishes and
revalidates window IDs.

### G3 — Quote response is incomplete

The quote contains task subtotal, minimum adjustment, platform fee, total and derived duration, but
no tax line, cancellation bands/condition text, explicit expiry or server clock. The review screen
must not invent these monetary or policy values.

### G4 — Checkout is create-only and cannot recover

There is no customer `GET /checkouts/{id}/`, cancel command or payment command. The response lacks
search/payment/undo/reservation deadlines, safe Partner disclosure and no-Partner alternatives.
Refresh, redirect loss and ambiguous requests therefore have no authoritative recovery source.

### G5 — Checkout terminal states are incomplete

Backend code/schema now includes `COMPLETED`, but there is still no `FAILED` or `CANCELLED`. Search
exhaustion is represented as `EXPIRED`; free cancellation and failure recovery need explicit domain
semantics before frontend labels are finalized.

### G6 — Browser activity currently drives dispatch

Customer-callable `POST /checkouts/{id}/search/advance/` expires offers and advances candidates.
Dispatch, offer expiry, undo expiry and payment-hold expiry must run in Celery/beat. Frontend polling
may observe state; it must never be the mechanism that changes it.

### G7 — Customer and Partner projections are coupled

Search commands return the Partner-side `Offer` serializer. Publish a customer-safe checkout/search
projection separately so future Partner fields cannot become an accidental disclosure.

### G8 — Public A1 catalog/pricing contract still drifts

`TaskRate`, A1 configuration and minimum-price policy exist internally, but public catalog responses
still expose legacy duration-picker fields and omit A1 task definitions, minimum visit policy and
the booking archetype. The frontend cannot truthfully render task lines or the minimum-visit notice
from catalog data yet.

### G9 — Operations Partner application discovery is published; integration remains

OpenAPI 1.5.0 publishes a bounded cursor-paginated queue, masked detail, status/assignment filters,
optimistic claim ownership and audited assigned-reviewer reveal. FE-07 must use the generated
contract and must not retain signed review URLs.

### G10 — Private Partner document transport is published; integration remains

OpenAPI 1.5.0 publishes a server-owned upload intent, short-lived direct/TUS upload grant and
upload-ID finalization. Django streams the object and verifies size/type/SHA-256; documents remain
fail-closed until clean scanning. FE-07 must calculate SHA-256 locally, show progress/retry/expiry,
finalize by upload ID and never persist signed tokens, URLs or KYC bytes.

### G11 — Partner offer delivery projection is not published

M1 uses bounded short polling of a replayable Partner inbox projection, with reconnect/freshness
semantics and no assumption that a browser tab stays open. The current API has only a thin list
endpoint and browser-driven progression, so the approved delivery contract is not yet integrable.

### G12 — Partner offer/job and Operations payloads are too thin

Partner offers omit scope, approximate area, timing, occupied estimate, requirements and net
earnings. There are no Partner job, ledger or payout APIs, and no Operations booking/payment/refund
timeline. F5 and most of F6 must wait for B8–B10 contracts.

### G13 — Service-area and canonical-skill contracts are published; integration remains

OpenAPI 1.5.0 publishes authenticated `GET /service-areas/` and `GET /partner/skills/`. Only active,
Partner-accepting areas and active skills are returned; capacity and ranking inputs stay private.
FE-06 must replace the unavailable area boundary and catalog-derived skill waterfall with generated
types and hierarchical TanStack Query keys. Proposal 0005 §§1/4.

### G14 — Current required Partner consent documents are published; integration remains

OpenAPI 1.5.0 publishes `GET /partner/required-consents/` with purpose, title, current document
version, HTTPS legal URL and publication time. Receipts are linked to the canonical legal record and
submission fails closed after a version supersession until the new document is accepted. FE-06 must
render and submit these generated values; it must not retain local versions. Proposal 0005 §2.

### G15 — Partner application PATCH is genuinely partial; integration remains

OpenAPI 1.5.0 preserves every omitted application field, applies supplied sets atomically under
`expected_version`, validates the resulting draft and returns the complete projection. Initial draft
creation omits `expected_version`; every later save carries the latest returned version. FE-06 can
remove full-record draft compensation after regenerating the client. Proposal 0005 §3.

### G16 — Backend error/session contract is published; frontend integration remains

OpenAPI 1.5.0 publishes customer-safe fallback messages, lowercase `snake_case` codes, machine-readable
OTP throttle wait and an anonymous-safe session projection with active role and expiry. The stale
frontend client/recovery tables still need FE-02/FE-05 integration before the applications benefit.

### G17 — Backend CORS/CSRF is published; real-browser frontend integration remains

Django now emits credentialed CORS only for explicit origins and `/auth/csrf/` returns the masked token
in typed JSON while the cookie remains HttpOnly/Secure in production. FE-05 must keep that token only
in memory, refresh after login or `csrf_failed`, and prove the complete flow against real Django.

### G18 — Proposal-only DTOs have crossed into Customer runtime code

`features/booking/queries.ts` raw-fetches unpublished windows, quote and checkout-session paths, and
the live workspace calls the windows query. The adapter boundary limits type spread but does not make
an unpublished endpoint safe. Remove runtime calls now; retain proposal types/fixtures only for
component/adapter tests until generated paths replace them.

### G19 — Role casing and Operations route security are incomplete

Django role/error codes are lowercase `snake_case`; shared frontend auth/error tables use uppercase
fixtures, so a future Operations guard would deny a valid session. The Operations root is also static
and anonymous. Normalize codes now, then make Operations dynamic and guarded after the stable
session/active-role contract publishes.

## F1 — Shared foundation and authentication

- [~] Generated-client package, request/error wrapper, idempotency-key helper and server-clock utility
      exist. OpenAPI 1.5.0 resolves the backend cookie/CSRF contract; FE-05 integration remains.
- [x] TanStack Query provider, cache keys, retry/error presentation, mounted cross-tab session sync
      and freshness policies.
- [x] Accessible shared primitives, brand tokens, locale-aware money/readout helpers, error/loading
      boundaries and MSW contract fixtures.
- [~] Generated OpenAPI client exists but is stale. Regenerate only after the backend publishes the
      correctly versioned contract.
- [~] Build reusable Django OTP request/verify, CSRF bootstrap, current-session, logout and
      session-list/revoke flows. `useOtpFlow` (@vsolve/query) owns the phase machine, both
      server-authored countdowns, per-number cooldown and cross-tab logout; `OtpForm` (@vsolve/ui) is
      the presentational half. Both are consumed by Customer booking and Partner `/apply`. The
      placeholder `partner/app/(auth)/actions.ts` is deleted.
- [ ] Normalize shared role and recovery tables to backend lowercase `snake_case`, with safe fallback
      handling for unknown future codes (G19).
- [~] Active-role switching is still absent from the stale generated client, so no role-switch UI
      exists. OpenAPI 1.5.0 is published; regenerate and integrate it in FE-05.
- [~] Build authenticated Customer, Partner and Operations route shells with role-aware guards,
      honest `401`/`403`/expired-session recovery and cross-tab logout handling. Customer booking and
      Partner `/apply` use `useAuthGuard`; the Operations shell still needs it.
- [~] Keep authenticated/personalized routes dynamic and uncached; keep public marketing/catalog
      server-first with explicit revalidation and Suspense boundaries. `/book/[service]` and every
      `/apply/*` route are `force-dynamic` and `noindex`; the Operations shell is outstanding.
- [x] Add Playwright E2E setup for the three apps, using Django test fixtures or contract mocks only
      where the acceptance case explicitly tests a frontend boundary. Current suite runs against
      production `next start` servers and avoids backend-backed booking acceptance until fixtures and
      generated client freshness are ready.

**Status: partial.** Shared libraries and reusable authentication UI are strong, and the backend 1.5.0
contract is published. Generated-client freshness, real-browser CSRF/session integration, canonical
frontend code tables, active-role state and the Operations guard remain frontend blockers.

## F2 — Customer discovery and booking

- [x] Build real category, service-list and service-detail pages from published catalog endpoints.
- [~] Show real starting price. Minimum-visit policy/task definitions remain hidden until G8 is
      published; do not hardcode ₹199.
- [~] Booking reducer, sessionStorage intent recovery, address/scope/window/review/finding components,
      adapters and component tests exist under `/book/[service]`.
- [~] Implement Django OTP login/resume inside the booking sequence using F1 authentication flows.
      Login is a reducer interrupt (`REQUIRE_LOGIN` / `LOGIN_COMPLETED`) raised by whichever stage
      first needs a session, so nothing the customer configured is lost and they resume where they
      were. M1 is now explicitly login-first at the authenticated address boundary; real-browser
      completion waits on G17.
- [~] Implement address create/select/edit and serviceability interactions against published APIs.
      Address creation uses browser geolocation, backend reverse geocoding and the address create
      endpoint; selected saved addresses can be edited without fabricating serviceability. Unit tests
      pass, but authenticated browser mutation waits on G17.
- [ ] Implement cart PUT/login merge conflict and quote creation against the regenerated B5 client.
      Current workspace code does not contain these mutations and calls `useQuote(null)`.
- [~] Today/Scheduled window picker exists but uses quarantined proposal shapes (G2).
- [~] Review/cancellation ladder exists but uses fixture policy bands (G3).
- [~] Finding-a-professional UI exists but uses a proposed checkout projection (G4–G7); server polling
      must observe autonomous dispatch, not call `search/advance`.
- [ ] Remove raw runtime calls to every proposal-only booking path (G18). Until publication, the
      production route renders an explicit unavailable boundary and never sends the request.
- [ ] Wire idempotent checkout creation, free cancel, no-Partner alternatives and refresh/redirect
      recovery after G4–G6 are resolved.
- [ ] Build payment attempt, provider redirect/SDK boundary, ambiguous-result reconciliation,
      reservation-expiry restart and confirmed receipt after G1 is resolved.
- [~] Add route-level loading/error/not-found states and E2E coverage for anonymous → login → resume,
      merge conflict, expiry, offline/reconnect and duplicate submission. Route boundaries now exist
      for the booking flow plus app-level 404s, and Playwright smoke tests cover stable route
      boundaries. Backend-backed acceptance cases still wait on fixtures and generated client
      freshness.

**Status: booking UI/model foundation, catalog integration, OTP/login intent handling and route
boundaries.** Real-browser authentication/address mutation, removal of proposal runtime calls,
cart/quote, checkout mutations and recovery paths remain incomplete.

## F3 — Customer active booking

- [ ] Show authoritative Partner/status/appointment and text ETA; no map.
- [ ] Provide cancel/reschedule/address-change/support commands only when allowed by backend state.
- [ ] Show delay and fee-free recovery when the server declares an SLA breach.
- [ ] Display arrival and start OTP securely.
- [ ] Display and approve/decline scope amendments and collect revision payment.
- [ ] Show completion submission with Confirm and Report a problem.
- [ ] Show partial/refund/dispute states and retrieve invoice/credit note.
- [ ] Cover reload, multi-tab, stale-version, partial failure and accessibility flows with E2E tests.

**Status: not started and blocked by G1 plus B8/B9.** Do not reuse legacy Prisma booking trackers.

## F4 — Partner onboarding, schedule and presence

- [x] Application readiness/status model, optimistic-version query/mutation hooks, precise
      Changes Required messaging, explicit weekly availability editor and tests.
- [x] Build mobile-first `/apply/*` routes for OTP, draft profile, skills/services/areas, consent,
      documents, schedule, submit and review status. All seven routes are reachable, `force-dynamic`
      and `noindex`, behind one shared auth gate.
- [~] Profile and skills/services steps have working UI. OpenAPI 1.5.0 resolves G13/G15; regenerate
      the client, query canonical skills/accepting areas and replace full-record saves with focused
      partial mutations carrying the latest `expected_version`.
- [~] OpenAPI 1.5.0 resolves G14. Render the published current legal documents, record only their
      server-authored purpose/version and refetch application truth after each acceptance mutation.
- [~] Integrate actual OTP/session from F1. The Partner marketing hero now routes to the real
      `/apply` login instead of a placeholder server action. Unit/component integration exists, but
      real-browser session/CSRF completion and typed role switching remain in FE-05/G17.
- [~] Document metadata UI exists and `/apply/documents` shows per-kind status, version and the
      reviewer's rejection reason. Replace the old metadata request with OpenAPI 1.5.0 signed
      direct/TUS upload plus upload-ID finalization, progress, expiry and scan-pending states (G10).
- [ ] Integrate online/heartbeat/offline presence with clear permission/location-denied states,
      coarse-location disclosure and background-tab/offline behaviour.
- [ ] Add onboarding/schedule/presence E2E tests for version conflict, rejected replacement document,
      suspended/offboarded access, overlap, offline and reconnect.

**Status: the onboarding tree, draft models and published-endpoint adapters are reachable.** Backend
G9/G10/G13/G14/G15 are resolved in 1.5.0, so FE-06 and FE-07 are ready; presence is not implemented,
and real-browser authentication waits on G17.

## F5 — Partner offer and work

- [ ] Build an offer inbox/delivery connection after G11's bounded polling projection is published.
- [ ] Offer card shows server-authored scope, approximate area, timing, occupied estimate,
      requirements and net breakdown after G12 is published.
- [ ] Build explicit Accept/Decline, confirmation sheet, 120-second no-fault Undo and Commit now with
      idempotency, countdowns based on server time and stale-offer recovery.
- [ ] Hide exact address/contact until the server disclosure projection permits it.
- [ ] Build release with reason; no threat or opaque score.
- [ ] Build En route, Arrived, Customer unavailable, start OTP and contact/support.
- [ ] Persist tasks/evidence/upload status and scope amendment.
- [ ] Build Abort and line-level completion outcome.
- [ ] Show pending/available/paid ledger states and payout account/status without unsupported
      on-demand withdrawal.

**Status: not started.** Offer commands alone are insufficient; G11/G12 and B8/B9 define the screen.

## F6 — Operations

- [x] Active `frontend/apps/admin` is free of Prisma/Supabase and has the shared API/query foundation.
- [~] Partner-review decision model and transition/document-review mutation hooks exist and are tested.
- [~] Build Operations OTP/session/role guard and a routable dashboard shell. The current shell is a
      static anonymous blocker dashboard; dynamic session/active-role enforcement waits on G17/G19.
- [ ] Build Partner application queue/detail, claim ownership, masked-document reveal/review and
      conflict recovery against OpenAPI 1.5.0; G9/G10 and backend authorization are published.
- [ ] Build catalog/rate/pricing/area management after the B3 Operations contract is published.
- [ ] Build assisted booking/payment link and manual offer/recovery through ordinary APIs; creation
      commands exist, but customer lookup, payment and timeline reads do not.
- [ ] Build case list/detail with owner, SLA, evidence, communication and allowed commands after B9.
- [ ] Build booking/offer/reservation/payment/refund/ledger/payout timeline after B7–B9.
- [ ] Build kill switches, maker-checker and audit references after B10.
- [ ] Mask KYC, bank, exact address and sensitive evidence by default and audit every reveal.

**Status: command-model foundation plus a visual blocker-aware dashboard shell.** It is not yet an
authenticated Operations workspace; the guard waits on G17/G19, while review queues/details are now
ready for FE-07 integration against OpenAPI 1.5.0.

## Recommended execution boundary while backend follow-ups are built

1. Remove proposal-only runtime requests, normalize role/error codes and complete independent
   configuration, accessibility and responsive-shell fixes.
2. Backend publishes credentialed CORS, typed CSRF/session/active-role contracts and a fresh generated
   client; then prove login and one mutation in every app against real Django.
3. Integrate Partner application/presence/discovery and Operations review only as each generated
   contract slice lands.
4. Integrate Customer A1 catalog, windows, quote and explicit singleton-cart conflict before checkout,
   search or payment.
5. Keep polling bounded and observational; Celery owns offer/search deadlines and state transitions.
6. Do not build F3, Partner jobs or money/ledger Operations screens against guessed DTOs.

## Open product/architecture decisions

1. **Resolved:** a different singleton cart item returns an explicit replacement conflict; the server
   never silently deletes the existing item.
2. **Resolved for M1:** use bounded short polling with reconnect/freshness semantics; polling observes
   state while Celery owns all deadlines and transitions.
3. Decide whether pilot recruitment requires Telugu or Hindi; the message-key seam exists, but no
   additional locale is approved.
4. Define the server-owned Today free-cancellation grace, if any. Frontend must only render published
   cancellation bands.
5. **Resolved:** `frontend/` is the physical workspace; remaining stale `web/` references are cleanup
   tasks, not an architecture choice.

## Frontend completion gate

- [x] Current lint, TypeScript, **381 component/unit tests** and **5 Playwright smoke tests** pass.
- [ ] Generated client is current with the versioned published contract.
- [ ] Real-browser Django credential, CSRF refresh and authenticated mutation tests pass for Customer,
      Partner and Operations.
- [ ] No production module imports proposal/`contract-pending` DTOs or calls unpublished paths.
- [ ] Browser E2E covers every routable M1 acceptance flow against authoritative backend state.
- [ ] Keyboard, screen-reader, 200% zoom, reduced motion and contrast pass.
- [ ] Mobile 375/768 and desktop 1024/1440 have no overflow or covered controls.
- [ ] Slow network, offline/reconnect, redirect loss, upload failure, duplicate submission and
      permission denial are exercised.
- [ ] No UI claims payment, assignment, arrival, start, completion or refund before backend truth.
- [ ] Browser console is clean and production bundle/per-route budgets pass.
- [ ] No frontend route handler, Server Action or package implements Django-owned business logic or
      connects directly to PostgreSQL.
