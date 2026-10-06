# Phase 12 — Partner: enquiries, visits, estimates

## Prompt

```text
Phase 12 of the Vsolve Hub mobile build (Partner app). Read first: frontend/mobile/AGENTS.md,
guide/04-porting-rules.md, guide/06-screens-partner.md rows 22–25, then every file in
frontend/apps/partner/features/enquiry, features/visit and features/proposal (views, model,
queries, adapters, tests).

1. Port those three features (model + tests verbatim).
2. Screens rows 22–25 1:1: enquiry detail, arrival code, visit, on-site estimate composer with
   every step, line item, discount, preview and submit state from the web.
3. Wherever the web uses location or photos in these flows, use @vsolve/mobile-core
   getCurrentPosition / the image picker as in Phase 9.
4. Tests: estimate composer model tests (ported) + one component test per screen.
5. Run and paste: pnpm --filter partner-mobile lint, typecheck, test.
```

## TODO

- [x] four enquiry routes ported with every state
- [x] estimate submission produces the same result as web

## Done when

- [x] create a custom request on the Customer web, invite the partner, then on the phone open
      the enquiry → visit → arrival → estimate → submit. The customer web shows the estimate
      exactly as when submitted from the Partner web

## Commit

```powershell
git add frontend/mobile/apps/partner
git commit -m "feat(partner-mobile): enquiries, site visits and estimates"
```

## Status

- **Status:** Complete (100% implemented)
- **Implementation:** Enquiry review, visit arrival OTP verification, on-site estimate builder, line item additions, discount applications, and proposal submission.
