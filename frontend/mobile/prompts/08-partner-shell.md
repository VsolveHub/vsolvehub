# Phase 8 — Partner: app shell, login, tabs

**Check in:** browser + Android emulator (+ phone if the dev build is installed).

## Prompt

```text
Phase 8 of the Vsolve Hub mobile build (Partner app). Read first: frontend/mobile/AGENTS.md,
guide/02-architecture.md §3 and §5, guide/04-porting-rules.md, guide/06-screens-partner.md
("Shell" table and rows with Phase 8).

Port into frontend/mobile/apps/partner, reading every web source file listed first:
1. app/login.tsx — web features/session/view/login-screen.tsx, 1:1, using
   useMobileOtpFlow from @vsolve/mobile-core. After sign-in, go where the web goes
   (homeForApplication / next path).
2. app/index.tsx — redirect per the screens table.
3. app/(app)/_layout.tsx — the PartnerShell guard logic, in the same order: session loading →
   not signed in (→ /login) → no partner role (SwitchToPartner card) → no partner account
   (NoPartnerAccess card) → application state (homeForApplication). Mount the global pieces from
   the Shell table: LiveOfferSheet placeholder (real in Phase 11), presence provider (real in
   Phase 10), booking alert (real in Phase 15), and a Stack whose focused header ports
   FocusedHeader (same titles, back button, title override).
4. app/(app)/(tabs)/_layout.tsx — tabs from TAP_FIRST_NAV: same order, labels, lucide icons,
   active colours as the web bottom nav. "Alerts" is a button, not a route: it opens the
   notification panel sheet (placeholder list until Phase 14) and shows the unread badge
   (unreadBadgeDisplay from the ported features/notifications/model/feed.ts, count from
   GET /api/v1/notifications/unread-count/ with the web's polling interval).
5. Placeholder screens for every tab route and every focused route in guide 06, each showing
   only its route path, so navigation can be tested now. Later phases replace them.
6. app/(app)/apply/_layout.tsx — the onboarding chrome from the web shell (mode "onboarding").
7. Port features/session/model/*, use-partner-role.ts, features/workspace/registry.ts and
   queries.ts, features/application/queries.ts, with their tests.
8. Component tests: login renders phone step / code step / error; guard renders each branch.
9. Run and paste: pnpm --filter partner-mobile lint, typecheck, test.
```

## TODO

- [ ] login 1:1 with web (copy, steps, errors, resend timer)
- [ ] guard branches identical to `partner-shell.tsx`
- [ ] 5 tabs identical to `TAP_FIRST_NAV`, Alerts opens a sheet with a badge
- [ ] focused header titles identical
- [ ] placeholders for every route in guide 06

## Done when

- [ ] browser: sign in with the owner's Partner test number and the dev OTP code → lands where the
      web lands; tabs switch; a focused placeholder shows the back button + correct title
- [ ] sign in with a Customer-only number → the same card the web shows
- [ ] kill and reopen the app (emulator): still signed in. Log out → back to login

## Commit

```powershell
git add frontend/mobile/apps/partner
git commit -m "feat(partner-mobile): shell, OTP login, guard and tab navigation"
```
