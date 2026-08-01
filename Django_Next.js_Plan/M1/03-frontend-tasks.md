# M1 Frontend Tasks

Scope and exclusions are in [M1 README](./README.md). Amounts, clocks and providers are frozen in
[Initial configuration](./05-initial-configuration.md). Customer, Partner and Operations remain
Next.js App Router applications; authenticated workspaces use client components and TanStack Query,
while public catalog/marketing routes remain server-first where practical.

Task markers: `[x]` implemented and integrated against the published contract · `[~]` UI/model code
exists but is not end-to-end integrable, with the blocker named · `[ ]` not implemented. Fixture-only
or quarantined proposal behaviour is never marked complete.

## Audit snapshot — 2026-08-01

- The active workspace is `frontend/`: three Next.js 16 apps plus shared API client, query, UI,
  configuration and testing packages.
- The active workspace contains no Prisma, Supabase or `@vsolve/db` imports. The useful M1 files have
  been separated from the legacy `web/` implementation.
- Frontend lint, all eight TypeScript workspaces and **274 tests across 18 files** pass. All three apps
  build successfully.
- Customer has catalog/category/service and `/book/[service]` routes. Partner currently has marketing
  routes only. Operations has no `page.tsx`, so its current root route intentionally returns 404.
- The OpenAPI TypeScript file is generated from an older `1.2.0` checksum and does not contain the
  B5/B6 cart/checkout/search/offer paths. `generate:check` correctly fails.
- Django's current generated schema validates, but the contract is still labelled `1.2.0` and the
  changelog does not describe B5/B6. Frontend integration must follow a versioned contract release.

## Workspace and contract prerequisites

- [x] Keep Customer, Partner and Operations on Next.js App Router; do not add a Vite application or a
      second Operations app.
- [x] Remove legacy Prisma/Supabase/database dependencies from the active `frontend/` workspace.
- [ ] Review and checkpoint the current `web/` → `frontend/` migration before feature-route work so
      the repository move and new product behaviour are separate changes.
- [ ] Update `AGENTS.md`, architecture diagrams and commands that still declare `web/apps/**` and
      `web/packages/**`. Until then, ownership rules and the physical workspace disagree.
- [ ] Add `frontend/.env.example`/README documentation for public API URL, server API URL and per-app
      site URL; retain localhost defaults only for development.
- [ ] Backend owner: cut the next OpenAPI version and changelog, then regenerate
      `frontend/packages/api-client/src/generated/schema.d.ts` and enforce `generate:check` in CI.

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

### G9 — Operations cannot discover Partner applications

Transition and document-review commands exist, but there is no queue/detail GET endpoint, assignment,
pagination or signed masked KYC URL. The Operations UI cannot find or safely inspect what it may act
on.

### G10 — Partner document upload transport is missing

The application endpoint accepts `object_key` and `sha256`, but nothing issues a signed upload URL or
verifies the uploaded object. Resumable document upload cannot be completed.

### G11 — Partner offer delivery is undecided

The API exposes a list endpoint against a 45-second offer deadline. Decide whether delivery is
short-polling, SSE or another explicit web mechanism, and define reconnect/replay semantics. Do not
silently require an always-open tab.

### G12 — Partner offer/job and Operations payloads are too thin

Partner offers omit scope, approximate area, timing, occupied estimate, requirements and net
earnings. There are no Partner job, ledger or payout APIs, and no Operations booking/payment/refund
timeline. F5 and most of F6 must wait for B8–B10 contracts.

## F1 — Shared foundation and authentication

- [x] Generated-client package, request/error wrapper, CSRF/cookie support, idempotency-key helper and
      server-clock utility.
- [x] TanStack Query provider, cache keys, retry/error presentation, cross-tab signals and freshness
      policies.
- [x] Accessible shared primitives, brand tokens, locale-aware money/readout helpers, error/loading
      boundaries and MSW contract fixtures.
- [~] Generated OpenAPI client exists but is stale. Regenerate only after the backend publishes the
      correctly versioned contract.
- [ ] Build reusable Django OTP request/verify, CSRF bootstrap, current-session, logout, session-list/
      revoke and active-role-switch flows. `partner/app/(auth)/actions.ts` is still a placeholder.
- [ ] Build authenticated Customer, Partner and Operations route shells with role-aware guards,
      honest `401`/`403`/expired-session recovery and cross-tab logout handling.
- [ ] Keep authenticated/personalized routes dynamic and uncached; keep public marketing/catalog
      server-first with explicit revalidation and Suspense boundaries.
- [ ] Add Playwright E2E setup for the three apps, using Django test fixtures or contract mocks only
      where the acceptance case explicitly tests a frontend boundary.

**Status: partial.** Shared libraries are strong; contract freshness and actual authentication UI are
the next foundation work.

## F2 — Customer discovery and booking

- [x] Build real category, service-list and service-detail pages from published catalog endpoints.
- [~] Show real starting price. Minimum-visit policy/task definitions remain hidden until G8 is
      published; do not hardcode ₹199.
