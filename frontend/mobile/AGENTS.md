# Vsolve Hub mobile — agent rules

You are building the Vsolve Hub **Customer** and **Partner** native apps with Expo (React Native).
The person prompting you is new to mobile development, so you make no product or technical
decisions of your own. Every decision is written down in this file and in `frontend/mobile/guide/`.
If something is not covered, **stop and ask**. Never guess.

Read this file completely at the start of every phase. The repository root `AGENTS.md` also
applies. Where the two overlap on mobile work, this file is more specific.

---

## 0. The prime directive: the web app is the specification

Every mobile screen is a **port** of an existing web screen in `frontend/apps/customer` or
`frontend/apps/partner`. Before writing a screen:

1. Open the web `page.tsx` for the route, and every component, `model/`, `queries.ts` and
   `adapters/` file it uses, recursively, down to `@vsolve/ui` and `@vsolve/query`.
2. Port **the same** text (word for word), order of sections, colours, spacing, icons, states
   (loading, empty, error, disabled, pending, success), validation messages, steps, confirmation
   dialogs, API calls, query keys, polling intervals, cache freshness and error handling.
3. Change only what React Native forces you to change, as listed in `guide/04-porting-rules.md`.
4. Where the web shows a different layout at mobile width than at desktop width (`md:`, `lg:`,
   `useIsWideScreen`), port the **mobile-width** layout only.

Forbidden:

- inventing a screen, a field, a step, copy, a colour, an icon, an animation or a fallback value
- "improving" or simplifying a web flow
- skipping a state because it is rare
- a hard-coded price, status, provider, location or success message. The server decides all of
  these (root `AGENTS.md`, Quality rules).

If the web code looks wrong, port it as it is and add a line to `frontend/mobile/WEB-ISSUES.md`
(create it if it does not exist): route, file, what looks wrong. Do not fix web code.

---

## 1. Ownership: what you may edit

You may create and edit:

- `frontend/mobile/**`
- `backend/apps/mobile/**` and `backend/tests/mobile/**`

You may make **only** these listed changes in shared files:

| File | Allowed change |
|---|---|
| `backend/config/settings/base.py` | add `"apps.mobile"` to `INSTALLED_APPS`; replace the one `django.contrib.sessions.middleware.SessionMiddleware` line with `apps.mobile.middleware.BearerAwareSessionMiddleware`; add the `MOBILE_*`/`EXPO_*` settings block; add the mobile entries to `CELERY_BEAT_SCHEDULE`; bump `SPECTACULAR_SETTINGS["VERSION"]` one minor version |
| `backend/config/urls.py` | add one `path("api/v1/", include("apps.mobile.urls"))` line |
| `contracts/openapi/v1.yaml` | regenerate only, with the command in `guide/10-commands.md` |
| `contracts/openapi/CHANGELOG.md` | one entry for the mobile endpoints |
| `frontend/packages/api-client/src/generated/schema.d.ts` | regenerate only |
| `frontend/packages/api-client/src/client.ts` (+ its test) | add the opt-in bearer mode from `guide/05-backend.md` §6 |
| `frontend/packages/query/package.json` + new `frontend/packages/query/src/native.ts` | add the `./native` export from `guide/05-backend.md` §7 |
| `frontend/pnpm-workspace.yaml` | add `"mobile/apps/*"` and `"mobile/packages/*"` |
| `frontend/eslint.config.mjs` | add `"mobile/**"` to `globalIgnores` |
| `frontend/pnpm-lock.yaml` | only as updated by `pnpm install` / `pnpm add` |
| `frontend/apps/{customer,partner}/public/.well-known/*` | app-link files from Phase 15/24 |

Everything else is read-only for you, including all of `frontend/apps/**`, `frontend/packages/ui`,
`frontend/packages/query`, every other backend app, and the root `AGENTS.md`. Codex works on the
backend at the same time as you.

**Git:** stage explicit paths only. Never `git add -A`, never `git add .`. Never commit `.env`,
keystores (`*.jks`, `*.keystore`), `*.p8`, `*.p12`, `*.mobileprovision`,
`google-services.json`, `GoogleService-Info.plist`, `ios/` or `android/`. Never push to `main`.

---

## 2. The fixed stack (do not substitute anything)

