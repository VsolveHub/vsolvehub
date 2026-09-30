# Phase 10 — Partner: Home and presence

**Check in:** Android emulator or phone (location).

## Prompt

```text
Phase 10 of the Vsolve Hub mobile build (Partner app). Read first: frontend/mobile/AGENTS.md,
guide/02-architecture.md §9 ("Presence"), guide/06-screens-partner.md row 16, then every file in
frontend/apps/partner/features/work-stack (work-home and what it imports), features/presence
(model, view, queries, tests) and features/work.

1. Port features/presence fully (model + tests verbatim). The presence panel uses
   getCurrentPosition from @vsolve/mobile-core. The provider and panel send beats only while
   AppState is "active". On return to "active", beat immediately (same as the web's
   visibilitychange handling).
2. Location permission: ask with the web's wording before the first request. If denied, show the
   same state the web shows when the browser denies location, plus a button to
   Linking.openSettings().
3. Port app/(app)/(tabs)/home.tsx = work-home.tsx 1:1 (sections, order, empty states,
   pull-to-refresh).
4. Tests: presence model tests (ported), AppState pause/resume, home states.
5. Run and paste: pnpm --filter partner-mobile lint, typecheck, test.
```

## TODO

- [ ] presence ported; beats pause in background and resume immediately
- [ ] permission flow + settings button
- [ ] Home identical to web

## Done when

- [ ] emulator (set a location in the emulator's extended controls): go online → the Partner web
      `/home` for the same account also shows online; background the app for 2 minutes → the web
      shows offline (expected v1 behaviour); reopen the app → online again
- [ ] Home matches the web `/home` at phone width

## Commit

```powershell
git add frontend/mobile/apps/partner
git commit -m "feat(partner-mobile): home and presence"
```
