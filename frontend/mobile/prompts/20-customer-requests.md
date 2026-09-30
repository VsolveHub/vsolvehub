# Phase 20 — Customer: requests and visits

## Prompt

```text
Phase 20 of the Vsolve Hub mobile build (Customer app). Read first: frontend/mobile/AGENTS.md,
guide/04-porting-rules.md, guide/07-screens-customer.md rows 16–20, then all of
frontend/apps/customer/features/requirement, features/project-request and features/access
(views, model, adapters, queries, tests) and the /requests/new page.tsx.

1. Port those features (model + tests verbatim).
2. Screens rows 16–20 1:1: new request list, the requirement flow with every question type,
   photo grid (image picker, same limits), address picker with location, duplicate warning,
   request detail (matching, teasers, visits, locked states), and visit detail (arrival code,
   who is coming).
3. Tests: ported model tests + one component test per screen.
4. Run and paste: pnpm --filter customer-mobile lint, typecheck, test.
```

## Done when

- [ ] create a custom request with 2 photos on the phone → it appears identically on the web
      request page
- [ ] a scheduled visit shows the same arrival code as the web

## Commit

```powershell
git add frontend/mobile/apps/customer
git commit -m "feat(customer-mobile): custom requests and site visits"
```
