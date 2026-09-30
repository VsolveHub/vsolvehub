# Architecture

Read with `../AGENTS.md`. That file says **what** to use. This one says **how the pieces fit**.

## 1. Workspace

The mobile apps live inside the existing pnpm workspace, so they share
`@vsolve/api-client` (the generated, typed API client) with the web.

```
frontend/pnpm-workspace.yaml   + "mobile/apps/*", "mobile/packages/*"
frontend/eslint.config.mjs     + "mobile/**" in globalIgnores (mobile has its own ESLint config)
```

- Root `vitest` only matches `{apps,packages}/**`, so mobile Jest tests never run under the web
  test runner.
- Mobile packages have **no `build` script**, so `turbo build` skips them. EAS builds the apps.
- Dependencies of the mobile packages:

| Package | Depends on (workspace) |
|---|---|
| `partner-mobile`, `customer-mobile` | `@vsolve/mobile-core`, `@vsolve/mobile-ui`, `@vsolve/api-client`, `@vsolve/query` |
| `@vsolve/mobile-core` | `@vsolve/api-client`, `@vsolve/query` (imported only as `@vsolve/query/native`) |
| `@vsolve/mobile-ui` | nothing from web; ports `@vsolve/ui` |

`metro.config.js` in each app (the same file in both):

```js
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

// One copy of each of these, always the app's own. Workspace packages (@vsolve/*) import them
// too, and a second copy of React breaks every hook ("Invalid hook call").
const SINGLETONS = ["react", "react-native", "@tanstack/react-query", "expo-router"];
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (SINGLETONS.some((name) => moduleName === name || moduleName.startsWith(`${name}/`))) {
    return context.resolveRequest(
      { ...context, originModulePath: path.join(projectRoot, "package.json") },
      moduleName,
      platform,
    );
  }
  return context.resolveRequest(context, moduleName, platform);
};

// inlineRem 16 = the web's 1rem, so `p-4`, `text-sm` and `min-h-12` measure the same as on web.
module.exports = withNativeWind(config, { input: "./global.css", inlineRem: 16 });
```

## 2. Configuration and environments

| Profile (`eas.json`) | Who installs it | API | Update channel |
|---|---|---|---|
| `development` | You (dev client, loads JS from your computer) | from `apps/<app>/.env` | `development` |
| `preview` | Owner/testers (APK + ad-hoc iOS) | staging URL | `preview` |
| `production` | Stores | production URL | `production` |

- `EXPO_PUBLIC_API_BASE_URL` is the only required variable. In the browser preview,
  `@vsolve/mobile-core` uses `http://localhost:8000` when it is not set.
- `EXPO_PUBLIC_WEB_BASE_URL` is the matching website, used for terms, privacy, marketing and
  deep-link domains.
- `app.config.ts` sets: `version: "1.0.0"`, `runtimeVersion: { policy: "appVersion" }`,
  `orientation: "portrait"`, `userInterfaceStyle: "light"`, the bundle ids from the README, the
  URL scheme (`vsolvehub` / `vsolvepartner`), and the permission texts in §9.
- `ios/` and `android/` are generated at build time. Never commit them.

## 3. Sign-in (bearer session)

The web uses a session **cookie** plus CSRF. Mobile uses the **same Django session**, sent as a
header, so revocation, the session list, logout and role switch all work unchanged.

```
1. POST /api/v1/auth/otp/request/            (existing)  → challenge_id
2. POST /api/v1/auth/mobile/otp/verify/      (new)       → { user, active_role,
                                                             session_expires_at, session_token }
3. token → expo-secure-store ("vsolve.session")
4. every request: Authorization: Bearer <token>   (no cookie, no CSRF)
5. 401/403 not_authenticated|session_expired → token deleted, cache cleared, go to /login
6. logout: POST /api/v1/mobile/devices/unregister/ → POST /api/v1/auth/logout/ → delete token
```

`device_identifier` on verify is a random UUID created once per install and kept in SecureStore
(`vsolve.installation-id`). `device_label` is `"<model> · <OS> <version>"` from `expo-device`.

`@vsolve/mobile-core` holds this in a small zustand store:
`status: "loading" | "signedOut" | "signedIn"`, with `hydrate()`, `signIn(token)` and `signOut()`.
The root layout shows the splash screen until `hydrate()` finishes.

## 4. Server data

- `getApiClient()` = `createApiClient({ baseUrl, auth: { mode: "bearer", getToken }, onUnauthorized })`.
- One `QueryClient`, with the same defaults as `frontend/packages/query/src/client.ts`, plus:
  - `focusManager` ← `AppState` (active = focused), so polling stops in the background
  - `onlineManager` ← NetInfo
- Web **server components** that fetch (catalog pages, `requests/new`) become `useQuery` calls
  with the same endpoint and the same freshness (`STATIC_CONTENT` etc.).
- The web `queries.ts` for each feature is ported file for file, with the same keys, intervals and
  invalidation. Only the import of `getApiClient` changes.

## 5. Navigation (Expo Router)

URL paths are **identical to the web**. Group folders `( … )` do not change the URL.

**Partner**

