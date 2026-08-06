# M1 Frontend Tasks

Scope and exclusions are in [M1 README](./README.md). Amounts, clocks and providers are frozen in
[Initial configuration](./05-initial-configuration.md). Customer, Partner and Operations remain
Next.js App Router applications; authenticated workspaces use client components and TanStack Query,
while public catalog/marketing routes remain server-first where practical.

Task markers: `[x]` implemented and integrated against the published contract · `[~]` UI/model code
exists but is not end-to-end integrable, with the blocker named · `[ ]` not implemented. Fixture-only
or quarantined proposal behaviour is never marked complete.

## Audit snapshot — 2026-08-06 (end of S7)

- `pnpm test`: **1138 passed across 76 files**. `pnpm typecheck` 9/9. `pnpm lint` clean.
  Generated client current at contract **1.17.0**.
- **FE-11 and FE-12 are both implemented.** Customer visit tracking, Partner job surface,
  Operations cases/payouts/kill-switches, and Partner earnings.
- **The role picker is gone.** Each app selects its own role from its own domain — see
  `role-selection.test.ts`. Previously every staff and Partner sign-in landed on a picker,
  because Django re-grants `customer` on each login and session creation takes the
  alphabetically first grant.
- **Playwright**: 133 green on the `operations-shell` project (the parallel session's work — the
  first browser coverage the console has ever had). Customer payment, Customer visit tracking
  and Partner jobs still have none.

### The typecheck figure above is from a *cold* run

It was 9/9 green on a warm run while `@vsolve/query` was genuinely broken. `role-selection.test.ts`
cast its fixture `as never` and then spread it — illegal, and turbo was replaying a cached result
from before those spreads existed. Typing it as `CurrentUser` also surfaced that the fixture never
carried the `full_name` and `email` the contract declares; the cast had been hiding a shape
mismatch, which is most of what a cast to `never` is good for.

**When a gate result decides something — a merge, a release — force a cold run.** A cached gate
tells you what used to be true.

The live board is [task.md](./task.md).

## Audit snapshot — 2026-08-06 (superseded)

- `pnpm test`: **1101 passed across 72 files**. `pnpm typecheck` 9/9. `pnpm lint` clean at
  `--max-warnings 0`. Generated client current at contract **1.16.0**.
- **Playwright has still never been run** — not once, against any of FE-10 through FE-18. The
  last recorded figure of 173 predates all of them. This is the largest single piece of unproven
  frontend behaviour in the milestone.
- **FE-11 is implemented** against the B8 API published in 1.16.0: `features/visit/` (Customer)
  and `features/work/` (Partner), with routes `/bookings/[groupId]/visits/[bookingId]` and
  `/jobs/[bookingId]`. It needed a contract fix first — `FulfilmentUnit.booking_id`, without
  which a group could describe three visits and offer no way to open any of them.
- **FE-15, FE-16, FE-17 and FE-18 are complete with tests** (parallel session, `637033c`).
- **FE-12 is the only frontend task left**, and it is blocked: `apps/cases`, `apps/payouts` and
  `apps/notifications` exist as domain layers with no HTTP surface, so building against them
  would mean inventing DTOs.

The live board is [task.md](./task.md).

## Audit snapshot — 2026-08-05 (superseded)

- `pnpm test`: **838 passed across 53 files**. `pnpm typecheck` 9/9 clean. `pnpm lint` clean at
  `--max-warnings 0`. Generated client current at contract **1.15.1**.
- **Playwright has still not been run.** `payment.e2e.ts` and `partner-shell.e2e.ts` have never
  been executed at all. Last recorded figure remains 173, from before FE-10/13/14/15/16 existed.
- **FE-10 payment is built** — `/bookings/[groupId]/pay` and `/receipt`, consuming payment
  attempts, checkout payment, reconcile, orders and tax documents. The "no Continue to Payment"
  gap recorded below is closed.
