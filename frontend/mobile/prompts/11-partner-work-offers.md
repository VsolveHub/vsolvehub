# Phase 11 — Partner: Work and offers

## Prompt

```text
Phase 11 of the Vsolve Hub mobile build (Partner app). Read first: frontend/mobile/AGENTS.md,
guide/06-screens-partner.md rows 17–21 and "Live offers on mobile", then every file in
frontend/apps/partner/features/offers, features/crew-offer, features/work-stack (all-work) and
the /work/how-day-hire-works page.

1. Port features/offers and features/crew-offer (model + tests verbatim, queries with the same
   keys and the polling fallback interval; skip live-events.ts SSE, per the guide).
2. Screens rows 17–21 1:1, including countdowns (useServerCountdown), accept/decline, the decline
   dialog, outcome states, crew mix table, and every error/expired state.
3. LiveOfferSheet: replace the Phase 8 placeholder with the real port of live-offer-sheet.tsx,
   mounted in app/(app)/_layout.tsx, driven by the offers query.
4. Tests: offer countdown/expiry, accept pending/success/error, decline dialog.
5. Run and paste: pnpm --filter partner-mobile lint, typecheck, test.
```

## TODO

- [ ] all-work, offers list, offer detail, how-day-hire-works ported
- [ ] live offer sheet appears for a new offer
- [ ] countdowns use the server clock

## Done when

- [ ] with the partner online, create a booking on the Customer web for their area/service →
      the offer sheet appears on the phone within the polling interval, accept works, and the job
      appears in Work
- [ ] let one offer expire → the same expired state as web

## Commit

```powershell
git add frontend/mobile/apps/partner
git commit -m "feat(partner-mobile): work list, offers and live offer sheet"
```