```
app/_layout.tsx                 providers, fonts, version gate, push listeners
app/index.tsx                   → /home if signed in, else /login
app/login.tsx
app/(app)/_layout.tsx           guard = PartnerShell logic (role, application state, SwitchToPartner)
app/(app)/(tabs)/_layout.tsx    tabs: Home /home · Work /work/all · Money /money · Alerts (opens panel) · Me /me
app/(app)/(tabs)/home.tsx, work/all.tsx, money.tsx, me/index.tsx, me/{profile,crew,language,rate-card}.tsx
app/(app)/apply/…               onboarding chrome, no tabs
app/(app)/work/offers/…, work/enquiries/…, work/jobs/…, work/how-day-hire-works.tsx
                                focused chrome: back button + title (from FocusedHeader), no tabs
```

**Customer**

```
app/_layout.tsx
app/(tabs)/_layout.tsx          tabs: Home / · Services /catalog · Bookings /activity · Profile /account
app/(tabs)/index.tsx, catalog/…, activity.tsx, account/…
app/login.tsx                   supports ?next= (safeNextPath)
app/book/[service].tsx, cart.tsx, checkout.tsx, bookings/…, requests/…, engagements/…, jobs/…
```

Web redirect pages (`/bookings`, `/requests`, `/projects`, `/work`, `/catalog/all`, …) become
`<Redirect href=…/>` to the same target.

Which screens need sign-in: exactly the ones the web gates. Public in Customer: `/`, `/catalog/**`,
`/book/[service]`, `/cart`.

## 6. Push notifications

```
backend event ──► NotificationIntent (PUSH, or IN_APP mirrored) ──► apps.mobile ──► Expo Push ──► phone
```

- On sign-in (and on every app start while signed in), the app asks for permission once, gets the
  Expo push token, and calls `POST /api/v1/mobile/devices/` with
  `{ expo_push_token, app: "partner"|"customer", platform, app_version }`.
- Every push carries `data: { notification_id?, target: { kind, id } | null, purpose }`.
- A tap opens `targetHref(target)`. That is the same function the web notification feed uses,
  ported from `features/notifications/model/feed.ts`. For `null` or an unknown kind, it opens the
  notification panel. A tap from a closed app works the same way via
  `Notifications.getLastNotificationResponseAsync()`.
- Android channels: `offers` (max importance, alert sound, used for `partner.offer_created`) and
  `default`.
- In the foreground, a push shows as a banner. For offers, the Partner app's live offer sheet also
  refreshes (it invalidates the offers query).
- Browser preview: push is a no-op.

## 7. Deep links

- Custom scheme: `vsolvepartner://work/jobs/123`, `vsolvehub://requests/123`.
- Web links: Android App Links and iOS Universal Links on the website domains (Phases 15/24). A
  web URL whose path exists in the app opens the app at that path. Anything else opens in the
  browser.

## 8. Payments (Customer)

The server creates the payment attempt exactly as for the web (`provider`,
`provider_public_key`, `provider_order_id`, amount). The app then:

- **native**: opens a full-screen `Modal` with `react-native-webview`. The WebView loads an inline
  HTML page that includes `https://checkout.razorpay.com/v1/checkout.js` and calls
  `new Razorpay({ key, order_id, amount, currency, name: "V Solve Hub", handler, modal: { ondismiss } })`.
  `handler` → `postMessage("paid")`, `ondismiss` → `postMessage("dismissed")`.
  `onShouldStartLoadWithRequest`: URLs starting with `upi:`, `intent:`, `tez:`, `phonepe:`,
  `paytmmp:` or `credpay:` are opened with `Linking.openURL` (UPI apps) and return `false`.
- **web preview**: `provider-handoff.ts` ported unchanged (it loads the same script).
- In both cases the result is **not trusted**: after `paid` or `dismissed`, the screen polls the
  payment outcome exactly as `payment-workspace.tsx` does. Only the server says "paid".
- Fake provider (local): `simulated-capture.tsx` is ported too.

## 9. Device features

| Feature | Package | Permission text (iOS `infoPlist` / Android) |
|---|---|---|
| Location (presence, address pin) | `expo-location`, when-in-use only | "Vsolve Hub uses your location to find work near you and to confirm arrival." / "…to set the service address." |
| Camera + photos (KYC, work evidence, request photos) | `expo-image-picker` | "Take photos of documents and work." / "Choose photos of documents and work." |
| Files (PDF documents where web accepts PDF) | `expo-document-picker` | — |
| Notifications | `expo-notifications` | Android 13+: POST_NOTIFICATIONS |

Blocked on Android: `ACCESS_BACKGROUND_LOCATION`, `RECORD_AUDIO`.

**Uploads** follow the web flow in `features/application/upload-queries.ts`: request a signed URL,
compute the SHA-256 with `expo-crypto`, `PUT` the bytes with `XMLHttpRequest` (progress
events), then confirm. `@vsolve/mobile-core` exports `uploadToSignedUrl({ uri, contentType,
url, onProgress })` and `sha256OfFile(uri)`, so the ported screens change only those two calls.

**Presence (Partner):** heartbeats are sent while the app is in the foreground, as on web. The
server's `PARTNER_PRESENCE_TTL_SECONDS` (90 s) then takes the partner offline after the app has
been in the background that long. This is the same behaviour as closing the web tab. Background
presence is **not** in v1.

## 10. App version gate

On start and on every return to the foreground:
`GET /api/v1/mobile/app-config/?app=partner&platform=android&version=1.0.0`. If
`update_required` is true, a full-screen "Update Vsolve Hub" page with a store button blocks the
app. On a network error the app continues (it never blocks offline).

## 11. Over-the-air fixes

JavaScript-only fixes after release: `eas update --channel production --message "…"`. Anything
that changes native config or packages needs a new store build.
