A. Executive Summary
Is the architecture production-ready? — No, not for open production; yes for a controlled demo/beta. The rendering/data architecture (hybrid RSC + TanStack) is sound and correctly chosen, and the domain engine (@vsolve/db dispatch/fulfillment) is well-isolated. But several production-safety fundamentals are missing or broken, and the "hybrid" is currently only half-built (no query hydration). Ship-blocking issues are in auth and resilience, not in the perf design.

Assumptions I'm making (stated explicitly): deploy target is Vercel/serverless (inferred from schema.prisma: rhel-openssl binary target + pgBouncer pooled URL); OTP/payments are intentionally mocked for the demo; Supabase Postgres is the DB. The OTP finding's severity depends on the serverless assumption — if you deploy to a single long-lived Node server, it drops from critical to high.

Top 5 risks
OTP/session auth uses an in-memory Map (lib/auth/session.ts pendingOtps) — this does not survive across serverless invocations, so login breaks in production. The DB OtpChallenge model exists but is unused.
Zero rate limiting anywhere — OTP send/verify, booking create, dispatch accept are all unthrottled → SMS-bombing, OTP brute-force, spam bookings.
No error boundaries (error.tsx/global-error.tsx absent in all three apps) — any render or query throw = white screen in prod.
getServerSession() is not request-deduped (no React cache() anywhere) → repeated prisma.session.findUnique per render (layout + page + components) = latency + DB load on every request.
No observability or timeouts — only console.error; no structured logging, no error tracking, no DB/request timeouts → you are blind and unbounded in prod.
Top 5 highest-impact improvements
Move OTP to the existing OtpChallenge table (hashed code + attempts + expiresAt) and add rate limiting → fixes auth correctness and abuse in one stroke.
Wrap getServerSession (and other hot server reads) in React cache() → removes per-request query waterfalls immediately.
Add error.tsx (per app) + global-error.tsx, and loading.tsx to partner/admin → resilience + perceived speed.
Implement the missing hydration half: prefetchQuery + HydrationBoundary on booking/track/[ref] and notifications → kills the first-paint spinner you still have.
Add observability (Sentry or equivalent) + a shared DB timeout wrapper → production visibility.
B. Detailed findings
1. lib/auth/session.ts — OTP + session in-memory Map
Severity: critical · Area: safety/fetching
Why: const pendingOtps = new Map() and sendMockOtp/verifyMockOtp hold state in process memory. On Vercel/serverless each request may hit a different instance, so verify-after-send fails intermittently in prod. The schema already has OtpChallenge { codeHash, attempts, expiresAt, consumed } — it's dead code, i.e. the correct design was modeled but not wired.
Fix: Persist OTP to OtpChallenge (store codeHash via @vsolve/crypto, enforce attempts cap + expiresAt + single-use consumed). Keep the mock provider (don't send real SMS) but make the storage real. Wrap getServerSession in React cache().
Priority: immediate
2. No rate limiting on any route
Severity: critical · Area: safety
Why: api/auth/otp (send + verify), api/bookings, api/job-offers, api/providers/nearby are all open. OTP send = SMS-cost/DoS; verify = brute-force; booking/dispatch = spam.
Files: every app/api/**/route.ts; partner api/job-offers, api/crew-requests.
Fix: A small token-bucket keyed by IP+phone. Upstash Redis (@upstash/ratelimit) is the standard serverless choice; wrap sensitive routes in a withRateLimit() helper. At minimum, gate OTP send/verify and booking create.
Priority: immediate
3. No error boundaries; sparse loading states
Severity: high · Area: RSC/safety
Why: No error.tsx/global-error.tsx in customer/partner/admin (confirmed). A thrown error in an RSC or an unhandled query error renders Next's default/blank screen. Partner and admin also have no loading.tsx → no streaming skeletons, slower perceived nav.
Files: add app/error.tsx + app/global-error.tsx per app; app/dashboard/loading.tsx (partner), admin dashboard loading.tsx.
Fix: Minimal error boundary with a reset button + logged error; segment-level loading skeletons for the dashboard shells.
Priority: immediate → next
4. getServerSession not deduped; no React cache() usage
Severity: high · Area: performance/fetching
Why: Confirmed zero cache() usage. getServerSession runs a DB query; it's called in layout + page + often multiple components per render → N identical queries per navigation, serialized.
Files: lib/auth/session.ts, and callers across app/(customer)/**.
Fix: export const getServerSession = cache(async () => {...}). Do the same for any server read called more than once per request.
Priority: immediate
5. Query hydration/prefetch is entirely missing
Severity: high · Area: TanStack/performance
Why: HydrationBoundary/dehydrate/prefetchQuery = none. The @vsolve/query client already ships the correct getQueryClient() server path and a dehydrate config for pending queries — but nothing uses it. So BookingTracker, NotificationsScreen, and ServiceBookingFlow still show a client spinner on first paint. This is the unbuilt half of the hybrid you approved.
Files: app/(customer)/booking/track/[ref]/page.tsx (prefetch qk.booking(ref) server-side, wrap in HydrationBoundary); notifications page; the booking route already builds the exact TrackingData shape — extract that serializer so server prefetch and /api/bookings/[ref] share it (avoids duplication).
Priority: next
6. Catalog cache has no invalidation path; public pages likely dynamic
Severity: high · Area: caching
Why: revalidateTag("catalog") appears only in a comment — never called. So unstable_cache(..., { tags:["catalog"], revalidate: 3600 }) is write-once with up to 1h staleness and no bust. Separately, public catalog pages (/services, /services/[category]) probably render dynamically (session/headers() usage elsewhere pulls them dynamic), so you pay TTFB on SEO pages that could be ISR/static.
Files: lib/catalog/queries.ts; app/(customer)/services/**/page.tsx.
Fix: (a) When admin catalog CRUD lands, call revalidateTag("catalog") there; until then, keep it but lower revalidate or document the staleness. (b) Split public catalog pages so the session-dependent bits are child client/server-islands and the page itself is ISR (export const revalidate). This is the biggest SEO + TTFB win.
Priority: next
7. No observability, logging, or timeouts
Severity: high · Area: safety
Why: Only console.error. No error tracking, no request IDs, no DB statement timeout → a slow/stuck Supabase query hangs the function to its platform limit.
Fix: Add Sentry (RSC + route + client). Add a withTimeout()/Prisma statement_timeout on pooled connections. Add structured logs on mutations (booking create, dispatch accept, pay).
Priority: next
8. haversineKm duplicated in 4 files
Severity: medium · Area: code quality
Files: lib/fulfillment/push-dispatch.ts, lib/provider/nearby.ts, lib/bookings/vendors.ts, lib/accommodation/queries.ts.
Fix: One lib/geo.ts (or @vsolve/db util) haversineKm() + SERVICE_RADIUS_KM. Also unifies the matching radius constant.
Priority: next
9. ShellSwitcher — root client component with a fetch waterfall
Severity: medium · Area: fetching/performance
Why: Runs on mount for the whole app: navigator.geolocation → public Nominatim reverse-geocode → /api/auth/session → /api/profile/addresses → POST address. That's an external-API call (Nominatim usage policy forbids heavy client use) plus a 3-step client waterfall that duplicates data pages already have. It also forces AppHeader/BottomNav (client) into every route.
Files: components/shared/ShellSwitcher.tsx.
Fix: Move reverse-geocoding behind your own /api/geocode/reverse (already exists!) instead of hitting Nominatim from the browser. Use the qk.session/qk.addresses queries (now cached) instead of raw fetches. Consider making header/nav server components.
Priority: next
10. Polling that could be realtime; polls in background
Severity: medium · Area: TanStack/performance
Why: Dispatch/tracker poll every 4s; notifications 30s. On Supabase you have Realtime (Postgres changes) for booking status and job offers → lower latency, far fewer requests. Also refetchInterval keeps firing when the tab is hidden.
Fix: Add refetchIntervalInBackground: false now (cheap). Later, replace the 4s booking/offer polls with a Supabase Realtime subscription that invalidates qk.booking(ref) / pqk.jobOffers().
Priority: later
11. Django-migration coupling: server path bypasses the API
Severity: medium · Area: safety/migration
Why: Client data goes through centralized fetchers (lib/query/api.ts) — good, Django-swappable. But RSC pages and lib/*/queries.ts call Prisma directly, so moving the backend to Django means rewriting every server-side data function and @vsolve/db. The domain engine being in @vsolve/db helps, but it's Prisma-typed end to end.
Fix: Define a thin repository/service interface (getBooking, listServices, createBooking, dispatch) that today is Prisma-backed and tomorrow can be Django-REST-backed. Keep DTO types framework-neutral (they mostly are). Don't leak Prisma types into components.
Priority: later (but decide the boundary now)
12. Business logic embedded in UI
Severity: medium · Area: code quality/safety
Why: ServiceBookingFlow builds the slot ISO, detail-pairs, and price display; pricing is quotedAmount = service.pricePaise server-side with no platform fee/GST, while the UI implies a total. Slot/pricing/fee rules belong in a shared domain module, computed server-side and echoed to the client.
Files: components/customer/booking/ServiceBookingFlow.tsx, app/api/bookings/route.ts, lib/bookings/queries.ts.
Fix: A pricing.ts domain function (base + fee + tax) used by both the API and the summary UI; server is source of truth.
Priority: next
13. Providers/bundle scoping
Severity: low · Area: performance
Why: QueryProvider is at partner root layout → react-query ships to static marketing/SEO pages that don't need it. Customer has two loading.tsx (root + (customer)).
Fix: Scope QueryProvider to app/dashboard/layout.tsx (partner) and the (customer) group, not the marketing root.
Priority: later
14. Raw <img> instead of next/image
Severity: low · Area: performance
Why: Trackers and ServiceBookingFlow use <img src=…> (including remote Unsplash) → no responsive sizing/lazy/AVIF, CLS risk.
Fix: next/image with configured remote patterns for real assets; keep raw <img> only for user-uploaded data-URLs if needed.
Priority: later
C. Best-practices checklist
Item	Status	Note
Server-first rendering	partially done	Home/catalog RSC + unstable_cache; but public pages render dynamic (no ISR), session not cache()-deduped
Query hydration / prefetch	missing	No HydrationBoundary/dehydrate/prefetchQuery anywhere
Route loading states	partially done	Customer only; partner + admin have none
Error boundaries	missing	No error.tsx/global-error.tsx in any app
Cache tags	partially done	catalog tag defined but never invalidated; partner/admin use revalidatePath well
Targeted invalidation	partially done	Client mutations invalidate specific keys (good); some router.refresh() is broad
Bundle splitting	partially done	RSC helps; root client providers + always-on chrome ship extra JS
Performance budgets	missing	No budget/CI check
Monitoring	missing	Only console.error
Rate limiting	missing	None anywhere
Auth/role enforcement	partially done	Route session checks + admin allowlist exist; OTP broken in serverless, no throttle
Image/font optimization	partially done	next/font used ✅; raw <img> / remote Unsplash unoptimized
Migration-friendly API boundaries	partially done	Client fetchers centralized ✅; server path Prisma-coupled
What's genuinely good — keep it:

@vsolve/query single client config with the official isServer singleton + pending-query dehydrate config — correct; don't fork per-app.
Admin on server actions + revalidatePath — the right tool; do not convert to TanStack.
qk/pqk key factories + typed fetchers — prevents key drift; keep and extend.
@vsolve/db fulfillment/dispatch engine as the shared domain layer — best isolation you have for a future Django move.
Partner marketing force-static — correct.
D. Final recommendation
Fix-some-first, then ship to a limited beta. Do not open to public production yet, and do not redesign — the architecture is right; the gaps are safety/resilience plumbing.

Two hard blockers before any real users: (1) OTP/session must move off the in-memory Map to the OtpChallenge table; (2) rate limiting on OTP + booking. Without these, auth is unreliable and abusable.

7-day action plan
Day 1–2 (immediate): Move OTP to OtpChallenge (hashed + attempts + expiry + single-use); wrap getServerSession in cache(); add @upstash/ratelimit withRateLimit() on OTP send/verify + POST /api/bookings.
Day 3: Add error.tsx + global-error.tsx to all three apps; loading.tsx to partner/admin dashboards; wire Sentry (server + client) and a Prisma statement_timeout.
Day 4: Implement hydration for booking/track/[ref] and notifications (prefetchQuery + HydrationBoundary); extract the shared TrackingData serializer so route + prefetch don't diverge.
Day 5: De-dup haversineKm into lib/geo.ts; extract pricing.ts (fees/GST) used by both API and UI; move ShellSwitcher reverse-geocode to your own /api/geocode/reverse and off raw fetches.
Day 6: Make public catalog pages ISR (revalidate) with session bits as islands; add refetchIntervalInBackground:false; scope QueryProvider to authenticated layouts.
Day 7: Decide + stub the repository/service interface boundary for the Django migration (even if Prisma-backed today); add a basic performance budget check and smoke-test the full technician flow end-to-end on a preview deploy.