- **FE-14 is built** — `/` and `/login` exist; the root no longer 404s.
- **FE-15 is built** — `/account/{addresses,messages,privacy,sessions}`. Its privacy scanner had
  never been run and was failing the one file that logs correctly; fixed and verified red.
- **FE-16 is built** — the four Operations consoles. Its shell did not compile (missing `Link` /
  `usePathname`) and its `WorkspaceNav` was never rendered, so the routes were reachable only by
  typed URL. Fixed; nav mounted.
- **Neither FE-15 nor FE-16 has meaningful test coverage.** FE-16 has zero test files; FE-15 has
  only the source scanner. That is lanes P-A and P-B.
- Four published Operations dispatch commands and the whole Finance refund surface still have no
  UI — FE-17 and FE-18 on the board.
- Working tree committed as `bc17926` + `10903d7`.

The full findings are in [07-audit-2026-08-05.md](./07-audit-2026-08-05.md).

## Audit snapshot — 2026-08-04 (full repo re-audit — superseded above)

Re-derived from the working tree. See [task.md](./task.md) for the consolidated board.

- `pnpm test`: **727 passed across 48 files**. `contract:check` clean at **1.13.0**.
  `pnpm typecheck` 9/9 clean. `pnpm lint` clean at `--max-warnings 0`.
  **Playwright was not re-run in this audit** (last recorded: 173 green).
- **The reported "no Continue to Payment" is confirmed and is FE-10.** Searching
  `frontend/apps/**` and `frontend/packages/query/**` for `payment-attempts`,
  `checkouts/…/payment`, `refunds` or `tax-documents` returns **zero hits**. The Customer journey
  ends at `features/booking/group/view/group-result.tsx` with "You have not been charged". The
  backend contract for all of it shipped in 1.10.0 and is published in 1.13.0.
  `group-result.tsx` also still comments "Payment genuinely does not exist yet (BE-08)" — false
  since 1.10.0; correct it when FE-10 lands.
- **Customer navigation has the same defect the Partner app just had fixed.** There is no
  `app/page.tsx`, so `/` 404s. There is no `/login` route. `app/layout.tsx` still states "No
  signed-in shell here yet". The link graph is `catalog → /book/[service] → /cart`, and **nothing
  in the app links to `/bookings`** — it is reachable only by typing the URL. Tracked as FE-14.
- **Customer account surfaces are absent** despite `/addresses/` and `/auth/privacy/*` being
  published: no address book, preferences, consent receipts or privacy requests. Tracked as FE-15.
- **Operations has four published contracts with no UI**: compatibility-rule maker-checker,
  assisted checkouts, unit offers/reoffer, partner availability. `apps/admin` is `/` + `/reviews`
  only. Tracked as FE-16.
- **The Partner signed-in shell is built but entirely untracked.** `app/login/`, `app/dashboard/`,
  `features/session/`, `e2e/partner-shell.e2e.ts` and the `/offers` + `/availability` layouts are
  new files with no commit. Its unit tests, typecheck and lint pass here; its Playwright spec has
  not been run. Tracked as FE-13 (the brief file labels it FE-11, which collides with the board's
  FE-11 — the board ID wins).
- Working tree overall: 56 modified + 21 untracked files, none committed.

## Audit snapshot — 2026-08-04 (frontend G21–G24 / FE-09C green)

- Frontend regenerated at OpenAPI **1.13.0**. Full FE gate green: contract:check, lint, typecheck,
  692 unit tests, three-app build, **173** Playwright tests, verify, `git diff --check`.
- **G21 / 0007:** Done — Remove UI, versions, cache apply/invalidate, two-item and stale-version browser cases.
- **G22 / 0008:** Done — Customer bookings + Partner offers `useInfiniteQuery` + Load more; truncation copy removed.
- **G23 / 0009:** Done — stable Idempotency-Key per offer action; lost-Accept same-key replay browser proof.
- **G24 / FE-09C / 0010:** Done — skewed-device offer/undo countdown proofs; real-Django readable `Date` evidence.
- FE-08G and FE-09 marked Done. FE-10 payments not started.

