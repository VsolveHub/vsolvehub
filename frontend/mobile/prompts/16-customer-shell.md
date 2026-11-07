# Phase 16 — Customer: app shell, login, tabs

## Prompt

```text
Phase 16 of the Vsolve Hub mobile build (Customer app). Read first: frontend/mobile/AGENTS.md,
guide/02-architecture.md §3 and §5, guide/04-porting-rules.md, guide/07-screens-customer.md
(intro, "Shell" table, rows 6 and 40), then frontend/apps/customer/app/layout.tsx,
features/session/view/* (all), lib/focus-mode.ts and lib/routes.ts.

Port into frontend/mobile/apps/customer:
1. app/login.tsx — login-screen.tsx + customer-login-experience.tsx 1:1 with useMobileOtpFlow;
   supports ?next= via safeNextPath. Also port customer-login-modal.tsx as a Sheet for the inline
   login interrupt used later by the booking workspace.
2. app/(tabs)/_layout.tsx — tabs from mobile-bottom-nav.tsx: same four tabs, the same inline SVG
   icons (react-native-svg), labels, active rule (/activity also active for /bookings…),
   colours, bg-[#FAF9F7] and top border.
3. Header — site-header.tsx at phone width (logo, search entry, cart icon with count, profile
   mark / sign-in). Hidden where appChromeLayout / focus-mode hides it; FixedBackButton where the
   web shows it (port app-chrome-layout.ts with its tests).
4. Gate — the CustomerShell behaviour for the signed-in-only trees (guide 07 intro): not signed in
   → /login?next=<current path>.
5. Placeholder screens for every route in guide 07 (showing the route path), and the redirect
   routes as real <Redirect>s.
6. Tests: login states, tab active rule, gate redirect, app-chrome-layout (ported).
7. Run and paste: pnpm --filter customer-mobile lint, typecheck, test.
```

## TODO

- [x] login page + login sheet 1:1
- [x] 4 tabs identical to the web bottom nav
- [x] header and back-button rules ported
- [x] gate for signed-in trees; public routes stay public
- [x] placeholders + redirects for every route

## Done when

- [x] browser: tabs switch; `/account` while signed out → login → back to `/account` after sign-in
- [x] signed-out user can open Home and Services

## Commit

```powershell
git add frontend/mobile/apps/customer
git commit -m "feat(customer-mobile): shell, OTP login, tabs and route gate"
```

## Status

- **Status:** Complete (100% implemented)
- **Implementation:** Customer shell, mobile OTP authentication flow, bottom tab bar (Home, Services, Bookings, Profile), site header and focus-mode rules, authentication routing gate, and modal login sheet.