- [~] Booking reducer, sessionStorage intent recovery, address/scope/window/review/finding components,
      adapters and component tests exist under `/book/[service]`.
- [ ] Implement Django OTP login/resume inside the booking sequence using F1 authentication flows.
- [ ] Implement address create/select/edit and serviceability interactions against published APIs.
- [ ] Implement cart PUT/login merge conflict and quote creation against the regenerated B5 client.
      Current workspace code does not contain these mutations and calls `useQuote(null)`.
- [~] Today/Scheduled window picker exists but uses quarantined proposal shapes (G2).
- [~] Review/cancellation ladder exists but uses fixture policy bands (G3).
- [~] Finding-a-professional UI exists but uses a proposed checkout projection (G4–G7); server polling
      must observe autonomous dispatch, not call `search/advance`.
- [ ] Wire idempotent checkout creation, free cancel, no-Partner alternatives and refresh/redirect
      recovery after G4–G6 are resolved.
- [ ] Build payment attempt, provider redirect/SDK boundary, ambiguous-result reconciliation,
      reservation-expiry restart and confirmed receipt after G1 is resolved.
- [ ] Add route-level loading/error/not-found states and E2E coverage for anonymous → login → resume,
      merge conflict, expiry, offline/reconnect and duplicate submission.

**Status: UI/model foundation only for booking; catalog is integrated.** Do not mark the workspace
complete until its mutations and recovery paths use published endpoints.

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
- [ ] Build mobile-first `/apply/*` routes for OTP, draft profile, skills/services/areas, consent,
      documents, schedule, submit and review status.
- [ ] Integrate actual OTP/session/Partner role switching from F1; marketing auth actions are
      currently placeholders.
- [~] Document metadata mutation exists, but signed/resumable upload is blocked by G10.
- [ ] Integrate online/heartbeat/offline presence with clear permission/location-denied states,
      coarse-location disclosure and background-tab/offline behaviour.
- [ ] Add onboarding/schedule/presence E2E tests for version conflict, rejected replacement document,
      suspended/offboarded access, overlap, offline and reconnect.

**Status: reusable components and contract hooks exist; no onboarding route is currently reachable.**

## F5 — Partner offer and work

- [ ] Build an offer inbox/delivery connection only after G11 is decided.
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
- [ ] Build Operations OTP/session/role guard and a routable dashboard shell. The app currently has no
      page route.
- [ ] Build Partner application queue/detail, ownership, masked-document review and conflict recovery
      after G9/G10 and backend authorization hardening land.
- [ ] Build catalog/rate/pricing/area management after the B3 Operations contract is published.
- [ ] Build assisted booking/payment link and manual offer/recovery through ordinary APIs; creation
      commands exist, but customer lookup, payment and timeline reads do not.
- [ ] Build case list/detail with owner, SLA, evidence, communication and allowed commands after B9.
- [ ] Build booking/offer/reservation/payment/refund/ledger/payout timeline after B7–B9.
- [ ] Build kill switches, maker-checker and audit references after B10.
- [ ] Mask KYC, bank, exact address and sensitive evidence by default and audit every reveal.

**Status: command-model foundation only; no Operations screen is routable.**

## Recommended execution boundary while backend follow-ups are built

1. Finish workspace-path governance, environment documentation and the versioned generated client.
2. Build shared OTP/session/role UI and authenticated shells for all three apps.
3. Complete Customer published-path integration: addresses, serviceability, singleton cart and merge
   conflict. Keep windows, policy, checkout recovery and payment quarantined.
4. Build Partner `/apply/*` and schedule routes, stopping document flow at the signed-upload boundary.
5. Build the Operations shell and review components, stopping data integration at the missing queue/
   detail/masked-media boundary.
6. Do not build F3, Partner jobs or money/ledger Operations screens against guessed DTOs.

## Open product/architecture decisions

1. Confirm whether replacing a different singleton cart item is deliberate or must return a conflict.
2. Decide Partner offer delivery/reconnect semantics for the 45-second deadline.
3. Decide whether pilot recruitment requires Telugu or Hindi; the message-key seam exists, but no
   additional locale is approved.
4. Define the server-owned Today free-cancellation grace, if any. Frontend must only render published
   cancellation bands.
5. Approve `frontend/` as the physical workspace and update all ownership/architecture references
   that still name `web/`.

## Frontend completion gate

- [x] Current lint, TypeScript and **274 component/unit tests** pass.
- [ ] Generated client is current with the versioned published contract.
- [ ] Browser E2E covers every routable M1 acceptance flow against authoritative backend state.
- [ ] Keyboard, screen-reader, 200% zoom, reduced motion and contrast pass.
- [ ] Mobile 375/768 and desktop 1024/1440 have no overflow or covered controls.
- [ ] Slow network, offline/reconnect, redirect loss, upload failure, duplicate submission and
      permission denial are exercised.
- [ ] No UI claims payment, assignment, arrival, start, completion or refund before backend truth.
- [ ] Browser console is clean and production bundle/per-route budgets pass.
- [ ] No frontend route handler, Server Action or package implements Django-owned business logic or
      connects directly to PostgreSQL.