## Audit snapshot — 2026-08-04 (backend gate green for 0007–0010)

- Backend dirty tree closed proposals 0007–0010 under OpenAPI **1.13.0** with green
  `quality.cmd` (210 passed, 86.40% branch-aware).
- Prior frontend readiness notes superseded by the frontend green snapshot above.

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
  contract including versioned cart-item removal (`POST …/remove/`) against OpenAPI 1.13.0.
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
- [x] Backend OpenAPI 1.13.0, changelog and generated-schema drift gate are published, and the
      frontend schema is regenerated from 1.13.0. `generate:check` continues to gate typecheck.

## Backend gaps that bound frontend work

BE-06G through BE-08 now publish the multi-item planning, autonomous dispatch and group-aware
payment surfaces. BE-09/BE-10 and FE-10 bound the remaining frontend work; G21–G24 are closed.

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

### G21 — Cart-item removal — Done

`POST /api/v1/cart/items/{item_id}/remove/` is integrated: both versions are sent, the authoritative
`Cart` replaces cache via `setQueryData`, only plan sets/quotes are invalidated, confirmation UI is
accessible, and two-item / stale-version / not-found / double-submit browser cases pass.

### G22 — Booking Group and Partner offer pagination — Done

Both Customer `/bookings` and Partner `/offers` use cursor-aware `useInfiniteQuery` with
`cursorFromNextUrl`, explicit Load more, `cursor_invalid` / `CursorContractError` restart, and no
truncation copy. Multi-page browser traversal preserves order without duplicates.

### G23 — Partner offer commands — Done

Commands send a stable `Idempotency-Key` per offer+action (`OfferActionEnum`), never auto-retry, keep
controls disabled in flight, and treat ambiguous failures as unconfirmed with inbox refetch.
Lost-Accept same-key replay browser proof passes.

### G24 / FE-09C — Server-clock calibration — Done

Skewed-device (≥1h) offer and undo countdowns use calibrated server time (~2 minutes, not ~1 hour).
Empty inbox calibrates from `OfferPage.server_now` without a Date header. Real-Django readable `Date`
evidence exists in `django.e2e.ts`. Harness Date exposure mirrors production CORS after 0010.

## F1 — Shared foundation and authentication

- [x] Generated-client package, request/error wrapper, idempotency-key helper and server-clock utility
      are integrated and gated by `generate:check`.
- [x] TanStack Query provider, cache keys, retry/error presentation, mounted cross-tab session sync
      and freshness policies.
- [x] Shared `serverClock` calibrates from exposed `Date` headers and generated `server_now`
      payloads. FE-09C skewed-device browser proof is green.
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

**Status: foundation implemented; client current at OpenAPI 1.13.0.** Authentication, role, query,
accessibility, real-browser session foundations and FE-09C server-clock proof are reusable.

## F2 — Customer discovery and booking

- [x] Build real category, service-list and service-detail pages from published catalog endpoints.
- [x] Render server-authored starting price, task definitions and minimum-visit policy without
      hardcoded arithmetic. BE-06G preserves these generated catalog fields.
- [x] Build a real `/cart` Customer surface with multiple independently scoped items, add/edit/remove,
      cart version, bounded limit copy and per-item validation. Add/edit, append and G21 versioned
      removal against `cart_items_remove` are integrated.
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
- [x] Extend `/bookings` beyond page one with cursor `useInfiniteQuery` and Load more (G22 Done).
- [x] Remove raw runtime calls to every proposal-only booking path (G18). The production route keeps
      an explicit unavailable boundary until FE-08G replaces the singleton generated integration.
- [x] Wire stable-idempotency group confirmation plus stale cart/plan/quote, expired quote,
      withdrawn plan, duplicate confirmation and in-flight idempotency recovery. FE-09 now renders
      server-published group recovery/cancellation actions without deriving them from status.
