# Phase 22 — Customer: jobs, stages, activity

## Prompt

```text
Phase 22 of the Vsolve Hub mobile build (Customer app). Read first: frontend/mobile/AGENTS.md,
guide/07-screens-customer.md rows 27–32, then all of frontend/apps/customer/features/engagement,
features/shift-day, features/activity and features/ratings (views, model, queries, tests).

1. Port those features (model + tests verbatim).
2. Screens rows 27–32 1:1: engagement screen, stage review (approve / raise issue), receipt,
   the /jobs re-exports, the /projects redirect, and the Activity tab with its status tabs
   (?status=), sections and empty states. Rating dialogs where the web shows them.
3. Tests: ported model tests + one component test per screen.
4. Run and paste: pnpm --filter customer-mobile lint, typecheck, test.
```

## Done when

- [ ] Activity shows the same items and tabs as the web for the same account
- [ ] approve a stage submitted by the partner in Phase 13 → the partner sees it approved

## Commit

```powershell
git add frontend/mobile/apps/customer
git commit -m "feat(customer-mobile): engagements, stage review and activity"
```