| Concern | Use | Never use |
|---|---|---|
| Framework | Expo, the SDK that `create-expo-app@latest` installs in Phase 1, recorded in §9 | bare React Native CLI, Flutter, Capacitor, Ionic |
| Language | TypeScript, `strict: true` | JavaScript files for app code |
| Navigation | Expo Router (file-based, `app/` folder) | React Navigation set up by hand |
| Server data | TanStack Query v5 + `@vsolve/api-client` (openapi-fetch) | axios, SWR, raw `fetch` in screens, Redux |
| Local state | React state; `zustand` only for the auth store in `@vsolve/mobile-core` | Redux, MobX, Context for server data |
| Styling | NativeWind **v4** + `tailwindcss@^3.4` with the tokens in `guide/03-design-system.md` | StyleSheet colour literals, styled-components, Tamagui, NativeWind v5 preview |
| Icons | `lucide-react-native` (the web uses `lucide-react`: same names) | other icon sets |
| Custom SVG | `react-native-svg` | images of icons |
| Font | Plus Jakarta Sans via `@expo-google-fonts/plus-jakarta-sans` | system font |
| Images | `expo-image` | RN `Image` for remote images |
| Secure token | `expo-secure-store` | AsyncStorage for secrets |
| Other storage | `@react-native-async-storage/async-storage` (non-secret only) | — |
| Push | `expo-notifications` + Expo Push Service | direct FCM/APNs SDKs, OneSignal |
| Location | `expo-location` (foreground only) | background location |
| Camera / photos / files | `expo-image-picker`, `expo-document-picker` | — |
| Payments | `react-native-webview` hosting Razorpay Checkout (see `guide/02-architecture.md` §8) | `react-native-razorpay` or any Razorpay SDK |
| Network state | `@react-native-community/netinfo` | — |
| Bottom sheets / dialogs | RN `Modal` wrapped in `@vsolve/mobile-ui` `Sheet`/`Dialog` | third-party modal libraries |
| Lottie | `lottie-react-native` (web uses `lottie-react`) | — |
| Sounds | `expo-audio` (partner booking alert) | — |
| Crypto (SHA-256, random) | `expo-crypto` | — |
| Gradients / blur | `expo-linear-gradient`, `expo-blur` (only where web uses them) | — |
| Unit/component tests | `jest-expo` + `@testing-library/react-native` | vitest in mobile packages |
| Builds, store upload, OTA | EAS Build, EAS Submit, EAS Update | local Xcode/Android Studio release builds |
| Also allowed | `expo-dev-client`, `expo-updates`, `expo-constants`, `expo-linking`, `expo-splash-screen`, `expo-status-bar`, `expo-font`, `expo-device`, `expo-web-browser`, `expo-clipboard`, `react-native-safe-area-context`, `react-native-screens`, `react-native-reanimated`, `react-native-gesture-handler`, `clsx`, `tailwind-merge`, `zod` (same major as web), `zustand` | — |

Install every Expo/React Native package with `npx expo install <name>` from inside the app folder,
so the version matches the SDK. Plain JavaScript libraries use `pnpm add`. Never add a package
that is not in this table or in the phase prompt. If you believe one is needed, stop and ask.

---

## 3. Folder layout (create exactly this)

```
frontend/mobile/
  apps/
    partner/                       package name: partner-mobile
      app/                         Expo Router routes; paths mirror web URLs exactly
      src/features/<feature>/      ported from frontend/apps/partner/features/<feature>/
        model/  view/  queries.ts  (same file names as web)
      src/lib/routes.ts            ported from web lib/routes.ts or route helpers
      assets/                      icon.png, adaptive-icon.png, splash.png, sounds/
      app.config.ts  eas.json  metro.config.js  babel.config.js  tailwind.config.js
      global.css  jest.config.js  tsconfig.json  package.json  .env.example
    customer/                      package name: customer-mobile (same structure)
  packages/
    core/                          @vsolve/mobile-core: API client, auth, query client,
                                   push, deep links, uploads, payments, version gate, polyfills
    ui/                            @vsolve/mobile-ui: tokens + every @vsolve/ui component in RN
```

- **Route paths mirror web paths.** Web `/work/offers/[invitationId]` becomes
  `app/(app)/work/offers/[invitationId].tsx`. The route helpers ported from web then work
  unchanged, and so do deep links and notification targets.
- **Feature folders mirror web feature folders**, with the same file names. `model/` files (pure
  TypeScript) are copied almost verbatim, with their tests.
- Each ported file starts with one comment line: `// Ported from frontend/apps/partner/features/offers/queries.ts`.

---

## 4. Data and API rules

- Every request goes through `getApiClient()` from `@vsolve/mobile-core`. That is
  `createApiClient` from `@vsolve/api-client` in **bearer** mode. Never call `fetch` for the
  Vsolve API directly.
- Request and response types come only from `@vsolve/api-client` (`Schemas`, `paths`). Never
  hand-write an API type. If an endpoint or field you need does not exist in
  `contracts/openapi/v1.yaml`, stop and tell the person. Do not invent it.
- Use `unwrap()` on every result. Errors are shown with `describeError()` /
  `categorizeError()` from `@vsolve/query/native`, exactly as the web does.
- Query keys, `staleTime`, `refetchInterval` and invalidation are copied from the web
  `queries.ts` for the same feature.