- [~] Build payment attempt, provider redirect/SDK boundary, ambiguous-result reconciliation,
      group reservation-expiry restart and unit-allocated receipt in FE-10 against OpenAPI 1.10.0.
      Built and unit-tested; **`e2e/payment.e2e.ts` has never been run**, so redirect loss and
      duplicate submission have no browser proof.
- [x] Add `/cart` loading/error route boundaries and browser coverage for anonymous login interrupt,
      explicit merge, sequential/parallel/separate/mixed plans, stale plan/cart/quote, per-item
      failures, duplicate confirmation, keyboard dialog behavior and responsive/accessibility cases.
- [ ] Add real-Django cart/plan/quote/confirmation acceptance plus FE-09 offline/reconnect and
      one-unit matching failure, and FE-10 redirect-loss/duplicate-payment browser acceptance.

**Status: FE-08G Done (including G21 removal) and FE-09 Done (including G22/G23/FE-09C).** Generated
queries, App Router boundaries, hydration, accessibility and contract-shaped browser gates pass.
FE-10 is the next ready frontend task against OpenAPI 1.10.0; authoritative Django-backed
booking/dispatch acceptance remains a milestone gate rather than being implied by intercepted E2E
payloads.

## F3 — Customer active booking

- [x] Show a Booking Group summary plus authoritative status, Partner, appointment and text ETA per
      Fulfilment Unit; no map. `features/visit/` renders one visit; the group detail links into it
      through `FulfilmentUnit.booking_id` (1.16.0).
- [x] Provide unit cancel/reschedule and group-wide cancel/reschedule/address-change only when
      allowed by backend state. The `can*` predicates pick which screen to show and never decide
      whether a command is permitted — Django owns `ALLOWED_TRANSITIONS`, the fee ladder and the
      reschedule notice rule, and refuses anything the client gets wrong.
- [x] Show delay and fee-free recovery when the server declares an SLA breach. `RECOVERY_REQUIRED`
      reads as "finding a replacement", never as cancelled.
- [x] Display arrival and start OTP securely. The Customer requests the code and reads it from
      their own SMS; the response carries `code_length`, never the code.
- [x] Display and approve/decline scope amendments. Approval returns the `PaymentAttempt` Django
      minted in the same transaction, so approval is never reported as finished before it is paid.
- [x] Show completion submission with Confirm and Report a problem, at equal visual weight.
- [x] Show unit-level partial/refund/dispute states without making unaffected units appear failed.
      Every status in the contract has copy; `Record<VisitStatus, …>` makes a new one a typecheck
      failure rather than a badge rendering `undefined`.
- [ ] Cover reload, multi-tab, stale-version, partial-unit failure, group recovery and accessibility
      flows with E2E tests.

**Status: implemented against OpenAPI 1.16.0 (2026-08-06).** 10 predicate tests pin which actions
are offered and when polling stops. Browser E2E for reload, multi-tab and stale-version remains.

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
- [x] Extend `/offers` beyond page one with cursor `useInfiniteQuery` and Load more (G22 Done).
- [x] Build explicit Accept/Decline, confirmation sheet, 120-second no-fault Undo and Commit-now UI.
      Controls remain disabled for the full in-flight window; ambiguous outcomes re-read the inbox
      and are labelled unconfirmed rather than guessed as a loss.
- [x] Stable-key replay and typed refusal/race handling for offer commands (G23 Done), including
      lost-Accept same-key replay browser proof.
- [x] Drive offer-expiry and undo countdowns from calibrated server time; FE-09C skewed-device proof
      is green (G24 Done).
- [x] Hide exact address/contact until the server disclosure projection permits it; FE-09 renders
      only the unit-scoped fields carried by the generated Offer projection.
- [x] Build release with reason; no threat or opaque score. There is no consequence copy because
      there is no consequence — M1 records a late release for manual Operations review only, and
      inventing a warning would push a Partner who cannot attend toward a no-show.
- [x] Build En route, Arrived, Customer unavailable and start OTP. The `can*` predicates offer at
      most one forward action per state, which a test asserts across every published status —
      `ALLOWED_TRANSITIONS` permits one, so two on screen would mean the machine and the UI have
      diverged.
