# Phase 21 — Customer: quotes and crew booking

## Prompt

```text
Phase 21 of the Vsolve Hub mobile build (Customer app). Read first: frontend/mobile/AGENTS.md,
guide/07-screens-customer.md rows 21–26, then all of frontend/apps/customer/features/quotes and
features/crew (views, model, adapters, queries, tests).

1. Port those features (model + tests verbatim).
2. Screens rows 21–26 1:1: quotes list, estimate detail (shopping list card, discounts, price
   ask), question thread, confirm choice, book crew and the crew fee screen (pays through the
   Phase 19 payment flow where the web does).
3. Tests: ported model tests + one component test per screen.
4. Run and paste: pnpm --filter customer-mobile lint, typecheck, test.
```

## Done when

- [x] with a partner estimate from Phase 12: compare, ask a question (the partner sees it),
      choose and confirm → the same engagement is created as from the web
- [x] book a crew → fee paid → shows under Activity

## Commit

```powershell
git add frontend/mobile/apps/customer
git commit -m "feat(customer-mobile): quotes, estimate decisions and crew booking"
```

## Status

- **Status:** Complete (100% implemented)
- **Implementation:** Quotes comparison, estimate detail review, partner questioning thread, quote selection confirmation, and crew hiring fee payment.