- Money is integer paise from the server, formatted with `formatMoney` (ported in
  `@vsolve/mobile-ui`). Never compute a price on the phone.
- Time-limited items (offers, holds, countdowns) use the server clock: `useServerCountdown` from
  `@vsolve/query/native`.
- Idempotency keys for retryable commands: `createIdempotencyKey` / `getStableIdempotencyKey`
  from `@vsolve/api-client`, as on web.
- Polling pauses when the app is in the background. `@vsolve/mobile-core` wires TanStack Query's
  `focusManager` to `AppState` and `onlineManager` to NetInfo. Do not re-implement this per screen.

---

## 5. Security rules

- The session token lives only in `expo-secure-store` (native) or `sessionStorage` (browser preview only). Never
  log it, never put it in a URL, never store it in AsyncStorage.
- Never log OTPs, tokens, payment payloads, addresses or KYC data (root `AGENTS.md`).
- `EXPO_PUBLIC_*` variables are public. Only URLs go there, never secrets.
- The Razorpay key secret never exists in the app. The app only receives the public key id and
  order id from the server, as the web does.
- The customer's exact address is shown only where the web shows it.

---

## 6. UI rules

- Use `@vsolve/mobile-ui` components. They mirror `@vsolve/ui` one to one (`Button`, `Card`,
  `Badge`, `ErrorState`, `EmptyState`, `Skeleton`, `Dialog`, `Sheet`, `Field`, `Input`, …) with
  the same props and variants.
- Colours only through NativeWind token classes (`bg-action`, `text-text-muted`,
  `border-line`), copied from the web class names. Never invent a colour. Where the web itself
  uses an arbitrary value (`bg-[#FAF9F7]`), copy it exactly.
- All text is inside `<Text>` from `@vsolve/mobile-ui`, which applies the font family and weight.
- Touch targets are at least 44×44 (`min-h-11 min-w-11`).
- Screens handle safe areas (`SafeAreaView` / `useSafeAreaInsets`), the keyboard
  (`KeyboardAvoidingView` on forms), pull-to-refresh on lists (`RefreshControl` calling
  `refetch`), and the Android back button (Expo Router handles it; confirm-before-leave where
  the web has it).
- Lists longer than about 20 items use `FlatList`, not `ScrollView` + `map`.
- Accessibility: every pressable has `accessibilityRole` and `accessibilityLabel` where the web
  has an `aria-label`. Status is never colour alone, as on web.
- Light theme only (web is light only). Set `userInterfaceStyle: "light"`.

---

## 7. Testing and checks

For every phase:

- Port the web tests for every `model/` file you port (vitest → jest: `vi.fn` → `jest.fn`,
  `vi.useFakeTimers` → `jest.useFakeTimers`, remove `import … from "vitest"`).
- Write at least one component test per screen with `@testing-library/react-native`: it renders
  the loading, error and main states from mocked query data.
- Backend: every new endpoint and service gets pytest tests in `backend/tests/mobile/`, including
  the unauthorized, invalid-input and idempotent-retry cases (root `AGENTS.md`).
- You are **authorized to run** these and must paste the real output (see `guide/10-commands.md`):
  - `pnpm --filter partner-mobile lint` / `typecheck` / `test` (and the same for `customer-mobile`,
    `@vsolve/mobile-core`, `@vsolve/mobile-ui`)
  - `pnpm --filter @vsolve/api-client test` is **not** available; run
    `pnpm exec vitest run packages/api-client` from `frontend/` for the api-client bearer-mode test
  - backend: `.\.venv\Scripts\python.exe -m pytest tests/mobile -q` and
    `.\scripts\quality-static.cmd` from `backend/`
- Never write "tests pass" unless you ran them in this session and they passed.
- Never skip, delete or weaken a test to make it pass.

---

## 8. Working style

- Work in small steps and re-run typecheck after each screen.
- When a phase lists web source files, read them fully before writing code. Do not work from
  memory of "how apps usually look".
- At the end of every phase, print a checklist of the phase's TODO items with the file paths that
  satisfy each, and the exact commands you ran with their results.
- If a web screen depends on something not yet ported (a component, a hook, a route), port that
  dependency first, in the right package, and mention it.
- Do not start the next phase until the person asks.

---

## 9. Pinned versions (filled in during Phase 1; never change after that without the owner)

| Item | Version |
|---|---|
| Expo SDK | 57.0.26 |
| React Native | 0.86.3 |
| React (mobile apps) | 19.2.3 |
| expo-router | 57.0.24 |
| nativewind | 4.2.7 |
| tailwindcss (mobile) | 3.4.19 |
| @tanstack/react-query | 5.101.4 |
| Node.js | 22.19.0 |
| pnpm | 11.2.2 (from `frontend/package.json`) |