- [~] Tasks and scope amendment are integrated; **evidence upload/finalize is published (grant →
      PUT → finalize against a checksum Django recomputes) but has no Partner UI yet.**
- [x] Build Abort and line-level completion outcome. Every task must be answered before the report
      can be sent: Django settles money from these outcomes, so an unanswered task would either
      refund work that happened or pay for work that did not.
- [x] Show pending/available/paid ledger states and payout account/status without unsupported
      on-demand withdrawal. Partner `/earnings` shows four numbers rather than one — money held
      behind an open case is not money anybody can plan around — and publishes no withdraw
      affordance, because M1 pays through a reviewed run and a button would promise otherwise.
- [x] Prove the Partner offer UI cannot query or render a sibling unit, Partner identity, scope or
      earnings from the same Booking Group.

**Status: FE-09, the FE-11 work surface and the FE-12 earnings view are all implemented
(2026-08-06, OpenAPI 1.16.0 → 1.17.0).** `/jobs/[bookingId]` runs en route → arrived → start OTP
→ report, plus abort and release; `/earnings` reads the ledger published in 1.17.0.
**Remaining in F5:** the evidence upload UI, and browser coverage — `/jobs` has never been driven
in Playwright, and it is a money-and-safety path.

## F6 — Operations

- [x] Active `frontend/apps/admin` is free of Prisma/Supabase and has the shared API/query foundation.
- [x] Partner-review decision model and transition/document-review mutation hooks exist and are tested.
- [x] Build Operations OTP/session/selected-role guard and a dynamic routable dashboard shell.
- [x] Build Partner application queue/detail, claim ownership, masked-document reveal/review and
      conflict recovery against OpenAPI 1.5.0.
- [ ] Build catalog/rate/pricing/area management after the B3 Operations contract is published
      (still unpublished — BE-CAT).
- [x] Build assisted multi-item cart, plan confirmation/payment link and manual unit offer/recovery
      through ordinary APIs; Operations cannot invent grouping or force Partner acceptance.
      FE-16 built `/operations/{assisted-checkouts,manual-offers,compatibility-rules,
      partner-availability}` against 1.8.0/1.9.0. Tests landed with P-A: maker-checker refusal,
      self-approval denial, assisted-checkout consent capture, reoffer and availability edits.
- [x] Build Operations dispatch recovery — offer revoke, reservation release, unit recover and the
      read-only dispatch explanation published in 1.15.0 (FE-17). Every command carries
      `expected_unit_version` and a stable `Idempotency-Key`; a stale read surfaces
      `dispatch_version_conflict` and refetches server truth rather than retrying into it.
- [x] Build the refund queue and reconcile command behind a step-up gate, published since 1.10.0
      (FE-18). **The gate is now `HasRecentOperationsStepUp`** — the separate finance role was
      dropped on 2026-08-06 and `HasRecentFinanceStepUp` deleted with it. No refund is reported
      successful before Django says so; a failed refund stays visibly in progress rather than
      resolving optimistically.
- [x] Build case list/detail with owner, SLA, evidence, communication and allowed commands.
      `/operations/cases` renders `allowed_resolutions` as published rather than carrying a
      kind-to-resolutions map — that rule differs per kind, and a local copy would offer a
      reviewer a resolution the server refuses. Adding a note never moves the status.
- [~] Build Booking Group dependency view plus unit offer/reservation/payment/refund/ledger/payout
      timelines. The projections BE-09-API and BE-10 were waiting on are published (1.16.0 /
      1.17.0), and the case timeline, payout batch detail and Partner ledger all render.
      **A single unified per-group timeline stitching offer → reservation → payment → fulfilment →
      refund → ledger into one view does not exist**; today an operator reads four consoles.
- [x] Build kill switches, maker-checker and audit references. `/operations/kill-switches`
      reads the board whole and shows who engaged each switch and why.
      `/operations/payouts` greys out Approve for the proposer and routes a missing step-up
      to re-verification rather than reporting it as a failure.
