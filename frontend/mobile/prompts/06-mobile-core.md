# Phase 6 — Mobile core (`@vsolve/mobile-core`)

## Prompt

```text
Phase 6 of the Vsolve Hub mobile build. Read first: frontend/mobile/AGENTS.md,
frontend/mobile/guide/02-architecture.md (all), guide/04-porting-rules.md, and these web files:
frontend/packages/query/src/client.ts, provider.tsx, session.ts, otp-flow.ts, retry.ts;
frontend/apps/customer/lib/api/browser.ts; frontend/apps/partner/features/application/upload-queries.ts
and model/upload.ts; frontend/apps/customer/features/payment/model/provider-handoff.ts;
frontend/apps/customer/features/requirement/view/requirement-address-picker.tsx (geolocation use).

Build frontend/mobile/packages/core/src with these modules, all exported from src/index.ts:
1. polyfills.ts — global crypto.getRandomValues from expo-crypto (idempotency keys need it).
   Add "./polyfills": "./src/polyfills.ts" to the package exports (next to ".").
   Apps import "@vsolve/mobile-core/polyfills" FIRST in app/_layout.tsx.
2. config.ts — configureCore({ appKind: "partner" | "customer" }); API_BASE_URL and WEB_BASE_URL
   from EXPO_PUBLIC_* (web preview default http://localhost:8000).
3. auth/token-store.ts (+ .web.ts using sessionStorage), auth/installation-id.ts,
   auth/auth-store.ts (zustand: status, hydrate, signIn, signOut) — guide 02 §3.
4. api/client.ts — getApiClient(): createApiClient in bearer mode; onUnauthorized → signOut() and
   queryClient.clear().
5. auth/use-mobile-otp-flow.ts — the web useOtpFlow (otp-flow.ts) behaviour, same phases, errors
   and describeOtpFailure, but verify calls POST /api/v1/auth/mobile/otp/verify/ with
   device_identifier + device_label, then signIn(session_token) and invalidates the session query.
   auth/use-mobile-logout.ts — guide 02 §3 step 6, then router.replace("/login").
6. query/query-client.ts + query/provider.tsx — one QueryClient with the same defaults as the web
   client.ts; focusManager ← AppState; onlineManager ← NetInfo. MobileQueryProvider.
7. push/ — registerForPush({ appKind }) (permission once, Android channels "offers" (MAX, alert
   sound) and "default", Expo token with projectId from Constants, POST /mobile/devices/),
   unregisterPush(), usePushRouting(resolveHref) (foreground banner handler, tap + cold-start
   routing, calls resolveHref(data.target) or opens the app's fallback). No-op on web.
8. upload/ — sha256OfFile(uri) (expo-crypto) and uploadToSignedUrl({ uri, contentType, url,
   onProgress }) (XMLHttpRequest PUT with progress), matching the web upload-queries behaviour.
9. payments/ — RazorpayCheckout component: .native.tsx per guide 02 §8 (WebView, UPI intents via
   Linking, postMessage "paid"/"dismissed"), .web.tsx re-using the web script loader logic.
   Same props: { publicKey, providerOrderId, amountPaise, currency, onEnded(result) }.
10. location/ — getCurrentPosition(options) returning the same shape as
    navigator.geolocation.getCurrentPosition (coords.latitude/longitude/accuracy, timestamp),
    with the same error codes (PERMISSION_DENIED, POSITION_UNAVAILABLE, TIMEOUT).
11. version/ — VersionGate component (guide 02 §10) + UpdateRequiredScreen (logo, "Update V Solve
    Hub", body "This version is no longer supported. Update to continue.", button "Update" →
    store_url).
12. storage/kv.ts — AsyncStorage get/set/remove for non-secret prefs.
13. Tests (jest) for: token store, auth store transitions, OTP flow (mock client), bearer client
    header, push routing (target → href / fallback), version comparison, upload progress,
    location error mapping.
14. Run and paste: pnpm --filter @vsolve/mobile-core lint, typecheck, test.
Then wire the partner and customer app/_layout.tsx: polyfills import, configureCore, fonts,
MobileQueryProvider, auth hydrate (splash until done), VersionGate. Confirm both apps still start
in the browser.
```

## TODO

- [ ] modules 1–12 exist and are exported
- [ ] tests for each module pass
- [ ] both apps' root layouts use the core providers
- [ ] browser preview still starts

## Done when

- [ ] check output green
- [ ] browser: app starts, no red error screen
- [ ] stop the backend and restart the app: no update screen appears (a network error never
      blocks the app)

## Commit

```powershell
git add frontend/mobile/packages/core frontend/mobile/apps/partner/app frontend/mobile/apps/customer/app frontend/pnpm-lock.yaml
git commit -m "feat(mobile): core package for API, sign-in, data, push, uploads and payments"
```