- [x] Mask KYC, bank, exact address and sensitive evidence by default and audit every reveal.
      KYC reveal at `/reviews` is claim-before-decide, and hiding drops the signed URL so a second
      look is a second audited disclosure. Bank data is masked at the source rather than in the UI:
      the payout projection publishes `account_last4` and omits `provider_fund_account_id`
      entirely, so there is nothing on the wire to leak.

**Status: F6 is complete except the B3 catalog lifecycle (BE-CAT, unpublished) and the unified
per-group timeline.** Partner review, the four 1.8.0/1.9.0 consoles, dispatch recovery, refunds,
cases, payouts and kill switches are all built, tested and mounted in the nav.

## Recommended execution boundary while backend follow-ups are built

1. Remove proposal-only runtime requests, normalize role/error codes and complete independent
   configuration, accessibility and responsive-shell fixes.
2. Backend publishes credentialed CORS, typed CSRF/session/active-role contracts and a fresh generated
   client; then prove login and one mutation in every app against real Django.
3. Integrate Partner application/presence/discovery and Operations review only as each generated
   contract slice lands.
4. **Superseded — the boundary has been reached.** The client is current at 1.17.0 and every
   frontend task FE-01 through FE-18 is built. There is no remaining screen waiting on a contract
   except the B3 catalog lifecycle (BE-CAT).
5. Keep polling bounded and observational; Celery owns offer/search deadlines and state transitions.
6. Do not build F3, Partner jobs or money/ledger Operations screens against guessed DTOs.
   *(Held throughout: FE-11 waited for 1.16.0 and FE-12 for 1.17.0 rather than inventing DTOs.)*
7. **What is left is browser proof, not code.** See the S8 entry list in [task.md](./task.md).

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

- [x] Contract freshness, lint, typecheck, unit/component and build gates pass: **1138
      component/unit tests across 76 files**, typecheck 9/9, lint clean at `--max-warnings 0`
      (2026-08-06, verified on a cold run — see the cache note in the top snapshot).
- [~] **Playwright: 133 green**, covering the Operations console and the responsive harness. The
      earlier figure of 173 predates FE-10 onward and is not comparable. Customer payment, Customer
      visit tracking, Partner jobs and the Partner shell have no browser coverage at all.
- [x] Generated client is current with versioned OpenAPI **1.17.0**; `generate:check` /
      `contract:check` pass.
- [x] Real-browser Django credential, CSRF refresh and authenticated mutation tests pass for Customer,
      Partner and Operations.
- [x] No production module imports proposal/`contract-pending` DTOs or calls unpublished paths.
      G21 Remove, G22 cursor Load more, G23 stable-key offer commands and G24/FE-09C clock proof are
      integrated against the generated client.
- [ ] Browser E2E covers every routable M1 acceptance flow against authoritative backend state.
- [~] `/cart` keyboard/focus-dialog behavior, landmarks, live announcements, 200% zoom, reduced
      motion and responsive checks pass; complete the same gate for FE-10–FE-12 routes.
- [~] `/cart` plus the existing public matrix pass at 375/768/1024/1440; repeat for remaining
      authenticated Partner, Customer booking and Operations routes.
- [x] FE-08G covers held responses, unreadable cart, stale versions, expired/withdrawn server state,
      duplicate confirmation and G21 two-item/stale-version removal. FE-09 covers empty-inbox arrival,
      polling pause/backoff/recovery, G22 multi-page traversal, G23 ambiguous/lost-Accept replay and
      FE-09C skewed-device countdown. Redirect loss, upload failure and remaining permission-denial
      flows stay with FE-10 and onboarding acceptance.
- [x] No UI claims payment, assignment, arrival, start, completion or refund before backend truth.
- [ ] Browser console is clean and production bundle/per-route budgets pass.
- [x] No frontend route handler, Server Action or package implements Django-owned business logic or
      connects directly to PostgreSQL.
